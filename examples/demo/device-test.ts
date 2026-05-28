import {
  DEFAULT_DEVICE_TEST_CONFIG,
  DEVICE_TEST_STORAGE_KEY,
  SCREEN_RESOLUTIONS,
} from "./constants";
import {
  apiKeyInput,
  deviceColorsCanvas,
  deviceTestStatus,
  imageFitSelect,
  orientationSelect,
  outputCanvas,
  paperIdInput,
  screenResolutionSelect,
  testOnDeviceButton,
} from "./elements";
import type { ImageFitMode, ScreenOrientation } from "./types";

export function getDeviceTestConfig() {
  return {
    screenResolution: screenResolutionSelect.value,
    orientation: getSelectedOrientation(),
    imageFit: getSelectedImageFit(),
    paperId: paperIdInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
  };
}

export function getSelectedScreenResolution() {
  return (
    SCREEN_RESOLUTIONS[
      screenResolutionSelect.value as keyof typeof SCREEN_RESOLUTIONS
    ] ?? SCREEN_RESOLUTIONS.openpaper7
  );
}

export function getSelectedOrientation(): ScreenOrientation {
  if (orientationSelect.value === "original") return "original";
  return orientationSelect.value === "portrait" ? "portrait" : "landscape";
}

export function getOriginalImageOrientation(
  img: HTMLImageElement,
): ScreenOrientation {
  return img.height > img.width ? "portrait" : "landscape";
}

export function getDeviceUploadOrientation(
  img: HTMLImageElement | null,
): Exclude<ScreenOrientation, "original"> {
  const orientation = getSelectedOrientation();
  if (orientation !== "original") return orientation;
  return img && img.height > img.width ? "portrait" : "landscape";
}

export function getSelectedImageFit(): ImageFitMode {
  return imageFitSelect.value === "cover" ? "cover" : "contain";
}

export function loadDeviceTestConfig() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(DEVICE_TEST_STORAGE_KEY) || "{}",
    );
    screenResolutionSelect.value =
      typeof saved.screenResolution === "string" &&
      saved.screenResolution in SCREEN_RESOLUTIONS
        ? saved.screenResolution
        : DEFAULT_DEVICE_TEST_CONFIG.screenResolution;
    orientationSelect.value =
      saved.orientation === "portrait" || saved.orientation === "original"
        ? saved.orientation
        : DEFAULT_DEVICE_TEST_CONFIG.orientation;
    imageFitSelect.value =
      saved.imageFit === "cover"
        ? "cover"
        : DEFAULT_DEVICE_TEST_CONFIG.imageFit;
    paperIdInput.value =
      typeof saved.paperId === "string"
        ? saved.paperId
        : DEFAULT_DEVICE_TEST_CONFIG.paperId;
    apiKeyInput.value =
      typeof saved.apiKey === "string"
        ? saved.apiKey
        : DEFAULT_DEVICE_TEST_CONFIG.apiKey;
  } catch {
    screenResolutionSelect.value = DEFAULT_DEVICE_TEST_CONFIG.screenResolution;
    orientationSelect.value = DEFAULT_DEVICE_TEST_CONFIG.orientation;
    imageFitSelect.value = DEFAULT_DEVICE_TEST_CONFIG.imageFit;
    paperIdInput.value = DEFAULT_DEVICE_TEST_CONFIG.paperId;
    apiKeyInput.value = DEFAULT_DEVICE_TEST_CONFIG.apiKey;
  }
}

export function saveDeviceTestConfig() {
  localStorage.setItem(
    DEVICE_TEST_STORAGE_KEY,
    JSON.stringify(getDeviceTestConfig()),
  );
}

export function setDeviceTestStatus(
  message: string,
  state: "idle" | "success" | "error" = "idle",
) {
  deviceTestStatus.textContent = message;
  deviceTestStatus.dataset.state = state;
}

export async function testOnDevice(lastImage: HTMLImageElement | null) {
  const { paperId, apiKey } = getDeviceTestConfig();

  if (!paperId) {
    setDeviceTestStatus("Missing paper ID.", "error");
    return;
  }

  if (!apiKey) {
    setDeviceTestStatus("Missing x-api-key.", "error");
    return;
  }

  if (deviceColorsCanvas.width === 0 || deviceColorsCanvas.height === 0) {
    setDeviceTestStatus("No device image to upload.", "error");
    return;
  }

  testOnDeviceButton.disabled = true;
  setDeviceTestStatus("Uploading...");

  try {
    const pictureBlob = await canvasToPngBlob(outputCanvas);
    const pictureDeviceBlob = await canvasToPngBlob(deviceColorsCanvas);
    const formData = new FormData();
    formData.append("picture", pictureBlob, "epdoptimize-dithered.png");
    formData.append(
      "pictureDevice",
      pictureDeviceBlob,
      "epdoptimize-device.png",
    );
    formData.append(
      "settings",
      JSON.stringify({
        meta: {
          orientation: getDeviceUploadOrientation(lastImage),
        },
      }),
    );

    const response = await fetch(
      `https://api.paperlesspaper.de/v1/papers/uploadSingleImage/${encodeURIComponent(
        paperId,
      )}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "x-api-key": apiKey,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        errorText || `Upload failed with status ${response.status}.`,
      );
    }

    setDeviceTestStatus("Sent to device.", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    setDeviceTestStatus(message, "error");
  } finally {
    testOnDeviceButton.disabled = false;
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }
      reject(new Error("Could not create PNG from canvas."));
    }, "image/png");
  });
}
