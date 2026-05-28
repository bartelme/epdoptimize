import {
  ditherImage,
  suggestLayeredCanvasProcessingOptions,
  suggestCanvasProcessingOptions,
  type AutoProcessingIntent,
  type DitherImageOptions,
  type ImageKind,
  type PaletteColorEntry,
  type ProcessingSuggestion,
  type ToneMappingOptions,
} from "../src";
import { PALETTE_OPTIONS, SCREEN_RESOLUTIONS } from "./demo/constants";
import type { ImageFitMode, ScreenOrientation } from "./demo/types";

type VoteChoice = "left" | "right" | "tie" | "skip";
type SampleMode = "all" | "selected";
type ComparisonMode =
  | "legacyLayered"
  | "autoBaseline"
  | "autoToneContrast"
  | "autoWhiteGuard"
  | "chromaRgb"
  | "hueMixRgb"
  | "magentaRgb"
  | "all";

interface ImageSource {
  id: string;
  name: string;
  url: string;
  uploaded?: boolean;
  generated?: boolean;
}

interface RatingVariant {
  id: string;
  label: string;
  ditherOptions: Partial<DitherImageOptions>;
}

interface PaletteProfile {
  colorCount: number;
  lumaRange: number;
  averageSaturation: number;
}

interface PairwiseVoteRecord {
  id: string;
  createdAt: string;
  imageId: string;
  imageName: string;
  paletteKey: string;
  screenResolution: string;
  orientation: ScreenOrientation;
  imageFit: ImageFitMode;
  comparisonMode?: ComparisonMode;
  leftVariantId: string;
  rightVariantId: string;
  winner: VoteChoice;
  leftOptions: Record<string, unknown>;
  rightOptions: Record<string, unknown>;
  imageKind: ProcessingSuggestion["imageKind"];
  classification: ProcessingSuggestion["classification"];
}

interface CurrentPair {
  image: ImageSource;
  suggestion: ProcessingSuggestion;
  left: RatingVariant;
  right: RatingVariant;
}

type ProbeKind = "softRainbow" | "magentaAzureBands" | "pastelMagenta";

const STORAGE_KEY = "epdoptimize:pairwise-ratings:v1";
const RATING_ENDPOINT = `${import.meta.env.BASE_URL}__epdoptimize-rating-votes`;
const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

const comparisonModeSelect = $("comparisonModeSelect") as HTMLSelectElement;
const sampleModeSelect = $("sampleModeSelect") as HTMLSelectElement;
const sampleSelect = $("sampleSelect") as HTMLSelectElement;
const fileInput = $("fileInput") as HTMLInputElement;
const paletteSelect = $("paletteSelect") as HTMLSelectElement;
const screenSelect = $("screenSelect") as HTMLSelectElement;
const orientationSelect = $("orientationSelect") as HTMLSelectElement;
const fitSelect = $("fitSelect") as HTMLSelectElement;
const statusLine = $("statusLine") as HTMLParagraphElement;
const exportButton = $("exportButton") as HTMLButtonElement;
const clearButton = $("clearButton") as HTMLButtonElement;
const imageTitle = $("imageTitle") as HTMLHeadingElement;
const pairSummary = $("pairSummary") as HTMLParagraphElement;
const leftDetails = $("leftDetails") as HTMLSpanElement;
const rightDetails = $("rightDetails") as HTMLSpanElement;
const leftCanvas = $("leftCanvas") as HTMLCanvasElement;
const rightCanvas = $("rightCanvas") as HTMLCanvasElement;
const leftButton = $("leftButton") as HTMLButtonElement;
const rightButton = $("rightButton") as HTMLButtonElement;
const tieButton = $("tieButton") as HTMLButtonElement;
const nextButton = $("nextButton") as HTMLButtonElement;

