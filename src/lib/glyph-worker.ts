/// <reference lib="webworker" />
import { segmentGlyphs } from "./glyph-kernels.js";

type Req = {
  id: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  invert: boolean;
  k: number;
  direction: "rtl" | "ltr";
};

self.onmessage = (ev: MessageEvent<Req>) => {
  const { id, width, height, buffer, invert, k, direction } = ev.data;
  const post = (self as unknown as Worker).postMessage.bind(self);
  try {
    const data = new Uint8ClampedArray(buffer);
    const result = segmentGlyphs(data, width, height, { invert, k, direction });
    post({ id, result });
  } catch (e) {
    post({ id, error: e instanceof Error ? e.message : "detection failed" });
  }
};
