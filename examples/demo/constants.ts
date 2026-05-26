import {
  acepPalette,
  aitjcizeSpectra6Palette,
  defaultPalette,
  gameboyPalette,
  spectra6OriginalPalette,
  spectra6OriginalPreviewPalette,
  spectra6legacyPalette,
  spectra6Palette,
} from "../../src";
import type { ImageFitMode, ScreenOrientation } from "./types";

export const DEVICE_TEST_STORAGE_KEY = "epdoptimize:device-test";
export const AUTO_RATING_STORAGE_KEY = "epdoptimize:auto-ratings:v1";

export const SCREEN_RESOLUTIONS = {
  openpaper7: {
    name: "openpaper7",
    label: "7.3 Inch OpenPaper 7",
    width: 800,
    height: 480,
  },
  openpaperL: {
    name: "openpaperL",
    label: "13.3 Inch OpenPaper L",
    width: 1600,
    height: 1200,
  },
};

export const DEFAULT_DEVICE_TEST_CONFIG = {
  screenResolution: "openpaper7",
  orientation: "landscape" as ScreenOrientation,
  imageFit: "contain" as ImageFitMode,
  paperId: "69d59c1a23c3a25ca940ac72",
  apiKey: "",
};

export const DEFAULT_DITHER_OPTIONS = {
  ditheringType: "errorDiffusion",
  errorDiffusionMatrix: "floydSteinberg",
  serpentine: false,
  orderedDitheringMatrix: [4, 4],
  randomDitheringType: "blackAndWhite",
  colorMatching: "rgb",
};

export const PALETTE_OPTIONS = {
  default: {
    label: "Default",
    exportName: "defaultPalette",
    palette: defaultPalette,
  },
  "aitjcize-spectra6": {
    label: "aitjcize Spectra 6",
    exportName: "aitjcizeSpectra6Palette",
    palette: aitjcizeSpectra6Palette,
  },
  spectra6: {
    label: "Spectra 6 (legacy)",
    exportName: "spectra6Palette",
    palette: spectra6Palette,
  },
  "spectra6-original": {
    label: "Spectra 6 Original",
    exportName: "spectra6OriginalPalette",
    palette: spectra6OriginalPalette,
  },
  "spectra6-original-preview": {
    label: "Spectra 6 Original + preview",
    exportName: "spectra6OriginalPreviewPalette",
    palette: spectra6OriginalPreviewPalette,
  },
  spectra6legacy: {
    label: "Spectra 6 Legacy",
    exportName: "spectra6legacyPalette",
    palette: spectra6legacyPalette,
  },
  acep: {
    label: "Gallery",
    exportName: "acepPalette",
    palette: acepPalette,
  },
  gameboy: {
    label: "Game Boy",
    exportName: "gameboyPalette",
    palette: gameboyPalette,
  },
};
