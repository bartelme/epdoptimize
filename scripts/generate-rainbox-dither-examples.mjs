import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync } from "node:child_process";

const inputPath = "examples/sampleImages/rainbox-steps.png";
const outputDir = "best-dithering-strategy-results";

const spectra6 = [
  ["black", "#1F2226"],
  ["white", "#B9C7C9"],
  ["blue", "#233F8E"],
  ["green", "#35563A"],
  ["red", "#62201E"],
  ["yellow", "#C1BB1E"],
];

const aitjcizeSpectra6 = [
  ["black", "#020202"],
  ["white", "#BEC8C8"],
  ["blue", "#05409E"],
  ["green", "#27663C"],
  ["red", "#871300"],
  ["yellow", "#CDCA00"],
];

const floydSteinberg = [
  { dx: 1, dy: 0, factor: 7 / 16 },
  { dx: -1, dy: 1, factor: 3 / 16 },
  { dx: 0, dy: 1, factor: 5 / 16 },
  { dx: 1, dy: 1, factor: 1 / 16 },
];

function quantizeOnly(source, palette, colorMatching) {
  const output = new Uint8ClampedArray(source.data);
  for (let index = 0; index < output.length; index += 4) {
    const color = palette[findClosestIndex(
      output[index],
      output[index + 1],
      output[index + 2],
      output[index],
      output[index + 1],
      output[index + 2],
      palette,
      colorMatching
    )].rgb;
    output[index] = color[0];
    output[index + 1] = color[1];
    output[index + 2] = color[2];
    output[index + 3] = 255;
  }
  return output;
}

function clampedErrorDiffusion(source, palette, colorMatching) {
  const sourceData = new Uint8ClampedArray(source.data);
  const data = new Uint8ClampedArray(source.data);
  const { width, height } = source;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const oldR = data[index];
      const oldG = data[index + 1];
      const oldB = data[index + 2];
      const color = palette[findClosestIndex(
        oldR,
        oldG,
        oldB,
        sourceData[index],
        sourceData[index + 1],
        sourceData[index + 2],
        palette,
        colorMatching
      )].rgb;

      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;

      const errorR = oldR - color[0];
      const errorG = oldG - color[1];
      const errorB = oldB - color[2];

      for (const diffusion of floydSteinberg) {
        const nx = x + diffusion.dx;
        const ny = y + diffusion.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nextIndex = (ny * width + nx) * 4;
        data[nextIndex] = clampByte(data[nextIndex] + errorR * diffusion.factor);
        data[nextIndex + 1] = clampByte(data[nextIndex + 1] + errorG * diffusion.factor);
        data[nextIndex + 2] = clampByte(data[nextIndex + 2] + errorB * diffusion.factor);
      }
    }
  }

  return data;
}

function floatErrorDiffusion(source, palette, colorMatching, options = {}) {
  const sourceData = source.data;
  const output = new Uint8ClampedArray(sourceData.length);
  const work = new Float64Array(source.width * source.height * 3);
  const { width, height } = source;
  const { serpentine = false, normalizeEdges = false, clampWorking = false } =
    options;

  for (let index = 0, workIndex = 0; index < sourceData.length; index += 4) {
    work[workIndex] = sourceData[index];
    work[workIndex + 1] = sourceData[index + 1];
    work[workIndex + 2] = sourceData[index + 2];
    workIndex += 3;
  }

  for (let y = 0; y < height; y += 1) {
    const reverse = serpentine && y % 2 === 1;
    const xStart = reverse ? width - 1 : 0;
    const xEnd = reverse ? -1 : width;
    const xStep = reverse ? -1 : 1;

    for (let x = xStart; x !== xEnd; x += xStep) {
      const pixelOffset = y * width + x;
      const workIndex = pixelOffset * 3;
      const sourceIndex = pixelOffset * 4;
      const oldR = work[workIndex];
      const oldG = work[workIndex + 1];
      const oldB = work[workIndex + 2];
      const color = palette[findClosestIndex(
        oldR,
        oldG,
        oldB,
        sourceData[sourceIndex],
        sourceData[sourceIndex + 1],
        sourceData[sourceIndex + 2],
        palette,
        colorMatching
      )].rgb;

      output[sourceIndex] = color[0];
      output[sourceIndex + 1] = color[1];
      output[sourceIndex + 2] = color[2];
      output[sourceIndex + 3] = 255;

      const errorR = oldR - color[0];
      const errorG = oldG - color[1];
      const errorB = oldB - color[2];

      const validDiffusions = [];
      let validFactorTotal = 0;
      for (const diffusion of floydSteinberg) {
        const nx = x + (reverse ? -diffusion.dx : diffusion.dx);
        const ny = y + diffusion.dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        validDiffusions.push({ diffusion, nx, ny });
        validFactorTotal += diffusion.factor;
      }

      for (const { diffusion, nx, ny } of validDiffusions) {
        const nextWorkIndex = (ny * width + nx) * 3;
        const factor =
          normalizeEdges && validFactorTotal > 0
            ? diffusion.factor / validFactorTotal
            : diffusion.factor;
        work[nextWorkIndex] += errorR * factor;
        work[nextWorkIndex + 1] += errorG * factor;
        work[nextWorkIndex + 2] += errorB * factor;
        if (clampWorking) {
          work[nextWorkIndex] = clamp(work[nextWorkIndex], 0, 255);
          work[nextWorkIndex + 1] = clamp(work[nextWorkIndex + 1], 0, 255);
          work[nextWorkIndex + 2] = clamp(work[nextWorkIndex + 2], 0, 255);
        }
      }
    }
  }

  return output;
}

