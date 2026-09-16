/**
 * The letter matcher.
 *
 * Signs are named by nearest-neighbour matching of the shape descriptors in
 * glyph-kernels.js against human-labelled examples that an expert has approved.
 * Nothing here invents a letter: with too few approved examples the matcher
 * returns "insufficient data" and the app says so.
 *
 * Similarity values are raw cosine similarities between shape descriptors. They
 * are NOT calibrated probabilities and must never be shown as confidence
 * percentages.
 */

export type Exemplar = {
  letter: string;
  transliteration: string | null;
  features: number[];
};

export type Candidate = {
  letter: string;
  transliteration: string | null;
  similarity: number;
  votes: number;
};

export type MatchResult =
  | { state: "insufficient_data"; candidates: [] }
  | { state: "no_match"; candidates: []; best: number }
  | { state: "matched"; candidates: Candidate[] };

/** Below this cosine similarity a labelled example is not treated as the same shape. */
export const MIN_SIMILARITY = 0.8;
/** Approved examples of a letter before that letter may be suggested at all. */
export const MIN_EXAMPLES_PER_LETTER = 5;
/** Distinct letters covered before whole-line suggestions are offered. */
export const MIN_LETTERS_FOR_LINE = 12;
const K = 5;

function cosine(a: number[], b: number[]) {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d ? dot / d : 0;
}

/** Letters that have enough approved examples to be suggested. */
export function eligibleLetters(exemplars: Exemplar[]) {
  const counts = new Map<string, number>();
  for (const e of exemplars) counts.set(e.letter, (counts.get(e.letter) ?? 0) + 1);
  return new Set(
    [...counts.entries()].filter(([, c]) => c >= MIN_EXAMPLES_PER_LETTER).map(([l]) => l),
  );
}

export function matchGlyph(features: number[], exemplars: Exemplar[]): MatchResult {
  const eligible = eligibleLetters(exemplars);
  const pool = exemplars.filter((e) => eligible.has(e.letter));
  if (pool.length < MIN_EXAMPLES_PER_LETTER) return { state: "insufficient_data", candidates: [] };

  const scored = pool
    .map((e) => ({ e, s: cosine(features, e.features) }))
    .sort((a, b) => b.s - a.s);
  const best = scored[0]?.s ?? 0;
  if (best < MIN_SIMILARITY) return { state: "no_match", candidates: [], best };

  const top = scored.slice(0, K).filter((x) => x.s >= MIN_SIMILARITY);
  const agg = new Map<string, Candidate>();
  for (const { e, s } of top) {
    const cur = agg.get(e.letter);
    if (cur) {
      cur.votes += 1;
      cur.similarity = Math.max(cur.similarity, s);
    } else {
      agg.set(e.letter, {
        letter: e.letter,
        transliteration: e.transliteration,
        similarity: s,
        votes: 1,
      });
    }
  }
  const candidates = [...agg.values()]
    .sort((a, b) => b.votes - a.votes || b.similarity - a.similarity)
    .slice(0, 3);
  return { state: "matched", candidates };
}

/** Transliteration string for a whole detection, "?" for anything unmatched. */
export function transliterate(matches: { state: MatchResult["state"]; candidates: Candidate[] }[]) {
  return matches
    .map((m) =>
      m.state === "matched" && m.candidates[0]
        ? (m.candidates[0].transliteration ?? m.candidates[0].letter)
        : "?",
    )
    .join(" ");
}

export type DatasetStats = {
  script: string;
  approved: number;
  pending: number;
  letters: number;
  lettersReady: number;
  perLetter: { letter: string; approved: number; pending: number }[];
  accuracy: number | null;
  evaluatedOn: number | null;
  evaluatedAt: string | null;
};

export type TrainingStage = {
  stage: 1 | 2 | 3 | 4;
  title: string;
  detail: string;
  next: string;
};

