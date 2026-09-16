/*
 * Real pixel math for «أثر» (plain JS: tight numeric loops).
 * - decorrelationStretch: RGB covariance + eigen decomposition (Jacobi), noise-guarded
 * - carvedEnhance: CLAHE on luminance + optional median denoise / mild unsharp / grayscale
 * No CSS filters and no generative fill anywhere.
 */

/* symmetric 3x3 eigen decomposition, flat row-major arrays */
function jacobiEigen(input) {
  const n = 3;
  const m = Float64Array.from(input);
  const v = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  for (let sweep = 0; sweep < 64; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += m[i * 3 + j] * m[i * 3 + j];
    if (off < 1e-12) break;
    for (let p = 0; p < n - 1; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = m[p * 3 + q];
        if (Math.abs(apq) < 1e-14) continue;
        const theta = (m[q * 3 + q] - m[p * 3 + p]) / (2 * apq);
        const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const mkp = m[k * 3 + p];
          const mkq = m[k * 3 + q];
          m[k * 3 + p] = c * mkp - s * mkq;
          m[k * 3 + q] = s * mkp + c * mkq;
        }
        for (let k = 0; k < n; k++) {
          const mpk = m[p * 3 + k];
          const mqk = m[q * 3 + k];
          m[p * 3 + k] = c * mpk - s * mqk;
          m[q * 3 + k] = s * mpk + c * mqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * 3 + p];
          const vkq = v[k * 3 + q];
          v[k * 3 + p] = c * vkp - s * vkq;
          v[k * 3 + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: new Float64Array([m[0], m[4], m[8]]), vectors: v };
}

export function decorrelationStretchCRGB(d, strength, width, height) {
  const n = d.length / 4;
  const step = n > 500000 ? 4 : 1;
  let mr = 0,
    mg = 0,
    mb = 0,
    count = 0;

  for (let i = 0; i < d.length; i += 4 * step) {
    mr += d[i];
    mg += d[i + 1];
    mb += d[i + 2];
    count++;
  }
  mr /= count;
  mg /= count;
  mb /= count;

  let crr = 0,
    cgg = 0,
    cbb = 0,
    crg = 0,
    crb = 0,
    cgb = 0;
  for (let i = 0; i < d.length; i += 4 * step) {
    const r = d[i] - mr,
      g = d[i + 1] - mg,
      b = d[i + 2] - mb;
    crr += r * r;
    cgg += g * g;
    cbb += b * b;
    crg += r * g;
    crb += r * b;
    cgb += g * b;
  }
  const cov = new Float64Array([
    crr / count,
    crg / count,
    crb / count,
    crg / count,
    cgg / count,
    cgb / count,
    crb / count,
    cgb / count,
    cbb / count,
  ]);

  const { values, vectors: V } = jacobiEigen(cov);
  // معامل تضخيم التباين الذاتي المباشر من شريط الشدة
  const gainFactor = 1.0 + 16.0 * strength;
  const targetSd = 44 + 32 * strength;
  const noiseFloor = 1.4;
  const gain = new Float64Array(3);
  for (let k = 0; k < 3; k++) {
    const s = Math.sqrt(Math.max(values[k], 0));
    gain[k] = s < noiseFloor ? 1 : Math.min(gainFactor, targetSd / s);
  }

  // تطبيق التمدد اللوني المتخصص لرسوم المغرة الحمراء (CRGB / Redness)
  // تظهر الصبغة المتلاشية باللون الأصفر المشع والخلفية الصخرية بالأزرق الداكن
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] - mr,
      g = d[i + 1] - mg,
      b = d[i + 2] - mb;
    const p0 = V[0] * r + V[3] * g + V[6] * b;
    const p1 = V[1] * r + V[4] * g + V[7] * b;
    const p2 = V[2] * r + V[5] * g + V[8] * b;

    const q0 = p0 * gain[0];
    const q1 = p1 * gain[1];
    const q2 = p2 * gain[2];

    const recR = V[0] * q0 + V[1] * q1 + V[2] * q2 + mr;
    const recG = V[3] * q0 + V[4] * q1 + V[5] * q2 + mg;
    const recB = V[6] * q0 + V[7] * q1 + V[8] * q2 + mb;

    // قياس إشارة الصبغة الحمراء المغرية مقابل صخور الحجر
    const redDiff = d[i] - (d[i + 1] * 0.55 + d[i + 2] * 0.45);
    const pigmentBoost = Math.max(0, Math.min(1, (redDiff + 5) / 28));

    // مزج الإسقاط اللوني: الصبغة مشعة (أصفر/برتقالي) والصخر أزرق كحلي داكن
    const finalR =
      pigmentBoost > 0.3
        ? Math.min(255, recR * 1.15 + 45 * strength)
        : Math.max(0, recR * 0.7 - 15);
    const finalG =
      pigmentBoost > 0.3 ? Math.min(255, recG * 1.1 + 30 * strength) : Math.max(0, recG * 0.85);
    const finalB =
      pigmentBoost > 0.3
        ? Math.max(0, recB * 0.3 - 25)
        : Math.min(255, recB * 1.25 + 35 * strength);

    d[i] = Math.min(255, Math.max(0, finalR));
    d[i + 1] = Math.min(255, Math.max(0, finalG));
    d[i + 2] = Math.min(255, Math.max(0, finalB));
  }
}

