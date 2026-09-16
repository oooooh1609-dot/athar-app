/**
 * On-device letter detection kernels for Athar.
 *
 * Real pixel work only: Sauvola adaptive binarisation, morphological cleanup,
 * connected-component labelling, line grouping and a fixed-length shape
 * descriptor per candidate sign (zoning densities, fill, aspect, hole count,
 * Zhang-Suen skeleton statistics and Hu moments).
 *
 * This file finds and measures marks. It does NOT know what any letter is:
 * naming a sign is done by nearest-neighbour matching against reviewed,
 * human-labelled examples (see glyph-model.ts). Written in plain JS because the
 * inner loops index raw pixel buffers.
 */

export const FEATURE_VERSION = 1;
/** 64 zoning + fill + logAspect + holes + endpoints + junctions + strokeRatio + 7 Hu */
export const FEATURE_DIM = 76;

const ZONES = 8;
const NORM = 32;

function grayscale(rgba, width, height) {
  const g = new Float32Array(width * height);
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = 0.2126 * rgba[p] + 0.7152 * rgba[p + 1] + 0.0722 * rgba[p + 2];
  }
  return g;
}

/** Sauvola local threshold via integral images. Returns 1 where the pixel is darker than its neighbourhood. */
function sauvola(gray, width, height, window, k) {
  const W = width + 1;
  const sum = new Float64Array(W * (height + 1));
  const sq = new Float64Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let rs = 0;
    let rq = 0;
    for (let x = 0; x < width; x++) {
      const v = gray[y * width + x];
      rs += v;
      rq += v * v;
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rs;
      sq[(y + 1) * W + x + 1] = sq[y * W + x + 1] + rq;
    }
  }
  const r = Math.max(1, (window - 1) >> 1);
  const mask = new Uint8Array(width * height);
  const R = 128;
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height - 1, y + r);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);
      const a = y0 * W + x0;
      const b = y0 * W + x1 + 1;
      const c = (y1 + 1) * W + x0;
      const d = (y1 + 1) * W + x1 + 1;
      const n = (y1 - y0 + 1) * (x1 - x0 + 1);
      const m = (sum[d] - sum[b] - sum[c] + sum[a]) / n;
      const varr = Math.max(0, (sq[d] - sq[b] - sq[c] + sq[a]) / n - m * m);
      const s = Math.sqrt(varr);
      const t = m * (1 + k * (s / R - 1));
      mask[y * width + x] = gray[y * width + x] < t ? 1 : 0;
    }
  }
  return mask;
}

function morph(mask, width, height, dilate) {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let hit = dilate ? 0 : 1;
      for (let dy = -1; dy <= 1 && (dilate ? !hit : hit); dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) {
          if (!dilate) hit = 0;
          continue;
        }
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) {
            if (!dilate) hit = 0;
            continue;
          }
          const v = mask[yy * width + xx];
          if (dilate && v) {
            hit = 1;
            break;
          }
          if (!dilate && !v) {
            hit = 0;
            break;
          }
        }
      }
      out[y * width + x] = hit;
    }
  }
  return out;
}

/** 8-connected labelling. Returns { labels: Int32Array, comps: [{minx,...,area}] } */
function components(mask, width, height) {
  const labels = new Int32Array(mask.length).fill(-1);
  const comps = [];
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start] !== -1) continue;
    const id = comps.length;
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    let minx = width;
    let maxx = 0;
    let miny = height;
    let maxy = 0;
    let area = 0;
    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      area++;
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          const q = yy * width + xx;
          if (mask[q] && labels[q] === -1) {
            labels[q] = id;
            stack[top++] = q;
          }
        }
      }
    }
    comps.push({ id, minx, maxx, miny, maxy, area });
  }
  return { labels, comps };
}

/** Box-mean of `src` over a (2r+1) window, via an integral image. */
function boxMean(src, width, height, r) {
  const W = width + 1;
  const sum = new Float64Array(W * (height + 1));
  for (let y = 0; y < height; y++) {
    let rs = 0;
    for (let x = 0; x < width; x++) {
      rs += src[y * width + x];
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rs;
    }
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - r);
    const y1 = Math.min(height - 1, y + r);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - r);
      const x1 = Math.min(width - 1, x + r);
      const n = (y1 - y0 + 1) * (x1 - x0 + 1);
      out[y * width + x] =
        (sum[(y1 + 1) * W + x1 + 1] -
          sum[y0 * W + x1 + 1] -
          sum[(y1 + 1) * W + x0] +
          sum[y0 * W + x0]) /
        n;
    }
  }
  return out;
}

