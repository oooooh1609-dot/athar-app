/// <reference lib="webworker" />
import {
  applySyntheticPolarization,
  applyAdvancedDStretch,
  carvedEnhance,
  decorrelationStretchFast,
  type EnhanceMode,
  type EnhanceParams,
} from "./pixel-kernels.js";

export interface ProcessImageMessage {
  id: string | number;
  imageData?: ImageData;
  mode?: "rgb" | "lab" | EnhanceMode;
  strength?: number;
  autoPolarize?: boolean;
  polarizeIntensity?: number;
  // Legacy fields
  width?: number;
  height?: number;
  buffer?: ArrayBuffer;
  params?: EnhanceParams;
}

export interface ProcessImageResponse {
  id: string | number;
  imageData?: ImageData;
  executionTimeMs?: number;
  width?: number;
  height?: number;
  buffer?: ArrayBuffer;
  error?: string;
}

// الاستماع لطلبات المعالجة القادمة من مساحة العمل (Workspace)
self.onmessage = async (event: MessageEvent<ProcessImageMessage>) => {
  const data = event.data;
  const startTime = performance.now();
  const post = (self as unknown as Worker).postMessage.bind(self);

  try {
    // 1. التعامل مع صيغة ImageData المباشرة (ProcessImageMessage)
    if (data.imageData) {
      const {
        id,
        imageData,
        mode = "rgb",
        strength = 1.2,
        autoPolarize = true,
        polarizeIntensity = 0.75,
      } = data;

      // 1.1 عزل وهج شمس الصحراء وانعكاسات الكوارتز أولاً لتنظيف قنوات الإضاءة
      if (autoPolarize) {
        applySyntheticPolarization(imageData, polarizeIntensity, 190);
      }

      // 1.2 تطبيق تمديد التباين اللوني (DStretch) على القنوات الصافية
      applyAdvancedDStretch(imageData, mode, strength);

      const executionTimeMs = performance.now() - startTime;

      // 1.3 إعادة البيانات عبر نقل ملكية الذاكرة مباشرة (Zero-Copy Transfer)
      post(
        {
          id,
          imageData,
          executionTimeMs,
        } as ProcessImageResponse,
        [imageData.data.buffer],
      );
      return;
    }

    // 2. التعامل مع الصيغة السابقة للـ Buffer المتدفق (Legacy Req format)
    const { id, mode, width, height, buffer, params } = data;
    if (buffer && width && height) {
      const d = new Uint8ClampedArray(buffer);
      if (mode === "pigments") {
        decorrelationStretchFast(d, params?.strength ?? 1.2, width, height, "crgb");
        if (params && (params.sharpen > 0 || params.denoise)) {
          carvedEnhance(d, width, height, {
            ...params,
            strength: 0,
            grayscale: false,
          });
        }
      } else {
        if (params?.grayscale) {
          decorrelationStretchFast(d, params?.strength ?? 1.2, width, height, "yds");
          if (params) carvedEnhance(d, width, height, params);
        } else {
          decorrelationStretchFast(d, params?.strength ?? 1.2, width, height, "lds");
          if (params) carvedEnhance(d, width, height, params);
        }
      }

      post({ id, width, height, buffer: d.buffer }, [d.buffer]);
      return;
    }

    throw new Error("Invalid image payload received by worker");
  } catch (error) {
    post({
      id: data?.id,
      error: error instanceof Error ? error.message : "Unknown worker processing error",
    });
  }
};
