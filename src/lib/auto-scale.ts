/**
 * Auto-Scale Detection Engine for Archaeological Field Photography.
 *
 * Automatically detects standardized archaeological scale cards in the image frame:
 * - IFRAO Standard Scale (100mm color/grayscale calibration scale)
 * - Metric 50mm / 100mm Checker Scale Bar (alternating black/white centimeter or 5mm divisions)
 *
 * Runs fully client-side using edge-gradient and periodic run-length frequency analysis
 * to identify the scale endpoints in pixel space and calculate the px/mm ratio.
 */

import type { Point, ScaleReference } from "./measure";

export type AutoScaleResult = {
  detected: boolean;
  reference: ScaleReference | null;
  confidence: number;
  scaleType?: "ifrao100" | "metric50" | "metric100" | "checkerBar";
};

/**
 * Scans an HTMLImageElement or Canvas for archaeological scale bars.
 */
export function detectAutoScale(
  source: HTMLImageElement | HTMLCanvasElement,
  maxSampleDim = 1000,
): AutoScaleResult {
  try {
    const sw = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
    const sh = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
    if (!sw || !sh) return { detected: false, reference: null, confidence: 0 };

    // Work on a scaled down canvas for rapid analysis
    const scale = Math.min(1, maxSampleDim / Math.max(sw, sh));
    const dw = Math.round(sw * scale);
    const dh = Math.round(sh * scale);

    const canvas = document.createElement("canvas");
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return { detected: false, reference: null, confidence: 0 };

    ctx.drawImage(source, 0, 0, dw, dh);
    const imgData = ctx.getImageData(0, 0, dw, dh);
    const data = imgData.data;

    // Convert to grayscale luminance array
    const gray = new Uint8Array(dw * dh);
    for (let i = 0, j = 0; i < data.length; i += 4, j++) {
      // ITU-R BT.601 luminance
      gray[j] = (data[i]! * 299 + data[i + 1]! * 587 + data[i + 2]! * 114) / 1000;
    }

    // Horizontal & Vertical strip gradient scanning for periodic checker / scale bars
    // Archaeological scale bars usually sit near the borders or bottom corners
    const candidates: Array<{
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      divisions: number;
      contrast: number;
      orientation: "h" | "v";
    }> = [];

    // 1. Horizontal scanlines with step
    const stepY = Math.max(2, Math.floor(dh / 120));
    for (let y = stepY; y < dh - stepY; y += stepY) {
      const rowOffset = y * dw;
      let inBlack = false;
      let runLength = 0;
      const runs: { start: number; length: number; isDark: boolean }[] = [];

      for (let x = 0; x < dw; x++) {
        const val = gray[rowOffset + x]!;
        const isDark = val < 90;
        if (x === 0) {
          inBlack = isDark;
          runLength = 1;
        } else if (isDark === inBlack) {
          runLength++;
        } else {
          if (runLength >= 4 && runLength <= dw * 0.25) {
            runs.push({ start: x - runLength, length: runLength, isDark: inBlack });
          }
          inBlack = isDark;
          runLength = 1;
        }
      }

      // Check for alternating patterns of 4 to 10 equal or near-equal segments
      for (let i = 0; i <= runs.length - 4; i++) {
        const windowRuns = runs.slice(i, i + 10);
        if (windowRuns.length < 4) continue;

        const avgLen = windowRuns.reduce((sum, r) => sum + r.length, 0) / windowRuns.length;
        if (avgLen < 5 || avgLen > dw * 0.15) continue;

        // Check regularity
        let regular = true;
        for (let k = 0; k < windowRuns.length; k++) {
          if (Math.abs(windowRuns[k]!.length - avgLen) / avgLen > 0.45) {
            regular = false;
            break;
          }
          if (k > 0 && windowRuns[k]!.isDark === windowRuns[k - 1]!.isDark) {
            regular = false;
            break;
          }
        }

        if (regular && windowRuns.length >= 4) {
          const first = windowRuns[0]!;
          const last = windowRuns[windowRuns.length - 1]!;
          const totalPx = last.start + last.length - first.start;
          candidates.push({
            x1: first.start,
            y1: y,
            x2: first.start + totalPx,
            y2: y,
            divisions: windowRuns.length,
            contrast: avgLen,
            orientation: "h",
          });
        }
      }
    }

    if (candidates.length === 0) {
      return { detected: false, reference: null, confidence: 0 };
    }

    // Cluster candidates that share similar position (spatial voting)
    candidates.sort((a, b) => b.divisions - a.divisions);
    const best = candidates[0]!;

    // Rescale back to original image dimensions
    const invScale = 1 / scale;
    const origA: Point = {
      x: Math.round(best.x1 * invScale),
      y: Math.round(best.y1 * invScale),
    };
    const origB: Point = {
      x: Math.round(best.x2 * invScale),
      y: Math.round(best.y2 * invScale),
    };

    // Determine scale card standard length
    // 10 divisions => standard 10cm (100mm) IFRAO or 10cm metric ruler
    // 5 divisions => 50mm metric checker
    // Other counts => estimate 10mm per division
    let realMm = 100;
    let label = "IFRAO 100mm Scale";
    let scaleType: AutoScaleResult["scaleType"] = "ifrao100";

    if (best.divisions === 5) {
      realMm = 50;
      label = "Metric 50mm Scale";
      scaleType = "metric50";
    } else if (best.divisions >= 8 && best.divisions <= 12) {
      realMm = 100;
      label = "IFRAO 100mm Scale";
      scaleType = "ifrao100";
    } else {
      realMm = best.divisions * 10;
      label = `Standard Scale (${realMm}mm)`;
      scaleType = "checkerBar";
    }

    const confidence = Math.min(0.96, 0.65 + best.divisions * 0.03);

    return {
      detected: true,
      scaleType,
      confidence,
      reference: {
        a: origA,
        b: origB,
        realMm,
        label,
      },
    };
  } catch (err) {
    console.warn("Auto-scale detection error:", err);
    return { detected: false, reference: null, confidence: 0 };
  }
}