function hueMixDither(source, palette) {
  const output = new Uint8ClampedArray(source.data.length);
  const paletteDetails = palette.map((entry) => ({
    ...entry,
    hue: getHue(entry.rgb[0], entry.rgb[1], entry.rgb[2]),
    luma: luma(entry.rgb[0], entry.rgb[1], entry.rgb[2]),
    saturation: getSaturation(entry.rgb[0], entry.rgb[1], entry.rgb[2]),
  }));
  const chromatic = paletteDetails
    .filter((entry) => entry.saturation >= 0.22 && entry.luma >= 24)
    .sort((left, right) => left.hue - right.hue);
  const neutral = paletteDetails.filter((entry) => entry.saturation < 0.18);
  const white = (neutral.length ? neutral : paletteDetails).reduce(
    (lightest, entry) => (!lightest || entry.luma > lightest.luma ? entry : lightest),
    null
  );

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const sourceIndex = (y * source.width + x) * 4;
      const r = source.data[sourceIndex];
      const g = source.data[sourceIndex + 1];
      const b = source.data[sourceIndex + 2];
      const saturation = getSaturation(r, g, b);
      let color;

      if (chromatic.length < 2 || !white || saturation < 0.08) {
        color = palette[findClosestIndex(r, g, b, r, g, b, palette, "chroma")].rgb;
      } else {
        const targetHue = getHue(r, g, b);
        const [left, right, t] = getHueNeighbors(targetHue, chromatic);
        const hueMix = smoothstep(0, 1, t);
        const mixedLuma = left.luma * (1 - hueMix) + right.luma * hueMix;
        const targetLuma = luma(r, g, b);
        const saturationCoverage = smoothstep(0.08, 0.55, saturation);
        const lumaCoverage =
          white.luma > mixedLuma
            ? clamp((white.luma - targetLuma) / (white.luma - mixedLuma), 0, 1)
            : 0;
        const coverage = clamp(Math.max(saturationCoverage, lumaCoverage), 0, 1);
        const whiteWeight = 1 - coverage;
        const leftWeight = coverage * (1 - hueMix);
        const threshold = hashUnit(x, y);
        if (threshold < whiteWeight) color = white.rgb;
        else if (threshold < whiteWeight + leftWeight) color = left.rgb;
        else color = right.rgb;
      }

      output[sourceIndex] = color[0];
      output[sourceIndex + 1] = color[1];
      output[sourceIndex + 2] = color[2];
      output[sourceIndex + 3] = 255;
    }
  }

  return output;
}

function orderedBayerDither(source, palette, colorMatching, strength = 80) {
  const output = new Uint8ClampedArray(source.data.length);
  const matrix = [
    [0, 8, 2, 10],
    [12, 4, 14, 6],
    [3, 11, 1, 9],
    [15, 7, 13, 5],
  ];

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const index = (y * source.width + x) * 4;
      const threshold = ((matrix[y % 4][x % 4] + 0.5) / 16 - 0.5) * strength;
      const r = clamp(source.data[index] + threshold, 0, 255);
      const g = clamp(source.data[index + 1] + threshold, 0, 255);
      const b = clamp(source.data[index + 2] + threshold, 0, 255);
      const color =
        palette[
          findClosestIndex(
            r,
            g,
            b,
            source.data[index],
            source.data[index + 1],
            source.data[index + 2],
            palette,
            colorMatching
          )
        ].rgb;

      output[index] = color[0];
      output[index + 1] = color[1];
      output[index + 2] = color[2];
      output[index + 3] = 255;
    }
  }

  return output;
}

