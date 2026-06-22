import type { CanvasLike } from "../dither/dither";
import type { PaletteColorEntry } from "../dither/functions/palette-order";

type RGB = [number, number, number];

export interface ReplaceColorsOptions {
  originalColors: string[];
  replaceColors: string[];
}

export type ReplaceColorsPalette = Pick<
  PaletteColorEntry,
  "color" | "deviceColor"
>[];

const hexToRgb = (h: string): RGB => {
  const rgb = h
    .replace(
      /^#?([a-f\d])([a-f\d])([a-f\d])$/i,
      (_, r, g, b) => "#" + r + r + g + g + b + b
    )
    .substring(1)
    .match(/.{2}/g)
    ?.map((x) => parseInt(x, 16));

  if (!rgb || rgb.length !== 3 || rgb.some((channel) => Number.isNaN(channel))) {
    throw new Error(`Invalid hex color: ${h}`);
  }

  return rgb as RGB;
};

const colorKey = (rgb: RGB) => (rgb[0] << 16) | (rgb[1] << 8) | rgb[2];

const isPaletteEntryArray = (
  palette: ReplaceColorsPalette | ReplaceColorsOptions
): palette is ReplaceColorsPalette =>
  Array.isArray(palette) &&
  palette.every(
    (entry) =>
      typeof entry === "object" &&
      entry !== null &&
      "color" in entry &&
      "deviceColor" in entry
  );

const createReplacementMap = (
  palette: ReplaceColorsPalette | ReplaceColorsOptions
) => {
  const entries = isPaletteEntryArray(palette)
    ? palette
    : palette.originalColors.map((color, index) => ({
        color,
        deviceColor: palette.replaceColors[index],
      }));

  return new Map<number, RGB>(
    entries
      .filter((entry) => Boolean(entry.deviceColor))
      .map((entry) => [
        colorKey(hexToRgb(entry.color)),
        hexToRgb(entry.deviceColor),
      ])
  );
};

export const replaceColors = (
  fromCanvas: CanvasLike,
  destCanvas: CanvasLike,
  palette: ReplaceColorsPalette | ReplaceColorsOptions
) => {
  const fromCtx = fromCanvas.getContext("2d");
  if (!fromCtx) return;

  const width = fromCanvas.width;
  const height = fromCanvas.height;

  const destCtx = destCanvas.getContext("2d");
  if (!destCtx) return;

  const imageData = fromCtx.getImageData(0, 0, width, height);
  const data = imageData.data;
  let errorColors = 0;
  const replacementMap = createReplacementMap(palette);

  for (let i = 0; i < data.length; i += 4) {
    const replacement = replacementMap.get(
      (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
    );

    if (!replacement) {
      errorColors++;
      continue;
    }

    data[i] = replacement[0];
    data[i + 1] = replacement[1];
    data[i + 2] = replacement[2];
  }

  if (errorColors > 0) {
    console.warn(
      `replaceColors: ${errorColors} pixels were not replaced. Check if the colors match exactly.`
    );
  }

  destCanvas.width = width/2;
  destCanvas.height = height*2;
  const result = new ImageData(destCanvas.width, destCanvas.height);

  for (let row = 0; row < height; row++) {
    const flippedRow = height - 1 - row;                      // mirror row index

    for (let col = 0; col < destCanvas.width; col++) {

      // --- TOP HALF: right columns, upside down ---
      const srcCol = col + destCanvas.width;
      const srcIdx = (flippedRow * width + srcCol) * 4;       // read from flipped row
      const dstIdx = (row * destCanvas.width + col) * 4;

      result.data[dstIdx + 0] = data[srcIdx + 0];             // R
      result.data[dstIdx + 1] = data[srcIdx + 1];             // G
      result.data[dstIdx + 2] = data[srcIdx + 2];             // B
      result.data[dstIdx + 3] = data[srcIdx + 3];             // A

      // --- BOTTOM HALF: left columns, upside down ---
      const srcIdx2 = (flippedRow * width + col) * 4;         // read from flipped row
      const dstIdx2 = ((row + height) * destCanvas.width + col) * 4;

      result.data[dstIdx2 + 0] = data[srcIdx2 + 0];           // R
      result.data[dstIdx2 + 1] = data[srcIdx2 + 1];           // G
      result.data[dstIdx2 + 2] = data[srcIdx2 + 2];           // B
      result.data[dstIdx2 + 3] = data[srcIdx2 + 3];           // A
    }
  }
  destCtx.putImageData(result, 0, 0);
};
