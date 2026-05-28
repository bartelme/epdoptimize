import type { ProcessingSuggestion } from "../../src";

export type ScreenOrientation = "landscape" | "portrait" | "original";
export type ImageFitMode = "contain" | "cover";
export type DynamicRangeMode = "off" | "display" | "auto";
export type ToneMappingMode = "off" | "contrast" | "scurve";

export type AutoRatingIssue =
  | "good"
  | "tooNoisy"
  | "tooDull"
  | "tooHarsh"
  | "colorsWrong"
  | "unreadable";

export interface DemoConfig {
  palette: string;
  imageAdjustmentOptions: Record<string, unknown>;
  canvasDitherOptions: Record<string, unknown>;
}

export interface AutoProcessingRatingRecord {
  id: string;
  createdAt: string;
  imageId: string;
  imageName: string;
  paletteKey: string;
  screenResolution: string;
  orientation: ScreenOrientation;
  imageFit: ImageFitMode;
  imageKind: ProcessingSuggestion["imageKind"];
  rating: number;
  issue: AutoRatingIssue;
  notes: string;
  autoOptions: Record<string, unknown>;
  currentConfig: DemoConfig;
  classification: ProcessingSuggestion["classification"];
}

export interface AutoRatingInsight {
  records: AutoProcessingRatingRecord[];
  averageRating: number | null;
  adjustmentIssue: AutoRatingIssue | null;
  adjustmentReason: string | null;
}
