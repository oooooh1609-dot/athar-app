export type EnhanceMode = "pigments" | "carved";

export type EnhanceParams = {
  strength: number;
  clipLimit: number;
  sharpen: number;
  denoise: boolean;
  grayscale: boolean;
};

export function decorrelationStretchCRGB(
  data: Uint8ClampedArray,
  strength: number,
  width?: number,
  height?: number,
): void;

export function decorrelationStretchLDS(
  data: Uint8ClampedArray,
  strength: number,
  width?: number,
  height?: number,
  params?: Partial<EnhanceParams>,
): void;

export function decorrelationStretchYDS(
  data: Uint8ClampedArray,
  strength: number,
  width?: number,
  height?: number,
  params?: Partial<EnhanceParams>,
): void;

export function decorrelationStretch(
  data: Uint8ClampedArray,
  strength: number,
  filterMode?: "crgb" | "lds" | "yds" | string,
): void;

export function decorrelationStretchFast(
  data: Uint8ClampedArray,
  strength: number,
  width?: number,
  height?: number,
  filterMode?: "crgb" | "lds" | "yds" | string,
): void;

export function carvedEnhance(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  params: EnhanceParams,
): void;

export function applySyntheticPolarization<T extends ImageData | Uint8ClampedArray>(
  imageData: T,
  intensity?: number,
  threshold?: number,
): T;

export function applyAdvancedDStretch<T extends ImageData | Uint8ClampedArray>(
  imageData: T,
  mode?: "rgb" | "lab" | "crgb" | "lds" | "yds" | string,
  strength?: number,
): T;
