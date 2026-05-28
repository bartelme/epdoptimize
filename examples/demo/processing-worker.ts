import { applyImageAdjustments, ditherCanvas, replaceColors } from "../../src";
import type { DitherImageOptions, PaletteColorEntry } from "../../src";

interface ProcessRequest {
  id: number;
  imageData: ImageData;
  options: DitherImageOptions;
  palette: PaletteColorEntry[];
}

interface ProcessResponse {
  id: number;
  adjustedImageData?: ImageData;
  ditheredImageData?: ImageData;
  deviceImageData?: ImageData;
  error?: string;
}

const postWorkerMessage = (
  response: ProcessResponse,
  transfer?: Transferable[],
) => {
  (self as unknown as {
    postMessage(message: ProcessResponse, transfer?: Transferable[]): void;
  }).postMessage(response, transfer);
};

const createCanvasFromImageData = (imageData: ImageData) => {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to create worker canvas context.");
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};

const getCanvasImageData = (canvas: OffscreenCanvas) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Unable to read worker canvas context.");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
};

self.addEventListener("message", async (event: MessageEvent<ProcessRequest>) => {
  const { id, imageData, options, palette } = event.data;

  try {
    const sourceCanvas = createCanvasFromImageData(imageData);
    const adjustedCanvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ditheredCanvas = new OffscreenCanvas(imageData.width, imageData.height);
    const deviceCanvas = new OffscreenCanvas(imageData.width, imageData.height);

    await applyImageAdjustments(sourceCanvas, adjustedCanvas, {
      ...options,
      palette,
    });
    await ditherCanvas(adjustedCanvas, ditheredCanvas, {
      ...options,
      palette,
    });
    replaceColors(ditheredCanvas, deviceCanvas, palette);

    const adjustedImageData = getCanvasImageData(adjustedCanvas);
    const ditheredImageData = getCanvasImageData(ditheredCanvas);
    const deviceImageData = getCanvasImageData(deviceCanvas);
    const response: ProcessResponse = {
      id,
      adjustedImageData,
      ditheredImageData,
      deviceImageData,
    };

    postWorkerMessage(response, [
      adjustedImageData.data.buffer,
      ditheredImageData.data.buffer,
      deviceImageData.data.buffer,
    ]);
  } catch (error) {
    const response: ProcessResponse = {
      id,
      error: error instanceof Error ? error.message : "Worker processing failed.",
    };
    postWorkerMessage(response);
  }
});
