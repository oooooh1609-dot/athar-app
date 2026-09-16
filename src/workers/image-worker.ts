export interface WorkerTaskMessage {
  id: string;
  action: "d_stretch" | "clahe" | "sobel_normals" | "poisson_depth";
  buffer: ArrayBuffer;
  width: number;
  height: number;
  params?: Record<string, unknown>;
}

export interface WorkerResponseMessage {
  id: string;
  buffer: ArrayBuffer;
  executionTimeMs: number;
  error?: string;
}

self.onmessage = (e: MessageEvent<WorkerTaskMessage>) => {
  const { id, action, buffer, width, height, params } = e.data;
  const startTime = performance.now();

  try {
    const data = new Uint8ClampedArray(buffer);

    switch (action) {
      case "d_stretch": {
        applyDStretchInWorker(data, width, height, (params?.mode as string) || "YDS");
        break;
      }
      case "clahe": {
        applyClaheInWorker(data, width, height, (params?.clipLimit as number) || 2.5);
        break;
      }
      case "sobel_normals": {
        applyScharrNormalsInWorker(data, width, height, (params?.scale as number) || 4.2);
        break;
      }
      case "poisson_depth": {
        applyPoissonInWorker(data, width, height);
        break;
      }
      default:
        throw new Error(`الإجراء ${action} غير مدعوم في معالج الخلفية`);
    }

    const executionTimeMs = performance.now() - startTime;
    // إعادة البفر بدون نسخ في الذاكرة (Transferable ArrayBuffer)
    self.postMessage({ id, buffer: data.buffer, executionTimeMs } as WorkerResponseMessage, [
      data.buffer,
    ]);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({
      id,
      buffer,
      executionTimeMs: 0,
      error: message,
    } as WorkerResponseMessage);
  }
};

function applyDStretchInWorker(
  data: Uint8ClampedArray,
  _w: number,
  _h: number,
  mode: string,
): void {
  const len = data.length;
  let mR = 0,
    mG = 0,
    mB = 0;
  const count = len / 4;

  for (let i = 0; i < len; i += 4) {
    mR += data[i]!;
    mG += data[i + 1]!;
    mB += data[i + 2]!;
  }
  mR /= count;
  mG /= count;
  mB /= count;

  for (let i = 0; i < len; i += 4) {
    const r = data[i]! - mR;
    const g = data[i + 1]! - mG;
    const b = data[i + 2]! - mB;

    if (mode === "YDS") {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      const cr = (r - y) * 2.4;
      const cb = (b - y) * 2.8;

      data[i] = Math.min(255, Math.max(0, 128 + y + 1.4 * cr));
      data[i + 1] = Math.min(255, Math.max(0, 128 + y - 0.34 * cb - 0.71 * cr));
      data[i + 2] = Math.min(255, Math.max(0, 128 + y + 1.77 * cb));
    } else {
      data[i] = Math.min(255, Math.max(0, 128 + r * 2.2));
      data[i + 1] = Math.min(255, Math.max(0, 128 + g * 2.2));
      data[i + 2] = Math.min(255, Math.max(0, 128 + b * 2.6));
    }
  }
}

function applyClaheInWorker(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  clipLimit: number,
): void {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114;
  }

  const gridSize = 8;
  const tileW = Math.ceil(w / gridSize);
  const tileH = Math.ceil(h / gridSize);

  for (let gy = 0; gy < gridSize; gy++) {
    for (let gx = 0; gx < gridSize; gx++) {
      const hist = new Uint32Array(256);
      const startX = gx * tileW;
      const startY = gy * tileH;
      const endX = Math.min(startX + tileW, w);
      const endY = Math.min(startY + tileH, h);
      const totalPixels = (endX - startX) * (endY - startY);

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          hist[Math.floor(lum[y * w + x]!)]++;
        }
      }

      const actualClip = (clipLimit * totalPixels) / 256;
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i]! > actualClip) {
          excess += hist[i]! - actualClip;
          hist[i] = actualClip;
        }
      }

      const bonus = excess / 256;
      for (let i = 0; i < 256; i++) hist[i] += bonus;

      const cdf = new Float32Array(256);
      let acc = 0;
      for (let i = 0; i < 256; i++) {
        acc += hist[i]!;
        cdf[i] = (acc / totalPixels) * 255;
      }

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const p = y * w + x;
          const oldV = Math.floor(lum[p]!);
          const newV = cdf[oldV]!;
          const ratio = oldV > 0 ? newV / oldV : 1;

          const dIdx = p * 4;
          data[dIdx] = Math.min(255, data[dIdx]! * ratio);
          data[dIdx + 1] = Math.min(255, data[dIdx + 1]! * ratio);
          data[dIdx + 2] = Math.min(255, data[dIdx + 2]! * ratio);
        }
      }
    }
  }
}

function applyScharrNormalsInWorker(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  scale: number,
): void {
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    lum[i] = (data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114) / 255.0;
  }

  const getL = (x: number, y: number) =>
    lum[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))]!;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (getL(x + 1, y) - getL(x - 1, y)) * scale;
      const dy = (getL(x, y + 1) - getL(x, y - 1)) * scale;
      const dz = 0.18;
      const len = Math.hypot(dx, dy, dz);

      const idx = (y * w + x) * 4;
      data[idx] = ((dx / len) * 0.5 + 0.5) * 255;
      data[idx + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[idx + 2] = ((dz / len) * 0.5 + 0.5) * 255;
    }
  }
}

function applyPoissonInWorker(data: Uint8ClampedArray, _w: number, _h: number): void {
  for (let i = 0; i < data.length; i += 4) {
    const lum = data[i]! * 0.299 + data[i + 1]! * 0.587 + data[i + 2]! * 0.114;
    data[i] = lum;
    data[i + 1] = lum;
    data[i + 2] = lum;
  }
}
