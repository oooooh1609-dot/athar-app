import type { EnhanceMode, EnhanceParams } from "./pixel-kernels.js";
export {
  decorrelationStretch,
  decorrelationStretchFast,
  decorrelationStretchCRGB,
  decorrelationStretchLDS,
  decorrelationStretchYDS,
  applySyntheticPolarization,
  applyAdvancedDStretch,
} from "./pixel-kernels.js";

export type { EnhanceMode, EnhanceParams };

let worker: Worker | null = null;
let seq = 0;

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./image-worker.ts", import.meta.url), {
      type: "module",
    });
  }
  return worker;
}

type WorkerReply = {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  error?: string;
};

export function enhanceImageData(
  data: ImageData,
  mode: EnhanceMode,
  params: EnhanceParams,
): Promise<ImageData> {
  const w = getWorker();
  const id = ++seq;
  const copy = new Uint8ClampedArray(data.data);
  return new Promise((resolve, reject) => {
    const onMsg = (ev: MessageEvent<WorkerReply>) => {
      if (ev.data.id !== id) return;
      w.removeEventListener("message", onMsg);
      if (ev.data.error) {
        reject(new Error(ev.data.error));
        return;
      }
      resolve(new ImageData(new Uint8ClampedArray(ev.data.buffer), ev.data.width, ev.data.height));
    };
    w.addEventListener("message", onMsg);
    w.postMessage(
      {
        id,
        mode,
        width: data.width,
        height: data.height,
        buffer: copy.buffer,
        params,
      },
      [copy.buffer],
    );
  });
}

/** Cap on pixels processed at full resolution, to stay inside mobile memory limits. */
export const MAX_EXPORT_PIXELS = 12_000_000;
/** Preview size used for interactive tuning. */
export const PREVIEW_MAX_PIXELS = 900_000;
/** Size sent to the analysis service. */
export const ANALYSIS_MAX_PIXELS = 2_200_000;

export function loadImageFromFile(file: File) {
  const url = URL.createObjectURL(file);
  const img = new Image();
  return new Promise<HTMLImageElement>((res, rej) => {
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("تعذّر فتح الصورة"));
    img.src = url;
  }).finally(() => {
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });
}

export function cropCanvas(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  scale = 1,
) {
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("تعذّر تهيئة معالجة الصورة");
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return c;
}

export function fitScale(w: number, h: number, maxPixels: number) {
  const p = w * h;
  return p <= maxPixels ? 1 : Math.sqrt(maxPixels / p);
}

export function imageDataOf(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("تعذّر قراءة بيانات الصورة");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function canvasFromImageData(data: ImageData) {
  const c = document.createElement("canvas");
  c.width = data.width;
  c.height = data.height;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("تعذّر رسم الصورة");
  ctx.putImageData(data, 0, 0);
  return c;
}

export function canvasToBlob(canvas: HTMLCanvasElement, quality = 0.95) {
  return new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("تعذّر إنشاء الملف"))), "image/jpeg", quality),
  );
}

export async function blobToDataUrl(blob: Blob) {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < buf.length; i += chunk) {
    bin += String.fromCharCode(...Array.from(buf.subarray(i, i + chunk)));
  }
  return `data:${blob.type};base64,${btoa(bin)}`;
}
