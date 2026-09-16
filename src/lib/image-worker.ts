/// <reference lib="webworker" />
import {
  carvedEnhance,
  decorrelationStretch,
  type EnhanceMode,
  type EnhanceParams,
} from "./pixel-kernels.js";

type Req = {
  id: number;
  mode: EnhanceMode;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  params: EnhanceParams;
};

self.onmessage = (ev: MessageEvent<Req>) => {
  const { id, mode, width, height, buffer, params } = ev.data;
  const post = (self as unknown as Worker).postMessage.bind(self);
  try {
    const d = new Uint8ClampedArray(buffer);
    if (mode === "pigments") {
      decorrelationStretch(d, params.strength);
      if (params.sharpen > 0 || params.denoise) {
        // keep pigment mode chromatic: only optional mild luminance cleanup
        carvedEnhance(d, width, height, {
          ...params,
          strength: 0,
          grayscale: false,
        });
      }
    } else {
      carvedEnhance(d, width, height, params);
    }
    post({ id, width, height, buffer: d.buffer }, [d.buffer]);
  } catch (e) {
    post({ id, error: e instanceof Error ? e.message : "processing failed" });
  }
};