function findClosestIndex(r, g, b, sourceR, sourceG, sourceB, palette, mode) {
  const sourceSaturation = mode === "chroma" ? getSaturation(sourceR, sourceG, sourceB) : 0;
  const sourceHue = mode === "chroma" && sourceSaturation >= 0.12
    ? getHue(sourceR, sourceG, sourceB)
    : null;
  let closestIndex = 0;
  let closestDistance = Infinity;

  for (let index = 0; index < palette.length; index += 1) {
    const color = palette[index].rgb;
    const dr = color[0] - r;
    const dg = color[1] - g;
    const db = color[2] - b;
    let distance = Math.sqrt(dr * dr + dg * dg + db * db);

    if (mode === "chroma") {
      const paletteSaturation = getSaturation(color[0], color[1], color[2]);
      if (sourceSaturation >= 0.12 && paletteSaturation <= 0.12) {
        distance += Math.min(330, sourceSaturation * 1300);
      }
      if (sourceHue !== null && paletteSaturation > 0.12) {
        distance += getHueDistance(sourceHue, getHue(color[0], color[1], color[2])) * 3;
      }
    }

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  return closestIndex;
}

function getColorStats(data, palette) {
  const counts = new Map(palette.map((color) => [color.name, 0]));
  for (let index = 0; index < data.length; index += 4) {
    const color = palette.find(
      (entry) =>
        entry.rgb[0] === data[index] &&
        entry.rgb[1] === data[index + 1] &&
        entry.rgb[2] === data[index + 2]
    );
    if (color) counts.set(color.name, counts.get(color.name) + 1);
  }
  return [...counts.entries()];
}

function formatStats(stats) {
  const total = stats.reduce((sum, [, count]) => sum + count, 0);
  return stats
    .map(([name, count]) => `${name}:${((count / total) * 100).toFixed(1)}%`)
    .join(" ");
}

function statsTableRow(filename, stats) {
  const total = stats.reduce((sum, [, count]) => sum + count, 0);
  return `| ${filename} | ${stats
    .map(([name, count]) => `${name} ${((count / total) * 100).toFixed(1)}%`)
    .join("<br>")} |`;
}

function getWhitePercent(stats) {
  const total = stats.reduce((sum, [, count]) => sum + count, 0);
  const white = stats.find(([name]) => name === "white")?.[1] ?? 0;
  return total === 0 ? 0 : (white / total) * 100;
}

function getPaletteEntropy(stats) {
  const total = stats.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) return 0;
  const maxEntropy = Math.log2(stats.length);
  const entropy = stats.reduce((sum, [, count]) => {
    if (count === 0) return sum;
    const p = count / total;
    return sum - p * Math.log2(p);
  }, 0);
  return maxEntropy === 0 ? 0 : entropy / maxEntropy;
}

function scoreStrategy(stats, variant) {
  const whitePercent = getWhitePercent(stats);
  const entropy = getPaletteEntropy(stats);
  const chromaBonus = variant.name.includes("chroma") ? 0.08 : 0;
  const orderedPenalty = variant.name.includes("bayer") ? 0.06 : 0;
  const whitePenalty = Math.abs(whitePercent - 22) / 100;
  return entropy * 0.55 + chromaBonus - orderedPenalty - whitePenalty * 0.45;
}

function makeContactSheet(images, width, height) {
  const output = new Uint8ClampedArray(width * images.length * height * 4);
  const sheetWidth = width * images.length;
  images.forEach((image, sheetIndex) => {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = (y * width + x) * 4;
        const targetIndex = (y * sheetWidth + sheetIndex * width + x) * 4;
        output[targetIndex] = image[sourceIndex];
        output[targetIndex + 1] = image[sourceIndex + 1];
        output[targetIndex + 2] = image[sourceIndex + 2];
        output[targetIndex + 3] = image[sourceIndex + 3];
      }
    }
  });
  return output;
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function getSaturation(r, g, b) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  return max === 0 ? 0 : (max - min) / max;
}

function getHue(r, g, b) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  if (delta === 0) return 0;

  let hue;
  if (max === red) hue = 60 * (((green - blue) / delta) % 6);
  else if (max === green) hue = 60 * ((blue - red) / delta + 2);
  else hue = 60 * ((red - green) / delta + 4);
  return hue < 0 ? hue + 360 : hue;
}

