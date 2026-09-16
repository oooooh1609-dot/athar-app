/**
 * Athar alphabet pack: importer + the bundled pack that shipped with the app.
 *
 * The pack is reference data only — letter inventories, transliteration values
 * where they exist, and bounding boxes into two supplied chart images. Loading a
 * pack is reference loading; it does not train any image-recognition model.
 */

import bundled from "./alphabet-pack.json";

export type PackSource = {
  id: string;
  filename: string;
  width: number;
  height: number;
  description: string;
  rights_status?: string;
  academic_review?: string;
  /** Resolved image URL for a source bundled with the app. */
  assetUrl?: string;
  /** Decoded object URL for a source imported at runtime from a data URI. */
  objectUrl?: string;
};

export type ReferenceRegion = {
  source_id: string;
  bbox_xyxy: [number, number, number, number];
  style?: string;
  source_column?: string;
  kind?: string;
  contains_multiple_shapes?: boolean;
  may_be_blank?: boolean;
  review_status?: string;
};

export type PackLetter = {
  id: string;
  script_id: string;
  source_row?: number;
  unicode_character: string | null;
  codepoint?: string;
  unicode_name?: string;
  arabic_display: string;
  transliteration: string | null;
  meaning: string | null;
  /** Supplied glyph image for this sign, when the pack ships one per letter. */
  glyph_image_data_uri?: string;
  reference_regions: ReferenceRegion[];
  keyboard_enabled: boolean;
  notes?: string;
};

export type PackScript = {
  id: string;
  label_en: string;
  letter_count: number;
  storage: string;
  display_direction: string;
  scope: string;
};

export type SpecialKey = {
  id: string;
  label: string;
  value?: string;
  action?: string;
  script?: string;
  notes?: string;
};

export type AlphabetPack = {
  format: string;
  schema_version: string;
  created?: string;
  title_ar?: string;
  important_ar?: string;
  capabilities: Record<string, boolean>;
  sources: PackSource[];
  scripts: PackScript[];
  letters: PackLetter[];
  special_keys: SpecialKey[];
  external_references: { id: string; url: string; use: string }[];
  review_queue?: string[];
  counts?: Record<string, number>;
};

const asArray = (v: unknown) => (Array.isArray(v) ? v : []);

/**
 * Validates and normalizes an `athar-alphabet-pack` JSON file. Embedded
 * `image_data_uri` sources are decoded into blob URLs so the real chart images
 * can be shown; nothing is fetched from the network.
 */
export function parseAlphabetPack(raw: unknown): AlphabetPack {
  const d = raw as Record<string, unknown>;
  if (!d || typeof d !== "object") throw new Error("Not a JSON object.");
  if (d["format"] !== "athar-alphabet-pack")
    throw new Error('Unsupported file: "format" must be "athar-alphabet-pack".');

  const sources: PackSource[] = asArray(d["sources"]).map((sItem: unknown) => {
    const s = sItem as Record<string, unknown>;
    const src: PackSource = {
      id: String(s.id),
      filename: String(s.filename ?? ""),
      width: Number(s.width) || 0,
      height: Number(s.height) || 0,
      description: String(s.description ?? ""),
      rights_status: s.rights_status as PackSource["rights_status"],
      academic_review: s.academic_review as PackSource["academic_review"],
      assetUrl: s.assetUrl as string | undefined,
    };
    if (typeof s.image_data_uri === "string" && s.image_data_uri.startsWith("data:")) {
      src.objectUrl = dataUriToObjectUrl(s.image_data_uri);
    }
    return src;
  });

  const letters: PackLetter[] = asArray(d["letters"]).map((lItem: unknown) => {
    const l = lItem as Record<string, unknown>;
    return {
      id: String(l.id),
      script_id: String(l.script_id),
      source_row: (l.source_row as number | undefined) ?? undefined,
      unicode_character: (l.unicode_character as string | null) ?? null,
      codepoint: (l.codepoint as string | undefined) ?? undefined,
      unicode_name: (l.unicode_name as string | undefined) ?? undefined,
      arabic_display: String(l.arabic_display ?? ""),
      ...(typeof l.glyph_image_data_uri === "string" && l.glyph_image_data_uri.startsWith("data:")
        ? { glyph_image_data_uri: l.glyph_image_data_uri as string }
        : {}),
      transliteration: (l.transliteration as string | null) ?? null,
      meaning: (l.meaning as string | null) ?? null,
      reference_regions: asArray(l.reference_regions).map((rItem: unknown) => {
        const r = rItem as Record<string, unknown>;
        return {
          ...r,
          bbox_xyxy: (Array.isArray(r.bbox_xyxy) ? r.bbox_xyxy : []).map(Number) as [
            number,
            number,
            number,
            number,
          ],
        };
      }),
      keyboard_enabled: l.keyboard_enabled !== false,
      notes: (l.notes as string | undefined) ?? undefined,
    };
  });

  if (letters.length === 0) throw new Error("The pack contains no letters.");

  return {
    format: d["format"],
    schema_version: String(d["schema_version"] ?? ""),
    created: d["created"],
    title_ar: d["title_ar"],
    important_ar: d["important_ar"],
    capabilities: (d["capabilities"] ?? {}) as Record<string, boolean>,
    sources,
    scripts: asArray(d["scripts"]) as PackScript[],
    letters,
    special_keys: asArray(d["special_keys"]) as SpecialKey[],
    external_references: asArray(d["external_references"]) as AlphabetPack["external_references"],
    review_queue: asArray(d["review_queue"]) as string[],
    counts: (d["counts"] ?? {}) as Record<string, number>,
  };
}