/**
 * Removes slow illumination changes: raking light, cast shadows and vignetting.
 *  1. the background is estimated with a large box mean (much wider than a sign)
 *     and subtracted, levelling the lighting gradient;
 *  2. only when the picture actually carries a strong shadow gradient, the
 *     remaining contrast is equalised against the local spread, so a mark inside
 *     a deep shadow reads as strongly as one in bright light. Evenly lit
 *     pictures skip this stage, so faint noise is never amplified into marks.
 * Sign shapes are untouched; only the lighting they sit on is equalised.
 */
function flattenIllumination(gray, width, height) {
  const r = Math.max(8, Math.round(Math.min(width, height) / 8));
  const bg = boxMean(gray, width, height, r);
  const flat = new Float32Array(gray.length);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i] - bg[i] + 128;
    flat[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  // A gentle gradient needs no equalisation; a shadow across the rock does.
  // Judged on robust percentiles of the coarse background, so a few dark
  // strokes cannot pass for a shadow.
  const sample = [];
  for (let i = 0; i < bg.length; i += 97) sample.push(bg[i]);
  sample.sort((a, b) => a - b);
  const lo = sample[Math.floor(sample.length * 0.1)] ?? 0;
  const hi = sample[Math.floor(sample.length * 0.9)] ?? 255;
  if (hi - lo < 45) return flat;

  const cr = Math.max(10, Math.round(Math.min(width, height) / 16));
  const sq = new Float32Array(gray.length);
  for (let i = 0; i < flat.length; i++) sq[i] = flat[i] * flat[i];
  const mean = boxMean(flat, width, height, cr);
  const meanSq = boxMean(sq, width, height, cr);
  let gsum = 0;
  for (let i = 0; i < flat.length; i++) gsum += (flat[i] - 128) * (flat[i] - 128);
  const gsd = Math.max(4, Math.sqrt(gsum / flat.length));
  const out = new Float32Array(gray.length);
  for (let i = 0; i < flat.length; i++) {
    // Floor at most of the global spread: flat, noise-only areas keep their
    // contrast instead of being stretched.
    const sd = Math.max(gsd * 0.9, Math.sqrt(Math.max(0, meanSq[i] - mean[i] * mean[i])));
    const v = 128 + ((flat[i] - mean[i]) * gsd) / sd;
    out[i] = v < 0 ? 0 : v > 255 ? 255 : v;
  }
  return out;
}

/**
 * Straightness and elongation of one component, from its pixel second moments.
 * Cracks and joints in rock are long, thin and near-perfectly straight, while
 * carved signs bend. Returns { elongation, straightness, length }.
 */
function axisShape(labels, width, comp) {
  let n = 0;
  let sx = 0;
  let sy = 0;
  for (let y = comp.miny; y <= comp.maxy; y++)
    for (let x = comp.minx; x <= comp.maxx; x++)
      if (labels[y * width + x] === comp.id) {
        n++;
        sx += x;
        sy += y;
      }
  if (n < 4) return { elongation: 1, straightness: 0, length: 0 };
  const cx = sx / n;
  const cy = sy / n;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let y = comp.miny; y <= comp.maxy; y++)
    for (let x = comp.minx; x <= comp.maxx; x++)
      if (labels[y * width + x] === comp.id) {
        const dx = x - cx;
        const dy = y - cy;
        xx += dx * dx;
        yy += dy * dy;
        xy += dx * dy;
      }
  xx /= n;
  yy /= n;
  xy /= n;
  const tr = xx + yy;
  const det = xx * yy - xy * xy;
  const disc = Math.max(0, (tr / 2) ** 2 - det);
  const l1 = tr / 2 + Math.sqrt(disc);
  const l2 = Math.max(1e-6, tr / 2 - Math.sqrt(disc));
  return {
    elongation: Math.sqrt(l1 / l2),
    straightness: l1 / (l1 + l2),
    length: 4 * Math.sqrt(l1),
  };
}