const sampleImages = import.meta.glob("./sampleImages/*.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function createProbeImageUrl(kind: ProbeKind) {
  const body =
    kind === "softRainbow"
      ? `<defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#ff5a7a"/><stop offset=".25" stop-color="#f4d24a"/><stop offset=".5" stop-color="#3bcf76"/><stop offset=".75" stop-color="#3a88ff"/><stop offset="1" stop-color="#c35cff"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><rect x="80" y="80" width="640" height="320" rx="36" fill="#ffffff" opacity=".22"/>`
      : kind === "magentaAzureBands"
        ? `<defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#f037a6"/><stop offset=".5" stop-color="#7b68ff"/><stop offset="1" stop-color="#2ac5e8"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><g opacity=".35"><rect x="0" y="72" width="800" height="42" fill="#fff"/><rect x="0" y="212" width="800" height="42" fill="#111"/><rect x="0" y="352" width="800" height="42" fill="#fff"/></g>`
        : `<rect width="100%" height="100%" fill="#f7e9f2"/><circle cx="250" cy="240" r="190" fill="#ee79b8"/><circle cx="520" cy="240" r="175" fill="#7fd4ef" opacity=".86"/><rect x="90" y="360" width="620" height="70" fill="#fff6b8" opacity=".9"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="480" viewBox="0 0 800 480">${body}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const generatedProbeImages: ImageSource[] = [
  {
    id: "probe:soft-rainbow",
    name: "Probe soft rainbow",
    url: createProbeImageUrl("softRainbow"),
    generated: true,
  },
  {
    id: "probe:magenta-azure-bands",
    name: "Probe magenta azure bands",
    url: createProbeImageUrl("magentaAzureBands"),
    generated: true,
  },
  {
    id: "probe:pastel-magenta",
    name: "Probe pastel magenta",
    url: createProbeImageUrl("pastelMagenta"),
    generated: true,
  },
];

let imageSources: ImageSource[] = [];
let uploadedImage: ImageSource | null = null;
let currentPair: CurrentPair | null = null;
let renderToken = 0;
let votesCache: PairwiseVoteRecord[] = [];
let diskStorageAvailable = false;
let storageLabel = "browser localStorage";

window.addEventListener("DOMContentLoaded", async () => {
  populateSamples();
  await refreshVotesFromDisk();
  updateVoteStatus();
  bindEvents();
  await loadNextPair();
});

function bindEvents() {
  comparisonModeSelect.addEventListener("change", () => loadNextPair());
  sampleModeSelect.addEventListener("change", () => loadNextPair());
  sampleSelect.addEventListener("change", () => loadNextPair());
  paletteSelect.addEventListener("change", () => loadNextPair());
  screenSelect.addEventListener("change", () => loadNextPair());
  orientationSelect.addEventListener("change", () => loadNextPair());
  fitSelect.addEventListener("change", () => loadNextPair());

  fileInput.addEventListener("change", async () => {
    if (!fileInput.files?.length) return;

    const file = fileInput.files[0];
    if (uploadedImage?.url) URL.revokeObjectURL(uploadedImage.url);
    uploadedImage = {
      id: `upload:${file.name}:${file.size}:${file.lastModified}`,
      name: file.name,
      url: URL.createObjectURL(file),
      uploaded: true,
    };
    imageSources = [uploadedImage, ...imageSources.filter((image) => !image.uploaded)];
    appendUploadedSample(uploadedImage);
    sampleModeSelect.value = "selected";
    sampleSelect.value = uploadedImage.id;
    await loadNextPair();
  });

  leftButton.addEventListener("click", () => recordVote("left"));
  rightButton.addEventListener("click", () => recordVote("right"));
  tieButton.addEventListener("click", () => recordVote("tie"));
  nextButton.addEventListener("click", () => recordVote("skip"));
  exportButton.addEventListener("click", exportVotes);
  clearButton.addEventListener("click", async () => {
    if (!window.confirm("Clear all pairwise rating votes?")) return;
    await clearVotes();
    updateVoteStatus();
    await loadNextPair();
  });
}

function populateSamples() {
  const fileSamples = Object.entries(sampleImages)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, url]) => ({
      id: `sample:${sampleKey(path)}`,
      name: formatSampleName(path),
      url,
    }));
  imageSources = [...generatedProbeImages, ...fileSamples];

  sampleSelect.replaceChildren(
    ...imageSources.map((image) => {
      const option = document.createElement("option");
      option.value = image.id;
      option.textContent = image.name;
      return option;
    }),
  );
}

function appendUploadedSample(image: ImageSource) {
  const option = document.createElement("option");
  option.value = image.id;
  option.textContent = image.name;
  sampleSelect.prepend(option);
}

async function loadNextPair() {
  const token = ++renderToken;
  setBusy(true);
  statusLine.textContent = "Generating comparison...";

  try {
    const image = getNextImage();
    const img = await loadImage(image.url);
    if (token !== renderToken) return;

    const inputCanvas = drawImageToScreenCanvas(img);
    const palette = getSelectedPalette();
    const suggestion = suggestCanvasProcessingOptions(inputCanvas, palette);
    const layeredSuggestion = suggestLayeredCanvasProcessingOptions(
      inputCanvas,
      palette,
    );
    const variants = getRatingVariants(
      inputCanvas,
      palette,
      suggestion,
      layeredSuggestion,
    );
    const [left, right] = pickVariantPair(variants);

    await Promise.all([
      renderVariant(inputCanvas, leftCanvas, palette, left),
      renderVariant(inputCanvas, rightCanvas, palette, right),
    ]);
    if (token !== renderToken) return;

    currentPair = {
      image,
      suggestion,
      left,
      right,
    };
    updatePairText(currentPair);
    updateVoteStatus();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not render.";
    statusLine.textContent = message;
  } finally {
    if (token === renderToken) setBusy(false);
  }
}

function getNextImage() {
  if (!imageSources.length) {
    throw new Error("No images available.");
  }

  const sampleMode = sampleModeSelect.value as SampleMode;
  if (sampleMode === "selected") {
    return (
      imageSources.find((image) => image.id === sampleSelect.value) ??
      imageSources[0]
    );
  }

  const unratedImages = imageSources.filter(
    (image) => getVoteCountForImage(image.id) === 0,
  );
  const pool = unratedImages.length ? unratedImages : imageSources;
  return pool[Math.floor(Math.random() * pool.length)];
}

function getRatingVariants(
  inputCanvas: HTMLCanvasElement,
  palette: PaletteColorEntry[],
  naturalSuggestion: ProcessingSuggestion,
  layeredSuggestion: ProcessingSuggestion,
) {
  if ((comparisonModeSelect.value as ComparisonMode) === "legacyLayered") {
    return [
      {
        id: "auto:previous",
        label: "Previous Auto",
        ditherOptions: naturalSuggestion.ditherOptions,
      },
      {
        id: "auto:layered",
        label: "Layered Auto",
        ditherOptions: layeredSuggestion.ditherOptions,
      },
    ];
  }

  if ((comparisonModeSelect.value as ComparisonMode) === "autoBaseline") {
    return [
      {
        id: "auto:current",
        label: "Current Auto",
        ditherOptions: naturalSuggestion.ditherOptions,
      },
      getBaselineAutoVariant(naturalSuggestion, palette),
    ];
  }

  if ((comparisonModeSelect.value as ComparisonMode) === "autoToneContrast") {
    return getAutoToneContrastVariants(layeredSuggestion);
  }

  if ((comparisonModeSelect.value as ComparisonMode) === "autoWhiteGuard") {
    return getAutoWhiteGuardVariants(layeredSuggestion);
  }

  if ((comparisonModeSelect.value as ComparisonMode) === "chromaRgb") {
    return getChromaRgbVariants(naturalSuggestion);
  }

  if ((comparisonModeSelect.value as ComparisonMode) === "hueMixRgb") {
    return getHueMixRgbVariants(naturalSuggestion);
  }

  if ((comparisonModeSelect.value as ComparisonMode) === "magentaRgb") {
    return getMagentaProbeVariants(naturalSuggestion);
  }

  const intentVariants: Array<[AutoProcessingIntent, string]> = [
    ["natural", "Auto natural"],
    ["vivid", "Auto vivid"],
    ["readable", "Auto readable"],
    ["faithful", "Auto faithful"],
    ["lowNoise", "Auto low noise"],
  ];
  const variants: RatingVariant[] = intentVariants.map(([intent, label]) => {
    const suggestion =
      intent === "natural"
        ? naturalSuggestion
        : suggestCanvasProcessingOptions(inputCanvas, palette, { intent });
    return {
      id: `auto:${intent}`,
      label,
      ditherOptions: suggestion.ditherOptions,
    };
  });

  variants.push(
    {
      id: "preset:balanced",
      label: "Preset balanced",
      ditherOptions: {
        processingPreset: "balanced",
        ditheringType: "errorDiffusion",
        errorDiffusionMatrix: "floydSteinberg",
        serpentine: true,
        colorMatching: "rgb",
      },
    },
    {
      id: "preset:dynamic",
      label: "Preset dynamic",
      ditherOptions: {
        processingPreset: "dynamic",
        ditheringType: "errorDiffusion",
        errorDiffusionMatrix: "floydSteinberg",
        serpentine: true,
        colorMatching: "rgb",
      },
    },
    {
      id: "preset:soft",
      label: "Preset soft",
      ditherOptions: {
        processingPreset: "soft",
        ditheringType: "errorDiffusion",
        errorDiffusionMatrix: "stucki",
        serpentine: true,
        colorMatching: "rgb",
      },
    },
    {
      id: "preset:restore",
      label: "Preset restore",
      ditherOptions: {
        processingPreset: "restore",
        ditheringType: "errorDiffusion",
        errorDiffusionMatrix: "floydSteinberg",
        serpentine: true,
        colorMatching: "lab",
        levelCompression: {
          mode: "luma",
          black: 8,
          white: 245,
        },
      },
    },
    {
      id: "preset:poster-scan",
      label: "Preset poster scan",
      ditherOptions: {
        processingPreset: "posterScan",
        ditheringType: "errorDiffusion",
        errorDiffusionMatrix: "floydSteinberg",
        serpentine: true,
        colorMatching: "rgb",
        levelCompression: {
          mode: "luma",
          black: 3,
          white: 252,
        },
      },
    },
    {
      id: "quantized:lab",
      label: "LAB quantized",
      ditherOptions: {
        processingPreset: "balanced",
        ditheringType: "quantizationOnly",
        colorMatching: "lab",
        toneMapping: {
          mode: "contrast",
          exposure: 1.03,
          saturation: 0.95,
          contrast: 1.16,
        },
      },
    },
  );

  return dedupeVariants(variants);
}

function getAutoToneContrastVariants(layeredSuggestion: ProcessingSuggestion) {
  const baseOptions = {
    ...layeredSuggestion.ditherOptions,
  };

  return [
    {
      id: "autoTone:scurve",
      label: "Auto with S-curve tone",
      ditherOptions: {
        ...baseOptions,
        toneMapping: getSCurveToneMapping(baseOptions.toneMapping),
      },
    },
    {
      id: "autoTone:contrast",
      label: "Auto with contrast tone",
      ditherOptions: {
        ...baseOptions,
        toneMapping: getContrastToneMapping(baseOptions.toneMapping),
      },
    },
  ] satisfies RatingVariant[];
}

function getAutoWhiteGuardVariants(layeredSuggestion: ProcessingSuggestion) {
  return [
    {
      id: "autoWhite:guarded",
      label: "Auto with white guard",
      ditherOptions: getWhiteGuardOptions(layeredSuggestion.ditherOptions, true),
    },
    {
      id: "autoWhite:unguarded",
      label: "Auto without white guard",
      ditherOptions: getWhiteGuardOptions(layeredSuggestion.ditherOptions, false),
    },
  ] satisfies RatingVariant[];
}

function getWhiteGuardOptions(
  options: Partial<DitherImageOptions>,
  preserveWhite: boolean,
): Partial<DitherImageOptions> {
  const rangeOptions =
    typeof options.dynamicRangeCompression === "object"
      ? options.dynamicRangeCompression
      : options.dynamicRangeCompression === true
        ? { mode: "display" as const, strength: 1 }
        : undefined;

  if (!rangeOptions || rangeOptions.mode === "off") {
    return options;
  }

  return {
    ...options,
    dynamicRangeCompression: {
      ...rangeOptions,
      preserveWhite,
      ...(preserveWhite
        ? {
            whitePreservePercentile:
              rangeOptions.whitePreservePercentile ?? 0.99,
            whitePreserveMinLuma: rangeOptions.whitePreserveMinLuma ?? 150,
          }
        : {}),
    },
  };
}

function getContrastToneMapping(
  toneMapping: DitherImageOptions["toneMapping"],
): ToneMappingOptions {
  if (toneMapping?.mode === "contrast") {
    return {
      mode: "contrast",
      exposure: toneMapping.exposure ?? 1,
      saturation: toneMapping.saturation ?? 1,
      contrast: Math.max(toneMapping.contrast ?? 1, 1),
    };
  }

  const strength = toneMapping?.strength ?? 0.72;
  const shadowBoost = toneMapping?.shadowBoost ?? 0;
  const highlightCompress = toneMapping?.highlightCompress ?? 1;
  const contrast =
    1 +
    strength * 0.28 +
    shadowBoost * 0.18 +
    Math.max(0, highlightCompress - 1) * 0.05 -
    Math.max(0, 1 - highlightCompress) * 0.04;

  return {
    mode: "contrast",
    exposure: toneMapping?.exposure ?? 1,
    saturation: toneMapping?.saturation ?? 1,
    contrast: clamp(contrast, 1, 1.42),
  };
}

function getSCurveToneMapping(
  toneMapping: DitherImageOptions["toneMapping"],
): ToneMappingOptions {
  if (toneMapping?.mode === "scurve") {
    return {
      mode: "scurve",
      exposure: toneMapping.exposure ?? 1,
      saturation: toneMapping.saturation ?? 1,
      strength: toneMapping.strength ?? 0.72,
      shadowBoost: toneMapping.shadowBoost ?? 0.08,
      highlightCompress: toneMapping.highlightCompress ?? 1.2,
      midpoint: toneMapping.midpoint ?? 0.5,
    };
  }

  const contrast = toneMapping?.mode === "contrast" ? toneMapping.contrast ?? 1 : 1;

  return {
    mode: "scurve",
    exposure: toneMapping?.exposure ?? 1,
    saturation: toneMapping?.saturation ?? 1,
    strength: clamp((contrast - 1) / 0.35, 0.58, 0.95),
    shadowBoost: contrast >= 1.2 ? 0.08 : 0.05,
    highlightCompress: contrast >= 1.2 ? 1.25 : 1.15,
    midpoint: 0.5,
  };
}

function getChromaRgbVariants(naturalSuggestion: ProcessingSuggestion) {
  const baseOptions = {
    ...naturalSuggestion.ditherOptions,
  };

  return [
    {
      id: "matching:chroma",
      label: "Experimental chroma matching",
      ditherOptions: {
        ...baseOptions,
        colorMatching: "chroma",
      },
    },
    {
      id: "matching:rgb",
      label: "RGB matching",
      ditherOptions: {
        ...baseOptions,
        colorMatching: "rgb",
      },
    },
  ] satisfies RatingVariant[];
}

function getHueMixRgbVariants(naturalSuggestion: ProcessingSuggestion) {
  const baseOptions = {
    ...naturalSuggestion.ditherOptions,
    processingPreset: "vivid" as const,
    colorMatching: "rgb" as const,
    toneMapping: {
      mode: "scurve" as const,
      saturation: 1.45,
      strength: 0.72,
      shadowBoost: 0.08,
      highlightCompress: 1.3,
      midpoint: 0.5,
    },
    dynamicRangeCompression: { mode: "off" as const },
  };

  return [
    {
      id: "dither:hueMix",
      label: "Experimental hue mix",
      ditherOptions: {
        ...baseOptions,
        ditheringType: "hueMix",
      },
    },
    {
      id: "dither:rgbDiffusion",
      label: "RGB error diffusion",
      ditherOptions: {
        ...baseOptions,
        ditheringType: "errorDiffusion",
        errorDiffusionMatrix:
          naturalSuggestion.ditherOptions.errorDiffusionMatrix ??
          "floydSteinberg",
        serpentine: true,
      },
    },
  ] satisfies RatingVariant[];
}

function getMagentaProbeVariants(naturalSuggestion: ProcessingSuggestion) {
  const baseOptions = getHueMixGradientBaseOptions(naturalSuggestion);

  return [
    {
      id: "magenta:hueMixRecipe",
      label: "Hue mix magenta recipe",
      ditherOptions: {
        ...baseOptions,
        ditheringType: "hueMix",
      },
    },
    {
      id: "magenta:rgbDiffusion",
      label: "RGB error diffusion",
      ditherOptions: {
        ...baseOptions,
        ditheringType: "errorDiffusion",
        errorDiffusionMatrix:
          naturalSuggestion.ditherOptions.errorDiffusionMatrix ??
          "floydSteinberg",
        serpentine: true,
      },
    },
  ] satisfies RatingVariant[];
}

function getHueMixGradientBaseOptions(naturalSuggestion: ProcessingSuggestion) {
  return {
    ...naturalSuggestion.ditherOptions,
    processingPreset: "vivid" as const,
    colorMatching: "rgb" as const,
    toneMapping: {
      mode: "scurve" as const,
      saturation: 1.45,
      strength: 0.72,
      shadowBoost: 0.08,
      highlightCompress: 1.3,
      midpoint: 0.5,
    },
    dynamicRangeCompression: { mode: "off" as const },
  };
}

function getBaselineAutoVariant(
  naturalSuggestion: ProcessingSuggestion,
  palette: PaletteColorEntry[],
): RatingVariant {
  const classification = naturalSuggestion.classification;
  const paletteProfile = getPaletteProfile(palette);
  const scores = getBaselinePresetScores(classification, paletteProfile);
  const preset = getBestScore(scores);
  const options = getBaselineRecommendation(classification.kind, preset);
  applyBaselinePaletteTuning(options, paletteProfile);

  return {
    id: "auto:baseline",
    label: "Baseline Auto",
    ditherOptions: {
      ...options,
      ...(options.ditheringType === "errorDiffusion" ? { serpentine: true } : {}),
    },
  };
}

function getBaselineRecommendation(
  kind: ImageKind,
  fallbackPreset: string,
): Partial<DitherImageOptions> {
  switch (kind) {
    case "textOrUi":
      return {
        processingPreset: "balanced",
        colorMatching: "lab",
        errorDiffusionMatrix: "floydSteinberg",
        ditheringType: "quantizationOnly",
        toneMapping: {
          mode: "contrast",
          exposure: 1.05,
          saturation: 1,
          contrast: 1.18,
        },
        dynamicRangeCompression: { mode: "display", strength: 0.75 },
      };
    case "lineArt":
      return {
        processingPreset: "balanced",
        colorMatching: "lab",
        errorDiffusionMatrix: "floydSteinberg",
        ditheringType: "quantizationOnly",
        toneMapping: {
          mode: "contrast",
          exposure: 1,
          saturation: 0.8,
          contrast: 1.25,
        },
        dynamicRangeCompression: { mode: "display", strength: 0.65 },
      };
    case "pixelArt":
      return {
        processingPreset: "vivid",
        colorMatching: "rgb",
        errorDiffusionMatrix: "floydSteinberg",
        ditheringType: "quantizationOnly",
        toneMapping: { mode: "off", exposure: 1, saturation: 1 },
        dynamicRangeCompression: { mode: "off" },
      };
    case "flatIllustration":
      return {
        processingPreset: "vivid",
        colorMatching: "rgb",
        errorDiffusionMatrix: "floydSteinberg",
        ditheringType: "errorDiffusion",
      };
    case "lowContrastPhoto":
      return {
        processingPreset: "dynamic",
        colorMatching: "rgb",
        errorDiffusionMatrix: "stucki",
        ditheringType: "errorDiffusion",
        toneMapping: {
          mode: "scurve",
          exposure: 1.08,
          saturation: 1.25,
          strength: 0.82,
          shadowBoost: 0.06,
          highlightCompress: 1.35,
          midpoint: 0.48,
        },
        dynamicRangeCompression: { mode: "display", strength: 0.85 },
      };
    case "highContrastPhoto":
      return {
        processingPreset: "soft",
        colorMatching: "rgb",
        errorDiffusionMatrix: "stucki",
        ditheringType: "errorDiffusion",
        dynamicRangeCompression: { mode: "display", strength: 0.9 },
      };
    case "photo":
      return {
        processingPreset: fallbackPreset,
        colorMatching: "rgb",
        errorDiffusionMatrix:
          fallbackPreset === "soft" ? "stucki" : "floydSteinberg",
        ditheringType: "errorDiffusion",
      };
    case "unknown":
    default:
      return {
        processingPreset: "balanced",
        colorMatching: "rgb",
        errorDiffusionMatrix: "floydSteinberg",
        ditheringType: "errorDiffusion",
      };
  }
}

function getBaselinePresetScores(
  classification: ProcessingSuggestion["classification"],
  paletteProfile: ReturnType<typeof getPaletteProfile>,
) {
  const { metrics, kindScores } = classification;
  const scores: Record<string, number> = {
    balanced: 0.52,
    dynamic: 0.48,
    vivid: 0.45,
    soft: 0.44,
    grayscale: 0.28,
  };

  if (classification.style === "photo") {
    scores.dynamic += 0.18;
    scores.balanced += 0.12;
    scores.soft += metrics.lumaStdDev >= 68 ? 0.2 : 0.06;
  } else if (classification.style === "illustration") {
    scores.vivid += 0.28;
    scores.balanced += 0.08;
  }

  scores.dynamic += kindScores.lowContrastPhoto * 0.24;
  scores.soft += kindScores.highContrastPhoto * 0.26;
  scores.vivid += kindScores.flatIllustration * 0.24;
  scores.vivid += kindScores.pixelArt * 0.18;
  scores.balanced += (kindScores.textOrUi + kindScores.lineArt) * 0.18;
  scores.grayscale +=
    (kindScores.textOrUi + kindScores.lineArt) *
    (metrics.grayRatio >= 0.7 ? 0.24 : 0.08);

  if (metrics.saturationMean <= 0.1 && metrics.grayRatio >= 0.82) {
    scores.grayscale += 0.22;
  }

  if (paletteProfile && paletteProfile.colorCount <= 2) {
    scores.grayscale += 0.3;
    scores.vivid -= 0.1;
  }

  return scores;
}

function applyBaselinePaletteTuning(
  options: Partial<DitherImageOptions>,
  paletteProfile: ReturnType<typeof getPaletteProfile>,
) {
  if (!paletteProfile) return;

  if (paletteProfile.colorCount <= 2) {
    options.colorMatching = "lab";
    options.processingPreset = "grayscale";
    options.toneMapping = {
      mode: "scurve",
      exposure: 1,
      saturation: 0,
      strength: 0.8,
      shadowBoost: 0.1,
      highlightCompress: 1.4,
      midpoint: 0.5,
    };
  } else if (paletteProfile.lumaRange <= 150) {
    options.dynamicRangeCompression = {
      mode: "display",
      strength: Math.max(
        typeof options.dynamicRangeCompression === "object"
          ? (options.dynamicRangeCompression.strength ?? 0)
          : 0,
        0.8,
      ),
    };
  }
}

function getBestScore(scores: Record<string, number>) {
  return Object.entries(scores).reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    ["balanced", -Infinity],
  )[0];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function dedupeVariants(variants: RatingVariant[]) {
  const seen = new Set<string>();
  return variants.filter((variant) => {
    const key = stableStringify(getCompactOptions(variant.ditherOptions));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickVariantPair(variants: RatingVariant[]): [RatingVariant, RatingVariant] {
  if (variants.length < 2) {
    throw new Error("Need at least two variants to compare.");
  }

  const votes = loadVotes();
  const candidates: Array<[RatingVariant, RatingVariant, number]> = [];
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      const left = variants[i];
      const right = variants[j];
      candidates.push([
        left,
        right,
        getPairVoteCount(votes, left.id, right.id),
      ]);
    }
  }

  const minVoteCount = Math.min(...candidates.map((candidate) => candidate[2]));
  const leastSeen = candidates.filter((candidate) => candidate[2] === minVoteCount);
  const [a, b] = leastSeen[Math.floor(Math.random() * leastSeen.length)];
  return Math.random() >= 0.5 ? [a, b] : [b, a];
}

async function renderVariant(
  inputCanvas: HTMLCanvasElement,
  outputCanvas: HTMLCanvasElement,
  palette: PaletteColorEntry[],
  variant: RatingVariant,
) {
  await ditherImage(inputCanvas, outputCanvas, {
    ...variant.ditherOptions,
    palette,
    calibrate: true,
  });
}

async function recordVote(winner: VoteChoice) {
  if (!currentPair) return;

  const equivalentOptions = areOptionsEquivalent(
    currentPair.left.ditherOptions,
    currentPair.right.ditherOptions,
  );
  const normalizedWinner =
    equivalentOptions && (winner === "left" || winner === "right") ? "tie" : winner;
  const vote = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    imageId: currentPair.image.id,
    imageName: currentPair.image.name,
    paletteKey: paletteSelect.value,
    screenResolution: screenSelect.value,
    orientation: getSelectedOrientation(),
    imageFit: getSelectedImageFit(),
    comparisonMode: comparisonModeSelect.value as ComparisonMode,
    leftVariantId: currentPair.left.id,
    rightVariantId: currentPair.right.id,
    winner: normalizedWinner,
    leftOptions: getCompactOptions(currentPair.left.ditherOptions),
    rightOptions: getCompactOptions(currentPair.right.ditherOptions),
    imageKind: currentPair.suggestion.imageKind,
    classification: currentPair.suggestion.classification,
  };
  await appendVote(vote);
  updateVoteStatus();
  void loadNextPair();
}

function drawImageToScreenCanvas(img: HTMLImageElement) {
  const { width, height } = getSelectedScreenResolution();
  const orientation = getSelectedOrientation();
  const imageFit = getSelectedImageFit();
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;

  if (orientation === "original") {
    const originalOrientation = img.height > img.width ? "portrait" : "landscape";
    const canvasWidth = originalOrientation === "portrait" ? height : width;
    const canvasHeight = originalOrientation === "portrait" ? width : height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    drawImageWithFit(img, ctx, canvasWidth, canvasHeight, imageFit);
    return canvas;
  }

  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  if (orientation === "landscape") {
    drawImageWithFit(img, ctx, width, height, imageFit);
    return canvas;
  }

  const portraitCanvas = document.createElement("canvas");
  portraitCanvas.width = height;
  portraitCanvas.height = width;

  const portraitCtx = portraitCanvas.getContext("2d")!;
  portraitCtx.fillStyle = "#ffffff";
  portraitCtx.fillRect(0, 0, portraitCanvas.width, portraitCanvas.height);
  drawImageWithFit(
    img,
    portraitCtx,
    portraitCanvas.width,
    portraitCanvas.height,
    imageFit,
  );

  ctx.save();
  ctx.setTransform(0, 1, -1, 0, width, 0);
  ctx.drawImage(portraitCanvas, 0, 0);
  ctx.restore();
  return canvas;
}

function drawImageWithFit(
  img: HTMLImageElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  imageFit: ImageFitMode,
) {
  const scale =
    imageFit === "cover"
      ? Math.max(width / img.width, height / img.height)
      : Math.min(width / img.width, height / img.height);
  const drawWidth = Math.round(img.width * scale);
  const drawHeight = Math.round(img.height * scale);
  const offsetX = Math.round((width - drawWidth) / 2);
  const offsetY = Math.round((height - drawHeight) / 2);

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

function updatePairText(pair: CurrentPair) {
  const equivalentOptions = areOptionsEquivalent(
    pair.left.ditherOptions,
    pair.right.ditherOptions,
  );
  imageTitle.textContent = pair.image.name;
  pairSummary.textContent = `${formatImageKind(
    pair.suggestion.imageKind,
  )} · ${getSelectedPaletteOption().label} · ${getSelectedScreenResolution().width} x ${
    getSelectedScreenResolution().height
  }${equivalentOptions ? " · same settings" : ""}`;
  leftDetails.textContent = pair.left.label;
  rightDetails.textContent = pair.right.label;
}

function updateVoteStatus() {
  const votes = loadVotes();
  const voted = votes.filter((vote) => vote.winner !== "skip").length;
  const skipped = votes.length - voted;
  statusLine.textContent = `${voted} vote${voted === 1 ? "" : "s"} saved${
    skipped ? ` · ${skipped} skipped` : ""
  } · ${storageLabel}`;
}

function setBusy(isBusy: boolean) {
  const equivalentOptions =
    !isBusy &&
    currentPair !== null &&
    areOptionsEquivalent(
      currentPair.left.ditherOptions,
      currentPair.right.ditherOptions,
    );
  leftButton.disabled = isBusy || equivalentOptions;
  rightButton.disabled = isBusy || equivalentOptions;
  tieButton.disabled = isBusy;
  nextButton.disabled = isBusy;
}

function loadVotes(): PairwiseVoteRecord[] {
  return votesCache;
}

async function refreshVotesFromDisk() {
  try {
    const response = await fetch(RATING_ENDPOINT, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const payload = await response.json();
    votesCache = sanitizeVotes(payload.votes);
    diskStorageAvailable = true;
    storageLabel = payload.jsonlPath
      ? `disk: ${payload.jsonlPath}`
      : "disk storage";
    localStorage.setItem(STORAGE_KEY, JSON.stringify(votesCache));
  } catch {
    diskStorageAvailable = false;
    storageLabel = "browser localStorage";
    votesCache = readLocalVotes();
  }
}

async function appendVote(vote: PairwiseVoteRecord) {
  if (diskStorageAvailable) {
    try {
      const response = await fetch(RATING_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(vote),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      votesCache = [...votesCache, vote];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(votesCache));
      return;
    } catch {
      diskStorageAvailable = false;
      storageLabel = "browser localStorage";
    }
  }

  votesCache = [...votesCache, vote];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(votesCache));
}

async function clearVotes() {
  if (diskStorageAvailable) {
    try {
      const response = await fetch(RATING_ENDPOINT, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch {
      diskStorageAvailable = false;
      storageLabel = "browser localStorage";
    }
  }

  votesCache = [];
  localStorage.removeItem(STORAGE_KEY);
}

function readLocalVotes(): PairwiseVoteRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return sanitizeVotes(parsed);
  } catch {
    return [];
  }
}

function sanitizeVotes(value: unknown): PairwiseVoteRecord[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (record): record is PairwiseVoteRecord =>
      typeof record === "object" &&
      record !== null &&
      typeof record.id === "string" &&
      typeof record.imageId === "string" &&
      typeof record.leftVariantId === "string" &&
      typeof record.rightVariantId === "string",
  );
}

function exportVotes() {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    votes: loadVotes(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "epdoptimize-pairwise-ratings.json";
  link.click();
  URL.revokeObjectURL(url);
}

function getPairVoteCount(
  votes: PairwiseVoteRecord[],
  variantA: string,
  variantB: string,
) {
  return votes.filter(
    (vote) =>
      (vote.leftVariantId === variantA && vote.rightVariantId === variantB) ||
      (vote.leftVariantId === variantB && vote.rightVariantId === variantA),
  ).length;
}

function getVoteCountForImage(imageId: string) {
  return loadVotes().filter((vote) => vote.imageId === imageId).length;
}

function getSelectedPaletteOption() {
  return (
    PALETTE_OPTIONS[paletteSelect.value as keyof typeof PALETTE_OPTIONS] ??
    PALETTE_OPTIONS["aitjcize-spectra6"]
  );
}

function getSelectedPalette() {
  return getSelectedPaletteOption().palette;
}

function getSelectedScreenResolution() {
  return (
    SCREEN_RESOLUTIONS[screenSelect.value as keyof typeof SCREEN_RESOLUTIONS] ??
    SCREEN_RESOLUTIONS.openpaper7
  );
}

function getSelectedOrientation(): ScreenOrientation {
  if (orientationSelect.value === "original") return "original";
  return orientationSelect.value === "portrait" ? "portrait" : "landscape";
}

function getSelectedImageFit(): ImageFitMode {
  return fitSelect.value === "cover" ? "cover" : "contain";
}

function getPaletteProfile(palette: PaletteColorEntry[]): PaletteProfile | null {
  const colors = palette.map((entry) => hexToRgb(entry.color)).filter(Boolean) as Array<
    [number, number, number]
  >;
  if (!colors.length) return null;

  const lumas = colors.map(([r, g, b]) => getLuma(r, g, b));
  const saturations = colors.map(([r, g, b]) => getSaturation(r, g, b));

  return {
    colorCount: colors.length,
    lumaRange: Math.max(...lumas) - Math.min(...lumas),
    averageSaturation:
      saturations.reduce((sum, saturation) => sum + saturation, 0) /
      saturations.length,
  };
}

function getCompactOptions(options: Partial<DitherImageOptions>) {
  const compact: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options) as Array<
    [string, unknown]
  >) {
    if (typeof value !== "undefined") compact[key] = value;
  }
  return compact;
}

function areOptionsEquivalent(
  left: Partial<DitherImageOptions>,
  right: Partial<DitherImageOptions>,
) {
  return (
    stableStringify(getCompactOptions(left)) ===
    stableStringify(getCompactOptions(right))
  );
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .map(([key, nestedValue]) => `${JSON.stringify(key)}:${stableStringify(nestedValue)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function formatSampleName(path: string) {
  return path
    .split("/")
    .pop()!
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+[a-f0-9]{8,}.*$/i, "")
    .trim();
}

function sampleKey(path: string) {
  return path.split("/").pop() ?? path;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = hex.replace(/^#/, "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((char) => char + char)
          .join("")
      : normalized;

  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;

  return [
    parseInt(expanded.slice(0, 2), 16),
    parseInt(expanded.slice(2, 4), 16),
    parseInt(expanded.slice(4, 6), 16),
  ];
}

function getLuma(red: number, green: number, blue: number) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

function getSaturation(red: number, green: number, blue: number) {
  const max = Math.max(red, green, blue) / 255;
  const min = Math.min(red, green, blue) / 255;

  return max === 0 ? 0 : (max - min) / max;
}

function formatImageKind(kind: ProcessingSuggestion["imageKind"]) {
  return kind
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}
