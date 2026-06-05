import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const outputDir = "examples/dither-debug/palette-orders";
const bundledUtils = "/tmp/epdoptimize-dithering-utils.mjs";
const inputs = [
  "examples/sampleImages/rainbow.png",
  "examples/sampleImages/landscape.jpg",
];

const colorOrders = {
  "01-current-black-white-blue-green-red-yellow": [
    [0, 0, 0],
    [255, 255, 255],
    [0, 0, 255],
    [0, 255, 0],
    [255, 0, 0],
    [255, 255, 0],
  ],
  "02-white-last": [
    [0, 0, 0],
    [0, 0, 255],
    [0, 255, 0],
    [255, 0, 0],
    [255, 255, 0],
    [255, 255, 255],
  ],
  "03-rainbow-then-neutrals": [
    [255, 0, 0],
    [255, 255, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 255],
    [0, 0, 0],
  ],
  "04-neutrals-last": [
    [0, 0, 255],
    [0, 255, 0],
    [255, 0, 0],
    [255, 255, 0],
    [255, 255, 255],
    [0, 0, 0],
  ],
  "05-warm-first": [
    [255, 0, 0],
    [255, 255, 0],
    [255, 255, 255],
    [0, 255, 0],
    [0, 0, 255],
    [0, 0, 0],
  ],
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

async function makeContactSheet(baseName, files) {
  await execFileAsync("magick", [
    ...files,
    "-thumbnail",
    "360x240>",
    "-append",
    join(outputDir, `${baseName}-palette-order-contact-sheet.png`),
  ]);
}

await mkdir(outputDir, { recursive: true });
await bundleUtils();

const { rgbQuantDiffusionDither } = await import(pathToFileURL(bundledUtils));

for (const input of inputs) {
  const baseName = basename(input, extname(input));
  const sourceCanvas = await readRgba(input);
  const renderedFiles = [];

  for (const [orderName, palette] of Object.entries(colorOrders)) {
    const canvas = new MemoryCanvas(
      sourceCanvas.width,
      sourceCanvas.height,
      new Uint8ClampedArray(sourceCanvas.data),
    );
    const imageData = {
      width: canvas.width,
      height: canvas.height,
      data: new Uint8ClampedArray(canvas.data),
      [Symbol.toStringTag]: "ImageData",
    };

    rgbQuantDiffusionDither(
      canvas.getContext("2d"),
      imageData,
      palette,
      1,
      "FloydSteinberg",
      false,
    );

    const output = join(outputDir, `${baseName}-${orderName}.png`);
    await writePng(canvas, output);
    renderedFiles.push(output);
    console.log(output);
  }

  await makeContactSheet(baseName, renderedFiles);
  console.log(join(outputDir, `${baseName}-palette-order-contact-sheet.png`));
}
