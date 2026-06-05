import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";
import {
  applyImageAdjustments,
  ditherCanvas,
  spectra6OriginalPreviewPalette,
} from "../dist/index.mjs";

const execFileAsync = promisify(execFile);
const outputDir = "examples/dither-debug/edge-preservation";
const inputs = [
  "examples/sampleImages/sign.jpg",
  "examples/sampleImages/color_screenshot.png",
  "examples/sampleImages/blackandwhite_illustration.png",
  "examples/sampleImages/info.jpg",
  "examples/sampleImages/the-chap-book.jpg",
];

const target = { width: 480, height: 320, fit: "contain" };
const palette = spectra6OriginalPreviewPalette;

const baseOptions = {
  palette,
  colorMatching: "lab",
  processingEngine: "js",
  toneMapping: {
    mode: "contrast",
    exposure: 0,
    saturation: 0,
    contrast: 0.2,
  },
  dynamicRangeCompression: { mode: "display", strength: 0.75 },
};

const diffusionOptions = {
  ...baseOptions,
  ditheringType: "errorDiffusion",
  errorDiffusionMatrix: "floydSteinberg",
  serpentine: false,
};

const quantizedOptions = {
  ...baseOptions,
  ditheringType: "quantizationOnly",
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

  clone() {
    return new MemoryCanvas(
      this.width,
      this.height,
      new Uint8ClampedArray(this.data),
    );
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

async function readRgba(file, targetSize) {
  const args = [file, "-auto-orient"];
  if (targetSize) {
    args.push(
      "-resize",
      `${targetSize.width}x${targetSize.height}${
        targetSize.fit === "cover" ? "^" : ""
      }`,
      "-background",
      "white",
      "-gravity",
      "center",
      "-extent",
      `${targetSize.width}x${targetSize.height}`,
    );
  }
  args.push("-alpha", "on", "-depth", "8", "rgba:-");

  const { stdout } = await execFileAsync("magick", args, {
    encoding: "buffer",
    maxBuffer: 1024 * 1024 * 512,
  });

  return new MemoryCanvas(
    targetSize.width,
    targetSize.height,
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
    ["-size", `${canvas.width}x${canvas.height}`, "-depth", "8", "rgba:-", file],
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

async function renderProcessed(source, options) {
  const adjusted = new MemoryCanvas();
  const output = new MemoryCanvas();
  await applyImageAdjustments(source, adjusted, options);
  await ditherCanvas(adjusted, output, options);
  return output;
}

function luma(data, pixel) {
  return (
    data[pixel] * 0.2126 + data[pixel + 1] * 0.7152 + data[pixel + 2] * 0.0722
  );
}

function buildEdgeMask(canvas, { threshold = 36, radius = 1 } = {}) {
  const { width, height, data } = canvas;
  const rawMask = new Uint8Array(width * height);
  const mask = new Uint8Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = (y * width + x) * 4;
      if (data[center + 3] <= 16) continue;

      const left = (y * width + x - 1) * 4;
      const right = (y * width + x + 1) * 4;
      const up = ((y - 1) * width + x) * 4;
      const down = ((y + 1) * width + x) * 4;
      const dx = Math.abs(luma(data, right) - luma(data, left));
      const dy = Math.abs(luma(data, down) - luma(data, up));
      const magnitude = Math.sqrt(dx * dx + dy * dy);

      if (magnitude >= threshold) {
        rawMask[y * width + x] = 1;
      }
    }
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (rawMask[index] !== 1) continue;

      for (let oy = -radius; oy <= radius; oy += 1) {
        for (let ox = -radius; ox <= radius; ox += 1) {
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          mask[ny * width + nx] = 1;
        }
      }
    }
  }

  return mask;
}

function compositeEdges(diffused, quantized, mask) {
  const output = diffused.clone();
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] !== 1) continue;
    const pixel = index * 4;
    output.data[pixel] = quantized.data[pixel];
    output.data[pixel + 1] = quantized.data[pixel + 1];
    output.data[pixel + 2] = quantized.data[pixel + 2];
    output.data[pixel + 3] = quantized.data[pixel + 3];
  }
  return output;
}

