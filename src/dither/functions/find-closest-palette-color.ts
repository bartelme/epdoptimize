import {
  deltaE,
  rgbToLab,
  type ColorMatchingMode,
  type RGB,
  type RGBA,
} from "../processing";

const withAlpha = (color: RGB | RGBA): RGBA => [
  color[0],
  color[1],
  color[2],
  (color as RGBA)[3] ?? 255,
];

const findClosestPaletteColor = (
  pixel: RGB | RGBA,
  colorPalette: RGB[],
  colorMatching: ColorMatchingMode = "rgb",
  sourcePixel: RGB | RGBA = pixel
): RGBA => {
  if (!colorPalette.length) return withAlpha(pixel);
  const pixelLab =
    colorMatching === "lab" ? rgbToLab(pixel[0], pixel[1], pixel[2]) : null;
  const sourceSaturation =
    colorMatching === "chroma" ? getSaturation(sourcePixel) : 0;
  const sourceHue =
    colorMatching === "chroma" && sourceSaturation >= 0.12
      ? getHue(sourcePixel)
      : null;

  const colors = colorPalette.map((color) => {
    const paletteSaturation = getSaturation(color);
    return {
      distance:
        colorMatching === "lab" && pixelLab
          ? deltaE(rgbToLab(...color), pixelLab)
          : distanceInColorSpace(color, pixel) +
            getChromaPenalty(
              sourceSaturation,
              paletteSaturation,
              colorMatching
            ) +
            getHuePenalty(sourceHue, color, paletteSaturation, colorMatching),
      color,
    };
  });

  let closestColor: { distance: number; color: RGB };
  colors.forEach((color) => {
    if (!closestColor) {
      closestColor = color;
    } else {
      if (color.distance < closestColor.distance) {
        closestColor = color;
      }
    }
  });

  return withAlpha(closestColor.color);
};

const getChromaPenalty = (
  pixelSaturation: number,
  paletteSaturation: number,
  colorMatching: ColorMatchingMode
) => {
  if (colorMatching !== "chroma") return 0;
  if (pixelSaturation < 0.12 || paletteSaturation > 0.12) return 0;

  return Math.min(330, pixelSaturation * 1300);
};

const getHuePenalty = (
  sourceHue: number | null,
  color: RGB,
  paletteSaturation: number,
  colorMatching: ColorMatchingMode
) => {
  if (colorMatching !== "chroma" || sourceHue === null) return 0;
  if (paletteSaturation <= 0.12) return 0;

  return getHueDistance(sourceHue, getHue(color)) * 3;
};

const getSaturation = (color: RGB | RGBA) => {
  const max = Math.max(color[0], color[1], color[2]) / 255;
  const min = Math.min(color[0], color[1], color[2]) / 255;

  return max === 0 ? 0 : (max - min) / max;
};

const getHue = (color: RGB | RGBA) => {
  const red = color[0] / 255;
  const green = color[1] / 255;
  const blue = color[2] / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  if (delta === 0) return 0;

  let hue: number;
  if (max === red) {
    hue = 60 * (((green - blue) / delta) % 6);
  } else if (max === green) {
    hue = 60 * ((blue - red) / delta + 2);
  } else {
    hue = 60 * ((red - green) / delta + 4);
  }

  return hue < 0 ? hue + 360 : hue;
};

const getHueDistance = (hueA: number, hueB: number) => {
  const delta = Math.abs(hueA - hueB) % 360;
  return Math.min(delta, 360 - delta);
};

const distanceInColorSpace = (color1: RGB, color2: RGB | RGBA) => {
  // Currenlty ignores alpha

  // Luminosity needs to be accounted for, for better results.
  // var lumR = .2126,
  //     lumG = .7152,
  //     lumB = .0722

  // const max = 255

  // const averageMax = Math.sqrt(lumR * max * max + lumG * max * max + lumB * max * max) // I Dont understand this

  const r = color1[0] - color2[0];
  const g = color1[1] - color2[1];
  const b = color1[2] - color2[2];

  const distance = Math.sqrt(r * r + g * g + b * b);
  return distance;
};

export default findClosestPaletteColor;
