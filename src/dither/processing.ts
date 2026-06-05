export type RGB = [number, number, number];
export type RGBA = [number, number, number, number];

export type ToneMappingMode = "off" | "contrast" | "scurve";
export type ColorMatchingMode = "rgb" | "lab" | "chroma";
export type DynamicRangeCompressionMode = "off" | "display" | "auto";
export type LevelCompressionMode = "off" | "perChannel" | "luma";
export type PaperNormalizationMode = "off" | "warmPaper";

export type LevelRGB = number | RGB;

export interface PercentileClip {
  low: number;
  high: number;
}

export interface LevelCompressionOptions {
  mode?: LevelCompressionMode;
  black?: LevelRGB;
  white?: LevelRGB;
  auto?: boolean;
  autoThreshold?: number;
  percentileClip?: PercentileClip;
}

export interface ClarityOptions {
  amount?: number;
  radius?: number;
  midtone?: number;
}

export interface ToneMappingOptions {
  mode?: ToneMappingMode;
  /**
   * Exposure adjustment in stops. `0` is neutral, `1` doubles brightness.
   */
  exposure?: number;
  /**
   * Saturation adjustment. `0` is neutral, `0.5` means 1.5x, `-1` removes saturation.
   */
  saturation?: number;
  /**
   * Contrast adjustment. `0` is neutral, `0.25` means 1.25x, `-0.1` means 0.9x.
   */
  contrast?: number;
  strength?: number;
  shadowBoost?: number;
  highlightCompress?: number;
  midpoint?: number;
}

export interface DynamicRangeCompressionOptions {
  mode?: DynamicRangeCompressionMode;
  black?: LevelRGB;
  white?: LevelRGB;
  strength?: number;
  lowPercentile?: number;
  highPercentile?: number;
  preserveWhite?: boolean;
  whitePreservePercentile?: number;
  whitePreserveMinLuma?: number;
  whitePreserveMaxSaturation?: number;
}

export interface PaperNormalizationOptions {
  mode?: PaperNormalizationMode;
  strength?: number;
  minLuma?: number;
  saturationThreshold?: number;
  warmBiasThreshold?: number;
  blackAnchor?: number;
  preserveRed?: number;
  paperWhite?: LevelRGB;
}

export interface ImageProcessingOptions {
  paperNormalization?: PaperNormalizationOptions;
  clarity?: ClarityOptions;
  toneMapping?: ToneMappingOptions;
  dynamicRangeCompression?: DynamicRangeCompressionOptions | boolean;
}

export type ProcessingPresetName =
  | "balanced"
  | "dynamic"
  | "vivid"
  | "soft"
  | "grayscale"
  | "restore"
  | "posterScan"
  | (string & {});

export interface ProcessingPreset {
  name: ProcessingPresetName;
  title: string;
  description: string;
  paperNormalization?: PaperNormalizationOptions;
  toneMapping: ToneMappingOptions;
  dynamicRangeCompression?: DynamicRangeCompressionOptions;
  colorMatching?: ColorMatchingMode;
  errorDiffusionMatrix?: string;
}