function median(values) {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Rasterises one component's pixels into a NORM x NORM aspect-preserving mask. */
function normalizedMask(labels, width, comp) {
  const bw = comp.maxx - comp.minx + 1;
  const bh = comp.maxy - comp.miny + 1;
  const scale = (NORM - 2) / Math.max(bw, bh);
  const out = new Uint8Array(NORM * NORM);
  const offx = Math.floor((NORM - bw * scale) / 2);
  const offy = Math.floor((NORM - bh * scale) / 2);
  for (let y = comp.miny; y <= comp.maxy; y++) {
    for (let x = comp.minx; x <= comp.maxx; x++) {
      if (labels[y * width + x] !== comp.id) continue;
      const nx = Math.min(NORM - 1, offx + Math.floor((x - comp.minx) * scale));
      const ny = Math.min(NORM - 1, offy + Math.floor((y - comp.miny) * scale));
      out[ny * NORM + nx] = 1;
    }
  }
  return out;
}

function neighbours(m, x, y) {
  const at = (xx, yy) => (xx < 0 || yy < 0 || xx >= NORM || yy >= NORM ? 0 : m[yy * NORM + xx]);
  return [
    at(x, y - 1),
    at(x + 1, y - 1),
    at(x + 1, y),
    at(x + 1, y + 1),
    at(x, y + 1),
    at(x - 1, y + 1),
    at(x - 1, y),
    at(x - 1, y - 1),
  ];
}

/** Zhang-Suen thinning on the normalised mask. */
function thin(mask) {
  const m = Uint8Array.from(mask);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 40) {
    changed = false;
    for (let pass = 0; pass < 2; pass++) {
      const remove = [];
      for (let y = 0; y < NORM; y++) {
        for (let x = 0; x < NORM; x++) {
          if (!m[y * NORM + x]) continue;
          const n = neighbours(m, x, y);
          let count = 0;
          let trans = 0;
          for (let i = 0; i < 8; i++) {
            count += n[i];
            if (!n[i] && n[(i + 1) % 8]) trans++;
          }
          if (count < 2 || count > 6 || trans !== 1) continue;
          const [p2, , p4, , p6, , p8] = n;
          const a = pass === 0 ? p2 && p4 && p6 : p2 && p4 && p8;
          const b = pass === 0 ? p4 && p6 && p8 : p2 && p6 && p8;
          if (a || b) continue;
          remove.push(y * NORM + x);
        }
      }
      if (remove.length) {
        changed = true;
        for (const p of remove) m[p] = 0;
      }
    }
  }
  let strokeLen = 0;
  let endpoints = 0;
  let junctions = 0;
  for (let y = 0; y < NORM; y++) {
    for (let x = 0; x < NORM; x++) {
      if (!m[y * NORM + x]) continue;
      strokeLen++;
      const deg = neighbours(m, x, y).reduce((s, v) => s + v, 0);
      if (deg === 1) endpoints++;
      else if (deg >= 3) junctions++;
    }
  }
  return { strokeLen, endpoints, junctions };
}

/** Background regions fully enclosed by the sign. */
function holeCount(mask) {
  const seen = new Uint8Array(NORM * NORM);
  let holes = 0;
  const stack = new Int32Array(NORM * NORM);
  for (let start = 0; start < mask.length; start++) {
    if (mask[start] || seen[start]) continue;
    let top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let touchesBorder = false;
    while (top > 0) {
      const p = stack[--top];
      const x = p % NORM;
      const y = (p - x) / NORM;
      if (x === 0 || y === 0 || x === NORM - 1 || y === NORM - 1) touchesBorder = true;
      const push = (xx, yy) => {
        if (xx < 0 || yy < 0 || xx >= NORM || yy >= NORM) return;
        const q = yy * NORM + xx;
        if (!mask[q] && !seen[q]) {
          seen[q] = 1;
          stack[top++] = q;
        }
      };
      push(x + 1, y);
      push(x - 1, y);
      push(x, y + 1);
      push(x, y - 1);
    }
    if (!touchesBorder) holes++;
  }
  return holes;
}

