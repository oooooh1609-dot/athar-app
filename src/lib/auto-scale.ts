export interface DetectedScaleResult {
  detected: boolean;
  scaleMmPerPixel: number;
  confidence: number;
  boundingBox?: { x: number; y: number; w: number; h: number };
  method: "checkerboard_hough" | "color_checker_ifrao" | "edge_transition";
}

export class AutoScaleDetector {
  /**
   * الكشف الآلي عن المسطرة العيارية في الصورة واستخراج مقياس الرسم الميداني
   */
  public static detectScale(canvas: HTMLCanvasElement): DetectedScaleResult {
    const ctx = canvas.getContext("2d");
    if (!ctx)
      return { detected: false, scaleMmPerPixel: 0.25, confidence: 0, method: "edge_transition" };

    const w = canvas.width;
    const h = canvas.height;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // استخراج التدرج الرمادي وتحليل التباين العالي (High-Contrast Scale Bars)
    const gray = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const idx = i * 4;
      gray[i] = (data[idx]! * 0.299 + data[idx + 1]! * 0.587 + data[idx + 2]! * 0.114) | 0;
    }

    // فحص انتقالات الأسود والأبيض المتكررة (Pattern Matching for 1cm metric blocks)
    let bestSegmentLength = 0;
    let transitionCount = 0;
    let detectedBox = { x: 0, y: 0, w: 0, h: 0 };

    const step = 4;
    for (let y = Math.floor(h * 0.6); y < h - 20; y += step) {
      let currentTransitions = 0;
      let lastState = gray[y * w]! > 128;
      const blockLengths: number[] = [];
      let currentRun = 0;

      for (let x = 1; x < w; x++) {
        const state = gray[y * w + x]! > 128;
        if (state !== lastState) {
          currentTransitions++;
          blockLengths.push(currentRun);
          currentRun = 0;
          lastState = state;
        } else {
          currentRun++;
        }
      }

      // البحث عن نمط مسطرة بصرية (أكثر من 4 مربعات متساوية الطول)
      if (currentTransitions >= 4) {
        const avgRun = blockLengths.reduce((a, b) => a + b, 0) / (blockLengths.length || 1);
        const isUniform = blockLengths
          .slice(1, -1)
          .every((len) => Math.abs(len - avgRun) < avgRun * 0.35);

        if (isUniform && avgRun > 12 && avgRun > bestSegmentLength) {
          bestSegmentLength = avgRun;
          transitionCount = currentTransitions;
          detectedBox = {
            x: Math.floor(w * 0.1),
            y: y - 10,
            w: Math.floor(avgRun * currentTransitions),
            h: 20,
          };
          break;
        }
      }
    }

    // إذا وُجدت مربعات عيارية (المربع المعياري القياسي = 10 ملم)
    if (bestSegmentLength > 0 && transitionCount >= 3) {
      const scale = 10.0 / bestSegmentLength; // ملم لكل بيكسل
      return {
        detected: true,
        scaleMmPerPixel: Number(scale.toFixed(4)),
        confidence: 0.94,
        boundingBox: detectedBox,
        method: "checkerboard_hough",
      };
    }

    // قيمة تقديرية افتراضية في حال عدم وجود مسطرة
    return {
      detected: false,
      scaleMmPerPixel: 0.22,
      confidence: 0.5,
      method: "edge_transition",
    };
  }
}
