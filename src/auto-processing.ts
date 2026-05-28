import type {
  CanvasLike,
  DitherImageOptions,
  ImageDataLike,
} from "./dither/dither";
import type {
  ColorMatchingMode,
  DynamicRangeCompressionOptions,
  ProcessingPresetName,
  ToneMappingOptions,
} from "./dither/processing";
import { getProcessingPreset } from "./dither/processing";
import type { PaletteColorEntry } from "./dither/functions/palette-order";
import {
  classifyCanvasImageStyle,
  classifyImageStyle,
  type ClassifyImageStyleOptions,
  type ImageKind,
  type ImageStyleClassification,
} from "./image-style";

export type AutoProcessingIntent =
  | "natural"
  | "vivid"
  | "readable"
  | "faithful"
  | "lowNoise";

export interface SuggestProcessingOptionsInput
  extends ClassifyImageStyleOptions {
  intent?: AutoProcessingIntent;
}

export interface ProcessingSuggestion {
  classification: ImageStyleClassification;
  imageKind: ImageKind;
  intent: AutoProcessingIntent;
  strategy?: "legacy" | "layered";
  ditherOptions: Partial<DitherImageOptions>;
  reasons: string[];
  scores: Record<string, number>;
  pipelineSteps?: ProcessingPipelineStep[];
}

export type AutoImageAdjustmentOptions = Pick<
  Partial<DitherImageOptions>,
  | "toneMapping"
  | "dynamicRangeCompression"
  | "levelCompression"
  | "paperNormalization"
>;

export type AutoCanvasDitherOptions = Pick<
  Partial<DitherImageOptions>,
  | "colorMatching"
  | "ditheringType"
  | "errorDiffusionMatrix"
  | "serpentine"
>;

export interface AutoImageAdjustmentSuggestion {
  classification: ImageStyleClassification;
  imageKind: ImageKind;
  intent: AutoProcessingIntent;
  strategy?: ProcessingSuggestion["strategy"];
  adjustmentOptions: AutoImageAdjustmentOptions;
  reasons: string[];
  scores: Record<string, number>;
}

export interface AutoCanvasDitherSuggestion {
  classification: ImageStyleClassification;
  imageKind: ImageKind;
  intent: AutoProcessingIntent;
  strategy?: ProcessingSuggestion["strategy"];
  presetName?: ProcessingPresetName;
  ditherOptions: AutoCanvasDitherOptions;
  reasons: string[];
  scores: Record<string, number>;
}

export interface ProcessingPipelineStep {
  id: string;
  title: string;
  summary: string;
  ditherOptions?: Partial<DitherImageOptions>;
}

interface PaletteProfile {
  colorCount: number;
  lumaRange: number;
  saturationRange: number;
  averageSaturation: number;
}

interface RecommendationBase {
  processingPreset: ProcessingPresetName;
  colorMatching: ColorMatchingMode;
  errorDiffusionMatrix: string;
  ditheringType?: DitherImageOptions["ditheringType"];
  toneMapping?: ToneMappingOptions;
  dynamicRangeCompression?: DynamicRangeCompressionOptions;
  levelCompression?: DitherImageOptions["levelCompression"];
  paperNormalization?: DitherImageOptions["paperNormalization"];
}

export function suggestProcessingOptions(
  image: ImageDataLike,
  palette?: PaletteColorEntry[] | string[],
  options: SuggestProcessingOptionsInput = {}
): ProcessingSuggestion {
  const classification = classifyImageStyle(image, options);
  return buildSuggestion(classification, getPaletteProfile(palette), options);
}

export function suggestCanvasProcessingOptions(
  canvas: CanvasLike,
  palette?: PaletteColorEntry[] | string[],
  options: SuggestProcessingOptionsInput = {}
): ProcessingSuggestion {
  const classification = classifyCanvasImageStyle(canvas, options);
  return buildSuggestion(classification, getPaletteProfile(palette), options);
}

export function suggestLayeredProcessingOptions(
  image: ImageDataLike,
  palette?: PaletteColorEntry[] | string[],
  options: SuggestProcessingOptionsInput = {}
): ProcessingSuggestion {
  const classification = classifyImageStyle(image, options);
  return buildLayeredSuggestion(
    classification,
    getPaletteProfile(palette),
    options
  );
}

export function suggestLayeredCanvasProcessingOptions(
  canvas: CanvasLike,
  palette?: PaletteColorEntry[] | string[],
  options: SuggestProcessingOptionsInput = {}
): ProcessingSuggestion {
  const classification = classifyCanvasImageStyle(canvas, options);
  return buildLayeredSuggestion(
    classification,
    getPaletteProfile(palette),
    options
  );
}

export function suggestImageAdjustmentOptions(
  image: ImageDataLike,
  palette?: PaletteColorEntry[] | string[],
  options: SuggestProcessingOptionsInput = {}
): AutoImageAdjustmentSuggestion {
  return getImageAdjustmentSuggestion(
    suggestLayeredProcessingOptions(image, palette, options)
  );
}