function huMoments(mask) {
  let m00 = 0;
  let m10 = 0;
  let m01 = 0;
  for (let y = 0; y < NORM; y++)
    for (let x = 0; x < NORM; x++)
      if (mask[y * NORM + x]) {
        m00++;
        m10 += x;
        m01 += y;
      }
  if (!m00) return new Array(7).fill(0);
  const cx = m10 / m00;
  const cy = m01 / m00;
  let u20 = 0,
    u02 = 0,
    u11 = 0,
    u30 = 0,
    u03 = 0,
    u21 = 0,
    u12 = 0;
  for (let y = 0; y < NORM; y++)
    for (let x = 0; x < NORM; x++) {
      if (!mask[y * NORM + x]) continue;
      const dx = x - cx;
      const dy = y - cy;
      u20 += dx * dx;
      u02 += dy * dy;
      u11 += dx * dy;
      u30 += dx * dx * dx;
      u03 += dy * dy * dy;
      u21 += dx * dx * dy;
      u12 += dx * dy * dy;
    }
  const n = (u, p, q) => u / Math.pow(m00, 1 + (p + q) / 2);
  const n20 = n(u20, 2, 0);
  const n02 = n(u02, 0, 2);
  const n11 = n(u11, 1, 1);
  const n30 = n(u30, 3, 0);
  const n03 = n(u03, 0, 3);
  const n21 = n(u21, 2, 1);
  const n12 = n(u12, 1, 2);
  const h1 = n20 + n02;
  const h2 = (n20 - n02) ** 2 + 4 * n11 ** 2;
  const h3 = (n30 - 3 * n12) ** 2 + (3 * n21 - n03) ** 2;
  const h4 = (n30 + n12) ** 2 + (n21 + n03) ** 2;
  const h5 =
    (n30 - 3 * n12) * (n30 + n12) * ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) +
    (3 * n21 - n03) * (n21 + n03) * (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);
  const h6 =
    (n20 - n02) * ((n30 + n12) ** 2 - (n21 + n03) ** 2) + 4 * n11 * (n30 + n12) * (n21 + n03);
  const h7 =
    (3 * n21 - n03) * (n30 + n12) * ((n30 + n12) ** 2 - 3 * (n21 + n03) ** 2) -
    (n30 - 3 * n12) * (n21 + n03) * (3 * (n30 + n12) ** 2 - (n21 + n03) ** 2);
  return [h1, h2, h3, h4, h5, h6, h7].map(
    (v) => (Math.sign(v) * Math.log10(1 + Math.abs(v) * 1000)) / 6,
  );
}

function describe(labels, width, comp) {
  const bw = comp.maxx - comp.minx + 1;
  const bh = comp.maxy - comp.miny + 1;
  const norm = normalizedMask(labels, width, comp);

  const zones = new Float64Array(ZONES * ZONES);
  const step = NORM / ZONES;
  for (let y = 0; y < NORM; y++)
    for (let x = 0; x < NORM; x++)
      if (norm[y * NORM + x]) {
        const zy = Math.min(ZONES - 1, Math.floor(y / step));
        const zx = Math.min(ZONES - 1, Math.floor(x / step));
        zones[zy * ZONES + zx] += 1;
      }
  let zn = 0;
  for (let i = 0; i < zones.length; i++) zn += zones[i] * zones[i];
  zn = Math.sqrt(zn) || 1;

  const { strokeLen, endpoints, junctions } = thin(norm);
  const holes = holeCount(norm);
  const hu = huMoments(norm);

  const f = new Float32Array(FEATURE_DIM);
  for (let i = 0; i < zones.length; i++) f[i] = zones[i] / zn;
  let k = zones.length;
  f[k++] = comp.area / (bw * bh);
  f[k++] = Math.max(-1, Math.min(1, Math.log(bw / bh) / 2));
  f[k++] = Math.min(1, holes / 3);
  f[k++] = Math.min(1, endpoints / 6);
  f[k++] = Math.min(1, junctions / 4);
  f[k++] = Math.min(1, strokeLen / (NORM * 2));
  for (let i = 0; i < 7; i++) f[k++] = hu[i];

  let mag = 0;
  for (let i = 0; i < f.length; i++) mag += f[i] * f[i];
  mag = Math.sqrt(mag) || 1;
  for (let i = 0; i < f.length; i++) f[i] /= mag;

  return { features: f, strokeLen, endpoints, junctions, holes };
}

/**
 * Detects candidate sign shapes in an RGBA buffer.
 * opts: { invert, k, minHeightFrac, direction: "rtl" | "ltr",
 *         flattenShadows (default true), suppressCracks (default true) }
 */
