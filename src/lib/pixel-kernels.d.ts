export type EnhanceMode = "pigments" | "carved";

export type EnhanceParams = {
  strength: number;
  clipLimit: number;
  sharpen: number;
  denoise: boolean;
  grayscale: boolean;
};

export function decorrelationStretch(data: Uint8ClampedArray, strength: number): void;

export function decorrelationStretchFast(
  data: Uint8ClampedArray,
  strength: number,
  width?: number,
  height?: number,
): void;

export function carvedEnhance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: EnhanceParams,
): void;