function renderMaskCanvas(source, mask) {
  const output = source.clone();
  for (let index = 0; index < mask.length; index += 1) {
    const pixel = index * 4;
    if (mask[index] === 1) {
      output.data[pixel] = 255;
      output.data[pixel + 1] = 0;
      output.data[pixel + 2] = 0;
      output.data[pixel + 3] = 255;
    } else {
      const value = Math.round(luma(source.data, pixel) * 0.45 + 120);
      output.data[pixel] = value;
      output.data[pixel + 1] = value;
      output.data[pixel + 2] = value;
      output.data[pixel + 3] = 255;
    }
  }
  return output;
}

async function createContactSheet(files, outputFile) {
  await execFileAsync("magick", [
    "montage",
    ...files,
    "-font",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "-tile",
    "5x1",
    "-geometry",
    "+12+12",
    "-background",
    "#f4f4f4",
    outputFile,
  ]);
}

async function labelImage(inputFile, label, outputFile) {
  await execFileAsync("magick", [
    inputFile,
    "-gravity",
    "northwest",
    "-font",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "-background",
    "white",
    "-splice",
    "0x28",
    "-pointsize",
    "17",
    "-fill",
    "#111111",
    "-annotate",
    "+8+7",
    label,
    outputFile,
  ]);
}

await mkdir(outputDir, { recursive: true });

const summaries = [];
const contactSheets = [];

for (const input of inputs) {
  const base = basename(input, extname(input));
  const source = await readRgba(input, target);
  const adjusted = new MemoryCanvas();
  await applyImageAdjustments(source, adjusted, diffusionOptions);

  const diffused = await renderProcessed(source, diffusionOptions);
  const quantized = await renderProcessed(source, quantizedOptions);

  const mask = buildEdgeMask(adjusted, { threshold: 36, radius: 1 });
  const edgePreserved = compositeEdges(diffused, quantized, mask);
  const maskCanvas = renderMaskCanvas(adjusted, mask);

  const sourceFile = join(outputDir, `${base}-01-source.png`);
  const maskFile = join(outputDir, `${base}-02-edge-mask.png`);
  const diffusedFile = join(outputDir, `${base}-03-current-diffusion.png`);
  const quantizedFile = join(outputDir, `${base}-04-quantized.png`);
  const preservedFile = join(outputDir, `${base}-05-edge-preserved.png`);

  await writePng(source, sourceFile);
  await writePng(maskCanvas, maskFile);
  await writePng(diffused, diffusedFile);
  await writePng(quantized, quantizedFile);
  await writePng(edgePreserved, preservedFile);

  const labeledFiles = [
    [sourceFile, "source"],
    [maskFile, "edge mask"],
    [diffusedFile, "current diffusion"],
    [quantizedFile, "quantization only"],
    [preservedFile, "edge-preserved composite"],
  ];
  const labeledOutputFiles = [];
  for (const [file, label] of labeledFiles) {
    const outputFile = file.replace(/\.png$/, "-labeled.png");
    await labelImage(file, label, outputFile);
    labeledOutputFiles.push(outputFile);
  }

  const contactFile = join(outputDir, `${base}-contact.png`);
  await createContactSheet(labeledOutputFiles, contactFile);
  contactSheets.push(contactFile);

  const protectedPixels = mask.reduce((sum, value) => sum + value, 0);
  summaries.push({
    input,
    contact: contactFile,
    protectedPixelRatio: protectedPixels / mask.length,
  });
}

await writeFile(
  join(outputDir, "summary.json"),
  JSON.stringify(summaries, null, 2),
);

await createContactSheet(contactSheets, join(outputDir, "all-contact.png"));

console.log(`Wrote edge preservation comparisons to ${outputDir}`);
for (const summary of summaries) {
  console.log(
    `${summary.contact} protected=${(
      summary.protectedPixelRatio * 100
    ).toFixed(1)}%`,
  );
}
