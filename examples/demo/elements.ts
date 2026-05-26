export const $ = <T extends HTMLElement>(id: string) =>
  document.getElementById(id) as T;

export const fileInput = $("fileInput") as HTMLInputElement;
export const sampleImageGrid = $("sampleImageGrid") as HTMLDivElement;
export const imageStyleValue = $("imageStyleValue") as HTMLElement;
export const imageStyleConfidence = $(
  "imageStyleConfidence",
) as HTMLSpanElement;
export const imageStyleMeter = $("imageStyleMeter") as HTMLSpanElement;
export const imageStyleMetrics = $("imageStyleMetrics") as HTMLDListElement;
export const canvasGrid = $("canvasGrid") as HTMLDivElement;
export const inputCanvas = $("inputCanvas") as HTMLCanvasElement;
export const outputCanvas = $("outputCanvas") as HTMLCanvasElement;
export const deviceColorsCanvas = $("deviceColorsCanvas") as HTMLCanvasElement;
export const canvasFrames = Array.from(
  document.querySelectorAll<HTMLDivElement>("[data-scroll-sync]"),
);
export const toggleOriginalSizeButton = $(
  "toggleOriginalSizeButton",
) as HTMLButtonElement;
export const downloadLink = $("downloadLink") as HTMLAnchorElement;
export const downloadDeviceColorsLink = $(
  "downloadDeviceColorsLink",
) as HTMLAnchorElement;
export const configOutput = $("configOutput") as HTMLPreElement;
export const copyConfigButton = $("copyConfigButton") as HTMLButtonElement;
export const jsExampleOutput = $("jsExampleOutput") as HTMLPreElement;
export const copyJsExampleButton = $(
  "copyJsExampleButton",
) as HTMLButtonElement;
export const screenResolutionSelect = $(
  "screenResolutionSelect",
) as HTMLSelectElement;
export const orientationSelect = $("orientationSelect") as HTMLSelectElement;
export const imageFitSelect = $("imageFitSelect") as HTMLSelectElement;
export const paperIdInput = $("paperIdInput") as HTMLInputElement;
export const apiKeyInput = $("apiKeyInput") as HTMLInputElement;
export const testOnDeviceButton = $("testOnDeviceButton") as HTMLButtonElement;
export const deviceTestStatus = $("deviceTestStatus") as HTMLParagraphElement;

export const paletteSelect = $("paletteSelect") as HTMLSelectElement;
export const palettePreview = $("palettePreview") as HTMLDivElement;
export const deviceColorsPreview = $("deviceColorsPreview") as HTMLDivElement;
export const processingPresetSelect = $(
  "processingPreset",
) as HTMLSelectElement;
export const ditheringTypeSelect = $("ditheringType") as HTMLSelectElement;
export const errorDiffusionMatrixSelect = $(
  "errorDiffusionMatrix",
) as HTMLSelectElement;
export const orderedDitheringMatrixW = $(
  "orderedDitheringMatrixW",
) as HTMLInputElement;
export const orderedDitheringMatrixH = $(
  "orderedDitheringMatrixH",
) as HTMLInputElement;
export const randomDitheringTypeSelect = $(
  "randomDitheringType",
) as HTMLSelectElement;
export const serpentineCheckbox = $("serpentine") as HTMLInputElement;
export const colorMatchingSelect = $("colorMatching") as HTMLSelectElement;
export const autoRecommendationTitle = $(
  "autoRecommendationTitle",
) as HTMLElement;
export const autoRecommendationSummary = $(
  "autoRecommendationSummary",
) as HTMLElement;
export const autoRecommendationReasons = $(
  "autoRecommendationReasons",
) as HTMLUListElement;

export const toneModeSelect = $("toneMode") as HTMLSelectElement;
export const exposureInput = $("exposure") as HTMLInputElement;
export const saturationInput = $("saturation") as HTMLInputElement;
export const contrastInput = $("contrast") as HTMLInputElement;
export const scurveStrengthInput = $("scurveStrength") as HTMLInputElement;
export const shadowBoostInput = $("shadowBoost") as HTMLInputElement;
export const highlightCompressInput = $(
  "highlightCompress",
) as HTMLInputElement;
export const midpointInput = $("midpoint") as HTMLInputElement;

export const dynamicRangeModeSelect = $(
  "dynamicRangeMode",
) as HTMLSelectElement;
export const dynamicRangeStrengthInput = $(
  "dynamicRangeStrength",
) as HTMLInputElement;
export const lowPercentileInput = $("lowPercentile") as HTMLInputElement;
export const highPercentileInput = $("highPercentile") as HTMLInputElement;
