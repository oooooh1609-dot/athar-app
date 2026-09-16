export const FEATURE_VERSION: number;
export const FEATURE_DIM: number;

export type DetectedGlyph = {
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  line: number;
  order: number;
  strokeLen: number;
  endpoints: number;
  junctions: number;
  holes: number;
  features: number[];
};

export type Segmentation = {
  width: number;
  height: number;
  direction: "rtl" | "ltr";
  inkRatio: number;
  lines: number;
  candidates: number;
  shadowsFlattened: boolean;
  suppressedCracks: number;
  glyphs: DetectedGlyph[];
  featureVersion: number;
};

export function segmentGlyphs(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts?: {
    invert?: boolean;
    k?: number;
    direction?: "rtl" | "ltr";
    flattenShadows?: boolean;
    suppressCracks?: boolean;
  },
): Segmentation;
