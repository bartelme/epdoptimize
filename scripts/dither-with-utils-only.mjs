import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputDir = "examples/dither-debug/utils-only";
const bundledUtils = "/tmp/epdoptimize-dithering-utils.mjs";
const inputs = [
  "examples/sampleImages/rainbow.png",
  "examples/sampleImages/landscape.jpg",
];

const spectra6RgbPalette = [
  [0, 0, 0],
  [255, 255, 255],
  [0, 0, 255],
  [0, 255, 0],
  [255, 0, 0],
  [255, 255, 0],
];

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

class MemoryContext {
  constructor(canvas) {
    this.canvas = canvas;
  }

  putImageData(imageData) {
    this.canvas.width = imageData.width;
    this.canvas.height = imageData.height;
    this.canvas.data = new Uint8ClampedArray(imageData.data);
  }
}

class MemoryCanvas {
  constructor(width, height, data) {
    this.width = width;
    this.height = height;
    this.data = data;
  }

  getContext(contextId) {
    if (contextId !== "2d") return null;
    return new MemoryContext(this);
  }
}

async function bundleUtils() {
  await execFileAsync("node_modules/.bin/esbuild", [
    "src/utils/dithering.ts",
    "--bundle",
    "--format=esm",
    "--platform=node",
    `--outfile=${bundledUtils}`,
  ]);
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

async function readRgba(file) {
  const { width, height } = await identify(file);
  const { stdout } = await execFileAsync(
    "magick",
    [file, "-auto-orient", "-alpha", "on", "-depth", "8", "rgba:-"],
    {
      encoding: "buffer",
      maxBuffer: 1024 * 1024 * 512,
    },
  );

  return new MemoryCanvas(
    width,
    height,
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

await mkdir(outputDir, { recursive: true });
await bundleUtils();

const { rgbQuantDiffusionDither } = await import(pathToFileURL(bundledUtils));

for (const input of inputs) {
  const canvas = await readRgba(input);
  const imageData = {
    width: canvas.width,
    height: canvas.height,
    data: new Uint8ClampedArray(canvas.data),
    [Symbol.toStringTag]: "ImageData",
  };

  rgbQuantDiffusionDither(
    canvas.getContext("2d"),
    imageData,
    spectra6RgbPalette,
    1,
    "FloydSteinberg",
    false,
  );

  const output = join(
    outputDir,
    `${basename(input, extname(input))}-utils-floyd-steinberg-rgb.png`,
  );
  await writePng(canvas, output);
  console.log(output);
}