export function suggestCanvasImageAdjustmentOptions(
  canvas: CanvasLike,
  palette?: PaletteColorEntry[] | string[],
  options: SuggestProcessingOptionsInput = {}
): AutoImageAdjustmentSuggestion {
  return getImageAdjustmentSuggestion(
    suggestLayeredCanvasProcessingOptions(canvas, palette, options)
  );
}

export function suggestDitherOptions(
  image: ImageDataLike,
  palette?: PaletteColorEntry[] | string[],
  options: SuggestProcessingOptionsInput = {}
): AutoCanvasDitherSuggestion {
  return getCanvasDitherSuggestion(
    suggestLayeredProcessingOptions(image, palette, options)
  );
}

export function suggestCanvasDitherOptions(
  canvas: CanvasLike,
  palette?: PaletteColorEntry[] | string[],
  options: SuggestProcessingOptionsInput = {}
): AutoCanvasDitherSuggestion {
  return getCanvasDitherSuggestion(
    suggestLayeredCanvasProcessingOptions(canvas, palette, options)
  );
}

function getImageAdjustmentSuggestion(
  suggestion: ProcessingSuggestion
): AutoImageAdjustmentSuggestion {
  const { ditherOptions } = suggestion;
  return {
    classification: suggestion.classification,
    imageKind: suggestion.imageKind,
    intent: suggestion.intent,
    strategy: suggestion.strategy,
    adjustmentOptions: {
      ...(ditherOptions.toneMapping
        ? { toneMapping: ditherOptions.toneMapping }
        : {}),
      ...(ditherOptions.dynamicRangeCompression
        ? { dynamicRangeCompression: ditherOptions.dynamicRangeCompression }
        : {}),
      ...(ditherOptions.levelCompression
        ? { levelCompression: ditherOptions.levelCompression }
        : {}),
      ...(ditherOptions.paperNormalization
        ? { paperNormalization: ditherOptions.paperNormalization }
        : {}),
    },
    reasons: suggestion.reasons,
    scores: suggestion.scores,
  };
}

function getCanvasDitherSuggestion(
  suggestion: ProcessingSuggestion
): AutoCanvasDitherSuggestion {
  const { ditherOptions } = suggestion;
  const ditherOptionsOnly: AutoCanvasDitherOptions = {
    ...(ditherOptions.colorMatching
      ? { colorMatching: ditherOptions.colorMatching }
      : {}),
    ...(ditherOptions.ditheringType
      ? { ditheringType: ditherOptions.ditheringType }
      : {}),
    ...(ditherOptions.errorDiffusionMatrix
      ? { errorDiffusionMatrix: ditherOptions.errorDiffusionMatrix }
      : {}),
    ...(typeof ditherOptions.serpentine === "boolean"
      ? { serpentine: ditherOptions.serpentine }
      : {}),
  };

  return {
    classification: suggestion.classification,
    imageKind: suggestion.imageKind,
    intent: suggestion.intent,
    strategy: suggestion.strategy,
    presetName:
      typeof ditherOptions.processingPreset === "string"
        ? ditherOptions.processingPreset
        : undefined,
    ditherOptions: ditherOptionsOnly,
    reasons: suggestion.reasons,
    scores: suggestion.scores,
  };
}

function buildSuggestion(
  classification: ImageStyleClassification,
  paletteProfile: PaletteProfile | null,
  options: SuggestProcessingOptionsInput
): ProcessingSuggestion {
  const intent = options.intent ?? "natural";
  const reasons: string[] = [];
  const scores = getPresetScores(classification, paletteProfile, intent);
  const recommendedPreset = getBestScore(scores);
  const base = getBaseRecommendation(classification.kind, recommendedPreset);

  addClassificationReasons(classification, reasons);
  addPaletteReasons(paletteProfile, reasons);
  applyPaletteTuning(base, paletteProfile, reasons);
  applyLearnedTuning(base, classification, intent, reasons);
  applyLowContrastRestoreTuning(base, classification, reasons);
  applyPosterScanTuning(base, classification, reasons);
  applyIntent(base, intent, reasons);
  enforceQuantizationGuard(base, classification, reasons);
  enforceMinimumAutoContrast(base);
  enforceAutoWhitePreservation(base, reasons);
  if ((base.ditheringType ?? "errorDiffusion") === "errorDiffusion") {
    reasons.push("Serpentine diffusion reduces directional dithering artifacts.");
  }

  return {
    classification,
    imageKind: classification.kind,
    intent,
    strategy: "legacy",
    ditherOptions: {
      processingPreset: base.processingPreset,
      colorMatching: base.colorMatching,
      errorDiffusionMatrix: base.errorDiffusionMatrix,
      ditheringType: base.ditheringType ?? "errorDiffusion",
      ...((base.ditheringType ?? "errorDiffusion") === "errorDiffusion"
        ? { serpentine: true }
        : {}),
      ...(base.toneMapping ? { toneMapping: base.toneMapping } : {}),
      ...(base.dynamicRangeCompression
        ? { dynamicRangeCompression: base.dynamicRangeCompression }
        : {}),
      ...(base.levelCompression ? { levelCompression: base.levelCompression } : {}),
      ...(base.paperNormalization
        ? { paperNormalization: base.paperNormalization }
        : {}),
    },
    reasons,
    scores,
  };
}

