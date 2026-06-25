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
    for (let col = 0; col < destCanvas.width; col++) {

      // --- TOP HALF: left columns ---
      const srcIdxLeft = (row * width + col) * 4;
      const dstIdxTop  = (row * destCanvas.width + col) * 4;

      result.data[dstIdxTop + 0] = data[srcIdxLeft + 0];        // R
      result.data[dstIdxTop + 1] = data[srcIdxLeft + 1];        // G
      result.data[dstIdxTop + 2] = data[srcIdxLeft + 2];        // B
      result.data[dstIdxTop + 3] = data[srcIdxLeft + 3];        // A

      // --- BOTTOM HALF: right columns ---
      const srcIdxRight = (row * width + col + destCanvas.width) * 4;
      const dstIdxBot   = ((row + height) * destCanvas.width + col) * 4;

      result.data[dstIdxBot + 0] = data[srcIdxRight + 0];       // R
      result.data[dstIdxBot + 1] = data[srcIdxRight + 1];       // G
      result.data[dstIdxBot + 2] = data[srcIdxRight + 2];       // B
      result.data[dstIdxBot + 3] = data[srcIdxRight + 3];       // A
    }
  }
  destCtx.putImageData(result, 0, 0);
};