function getHueDistance(a, b) {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

function getHueNeighbors(targetHue, chromatic) {
  for (let index = 0; index < chromatic.length; index += 1) {
    const left = chromatic[index];
    const right = chromatic[(index + 1) % chromatic.length];
    const span = positiveHueDelta(left.hue, right.hue);
    const offset = positiveHueDelta(left.hue, targetHue);
    if (offset <= span) return [left, right, span === 0 ? 0 : offset / span];
  }
  return [chromatic[0], chromatic[0], 0];
}

function positiveHueDelta(from, to) {
  return (to - from + 360) % 360;
}

function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function hashUnit(x, y) {
  const value = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return value - Math.floor(value);
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8);
  if (signature.toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Not a PNG file.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += length + 12;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data[8];
      colorType = data[9];
      if (bitDepth !== 8 || colorType !== 6) {
        throw new Error(`Only 8-bit RGBA PNGs are supported. Got bitDepth=${bitDepth}, colorType=${colorType}.`);
      }
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (colorType !== 6) throw new Error("Missing RGBA IHDR.");

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const data = new Uint8ClampedArray(width * height * 4);
  let sourceOffset = 0;
  let previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const current = new Uint8Array(stride);
    const scanline = inflated.subarray(sourceOffset, sourceOffset + stride);
    sourceOffset += stride;

    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? current[x - bytesPerPixel] : 0;
      const up = previous[x] ?? 0;
      const upperLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) predictor = paeth(left, up, upperLeft);
      else if (filter !== 0) throw new Error(`Unsupported PNG filter ${filter}.`);
      current[x] = (scanline[x] + predictor) & 255;
    }

    data.set(current, y * stride);
    previous = current;
  }

  return { width, height, data };
}

function encodePng(width, height, data) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    raw[rowOffset] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * stride, stride).copy(raw, rowOffset + 1);
  }

  const chunks = [
    makeChunk("IHDR", makeIhdr(width, height)),
    makeChunk("IDAT", deflateSync(raw)),
    makeChunk("IEND", Buffer.alloc(0)),
  ];
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), ...chunks]);
}