export interface ImageDataLike {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

const exposureAdjustmentFromMultiplier = (multiplier: number) =>
  Number(Math.log2(multiplier).toFixed(3));

const linearAdjustmentFromMultiplier = (multiplier: number) =>
  Number((multiplier - 1).toFixed(3));

const exposureAdjustmentToMultiplier = (adjustment: number) =>
  Math.pow(2, adjustment);

const linearAdjustmentToMultiplier = (adjustment: number) =>
  Math.max(0, adjustment + 1);

export const PROCESSING_PRESETS: Record<string, ProcessingPreset> = {
  balanced: {
    name: "balanced",
    title: "Balanced",
    description:
      "Compresses display luminance range for general photo conversion.",
    toneMapping: {
      mode: "contrast",
      exposure: 0,
      saturation: 0,
      contrast: 0,
    },
    dynamicRangeCompression: {
      mode: "display",
      strength: 1,
    },
    colorMatching: "rgb",
    errorDiffusionMatrix: "floydSteinberg",
  },
  dynamic: {
    name: "dynamic",
    title: "Dynamic",
    description:
      "Uses S-curve tone mapping for brighter, punchier photographic output.",
    toneMapping: {
      mode: "scurve",
      exposure: 0,
      saturation: linearAdjustmentFromMultiplier(1.3),
      strength: 0.9,
      shadowBoost: 0,
      highlightCompress: -1.5,
      midpoint: 0.5,
    },
    dynamicRangeCompression: {
      mode: "off",
    },
    colorMatching: "rgb",
    errorDiffusionMatrix: "floydSteinberg",
  },
  vivid: {
    name: "vivid",
    title: "Vivid",
    description: "Boosts color and applies a gentler S-curve for illustrations.",
    toneMapping: {
      mode: "scurve",
      exposure: exposureAdjustmentFromMultiplier(1.1),
      saturation: linearAdjustmentFromMultiplier(1.6),
      strength: 0.7,
      shadowBoost: 0.1,
      highlightCompress: -1.3,
      midpoint: 0.5,
    },
    dynamicRangeCompression: {
      mode: "off",
    },
    colorMatching: "rgb",
    errorDiffusionMatrix: "floydSteinberg",
  },
  soft: {
    name: "soft",
    title: "Soft",
    description: "Reduces contrast and uses Stucki diffusion for smoother tones.",
    toneMapping: {
      mode: "contrast",
      exposure: 0,
      saturation: linearAdjustmentFromMultiplier(1.1),
      contrast: linearAdjustmentFromMultiplier(0.9),
    },
    dynamicRangeCompression: {
      mode: "display",
      strength: 1,
    },
    colorMatching: "rgb",
    errorDiffusionMatrix: "stucki",
  },
  grayscale: {
    name: "grayscale",
    title: "Grayscale",
    description: "Removes saturation and uses LAB matching for monochrome work.",
    toneMapping: {
      mode: "scurve",
      exposure: 0,
      saturation: linearAdjustmentFromMultiplier(0),
      strength: 0.8,
      shadowBoost: 0.1,
      highlightCompress: -1.4,
      midpoint: 0.5,
    },
    dynamicRangeCompression: {
      mode: "display",
      strength: 1,
    },
    colorMatching: "lab",
    errorDiffusionMatrix: "floydSteinberg",
  },
  restore: {
    name: "restore",
    title: "Restore",
    description:
      "Expands faded scans and paintings before mapping them to the display range.",
    toneMapping: {
      mode: "scurve",
      exposure: exposureAdjustmentFromMultiplier(1.08),
      saturation: linearAdjustmentFromMultiplier(0.9),
      strength: 1,
      shadowBoost: 0.25,
      highlightCompress: -0.75,
      midpoint: 0.46,
    },
    dynamicRangeCompression: {
      mode: "auto",
      strength: 0.9,
      lowPercentile: 0.02,
      highPercentile: 0.98,
    },
    colorMatching: "lab",
    errorDiffusionMatrix: "floydSteinberg",
  },
  posterscan: {
    name: "posterScan",
    title: "Poster Scan",
    description:
      "Neutralizes warm paper, anchors black ink, and preserves strong poster colors.",
    paperNormalization: {
      mode: "warmPaper",
      strength: 0.95,
      minLuma: 82,
      saturationThreshold: 0.56,
      warmBiasThreshold: 8,
      blackAnchor: 0.95,
      preserveRed: 0.85,
      paperWhite: [248, 248, 246],
    },
    toneMapping: {
      mode: "scurve",
      exposure: exposureAdjustmentFromMultiplier(1.04),
      saturation: linearAdjustmentFromMultiplier(1.05),
      strength: 0.92,
      shadowBoost: 0.08,
      highlightCompress: -0.55,
      midpoint: 0.44,
    },
    dynamicRangeCompression: {
      mode: "auto",
      strength: 1,
      lowPercentile: 0.015,
      highPercentile: 0.985,
    },
    colorMatching: "rgb",
    errorDiffusionMatrix: "floydSteinberg",
  },
};

export const getProcessingPreset = (
  name: ProcessingPresetName
): ProcessingPreset | null => {
  const preset = PROCESSING_PRESETS[String(name).toLowerCase()];
  return preset
    ? {
        ...preset,
        paperNormalization: preset.paperNormalization
          ? { ...preset.paperNormalization }
          : undefined,
        toneMapping: { ...preset.toneMapping },
        dynamicRangeCompression: preset.dynamicRangeCompression
          ? { ...preset.dynamicRangeCompression }
          : undefined,
      }
    : null;
};

export const getProcessingPresetNames = () =>
  Object.values(PROCESSING_PRESETS).map(({ name }) => name);

export const getProcessingPresetOptions = () =>
  Object.values(PROCESSING_PRESETS).map(({ name, title, description }) => ({
    value: name,
    title,
    description,
  }));

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

export const clampByte = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(clamp(value, 0, 255));
};

