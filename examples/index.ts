import {
  applyImageAdjustments,
  ditherCanvas,
  getProcessingPreset,
  getProcessingPresetOptions,
  replaceColors,
  suggestCanvasDitherOptions,
  suggestCanvasImageAdjustmentOptions,
  suggestLayeredCanvasProcessingOptions,
  suggestCanvasProcessingOptions,
} from "../src";
import type {
  AutoCanvasDitherSuggestion,
  AutoImageAdjustmentOptions,
  AutoImageAdjustmentSuggestion,
  DitherImageOptions,
  DitherProcessingEngine,
  ImageStyleClassification,
  PaletteColorEntry,
  ProcessingSuggestion,
} from "../src";
import {
  DEFAULT_DITHER_OPTIONS,
  PALETTE_OPTIONS,
} from "./demo/constants";
import {
  getOriginalImageOrientation,
  getSelectedImageFit,
  getSelectedOrientation,
  getSelectedScreenResolution,
  loadDeviceTestConfig,
  saveDeviceTestConfig,
  setDeviceTestStatus,
  testOnDevice,
} from "./demo/device-test";
import {
  autoAdjustmentsButton,
  adjustedCanvas,
  apiKeyInput,
  autoRecommendationReasons,
  autoRecommendationTitle,
  autoFlowSelect,
  canvasFrames,
  canvasGrid,
  clarityInput,
  colorMatchingSelect,
  configPanels,
  configTabButtons,
  configOutput,
  contrastInput,
  copyConfigButton,
  copyJsAdvancedExampleButton,
  copyJsExampleButton,
  deviceColorsCanvas,
  deviceColorsPreview,
  downloadDeviceColorsLink,
  downloadLink,
  dynamicRangeModeSelect,
  dynamicRangeStrengthInput,
  edgeAntialiasingCheckbox,
  edgeAntialiasingStrengthInput,
  edgePreservationCheckbox,
  edgePreservationStrengthInput,
  errorDiffusionMatrixSelect,
  exposureInput,
  fileInput,
  highPercentileInput,
  histogramPreviewCanvas,
  highlightCompressInput,
  imageFitToggleButtons,
  imageFitSelect,
  imageStyleConfidence,
  imageStyleMeter,
  imageStyleMetrics,
  imageStyleValue,
  inputCanvas,
  jsAdvancedExampleOutput,
  jsExampleOutput,
  lowPercentileInput,
  midpointInput,
  orderedDitheringMatrixH,
  orderedDitheringMatrixW,
  orientationSelect,
  orientationToggleButtons,
  outputCanvas,
  palettePreview,
  paletteSelect,
  paperIdInput,
  processingEngineSelect,
  processingPresetSelect,
  randomDitheringTypeSelect,
  rangeFittingPreviewCanvas,
  resetImageAdjustmentsButton,
  sampleImageGrid,
  saturationInput,
  screenResolutionSelect,
  scurveStrengthInput,
  serpentineCheckbox,
  shadowBoostInput,
  testOnDeviceButton,
  toneCurvePreviewCanvas,
  toggleOriginalSizeButton,
  ditheringTypeSelect,
} from "./demo/elements";
import {
  formatDecimal,
  formatImageKind,
  formatImageStyle,
  formatPresetName,
  formatRatio,
} from "./demo/format";
import { renderColorPalette } from "./demo/palette-preview";
import {
  drawHistogramPreview,
  drawRangeFittingPreview,
  drawToneCurvePreview,
} from "./demo/preview-charts";
import type {
  DemoConfig,
  DynamicRangeMode,
  ImageFitMode,
} from "./demo/types";

const sampleImages = import.meta.glob("./sampleImages/*.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const sampleImagePreviews = import.meta.glob(
  "./sampleImages/previews/*.{jpg,jpeg,png,webp}",
  {
    eager: true,
    query: "?url",
    import: "default",
  },
) as Record<string, string>;

let lastImage: HTMLImageElement | null = null;
let selectedSampleUrl = "";
const sampleNameByUrl = new Map<string, string>();
let scheduledProcess = 0;
let processToken = 0;
let showOriginalSize = false;
let currentProcessingSuggestion: ProcessingSuggestion | null = null;
let previousAutoSuggestion: ProcessingSuggestion | null = null;
let layeredAutoSuggestion: ProcessingSuggestion | null = null;
let layeredImageAdjustmentSuggestion: AutoImageAdjustmentSuggestion | null = null;
let layeredCanvasDitherSuggestion: AutoCanvasDitherSuggestion | null = null;
let autoControlsDirty = false;
let workerRequestId = 0;
let processingWorker: Worker | null = null;
let cancelProcessingWorkerRequest: (() => void) | null = null;
const downloadObjectUrls = new Map<HTMLAnchorElement, string>();
let autoAnalysisCache:
  | {
      key: string;
      previous: ProcessingSuggestion;
      layered: ProcessingSuggestion;
      imageAdjustments: AutoImageAdjustmentSuggestion;
      canvasDither: AutoCanvasDitherSuggestion;
    }
  | null = null;
let syncingCanvasScroll = false;

const FULL_AUTO_PRESET_VALUE = "auto";
const AUTO_DITHER_PRESET_VALUE = "autoDitherManual";
const DEFAULT_SAMPLE_IMAGE_KEY = "paint.jpg";
const DEFAULT_TONE_CURVE_STRENGTH = 0.85;
const DEFAULT_TONE_CURVE_MIDPOINT = 0.5;
const AUTO_DITHER_CONTROL_IDS = new Set([
  "ditheringType",
  "errorDiffusionMatrix",
  "orderedDitheringMatrixW",
  "orderedDitheringMatrixH",
  "randomDitheringType",
  "serpentine",
  "colorMatching",
  "processingEngine",
  "edgePreservation",
  "edgePreservationStrength",
  "edgeAntialiasing",
  "edgeAntialiasingStrength",
]);
const KERNEL_DITHERING_TYPES = new Set([
  "errorDiffusion",
  "ditherItErrorDiffusion",
]);
const ORDERED_DITHERING_TYPES = new Set(["ordered", "ditherItOrdered"]);
const DITHER_IT_UNSUPPORTED_KERNELS = new Set(["falseFloydSteinberg"]);

function isFullAutoPreset() {
  return processingPresetSelect.value === FULL_AUTO_PRESET_VALUE;
}

function isAutoDitherPreset() {
  return processingPresetSelect.value === AUTO_DITHER_PRESET_VALUE;
}

function usesAutoAnalysisPreset() {
  return isFullAutoPreset() || isAutoDitherPreset();
}

function syncToggleButtons(
  buttons: HTMLButtonElement[],
  selectedValue: string,
  datasetKey: "orientationOption" | "imageFitOption",
) {
  for (const button of buttons) {
    const selected = button.dataset[datasetKey] === selectedValue;
    button.setAttribute("aria-checked", String(selected));
    button.tabIndex = selected ? 0 : -1;
  }
}

function syncWorkspaceToggleControls() {
  syncToggleButtons(
    orientationToggleButtons,
    orientationSelect.value,
    "orientationOption",
  );
  syncToggleButtons(imageFitToggleButtons, imageFitSelect.value, "imageFitOption");
}