function buildLayeredSuggestion(
  classification: ImageStyleClassification,
  paletteProfile: PaletteProfile | null,
  options: SuggestProcessingOptionsInput
): ProcessingSuggestion {
  const intent = options.intent ?? "natural";
  const reasons: string[] = [];
  const scores = getPresetScores(classification, paletteProfile, intent);
  const base = getLayeredBaseRecommendation(classification.kind);
  const pipelineSteps: ProcessingPipelineStep[] = [
    {
      id: "detect",
      title: "Detect image kind",
      summary: `${classification.kind} from the untouched source image.`,
    },
    {
      id: "preset",
      title: "Apply image-kind preset",
      summary: `${classification.kind} maps directly to ${base.processingPreset}.`,
      ditherOptions: {
        processingPreset: base.processingPreset,
        ditheringType: base.ditheringType,
        colorMatching: base.colorMatching,
        errorDiffusionMatrix: base.errorDiffusionMatrix,
      },
    },
  ];

  addClassificationReasons(classification, reasons);
  applyLayeredAutoAdjustments(base, classification, paletteProfile, reasons);
  applyLowContrastRestoreTuning(base, classification, reasons);
  applyPosterScanTuning(base, classification, reasons);
  addPaletteReasons(paletteProfile, reasons);
  applyPaletteTuning(base, paletteProfile, reasons);
  applyIntent(base, intent, reasons);
  enforceQuantizationGuard(base, classification, reasons);
  enforceMinimumAutoContrast(base);
  enforceAutoWhitePreservation(base, reasons);
  pipelineSteps.push({
    id: "adjust",
    title: "Apply auto adjustments",
    summary: describeLayeredAdjustments(base),
    ditherOptions: {
      toneMapping: base.toneMapping,
      dynamicRangeCompression: base.dynamicRangeCompression,
      levelCompression: base.levelCompression,
      paperNormalization: base.paperNormalization,
    },
  });
  pipelineSteps.push({
    id: "output",
    title: "Dither and fit to palette",
    summary:
      (base.ditheringType ?? "errorDiffusion") === "quantizationOnly"
        ? "Use direct palette quantization for sharp flat content."
        : `Use ${base.errorDiffusionMatrix} error diffusion with serpentine scan.`,
    ditherOptions: {
      ditheringType: base.ditheringType ?? "errorDiffusion",
      colorMatching: base.colorMatching,
      errorDiffusionMatrix: base.errorDiffusionMatrix,
    },
  });

  if ((base.ditheringType ?? "errorDiffusion") === "errorDiffusion") {
    reasons.push("Serpentine diffusion reduces directional dithering artifacts.");
  }

  return {
    classification,
    imageKind: classification.kind,
    intent,
    strategy: "layered",
    ditherOptions: {
      processingPreset: base.processingPreset,
      colorMatching: base.colorMatching,
      errorDiffusionMatrix: base.errorDiffusionMatrix,
      ditheringType: base.ditheringType ?? "errorDiffusion",
      ...((base.ditheringType ?? "errorDiffusion") === "errorDiffusion"
        ? { serpentine: true }
        : {}),
      ...(base.toneMapping ? { toneMapping: base.toneMapping } : {}),
      ...(base.dynamicRangeCompression
        ? { dynamicRangeCompression: base.dynamicRangeCompression }
        : {}),
      ...(base.levelCompression ? { levelCompression: base.levelCompression } : {}),
      ...(base.paperNormalization
        ? { paperNormalization: base.paperNormalization }
        : {}),
    },
    reasons,
    scores,
    pipelineSteps,
  };
}

function enforceMinimumAutoContrast(recommendation: RecommendationBase) {
  if (recommendation.toneMapping?.mode === "contrast") {
    recommendation.toneMapping = {
      ...recommendation.toneMapping,
      contrast: Math.max(recommendation.toneMapping.contrast ?? 1, 1),
    };
    return;
  }

  if (recommendation.toneMapping) return;

  const preset = getProcessingPreset(recommendation.processingPreset);
  if (preset?.toneMapping.mode !== "contrast") return;
  if ((preset.toneMapping.contrast ?? 1) >= 1) return;

  recommendation.toneMapping = {
    ...preset.toneMapping,
    contrast: 1,
  };
}