function makeIhdr(width, height) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(width, 0);
  data.writeUInt32BE(height, 4);
  data[8] = 8;
  data[9] = 6;
  data[10] = 0;
  data[11] = 0;
  data[12] = 0;
  return data;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function main() {
  const png = decodePng(readFileSync(inputPath));
  mkdirSync(dirname(join(outputDir, ".keep")), { recursive: true });
  const readme = [
    "# Best Dithering Strategy Results",
    "",
    `Input: \`${inputPath}\``,
    "",
    "Palette colors are the calibrated Spectra 6 preview colors used for matching. The sample is a synthetic rainbow gradient, so the key failure mode is RGB matching choosing calibrated white for bright saturated colors.",
    "",
    "Variants:",
    "",
    "- `00-quantization-only-rgb`: nearest RGB palette color, no diffusion baseline.",
    "- `01-imagemagick-like-fs-rgb`: Floyd-Steinberg diffusing into an 8-bit clamped image buffer; closest to ImageMagick on this sample.",
    "- `02-fs-standard-float-rgb`: Floyd-Steinberg with a floating-point working buffer.",
    "- `03-fs-serpentine-float-rgb`: floating-point Floyd-Steinberg with alternating row direction.",
    "- `04-fs-serpentine-float-chroma`: serpentine Floyd-Steinberg with chroma-aware palette matching.",
    "- `05-fs-standard-float-chroma`: standard scanline Floyd-Steinberg with chroma-aware palette matching.",
    "- `06-ordered-bayer-rgb`: centered 4x4 Bayer ordered dithering with RGB matching.",
    "- `07-ordered-bayer-chroma`: centered 4x4 Bayer ordered dithering with chroma-aware matching.",
    "- `08-hue-mix`: hue-neighbor mixing designed for smooth synthetic hue ramps.",
    "- `09-imagemagick-fs-rgb`: ImageMagick `-dither FloydSteinberg -remap` with the same palette.",
    "",
    "Ranking score is a heuristic for this sample: it rewards balanced palette use, penalizes excess white, gives a small bonus to chroma-aware matching, and slightly penalizes visible ordered grid texture.",
    "",
  ];

  for (const [paletteName, paletteEntries] of [
    ["spectra6", spectra6],
    ["aitjcize-spectra6", aitjcizeSpectra6],
  ]) {
    const palette = paletteEntries.map(([name, hex]) => ({
      name,
      rgb: hexToRgb(hex),
    }));

    const variants = [
      {
        name: "00-quantization-only-rgb",
        image: quantizeOnly(png, palette, "rgb"),
      },
      {
        name: "01-imagemagick-like-fs-rgb",
        image: clampedErrorDiffusion(png, palette, "rgb"),
      },
      {
        name: "02-fs-standard-float-rgb",
        image: floatErrorDiffusion(png, palette, "rgb"),
      },
      {
        name: "03-fs-serpentine-float-rgb",
        image: floatErrorDiffusion(png, palette, "rgb", { serpentine: true }),
      },
      {
        name: "04-fs-serpentine-float-chroma",
        image: floatErrorDiffusion(png, palette, "chroma", {
          serpentine: true,
        }),
      },
      {
        name: "05-fs-standard-float-chroma",
        image: floatErrorDiffusion(png, palette, "chroma"),
      },
      {
        name: "06-ordered-bayer-rgb",
        image: orderedBayerDither(png, palette, "rgb"),
      },
      {
        name: "07-ordered-bayer-chroma",
        image: orderedBayerDither(png, palette, "chroma"),
      },
      {
        name: "08-hue-mix",
        image: hueMixDither(png, palette),
      },
    ];

    const results = [];
    const contactImages = [];
    readme.push(
      `## ${paletteName}`,
      "",
      "| File | White | Entropy | Score | Color usage |",
      "| --- | ---: | ---: | ---: | --- |"
    );
    for (const variant of variants) {
      const stats = getColorStats(variant.image, palette);
      const filename = `${paletteName}-${variant.name}.png`;
      writeFileSync(
        join(outputDir, filename),
        encodePng(png.width, png.height, variant.image)
      );
      contactImages.push(variant.image);
      console.log(`${filename} ${formatStats(stats)}`);
      const whitePercent = getWhitePercent(stats);
      const entropy = getPaletteEntropy(stats);
      const score = scoreStrategy(stats, variant);
      results.push({ filename, whitePercent, entropy, score });
      readme.push(
        `| ${filename} | ${whitePercent.toFixed(1)}% | ${entropy.toFixed(
          3
        )} | ${score.toFixed(3)} | ${stats
          .map(
            ([name, count]) =>
              `${name} ${((count / (png.width * png.height)) * 100).toFixed(
                1
              )}%`
          )
          .join("<br>")} |`
      );
    }

    const imageMagickFilename = `${paletteName}-09-imagemagick-fs-rgb.png`;
    const imageMagickPath = join(outputDir, imageMagickFilename);
    if (writeImageMagickFloydSteinberg(inputPath, imageMagickPath, paletteName, palette)) {
      const imageMagickImage = decodePng(readFileSync(imageMagickPath));
      const stats = getColorStats(imageMagickImage.data, palette);
      contactImages.push(imageMagickImage.data);
      const whitePercent = getWhitePercent(stats);
      const entropy = getPaletteEntropy(stats);
      const score = scoreStrategy(stats, { name: imageMagickFilename });
      results.push({ filename: imageMagickFilename, whitePercent, entropy, score });
      readme.push(
        `| ${imageMagickFilename} | ${whitePercent.toFixed(
          1
        )}% | ${entropy.toFixed(3)} | ${score.toFixed(3)} | ${stats
          .map(
            ([name, count]) =>
              `${name} ${((count / (png.width * png.height)) * 100).toFixed(
                1
              )}%`
          )
          .join("<br>")} |`
      );
    }

    results.sort((left, right) => right.score - left.score);
    readme.push(
      "",
      `Best heuristic pick: \`${results[0].filename}\``,
      `Most conservative FS pick: \`${paletteName}-04-fs-serpentine-float-chroma.png\``,
      ""
    );
    readme.push("");

    writeFileSync(
      join(outputDir, `${paletteName}-comparison.png`),
      encodePng(
        png.width * contactImages.length,
        png.height,
        makeContactSheet(
          contactImages,
          png.width,
          png.height
        )
      )
    );
  }

  writeFileSync(join(outputDir, "README.md"), `${readme.join("\n")}\n`);
}

main();

function writeImageMagickFloydSteinberg(input, output, paletteName, palette) {
  const palettePath = join(outputDir, `${paletteName}-palette.ppm`);
  writePalettePpm(palettePath, palette);
  try {
    execFileSync("magick", [
      input,
      "-alpha",
      "remove",
      "-alpha",
      "off",
      "-dither",
      "FloydSteinberg",
      "-remap",
      palettePath,
      `PNG32:${output}`,
    ]);
    return true;
  } catch {
    return false;
  }
}

function writePalettePpm(path, palette) {
  const pixels = palette.map((entry) => entry.rgb.join(" ")).join("\n");
  writeFileSync(path, `P3\n${palette.length} 1\n255\n${pixels}\n`);
}