function dataUriToObjectUrl(uri: string): string {
  const [head, b64] = uri.split(",", 2);
  const mime = /data:([^;]+)/.exec(head ?? "")?.[1] ?? "image/jpeg";
  const bin = atob(b64 ?? "");
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return URL.createObjectURL(new Blob([bytes], { type: mime }));
}

/** The pack imported from the supplied file, bundled with the app. */
export const ALPHABET_PACK: AlphabetPack = parseAlphabetPack(bundled);

export const MUSNAD_SCRIPT = "old_south_arabian";
export const THAMUDIC_SCRIPT = "thamudic_source_table";

export const packLetter = (pack: AlphabetPack, id: string) => pack.letters.find((l) => l.id === id);

export const packSource = (pack: AlphabetPack, id: string) => pack.sources.find((s) => s.id === id);

export const sourceImageUrl = (s?: PackSource) => s?.objectUrl ?? s?.assetUrl ?? "";

export const lettersOf = (pack: AlphabetPack, scriptId: string) =>
  pack.letters.filter((l) => l.script_id === scriptId && l.keyboard_enabled);

/* ------------------------------ inscription ------------------------------ */

export type InscriptionToken =
  | {
      kind: "musnad";
      letterId: string;
      char: string;
      arabic: string;
      translit: string | null;
      uncertain?: boolean;
    }
  | {
      kind: "thamudic";
      letterId: string;
      row: number;
      arabic: string;
      /** The strip the user picked the shape from, in original source pixels. */
      region?: { sourceId: string; column?: string; bbox: [number, number, number, number] };
      /** True when the user narrowed the strip down to one chosen shape. */
      shapeChosen?: boolean;
      uncertain?: boolean;
    }
  | { kind: "space" }
  | { kind: "newline" }
  | { kind: "unknown" };

/** Human-readable line for export and for saving alongside the token list. */
export function tokensToText(tokens: InscriptionToken[]): string {
  return tokens
    .map((t) => {
      if (t.kind === "space") return " ";
      if (t.kind === "newline") return "\n";
      if (t.kind === "unknown") return "?";
      if (t.kind === "musnad") return t.char;
      return `[row ${t.row}:${t.arabic}${t.shapeChosen ? "*" : ""}]`;
    })
    .join("");
}

/** Transliteration only where the pack actually supplies a reviewed value. */
export function tokensToTransliteration(tokens: InscriptionToken[]): {
  text: string;
  missing: number;
} {
  let missing = 0;
  const text = tokens
    .map((t) => {
      if (t.kind === "space") return " ";
      if (t.kind === "newline") return "\n";
      if (t.kind === "unknown") return "?";
      if (t.kind === "musnad" && t.translit) return t.translit;
      missing++;
      return "?";
    })
    .join("");
  return { text, missing };
}

export type WritingDirection = "rtl" | "ltr" | "boustrophedon" | "vertical_boustrophedon";

export type EpigraphicScriptCategory =
  | "musnad_sabaic"
  | "musnad_minaic"
  | "thamudic"
  | "dedanite"
  | "early_kufic_undotted" // الكوفي الحجازي المبكر (غير منقوط)
  | "kufic_floriated" // الكوفي المورق والمزهر
  | "kufic_geometric" // الكوفي المربع والهندسي
  | "early_naskh"; // النسخ الأيوبي والمملوكي

export interface MusnadNumberMatch {
  raw: string;
  value: number;
}

export interface IslamicFormulaMatch {
  rawRasm: string;
  reconstructedArabic: string;
  category: "استغفار وترحم" | "شهادة وتوحيد" | "بناء ومنشآت" | "تأريخ زمني" | "آية قرآنية";
  confidence: number;
  periodApprox: string;
}