export const luma709 = (r: number, g: number, b: number) =>
  0.2126 * r + 0.7152 * g + 0.0722 * b;

const srgbToLinear = (() => {
  const values = new Float64Array(256);
  for (let value = 0; value < values.length; value += 1) {
    const normalized = value / 255;
    values[value] =
      normalized > 0.04045
        ? Math.pow((normalized + 0.055) / 1.055, 2.4)
        : normalized / 12.92;
  }
  return values;
})();

const labForwardPivot = (value: number) =>
  value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;

const rgbToLabLightness = (r: number, g: number, b: number) => {
  const y =
    srgbToLinear[r] * 0.2126729 +
    srgbToLinear[g] * 0.7151522 +
    srgbToLinear[b] * 0.072175;

  return 116 * labForwardPivot(y) - 16;
};

export const toRGB = (value: LevelRGB | undefined, fallback: number): RGB => {
  if (Array.isArray(value)) {
    return [
      value[0] ?? fallback,
      value[1] ?? fallback,
      value[2] ?? fallback,
    ];
  }
  const v = typeof value === "number" ? value : fallback;
  return [v, v, v];
};

export const toScalar = (value: LevelRGB | undefined, fallback: number) => {
  if (Array.isArray(value)) {
    return luma709(
      value[0] ?? fallback,
      value[1] ?? fallback,
      value[2] ?? fallback
    );
  }
  return typeof value === "number" ? value : fallback;
};

const rgbToXyz = (r: number, g: number, b: number) => {
  const rn = srgbToLinear[r];
  const gn = srgbToLinear[g];
  const bn = srgbToLinear[b];

  return [
    (rn * 0.4124564 + gn * 0.3575761 + bn * 0.1804375) * 100,
    (rn * 0.2126729 + gn * 0.7151522 + bn * 0.072175) * 100,
    (rn * 0.0193339 + gn * 0.119192 + bn * 0.9503041) * 100,
  ] as RGB;
};

const xyzToLab = (x: number, y: number, z: number) => {
  const xn = labForwardPivot(x / 95.047);
  const yn = labForwardPivot(y / 100);
  const zn = labForwardPivot(z / 108.883);

  return [116 * yn - 16, 500 * (xn - yn), 200 * (yn - zn)] as RGB;
};

export const rgbToLab = (r: number, g: number, b: number) => {
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
};

const labToXyz = (l: number, a: number, b: number) => {
  let y = (l + 16) / 116;
  let x = a / 500 + y;
  let z = y - b / 200;

  x = x > 0.206897 ? Math.pow(x, 3) : (x - 16 / 116) / 7.787;
  y = y > 0.206897 ? Math.pow(y, 3) : (y - 16 / 116) / 7.787;
  z = z > 0.206897 ? Math.pow(z, 3) : (z - 16 / 116) / 7.787;

  return [x * 95.047, y * 100, z * 108.883] as RGB;
};

const xyzToRgb = (x: number, y: number, z: number) => {
  const xn = x / 100;
  const yn = y / 100;
  const zn = z / 100;

  let r = xn * 3.2404542 + yn * -1.5371385 + zn * -0.4985314;
  let g = xn * -0.969266 + yn * 1.8760108 + zn * 0.041556;
  let b = xn * 0.0556434 + yn * -0.2040259 + zn * 1.0572252;

  r = r > 0.0031308 ? 1.055 * Math.pow(r, 1 / 2.4) - 0.055 : 12.92 * r;
  g = g > 0.0031308 ? 1.055 * Math.pow(g, 1 / 2.4) - 0.055 : 12.92 * g;
  b = b > 0.0031308 ? 1.055 * Math.pow(b, 1 / 2.4) - 0.055 : 12.92 * b;

  return [clampByte(r * 255), clampByte(g * 255), clampByte(b * 255)] as RGB;
};