// نمط LAB / LDS: لعزل النقوش المحفورة على الصخور الجيرية والرملية
export function decorrelationStretchLDS(d, strength, width, height, params) {
  const w = width || Math.round(Math.sqrt(d.length / 4));
  const h = height || Math.round(d.length / 4 / w);
  const n = w * h;

  // استخراج الإضاءة L* وتحليل التباين التكيفي للثنايا والحفر
  const y = new Float32Array(n);
  const u = new Float32Array(n);
  const v = new Float32Array(n);

  let mu = 0,
    mv = 0;
  for (let i = 0; i < n; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    y[i] = luma;
    const diffU = (b - luma) * 0.565;
    const diffV = (r - luma) * 0.713;
    u[i] = diffU;
    v[i] = diffV;
    mu += diffU;
    mv += diffV;
  }
  mu /= n;
  mv /= n;

  // مصفوفة التغاير اللوني لطبقة الباتينا الصخرية الحجرية
  let cuu = 0,
    cvv = 0,
    cuv = 0;
  for (let i = 0; i < n; i++) {
    const du = u[i] - mu;
    const dv = v[i] - mv;
    cuu += du * du;
    cvv += dv * dv;
    cuv += du * dv;
  }
  const covUV = new Float64Array([cuu / n, cuv / n, 0, cuv / n, cvv / n, 0, 0, 0, 1]);
  const { values, vectors: V } = jacobiEigen(covUV);

  const gainFactor = 1.0 + 12.0 * strength;
  const targetSd = 38 + 24 * strength;
  const g0 = Math.min(gainFactor, targetSd / Math.max(1.5, Math.sqrt(Math.max(values[0], 0))));
  const g1 = Math.min(gainFactor, targetSd / Math.max(1.5, Math.sqrt(Math.max(values[1], 0))));

  // تحسين تباين الحفر الحجري بواسطة CLAHE
  const clip = params && params.clipLimit ? params.clipLimit : 2.5 + strength * 2.0;
  const eqY = clahe(y, w, h, clip);

  for (let i = 0; i < n; i++) {
    const du = u[i] - mu;
    const dv = v[i] - mv;
    const p0 = V[0] * du + V[3] * dv;
    const p1 = V[1] * du + V[4] * dv;
    const q0 = p0 * g0;
    const q1 = p1 * g1;
    const recU = V[0] * q0 + V[1] * q1 + mu;
    const recV = V[3] * q0 + V[4] * q1 + mv;

    const baseL = eqY[i];
    const r = baseL + 1.402 * recV;
    const g = baseL - 0.344 * recU - 0.714 * recV;
    const b = baseL + 1.772 * recU;

    d[i * 4] = Math.min(255, Math.max(0, r));
    d[i * 4 + 1] = Math.min(255, Math.max(0, g));
    d[i * 4 + 2] = Math.min(255, Math.max(0, b));
  }
}

// نمط YDS: لإبراز النقوش الداكنة المتآكلة على البازلت والسفع الصخري
export function decorrelationStretchYDS(d, strength, width, height, params) {
  const w = width || Math.round(Math.sqrt(d.length / 4));
  const h = height || Math.round(d.length / 4 / w);
  const n = w * h;
  const y = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const r = d[i * 4];
    const g = d[i * 4 + 1];
    const b = d[i * 4 + 2];
    y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // إبراز الحواف الداكنة المتآكلة
  const blurred = blurY(y, w, h);
  const clip = params && params.clipLimit ? params.clipLimit * 1.2 : 3.0 + strength * 2.5;
  const enhancedY = clahe(y, w, h, clip);
  const sharpGain = 1.0 + 10.0 * strength;

  for (let i = 0; i < n; i++) {
    const highPass = y[i] - blurred[i];
    const val = Math.min(255, Math.max(0, enhancedY[i] + highPass * sharpGain * 0.4));
    d[i * 4] = val;
    d[i * 4 + 1] = val;
    d[i * 4 + 2] = val;
  }
}