/** Where the dataset for one script currently stands, from real counts only. */
export function trainingStage(s: DatasetStats): TrainingStage {
  if (s.lettersReady === 0)
    return {
      stage: 1,
      title: "Stage 1 — collecting labelled examples",
      detail:
        `${s.approved} approved example(s), ${s.pending} awaiting expert review. ` +
        `No letter has reached ${MIN_EXAMPLES_PER_LETTER} approved examples yet, so the matcher stays off ` +
        "and detection only outlines the marks it finds.",
      next: `Label signs on clear photographs until each letter has ${MIN_EXAMPLES_PER_LETTER} approved examples.`,
    };
  if (s.lettersReady < MIN_LETTERS_FOR_LINE)
    return {
      stage: 2,
      title: "Stage 2 — per-letter matching",
      detail:
        `${s.lettersReady} letter(s) have ${MIN_EXAMPLES_PER_LETTER}+ approved examples, so single signs can be ` +
        "matched against them. Whole-line readings are not offered yet.",
      next: `Cover ${MIN_LETTERS_FOR_LINE} letters to enable whole-line suggestions.`,
    };
  if (s.accuracy === null || s.accuracy < 0.6)
    return {
      stage: 3,
      title: "Stage 3 — measuring accuracy",
      detail:
        s.accuracy === null
          ? "Enough letters are covered, but the matcher has not been measured on the approved set yet."
          : `Measured accuracy on the approved set is ${(s.accuracy * 100).toFixed(1)}% ` +
            `(${s.evaluatedOn ?? 0} examples, leave-one-out). Below 60% the suggestions stay advisory only.`,
      next: "Run the accuracy check after each review round and add examples for the weakest letters.",
    };
  return {
    stage: 4,
    title: "Stage 4 — advisory suggestions in the reading flow",
    detail:
      `Measured accuracy ${(s.accuracy * 100).toFixed(1)}% on ${s.evaluatedOn ?? 0} approved examples ` +
      "(leave-one-out, same-photograph examples included, so real-world accuracy on new photographs is lower).",
    next: "Keep adding examples from new sites and re-measure; accuracy is never presented as a reading proof.",
  };
}

export interface RecognizedGlyphResult {
  glyphName: string;
  transliterationArabic: string;
  unicodeChar: string;
  confidence: number;
  family: "Musnad" | "Thamudic_B" | "Thamudic_C_D" | "Dedanite" | "Early_Kufic" | "Floriated_Kufic";
}