export const labToRgb = (l: number, a: number, b: number) => {
  const [x, y, z] = labToXyz(l, a, b);
  return xyzToRgb(x, y, z);
};

export const deltaE = (lab1: RGB, lab2: RGB) => {
  const dl = lab1[0] - lab2[0];
  const da = lab1[1] - lab2[1];
  const db = lab1[2] - lab2[2];
  return Math.sqrt(dl * dl + da * da + db * db);
};

const getSaturation = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return max === 0 ? 0 : (max - min) / max;
};

const normalize = (value: number, min: number, max: number) =>
  clamp((value - min) / (max - min), 0, 1);

const smoothstep = (edge0: number, edge1: number, value: number) => {
  if (edge1 <= edge0) return value >= edge1 ? 1 : 0;
  const x = normalize(value, edge0, edge1);
  return x * x * (3 - 2 * x);
};

const getDynamicRangeChromaProtection = (r: number, g: number, b: number) =>
  smoothstep(0.18, 0.68, getSaturation(r, g, b)) * 0.85;

const isRedInk = (r: number, g: number, b: number, saturation: number) =>
  saturation >= 0.34 && r >= g + 24 && r >= b + 28;

const applyPaperNormalization = (
  image: ImageDataLike,
  options: PaperNormalizationOptions | undefined
) => {
  if (!options || options.mode === "off") return;

  const strength = clamp(options.strength ?? 1, 0, 1);
  if (strength === 0) return;

  const data = image.data;
  const minLuma = options.minLuma ?? 86;
  const saturationThreshold = options.saturationThreshold ?? 0.44;
  const warmBiasThreshold = options.warmBiasThreshold ?? 8;
  const blackAnchor = clamp(options.blackAnchor ?? 0.85, 0, 1);
  const preserveRed = clamp(options.preserveRed ?? 0.75, 0, 1);
  const paperWhite = toRGB(options.paperWhite, 248);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = luma709(r, g, b);
    const saturation = getSaturation(r, g, b);
    const redInk = isRedInk(r, g, b, saturation);

    if (redInk) {
      const redBoost = strength * preserveRed;
      data[i] = clampByte(r + (255 - r) * 0.08 * redBoost);
      data[i + 1] = clampByte(g * (1 - 0.08 * redBoost));
      data[i + 2] = clampByte(b * (1 - 0.12 * redBoost));
      continue;
    }

    const darkNeutralMask =
      normalize(112 - luma, 0, 72) * normalize(0.42 - saturation, 0, 0.32);
    if (darkNeutralMask > 0) {
      const amount = darkNeutralMask * blackAnchor * strength;
      data[i] = clampByte(r * (1 - 0.72 * amount));
      data[i + 1] = clampByte(g * (1 - 0.72 * amount));
      data[i + 2] = clampByte(b * (1 - 0.72 * amount));
      continue;
    }

    const warmBias = Math.min(r - b, (r + g) / 2 - b);
    const warmPaperMask =
      normalize(luma, minLuma, 210) *
      normalize(245 - luma, 0, 80) *
      normalize(saturationThreshold - saturation, 0, saturationThreshold) *
      normalize(warmBias, warmBiasThreshold, 34);

    if (warmPaperMask <= 0) continue;

    const amount = warmPaperMask * strength;
    const targetLuma = Math.min(
      252,
      luma + (paperWhite[0] - luma) * (0.72 + 0.2 * strength)
    );
    const neutralR = targetLuma + (paperWhite[0] - 248) * 0.4;
    const neutralG = targetLuma + (paperWhite[1] - 248) * 0.4;
    const neutralB = targetLuma + (paperWhite[2] - 248) * 0.4;

    data[i] = clampByte(r + (neutralR - r) * amount);
    data[i + 1] = clampByte(g + (neutralG - g) * amount);
    data[i + 2] = clampByte(b + (neutralB - b) * amount);
  }
};

