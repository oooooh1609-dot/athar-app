// Bodies copied verbatim from src/lib/measure.ts, types removed only.
const CLICK_ERROR_PX = 2;
const distancePx = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);

function mmPerPixel(ref) {
  if (!ref || !(ref.realMm > 0)) return null;
  const px = distancePx(ref.a, ref.b);
  if (!(px > 0)) return null;
  return ref.realMm / px;
}
function referenceRelativeError(ref) {
  if (!ref) return 0;
  const px = distancePx(ref.a, ref.b);
  if (!(px > 0)) return 0;
  return (Math.SQRT2 * CLICK_ERROR_PX) / px;
}
const polylinePx = (points) => {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distancePx(points[i - 1], points[i]);
  return total;
};
const polygonAreaPx = (points) => {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const q = points[(i + 1) % points.length];
    sum += p.x * q.y - q.x * p.y;
  }
  return Math.abs(sum) / 2;
};
function formatLength(mm) {
  if (mm < 10) return `${mm.toFixed(1)} mm`;
  if (mm < 1000) return `${(mm / 10).toFixed(1)} cm`;
  return `${(mm / 1000).toFixed(2)} m`;
}
function formatArea(mm2) {
  if (mm2 < 1000) return `${mm2.toFixed(0)} mm²`;
  if (mm2 < 1_000_000) return `${(mm2 / 100).toFixed(1)} cm²`;
  return `${(mm2 / 1_000_000).toFixed(3)} m²`;
}
function evaluate(m, ref) {
  const scale = mmPerPixel(ref);
  if (scale === null) return null;
  const rel = referenceRelativeError(ref);
  if (m.kind === "area") {
    if (m.points.length < 3) return null;
    const mm2 = polygonAreaPx(m.points) * scale * scale;
    return { value: mm2, uncertainty: mm2 * 2 * rel, text: formatArea(mm2) };
  }
  if (m.points.length < 2) return null;
  const mm = polylinePx(m.points) * scale;
  return { value: mm, uncertainty: mm * rel, text: formatLength(mm) };
}
function extent(m, ref) {
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

/* ————————————— checks ————————————— */
let failed = 0;
const near = (name, got, want, tol = 1e-9) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got}, want ${want}`);
};
const eq = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}: got ${got}, want ${want}`);
};

// A 100 mm scale bar spanning 500 px => 0.2 mm/px.
const ref = { a: { x: 100, y: 100 }, b: { x: 600, y: 100 }, realMm: 100, label: "10 cm bar" };
near("mmPerPixel", mmPerPixel(ref), 0.2);

// A 3-4-5 triangle: 300,400 -> 500 px -> 100 mm.
const line = {
  id: "1",
  kind: "length",
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 400 },
  ],
  label: "",
};
near("length 3-4-5", evaluate(line, ref).value, 100);
eq("length text", evaluate(line, ref).text, "10.0 cm");

// Polyline: two 500 px legs => 200 mm.
const path = {
  id: "2",
  kind: "path",
  label: "",
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 400 },
    { x: 600, y: 0 },
  ],
};
near("polyline", evaluate(path, ref).value, 200);

// 200x100 px rectangle => 40x20 mm => 800 mm².
const rect = {
  id: "3",
  kind: "area",
  label: "",
  points: [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 0, y: 100 },
  ],
};
near("rect area", evaluate(rect, ref).value, 800);
eq("rect area text", evaluate(rect, ref).text, "800 mm²");

// Shoelace must not care about winding direction.
const rectCW = { ...rect, points: [...rect.points].reverse() };
near("area winding-independent", evaluate(rectCW, ref).value, 800);

// A concave L-shape: 100x100 minus a 50x50 bite = 7500 px² -> 300 mm².
const lshape = {
  id: "4",
  kind: "area",
  label: "",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 50 },
    { x: 50, y: 50 },
    { x: 50, y: 100 },
    { x: 0, y: 100 },
  ],
};
near("concave area", evaluate(lshape, ref).value, 7500 * 0.04);

// Error propagation: 500 px reference -> rel = √2·2/500 = 0.0056568...
near("relative error", referenceRelativeError(ref), (Math.SQRT2 * 2) / 500);
near("length uncertainty", evaluate(line, ref).uncertainty, (100 * Math.SQRT2 * 2) / 500);
// Area uncertainty is double the relative error.
near("area uncertainty", evaluate(rect, ref).uncertainty, (800 * 2 * Math.SQRT2 * 2) / 500);

// A short reference must produce a visibly worse interval.
const coin = { a: { x: 0, y: 0 }, b: { x: 40, y: 0 }, realMm: 23.25, label: "coin" };
near("coin rel error", referenceRelativeError(coin), (Math.SQRT2 * 2) / 40);
console.log(`      coin relative error = ${(referenceRelativeError(coin) * 100).toFixed(1)}%`);

// Extent of a rotated line: bounding box, not the line length.
const diag = {
  id: "5",
  kind: "length",
  points: [
    { x: 0, y: 0 },
    { x: 300, y: 400 },
  ],
  label: "",
};
const e = extent(diag, ref);
near("extent width", e.width.value, 60);
near("extent height", e.height.value, 80);

// Unit thresholds.
eq("mm format", formatLength(9.94), "9.9 mm");
eq("cm format", formatLength(999), "99.9 cm");
eq("m format", formatLength(1000), "1.00 m");
eq("cm2 format", formatArea(1000), "10.0 cm²");
eq("m2 format", formatArea(1_000_000), "1.000 m²");

// Degenerate input must refuse, not return a number.
eq("no reference", evaluate(line, null), null);
eq(
  "zero-length reference",
  mmPerPixel({ a: { x: 5, y: 5 }, b: { x: 5, y: 5 }, realMm: 100 }),
  null,
);
eq("negative real length", mmPerPixel({ a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, realMm: -5 }), null);
eq(
  "area with 2 points",
  evaluate({ id: "6", kind: "area", points: rect.points.slice(0, 2), label: "" }, ref),
  null,
);

console.log(failed === 0 ? "\nAll checks passed." : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
