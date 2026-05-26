import type { ImageStyleClassification } from "../../src";

export function formatImageStyle(style: ImageStyleClassification["style"]) {
  if (style === "photo") return "Photo";
  if (style === "illustration") return "Illustration";
  return "Unknown";
}

export function formatImageKind(kind: ImageStyleClassification["kind"]) {
  return kind
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

export function formatPresetName(name: unknown) {
  return String(name)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (char) => char.toUpperCase());
}

export function formatTopScores(scores: Record<string, number>, count = 3) {
  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, count)
    .map(([name, score]) => `${formatPresetName(name)} ${formatRatio(score)}`)
    .join(", ");
}

export function formatRatio(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatDecimal(value: number) {
  return value.toFixed(2);
}