export function segmentGlyphs(rgba, width, height, opts = {}) {
  const k = typeof opts.k === "number" ? opts.k : 0.25;
  const direction = opts.direction === "ltr" ? "ltr" : "rtl";
  const flatten = opts.flattenShadows !== false;
  const suppressCracks = opts.suppressCracks !== false;
  let gray = grayscale(rgba, width, height);
  if (opts.invert) {
    for (let i = 0; i < gray.length; i++) gray[i] = 255 - gray[i];
  }
  if (flatten) gray = flattenIllumination(gray, width, height);

  const win = Math.max(15, Math.round(Math.min(width, height) / 18) | 1);
  let mask = sauvola(gray, width, height, win, k);

  let ink = 0;
  for (let i = 0; i < mask.length; i++) ink += mask[i];
  let inkRatio = ink / mask.length;
  if (inkRatio > 0.5) {
    for (let i = 0; i < mask.length; i++) mask[i] = mask[i] ? 0 : 1;
    inkRatio = 1 - inkRatio;
  }

  // opening removes speckle, closing re-joins broken strokes
  mask = morph(morph(mask, width, height, false), width, height, true);
  mask = morph(morph(mask, width, height, true), width, height, false);

  const { labels, comps } = components(mask, width, height);

  const px = width * height;
  const kept = comps.filter((c) => {
    const bw = c.maxx - c.minx + 1;
    const bh = c.maxy - c.miny + 1;
    const fill = c.area / (bw * bh);
    return (
      c.area >= Math.max(14, px * 2e-5) &&
      c.area <= px * 0.2 &&
      bh >= height * 0.015 &&
      bh <= height * 0.85 &&
      bw / bh >= 0.06 &&
      bw / bh <= 12 &&
      fill >= 0.06
    );
  });

  const medH = median(kept.map((c) => c.maxy - c.miny + 1));
  let sized = kept.filter((c) => {
    const bh = c.maxy - c.miny + 1;
    return medH === 0 || (bh >= medH * 0.35 && bh <= medH * 2.8);
  });

  // Drop rock cracks, joints and shadow edges: long, thin, near-perfectly
  // straight runs much longer than the sign height, and hairlines that cross
  // most of the frame. Carved signs bend, branch or stay within a sign height,
  // so they survive. Nothing is deleted from the image — these components are
  // just not offered as candidate signs, and the count is reported.
  let suppressedCracks = 0;
  if (suppressCracks && medH > 0) {
    sized = sized.filter((c) => {
      const bw = c.maxx - c.minx + 1;
      const bh = c.maxy - c.miny + 1;
      const fill = c.area / (bw * bh);
      const { elongation, straightness, length } = axisShape(labels, width, c);
      const straightRun =
        length > medH * 2.2 && elongation > 6 && straightness > 0.93 && fill < 0.35;
      // Frame-spanning hairline: a crack or shadow boundary, never one sign.
      const spanning =
        (bw > width * 0.6 || bh > height * 0.6) &&
        length > medH * 3 &&
        elongation > 8 &&
        fill < 0.14;
      const crack = straightRun || spanning;
      if (crack) suppressedCracks++;
      return !crack;
    });
  }

  // group into reading lines by vertical centre
  const byY = [...sized].sort((a, b) => (a.miny + a.maxy) / 2 - (b.miny + b.maxy) / 2);
  const lines = [];
  for (const c of byY) {
    const cy = (c.miny + c.maxy) / 2;
    const last = lines[lines.length - 1];
    if (last && Math.abs(cy - last.cy) <= Math.max(6, medH * 0.65)) {
      last.items.push(c);
      last.cy = (last.cy * (last.items.length - 1) + cy) / last.items.length;
    } else {
      lines.push({ cy, items: [c] });
    }
  }

  const glyphs = [];
  lines.forEach((line, li) => {
    const ordered = [...line.items].sort((a, b) =>
      direction === "rtl" ? b.minx - a.minx : a.minx - b.minx,
    );
    ordered.forEach((c, oi) => {
      const d = describe(labels, width, c);
      glyphs.push({
        x: c.minx,
        y: c.miny,
        w: c.maxx - c.minx + 1,
        h: c.maxy - c.miny + 1,
        area: c.area,
        line: li,
        order: oi,
        strokeLen: d.strokeLen,
        endpoints: d.endpoints,
        junctions: d.junctions,
        holes: d.holes,
        features: Array.from(d.features),
      });
    });
  });

  return {
    width,
    height,
    direction,
    inkRatio,
    lines: lines.length,
    candidates: comps.length,
    shadowsFlattened: flatten,
    suppressedCracks,
    glyphs,
    featureVersion: FEATURE_VERSION,
  };
}