function enforceAutoWhitePreservation(
  recommendation: RecommendationBase,
  reasons: string[]
) {
  if (
    !recommendation.dynamicRangeCompression ||
    recommendation.dynamicRangeCompression.mode === "off"
  ) {
    return;
  }

  recommendation.dynamicRangeCompression = {
    ...recommendation.dynamicRangeCompression,
    preserveWhite: true,
    whitePreservePercentile:
      recommendation.dynamicRangeCompression.whitePreservePercentile ?? 0.99,
    whitePreserveMinLuma:
      recommendation.dynamicRangeCompression.whitePreserveMinLuma ?? 150,
  };
  reasons.push("Detected paper-white highlights are protected during range fitting.");
}

function getBaseRecommendation(
  kind: ImageKind,
  fallbackPreset: ProcessingPresetName
): RecommendationBase {
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
        toneMapping: {
          mode: "scurve",
          saturation: 1.45,
          strength: 0.72,
          shadowBoost: 0.08,
          highlightCompress: 1.3,
          midpoint: 0.5,
        },
      };
    case "unknown":
      return {
        processingPreset: "balanced",
        colorMatching: "rgb",
        errorDiffusionMatrix: "floydSteinberg",
        ditheringType: "errorDiffusion",
      };
    case "lowContrastPhoto":
      return {
        processingPreset: "restore",
        colorMatching: "lab",
        errorDiffusionMatrix: "floydSteinberg",
        ditheringType: "errorDiffusion",
        toneMapping: {
          mode: "scurve",
          exposure: 1.08,
          saturation: 0.9,
          strength: 1,
          shadowBoost: 0.25,
          highlightCompress: 0.75,
          midpoint: 0.46,
        },
        dynamicRangeCompression: {
          mode: "auto",
          strength: 0.9,
          lowPercentile: 0.02,
          highPercentile: 0.98,
        },
        levelCompression: {
          mode: "luma",
          black: 8,
          white: 245,
        },
      };
    case "highContrastPhoto":
      return {
        processingPreset: "balanced",
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
    default:
      return {
        processingPreset: "balanced",
        colorMatching: "rgb",
        errorDiffusionMatrix: "floydSteinberg",
        ditheringType: "errorDiffusion",
      };
  }
}

function getLayeredBaseRecommendation(kind: ImageKind): RecommendationBase {
  const presetName = getImageKindPreset(kind);
  const preset = getProcessingPreset(presetName);

  return {
    processingPreset: presetName,
    colorMatching: getImageKindColorMatching(kind, preset?.colorMatching),
    errorDiffusionMatrix: getImageKindDiffusionMatrix(
      kind,
      preset?.errorDiffusionMatrix
    ),
    ditheringType: getImageKindDitheringType(kind),
    toneMapping: preset?.toneMapping ? { ...preset.toneMapping } : undefined,
    dynamicRangeCompression: preset?.dynamicRangeCompression
      ? { ...preset.dynamicRangeCompression }
      : undefined,
  };
}

function getImageKindPreset(kind: ImageKind): ProcessingPresetName {
  switch (kind) {
    case "lowContrastPhoto":
      return "restore";
    case "highContrastPhoto":
      return "soft";
    case "flatIllustration":
    case "pixelArt":
      return "vivid";
    case "textOrUi":
    case "lineArt":
    case "photo":
    case "unknown":
    default:
      return "balanced";
  }
}

function getImageKindColorMatching(
  kind: ImageKind,
  fallback: ColorMatchingMode | undefined
): ColorMatchingMode {
  if (kind === "lowContrastPhoto") return "lab";
  if (kind === "textOrUi" || kind === "lineArt") return "lab";
  return fallback ?? "rgb";
}

function getImageKindDiffusionMatrix(
  kind: ImageKind,
  fallback: string | undefined
) {
  if (kind === "highContrastPhoto") {
    return "stucki";
  }
  if (kind === "lowContrastPhoto") return "floydSteinberg";
  return fallback ?? "floydSteinberg";
}

function getImageKindDitheringType(
  kind: ImageKind
): DitherImageOptions["ditheringType"] {
  if (kind === "textOrUi" || kind === "lineArt" || kind === "pixelArt") {
    return "quantizationOnly";
  }
  return "errorDiffusion";
}