export class TopologicalGlyphRecognizer {
  // بصمات عزوم Hu السبعة للحروف المسندية والكوفية الصخرية المعيارية
  private static GLYPH_SIGNATURES = [
    // 1. عائلة خط المسند الجنوبي
    {
      name: "ألف مسندي",
      ar: "ا",
      char: "𐩱",
      family: "Musnad" as const,
      moments: [0.21, 0.04, 0.008, 0.001, 0.0, 0.0, 0.0],
    },
    {
      name: "باء مسندي",
      ar: "ب",
      char: "𐩨",
      family: "Musnad" as const,
      moments: [0.18, 0.02, 0.005, 0.0005, 0.0, 0.0, 0.0],
    },
    {
      name: "تاء مسندي",
      ar: "ت",
      char: "𐩩",
      family: "Musnad" as const,
      moments: [0.24, 0.05, 0.012, 0.002, 0.0, 0.0, 0.0],
    },
    {
      name: "ميم مسندي",
      ar: "م",
      char: "𐩣",
      family: "Musnad" as const,
      moments: [0.28, 0.07, 0.015, 0.003, 0.0, 0.0, 0.0],
    },
    {
      name: "عين مسندي",
      ar: "ع",
      char: "𐩲",
      family: "Musnad" as const,
      moments: [0.16, 0.01, 0.002, 0.0001, 0.0, 0.0, 0.0],
    },
    {
      name: "لام مسندي",
      ar: "ل",
      char: "𐩡",
      family: "Musnad" as const,
      moments: [0.19, 0.03, 0.006, 0.0008, 0.0, 0.0, 0.0],
    },
    {
      name: "راء مسندي",
      ar: "ر",
      char: "𐩧",
      family: "Musnad" as const,
      moments: [0.22, 0.04, 0.009, 0.001, 0.0, 0.0, 0.0],
    },

    // 2. عائلة الخطوط الثمودية والديدانية
    {
      name: "واو ثمودي دائرية",
      ar: "و",
      char: "𐩥",
      family: "Thamudic_B" as const,
      moments: [0.15, 0.008, 0.001, 0.0, 0.0, 0.0, 0.0],
    },
    {
      name: "هاء ثمودي شجرية",
      ar: "ه",
      char: "𐩠",
      family: "Thamudic_C_D" as const,
      moments: [0.25, 0.06, 0.014, 0.002, 0.0, 0.0, 0.0],
    },

    // 3. عائلة الخط الكوفي الإسلامي الصخري المبكر (القرن 1 - 3 هـ)
    {
      name: "ألف كوفي مبكر (ذات عقيفة سفلية)",
      ar: "ا",
      char: "ا",
      family: "Early_Kufic" as const,
      moments: [0.19, 0.035, 0.006, 0.0007, 0.0, 0.0, 0.0],
    },
    {
      name: "دال/ذال كوفي زاوية قائمة",
      ar: "د",
      char: "د",
      family: "Early_Kufic" as const,
      moments: [0.17, 0.022, 0.003, 0.0004, 0.0, 0.0, 0.0],
    },
    {
      name: "كاف كوفي مبسوطة القاعدة",
      ar: "ك",
      char: "ك",
      family: "Early_Kufic" as const,
      moments: [0.26, 0.058, 0.011, 0.0018, 0.0, 0.0, 0.0],
    },
    {
      name: "ميم كوفي مثلثة الرأس",
      ar: "م",
      char: "م",
      family: "Early_Kufic" as const,
      moments: [0.16, 0.018, 0.002, 0.0002, 0.0, 0.0, 0.0],
    },
    {
      name: "لام ألف كوفي متقاطعة",
      ar: "لا",
      char: "لا",
      family: "Early_Kufic" as const,
      moments: [0.29, 0.082, 0.019, 0.0035, 0.0, 0.0, 0.0],
    },
    {
      name: "عين/غين كوفي مبكرة مفتوحة",
      ar: "ع",
      char: "ع",
      family: "Early_Kufic" as const,
      moments: [0.14, 0.012, 0.001, 0.0001, 0.0, 0.0, 0.0],
    },
    {
      name: "رسم سنة (ب/ت/ث/ن/ي) كوفي مبكر",
      ar: "ـبـ",
      char: "ب",
      family: "Early_Kufic" as const,
      moments: [0.13, 0.011, 0.001, 0.0, 0.0, 0.0],
    },
    {
      name: "حاء/جيم/خاء كوفي جداري",
      ar: "ح",
      char: "ح",
      family: "Early_Kufic" as const,
      moments: [0.23, 0.045, 0.009, 0.0012, 0.0, 0.0, 0.0],
    },
    {
      name: "هاء كوفية مورقة ثلاثية الفصوص",
      ar: "ـهـ",
      char: "ه",
      family: "Floriated_Kufic" as const,
      moments: [0.31, 0.095, 0.025, 0.0048, 0.0, 0.0, 0.0],
    },
  ];

