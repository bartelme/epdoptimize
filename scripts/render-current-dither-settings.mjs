import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import {
  applyImageAdjustments,
  ditherCanvas,
  replaceColors,
  spectra6OriginalPreviewPalette,
} from "../dist/index.mjs";

const execFileAsync = promisify(execFile);
const outputDir = "examples/dither-debug/current-settings";
const inputs = [
  "examples/sampleImages/rainbow.png",
  "examples/sampleImages/landscape.jpg",
];

const ditherOptions = {
  ditheringType: "errorDiffusion",
  errorDiffusionMatrix: "floydSteinberg",
  serpentine: false,
  colorMatching: "rgb",
  processingEngine: "js",
  palette: spectra6OriginalPreviewPalette,
  calibrate: true,
};

const demoLikeOptions = {
  ...ditherOptions,
  toneMapping: {
    exposure: 1,
    saturation: 1,
    contrast: 1,
    strength: 0,
    shadowBoost: 0,
    highlightCompress: -1.5,
    midpoint: 0.5,
  },
  dynamicRangeCompression: { mode: "off" },
};

globalThis.ImageData = class ImageData {
  constructor(data, width, height) {
    this.data = data;
    this.width = width;
    this.height = height;
  }

  get [Symbol.toStringTag]() {
    return "ImageData";
  }
};

class MemoryCanvas {
  constructor(width = 1, height = 1, data = null) {
    this.width = width;
    this.height = height;
    this.data = data ?? new Uint8ClampedArray(width * height * 4);
  }

  getContext(contextId) {
    if (contextId !== "2d") return null;
    return {
      getImageData: () => ({
        width: this.width,
        height: this.height,
        data: new Uint8ClampedArray(this.data),
        [Symbol.toStringTag]: "ImageData",
      }),
      putImageData: (imageData) => {
        this.width = imageData.width;
        this.height = imageData.height;
        this.data = new Uint8ClampedArray(imageData.data);
      },
    };
  }
}

async function identify(file) {
  const { stdout } = await execFileAsync("magick", [
    "identify",
    "-auto-orient",
    "-format",
    "%w %h",
    file,
  ]);
  const [width, height] = stdout.trim().split(/\s+/).map(Number);
  return { width, height };
}

async function readRgba(file, target) {
  const args = [file, "-auto-orient"];
  if (target) {
    args.push(
      "-resize",
      `${target.width}x${target.height}${target.fit === "cover" ? "^" : ""}`,
      "-background",
      "white",
      "-gravity",
      "center",
      "-extent",
      `${target.width}x${target.height}`,
    );
  }
  args.push("-alpha", "on", "-depth", "8", "rgba:-");

  const { stdout } = await execFileAsync("magick", args, {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 512,
  });
  const size = target ?? (await identify(file));
  return new MemoryCanvas(
    size.width,
    size.height,
    new Uint8ClampedArray(stdout.buffer, stdout.byteOffset, stdout.byteLength),
  );
}

async function writePng(canvas, file) {
  const input = Buffer.from(
    canvas.data.buffer,
    canvas.data.byteOffset,
    canvas.data.byteLength,
  );
  const child = execFile(
    "magick",
    [
      "-size",
      `${canvas.width}x${canvas.height}`,
      "-depth",
      "8",
      "rgba:-",
      file,
    ],
    { encoding: "buffer", maxBuffer: 1024 * 1024 * 64 },
  );

  child.stdin.end(input);

  await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`magick exited ${code}`)),
    );
  });
}

async function renderVariant(inputFile, variantName, sourceCanvas) {
  const base = basename(inputFile, extname(inputFile));
  const adjustedCanvas = new MemoryCanvas();
  const ditheredCanvas = new MemoryCanvas();
  const deviceCanvas = new MemoryCanvas();
  const neutralDitherCanvas = new MemoryCanvas();

  await applyImageAdjustments(sourceCanvas, adjustedCanvas, demoLikeOptions);
  await ditherCanvas(adjustedCanvas, ditheredCanvas, demoLikeOptions);
  replaceColors(ditheredCanvas, deviceCanvas, spectra6OriginalPreviewPalette);
  await ditherCanvas(sourceCanvas, neutralDitherCanvas, ditherOptions);

  await writePng(
    adjustedCanvas,
    join(outputDir, `${base}-${variantName}-adjusted.png`),
  );
  await writePng(
    ditheredCanvas,
    join(outputDir, `${base}-${variantName}-dithered.png`),
  );
  await writePng(
    deviceCanvas,
    join(outputDir, `${base}-${variantName}-device-colors.png`),
  );
  await writePng(
    neutralDitherCanvas,
    join(outputDir, `${base}-${variantName}-neutral-dithered.png`),
  );
}

await mkdir(outputDir, { recursive: true });

for (const input of inputs) {
  await renderVariant(input, "source", await readRgba(input));
  await renderVariant(
    input,
    "screen-800x480-contain",
    await readRgba(input, { width: 800, height: 480, fit: "contain" }),
  );
  await renderVariant(
    input,
    "screen-480x800-contain",
    await readRgba(input, { width: 480, height: 800, fit: "contain" }),
  );
  await renderVariant(
    input,
    "screen-800x480-cover",
    await readRgba(input, { width: 800, height: 480, fit: "cover" }),
  );
  await renderVariant(
    input,
    "screen-480x800-cover",
    await readRgba(input, { width: 480, height: 800, fit: "cover" }),
  );
}

console.log(`Wrote renders to ${outputDir}`);
