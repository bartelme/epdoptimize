function clamp(value: f64, min: f64, max: f64): f64 {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function clampByte(value: f64): u8 {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return <u8>Math.round(value);
}

function luma709(r: f64, g: f64, b: f64): f64 {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

let srgbTablePtr: i32 = 0;

export function setSrgbTable(ptr: i32): void {
  srgbTablePtr = ptr;
}

function srgbToLinear(value: u8): f64 {
  if (srgbTablePtr != 0) {
    return load<f64>(srgbTablePtr + (<i32>value << 3));
  }

  const normalized = <f64>value / 255.0;
  return normalized > 0.04045
    ? Math.pow((normalized + 0.055) / 1.055, 2.4)
    : normalized / 12.92;
}

function labForwardPivot(value: f64): f64 {
  return value > 0.008856
    ? Math.pow(value, 1.0 / 3.0)
    : 7.787 * value + 16.0 / 116.0;
}

function rgbToLabLightness(r: u8, g: u8, b: u8): f64 {
  const y =
    srgbToLinear(r) * 0.2126729 +
    srgbToLinear(g) * 0.7151522 +
    srgbToLinear(b) * 0.072175;

  return 116.0 * labForwardPivot(y) - 16.0;
}

function rgbToLab(r: u8, g: u8, b: u8, outPtr: i32): void {
  const rn = srgbToLinear(r);
  const gn = srgbToLinear(g);
  const bn = srgbToLinear(b);

  const x =
    (rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375) * 100.0;
  const y =
    (rn * 0.2126729 + gn * 0.7151522 + bn * 0.072175) * 100.0;
  const z =
    (rn * 0.0193339 + gn * 0.119192 + bn * 0.9503041) * 100.0;

  const xn = labForwardPivot(x / 95.047);
  const yn = labForwardPivot(y / 100.0);
  const zn = labForwardPivot(z / 108.883);

  store<f64>(outPtr, 116.0 * yn - 16.0);
  store<f64>(outPtr + 8, 500.0 * (xn - yn));
  store<f64>(outPtr + 16, 200.0 * (yn - zn));
}

function labToRgb(l: f64, a: f64, b: f64, outPtr: i32): void {
  let y = (l + 16.0) / 116.0;
  let x = a / 500.0 + y;
  let z = y - b / 200.0;

  x = x > 0.206897 ? x * x * x : (x - 16.0 / 116.0) / 7.787;
  y = y > 0.206897 ? y * y * y : (y - 16.0 / 116.0) / 7.787;
  z = z > 0.206897 ? z * z * z : (z - 16.0 / 116.0) / 7.787;

  const xn = (x * 95.047) / 100.0;
  const yn = (y * 100.0) / 100.0;
  const zn = (z * 108.883) / 100.0;

  let r = xn * 3.2404542 + yn * -1.5371385 + zn * -0.4985314;
  let g = xn * -0.969266 + yn * 1.8760108 + zn * 0.041556;
  let blue = xn * 0.0556434 + yn * -0.2040259 + zn * 1.0572252;

  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1.0 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1.0 / 2.4) - 0.055 : 12.92 * g;
  blue =
    blue > 0.0031308
      ? 1.055 * Math.pow(blue, 1.0 / 2.4) - 0.055
      : 12.92 * blue;

  store<u8>(outPtr, clampByte(r * 255.0));
  store<u8>(outPtr + 1, clampByte(g * 255.0));
  store<u8>(outPtr + 2, clampByte(blue * 255.0));
}

function getSaturation(r: f64, g: f64, b: f64): f64 {
  const max = Math.max(r, Math.max(g, b)) / 255.0;
  const min = Math.min(r, Math.min(g, b)) / 255.0;
  return max == 0.0 ? 0.0 : (max - min) / max;
}

function normalize(value: f64, min: f64, max: f64): f64 {
  return clamp((value - min) / (max - min), 0.0, 1.0);
}

function smoothstep(edge0: f64, edge1: f64, value: f64): f64 {
  if (edge1 <= edge0) return value >= edge1 ? 1.0 : 0.0;
  const x = normalize(value, edge0, edge1);
  return x * x * (3.0 - 2.0 * x);
}

function getDynamicRangeChromaProtection(r: u8, g: u8, b: u8): f64 {
  return smoothstep(
    0.18,
    0.68,
    getSaturation(<f64>r, <f64>g, <f64>b)
  ) * 0.85;
}

function isProtectedChromaFit(
  sourceLuma: f64,
  resultR: u8,
  resultG: u8,
  resultB: u8,
  sourceSaturation: f64
): bool {
  if (sourceSaturation < 0.16) return true;

  const resultSaturation = getSaturation(
    <f64>resultR,
    <f64>resultG,
    <f64>resultB
  );
  const minimumSaturation = Math.max(0.12, sourceSaturation * 0.72);
  if (resultSaturation >= minimumSaturation) return true;

  return (
    luma709(<f64>resultR, <f64>resultG, <f64>resultB) <= sourceLuma + 4.0
  );
}

function percentileFromHistogram(
  histogramPtr: i32,
  bins: i32,
  count: i32,
  p: f64,
  scale: f64
): f64 {
  if (count <= 0) return 0.0;

  const target = <i32>clamp(
    Math.round(<f64>(count - 1) * p),
    0.0,
    <f64>(count - 1)
  );
  let seen: i32 = 0;

  for (let index: i32 = 0; index < bins; index += 1) {
    seen += <i32>load<u32>(histogramPtr + (index << 2));
    if (seen > target) return <f64>index / scale;
  }

  return 100.0;
}

export function applyDynamicRangeCompressionRgb(
  dataPtr: i32,
  width: i32,
  height: i32,
  blackL: f64,
  whiteL: f64,
  strength: f64,
  autoMode: i32,
  lowPercentile: f64,
  highPercentile: f64,
  histogramPtr: i32,
  histogramBins: i32,
  histogramScale: f64,
  scratchPtr: i32
): void {
  const targetRange = whiteL - blackL;
  if (targetRange <= 0.0 || strength <= 0.0) return;

  const pixelCount = width * height;
  let sourceBlackL = 0.0;
  let sourceWhiteL = 100.0;

  if (autoMode != 0) {
    for (let bin: i32 = 0; bin < histogramBins; bin += 1) {
      store<u32>(histogramPtr + (bin << 2), 0);
    }

    for (let pixel: i32 = 0; pixel < pixelCount; pixel += 1) {
      const ptr = dataPtr + (pixel << 2);
      const lightness = rgbToLabLightness(
        load<u8>(ptr),
        load<u8>(ptr + 1),
        load<u8>(ptr + 2)
      );
      const bin = <i32>clamp(
        Math.round(lightness * histogramScale),
        0.0,
        <f64>(histogramBins - 1)
      );
      const binPtr = histogramPtr + (bin << 2);
      store<u32>(binPtr, load<u32>(binPtr) + 1);
    }

    sourceBlackL = percentileFromHistogram(
      histogramPtr,
      histogramBins,
      pixelCount,
      lowPercentile,
      histogramScale
    );
    sourceWhiteL = percentileFromHistogram(
      histogramPtr,
      histogramBins,
      pixelCount,
      highPercentile,
      histogramScale
    );
  }

  const sourceRange = sourceWhiteL - sourceBlackL;
  if (sourceRange <= 0.0001) return;

  const labPtr = scratchPtr;
  const rgbPtr = scratchPtr + 24;

  for (let pixel: i32 = 0; pixel < pixelCount; pixel += 1) {
    const ptr = dataPtr + (pixel << 2);
    const r = load<u8>(ptr);
    const g = load<u8>(ptr + 1);
    const b = load<u8>(ptr + 2);

    rgbToLab(r, g, b, labPtr);
    const sourceL = load<f64>(labPtr);
    const a = load<f64>(labPtr + 8);
    const labB = load<f64>(labPtr + 16);
    const normalizedL = clamp(
      (sourceL - sourceBlackL) / sourceRange,
      0.0,
      1.0
    );
    const compressedL = blackL + normalizedL * targetRange;
    const effectiveStrength =
      strength * (1.0 - getDynamicRangeChromaProtection(r, g, b));
    const sourceSaturation = getSaturation(<f64>r, <f64>g, <f64>b);
    const sourceLuma = luma709(<f64>r, <f64>g, <f64>b);
    const targetL = sourceL + (compressedL - sourceL) * effectiveStrength;

    labToRgb(targetL, a, labB, rgbPtr);
    let newR = load<u8>(rgbPtr);
    let newG = load<u8>(rgbPtr + 1);
    let newB = load<u8>(rgbPtr + 2);

    if (
      compressedL > sourceL &&
      !isProtectedChromaFit(sourceLuma, newR, newG, newB, sourceSaturation)
    ) {
      let low = 0.0;
      let high = effectiveStrength;
      newR = r;
      newG = g;
      newB = b;

      for (let step: i32 = 0; step < 5; step += 1) {
        const mid = (low + high) / 2.0;
        labToRgb(sourceL + (compressedL - sourceL) * mid, a, labB, rgbPtr);
        const candidateR = load<u8>(rgbPtr);
        const candidateG = load<u8>(rgbPtr + 1);
        const candidateB = load<u8>(rgbPtr + 2);

        if (
          isProtectedChromaFit(
            sourceLuma,
            candidateR,
            candidateG,
            candidateB,
            sourceSaturation
          )
        ) {
          low = mid;
          newR = candidateR;
          newG = candidateG;
          newB = candidateB;
        } else {
          high = mid;
        }
      }
    }

    store<u8>(ptr, newR);
    store<u8>(ptr + 1, newG);
    store<u8>(ptr + 2, newB);
  }
}