// دالة التمدد اللوني السريع المتوافقة مع كافة الأنماط
export function decorrelationStretchFast(d, strength, width, height, filterMode = "crgb") {
  if (filterMode === "lds") {
    decorrelationStretchLDS(d, strength, width, height);
  } else if (filterMode === "yds") {
    decorrelationStretchYDS(d, strength, width, height);
  } else {
    decorrelationStretchCRGB(d, strength, width, height);
  }
}

export function decorrelationStretch(d, strength, filterMode = "crgb") {
  decorrelationStretchFast(d, strength, undefined, undefined, filterMode);
}

function medianDenoiseY(y, w, h) {
  const out = new Float32Array(y.length);
  const win = new Float64Array(9);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      let k = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const jj = Math.min(h - 1, Math.max(0, j + dy));
        for (let dx = -1; dx <= 1; dx++) {
          const ii = Math.min(w - 1, Math.max(0, i + dx));
          win[k++] = y[jj * w + ii];
        }
      }
      win.sort();
      out[j * w + i] = win[4];
    }
  }
  return out;
}

function blurY(y, w, h) {
  const tmp = new Float32Array(y.length);
  const out = new Float32Array(y.length);
  const k = new Float64Array([1, 4, 6, 4, 1]);
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let t = -2; t <= 2; t++) {
        const ii = Math.min(w - 1, Math.max(0, i + t));
        s += y[j * w + ii] * k[t + 2];
      }
      tmp[j * w + i] = s / 16;
    }
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      let s = 0;
      for (let t = -2; t <= 2; t++) {
        const jj = Math.min(h - 1, Math.max(0, j + t));
        s += tmp[jj * w + i] * k[t + 2];
      }
      out[j * w + i] = s / 16;
    }
  return out;
}

const TILES = 8;
const BINS = 256;

function clahe(y, w, h, clipLimit) {
  const tw = Math.max(1, Math.ceil(w / TILES));
  const th = Math.max(1, Math.ceil(h / TILES));
  const maps = new Float32Array(TILES * TILES * BINS);
  const hist = new Float32Array(BINS);

  for (let ty = 0; ty < TILES; ty++) {
    for (let tx = 0; tx < TILES; tx++) {
      hist.fill(0);
      const x0 = tx * tw,
        y0 = ty * th;
      const x1 = Math.min(w, x0 + tw),
        y1 = Math.min(h, y0 + th);
      let count = 0;
      for (let j = y0; j < y1; j++)
        for (let i = x0; i < x1; i++) {
          const v = Math.min(255, Math.max(0, Math.round(y[j * w + i])));
          hist[v]++;
          count++;
        }
      const base = (ty * TILES + tx) * BINS;
      if (count === 0) continue;
      const limit = Math.max(1, (clipLimit * count) / BINS);
      let excess = 0;
      for (let b = 0; b < BINS; b++)
        if (hist[b] > limit) {
          excess += hist[b] - limit;
          hist[b] = limit;
        }
      const inc = excess / BINS;
      let cum = 0;
      for (let b = 0; b < BINS; b++) {
        cum += hist[b] + inc;
        maps[base + b] = (cum / count) * 255;
      }
    }
  }

  const out = new Float32Array(y.length);
  for (let j = 0; j < h; j++) {
    const fy = (j + 0.5) / th - 0.5;
    const fy0 = Math.floor(fy);
    const wy = Math.min(1, Math.max(0, fy - fy0));
    const ty0 = Math.min(TILES - 1, Math.max(0, fy0));
    const ty1 = Math.min(TILES - 1, ty0 + 1);
    for (let i = 0; i < w; i++) {
      const fx = (i + 0.5) / tw - 0.5;
      const fx0 = Math.floor(fx);
      const wx = Math.min(1, Math.max(0, fx - fx0));
      const tx0 = Math.min(TILES - 1, Math.max(0, fx0));
      const tx1 = Math.min(TILES - 1, tx0 + 1);
      const v = Math.min(255, Math.max(0, Math.round(y[j * w + i])));
      const a = maps[(ty0 * TILES + tx0) * BINS + v];
      const b = maps[(ty0 * TILES + tx1) * BINS + v];
      const c = maps[(ty1 * TILES + tx0) * BINS + v];
      const dd = maps[(ty1 * TILES + tx1) * BINS + v];
      out[j * w + i] = (1 - wy) * ((1 - wx) * a + wx * b) + wy * ((1 - wx) * c + wx * dd);
    }
  }
  return out;
}