const applyClarity = (
  image: ImageDataLike,
  options: ClarityOptions | undefined
) => {
  if (!options) return;

  const amount = clamp(options.amount ?? 0, -1, 1);
  if (amount === 0) return;

  const effectiveAmount = amount * 2;
  const radius = clamp(Math.round(options.radius ?? 2), 1, 4);
  const midtone = Math.max(0.1, options.midtone ?? 1.2);
  const { data, width, height } = image;
  const source = new Uint8ClampedArray(data);
  const temp = new Uint8ClampedArray(data.length);
  const kernelSize = radius * 2 + 1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      for (let k = -radius; k <= radius; k += 1) {
        const xi = clamp(x + k, 0, width - 1);
        const index = (y * width + xi) * 4;
        sumR += source[index];
        sumG += source[index + 1];
        sumB += source[index + 2];
      }

      const output = (y * width + x) * 4;
      temp[output] = sumR / kernelSize;
      temp[output + 1] = sumG / kernelSize;
      temp[output + 2] = sumB / kernelSize;
    }
  }

  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) {
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;

      for (let k = -radius; k <= radius; k += 1) {
        const yi = clamp(y + k, 0, height - 1);
        const index = (yi * width + x) * 4;
        sumR += temp[index];
        sumG += temp[index + 1];
        sumB += temp[index + 2];
      }

      const output = (y * width + x) * 4;
      const blurredR = sumR / kernelSize;
      const blurredG = sumG / kernelSize;
      const blurredB = sumB / kernelSize;
      const r = source[output];
      const g = source[output + 1];
      const b = source[output + 2];
      const lightness = luma709(r, g, b) / 255;
      const midtoneWeight = Math.pow(
        clamp(1 - Math.abs(2 * lightness - 1), 0, 1),
        midtone
      );

      data[output] = clampByte(
        r + effectiveAmount * (r - blurredR) * midtoneWeight
      );
      data[output + 1] = clampByte(
        g + effectiveAmount * (g - blurredG) * midtoneWeight
      );
      data[output + 2] = clampByte(
        b + effectiveAmount * (b - blurredB) * midtoneWeight
      );
    }
  }
};

const applyExposure = (image: ImageDataLike, exposure: number) => {
  if (exposure === 1) return;
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampByte(data[i] * exposure);
    data[i + 1] = clampByte(data[i + 1] * exposure);
    data[i + 2] = clampByte(data[i + 2] * exposure);
  }
};

const applyContrast = (image: ImageDataLike, contrast: number) => {
  if (contrast === 1) return;
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampByte((data[i] - 128) * contrast + 128);
    data[i + 1] = clampByte((data[i + 1] - 128) * contrast + 128);
    data[i + 2] = clampByte((data[i + 2] - 128) * contrast + 128);
  }
};

const applySaturation = (image: ImageDataLike, saturation: number) => {
  if (saturation === 1) return;
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;

    if (max === min) continue;

    const delta = max - min;
    const sat =
      lightness > 0.5
        ? delta / (2 - max - min)
        : delta / Math.max(max + min, 0.000001);

    let hue: number;
    if (max === r) {
      hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
      hue = ((b - r) / delta + 2) / 6;
    } else {
      hue = ((r - g) / delta + 4) / 6;
    }

    const newSat = clamp(sat * saturation, 0, 1);
    const c = (1 - Math.abs(2 * lightness - 1)) * newSat;
    const x = c * (1 - Math.abs(((hue * 6) % 2) - 1));
    const m = lightness - c / 2;

    let rp = 0;
    let gp = 0;
    let bp = 0;
    const sector = Math.floor(hue * 6);

    if (sector === 0) [rp, gp, bp] = [c, x, 0];
    else if (sector === 1) [rp, gp, bp] = [x, c, 0];
    else if (sector === 2) [rp, gp, bp] = [0, c, x];
    else if (sector === 3) [rp, gp, bp] = [0, x, c];
    else if (sector === 4) [rp, gp, bp] = [x, 0, c];
    else [rp, gp, bp] = [c, 0, x];

    data[i] = clampByte((rp + m) * 255);
    data[i + 1] = clampByte((gp + m) * 255);
    data[i + 2] = clampByte((bp + m) * 255);
  }
};