function applyLayeredAutoAdjustments(
  recommendation: RecommendationBase,
  classification: ImageStyleClassification,
  paletteProfile: PaletteProfile | null,
  reasons: string[]
) {
  const { metrics } = classification;
  if (isRestorableLowContrastSource(classification)) return;

  switch (classification.kind) {
    case "lowContrastPhoto":
      recommendation.toneMapping = {
        mode: "scurve",
        exposure: Math.max(recommendation.toneMapping?.exposure ?? 1, 1.06),
        saturation:
          metrics.grayRatio >= 0.72
            ? 0
            : Math.min(recommendation.toneMapping?.saturation ?? 0.9, 1.05),
        strength: metrics.lumaRange <= 70 ? 1 : 0.9,
        shadowBoost: metrics.lumaP05 >= 55 ? 0.2 : 0.28,
        highlightCompress: 0.75,
        midpoint: metrics.lumaP95 <= 190 ? 0.44 : 0.46,
      };
      recommendation.dynamicRangeCompression = {
        mode: "auto",
        strength: metrics.lumaRange <= 70 ? 0.96 : 0.88,
        lowPercentile: 0.02,
        highPercentile: 0.98,
      };
      recommendation.levelCompression = {
        mode: "luma",
        black: 8,
        white: 245,
      };
      recommendation.colorMatching = metrics.grayRatio >= 0.55 ? "lab" : "rgb";
      recommendation.errorDiffusionMatrix = "floydSteinberg";
      reasons.push("Low contrast sources use percentile expansion before dithering.");
      if (metrics.grayRatio >= 0.55) {
        reasons.push("Faded gray scans use LAB matching to protect tonal readability.");
      }
      break;
    case "highContrastPhoto":
      recommendation.toneMapping = {
        mode: "contrast",
        exposure: 1,
        saturation: 1.05,
        contrast: 1,
      };
      recommendation.dynamicRangeCompression = {
        mode: "display",
        strength: 0.85,
      };
      reasons.push("High contrast photos use neutral contrast and display fitting.");
      break;
    case "photo":
      if (metrics.lumaStdDev <= 42) {
        recommendation.toneMapping = {
          mode: "scurve",
          exposure: 1.04,
          saturation: Math.max(
            recommendation.toneMapping?.saturation ?? 1,
            1.12
          ),
          strength: 0.66,
          shadowBoost: 0.05,
          highlightCompress: 1.2,
          midpoint: 0.49,
        };
        recommendation.dynamicRangeCompression = {
          mode: "auto",
          strength: 0.68,
          lowPercentile: 0.01,
          highPercentile: 0.99,
        };
        reasons.push("Mild source range fitting lifts low-spread photo tones.");
      } else if (metrics.lumaStdDev >= 70) {
        recommendation.dynamicRangeCompression = {
          mode: "display",
          strength: 0.78,
        };
        reasons.push("Wide photo luminance gets restrained before dithering.");
      } else {
        recommendation.dynamicRangeCompression = {
          mode: "display",
          strength: 0.7,
        };
      }
      break;
    case "flatIllustration":
      recommendation.toneMapping = {
        mode: "scurve",
        exposure: 1.06,
        saturation: metrics.highSaturationRatio >= 0.28 ? 1.35 : 1.45,
        strength: 0.68,
        shadowBoost: 0.06,
        highlightCompress: 1.2,
        midpoint: 0.5,
      };
      recommendation.dynamicRangeCompression = { mode: "off" };
      reasons.push("Flat artwork starts vivid, then uses gentler curve shaping.");
      break;
    case "textOrUi":
      recommendation.toneMapping = {
        mode: "contrast",
        exposure: 1.04,
        saturation: metrics.grayRatio >= 0.7 ? 0.85 : 1,
        contrast: 1.2,
      };
      recommendation.dynamicRangeCompression = {
        mode: "display",
        strength: 0.72,
      };
      reasons.push("UI-like content gets readable contrast before quantization.");
      break;
    case "lineArt":
      recommendation.toneMapping = {
        mode: "contrast",
        exposure: 1,
        saturation: 0.75,
        contrast: metrics.lumaRange <= 96 ? 1.42 : 1.25,
      };
      recommendation.dynamicRangeCompression = {
        mode: metrics.lumaRange <= 96 ? "auto" : "display",
        strength: metrics.lumaRange <= 96 ? 0.9 : 0.65,
        lowPercentile: 0.02,
        highPercentile: 0.98,
      };
      recommendation.levelCompression =
        metrics.lumaRange <= 96
          ? { mode: "luma", black: 6, white: 248 }
          : recommendation.levelCompression;
      reasons.push("Line art gets desaturated contrast for cleaner edges.");
      break;
    case "pixelArt":
      recommendation.toneMapping = { mode: "off", exposure: 1, saturation: 1 };
      recommendation.dynamicRangeCompression = { mode: "off" };
      reasons.push("Pixel art avoids tone reshaping and diffusion texture.");
      break;
    case "unknown":
    default:
      recommendation.dynamicRangeCompression = {
        mode: "display",
        strength: 0.72,
      };
      break;
  }

  if (
    paletteProfile &&
    paletteProfile.lumaRange <= 150 &&
    recommendation.dynamicRangeCompression?.mode === "off"
  ) {
    recommendation.dynamicRangeCompression = {
      mode: "display",
      strength: 0.7,
    };
  }
}

function describeLayeredAdjustments(recommendation: RecommendationBase) {
  const tone = recommendation.toneMapping?.mode ?? "off";
  const range = recommendation.dynamicRangeCompression?.mode ?? "off";
  const level = recommendation.levelCompression?.mode;
  return `${tone} tone controls with ${range} range fitting${
    level && level !== "off" ? ` and ${level} level containment` : ""
  }.`;
}

