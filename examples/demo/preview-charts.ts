import type { DitherImageOptions, PaletteColorEntry } from "../../src";
import { luma709, rgbToLab } from "../../src/dither/processing";
import type { DynamicRangeMode } from "./types";

type ToneMappingPreview = NonNullable<DitherImageOptions["toneMapping"]>;

interface DynamicRangeCompressionPreview {
  mode: DynamicRangeMode;
  strength?: number;
}

interface RangeFittingPreviewOptions {
  canvas: HTMLCanvasElement;
  inputCanvas: HTMLCanvasElement;
  toneMapping: ToneMappingPreview;
  dynamicRange: DynamicRangeCompressionPreview;
  palette: PaletteColorEntry[];
  lowPercentile: number;
  highPercentile: number;
}

const histogramSampleCanvas = document.createElement("canvas");

export function drawToneCurvePreview(
  canvas: HTMLCanvasElement,
  toneMapping: ToneMappingPreview,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 16;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const styles = getComputedStyle(document.documentElement);
  const lineColor = styles.getPropertyValue("--line").trim() || "#d0d5dd";
  const mutedColor = styles.getPropertyValue("--muted").trim() || "#667085";
  const accentColor = styles.getPropertyValue("--accent").trim() || "#2563eb";

  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (let i = 0; i <= 4; i += 1) {
    const x = padding + (plotWidth * i) / 4;
    const y = padding + (plotHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  ctx.strokeStyle = mutedColor;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, padding);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let i = 0; i <= plotWidth; i += 1) {
    const input = i / plotWidth;
    const output = applyToneCurvePreviewValue(input, toneMapping);
    const x = padding + i;
    const y = height - padding - output * plotHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

export function drawHistogramPreview(
  canvas: HTMLCanvasElement,
  sourceCanvas: HTMLCanvasElement | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 16;
  const plotWidth = width - padding * 2;
  const plotHeight = height - padding * 2;
  const styles = getComputedStyle(document.documentElement);
  const lineColor = styles.getPropertyValue("--line").trim() || "#d0d5dd";
  const mutedColor = styles.getPropertyValue("--muted").trim() || "#667085";

  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (let i = 0; i <= 4; i += 1) {
    const x = padding + (plotWidth * i) / 4;
    const y = padding + (plotHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  if (!sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) {
    return;
  }

  const maxSampleSide = 192;
  const sampleScale = Math.min(
    1,
    maxSampleSide / Math.max(sourceCanvas.width, sourceCanvas.height),
  );
  const sampleWidth = Math.max(1, Math.round(sourceCanvas.width * sampleScale));
  const sampleHeight = Math.max(1, Math.round(sourceCanvas.height * sampleScale));
  histogramSampleCanvas.width = sampleWidth;
  histogramSampleCanvas.height = sampleHeight;

  const sampleCtx = histogramSampleCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!sampleCtx) return;
  sampleCtx.clearRect(0, 0, sampleWidth, sampleHeight);
  sampleCtx.imageSmoothingEnabled = true;
  sampleCtx.drawImage(sourceCanvas, 0, 0, sampleWidth, sampleHeight);

  const bins = 64;
  const red = Array.from({ length: bins }, () => 0);
  const green = Array.from({ length: bins }, () => 0);
  const blue = Array.from({ length: bins }, () => 0);
  const luma = Array.from({ length: bins }, () => 0);
  const imageData = sampleCtx.getImageData(0, 0, sampleWidth, sampleHeight);
  const data = imageData.data;

  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const index = (y * sampleWidth + x) * 4;
      if (data[index + 3] === 0) continue;

      const r = data[index]!;
      const g = data[index + 1]!;
      const b = data[index + 2]!;
      red[clampNumber(Math.floor((r / 256) * bins), 0, bins - 1)]! += 1;
      green[clampNumber(Math.floor((g / 256) * bins), 0, bins - 1)]! += 1;
      blue[clampNumber(Math.floor((b / 256) * bins), 0, bins - 1)]! += 1;
      luma[
        clampNumber(Math.floor((luma709(r, g, b) / 256) * bins), 0, bins - 1)
      ]! += 1;
    }
  }

  const maxBin = Math.max(1, ...red, ...green, ...blue, ...luma);
  const drawBars = (values: number[], color: string) => {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.28;
    values.forEach((count, index) => {
      const barWidth = plotWidth / bins;
      const barHeight = (count / maxBin) * plotHeight;
      ctx.fillRect(
        padding + index * barWidth,
        height - padding - barHeight,
        Math.max(1, barWidth - 1),
        barHeight,
      );
    });
    ctx.globalAlpha = 1;
  };

  drawBars(red, "#d64545");
  drawBars(green, "#3f9b62");
  drawBars(blue, "#3d6fd8");

  ctx.strokeStyle = mutedColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  luma.forEach((count, index) => {
    const x = padding + (index / (bins - 1)) * plotWidth;
    const y = height - padding - (count / maxBin) * plotHeight;
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

export function drawRangeFittingPreview(options: RangeFittingPreviewOptions) {
  const {
    canvas,
    inputCanvas,
    toneMapping,
    dynamicRange,
    palette,
    lowPercentile,
    highPercentile,
  } = options;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const width = canvas.width;
  const height = canvas.height;
  const padding = 16;
  const plotTop = 14;
  const plotHeight = 84;
  const plotBottom = plotTop + plotHeight;
  const plotWidth = width - padding * 2;
  const styles = getComputedStyle(document.documentElement);
  const lineColor = styles.getPropertyValue("--line").trim() || "#d0d5dd";
  const mutedColor = styles.getPropertyValue("--muted").trim() || "#667085";
  const accentColor = styles.getPropertyValue("--accent").trim() || "#2563eb";
  const values = getToneMappedLightnessSamples(inputCanvas, toneMapping);
  const { blackL, whiteL } = getPaletteLightnessRange(palette);

  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  for (let i = 0; i <= 4; i += 1) {
    const x = padding + (plotWidth * i) / 4;
    const y = plotTop + (plotHeight * i) / 4;
    ctx.beginPath();
    ctx.moveTo(x, plotTop);
    ctx.lineTo(x, plotBottom);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }

  const bins = Array.from({ length: 64 }, () => 0);
  for (const value of values) {
    const bin = clampNumber(
      Math.floor((value / 100) * bins.length),
      0,
      bins.length - 1,
    );
    bins[bin]! += 1;
  }
  const maxBin = Math.max(1, ...bins);
  ctx.fillStyle = accentColor;
  ctx.globalAlpha = 0.22;
  bins.forEach((count, index) => {
    const barWidth = plotWidth / bins.length;
    const barHeight = (count / maxBin) * plotHeight;
    ctx.fillRect(
      padding + index * barWidth,
      plotBottom - barHeight,
      Math.max(1, barWidth - 1),
      barHeight,
    );
  });
  ctx.globalAlpha = 1;

  const lowPercentileValue = clampNumber(lowPercentile, 0, 1);
  const highPercentileValue = clampNumber(highPercentile, 0, 1);
  const sourceLow =
    dynamicRange.mode === "auto"
      ? getPercentileValue(values, lowPercentileValue)
      : 0;
  const sourceHigh =
    dynamicRange.mode === "auto"
      ? getPercentileValue(values, highPercentileValue)
      : 100;
  const sourceRange = Math.max(0.0001, sourceHigh - sourceLow);
  const targetRange = Math.max(0.0001, whiteL - blackL);
  const strength =
    dynamicRange.mode === "off"
      ? 0
      : clampNumber(dynamicRange.strength ?? 1, 0, 1);

  ctx.strokeStyle = mutedColor;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padding, plotBottom);
  ctx.lineTo(width - padding, plotTop);
  ctx.stroke();

  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 2;
  ctx.setLineDash([]);
  ctx.beginPath();
  for (let i = 0; i <= plotWidth; i += 1) {
    const inputL = (i / plotWidth) * 100;
    const normalized = clampNumber((inputL - sourceLow) / sourceRange, 0, 1);
    const fittedL = blackL + normalized * targetRange;
    const outputL = inputL + (fittedL - inputL) * strength;
    const x = padding + i;
    const y = plotBottom - clampNumber(outputL / 100, 0, 1) * plotHeight;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  const barTop = 116;
  drawRangeBar(ctx, barTop, 0, 100, lineColor, mutedColor);
  drawRangeBar(
    ctx,
    barTop + 18,
    sourceLow,
    sourceHigh,
    lineColor,
    accentColor,
  );
  drawRangeMarker(ctx, blackL, barTop + 18, barTop + 26, mutedColor);
  drawRangeMarker(ctx, whiteL, barTop + 18, barTop + 26, mutedColor);
}

function applyToneCurvePreviewValue(
  input: number,
  toneMapping: ToneMappingPreview,
) {
  const exposure = Math.pow(2, toneMapping.exposure ?? 0);
  const contrast = Math.max(0, (toneMapping.contrast ?? 0) + 1);
  let value = clampNumber(input * exposure, 0, 1);
  value = clampNumber((value - 0.5) * contrast + 0.5, 0, 1);

  const strength = clampNumber(toneMapping.strength ?? 0, 0, 1);
  const midpoint = clampNumber(toneMapping.midpoint ?? 0.5, 0.05, 0.95);
  if (strength === 0) return value;

  if (value < midpoint) {
    const shadowValue = value / midpoint;
    const exponent = clampNumber(
      1 - strength * (toneMapping.shadowBoost ?? 0),
      0.15,
      3,
    );
    return clampNumber(Math.pow(shadowValue, exponent) * midpoint, 0, 1);
  }

  const highlightValue = (value - midpoint) / (1 - midpoint);
  const exponent = clampNumber(
    1 - strength * (toneMapping.highlightCompress ?? 0),
    0.15,
    3,
  );
  return clampNumber(
    midpoint + Math.pow(highlightValue, exponent) * (1 - midpoint),
    0,
    1,
  );
}

function parseHexColor(color: string): [number, number, number] {
  const normalized = color.replace("#", "").trim();
  const hex =
    normalized.length === 3
      ? normalized
          .split("")
          .map((part) => part + part)
          .join("")
      : normalized;
  const value = Number.parseInt(hex, 16);
  if (!Number.isFinite(value)) return [0, 0, 0];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function getPaletteLightnessRange(palette: PaletteColorEntry[]) {
  let blackL = 100;
  let whiteL = 0;

  for (const entry of palette) {
    const [l] = rgbToLab(...parseHexColor(entry.color));
    blackL = Math.min(blackL, l);
    whiteL = Math.max(whiteL, l);
  }

  return blackL < whiteL
    ? { blackL, whiteL }
    : { blackL: 0, whiteL: 100 };
}

function getPercentileValue(values: number[], percentileValue: number) {
  if (values.length === 0) return 0;
  const index = clampNumber(
    Math.round((values.length - 1) * percentileValue),
    0,
    values.length - 1,
  );
  return values[index]!;
}

function getToneMappedLightnessSamples(
  inputCanvas: HTMLCanvasElement,
  toneMapping: ToneMappingPreview,
) {
  const ctx = inputCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || inputCanvas.width === 0 || inputCanvas.height === 0) return [];

  const imageData = ctx.getImageData(0, 0, inputCanvas.width, inputCanvas.height);
  const data = imageData.data;
  const maxSamples = 9000;
  const pixelCount = inputCanvas.width * inputCanvas.height;
  const stride = Math.max(1, Math.ceil(Math.sqrt(pixelCount / maxSamples)));
  const values: number[] = [];

  for (let y = 0; y < inputCanvas.height; y += stride) {
    for (let x = 0; x < inputCanvas.width; x += stride) {
      const index = (y * inputCanvas.width + x) * 4;
      const alpha = data[index + 3];
      if (alpha === 0) continue;

      const [lightness] = rgbToLab(
        data[index]!,
        data[index + 1]!,
        data[index + 2]!,
      );
      values.push(applyToneCurvePreviewValue(lightness / 100, toneMapping) * 100);
    }
  }

  return values.sort((a, b) => a - b);
}

function drawRangeMarker(
  ctx: CanvasRenderingContext2D,
  value: number,
  top: number,
  bottom: number,
  color: string,
) {
  const x = 16 + clampNumber(value / 100, 0, 1) * (ctx.canvas.width - 32);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, top);
  ctx.lineTo(x, bottom);
  ctx.stroke();
}

function drawRangeBar(
  ctx: CanvasRenderingContext2D,
  y: number,
  low: number,
  high: number,
  lineColor: string,
  activeColor: string,
) {
  const width = ctx.canvas.width;
  const left = 16;
  const right = width - 16;
  const lowX = left + clampNumber(low / 100, 0, 1) * (right - left);
  const highX = left + clampNumber(high / 100, 0, 1) * (right - left);

  const gradient = ctx.createLinearGradient(left, 0, right, 0);
  gradient.addColorStop(0, "#000000");
  gradient.addColorStop(1, "#ffffff");
  ctx.fillStyle = gradient;
  ctx.fillRect(left, y, right - left, 8);
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.strokeRect(left, y, right - left, 8);

  ctx.fillStyle = activeColor;
  ctx.globalAlpha = 0.22;
  ctx.fillRect(Math.min(lowX, highX), y - 2, Math.abs(highX - lowX), 12);
  ctx.globalAlpha = 1;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