export class EpigraphicAlphabetEngine {
  // الأرقام المسندية المعيارية
  private static MUSNAD_NUMERALS: Record<string, number> = {
    "𐩾": 1, // رمز الآحاد
    "𐩿": 5, // رمز الخمسة
    "𐩵": 10, // رمز العشرة
    "𐩲": 50, // رمز الخمسين
    "𐩪": 100, // رمز المئة
    "𐩱": 1000, // رمز الألف
  };

  // جدول حساب الجُمّل الكبير (Abjad Numeral Chronograms)
  private static ABJAD_TABLE: Record<string, number> = {
    ا: 1,
    ب: 2,
    ج: 3,
    د: 4,
    ه: 5,
    و: 6,
    ز: 7,
    ح: 8,
    ط: 9,
    ي: 10,
    ك: 20,
    ل: 30,
    م: 40,
    ن: 50,
    س: 60,
    ع: 70,
    ف: 80,
    ص: 90,
    ق: 100,
    ر: 200,
    ش: 300,
    ت: 400,
    ث: 500,
    خ: 600,
    ذ: 700,
    ض: 800,
    ظ: 900,
    غ: 1000,
  };

  // معجم الأنماط التوثيقية الصخرية الإسلامية للرسم غير المنقوط
  private static ISLAMIC_FORMULA_PATTERNS: {
    regex: RegExp;
    reconstruction: string;
    category: IslamicFormulaMatch["category"];
    period: string;
  }[] = [
    {
      regex: /برحم?|يرحم?|رحمه?|ر ح م/u,
      reconstruction: "رحم الله / يرحم الله فلان بن فلان",
      category: "استغفار وترحم",
      period: "القرن الأول والثاني الهجري",
    },
    {
      regex: /اغفر?|عفر|لذنب?|لذنبه?|ماتقدم?/u,
      reconstruction: "اللهم اغفر لـ / غفر الله له ما تقدم من ذنبه",
      category: "استغفار وترحم",
      period: "القرن الأول إلى الثالث الهجري",
    },
    {
      regex: /اشهد|شهد|لا اله الا الله|وحده لا شريك/u,
      reconstruction: "شهد أن لا إله إلا الله وحده لا شريك له وأن محمداً عبده ورسوله",
      category: "شهادة وتوحيد",
      period: "القرن الأول الهجري فصاعداً",
    },
    {
      regex: /بنى|بنا|امر ببناء|السد|هذا السد|المسجد/u,
      reconstruction: "أمر ببناء هذا السد / المسجد عبد الله أمير المؤمنين",
      category: "بناء ومنشآت",
      period: "العصر الأموي والعباسي",
    },
    {
      regex: /سنه|سنة|سنت|عشرين|اربع وعشرين|اربعين|ثمانين|ميه|مائة/u,
      reconstruction: "وكتب لسنة ... هجرية",
      category: "تأريخ زمني",
      period: "توثيق تقويمي هجري",
    },
    {
      regex: /توكلت|حسبي الله|امنت بالله|ثقتي بالله/u,
      reconstruction: "آمنت بالله وتوكلت على الله وهو حسبي ونعم الوكيل",
      category: "شهادة وتوحيد",
      period: "صدر الإسلام والأموي",
    },
  ];

  /**
   * فك وتحقيق الرسم غير المنقوط للنقوش الإسلامية المبكرة
   */
  public static reconstructEarlyIslamicRasm(undottedText: string): IslamicFormulaMatch[] {
    const clean = undottedText.replace(/[\u064B-\u065F\u0670]/gu, "").trim();
    const matches: IslamicFormulaMatch[] = [];

    for (const item of this.ISLAMIC_FORMULA_PATTERNS) {
      if (item.regex.test(clean)) {
        matches.push({
          rawRasm: clean,
          reconstructedArabic: item.reconstruction,
          category: item.category,
          confidence: 0.95,
          periodApprox: item.period,
        });
      }
    }

    if (matches.length === 0) {
      matches.push({
        rawRasm: clean,
        reconstructedArabic: this.normalizeEarlyRasm(clean),
        category: "استغفار وترحم",
        confidence: 0.72,
        periodApprox: "نقش صخري إسلامي مبكر",
      });
    }

    return matches;
  }

  private static normalizeEarlyRasm(input: string): string {
    return input
      .replace(/[إأآا]/gu, "ا")
      .replace(/[ىي]/gu, "ي")
      .replace(/ة/gu, "ه");
  }

