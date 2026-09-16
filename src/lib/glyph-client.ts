/** Browser side of letter detection: runs the kernels in a worker, crops previews. */

import type { DetectedGlyph, Segmentation } from "./glyph-kernels.js";

export type { DetectedGlyph, Segmentation };

let worker: Worker | null = null;
let seq = 0;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./glyph-worker.ts", import.meta.url), { type: "module" });
  }
  return worker;
}

/** Pixels processed for detection: enough for stroke detail, small enough for phones. */
export const DETECT_MAX_PIXELS = 1_400_000;

export function detectGlyphs(
  data: ImageData,
  opts: { invert: boolean; k: number; direction: "rtl" | "ltr" },
): Promise<Segmentation> {
  const w = getWorker();
  const id = ++seq;
  const copy = new Uint8ClampedArray(data.data);
  return new Promise((resolve, reject) => {
    const onMsg = (ev: MessageEvent<{ id: number; result?: Segmentation; error?: string }>) => {
      if (ev.data.id !== id) return;
      w.removeEventListener("message", onMsg);
      if (ev.data.error || !ev.data.result) {
        reject(new Error(ev.data.error ?? "detection failed"));
        return;
      }
      resolve(ev.data.result);
    };
    w.addEventListener("message", onMsg);
    w.postMessage({ id, width: data.width, height: data.height, buffer: copy.buffer, ...opts }, [
      copy.buffer,
    ]);
  });
}

/** Small PNG preview of one detected sign, with a little context around it. */
export function glyphThumbnail(source: HTMLCanvasElement, g: DetectedGlyph, size = 64) {
  const pad = Math.round(Math.max(g.w, g.h) * 0.18) + 2;
  const sx = Math.max(0, g.x - pad);
  const sy = Math.max(0, g.y - pad);
  const sw = Math.min(source.width - sx, g.w + pad * 2);
  const sh = Math.min(source.height - sy, g.h + pad * 2);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  const s = Math.min(size / sw, size / sh);
  const dw = sw * s;
  const dh = sh * s;
  ctx.drawImage(source, sx, sy, sw, sh, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return c.toDataURL("image/png");
}
