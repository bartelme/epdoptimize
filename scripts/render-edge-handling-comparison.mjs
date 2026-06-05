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
const outputDir = "examples/dither-debug/edge-handling";
const target = { width: 480, height: 320, fit: "contain" };
const font = "/System/Library/Fonts/Supplemental/Arial.ttf";

const inputs = [
  { name: "synthetic-antialias", makeCanvas: makeSyntheticAntialiasCanvas },
  { name: "color_screenshot", file: "examples/sampleImages/color_screenshot.png" },
  { name: "info", file: "examples/sampleImages/info.jpg" },
  { name: "sign", file: "examples/sampleImages/sign.jpg" },
  { name: "the-chap-book", file: "examples/sampleImages/the-chap-book.jpg" },
];

const baseOptions = {
  palette: spectra6OriginalPreviewPalette,
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

function buildEdgeMasks(canvas, { threshold = 42 } = {}) {
  const { width, height, data } = canvas;
  const core = new Uint8Array(width * height);
  const band = new Uint8Array(width * height);
  const directionX = new Float32Array(width * height);
  const directionY = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const center = (y * width + x) * 4;
      if (data[center + 3] <= 16) continue;

      const left = (y * width + x - 1) * 4;
      const right = (y * width + x + 1) * 4;
      const up = ((y - 1) * width + x) * 4;
      const down = ((y + 1) * width + x) * 4;
      const dx = luma(data, right) - luma(data, left);
      const dy = luma(data, down) - luma(data, up);
      const magnitude = Math.sqrt(dx * dx + dy * dy);

      if (magnitude >= threshold) {
        const index = y * width + x;
        core[index] = magnitude >= threshold * 1.45 ? 1 : 0;
        directionX[index] = dx / magnitude;
        directionY[index] = dy / magnitude;
        for (let oy = -1; oy <= 1; oy += 1) {
          for (let ox = -1; ox <= 1; ox += 1) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            band[ny * width + nx] = 1;
          }
        }
      }
    }
  }

  return { core, band, directionX, directionY };
}

function makeGentleEdgePreserve(diffused, quantized, masks) {
  const output = diffused.clone();
  for (let index = 0; index < masks.core.length; index += 1) {
    if (masks.core[index] !== 1) continue;
    const pixel = index * 4;
    output.data[pixel] = quantized.data[pixel];
    output.data[pixel + 1] = quantized.data[pixel + 1];
    output.data[pixel + 2] = quantized.data[pixel + 2];
    output.data[pixel + 3] = quantized.data[pixel + 3];
  }
  return output;
}

function makeEdgeAntialiasBand(adjusted, diffused, quantized, masks) {
  const { width, height } = adjusted;
  const output = diffused.clone();

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x;
      if (masks.band[index] !== 1) continue;

      const pair = getLocalPalettePair(quantized, x, y, 2);
      if (!pair) continue;

      const pixel = index * 4;
      const source = [
        adjusted.data[pixel],
        adjusted.data[pixel + 1],
        adjusted.data[pixel + 2],
      ];
      const coverage = getSegmentCoverage(source, pair[0], pair[1]);
      const residual = getSegmentResidual(source, pair[0], pair[1], coverage);

      if (residual > 95) continue;

      if (coverage <= 0.08 || coverage >= 0.92 || masks.core[index] === 1) {
        output.data[pixel] = quantized.data[pixel];
        output.data[pixel + 1] = quantized.data[pixel + 1];
        output.data[pixel + 2] = quantized.data[pixel + 2];
        output.data[pixel + 3] = quantized.data[pixel + 3];
        continue;
      }

      const threshold = stableNoiseThreshold(x, y);
      const color = threshold < coverage ? pair[1] : pair[0];
      output.data[pixel] = color[0];
      output.data[pixel + 1] = color[1];
      output.data[pixel + 2] = color[2];
      output.data[pixel + 3] = 255;
    }
  }

  return output;
}