  /**
   * حساب التأريخ الزمني بحساب الجُمّل (Abjad Chronogram)
   */
  public static calculateAbjadChronogram(text: string): {
    totalValue: number;
    matchedLetters: string[];
  } {
    let total = 0;
    const matched: string[] = [];
    const normalized = text.replace(/[^ء-ي]/gu, "");

    for (const char of normalized) {
      if (this.ABJAD_TABLE[char]) {
        total += this.ABJAD_TABLE[char];
        matched.push(`${char}(${this.ABJAD_TABLE[char]})`);
      }
    }

    return { totalValue: total, matchedLetters: matched };
  }

  /**
   * تفكيك وحساب الأرقام المسندية المركبة (مثل: 𐩽𐩱𐩱𐩪𐩵𐩿𐩾𐩽 = 2116)
   */
  public static decodeMusnadNumerals(text: string): MusnadNumberMatch[] {
    const matches: MusnadNumberMatch[] = [];
    // استخراج المقاطع المحصورة بين فواصِل الكلمات المسندية 𐩽
    const regex = /𐩽([𐩾𐩿𐩵𐩲𐩪𐩱]+)𐩽/gu;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const raw = match[1]!;
      let total = 0;
      for (const ch of raw) {
        if (this.MUSNAD_NUMERALS[ch]) {
          total += this.MUSNAD_NUMERALS[ch];
        }
      }
      matches.push({ raw, value: total });
    }

    return matches;
  }

  /**
   * محلل السطور المحراثية (Boustrophedon) للمسند والسطور العادية للكوفي
   */
  public static parseInscriptionLines(
    lines: string[],
    direction: WritingDirection = "rtl",
  ): {
    lineIndex: number;
    readingDirection: "rtl" | "ltr";
    text: string;
    naturalOrder: string;
  }[] {
    return lines.map((line, idx) => {
      let lineDir: "rtl" | "ltr" = "rtl";

      if (direction === "boustrophedon") {
        // السطور الزوجية (0, 2, 4..) من اليمين لليسار، والفردية تنعكس تلقائياً
        lineDir = idx % 2 === 0 ? "rtl" : "ltr";
      } else if (direction === "ltr") {
        lineDir = "ltr";
      }

      const naturalOrder = lineDir === "ltr" ? Array.from(line).reverse().join("") : line;

      return {
        lineIndex: idx + 1,
        readingDirection: lineDir,
        text: line,
        naturalOrder,
      };
    });
  }

  /**
   * محلل السطور المحراثية (Boustrophedon Parser) - متوافق مع الاستدعاءات المباشرة
   */
  public static parseBoustrophedonInscription(
    lines: string[],
    initialDirection: "rtl" | "ltr" = "rtl",
  ): {
    lineIndex: number;
    direction: "rtl" | "ltr";
    text: string;
    naturalReadingOrder: string;
  }[] {
    return lines.map((line, idx) => {
      const isReversed = idx % 2 !== 0;
      let effectiveDir: "rtl" | "ltr" = initialDirection;

      if (isReversed) {
        effectiveDir = initialDirection === "rtl" ? "ltr" : "rtl";
      }

      const naturalOrder = effectiveDir === "ltr" ? Array.from(line).reverse().join("") : line;

      return {
        lineIndex: idx + 1,
        direction: effectiveDir,
        text: line,
        naturalReadingOrder: naturalOrder,
      };
    });
  }

  /**
   * التشفير الصوتي ومطابقة الحروف المندغمة في لغات جنوب وشمال الجزيرة
   */
  public static phoneticTransliterate(musnadText: string): string {
    const table: Record<string, string> = {
      "𐩠": "هـ",
      "𐩡": "ل",
      "𐩢": "ح",
      "𐩣": "م",
      "𐩤": "ق",
      "𐩥": "و",
      "𐩦": "ش",
      "𐩧": "ر",
      "𐩨": "ب",
      "𐩩": "ت",
      "𐩪": "س",
      "𐩫": "ك",
      "𐩬": "ن",
      "𐩭": "خ",
      "𐩮": "ذ",
      "𐩯": "ص",
      "𐩰": "ض",
      "𐩱": "أ",
      "𐩲": "ع",
      "𐩳": "ظ",
      "𐩴": "ز",
      "𐩵": "ج",
      "𐩶": "غ",
      "𐩷": "ط",
      "𐩸": "د",
      "𐩹": "ي",
      "𐩺": "ث",
      "𐩻": "س² (شين ثانية)",
      "𐩼": "س³ (سين ثالثة)",
      "𐩽": " | ",
    };

    let result = "";
    for (const char of musnadText) {
      result += table[char] || char;
    }
    return result;
  }
}
