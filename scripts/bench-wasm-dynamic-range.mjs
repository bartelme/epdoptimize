import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";

const epdoptimize = await import(
  pathToFileURL(`${process.cwd()}/dist/index.mjs`)
);

const wasmPath = `${process.cwd()}/experiments/wasm/dynamic-range-compression.wasm`;

if (!existsSync(wasmPath)) {
  execFileSync(
    "node",
    [
      "node_modules/assemblyscript/bin/asc.js",
      "wasm-src/dynamic-range-compression.ts",
      "-o",
      wasmPath,
      "-O",
      "--noAssert",
      "--runtime",
      "stub",
      "--enable",
      "simd",
    ],
    { stdio: "inherit" }
  );
}

const { instance } = await WebAssembly.instantiate(readFileSync(wasmPath), {});
const wasm = instance.exports;

const palette = epdoptimize.aitjcizeSpectra6Palette;
const paletteRgb = palette.map((entry) =>
  entry.color
    .slice(1)
    .match(/.{2}/g)
    .map((part) => Number.parseInt(part, 16))
);

const luma709 = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const srgbToLinear = Array.from({ length: 256 }, (_, value) => {
  const normalized = value / 255;
  return normalized > 0.04045
    ? Math.pow((normalized + 0.055) / 1.055, 2.4)
    : normalized / 12.92;
});
const labPivot = (value) =>
  value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116;
const rgbToLabLightness = (r, g, b) => {
  const y =
    srgbToLinear[r] * 0.2126729 +
    srgbToLinear[g] * 0.7151522 +
    srgbToLinear[b] * 0.072175;
  return 116 * labPivot(y) - 16;
};
const paletteLightness = (color) => rgbToLabLightness(color[0], color[1], color[2]);
const black = paletteRgb.reduce((left, right) =>
  luma709(...right) < luma709(...left) ? right : left
);
const white = paletteRgb.reduce((left, right) =>
  luma709(...right) > luma709(...left) ? right : left
);
const blackL = paletteLightness(black);
const whiteL = paletteLightness(white);

const align = (value, boundary) => Math.ceil(value / boundary) * boundary;

const ensureMemory = (memory, byteLength) => {
  const requiredPages = Math.ceil(byteLength / 65536);
  const currentPages = memory.buffer.byteLength / 65536;
  if (requiredPages > currentPages) memory.grow(requiredPages - currentPages);
};

const makeData = (width, height) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      data[i] = (x * 17 + y * 31 + 13) % 256;
      data[i + 1] = (x * x * 7 + y * 19) % 256;
      data[i + 2] = (x * 5 + y * y * 3 + 91) % 256;
      data[i + 3] = 255;
    }
  }
  return data;
};

const makeCanvas = (width, height, sourceData) => {
  let imageData = { width, height, data: new Uint8ClampedArray(sourceData) };
  const canvas = {
    width,
    height,
    getContext() {
      return {
        getImageData() {
          return {
            width: imageData.width,
            height: imageData.height,
            data: new Uint8ClampedArray(imageData.data),
          };
        },
        putImageData(next) {
          imageData = {
            width: next.width,
            height: next.height,
            data: new Uint8ClampedArray(next.data),
          };
          canvas.width = next.width;
          canvas.height = next.height;
        },
      };
    },
    get data() {
      return imageData.data;
    },
  };
  return canvas;
};

const runJs = async (sourceData, width, height, options) => {
  const output = makeCanvas(width, height, sourceData);
  await epdoptimize.applyImageAdjustments(makeCanvas(width, height, sourceData), output, {
    palette,
    dynamicRangeCompression: options,
  });
  return output.data;
};

const runWasm = (sourceData, width, height, options) => {
  const dataByteLength = sourceData.byteLength;
  const histogramScale = 100;
  const histogramBins = 100 * histogramScale + 1;
  const histogramByteLength = histogramBins * 4;
  const dataPtr = 65536;
  const histogramPtr = align(dataPtr + dataByteLength, 8);
  const srgbTablePtr = align(histogramPtr + histogramByteLength, 8);
  const scratchPtr = align(srgbTablePtr + 256 * 8, 8);
  const totalBytes = scratchPtr + 64;

  ensureMemory(wasm.memory, totalBytes);
  const bytes = new Uint8Array(wasm.memory.buffer);
  const floats = new Float64Array(wasm.memory.buffer);

  for (let value = 0; value < srgbToLinear.length; value += 1) {
    floats[srgbTablePtr / 8 + value] = srgbToLinear[value];
  }

  wasm.setSrgbTable(srgbTablePtr);
  bytes.set(sourceData, dataPtr);

  wasm.applyDynamicRangeCompressionRgb(
    dataPtr,
    width,
    height,
    blackL,
    whiteL,
    options.strength ?? 1,
    options.mode === "auto" ? 1 : 0,
    options.lowPercentile ?? 0.01,
    options.highPercentile ?? 0.99,
    histogramPtr,
    histogramBins,
    histogramScale,
    scratchPtr
  );

  return new Uint8ClampedArray(bytes.slice(dataPtr, dataPtr + dataByteLength));
};

const compare = (left, right) => {
  let mismatchedChannels = 0;
  let maxAbs = 0;
  let totalAbs = 0;
  for (let index = 0; index < left.length; index += 1) {
    const diff = Math.abs(left[index] - right[index]);
    if (diff > 0) mismatchedChannels += 1;
    if (diff > maxAbs) maxAbs = diff;
    totalAbs += diff;
  }
  return {
    mismatchedChannels,
    maxAbs,
    meanAbs: +(totalAbs / left.length).toFixed(4),
  };
};

const time = async (callback, iterations) => {
  const start = performance.now();
  for (let index = 0; index < iterations; index += 1) {
    await callback();
  }
  return performance.now() - start;
};

const rows = [];
for (const [width, height, iterations] of [
  [360, 240, 8],
  [800, 480, 5],
  [1600, 1200, 2],
]) {
  const sourceData = makeData(width, height);
  for (const options of [
    { mode: "display", strength: 0.7 },
    { mode: "auto", strength: 0.9, lowPercentile: 0.02, highPercentile: 0.98 },
  ]) {
    const jsData = await runJs(sourceData, width, height, options);
    const wasmData = runWasm(sourceData, width, height, options);
    const diff = compare(jsData, wasmData);

    await runJs(sourceData, width, height, options);
    runWasm(sourceData, width, height, options);

    const jsMs = await time(
      () => runJs(sourceData, width, height, options),
      iterations
    );
    const wasmMs = await time(
      () => runWasm(sourceData, width, height, options),
      iterations
    );

    rows.push({
      size: `${width}x${height}`,
      mode: options.mode,
      iterations,
      jsPerRun: +(jsMs / iterations).toFixed(2),
      wasmPerRun: +(wasmMs / iterations).toFixed(2),
      speedup: +(jsMs / wasmMs).toFixed(2),
      ...diff,
    });
  }
}

console.table(rows);