const applyScurveToneMap = (
  image: ImageDataLike,
  strength: number,
  shadowBoost: number,
  highlightBoost: number,
  midpoint: number
) => {
  if (strength === 0) return;
  const data = image.data;
  const mid = clamp(midpoint, 0.01, 0.99);
  const shadowExponent = clamp(1 - strength * shadowBoost, 0.15, 3);
  const highlightExponent = clamp(1 - strength * highlightBoost, 0.15, 3);
  const lookup = new Uint8ClampedArray(256);

  for (let value = 0; value < lookup.length; value += 1) {
    const normalized = value / 255;
    let result: number;

    if (normalized <= mid) {
      const shadowValue = normalized / mid;
      result = Math.pow(shadowValue, shadowExponent) * mid;
    } else {
      const highlightValue = (normalized - mid) / (1 - mid);
      result =
        mid + Math.pow(highlightValue, highlightExponent) * (1 - mid);
    }

    lookup[value] = clampByte(result * 255);
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lookup[data[i]];
    data[i + 1] = lookup[data[i + 1]];
    data[i + 2] = lookup[data[i + 2]];
  }
};

const LIGHTNESS_HISTOGRAM_SCALE = 100;
const LIGHTNESS_HISTOGRAM_BINS = 100 * LIGHTNESS_HISTOGRAM_SCALE + 1;

const percentileFromHistogram = (
  histogram: Uint32Array,
  count: number,
  p: number
) => {
  if (count <= 0) return 0;

  const target = clamp(Math.round((count - 1) * p), 0, count - 1);
  let seen = 0;

  for (let index = 0; index < histogram.length; index += 1) {
    seen += histogram[index];
    if (seen > target) return index / LIGHTNESS_HISTOGRAM_SCALE;
  }

  return 100;
};

const CHROMA_GUARD_STEPS = 5;

const isProtectedChromaFit = (
  sourceLuma: number,
  resultR: number,
  resultG: number,
  resultB: number,
  sourceSaturation: number
) => {
  if (sourceSaturation < 0.16) return true;

  const resultSaturation = getSaturation(resultR, resultG, resultB);
  const minimumSaturation = Math.max(0.12, sourceSaturation * 0.72);
  if (resultSaturation >= minimumSaturation) return true;

  return luma709(resultR, resultG, resultB) <= sourceLuma + 4;
};

const labToRgbWithChromaGuard = (
  sourceR: number,
  sourceG: number,
  sourceB: number,
  sourceL: number,
  a: number,
  b: number,
  targetL: number,
  amount: number
) => {
  const sourceSaturation = getSaturation(sourceR, sourceG, sourceB);
  const sourceLuma = luma709(sourceR, sourceG, sourceB);
  const toRgb = (fitAmount: number) =>
    labToRgb(sourceL + (targetL - sourceL) * fitAmount, a, b);
  const result = toRgb(amount);

  if (
    targetL <= sourceL ||
    isProtectedChromaFit(
      sourceLuma,
      result[0],
      result[1],
      result[2],
      sourceSaturation
    )
  ) {
    return result;
  }

  let low = 0;
  let high = amount;
  let protectedResult: RGB = [sourceR, sourceG, sourceB];

  for (let step = 0; step < CHROMA_GUARD_STEPS; step += 1) {
    const mid = (low + high) / 2;
    const candidate = toRgb(mid);

    if (
      isProtectedChromaFit(
        sourceLuma,
        candidate[0],
        candidate[1],
        candidate[2],
        sourceSaturation
      )
    ) {
      low = mid;
      protectedResult = candidate;
    } else {
      high = mid;
    }
  }

  return protectedResult;
};

const getPaletteEndpoints = (
  palette: RGB[] | undefined,
  black: LevelRGB | undefined,
  white: LevelRGB | undefined
) => {
  if (black !== undefined && white !== undefined) {
    return {
      black: toRGB(black, 0),
      white: toRGB(white, 255),
    };
  }

  if (!palette || palette.length === 0) {
    return {
      black: toRGB(black, 0),
      white: toRGB(white, 255),
    };
  }

  let darkest = palette[0];
  let lightest = palette[0];
  for (const color of palette) {
    if (luma709(...color) < luma709(...darkest)) darkest = color;
    if (luma709(...color) > luma709(...lightest)) lightest = color;
  }

  return {
    black: black !== undefined ? toRGB(black, 0) : darkest,
    white: white !== undefined ? toRGB(white, 255) : lightest,
  };
};

