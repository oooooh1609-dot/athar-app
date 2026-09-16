// src/workers/image-worker.ts
import { applySyntheticPolarization, applyAdvancedDStretch } from "../lib/pixel-kernels.js";

export interface ProcessImageMessage {
  id: string;
  imageData: ImageData;
  mode?: "rgb" | "lab";
  strength?: number;
  autoPolarize?: boolean;
  polarizeIntensity?: number;
}

export interface ProcessImageResponse {
  id: string;
  imageData: ImageData;
  executionTimeMs: number;
}

// الاستماع لطلبات المعالجة القادمة من مساحة العمل (Workspace)
self.onmessage = async (event: MessageEvent<ProcessImageMessage>) => {
  const {
    id,
    imageData,
    mode = "rgb",
    strength = 1.2,
    autoPolarize = true,
    polarizeIntensity = 0.75,
  } = event.data;

  const startTime = performance.now();

  try {
    // 1. عزل وهج شمس الصحراء وانعكاسات الكوارتز أولاً لتنظيف قنوات الإضاءة
    if (autoPolarize) {
      applySyntheticPolarization(imageData, polarizeIntensity, 190);
    }

    // 2. تطبيق تمديد التباين اللوني (DStretch) على القنوات الصافية
    applyAdvancedDStretch(imageData, mode, strength);

    const executionTimeMs = performance.now() - startTime;

    // 3. إعادة البيانات عبر نقل ملكية الذاكرة مباشرة (Zero-Copy Transfer)
    // نقل ImageData.data.buffer يمنع استنساخ البايتات ويحرر ذاكرة الـ Worker فوراً
    self.postMessage(
      {
        id,
        imageData,
        executionTimeMs,
      } as ProcessImageResponse,
      [imageData.data.buffer],
    );
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : "Unknown worker processing error",
    });
  }
};