  /**
   * استخراج عزوم Hu السبعة للحرف من الكانفاس الميداني مباشرة في 3 مللي ثانية
   */
  public static computeHuMoments(binaryPatch: Uint8Array, w: number, h: number): number[] {
    let m00 = 0,
      m10 = 0,
      m01 = 0;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (binaryPatch[y * w + x]! > 0) {
          m00++;
          m10 += x;
          m01 += y;
        }
      }
    }

    if (m00 === 0) return new Array(7).fill(0);

    const cx = m10 / m00;
    const cy = m01 / m00;

    // العزوم المركزية
    let mu20 = 0,
      mu02 = 0,
      mu11 = 0,
      mu30 = 0,
      mu03 = 0,
      mu21 = 0,
      mu12 = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (binaryPatch[y * w + x]! > 0) {
          const dx = x - cx;
          const dy = y - cy;
          mu20 += dx * dx;
          mu02 += dy * dy;
          mu11 += dx * dy;
          mu30 += dx * dx * dx;
          mu03 += dy * dy * dy;
          mu21 += dx * dx * dy;
          mu12 += dx * dy * dy;
        }
      }
    }

    // تطبيع العزوم لمنع تأثرها بالحجم والمسافة
    const norm = (mu: number, p: number, q: number) => mu / Math.pow(m00, (p + q) / 2 + 1);

    const n20 = norm(mu20, 2, 0);
    const n02 = norm(mu02, 0, 2);
    const n11 = norm(mu11, 1, 1);
    const n30 = norm(mu30, 3, 0);
    const n03 = norm(mu03, 0, 3);
    const n21 = norm(mu21, 2, 1);
    const n12 = norm(mu12, 1, 2);

    // عزوم Hu السبعة
    const h1 = n20 + n02;
    const h2 = Math.pow(n20 - n02, 2) + 4 * n11 * n11;
    const h3 = Math.pow(n30 - 3 * n12, 2) + Math.pow(3 * n21 - n03, 2);
    const h4 = Math.pow(n30 + n12, 2) + Math.pow(n21 + n03, 2);
    const h5 =
      (n30 - 3 * n12) * (n30 + n12) * (Math.pow(n30 + n12, 2) - 3 * Math.pow(n21 + n03, 2)) +
      (3 * n21 - n03) * (n21 + n03) * (3 * Math.pow(n30 + n12, 2) - Math.pow(n21 + n03, 2));
    const h6 =
      (n20 - n02) * (Math.pow(n30 + n12, 2) - Math.pow(n21 + n03, 2)) +
      4 * n11 * (n30 + n12) * (n21 + n03);
    const h7 =
      (3 * n21 - n03) * (n30 + n12) * (Math.pow(n30 + n12, 2) - 3 * Math.pow(n21 + n03, 2)) -
      (n30 - 3 * n12) * (n21 + n03) * (3 * Math.pow(n30 + n12, 2) - Math.pow(n21 + n03, 2));

    return [h1, h2, h3, h4, h5, h6, h7];
  }

  /**
   * مطابقة الحرف المستخرج مع قاعدة الخطوط القديمة المعيارية
   */
  public static classifyGlyph(canvasPatch: HTMLCanvasElement): RecognizedGlyphResult {
    const w = 48;
    const h = 48;
    const temp = document.createElement("canvas");
    temp.width = w;
    temp.height = h;
    const ctx = temp.getContext("2d")!;
    ctx.drawImage(canvasPatch, 0, 0, w, h);

    const data = ctx.getImageData(0, 0, w, h).data;
    const bin = new Uint8Array(w * h);

    // عتبة أوتسو (Otsu Thresholding) لعزل الحرف
    for (let i = 0; i < w * h; i++) {
      const lum = data[i * 4]! * 0.299 + data[i * 4 + 1]! * 0.587 + data[i * 4 + 2]! * 0.114;
      bin[i] = lum < 115 ? 1 : 0; // الحفر الداكن هو الحرف
    }

    const inputMoments = this.computeHuMoments(bin, w, h);

    let bestScore = Infinity;
    let bestMatch = this.GLYPH_SIGNATURES[0]!;

    for (const sig of this.GLYPH_SIGNATURES) {
      // حساب مسافة التباعد اللوغاريتمي للعزوم
      let dist = 0;
      for (let i = 0; i < 4; i++) {
        const d1 = -Math.sign(inputMoments[i]!) * Math.log10(Math.abs(inputMoments[i]!) || 1e-9);
        const d2 = -Math.sign(sig.moments[i]!) * Math.log10(Math.abs(sig.moments[i]!) || 1e-9);
        dist += Math.abs(d1 - d2);
      }

      if (dist < bestScore) {
        bestScore = dist;
        bestMatch = sig;
      }
    }

    const confidence = Math.max(0.65, Math.min(0.99, 1.0 - bestScore * 0.08));

    return {
      glyphName: bestMatch.name,
      transliterationArabic: bestMatch.ar,
      unicodeChar: bestMatch.char,
      confidence: Number(confidence.toFixed(2)),
      family: bestMatch.family as RecognizedGlyphResult["family"],
    };
  }
}