function getLocalPalettePair(canvas, x, y, radius) {
  const counts = new Map();
  const { width, height, data } = canvas;

  for (let oy = -radius; oy <= radius; oy += 1) {
    for (let ox = -radius; ox <= radius; ox += 1) {
      const nx = x + ox;
      const ny = y + oy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const pixel = (ny * width + nx) * 4;
      const key = `${data[pixel]},${data[pixel + 1]},${data[pixel + 2]}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const candidates = [...counts.entries()]
    .map(([key, count]) => ({ color: key.split(",").map(Number), count }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 5);
  if (candidates.length < 2) return null;

  let best = null;
  let bestScore = -Infinity;
  for (let a = 0; a < candidates.length; a += 1) {
    for (let b = a + 1; b < candidates.length; b += 1) {
      const left = candidates[a];
      const right = candidates[b];
      const distance = colorDistance(left.color, right.color);
      const score = distance + Math.min(left.count, right.count) * 8;
      if (score > bestScore) {
        bestScore = score;
        best = [left.color, right.color];
      }
    }
  }

  return bestScore >= 45 ? best : null;
}

function getSegmentCoverage(source, a, b) {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const as = [source[0] - a[0], source[1] - a[1], source[2] - a[2]];
  const lengthSq = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
  if (lengthSq <= 0.0001) return 0;
  return clamp((as[0] * ab[0] + as[1] * ab[1] + as[2] * ab[2]) / lengthSq);
}

function getSegmentResidual(source, a, b, coverage) {
  const mix = [
    a[0] + (b[0] - a[0]) * coverage,
    a[1] + (b[1] - a[1]) * coverage,
    a[2] + (b[2] - a[2]) * coverage,
  ];
  return colorDistance(source, mix);
}

function colorDistance(a, b) {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function stableNoiseThreshold(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function renderMaskCanvas(source, masks) {
  const output = source.clone();
  for (let index = 0; index < masks.band.length; index += 1) {
    const pixel = index * 4;
    if (masks.core[index] === 1) {
      output.data[pixel] = 255;
      output.data[pixel + 1] = 0;
      output.data[pixel + 2] = 0;
      output.data[pixel + 3] = 255;
    } else if (masks.band[index] === 1) {
      output.data[pixel] = 255;
      output.data[pixel + 1] = 185;
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
    font,
    "-tile",
    "6x1",
    "-geometry",
    "+12+12",
    "-background",
    "#f4f4f4",
    outputFile,
  ]);
}

async function createZoomContactSheet(variants, crop, outputFile) {
  const zoomedFiles = [];
  for (const variant of variants) {
    const zoomFile = variant.file.replace(/\.png$/, `-${crop.name}-zoom.png`);
    const labeledFile = zoomFile.replace(/\.png$/, "-labeled.png");
    await execFileAsync("magick", [
      variant.file,
      "-crop",
      crop.geometry,
      "+repage",
      "-filter",
      "point",
      "-resize",
      "300%",
      zoomFile,
    ]);
    await labelImage(zoomFile, variant.label, labeledFile);
    zoomedFiles.push(labeledFile);
  }
  await createContactSheet(zoomedFiles, outputFile);
}

async function labelImage(inputFile, label, outputFile) {
  await execFileAsync("magick", [
    inputFile,
    "-gravity",
    "northwest",
    "-font",
    font,
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

function makeSyntheticAntialiasCanvas() {
  const width = target.width;
  const height = target.height;
  const scale = 4;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;

      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const xx = x + (sx + 0.5) / scale;
          const yy = y + (sy + 0.5) / scale;
          const color = syntheticPixel(xx, yy);
          r += color[0];
          g += color[1];
          b += color[2];
        }
      }

      const pixel = (y * width + x) * 4;
      const samples = scale * scale;
      data[pixel] = Math.round(r / samples);
      data[pixel + 1] = Math.round(g / samples);
      data[pixel + 2] = Math.round(b / samples);
      data[pixel + 3] = 255;
    }
  }

  return new MemoryCanvas(width, height, data);
}

function syntheticPixel(x, y) {
  let color = [250, 250, 248];

  if (x >= 250 && x <= 430 && y >= 55 && y <= 255) {
    color = [255, 242, 0];
  }

  const circleDistance = Math.sqrt((x - 135) ** 2 + (y - 150) ** 2);
  if (circleDistance <= 82) {
    color = [235, 10, 20];
  }

  if (Math.abs(y - (0.62 * x - 24)) <= 14 && x >= 250 && x <= 430) {
    color = [0, 55, 220];
  }

  if (
    (Math.abs(y - 75) <= 1.3 && x >= 50 && x <= 210) ||
    (Math.abs(y - 225) <= 1.3 && x >= 50 && x <= 210) ||
    (Math.abs(x - 55) <= 1.3 && y >= 75 && y <= 225) ||
    (Math.abs(x - 205) <= 1.3 && y >= 75 && y <= 225) ||
    (Math.abs(y - (0.84 * x + 14)) <= 1.5 && x >= 62 && x <= 196)
  ) {
    color = [10, 10, 10];
  }

  return color;
}

function clamp(value) {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

await mkdir(outputDir, { recursive: true });

const summaries = [];
const zoomCropsByName = {
  "synthetic-antialias": [
    { name: "circle", geometry: "165x165+35+68" },
    { name: "stripe", geometry: "165x150+270+115" },
  ],
  color_screenshot: [{ name: "text", geometry: "220x220+105+28" }],
  info: [{ name: "graphic", geometry: "230x190+115+112" }],
  sign: [{ name: "labels", geometry: "225x190+120+40" }],
  "the-chap-book": [{ name: "lettering", geometry: "230x170+105+45" }],
};

for (const input of inputs) {
  const name = input.name ?? basename(input.file, extname(input.file));
  const source = input.makeCanvas ? input.makeCanvas() : await readRgba(input.file, target);
  const adjusted = new MemoryCanvas();
  await applyImageAdjustments(source, adjusted, diffusionOptions);

  const current = await renderProcessed(source, diffusionOptions);
  const quantized = await renderProcessed(source, quantizedOptions);
  const masks = buildEdgeMasks(adjusted, { threshold: 42 });
  const gentlePreserve = makeGentleEdgePreserve(current, quantized, masks);
  const antialiasBand = makeEdgeAntialiasBand(
    adjusted,
    current,
    quantized,
    masks,
  );
  const maskCanvas = renderMaskCanvas(adjusted, masks);

  const variants = [
    ["01-source", "source", source],
    ["02-mask", "mask: red core, yellow band", maskCanvas],
    ["03-current", "current diffusion", current],
    ["04-quantized", "quantization only", quantized],
    ["05-gentle-preserve", "gentle edge preserve", gentlePreserve],
    ["06-antialias-band", "anti-tooth edge band", antialiasBand],
  ];

  const labeledFiles = [];
  const variantFiles = [];
  for (const [suffix, label, canvas] of variants) {
    const file = join(outputDir, `${name}-${suffix}.png`);
    const labeled = join(outputDir, `${name}-${suffix}-labeled.png`);
    await writePng(canvas, file);
    await labelImage(file, label, labeled);
    labeledFiles.push(labeled);
    variantFiles.push({ file, label });
  }

  const contact = join(outputDir, `${name}-contact.png`);
  await createContactSheet(labeledFiles, contact);

  const zoomContacts = [];
  for (const crop of zoomCropsByName[name] ?? []) {
    const zoomContact = join(outputDir, `${name}-${crop.name}-zoom-contact.png`);
    await createZoomContactSheet(variantFiles, crop, zoomContact);
    zoomContacts.push(zoomContact);
  }

  const corePixels = masks.core.reduce((sum, value) => sum + value, 0);
  const bandPixels = masks.band.reduce((sum, value) => sum + value, 0);
  summaries.push({
    input: input.file ?? name,
    contact,
    zoomContacts,
    corePixelRatio: corePixels / masks.core.length,
    bandPixelRatio: bandPixels / masks.band.length,
  });
}

await writeFile(
  join(outputDir, "summary.json"),
  JSON.stringify(summaries, null, 2),
);

console.log(`Wrote edge handling comparisons to ${outputDir}`);
for (const summary of summaries) {
  console.log(
    `${summary.contact} core=${(summary.corePixelRatio * 100).toFixed(
      1,
    )}% band=${(summary.bandPixelRatio * 100).toFixed(1)}%`,
  );
}