const normalizeDynamicRangeOptions = (
  options: DynamicRangeCompressionOptions | boolean | undefined
): DynamicRangeCompressionOptions | undefined => {
  if (options === true) return { mode: "display", strength: 1 };
  if (!options || options.mode === "off") return undefined;
  return options;
};

const applyDynamicRangeCompression = (
  image: ImageDataLike,
  options: DynamicRangeCompressionOptions | boolean | undefined,
  palette: RGB[] | undefined
) => {
  const normalized = normalizeDynamicRangeOptions(options);
  if (!normalized) return;

  const mode = normalized.mode ?? "display";
  const strength = clamp(normalized.strength ?? 1, 0, 1);
  if (strength === 0) return;

  const { black, white } = getPaletteEndpoints(
    palette,
    normalized.black,
    normalized.white
  );
  const [blackL] = rgbToLab(...black);
  const [whiteL] = rgbToLab(...white);
  const targetRange = whiteL - blackL;
  if (targetRange <= 0) return;

  const data = image.data;
  let sourceBlackL = 0;
  let sourceWhiteL = 100;

  if (mode === "auto") {
    const lightnessHistogram = new Uint32Array(LIGHTNESS_HISTOGRAM_BINS);
    let lightnessCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const l = rgbToLabLightness(data[i], data[i + 1], data[i + 2]);
      const bin = clamp(
        Math.round(l * LIGHTNESS_HISTOGRAM_SCALE),
        0,
        LIGHTNESS_HISTOGRAM_BINS - 1
      );
      lightnessHistogram[bin] += 1;
      lightnessCount += 1;
    }
    sourceBlackL = percentileFromHistogram(
      lightnessHistogram,
      lightnessCount,
      normalized.lowPercentile ?? 0.01
    );
    sourceWhiteL = percentileFromHistogram(
      lightnessHistogram,
      lightnessCount,
      normalized.highPercentile ?? 0.99
    );
  }

  const sourceRange = sourceWhiteL - sourceBlackL;
  if (sourceRange <= 0.0001) return;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const blue = data[i + 2];
    const [l, a, b] = rgbToLab(r, g, blue);
    const normalizedL = clamp((l - sourceBlackL) / sourceRange, 0, 1);
    const compressedL = blackL + normalizedL * targetRange;
    const chromaProtection = getDynamicRangeChromaProtection(r, g, blue);
    const effectiveStrength = strength * (1 - chromaProtection);
    const [newR, newG, newBlue] = labToRgbWithChromaGuard(
      r,
      g,
      blue,
      l,
      a,
      b,
      compressedL,
      effectiveStrength
    );

    data[i] = newR;
    data[i + 1] = newG;
    data[i + 2] = newBlue;
  }
};

export const applyToneMapping = (
  image: ImageDataLike,
  options: ToneMappingOptions | undefined
) => {
  if (!options) return;

  const exposure = exposureAdjustmentToMultiplier(options.exposure ?? 0);
  const saturation = linearAdjustmentToMultiplier(options.saturation ?? 0);
  const contrast = linearAdjustmentToMultiplier(options.contrast ?? 0);
  const mode = options.mode;

  applyExposure(image, exposure);
  applySaturation(image, saturation);

  if (mode === "off") return;

  if (!mode || mode === "contrast") {
    applyContrast(image, contrast);
  }

  if (!mode || mode === "scurve") {
    applyScurveToneMap(
      image,
      options.strength ?? (mode === "scurve" ? 0.9 : 0),
      options.shadowBoost ?? 0,
      options.highlightCompress ?? -1.5,
      options.midpoint ?? 0.5
    );
  }
};

export const applyImageProcessing = (
  image: ImageDataLike,
  options: ImageProcessingOptions | undefined,
  palette?: RGB[]
) => {
  if (!options) return;
  applyPaperNormalization(image, options.paperNormalization);
  applyClarity(image, options.clarity);
  applyToneMapping(image, options.toneMapping);
  applyDynamicRangeCompression(
    image,
    options.dynamicRangeCompression,
    palette
  );
};
