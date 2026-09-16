/**
 * The extensions that ship with the application.
 *
 * `athar-local-contrast` is a real, working browser extension: its module below
 * is the code that actually runs in the sandbox — a CLAHE-style local contrast
 * pass followed by unsharp masking, entirely on the device, with no network use
 * and no paid service. It is the verified example the administrator can test.
 *
 * Meshroom is registered as an external-worker integration only. Saving it does
 * not make reconstruction available: it stays unavailable until a real worker on
 * a real computer connects.
 */

import type { ExtensionManifest } from "./extension-contract";

export const LOCAL_CONTRAST_MODULE = `
/**
 * Local contrast + unsharp mask. Input and output are RGBA pixels.
 * Parameters: strength (0-1), radius (px), tiles (grid per axis).
 */
export async function process(req) {
  const { width, height, data, params, report } = req;
  const strength = Math.max(0, Math.min(1, Number(params.strength ?? 0.6)));
  const radius = Math.max(1, Math.min(12, Math.round(Number(params.radius ?? 3))));
  const tiles = Math.max(2, Math.min(16, Math.round(Number(params.tiles ?? 8))));

  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 4, p++)
    luma[p] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  report(0.2, "measuring luminance");

  // Per-tile histogram equalisation with a clip limit, bilinearly blended.
  const tw = Math.ceil(width / tiles), th = Math.ceil(height / tiles);
  const maps = [];
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const hist = new Float32Array(256);
      let n = 0;
      for (let y = ty * th; y < Math.min(height, (ty + 1) * th); y++)
        for (let x = tx * tw; x < Math.min(width, (tx + 1) * tw); x++) {
          hist[Math.max(0, Math.min(255, luma[y * width + x] | 0))]++;
          n++;
        }
      const clip = (n / 256) * 3;
      let excess = 0;
      for (let i = 0; i < 256; i++) if (hist[i] > clip) { excess += hist[i] - clip; hist[i] = clip; }
      const add = excess / 256;
      const cdf = new Float32Array(256);
      let acc = 0;
      for (let i = 0; i < 256; i++) { acc += hist[i] + add; cdf[i] = acc; }
      const total = acc || 1;
      const map = new Float32Array(256);
      for (let i = 0; i < 256; i++) map[i] = (cdf[i] / total) * 255;
      maps.push(map);
    }
  }
  report(0.55, "equalising local contrast");

  const eq = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const fy = Math.min(tiles - 1, y / th - 0.5), y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(tiles - 1, y0 + 1);
    const wy = Math.max(0, Math.min(1, fy - y0));
    for (let x = 0; x < width; x++) {
      const fx = Math.min(tiles - 1, x / tw - 0.5), x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(tiles - 1, x0 + 1);
      const wx = Math.max(0, Math.min(1, fx - x0));
      const v = Math.max(0, Math.min(255, luma[y * width + x] | 0));
      const a = maps[y0 * tiles + x0][v], b = maps[y0 * tiles + x1][v];
      const c = maps[y1 * tiles + x0][v], d = maps[y1 * tiles + x1][v];
      eq[y * width + x] = (a * (1 - wx) + b * wx) * (1 - wy) + (c * (1 - wx) + d * wx) * wy;
    }
  }

  // Unsharp mask on the equalised luminance using a box blur of the given radius.
  const blur = new Float32Array(width * height);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= width) continue;
          sum += eq[yy * width + xx]; count++;
        }
      }
      blur[y * width + x] = sum / (count || 1);
    }
  report(0.85, "sharpening");

  const out = new Uint8ClampedArray(data.length);
  for (let p = 0, i = 0; p < eq.length; p++, i += 4) {
    const sharp = eq[p] + (eq[p] - blur[p]) * strength;
    const base = luma[p] || 1;
    const gain = (base + (sharp - base) * (0.4 + strength * 0.6)) / base;
    out[i] = data[i] * gain;
    out[i + 1] = data[i + 1] * gain;
    out[i + 2] = data[i + 2] * gain;
    out[i + 3] = data[i + 3];
  }
  report(1, "done");
  return { width, height, data: out };
}
`;

export const LOCAL_CONTRAST_MANIFEST: ExtensionManifest = {
  contract: 1,
  name: "Local contrast & unsharp (Athar)",
  version: "1.0.0",
  purpose:
    "Brings out shallow carving and faint pigment by equalising contrast tile by tile and then sharpening. Runs entirely on this device; the original photograph is kept and the result is saved separately.",
  runtime: "browser",
  license: "MIT (bundled with Athar)",
  requirements: "None. Any modern browser; no GPU, no server, no download.",
  surfaces: ["camera", "editor", "library"],
  inputs: ["image/jpeg", "image/png"],
  outputs: ["image/jpeg"],
  params: [
    {
      key: "strength",
      label: "Strength",
      type: "number",
      default: 0.6,
      min: 0,
      max: 1,
      step: 0.05,
    },
    {
      key: "radius",
      label: "Detail radius (px)",
      type: "number",
      default: 3,
      min: 1,
      max: 12,
      step: 1,
    },
    { key: "tiles", label: "Tiles per axis", type: "number", default: 8, min: 2, max: 16, step: 1 },
  ],
  permissions: ["read:selected-file", "write:derived-output", "report:progress"],
  needsPaidService: false,
};

export const MESHROOM_MANIFEST: ExtensionManifest = {
  contract: 1,
  name: "Meshroom / AliceVision photogrammetry",
  version: "2023.3.0",
  purpose:
    "Turns a set of overlapping photographs into a textured 3D model. The reconstruction runs on your own computer through the Athar worker, never in the browser and never in a server function.",
  runtime: "external_worker",
  license: "MPL-2.0 (Meshroom) / MPL-2.0 (AliceVision) — no licence fee",
  sourceUrl: "https://alicevision.org/#meshroom",
  requirements:
    "A computer you keep powered on and connected while a job runs: 16 GB RAM or more, 20+ GB free disk per job, and an NVIDIA CUDA GPU for the full pipeline (draft pipeline otherwise). Meshroom installed, Blender optional for GLB conversion.",
  endpoint: "/api/public/worker",
  surfaces: ["three_d"],
  inputs: ["image/jpeg", "image/png"],
  outputs: ["model/gltf-binary"],
  permissions: ["read:selected-file", "write:derived-output", "report:progress"],
  needsPaidService: false,
};
