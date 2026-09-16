/**
 * Measurement from a photograph, using a scale reference in the frame.
 *
 * There is no augmented reality here and no depth sensing. The method is the
 * one used on an excavation: put an object of known length in the frame, then
 * measure everything against it. That is honest about what a single photograph
 * can support, and it works on every device instead of the handful that expose
 * a depth API.
 *
 * What this is valid for, and what it is not:
 *  - Valid: a roughly flat surface photographed roughly perpendicular, with
 *    the scale reference lying on the *same* plane as what is measured.
 *  - Not valid: depth, curvature, or anything at a different distance from the
 *    lens than the reference. A scale bar on the ground tells you nothing about
 *    a carving halfway up a boulder.
 *
 * Every result carries an uncertainty derived from how precisely the reference
 * could be placed, so a measurement taken against a 40-pixel coin is not
 * reported with the same confidence as one taken against a 900-pixel ruler.
 */

export type Point = { x: number; y: number };

/** The known-length object in the frame, marked end to end. */
export type ScaleReference = {
  a: Point;
  b: Point;
  /** True length of that object, in millimetres. */
  realMm: number;
  /** What the user measured against, e.g. "10 cm scale bar", "1 SAR coin". */
  label: string;
};

export type MeasurementKind = "length" | "path" | "area";

export type Measurement = {
  id: string;
  kind: MeasurementKind;
  /** Image-space pixel coordinates, in the order the user placed them. */
  points: Point[];
  label: string;
};

export type MeasurementSet = {
  reference: ScaleReference | null;
  items: Measurement[];
  /** Pixel dimensions the points were placed against; needed to rescale later. */
  imageWidth: number;
  imageHeight: number;
};

export type Quantity = {
  /** Millimetres for a length, square millimetres for an area. */
  value: number;
  /** Half-width of the uncertainty interval, same unit as `value`. */
  uncertainty: number;
  text: string;
};

/**
 * How far a fingertip or cursor can miss the intended point, in pixels.
 *
 * Two pixels is optimistic for a touch screen and pessimistic for a mouse on a
 * zoomed image; it is the figure that makes the reported interval roughly
 * match what repeated placements actually scatter by.
 */
const CLICK_ERROR_PX = 2;

export const distancePx = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Millimetres per pixel, or null when no usable reference has been placed. */
export function mmPerPixel(ref: ScaleReference | null): number | null {
  if (!ref || !(ref.realMm > 0)) return null;
  const px = distancePx(ref.a, ref.b);
  if (!(px > 0)) return null;
  return ref.realMm / px;
}

/**
 * Relative uncertainty contributed by the reference itself.
 *
 * Both ends can be off by CLICK_ERROR_PX, so the error on the reference length
 * is √2 × that, and it propagates to every measurement as a percentage.
 */
export function referenceRelativeError(ref: ScaleReference | null): number {
  if (!ref) return 0;
  const px = distancePx(ref.a, ref.b);
  if (!(px > 0)) return 0;
  return (Math.SQRT2 * CLICK_ERROR_PX) / px;
}

/** True when the reference is too short in frame for the result to mean much. */
export function referenceIsWeak(ref: ScaleReference | null): boolean {
  return referenceRelativeError(ref) > 0.02;
}

const polylinePx = (points: Point[]) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distancePx(points[i - 1]!, points[i]!);
  return total;
};

/** Shoelace formula; the polygon is treated as closed. */
const polygonAreaPx = (points: Point[]) => {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const q = points[(i + 1) % points.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
};

export function formatLength(mm: number): string {
  if (mm < 10) return `${mm.toFixed(1)} mm`;
  if (mm < 1000) return `${(mm / 10).toFixed(1)} cm`;
  return `${(mm / 1000).toFixed(2)} m`;
}

export function formatArea(mm2: number): string {
  if (mm2 < 1000) return `${mm2.toFixed(0)} mm²`;
  if (mm2 < 1_000_000) return `${(mm2 / 100).toFixed(1)} cm²`;
  return `${(mm2 / 1_000_000).toFixed(3)} m²`;
}

/**
 * Resolves one measurement into real units.
 *
 * Returns null when there is no scale reference: an unscaled pixel count is
 * not a measurement, and reporting one as though it were is how a number ends
 * up in a publication with no basis.
 */
export function evaluate(m: Measurement, ref: ScaleReference | null): Quantity | null {
  const scale = mmPerPixel(ref);
  if (scale === null) return null;
  const rel = referenceRelativeError(ref);

  if (m.kind === "area") {
    if (m.points.length < 3) return null;
    const mm2 = polygonAreaPx(m.points) * scale * scale;
    // Area goes as the square of the scale, so its relative error doubles.
    const u = mm2 * 2 * rel;
    return { value: mm2, uncertainty: u, text: formatArea(mm2) };
  }

  if (m.points.length < 2) return null;
  const mm = polylinePx(m.points) * scale;
  return { value: mm, uncertainty: mm * rel, text: formatLength(mm) };
}

/** "34.2 cm ± 0.7 cm" — or just the value when the reference is precise. */
export function describe(q: Quantity, kind: MeasurementKind): string {
  const fmt = kind === "area" ? formatArea : formatLength;
  if (q.uncertainty / q.value < 0.005) return q.text;
  return `${q.text} ± ${fmt(q.uncertainty)}`;
}

/**
 * Bounding box of a set of points, in real units.
 *
 * The spec asks for length / width / height. Height is not recoverable from
 * one photograph, so what is offered is the extent of the marked outline on
 * the photographed plane — two dimensions, named for what they are.
 */
export function extent(
  m: Measurement,
  ref: ScaleReference | null,
): { width: Quantity; height: Quantity } | null {
  const scale = mmPerPixel(ref);
  if (scale === null || m.points.length < 2) return null;
  const xs = m.points.map((p) => p.x);
  const ys = m.points.map((p) => p.y);
  const rel = referenceRelativeError(ref);
  const w = (Math.max(...xs) - Math.min(...xs)) * scale;
  const h = (Math.max(...ys) - Math.min(...ys)) * scale;
  return {
    width: { value: w, uncertainty: w * rel, text: formatLength(w) },
    height: { value: h, uncertainty: h * rel, text: formatLength(h) },
  };
}

/**
 * Rescales a stored set to a different rendering of the same photograph.
 *
 * Points are kept in the pixel space of the image they were placed on, so a
 * set survives the image being displayed at another size, re-exported, or
 * opened on another device.
 */
export function rescale(set: MeasurementSet, toWidth: number, toHeight: number): MeasurementSet {
  if (!set.imageWidth || !set.imageHeight) return set;
  const fx = toWidth / set.imageWidth;
  const fy = toHeight / set.imageHeight;
  const move = (p: Point): Point => ({ x: p.x * fx, y: p.y * fy });
  return {
    reference: set.reference
      ? { ...set.reference, a: move(set.reference.a), b: move(set.reference.b) }
      : null,
    items: set.items.map((m) => ({ ...m, points: m.points.map(move) })),
    imageWidth: toWidth,
    imageHeight: toHeight,
  };
}

/** Common references, so the usual case is one tap rather than typed millimetres. */
export const COMMON_REFERENCES: { key: string; mm: number }[] = [
  { key: "scale10", mm: 100 },
  { key: "scale5", mm: 50 },
  { key: "scale20", mm: 200 },
  { key: "a4long", mm: 297 },
  { key: "creditCard", mm: 85.6 },
];