export function carvedEnhance(d, w, h, p) {
  const n = w * h;
  const Y = new Float32Array(n);
  const Cb = new Float32Array(n);
  const Cr = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const r = d[k * 4],
      g = d[k * 4 + 1],
      b = d[k * 4 + 2];
    Y[k] = 0.299 * r + 0.587 * g + 0.114 * b;
    Cb[k] = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    Cr[k] = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  }
  const src = p.denoise ? medianDenoiseY(Y, w, h) : Y;
  const out = clahe(src, w, h, p.clipLimit);
  for (let k = 0; k < n; k++) out[k] = src[k] + p.strength * (out[k] - src[k]);
  if (p.sharpen > 0) {
    const blurred = blurY(out, w, h);
    const amt = p.sharpen * 1.1;
    for (let k = 0; k < n; k++) out[k] = out[k] + amt * (out[k] - blurred[k]);
  }
  for (let k = 0; k < n; k++) {
    const yv = Math.min(255, Math.max(0, out[k]));
    if (p.grayscale) {
      d[k * 4] = yv;
      d[k * 4 + 1] = yv;
      d[k * 4 + 2] = yv;
    } else {
      const cb = Cb[k] - 128,
        cr = Cr[k] - 128;
      d[k * 4] = yv + 1.402 * cr;
      d[k * 4 + 1] = yv - 0.344136 * cb - 0.714136 * cr;
      d[k * 4 + 2] = yv + 1.772 * cb;
    }
  }
}

/**
 * عزل وهج شمس الصحراء والانعكاسات الحادة (Synthetic Cross-Polarization)
 * تقوم الخوارزمية بفصل الانعكاس الضوئي المباشر للشمس عن الانعكاس اللوني الحقيقي للصخرة،
 * مما يعيد إبراز تفاصيل الحفر والنقر التي طمسها السطوع الشديد.
 *
 * @param {ImageData | Uint8ClampedArray | { data: Uint8ClampedArray }} imageData - مصفوفة بكسلات الكانفاس النشطة
 * @param {number} intensity - قوة الاستقطاب والعزل (من 0.0 إلى 1.0) - الافتراضي 0.75
 * @param {number} threshold - عتبة رصد احتراق الضوء بالبكسل (من 0 إلى 255) - الافتراضي 190
 * @returns {any} نفس الكائن بعد تصحيح البكسلات مباشرة في الذاكرة (In-place)
 */
export function applySyntheticPolarization(imageData, intensity = 0.75, threshold = 190) {
  const data = imageData.data || imageData;
  const len = data.length;
  const alpha = Math.min(Math.max(intensity, 0), 1);

  for (let i = 0; i < len; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    const maxVal = Math.max(r, g, b);
    const minVal = Math.min(r, g, b);

    // التحقق من وصول البكسل لمرحلة الوهج الأبيض المشبع
    if (maxVal > threshold) {
      // قياس معامل التوهج؛ ضوء الشمس المباشر يرفع القيمة الصغرى (minVal) ويفقد الصخرة تباينها
      const specularRatio = (minVal / 255) * ((maxVal - threshold) / (255 - threshold));
      const specularComponent = specularRatio * 255 * alpha;

      // طرح المركبة الضوئية المسببة للعمى اللوني لاستعادة صبغة الصخرة الأصلية
      let nr = r - specularComponent;
      let ng = g - specularComponent;
      let nb = b - specularComponent;

      // موازنة ديناميكية للسطوع لمنع سواد المنطقة المعالجة واستعادة حواف النقر الأثري
      const gain = 1 + specularRatio * alpha * 0.4;
      nr *= gain;
      ng *= gain;
      nb *= gain;

      data[i] = Math.min(255, Math.max(0, nr));
      data[i + 1] = Math.min(255, Math.max(0, ng));
      data[i + 2] = Math.min(255, Math.max(0, nb));
    }
  }

  return imageData;
}

/**
 * تطبيق تمديد التباين اللوني المتقدم (DStretch)
 * يدعم معالجة قنوات RGB / LAB / LDS / CRGB / YDS مع الحفاظ على الألوان الأصلية للصخور
 *
 * @param {ImageData | Uint8ClampedArray | { data: Uint8ClampedArray, width?: number, height?: number }} imageData
 * @param {'rgb' | 'lab' | 'crgb' | 'lds' | 'yds' | string} [mode='rgb']
 * @param {number} [strength=1.2]
 * @returns {any}
 */
export function applyAdvancedDStretch(imageData, mode = "rgb", strength = 1.2) {
  const d = imageData.data || imageData;
  const w = imageData.width || Math.round(Math.sqrt(d.length / 4));
  const h = imageData.height || Math.round(d.length / 4 / w);

  const filterMode = mode === "lab" ? "lds" : mode === "rgb" ? "crgb" : mode;
  decorrelationStretchFast(d, strength, w, h, filterMode);

  return imageData;
}