function applyLowContrastRestoreTuning(
  recommendation: RecommendationBase,
  classification: ImageStyleClassification,
  reasons: string[]
) {
  if (!isRestorableLowContrastSource(classification)) return;

  const { metrics } = classification;
  recommendation.processingPreset = "restore";
  recommendation.colorMatching = metrics.grayRatio >= 0.55 ? "lab" : "rgb";
  recommendation.errorDiffusionMatrix = "floydSteinberg";
  recommendation.ditheringType = "errorDiffusion";
  recommendation.toneMapping = {
    mode: "scurve",
    exposure: metrics.lumaP95 <= 190 ? 1.1 : 1.06,
    saturation: metrics.grayRatio >= 0.72 ? 0 : 0.9,
    strength: metrics.lumaRange <= 70 ? 1 : 0.92,
    shadowBoost: metrics.lumaP05 >= 55 ? 0.2 : 0.28,
    highlightCompress: 0.75,
    midpoint: metrics.lumaP95 <= 190 ? 0.44 : 0.46,
  };
  recommendation.dynamicRangeCompression = {
    mode: "auto",
    strength: metrics.lumaRange <= 70 ? 0.96 : 0.9,
    lowPercentile: 0.02,
    highPercentile: 0.98,
  };
  recommendation.levelCompression = {
    mode: "luma",
    black: 8,
    white: 245,
  };
  reasons.push(
    "Faded low-contrast source uses restore-style range expansion before dithering."
  );
}

function isRestorableLowContrastSource(
  classification: ImageStyleClassification
) {
  const { metrics } = classification;
  if (classification.kind === "lowContrastPhoto") return true;
  if (metrics.lumaRange > 96 || metrics.lumaStdDev > 32) return false;
  if (metrics.grayRatio < 0.5 && metrics.saturationMean > 0.18) return false;
  if (classification.kind === "pixelArt") return false;

  const hasRecoverableStructure =
    metrics.edgeDensity >= 0.015 ||
    metrics.softChangeRatio >= 0.12 ||
    metrics.gradientTileRatio >= 0.04 ||
    metrics.textTileRatio >= 0.04 ||
    (metrics.lumaRange <= 70 &&
      metrics.grayRatio >= 0.7 &&
      metrics.paletteEntropy >= 0.35 &&
      metrics.topColorCoverage <= 0.92);

  return hasRecoverableStructure;
}

function applyPosterScanTuning(
  recommendation: RecommendationBase,
  classification: ImageStyleClassification,
  reasons: string[]
) {
  if (!isWarmPosterScanSource(classification)) return;

  recommendation.processingPreset = "posterScan";
  recommendation.colorMatching = "rgb";
  recommendation.errorDiffusionMatrix = "floydSteinberg";
  recommendation.ditheringType = "errorDiffusion";
  recommendation.paperNormalization = {
    mode: "warmPaper",
    strength: 0.95,
    minLuma: 82,
    saturationThreshold: 0.56,
    warmBiasThreshold: 8,
    blackAnchor: 0.95,
    preserveRed: 0.85,
    paperWhite: [248, 248, 246],
  };
  recommendation.toneMapping = {
    mode: "scurve",
    exposure: 1.04,
    saturation: 1.05,
    strength: 0.92,
    shadowBoost: 0.08,
    highlightCompress: 0.55,
    midpoint: 0.44,
  };
  recommendation.dynamicRangeCompression = {
    mode: "auto",
    strength: 1,
    lowPercentile: 0.015,
    highPercentile: 0.985,
  };
  recommendation.levelCompression = {
    mode: "luma",
    black: 3,
    white: 252,
  };
  reasons.push(
    "Warm poster paper is neutralized while black and red ink are preserved."
  );
}

function isWarmPosterScanSource(classification: ImageStyleClassification) {
  const { metrics } = classification;
  const hasWarmPaper = metrics.warmPaperRatio >= 0.18;
  const hasInk =
    metrics.darkNeutralRatio >= 0.025 ||
    metrics.redRatio >= 0.008 ||
    metrics.strongEdgeRatio >= 0.05;
  const isGraphicOrPosterLike =
    classification.kind === "flatIllustration" ||
    classification.kind === "textOrUi" ||
    classification.kind === "lineArt" ||
    metrics.flatRatio >= 0.5 ||
    metrics.topColorCoverage >= 0.36;

  return hasWarmPaper && hasInk && isGraphicOrPosterLike;
}