function selectWorkspaceToggleValue(
  select: HTMLSelectElement,
  value: string | undefined,
) {
  if (!value || select.value === value) return;
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function setupWorkspaceToggleButtons(
  buttons: HTMLButtonElement[],
  select: HTMLSelectElement,
  datasetKey: "orientationOption" | "imageFitOption",
) {
  buttons.forEach((button, index) => {
    button.addEventListener("click", () => {
      selectWorkspaceToggleValue(select, button.dataset[datasetKey]);
    });

    button.addEventListener("keydown", (event) => {
      const direction =
        event.key === "ArrowRight" || event.key === "ArrowDown"
          ? 1
          : event.key === "ArrowLeft" || event.key === "ArrowUp"
            ? -1
            : 0;
      if (direction === 0) return;

      event.preventDefault();
      const nextIndex = (index + direction + buttons.length) % buttons.length;
      const nextButton = buttons[nextIndex];
      nextButton.focus();
      selectWorkspaceToggleValue(select, nextButton.dataset[datasetKey]);
    });
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  setupCanvasDownloads();
  setupWorkspaceToggleButtons(
    orientationToggleButtons,
    orientationSelect,
    "orientationOption",
  );
  setupWorkspaceToggleButtons(
    imageFitToggleButtons,
    imageFitSelect,
    "imageFitOption",
  );
  populateSampleImageOptions();
  populateProcessingPresetOptions();
  loadDeviceTestConfig();
  syncWorkspaceToggleControls();
  applyPresetToUI(processingPresetSelect.value);
  updateCanvasSizeMode();
  refreshControlState();

  await loadSelectedSampleImage();
});

function updateCanvasSizeMode() {
  canvasGrid.classList.toggle("original-size", showOriginalSize);
  toggleOriginalSizeButton.textContent = showOriginalSize
    ? "Fit to panel"
    : "Show original size";
  toggleOriginalSizeButton.setAttribute(
    "aria-pressed",
    String(showOriginalSize),
  );

  if (showOriginalSize) {
    syncCanvasFrameScroll(canvasFrames[0] ?? null);
    return;
  }

  for (const frame of canvasFrames) {
    frame.scrollTo({ left: 0, top: 0 });
  }
}

function syncCanvasFrameScroll(source: HTMLDivElement | null) {
  if (!showOriginalSize || syncingCanvasScroll || !source) return;

  syncingCanvasScroll = true;

  try {
    for (const frame of canvasFrames) {
      if (frame === source) continue;
      frame.scrollLeft = source.scrollLeft;
      frame.scrollTop = source.scrollTop;
    }
  } finally {
    syncingCanvasScroll = false;
  }
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

function populateSampleImageOptions() {
  sampleImageGrid.innerHTML = "";
  const entries = Object.entries(sampleImages).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const previewByName = new Map(
    Object.entries(sampleImagePreviews).map(([path, url]) => [
      sampleKey(path),
      url,
    ]),
  );

  for (const [path, url] of entries) {
    const name = formatSampleName(path);
    sampleNameByUrl.set(url, name);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sample-thumb";
    button.dataset.sampleUrl = url;
    button.setAttribute("aria-label", name);
    button.title = name;

    const img = document.createElement("img");
    img.src = previewByName.get(sampleKey(path)) ?? url;
    img.alt = "";
    img.loading = "lazy";
    button.append(img);

    button.addEventListener("click", async () => {
      selectedSampleUrl = url;
      updateSelectedSampleButton();
      await loadSelectedSampleImage();
    });

    sampleImageGrid.append(button);
  }

  selectedSampleUrl =
    entries.find(([path]) => sampleKey(path) === DEFAULT_SAMPLE_IMAGE_KEY)?.[1] ??
    entries[0]?.[1] ??
    "";
  updateSelectedSampleButton();
}

function updateSelectedSampleButton() {
  sampleImageGrid
    .querySelectorAll<HTMLButtonElement>(".sample-thumb")
    .forEach((button) => {
      const selected = button.dataset.sampleUrl === selectedSampleUrl;
      button.classList.toggle("selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
}

function populateProcessingPresetOptions() {
  processingPresetSelect.innerHTML = "";
  const autoOption = document.createElement("option");
  autoOption.value = FULL_AUTO_PRESET_VALUE;
  autoOption.textContent = "Auto";
  processingPresetSelect.append(autoOption);

  const autoDitherOption = document.createElement("option");
  autoDitherOption.value = AUTO_DITHER_PRESET_VALUE;
  autoDitherOption.textContent = "Auto canvas dither (manual image adjustments)";
  processingPresetSelect.append(autoDitherOption);

  for (const preset of getProcessingPresetOptions()) {
    const option = document.createElement("option");
    option.value = preset.value;
    option.textContent = preset.title;
    processingPresetSelect.append(option);
  }
  processingPresetSelect.value = FULL_AUTO_PRESET_VALUE;
}

async function loadImage(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

function applyImageOrientationToUI(img: HTMLImageElement) {
  orientationSelect.value = getOriginalImageOrientation(img);
  syncWorkspaceToggleControls();
  saveDeviceTestConfig();
}

async function loadSelectedSampleImage() {
  const src =
    selectedSampleUrl || import.meta.env.BASE_URL + "example-dither.jpg";
  lastImage = await loadImage(src);
  applyImageOrientationToUI(lastImage);
  autoControlsDirty = false;
  await processImage();
}

function drawImageToScreenCanvas(
  img: HTMLImageElement,
  canvas: HTMLCanvasElement,
) {
  const { width, height } = getSelectedScreenResolution();
  const ctx = canvas.getContext("2d")!;
  const orientation = getSelectedOrientation();
  const imageFit = getSelectedImageFit();

  const resolvedOrientation =
    orientation === "original" ? getOriginalImageOrientation(img) : orientation;
  const canvasWidth = resolvedOrientation === "portrait" ? height : width;
  const canvasHeight = resolvedOrientation === "portrait" ? width : height;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  drawImageWithFit(img, ctx, canvasWidth, canvasHeight, imageFit);
}

function drawImageWithFit(
  img: HTMLImageElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  imageFit: ImageFitMode,
) {
  const imageWidth = img.naturalWidth || img.width;
  const imageHeight = img.naturalHeight || img.height;
  const scale =
    imageFit === "cover"
      ? Math.max(width / imageWidth, height / imageHeight)
      : Math.min(width / imageWidth, height / imageHeight);
  const drawWidth = Math.round(imageWidth * scale);
  const drawHeight = Math.round(imageHeight * scale);
  const offsetX = Math.round((width - drawWidth) / 2);
  const offsetY = Math.round((height - drawHeight) / 2);

  ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
}

function setInputValue(input: HTMLInputElement, value: number | undefined) {
  if (typeof value === "number") input.value = String(value);
}

function setResolvedInputValue(
  input: HTMLInputElement,
  value: number | undefined,
  fallback: number,
) {
  input.value = String(value ?? fallback);
}

function setSelectValue(select: HTMLSelectElement, value: string | undefined) {
  if (
    typeof value === "string" &&
    Array.from(select.options).some((option) => option.value === value)
  ) {
    select.value = value;
  }
}

function setOptionDisabled(
  select: HTMLSelectElement,
  value: string,
  disabled: boolean,
  reason = "",
) {
  const option = Array.from(select.options).find(
    (candidate) => candidate.value === value,
  );
  if (!option) return;
  option.disabled = disabled;
  option.title = disabled ? reason : "";
}

function selectFirstEnabledOption(select: HTMLSelectElement) {
  const firstEnabled = Array.from(select.options).find(
    (option) => !option.disabled,
  );
  if (firstEnabled && select.options[select.selectedIndex]?.disabled) {
    select.value = firstEnabled.value;
  }
}

function setFormControlEnabled(
  control: HTMLInputElement | HTMLSelectElement,
  enabled: boolean,
  reason = "",
) {
  control.disabled = !enabled;
  control.title = enabled ? "" : reason;
  control
    .closest<HTMLElement>(".control, .check")
    ?.classList.toggle("is-disabled", !enabled);
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getClarityFromUI() {
  const amount = readNumber(clarityInput, 0);
  if (numbersEqual(amount, 0)) return undefined;

  return {
    amount: Math.sign(amount) * Math.pow(Math.abs(amount), 1.1),
    radius: 2,
    midtone: 1.2,
  };
}

function getClaritySliderValue(
  clarity: DitherImageOptions["clarity"] | undefined,
) {
  const amount = clarity?.amount;
  if (typeof amount !== "number") return 0;

  return Math.sign(amount) * Math.pow(Math.abs(amount), 1 / 1.1);
}

function applyManualAdjustmentDefaultsToUI() {
  setResolvedInputValue(exposureInput, undefined, 0);
  setResolvedInputValue(saturationInput, undefined, 0);
  setResolvedInputValue(contrastInput, undefined, 0);
  setResolvedInputValue(clarityInput, undefined, 0);
  setResolvedInputValue(scurveStrengthInput, undefined, 0);
  setResolvedInputValue(shadowBoostInput, undefined, 0);
  setResolvedInputValue(highlightCompressInput, undefined, 0);
  setResolvedInputValue(midpointInput, undefined, DEFAULT_TONE_CURVE_MIDPOINT);

  dynamicRangeModeSelect.value = "off";
  setResolvedInputValue(dynamicRangeStrengthInput, undefined, 1);
  setResolvedInputValue(lowPercentileInput, undefined, 0.01);
  setResolvedInputValue(highPercentileInput, undefined, 0.99);
}

function applyPresetToUI(name: string) {
  if (name === FULL_AUTO_PRESET_VALUE) return;

  if (name === AUTO_DITHER_PRESET_VALUE) {
    applyManualAdjustmentDefaultsToUI();
    return;
  }

  const preset = getProcessingPreset(name);
  if (!preset) return;

  setResolvedInputValue(
    exposureInput,
    preset.toneMapping.exposure,
    0,
  );
  setResolvedInputValue(
    saturationInput,
    preset.toneMapping.saturation,
    0,
  );
  setResolvedInputValue(
    contrastInput,
    preset.toneMapping.contrast,
    0,
  );
  setResolvedInputValue(clarityInput, undefined, 0);
  setResolvedInputValue(
    scurveStrengthInput,
    preset.toneMapping.mode === "scurve" ? preset.toneMapping.strength : 0,
    0,
  );
  setResolvedInputValue(shadowBoostInput, preset.toneMapping.shadowBoost, 0);
  setResolvedInputValue(
    highlightCompressInput,
    preset.toneMapping.highlightCompress,
    0,
  );
  setResolvedInputValue(
    midpointInput,
    preset.toneMapping.midpoint,
    DEFAULT_TONE_CURVE_MIDPOINT,
  );

  dynamicRangeModeSelect.value = preset.dynamicRangeCompression?.mode ?? "off";
  setInputValue(
    dynamicRangeStrengthInput,
    preset.dynamicRangeCompression?.strength,
  );

  colorMatchingSelect.value = preset.colorMatching ?? "rgb";
  if (preset.errorDiffusionMatrix) {
    errorDiffusionMatrixSelect.value = preset.errorDiffusionMatrix;
  }
}

function applyAutoDitherAndMatchingToUI(options: Partial<DitherImageOptions>) {
  const preset =
    typeof options.processingPreset === "string"
      ? getProcessingPreset(options.processingPreset)
      : null;

  setSelectValue(
    ditheringTypeSelect,
    options.ditheringType ?? DEFAULT_DITHER_OPTIONS.ditheringType,
  );
  setSelectValue(
    errorDiffusionMatrixSelect,
    options.errorDiffusionMatrix ??
      preset?.errorDiffusionMatrix ??
      DEFAULT_DITHER_OPTIONS.errorDiffusionMatrix,
  );
  setSelectValue(
    randomDitheringTypeSelect,
    options.randomDitheringType ?? DEFAULT_DITHER_OPTIONS.randomDitheringType,
  );
  serpentineCheckbox.checked =
    options.serpentine ?? DEFAULT_DITHER_OPTIONS.serpentine;
  setSelectValue(
    colorMatchingSelect,
    options.colorMatching ??
      preset?.colorMatching ??
      DEFAULT_DITHER_OPTIONS.colorMatching,
  );
  setSelectValue(
    processingEngineSelect,
    options.processingEngine ?? DEFAULT_DITHER_OPTIONS.processingEngine,
  );
  edgePreservationCheckbox.checked =
    options.edgePreservation?.enabled ??
    DEFAULT_DITHER_OPTIONS.edgePreservation.enabled;
  setResolvedInputValue(
    edgePreservationStrengthInput,
    options.edgePreservation?.strength,
    DEFAULT_DITHER_OPTIONS.edgePreservation.strength,
  );
  edgeAntialiasingCheckbox.checked =
    options.edgeAntialiasing?.enabled ??
    DEFAULT_DITHER_OPTIONS.edgeAntialiasing.enabled;
  setResolvedInputValue(
    edgeAntialiasingStrengthInput,
    options.edgeAntialiasing?.strength,
    DEFAULT_DITHER_OPTIONS.edgeAntialiasing.strength,
  );

  const orderedDitheringMatrix =
    options.orderedDitheringMatrix ??
    DEFAULT_DITHER_OPTIONS.orderedDitheringMatrix;
  orderedDitheringMatrixW.value = String(orderedDitheringMatrix[0] ?? 4);
  orderedDitheringMatrixH.value = String(orderedDitheringMatrix[1] ?? 4);
}

function applyAutoAdjustmentsToUI(options: Partial<DitherImageOptions>) {
  const preset =
    typeof options.processingPreset === "string"
      ? getProcessingPreset(options.processingPreset)
      : null;
  const toneMapping = options.toneMapping ?? preset?.toneMapping;
  const dynamicRangeCompression =
    typeof options.dynamicRangeCompression === "object"
      ? options.dynamicRangeCompression
      : preset?.dynamicRangeCompression;

  setResolvedInputValue(
    exposureInput,
    toneMapping?.exposure,
    0,
  );
  setResolvedInputValue(
    saturationInput,
    toneMapping?.saturation,
    0,
  );
  setResolvedInputValue(
    contrastInput,
    toneMapping?.contrast,
    0,
  );
  setResolvedInputValue(
    clarityInput,
    getClaritySliderValue(options.clarity),
    0,
  );
  setResolvedInputValue(
    scurveStrengthInput,
    toneMapping?.mode === "scurve" || !toneMapping?.mode
      ? toneMapping?.strength
      : undefined,
    0,
  );
  setResolvedInputValue(shadowBoostInput, toneMapping?.shadowBoost, 0);
  setResolvedInputValue(
    highlightCompressInput,
    toneMapping?.highlightCompress,
    0,
  );
  setResolvedInputValue(
    midpointInput,
    toneMapping?.midpoint,
    DEFAULT_TONE_CURVE_MIDPOINT,
  );

  dynamicRangeModeSelect.value = dynamicRangeCompression?.mode ?? "off";
  setResolvedInputValue(
    dynamicRangeStrengthInput,
    dynamicRangeCompression?.strength,
    1,
  );
  setResolvedInputValue(
    lowPercentileInput,
    dynamicRangeCompression?.lowPercentile,
    0.01,
  );
  setResolvedInputValue(
    highPercentileInput,
    dynamicRangeCompression?.highPercentile,
    0.99,
  );
}

function applyResolvedDitherOptionsToUI(options: Partial<DitherImageOptions>) {
  applyAutoDitherAndMatchingToUI(options);
  applyAutoAdjustmentsToUI(options);
}

function readNumber(input: HTMLInputElement, fallback: number) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function numbersEqual(a: number | undefined, b: number | undefined) {
  return a === b || Math.abs((a ?? 0) - (b ?? 0)) < 0.000001;
}

function numberArraysEqual(a: number[], b: number[]) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function getSelectedPaletteOption() {
  return (
    PALETTE_OPTIONS[paletteSelect.value as keyof typeof PALETTE_OPTIONS] ??
    PALETTE_OPTIONS["aitjcize-spectra6"]
  );
}

function updatePalettePreviews() {
  const { palette } = getSelectedPaletteOption();

  renderColorPalette(
    palettePreview,
    palette.map((entry) => entry.color),
  );
  renderColorPalette(
    deviceColorsPreview,
    palette.map((entry) => entry.deviceColor),
  );
}

function getToneMappingFromUI() {
  const shadowBoost = readNumber(shadowBoostInput, 0);
  const highlights = readNumber(highlightCompressInput, 0);
  const configuredStrength = readNumber(scurveStrengthInput, 0);
  const hasCurveAdjustment =
    !numbersEqual(shadowBoost, 0) || !numbersEqual(highlights, 0);

  return {
    exposure: readNumber(exposureInput, 0),
    saturation: readNumber(saturationInput, 0),
    contrast: readNumber(contrastInput, 0),
    strength: hasCurveAdjustment
      ? configuredStrength || DEFAULT_TONE_CURVE_STRENGTH
      : 0,
    shadowBoost,
    highlightCompress: highlights,
    midpoint: readNumber(midpointInput, DEFAULT_TONE_CURVE_MIDPOINT),
  };
}

function getDynamicRangeCompressionFromUI() {
  const dynamicRangeMode = dynamicRangeModeSelect.value as DynamicRangeMode;

  if (dynamicRangeMode === "off") {
    return { mode: "off" as const };
  }

  return {
    mode: dynamicRangeMode,
    strength: readNumber(dynamicRangeStrengthInput, 1),
    lowPercentile: readNumber(lowPercentileInput, 0.01),
    highPercentile: readNumber(highPercentileInput, 0.99),
  };
}

function getEdgePreservationFromUI() {
  return {
    enabled: edgePreservationCheckbox.checked,
    strength: readNumber(
      edgePreservationStrengthInput,
      DEFAULT_DITHER_OPTIONS.edgePreservation.strength,
    ),
  };
}

function getEdgeAntialiasingFromUI() {
  return {
    enabled: edgeAntialiasingCheckbox.checked,
    strength: readNumber(
      edgeAntialiasingStrengthInput,
      DEFAULT_DITHER_OPTIONS.edgeAntialiasing.strength,
    ),
  };
}

function updateCanvasDitherControlAvailability() {
  const ditheringType = ditheringTypeSelect.value;
  const usesDitherItKernel = ditheringType === "ditherItErrorDiffusion";
  setOptionDisabled(
    errorDiffusionMatrixSelect,
    "falseFloydSteinberg",
    usesDitherItKernel,
    "DITHER IT error diffusion does not support this kernel.",
  );
  selectFirstEnabledOption(errorDiffusionMatrixSelect);

  const usesKernel = KERNEL_DITHERING_TYPES.has(ditheringType);
  const usesOrderedMatrix = ORDERED_DITHERING_TYPES.has(ditheringType);
  const usesRandomMode = ditheringType === "random";
  const usesWasmEngine = ditheringType === "errorDiffusion";
  const canUseWasmEngine =
    usesWasmEngine && colorMatchingSelect.value === "rgb";

  setFormControlEnabled(
    errorDiffusionMatrixSelect,
    usesKernel,
    "Kernel is only used by error diffusion.",
  );
  setFormControlEnabled(
    serpentineCheckbox,
    usesKernel,
    "Serpentine scanning is only used by error diffusion.",
  );
  setFormControlEnabled(
    randomDitheringTypeSelect,
    usesRandomMode,
    "Random mode is only used by random dithering.",
  );
  setFormControlEnabled(
    orderedDitheringMatrixW,
    usesOrderedMatrix,
    "Matrix size is only used by ordered/Bayer dithering.",
  );
  setFormControlEnabled(
    orderedDitheringMatrixH,
    usesOrderedMatrix,
    "Matrix size is only used by ordered/Bayer dithering.",
  );
  setFormControlEnabled(
    processingEngineSelect,
    usesWasmEngine,
    "Engine selection only affects RGB error diffusion.",
  );
  setFormControlEnabled(
    edgePreservationStrengthInput,
    edgePreservationCheckbox.checked,
    "Enable edge core preservation to adjust its strength.",
  );
  setFormControlEnabled(
    edgeAntialiasingStrengthInput,
    edgeAntialiasingCheckbox.checked,
    "Enable anti-tooth edge banding to adjust its strength.",
  );

  setOptionDisabled(
    processingEngineSelect,
    "wasm",
    !canUseWasmEngine,
    "WASM is only available for RGB error diffusion.",
  );
  selectFirstEnabledOption(processingEngineSelect);
}

function withAutoWhitePreservation(
  dynamicRangeCompression: ReturnType<typeof getDynamicRangeCompressionFromUI>,
) {
  const autoRange = getSelectedAutoImageAdjustmentOptions()
    .dynamicRangeCompression;

  if (
    dynamicRangeCompression.mode === "off" ||
    typeof autoRange !== "object" ||
    autoRange.preserveWhite !== true
  ) {
    return dynamicRangeCompression;
  }

  return {
    ...dynamicRangeCompression,
    preserveWhite: true,
    whitePreservePercentile: autoRange.whitePreservePercentile ?? 0.99,
    whitePreserveMinLuma: autoRange.whitePreserveMinLuma ?? 150,
  };
}

function getCanvasDitherOptionsFromUI(palette: PaletteColorEntry[]) {
  const edgePreservation = getEdgePreservationFromUI();
  const edgeAntialiasing = getEdgeAntialiasingFromUI();

  return {
    ditheringType: ditheringTypeSelect.value,
    errorDiffusionMatrix: errorDiffusionMatrixSelect.value,
    serpentine: serpentineCheckbox.checked,
    orderedDitheringMatrix: [
      parseInt(orderedDitheringMatrixW.value, 10),
      parseInt(orderedDitheringMatrixH.value, 10),
    ],
    randomDitheringType: randomDitheringTypeSelect.value,
    palette,
    colorMatching: colorMatchingSelect.value as DitherImageOptions["colorMatching"],
    processingEngine: processingEngineSelect.value as DitherProcessingEngine,
    ...(edgePreservation.enabled ? { edgePreservation } : {}),
    ...(edgeAntialiasing.enabled ? { edgeAntialiasing } : {}),
    calibrate: true,
  };
}

function getImageAdjustmentOptionsFromUI(): AutoImageAdjustmentOptions {
  const clarity = getClarityFromUI();

  return {
    toneMapping: getToneMappingFromUI(),
    ...(clarity ? { clarity } : {}),
    dynamicRangeCompression: getDynamicRangeCompressionFromUI(),
  };
}

function getDitherOptionsFromUI(palette: PaletteColorEntry[]) {
  return {
    processingPreset: processingPresetSelect.value,
    ...getCanvasDitherOptionsFromUI(palette),
    ...getImageAdjustmentOptionsFromUI(),
  };
}

function getSelectedAutoSuggestion() {
  return autoFlowSelect.value === "previous"
    ? previousAutoSuggestion
    : layeredAutoSuggestion;
}

function pickImageAdjustmentOptions(
  options: Partial<DitherImageOptions> | undefined,
): AutoImageAdjustmentOptions {
  return {
    ...(options?.toneMapping ? { toneMapping: options.toneMapping } : {}),
    ...(options?.clarity ? { clarity: options.clarity } : {}),
    ...(options?.dynamicRangeCompression
      ? { dynamicRangeCompression: options.dynamicRangeCompression }
      : {}),
    ...(options?.levelCompression
      ? { levelCompression: options.levelCompression }
      : {}),
    ...(options?.paperNormalization
      ? { paperNormalization: options.paperNormalization }
      : {}),
  };
}

function pickCanvasDitherOptions(
  options: Partial<DitherImageOptions> | undefined,
): Partial<DitherImageOptions> {
  return {
    ...(options?.ditheringType ? { ditheringType: options.ditheringType } : {}),
    ...(options?.errorDiffusionMatrix
      ? { errorDiffusionMatrix: options.errorDiffusionMatrix }
      : {}),
    ...(typeof options?.serpentine === "boolean"
      ? { serpentine: options.serpentine }
      : {}),
    ...(options?.colorMatching ? { colorMatching: options.colorMatching } : {}),
    ...(options?.edgePreservation
      ? { edgePreservation: options.edgePreservation }
      : {}),
    ...(options?.edgeAntialiasing
      ? { edgeAntialiasing: options.edgeAntialiasing }
      : {}),
  };
}

function getSelectedAutoImageAdjustmentOptions() {
  return autoFlowSelect.value === "previous"
    ? pickImageAdjustmentOptions(previousAutoSuggestion?.ditherOptions)
    : (layeredImageAdjustmentSuggestion?.adjustmentOptions ?? {});
}

function getSelectedAutoCanvasDitherOptions() {
  return autoFlowSelect.value === "previous"
    ? pickCanvasDitherOptions(previousAutoSuggestion?.ditherOptions)
    : (layeredCanvasDitherSuggestion?.ditherOptions ?? {});
}

function getAutoAnalysisCacheKey() {
  const screenResolution = getSelectedScreenResolution();
  return JSON.stringify({
    image: lastImage
      ? {
          src: lastImage.currentSrc || lastImage.src,
          width: lastImage.naturalWidth,
          height: lastImage.naturalHeight,
        }
      : null,
    screen: screenResolution.name,
    screenWidth: screenResolution.width,
    screenHeight: screenResolution.height,
    orientation: getSelectedOrientation(),
    imageFit: getSelectedImageFit(),
    palette: paletteSelect.value,
    canvasWidth: inputCanvas.width,
    canvasHeight: inputCanvas.height,
  });
}

function getAutoAnalysisSuggestions(palette: PaletteColorEntry[]) {
  const key = getAutoAnalysisCacheKey();
  if (autoAnalysisCache?.key === key) {
    return autoAnalysisCache;
  }

  const previous = suggestCanvasProcessingOptions(inputCanvas, palette);
  const layered = suggestLayeredCanvasProcessingOptions(inputCanvas, palette);
  const imageAdjustments = suggestCanvasImageAdjustmentOptions(
    inputCanvas,
    palette,
  );
  const canvasDither = suggestCanvasDitherOptions(inputCanvas, palette);
  autoAnalysisCache = {
    key,
    previous,
    layered,
    imageAdjustments,
    canvasDither,
  };
  return autoAnalysisCache;
}

function getAutoDitherOptionsFromUI(palette: PaletteColorEntry[]) {
  const suggestion = getSelectedAutoSuggestion();
  const imageAdjustmentOptions = getImageAdjustmentOptionsFromUI();
  const dynamicRangeCompression = withAutoWhitePreservation(
    getDynamicRangeCompressionFromUI(),
  );
  const edgePreservation = getEdgePreservationFromUI();
  const edgeAntialiasing = getEdgeAntialiasingFromUI();

  return {
    ...suggestion?.ditherOptions,
    ditheringType: ditheringTypeSelect.value,
    errorDiffusionMatrix: errorDiffusionMatrixSelect.value,
    serpentine: serpentineCheckbox.checked,
    orderedDitheringMatrix: [
      parseInt(orderedDitheringMatrixW.value, 10),
      parseInt(orderedDitheringMatrixH.value, 10),
    ],
    randomDitheringType: randomDitheringTypeSelect.value,
    palette,
    colorMatching: colorMatchingSelect.value as DitherImageOptions["colorMatching"],
    processingEngine: processingEngineSelect.value as DitherProcessingEngine,
    ...(edgePreservation.enabled ? { edgePreservation } : {}),
    ...(edgeAntialiasing.enabled ? { edgeAntialiasing } : {}),
    calibrate: true,
    ...imageAdjustmentOptions,
    dynamicRangeCompression,
  };
}

function getAutoDitherWithManualAdjustmentsOptionsFromUI(
  palette: PaletteColorEntry[],
) {
  return {
    ...getCanvasDitherOptionsFromUI(palette),
    ...getImageAdjustmentOptionsFromUI(),
  };
}

function isToneMappingNeutral(toneMapping: DitherImageOptions["toneMapping"]) {
  if (!toneMapping) return true;

  const mode = toneMapping.mode;
  const exposure = toneMapping.exposure ?? 0;
  const saturation = toneMapping.saturation ?? 0;
  const contrast = toneMapping.contrast ?? 0;
  const strength = toneMapping.strength ?? (mode === "scurve" ? 0.9 : 0);

  if (!numbersEqual(exposure, 0) || !numbersEqual(saturation, 0)) {
    return false;
  }

  if (mode === "off") return true;
  if (mode === "contrast") {
    return numbersEqual(contrast, 0);
  }
  if (mode === "scurve") {
    return numbersEqual(strength, 0);
  }

  return numbersEqual(contrast, 0) && numbersEqual(strength, 0);
}

function isDynamicRangeNeutral(
  dynamicRangeCompression: DitherImageOptions["dynamicRangeCompression"],
) {
  if (!dynamicRangeCompression) return true;
  if (dynamicRangeCompression === true) return false;
  return (dynamicRangeCompression.mode ?? "off") === "off";
}

function getCompactImageAdjustmentOptions(
  options: AutoImageAdjustmentOptions,
) {
  const configOptions: Record<string, unknown> = {};

  if (!isToneMappingNeutral(options.toneMapping)) {
    configOptions.toneMapping = options.toneMapping;
  }

  if (options.clarity && !numbersEqual(options.clarity.amount, 0)) {
    configOptions.clarity = options.clarity;
  }

  if (!isDynamicRangeNeutral(options.dynamicRangeCompression)) {
    configOptions.dynamicRangeCompression = options.dynamicRangeCompression;
  }

  if (options.levelCompression) {
    configOptions.levelCompression = options.levelCompression;
  }

  if (options.paperNormalization) {
    configOptions.paperNormalization = options.paperNormalization;
  }

  if (options.edgePreservation?.enabled) {
    configOptions.edgePreservation = options.edgePreservation;
  }

  if (options.edgeAntialiasing?.enabled) {
    configOptions.edgeAntialiasing = options.edgeAntialiasing;
  }

  return configOptions;
}

function getConfigImageAdjustmentOptionsFromUI() {
  if (isFullAutoPreset() && !autoControlsDirty) {
    return getCompactImageAdjustmentOptions(
      getSelectedAutoImageAdjustmentOptions(),
    );
  }

  return getCompactImageAdjustmentOptions(getImageAdjustmentOptionsFromUI());
}

function getConfigCanvasDitherOptionsFromUI() {
  if (isFullAutoPreset()) {
    if (autoControlsDirty) {
      const { palette: _palette, calibrate: _calibrate, ...options } =
        getCanvasDitherOptionsFromUI(getSelectedPaletteOption().palette);
      return getCompactDitherOptions(options);
    }

    return getCompactDitherOptions(getSelectedAutoCanvasDitherOptions());
  }

  if (isAutoDitherPreset()) {
    const { palette: _palette, calibrate: _calibrate, ...options } =
      getCanvasDitherOptionsFromUI(getSelectedPaletteOption().palette);
    return getCompactDitherOptions(options);
  }

  const { palette: _palette, calibrate: _calibrate, ...options } =
    getCanvasDitherOptionsFromUI(getSelectedPaletteOption().palette);
  return getCompactDitherOptions(options);
}

function getCompactDitherOptions(options: Partial<DitherImageOptions>) {
  const presetName =
    typeof options.processingPreset === "string"
      ? options.processingPreset
      : undefined;
  const preset = presetName ? getProcessingPreset(presetName) : null;
  const configOptions: Record<string, unknown> = {};

  if (presetName) {
    configOptions.processingPreset = presetName;
  }

  if (
    options.ditheringType &&
    options.ditheringType !== DEFAULT_DITHER_OPTIONS.ditheringType
  ) {
    configOptions.ditheringType = options.ditheringType;
  }

  if (
    typeof options.serpentine === "boolean" &&
    options.serpentine !== DEFAULT_DITHER_OPTIONS.serpentine
  ) {
    configOptions.serpentine = options.serpentine;
  }

  if (
    Array.isArray(options.orderedDitheringMatrix) &&
    !numberArraysEqual(
      [...options.orderedDitheringMatrix],
      DEFAULT_DITHER_OPTIONS.orderedDitheringMatrix,
    )
  ) {
    configOptions.orderedDitheringMatrix = options.orderedDitheringMatrix;
  }

  if (
    options.randomDitheringType &&
    options.randomDitheringType !== DEFAULT_DITHER_OPTIONS.randomDitheringType
  ) {
    configOptions.randomDitheringType = options.randomDitheringType;
  }

  if (
    options.colorMatching &&
    options.colorMatching !==
      (preset?.colorMatching ?? DEFAULT_DITHER_OPTIONS.colorMatching)
  ) {
    configOptions.colorMatching = options.colorMatching;
  }

  if (
    options.processingEngine &&
    options.processingEngine !== DEFAULT_DITHER_OPTIONS.processingEngine
  ) {
    configOptions.processingEngine = options.processingEngine;
  }

  if (
    options.errorDiffusionMatrix &&
    options.errorDiffusionMatrix !==
      (preset?.errorDiffusionMatrix ??
        DEFAULT_DITHER_OPTIONS.errorDiffusionMatrix)
  ) {
    configOptions.errorDiffusionMatrix = options.errorDiffusionMatrix;
  }

  if (options.toneMapping) {
    configOptions.toneMapping = options.toneMapping;
  }

  if (options.clarity) {
    configOptions.clarity = options.clarity;
  }

  if (options.dynamicRangeCompression) {
    configOptions.dynamicRangeCompression = options.dynamicRangeCompression;
  }

  if (options.levelCompression) {
    configOptions.levelCompression = options.levelCompression;
  }

  if (options.paperNormalization) {
    configOptions.paperNormalization = options.paperNormalization;
  }

  return configOptions;
}

function getDemoConfig(): DemoConfig {
  const selectedPalette = getSelectedPaletteOption();

  return {
    palette: selectedPalette.exportName,
    imageAdjustmentOptions: getConfigImageAdjustmentOptionsFromUI(),
    canvasDitherOptions: getConfigCanvasDitherOptionsFromUI(),
  };
}

function updateConfigOutput() {
  const config = getDemoConfig();
  const configJson = JSON.stringify(config, null, 2);
  const paletteExportName = getSelectedPaletteOption().exportName;
  const shouldSuggestFullAuto = isFullAutoPreset() && !autoControlsDirty;
  const shouldSuggestCanvasDither = isAutoDitherPreset() && !autoControlsDirty;

  configOutput.textContent = configJson;

  if (shouldSuggestFullAuto) {
    jsExampleOutput.textContent = `import {
  ditherImage,
  replaceColors,
  suggestCanvasDitherOptions,
  suggestCanvasImageAdjustmentOptions,
  ${paletteExportName},
} from "epdoptimize";

const palette = ${paletteExportName};

const inputCanvas = document.querySelector("#inputCanvas");
const ditheredCanvas = document.querySelector("#ditheredCanvas");
const deviceCanvas = document.querySelector("#deviceCanvas");

const imageAuto = suggestCanvasImageAdjustmentOptions(inputCanvas, palette);
const canvasAuto = suggestCanvasDitherOptions(inputCanvas, palette);

await ditherImage(inputCanvas, ditheredCanvas, {
  ...imageAuto.adjustmentOptions,
  ...canvasAuto.ditherOptions,
  palette,
});
replaceColors(ditheredCanvas, deviceCanvas, palette);`;

    jsAdvancedExampleOutput.textContent = `import {
  applyImageAdjustments,
  ditherCanvas,
  replaceColors,
  suggestCanvasDitherOptions,
  suggestCanvasImageAdjustmentOptions,
  ${paletteExportName},
} from "epdoptimize";

const palette = ${paletteExportName};

const inputCanvas = document.querySelector("#inputCanvas");
const adjustedCanvas = document.createElement("canvas");
const ditheredCanvas = document.querySelector("#ditheredCanvas");
const deviceCanvas = document.querySelector("#deviceCanvas");

const imageAuto = suggestCanvasImageAdjustmentOptions(inputCanvas, palette);
const canvasAuto = suggestCanvasDitherOptions(inputCanvas, palette);

await applyImageAdjustments(inputCanvas, adjustedCanvas, {
  ...imageAuto.adjustmentOptions,
  palette,
});

await ditherCanvas(adjustedCanvas, ditheredCanvas, {
  ...canvasAuto.ditherOptions,
  palette,
});

replaceColors(ditheredCanvas, deviceCanvas, palette);`;
    return;
  }

  if (shouldSuggestCanvasDither) {
    jsExampleOutput.textContent = `import {
  ditherImage,
  replaceColors,
  suggestCanvasDitherOptions,
  ${paletteExportName},
} from "epdoptimize";

const config = ${configJson};
const palette = ${paletteExportName};

const inputCanvas = document.querySelector("#inputCanvas");
const ditheredCanvas = document.querySelector("#ditheredCanvas");
const deviceCanvas = document.querySelector("#deviceCanvas");

const canvasAuto = suggestCanvasDitherOptions(inputCanvas, palette);

await ditherImage(inputCanvas, ditheredCanvas, {
  ...config.imageAdjustmentOptions,
  ...canvasAuto.ditherOptions,
  palette,
});
replaceColors(ditheredCanvas, deviceCanvas, palette);`;

    jsAdvancedExampleOutput.textContent = `import {
  applyImageAdjustments,
  ditherCanvas,
  replaceColors,
  suggestCanvasDitherOptions,
  ${paletteExportName},
} from "epdoptimize";

const config = ${configJson};
const palette = ${paletteExportName};

const inputCanvas = document.querySelector("#inputCanvas");
const adjustedCanvas = document.createElement("canvas");
const ditheredCanvas = document.querySelector("#ditheredCanvas");
const deviceCanvas = document.querySelector("#deviceCanvas");

const canvasAuto = suggestCanvasDitherOptions(inputCanvas, palette);

await applyImageAdjustments(inputCanvas, adjustedCanvas, {
  ...config.imageAdjustmentOptions,
  palette,
});

await ditherCanvas(adjustedCanvas, ditheredCanvas, {
  ...canvasAuto.ditherOptions,
  palette,
});

replaceColors(ditheredCanvas, deviceCanvas, palette);`;
    return;
  }

  jsExampleOutput.textContent = `import {
  ditherImage,
  replaceColors,
  ${paletteExportName},
} from "epdoptimize";

const config = ${configJson};
const palette = ${paletteExportName};

const inputCanvas = document.querySelector("#inputCanvas");
const ditheredCanvas = document.querySelector("#ditheredCanvas");
const deviceCanvas = document.querySelector("#deviceCanvas");

await ditherImage(inputCanvas, ditheredCanvas, {
  ...config.imageAdjustmentOptions,
  ...config.canvasDitherOptions,
  palette,
});
replaceColors(ditheredCanvas, deviceCanvas, palette);`;

  jsAdvancedExampleOutput.textContent = `import {
  applyImageAdjustments,
  ditherCanvas,
  replaceColors,
  ${paletteExportName},
} from "epdoptimize";

const config = ${configJson};
const palette = ${paletteExportName};

const inputCanvas = document.querySelector("#inputCanvas");
const adjustedCanvas = document.createElement("canvas");
const ditheredCanvas = document.querySelector("#ditheredCanvas");
const deviceCanvas = document.querySelector("#deviceCanvas");

await applyImageAdjustments(inputCanvas, adjustedCanvas, {
  ...config.imageAdjustmentOptions,
  palette,
});

await ditherCanvas(adjustedCanvas, ditheredCanvas, {
  ...config.canvasDitherOptions,
  palette,
});

replaceColors(ditheredCanvas, deviceCanvas, palette);`;
}

function updateImageStyleResult(result: ImageStyleClassification) {
  imageStyleValue.textContent = formatImageKind(result.kind);
  imageStyleConfidence.textContent =
    result.style === "unknown"
      ? "-"
      : `${formatImageStyle(result.style)} · ${Math.round(
          result.confidence * 100,
        )}% confidence`;
  imageStyleMeter.style.width =
    result.style === "unknown"
      ? "0%"
      : `${Math.round(result.confidence * 100)}%`;

  const { metrics } = result;
  const metricRows = [
    ["Style", formatImageStyle(result.style)],
    ["Photo score", formatRatio(result.photoScore)],
    ["Samples", String(metrics.sampleCount)],
    ["Unique colors", formatRatio(metrics.uniqueColorRatio)],
    ["Top colors", formatRatio(metrics.topColorCoverage)],
    ["Palette entropy", formatRatio(metrics.paletteEntropy)],
    ["Flat regions", formatRatio(metrics.flatRatio)],
    ["Soft changes", formatRatio(metrics.softChangeRatio)],
    ["Strong edges", formatRatio(metrics.strongEdgeRatio)],
    ["Edge density", formatRatio(metrics.edgeDensity)],
    ["Horizontal edges", formatRatio(metrics.horizontalEdgeRatio)],
    ["Vertical edges", formatRatio(metrics.verticalEdgeRatio)],
    ["Luma spread", formatDecimal(metrics.lumaStdDev)],
    ["Saturation avg", formatRatio(metrics.saturationMean)],
    ["Saturation spread", formatRatio(metrics.saturationStdDev)],
    ["Dark pixels", formatRatio(metrics.darkRatio)],
    ["Light pixels", formatRatio(metrics.lightRatio)],
    ["Gray pixels", formatRatio(metrics.grayRatio)],
    ["High saturation", formatRatio(metrics.highSaturationRatio)],
    ["Photo tiles", formatRatio(metrics.photoTileRatio)],
    ["Flat tiles", formatRatio(metrics.flatTileRatio)],
    ["Text tiles", formatRatio(metrics.textTileRatio)],
    ["Gradient tiles", formatRatio(metrics.gradientTileRatio)],
    ["Transparent", formatRatio(metrics.transparentRatio)],
  ];

  imageStyleMetrics.replaceChildren(
    ...metricRows.map(([label, value]) => {
      const row = document.createElement("div");
      const term = document.createElement("dt");
      const description = document.createElement("dd");

      term.textContent = label;
      description.textContent = value;
      row.append(term, description);

      return row;
    }),
  );
}

function updateAutoRecommendation(suggestion: ProcessingSuggestion | null) {
  autoRecommendationReasons.replaceChildren();

  if (!suggestion) {
    autoRecommendationTitle.textContent = "Auto recommendation";
    return;
  }

  const { ditherOptions } = suggestion;
  autoRecommendationTitle.textContent = isAutoDitherPreset()
    ? `${formatPresetName(suggestion.strategy ?? "auto")} auto: canvas dithering`
    : `${formatPresetName(suggestion.strategy ?? "auto")} auto: ${formatPresetName(
        ditherOptions.processingPreset,
      )}`;

  autoRecommendationReasons.replaceChildren(
    ...suggestion.reasons
      .filter((reason) => !reason.startsWith("Detected "))
      .slice(0, 3)
      .map((reason) => {
        const item = document.createElement("li");
        item.textContent = reason;
        return item;
      }),
  );
}

function canUseProcessingWorker() {
  return typeof Worker !== "undefined";
}

function putImageDataOnCanvas(
  canvas: HTMLCanvasElement,
  imageData: ImageData,
) {
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to draw processed image data.");
  ctx.putImageData(imageData, 0, 0);
}

function getProcessingWorker() {
  if (!processingWorker) {
    processingWorker = new Worker(
      new URL("./demo/processing-worker.ts", import.meta.url),
      { type: "module" },
    );
  }

  return processingWorker;
}

function revokeDownloadUrl(link: HTMLAnchorElement) {
  const url = downloadObjectUrls.get(link);
  if (!url) return;

  URL.revokeObjectURL(url);
  downloadObjectUrls.delete(link);
}

function markDownloadStale(link: HTMLAnchorElement) {
  revokeDownloadUrl(link);
  link.href = "#";
}

function setupCanvasDownload(
  link: HTMLAnchorElement,
  canvas: HTMLCanvasElement,
) {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    canvas.toBlob((blob) => {
      if (!blob) return;

      revokeDownloadUrl(link);
      const url = URL.createObjectURL(blob);
      downloadObjectUrls.set(link, url);

      const generatedLink = document.createElement("a");
      generatedLink.href = url;
      generatedLink.download = link.download;
      generatedLink.click();
    }, "image/png");
  });
}

function setupCanvasDownloads() {
  setupCanvasDownload(downloadLink, outputCanvas);
  setupCanvasDownload(downloadDeviceColorsLink, deviceColorsCanvas);
}

async function renderProcessedCanvases(
  palette: PaletteColorEntry[],
  options: DitherImageOptions,
) {
  if (!canUseProcessingWorker()) {
    await applyImageAdjustments(inputCanvas, adjustedCanvas, options);
    await ditherCanvas(adjustedCanvas, outputCanvas, options);
    replaceColors(outputCanvas, deviceColorsCanvas, palette);
    return;
  }

  if (cancelProcessingWorkerRequest) {
    cancelProcessingWorkerRequest();
  }

  const ctx = inputCanvas.getContext("2d");
  if (!ctx) return;

  const imageData = ctx.getImageData(0, 0, inputCanvas.width, inputCanvas.height);
  const id = ++workerRequestId;
  const worker = getProcessingWorker();

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      worker.removeEventListener("message", onMessage);
      worker.removeEventListener("error", onError);
      if (cancelProcessingWorkerRequest === cancelCurrentRequest) {
        cancelProcessingWorkerRequest = null;
      }
    };
    const cancelCurrentRequest = () => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      if (processingWorker === worker) {
        processingWorker = null;
      }
      reject(new DOMException("Processing request was superseded.", "AbortError"));
    };
    const onError = (event: ErrorEvent) => {
      if (settled) return;
      settled = true;
      cleanup();
      worker.terminate();
      if (processingWorker === worker) {
        processingWorker = null;
      }
      reject(event.error ?? new Error(event.message));
    };
    const onMessage = (
      event: MessageEvent<{
        id: number;
        adjustedImageData?: ImageData;
        ditheredImageData?: ImageData;
        deviceImageData?: ImageData;
        error?: string;
      }>,
    ) => {
      if (settled) return;
      if (event.data.id !== id) return;
      settled = true;
      cleanup();

      if (event.data.error) {
        worker.terminate();
        if (processingWorker === worker) {
          processingWorker = null;
        }
        reject(new Error(event.data.error));
        return;
      }

      if (
        event.data.adjustedImageData &&
        event.data.ditheredImageData &&
        event.data.deviceImageData
      ) {
        putImageDataOnCanvas(adjustedCanvas, event.data.adjustedImageData);
        putImageDataOnCanvas(outputCanvas, event.data.ditheredImageData);
        putImageDataOnCanvas(deviceColorsCanvas, event.data.deviceImageData);
      }
      resolve();
    };

    cancelProcessingWorkerRequest = cancelCurrentRequest;
    worker.addEventListener("message", onMessage);
    worker.addEventListener("error", onError);
    worker.postMessage(
      {
        id,
        imageData,
        options,
        palette,
      },
      [imageData.data.buffer],
    );
  });
}

async function processImage() {
  if (!lastImage) return;
  const token = ++processToken;

  drawImageToScreenCanvas(lastImage, inputCanvas);

  const { palette } = getSelectedPaletteOption();
  const autoSuggestions = getAutoAnalysisSuggestions(palette);
  previousAutoSuggestion = autoSuggestions.previous;
  layeredAutoSuggestion = autoSuggestions.layered;
  layeredImageAdjustmentSuggestion = autoSuggestions.imageAdjustments;
  layeredCanvasDitherSuggestion = autoSuggestions.canvasDither;
  currentProcessingSuggestion = getSelectedAutoSuggestion();

  if (
    currentProcessingSuggestion &&
    isFullAutoPreset() &&
    !autoControlsDirty
  ) {
    applyResolvedDitherOptionsToUI(currentProcessingSuggestion.ditherOptions);
  }
  if (
    currentProcessingSuggestion &&
    isAutoDitherPreset() &&
    !autoControlsDirty
  ) {
    applyAutoDitherAndMatchingToUI(getSelectedAutoCanvasDitherOptions());
  }
  if (!currentProcessingSuggestion) return;
  updateImageStyleResult(currentProcessingSuggestion.classification);
  updateAutoRecommendation(currentProcessingSuggestion);
  refreshControlState();
  updateConfigOutput();

  const options =
    isFullAutoPreset()
      ? getAutoDitherOptionsFromUI(palette)
      : isAutoDitherPreset()
        ? getAutoDitherWithManualAdjustmentsOptionsFromUI(palette)
      : getDitherOptionsFromUI(palette);

  try {
    await renderProcessedCanvases(palette, options);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return;
    throw error;
  }
  if (token !== processToken) return;

  drawHistogramPreview(histogramPreviewCanvas, adjustedCanvas);
  markDownloadStale(downloadLink);
  markDownloadStale(downloadDeviceColorsLink);
}

fileInput.addEventListener("change", async () => {
  if (!fileInput.files?.length) return;

  const file = fileInput.files[0];
  const src = URL.createObjectURL(file);
  const img = await loadImage(src);
  lastImage = img;
  applyImageOrientationToUI(img);
  selectedSampleUrl = "";
  autoControlsDirty = false;
  updateSelectedSampleButton();
  URL.revokeObjectURL(src);
  await processImage();
});

function refreshControlState() {
  updatePalettePreviews();
  updateCanvasDitherControlAvailability();
  updateConfigOutput();

  document
    .querySelectorAll<HTMLOutputElement>("output[data-for]")
    .forEach((output) => {
      const input = document.getElementById(
        output.dataset.for ?? "",
      ) as HTMLInputElement | null;
      if (input) output.value = input.value;
    });
  drawToneCurvePreview(toneCurvePreviewCanvas, getToneMappingFromUI());
  drawRangeFittingPreview({
    canvas: rangeFittingPreviewCanvas,
    inputCanvas,
    toneMapping: getToneMappingFromUI(),
    dynamicRange: getDynamicRangeCompressionFromUI(),
    palette: getSelectedPaletteOption().palette,
    lowPercentile: readNumber(lowPercentileInput, 0.01),
    highPercentile: readNumber(highPercentileInput, 0.99),
  });

  const showAutoRange = dynamicRangeModeSelect.value === "auto";
  document.querySelectorAll<HTMLElement>("[data-drc-auto]").forEach((el) => {
    el.hidden = !showAutoRange;
  });

  autoFlowSelect.disabled = !usesAutoAnalysisPreset();
  autoAdjustmentsButton.disabled = !currentProcessingSuggestion;
}

function scheduleProcessImage() {
  window.clearTimeout(scheduledProcess);
  scheduledProcess = window.setTimeout(async () => {
    refreshControlState();
    await processImage();
  }, 80);
}

function shouldMarkAutoControlsDirty(el: HTMLElement) {
  if (!usesAutoAnalysisPreset()) return false;
  if (
    el === processingPresetSelect ||
    el === autoFlowSelect ||
    el === paletteSelect
  ) {
    return false;
  }
  if (isFullAutoPreset()) return true;

  return AUTO_DITHER_CONTROL_IDS.has(el.id);
}

const controls = [
  paletteSelect,
  processingPresetSelect,
  autoFlowSelect,
  ditheringTypeSelect,
  errorDiffusionMatrixSelect,
  orderedDitheringMatrixW,
  orderedDitheringMatrixH,
  randomDitheringTypeSelect,
  serpentineCheckbox,
  colorMatchingSelect,
  processingEngineSelect,
  edgePreservationCheckbox,
  edgePreservationStrengthInput,
  edgeAntialiasingCheckbox,
  edgeAntialiasingStrengthInput,
  exposureInput,
  saturationInput,
  contrastInput,
  clarityInput,
  scurveStrengthInput,
  shadowBoostInput,
  highlightCompressInput,
  midpointInput,
  dynamicRangeModeSelect,
  dynamicRangeStrengthInput,
  lowPercentileInput,
  highPercentileInput,
];

controls.forEach((el) => {
  el.addEventListener("change", () => {
    if (shouldMarkAutoControlsDirty(el)) {
      autoControlsDirty = true;
    }

    if (el === processingPresetSelect) {
      autoControlsDirty = false;
      applyPresetToUI(processingPresetSelect.value);
    }
    if (el === autoFlowSelect || el === paletteSelect) {
      autoControlsDirty = false;
    }
    scheduleProcessImage();
  });

  if (el instanceof HTMLInputElement) {
    el.addEventListener("input", () => {
      if (shouldMarkAutoControlsDirty(el)) {
        autoControlsDirty = true;
      }
      scheduleProcessImage();
    });
  }
});

autoAdjustmentsButton.addEventListener("click", () => {
  const suggestion = getSelectedAutoSuggestion();
  if (!suggestion) return;

  applyAutoAdjustmentsToUI(getSelectedAutoImageAdjustmentOptions());
  refreshControlState();
  scheduleProcessImage();
});

resetImageAdjustmentsButton.addEventListener("click", () => {
  applyManualAdjustmentDefaultsToUI();
  if (isFullAutoPreset()) {
    autoControlsDirty = true;
  }
  refreshControlState();
  scheduleProcessImage();
});

copyConfigButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(configOutput.textContent ?? "");
});

copyJsExampleButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(jsExampleOutput.textContent ?? "");
});

copyJsAdvancedExampleButton.addEventListener("click", async () => {
  await navigator.clipboard.writeText(jsAdvancedExampleOutput.textContent ?? "");
});

configTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const selectedTab = button.dataset.configTab;
    configTabButtons.forEach((tabButton) => {
      tabButton.setAttribute(
        "aria-selected",
        String(tabButton.dataset.configTab === selectedTab),
      );
    });
    configPanels.forEach((panel) => {
      panel.hidden = panel.dataset.configPanel !== selectedTab;
    });
  });
});

[screenResolutionSelect, orientationSelect, imageFitSelect].forEach(
  (select) => {
    select.addEventListener("change", () => {
      syncWorkspaceToggleControls();
      saveDeviceTestConfig();
      setDeviceTestStatus("");
      autoControlsDirty = false;
      scheduleProcessImage();
    });
  },
);

[paperIdInput, apiKeyInput].forEach((input) => {
  input.addEventListener("input", () => {
    saveDeviceTestConfig();
    setDeviceTestStatus("");
  });
});

testOnDeviceButton.addEventListener("click", () => testOnDevice(lastImage));

toggleOriginalSizeButton.addEventListener("click", () => {
  showOriginalSize = !showOriginalSize;
  updateCanvasSizeMode();
});

for (const frame of canvasFrames) {
  frame.addEventListener("scroll", () => {
    syncCanvasFrameScroll(frame);
  });
}