function getPresetScores(
  classification: ImageStyleClassification,
  paletteProfile: PaletteProfile | null,
  intent: AutoProcessingIntent
): Record<string, number> {
  const { metrics } = classification;
  const { kindScores } = classification;
  const scores: Record<string, number> = {
    balanced: 0.52,
    dynamic: 0.48,
    vivid: 0.45,
    soft: 0.44,
    grayscale: 0.28,
    restore: 0.34,
    posterScan: 0.32,
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
  scores.restore += kindScores.lowContrastPhoto * 0.34;
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

  if (metrics.lumaRange <= 96 && metrics.lumaStdDev <= 38) {
    scores.restore += 0.2;
  }

  if (isWarmPosterScanSource(classification)) {
    scores.posterScan += 0.42;
  }

  if (paletteProfile && paletteProfile.colorCount <= 2) {
    scores.grayscale += 0.3;
    scores.vivid -= 0.1;
  }

  if (intent === "vivid") scores.vivid += 0.18;
  if (intent === "faithful") scores.balanced += 0.16;
  if (intent === "lowNoise") scores.soft += 0.16;
  if (intent === "readable") {
    scores.balanced += 0.14;
    scores.grayscale += 0.1;
  }

  return scores;
}

function addClassificationReasons(
  classification: ImageStyleClassification,
  reasons: string[]
) {
  const { metrics } = classification;
  reasons.push(`Detected ${classification.kind}.`);

  if (metrics.flatRatio >= 0.65) {
    reasons.push("Large flat regions suggest graphic-style preservation.");
  }
  if (metrics.softChangeRatio >= 0.38) {
    reasons.push("Soft tonal transitions suggest photo-oriented processing.");
  }
  if (metrics.lumaStdDev <= 28) {
    reasons.push("Low luminance spread benefits from stronger tone shaping.");
  }
  if (metrics.lumaRange > 0 && metrics.lumaRange <= 96) {
    reasons.push("Narrow usable luminance range benefits from percentile expansion.");
  }
  if (metrics.lumaStdDev >= 72) {
    reasons.push("High luminance spread benefits from softer compression.");
  }
  if (metrics.strongEdgeRatio >= 0.22) {
    reasons.push("Strong edges favor sharper edge handling.");
  }
  if (metrics.topColorCoverage >= 0.55) {
    reasons.push("Dominant repeated colors suggest careful palette matching.");
  }
  if (metrics.textTileRatio >= 0.12) {
    reasons.push("Text-like tiles favor readable edge handling.");
  }
  if (metrics.warmPaperRatio >= 0.18) {
    reasons.push("Warm paper-like background should be neutralized before matching.");
  }
  if (metrics.darkNeutralRatio >= 0.025) {
    reasons.push("Dark neutral ink can be anchored harder toward black.");
  }
  if (metrics.photoTileRatio >= 0.4) {
    reasons.push("Photo-like tiles favor smoother tonal processing.");
  }
  if (metrics.edgeDensity >= 0.14) {
    reasons.push("High edge density affects dithering and matching choice.");
  }
}

function addPaletteReasons(
  paletteProfile: PaletteProfile | null,
  reasons: string[]
) {
  if (!paletteProfile) return;

  if (paletteProfile.colorCount <= 2) {
    reasons.push("Two-color palette favors LAB matching and grayscale-safe output.");
  } else if (paletteProfile.averageSaturation >= 0.55) {
    reasons.push("Colorful target palette can support vivid color mapping.");
  }

  if (paletteProfile.lumaRange <= 150) {
    reasons.push("Limited palette luminance range benefits from range compression.");
  }
}

function applyIntent(
  recommendation: RecommendationBase,
  intent: AutoProcessingIntent,
  reasons: string[]
) {
  if (intent === "vivid") {
    recommendation.processingPreset = "vivid";
    recommendation.colorMatching = "rgb";
    recommendation.toneMapping = {
      ...recommendation.toneMapping,
      mode: "scurve",
      saturation: Math.max(recommendation.toneMapping?.saturation ?? 1, 1.45),
      strength: recommendation.toneMapping?.strength ?? 0.72,
      shadowBoost: recommendation.toneMapping?.shadowBoost ?? 0.08,
      highlightCompress: recommendation.toneMapping?.highlightCompress ?? 1.3,
      midpoint: recommendation.toneMapping?.midpoint ?? 0.5,
    };
    reasons.push("Vivid intent boosts saturation and color-priority matching.");
  } else if (intent === "readable") {
    recommendation.colorMatching = "lab";
    recommendation.ditheringType = "quantizationOnly";
    reasons.push("Readable intent favors clear edges over dithering texture.");
  } else if (intent === "lowNoise") {
    recommendation.errorDiffusionMatrix = "stucki";
    recommendation.processingPreset = "soft";
    reasons.push("Low-noise intent chooses smoother tone handling.");
  } else if (intent === "faithful") {
    recommendation.processingPreset = "balanced";
    reasons.push("Faithful intent keeps transformations restrained.");
  }
}

function applyLearnedTuning(
  recommendation: RecommendationBase,
  classification: ImageStyleClassification,
  intent: AutoProcessingIntent,
  reasons: string[]
) {
  if (intent !== "natural") return;

  const { metrics } = classification;

  if (isRestorableLowContrastSource(classification)) return;

  if (
    classification.kind === "flatIllustration" &&
    metrics.grayRatio >= 0.82 &&
    metrics.topColorCoverage >= 0.9 &&
    (metrics.textTileRatio >= 0.1 || metrics.edgeDensity >= 0.16)
  ) {
    recommendation.processingPreset = "balanced";
    recommendation.colorMatching = "lab";
    recommendation.ditheringType = "quantizationOnly";
    recommendation.toneMapping = {
      mode: "contrast",
      exposure: 1.03,
      saturation: 0.9,
      contrast: 1.2,
    };
    recommendation.dynamicRangeCompression = {
      mode: "display",
      strength: 0.75,
    };
    reasons.push("Pairwise ratings favored readable settings for gray UI-like artwork.");
    return;
  }

  if (classification.kind === "flatIllustration") {
    reasons.push("Pairwise ratings favored gentler vivid tone mapping for flat artwork.");
  }

  if (classification.kind === "highContrastPhoto") {
    reasons.push("Pairwise ratings favored balanced tone handling for high-contrast photos.");
  }
}

function applyPaletteTuning(
  recommendation: RecommendationBase,
  paletteProfile: PaletteProfile | null,
  reasons: string[]
) {
  if (!paletteProfile) return;

  if (paletteProfile.colorCount <= 2) {
    recommendation.colorMatching = "lab";
    recommendation.processingPreset = "grayscale";
    recommendation.toneMapping = {
      mode: "scurve",
      exposure: 1,
      saturation: 0,
      strength: 0.8,
      shadowBoost: 0.1,
      highlightCompress: 1.4,
      midpoint: 0.5,
    };
    reasons.push("Monochrome palette switches to grayscale-oriented settings.");
  } else if (paletteProfile.lumaRange <= 150) {
    recommendation.dynamicRangeCompression = {
      mode: "display",
      strength: Math.max(
        recommendation.dynamicRangeCompression?.strength ?? 0,
        0.8
      ),
    };
  }
}

function enforceQuantizationGuard(
  recommendation: RecommendationBase,
  classification: ImageStyleClassification,
  reasons: string[]
) {
  if (recommendation.ditheringType !== "quantizationOnly") return;

  if (isClearlyQuantizationFriendly(classification)) {
    reasons.push(
      "Very flat artwork with little photo or gradient detail can skip dithering."
    );
    return;
  }

  recommendation.ditheringType = "errorDiffusion";
  reasons.push("Photo-like detail or subtle gradients keep dithering enabled.");
}

function isClearlyQuantizationFriendly(
  classification: ImageStyleClassification
) {
  const { metrics } = classification;
  const hasPhotoLikeDetail =
    classification.style === "photo" ||
    classification.photoScore >= 0.34 ||
    metrics.photoTileRatio >= 0.1 ||
    metrics.gradientTileRatio >= 0.08 ||
    metrics.softChangeRatio >= 0.28;

  if (hasPhotoLikeDetail) return false;

  const hasFlatRepeatedColor =
    metrics.flatRatio >= 0.7 &&
    metrics.topColorCoverage >= 0.72 &&
    metrics.paletteEntropy <= 0.72;
  const hasClearTextOrUi =
    metrics.textTileRatio >= 0.16 &&
    metrics.edgeDensity >= 0.1 &&
    metrics.grayRatio >= 0.5 &&
    metrics.topColorCoverage >= 0.62;
  const hasClearLineArt =
    metrics.grayRatio >= 0.76 &&
    metrics.edgeDensity >= 0.12 &&
    metrics.topColorCoverage >= 0.68 &&
    metrics.highSaturationRatio <= 0.08;
  const hasClearPixelArt =
    metrics.flatRatio >= 0.78 &&
    metrics.flatTileRatio >= 0.44 &&
    metrics.topColorCoverage >= 0.78 &&
    metrics.softChangeRatio <= 0.16;

  return (
    hasFlatRepeatedColor &&
    (hasClearTextOrUi || hasClearLineArt || hasClearPixelArt)
  );
}

function getBestScore(scores: Record<string, number>): ProcessingPresetName {
  return Object.entries(scores).reduce(
    (best, current) => (current[1] > best[1] ? current : best),
    ["balanced", -Infinity]
  )[0] as ProcessingPresetName;
}

function getPaletteProfile(
  palette: PaletteColorEntry[] | string[] | undefined
): PaletteProfile | null {
  if (!palette?.length) return null;

  const colors = palette
    .map((entry) => (typeof entry === "string" ? entry : entry.color))
    .map(hexToRgb)
    .filter((color): color is [number, number, number] => color !== null);

  if (!colors.length) return null;

  const lumas = colors.map(([r, g, b]) => getLuma(r, g, b));
  const saturations = colors.map(([r, g, b]) => getSaturation(r, g, b));

  return {
    colorCount: colors.length,
    lumaRange: Math.max(...lumas) - Math.min(...lumas),
    saturationRange: Math.max(...saturations) - Math.min(...saturations),
    averageSaturation:
      saturations.reduce((sum, saturation) => sum + saturation, 0) /
      saturations.length,
  };
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

function getSaturation(red: number, green: number, blue: number): number {
  const max = Math.max(red, green, blue) / 255;
  const min = Math.min(red, green, blue) / 255;

  return max === 0 ? 0 : (max - min) / max;
}
