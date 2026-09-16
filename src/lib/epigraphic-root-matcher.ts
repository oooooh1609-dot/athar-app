/**
 * Epigraphic Root Matcher for Ancient South Arabian (Musnad) & Thamudic / ANA.
 *
 * Implements Semitic trilateral root morphological analysis, prefix/suffix stripping
 * (e.g. Musnad enclitic -n / -m, ANA prefixed h- article, conjunction w-, prepositions b-, l-),
 * and phonetic Levenshtein distance with weighted penalties for common epigraphic sound shifts
 * (e.g. s¹/s²/s³, ḏ/d, ṯ/t, ġ/ʿ) to resolve eroded or damaged inscription signs.
 */

export type EpigraphicRootCandidate = {
  root: string; // e.g. "q-d-m", "m-l-k", "b-n-y"
  translit: string;
  reconstructedMeaningAr: string;
  reconstructedMeaningEn: string;
  confidence: number;
  notes: string;
  sourceFamily: "musnad" | "thamudic" | "common_semitic";
};

/**
 * Standard Epigraphic Semitic roots commonly encountered in rock inscriptions
 * across the Arabian Peninsula (Safaitic, Thamudic B/C/D, Dadanitic, Sabaic, Qatabanic).
 */
export const EPIGRAPHIC_ROOT_CORPUS: Array<{
  root: string;
  glossAr: string;
  glossEn: string;
  typicalPrefixes: string[];
  typicalSuffixes: string[];
  family: "musnad" | "thamudic" | "common_semitic";
}> = [
  {
    root: "mlk",
    glossAr: "مَلَكَ، مَلِك، حاكم، صاحب السيادة",
    glossEn: "king, sovereign, to rule, possess",
    typicalPrefixes: ["w", "l", "b", "h"],
    typicalSuffixes: ["n", "m", "h", "hm", "t", "w"],
    family: "common_semitic",
  },
  {
    root: "qdm",
    glossAr: "قَدِمَ، تَقَدَّمَ، قائد، في حضرة، زعامة",
    glossEn: "to advance, chief, in front of, precede",
    typicalPrefixes: ["w", "b", "l", "h"],
    typicalSuffixes: ["n", "m", "h", "at", "t"],
    family: "musnad",
  },
  {
    root: "bny",
    glossAr: "بَنَى، شَيَّدَ، أقام منشأة أو سداً أو معبداً",
    glossEn: "to build, construct a monument or wall",
    typicalPrefixes: ["w", "f"],
    typicalSuffixes: ["w", "n", "h", "hm", "t"],
    family: "musnad",
  },
  {
    root: "wdd",
    glossAr: "وَدَّ، حَبَّ، تَحِيَّة (شائع في خواتيم نقوش ثمودية)",
    glossEn: "to love, greeting formula (very common in Thamudic)",
    typicalPrefixes: ["w", "f", "l"],
    typicalSuffixes: ["t", "h", "n"],
    family: "thamudic",
  },
  {
    root: "s²yr",
    glossAr: "سارَ، قافلة، مسير، تَرَحَّلَ في الأرض",
    glossEn: "to journey, caravan, expedition",
    typicalPrefixes: ["w", "b"],
    typicalSuffixes: ["n", "m", "t"],
    family: "common_semitic",
  },
  {
    root: "rʿy",
    glossAr: "رَعَى الماشية، كَلأ، راعٍ في المراعي الصحراوية",
    glossEn: "to pasture, graze, shepherd",
    typicalPrefixes: ["w", "f", "l"],
    typicalSuffixes: ["t", "n", "h"],
    family: "thamudic",
  },
  {
    root: "ḥmy",
    glossAr: "حَمَى، حِمَى، صانَ الموضع أو النخل أو البئر",
    glossEn: "to protect, enclosure, sanctuary",
    typicalPrefixes: ["w", "b"],
    typicalSuffixes: ["n", "m", "t"],
    family: "musnad",
  },
  {
    root: "ṣyd",
    glossAr: "صادَ، قَنَصَ، طرد الوعل أو الغزال في الجبل",
    glossEn: "to hunt game (ibex, gazelle)",
    typicalPrefixes: ["w", "f"],
    typicalSuffixes: ["t", "n", "h"],
    family: "thamudic",
  },
  {
    root: "šrq",
    glossAr: "شَرَّقَ، اتجه شرقاً، شروق الشمس",
    glossEn: "to go east, sunrise, morning",
    typicalPrefixes: ["w", "b", "l"],
    typicalSuffixes: ["n", "t"],
    family: "common_semitic",
  },
  {
    root: "ġrb",
    glossAr: "غَرَّبَ، اتجه غرباً، مغيب، وداع",
    glossEn: "to go west, sunset, departure",
    typicalPrefixes: ["w", "b", "l"],
    typicalSuffixes: ["n", "t"],
    family: "common_semitic",
  },
  {
    root: "krb",
    glossAr: "كَرَبَ، تَقَرَّبَ، نَذَرَ، حاكم ديني (مكرب سبأ)",
    glossEn: "to dedicate, priest-king (mukarrib)",
    typicalPrefixes: ["w", "l", "m"],
    typicalSuffixes: ["n", "m", "t"],
    family: "musnad",
  },
  {
    root: "whb",
    glossAr: "وَهَبَ، أَعْطَى، هبة للمعبود أو للشخص",
    glossEn: "to grant, gift to deity or person",
    typicalPrefixes: ["w", "l", "y"],
    typicalSuffixes: ["n", "h", "hm", "t"],
    family: "musnad",
  },
  {
    root: "ẓlm",
    glossAr: "ظَلَمَ، جارَ، حَفَرَ نقشاً في صخرة",
    glossEn: "to inscribe/peck (epigraphic idiom), or wrong",
    typicalPrefixes: ["w", "f"],
    typicalSuffixes: ["t", "n", "h"],
    family: "thamudic",
  },
  {
    root: "ʿwr",
    glossAr: "عَوَّرَ، طَمَسَ (لعنة على من يطمس النقش)",
    glossEn: "to blind, efface the inscription (curse formula)",
    typicalPrefixes: ["y", "l", "w"],
    typicalSuffixes: ["h", "hm", "n"],
    family: "common_semitic",
  },
  {
    root: "s¹lm",
    glossAr: "سَلِمَ، سَلام، أَمْن وعافية، صَنَم/نَصَب",
    glossEn: "peace, safety, well-being, statue (slm)",
    typicalPrefixes: ["w", "b", "l"],
    typicalSuffixes: ["n", "m", "h", "t"],
    family: "common_semitic",
  },
  {
    root: "ḏkr",
    glossAr: "ذَكَرَ، تذكار، ذِكْر بالخير للمسافرين",
    glossEn: "to remember, memorial, memorial inscription",
    typicalPrefixes: ["w", "l", "b"],
    typicalSuffixes: ["n", "h", "t"],
    family: "common_semitic",
  },
];

/**
 * Strips known ancient grammatical prefixes and suffixes to extract triliteral radical skeleton.
 */
export function extractSemiticRadicals(token: string): string[] {
  const clean = token
    .toLowerCase()
    .replace(/[ʾʿ¹²³ʼ']/g, "")
    .replace(/[^a-z?*]/g, "");

  if (clean.length <= 2) return [clean];

  const candidates = new Set<string>();
  candidates.add(clean);

  // Common prefixes in epigraphy: w-, b-, l-, f-, k-, h-, y-, t-, m-, ʾ-
  const prefixes = ["w", "b", "l", "f", "k", "h", "y", "t", "m"];
  // Common suffixes: -n (nunation/article), -m (mimation), -h, -hm, -w, -t, -at
  const suffixes = ["at", "hm", "n", "m", "h", "w", "t"];

  for (const pref of prefixes) {
    if (clean.startsWith(pref) && clean.length > 3) {
      candidates.add(clean.slice(pref.length));
    }
  }

  const baseList = Array.from(candidates);
  for (const base of baseList) {
    for (const suff of suffixes) {
      if (base.endsWith(suff) && base.length - suff.length >= 3) {
        candidates.add(base.slice(0, -suff.length));
      }
    }
  }

  return Array.from(candidates);
}

/**
 * Phonetic Levenshtein distance with epigraphic sound-shift tolerance.
 * Damaged characters '?' or '*' have minimal penalty.
 */
export function epigraphicLevenshtein(a: string, b: string): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0) return lb;
  if (lb === 0) return la;

  const dp: number[][] = Array.from({ length: la + 1 }, () => new Array(lb + 1).fill(0));

  for (let i = 0; i <= la; i++) dp[i]![0] = i;
  for (let j = 0; j <= lb; j++) dp[0]![j] = j;

  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      const charA = a[i - 1]!;
      const charB = b[j - 1]!;

      let cost = 0;
      if (charA === charB) {
        cost = 0;
      } else if (charA === "?" || charA === "*" || charB === "?" || charB === "*") {
        // Eroded or damaged glyph cost is very low (0.3)
        cost = 0.3;
      } else if (isPhoneticCognate(charA, charB)) {
        // Known historical epigraphic sound shifts (0.4)
        cost = 0.4;
      } else {
        cost = 1.0;
      }

      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1, // deletion
        dp[i]![j - 1]! + 1, // insertion
        dp[i - 1]![j - 1]! + cost, // substitution
      );
    }
  }

  return dp[la]![lb]!;
}

/**
 * Historical sound shifts between Epigraphic South Arabian, Thamudic, and Classical Semitic.
 */
function isPhoneticCognate(c1: string, c2: string): boolean {
  const pairs = [
    ["s", "š"],
    ["s", "ś"],
    ["d", "ḏ"],
    ["t", "ṯ"],
    ["z", "ḏ"],
    ["z", "ẓ"],
    ["t", "ṭ"],
    ["k", "q"],
    ["g", "ġ"],
    ["h", "ḥ"],
    ["w", "y"],
  ];
  return pairs.some(([p1, p2]) => (c1 === p1 && c2 === p2) || (c1 === p2 && c2 === p1));
}

/**
 * Matches an eroded or complete word token against ancient Semitic roots.
 */
export function matchEpigraphicRoots(
  token: string,
  preferredScript?: "musnad" | "thamudic",
): EpigraphicRootCandidate[] {
  const clean = token.trim();
  if (!clean) return [];

  const stems = extractSemiticRadicals(clean);
  const hits: Array<{ item: (typeof EPIGRAPHIC_ROOT_CORPUS)[0]; score: number }> = [];

  for (const entry of EPIGRAPHIC_ROOT_CORPUS) {
    let minDistance = 999;
    for (const stem of stems) {
      const dist = epigraphicLevenshtein(stem, entry.root);
      if (dist < minDistance) minDistance = dist;
    }

    // Direct token distance
    const tokenDist = epigraphicLevenshtein(clean, entry.root);
    const bestDist = Math.min(minDistance, tokenDist);

    if (bestDist <= 1.4) {
      hits.push({ item: entry, score: bestDist });
    }
  }

  hits.sort((a, b) => {
    // Prefer matching script family
    let scoreA = a.score;
    let scoreB = b.score;
    if (preferredScript && a.item.family === preferredScript) scoreA -= 0.2;
    if (preferredScript && b.item.family === preferredScript) scoreB -= 0.2;
    return scoreA - scoreB;
  });

  return hits.slice(0, 3).map(({ item, score }) => ({
    root: item.root.split("").join("-"),
    translit: item.root,
    reconstructedMeaningAr: item.glossAr,
    reconstructedMeaningEn: item.glossEn,
    confidence: Math.max(0.65, Math.min(0.98, 1 - score * 0.25)),
    notes: `جذر سامي قديم (${item.family === "musnad" ? "مسند جنوبي" : item.family === "thamudic" ? "شمالي ثمودي" : "مشترك"}) تم تحليله صرفياً للمفردات المتآكلة`,
    sourceFamily: item.family,
  }));
}

export interface EpigraphicMatch {
  root: string;
  arabicMeaning: string;
  dialect:
    | "Sabaic"
    | "Minaic"
    | "Qatabanic"
    | "Hadramitic"
    | "Thamudic"
    | "Dedanite"
    | "Early_Islamic_Kufic"
    | "Abbasid_Monumental";
  confidence: number;
  grammarNote?: string;
}

const OFFLINE_LEXICON: Record<string, { meaning: string; dialect: string; grammar?: string }[]> = {
  // مفردات المسند والثمودي والديداني
  ملك: [
    { meaning: "مَلَكَ / حَكَمَ / قاد الجيش", dialect: "Sabaic", grammar: "فعل ماضٍ" },
    { meaning: "الملك / الحاكم / القيل", dialect: "Qatabanic", grammar: "اسم معرف" },
  ],
  بني: [
    {
      meaning: "بَنَى / شَيَّدَ / أقام منشأة أو معبداً",
      dialect: "Sabaic",
      grammar: "فعل ماضٍ متعدٍ",
    },
  ],
  قين: [
    {
      meaning: "قيّن / صانع المعادن أو الحداد / وكيلاً",
      dialect: "Minaic",
      grammar: "اسم مهنة",
    },
  ],
  ود: [
    { meaning: "المعبود وَدّ / إله المحبة والحماية", dialect: "Minaic", grammar: "اسم علم إلهي" },
    { meaning: "أحبَّ / عاهد", dialect: "Thamudic", grammar: "فعل" },
  ],
  سلم: [
    { meaning: "سَلِمَ / أمِنَ / حفظه الله", dialect: "Thamudic", grammar: "صيغة دعائية" },
    {
      meaning: "تمثال نذري من البرونز أو الحجر",
      dialect: "Sabaic",
      grammar: "اسم نذري",
    },
  ],
  كبر: [
    {
      meaning: "كبير القوم / زعيم القبيلة أو المستوطنة",
      dialect: "Minaic",
      grammar: "لقب رسمي",
    },
  ],
  نفس: [
    {
      meaning: "نصب تذكاري جنائزي / روح الميت",
      dialect: "Qatabanic",
      grammar: "شاهدة قبر",
    },
  ],

  // مفردات النقوش الإسلامية الصخرية (القرن 1 - 4 هـ)
  غفر: [
    {
      meaning: "طلب المغفرة والعفو الإلهي لكاتب النقش أو والديه",
      dialect: "Early_Islamic_Kufic",
      grammar: "فعل دعائي (اللهم اغفر)",
    },
  ],
  رحم: [
    {
      meaning: "الترحم على صاحب النقش أو الميت (يرحم الله / رحمه الله)",
      dialect: "Early_Islamic_Kufic",
      grammar: "صيغة ترحم وتأبين",
    },
  ],
  شهد: [
    {
      meaning: "إقرار بالتوحيد والرسالة (شهد فلان أن لا إله إلا الله)",
      dialect: "Early_Islamic_Kufic",
      grammar: "صيغة إقرار إيماني",
    },
  ],
  كتب: [
    {
      meaning: "خَطَّ ونَقَرَ النقش في هذا الموضع من الجبل",
      dialect: "Early_Islamic_Kufic",
      grammar: "فعل توثيق صخري",
    },
  ],
  سنة: [
    {
      meaning: "عام التأريخ الهجري لوقوع الحدث أو كتابة النقش",
      dialect: "Early_Islamic_Kufic",
      grammar: "ظرف زمان تأريخي",
    },
  ],
  عمر: [
    {
      meaning: "عَمَّرَ / أصلح وشيّد السد أو الطريق أو البئر المحفورة",
      dialect: "Abbasid_Monumental",
      grammar: "فعل تشييد وبناء وقفي",
    },
  ],
  حسب: [
    {
      meaning: "التوكل والاعتماد على الله (حسبي الله ونعم الوكيل)",
      dialect: "Early_Islamic_Kufic",
      grammar: "صيغة اعتصام وتوكل",
    },
  ],
};

export class EpigraphicPrefixTrieNode {
  children: Map<string, EpigraphicPrefixTrieNode> = new Map();
  isEndOfWord: boolean = false;
  entries: { meaning: string; dialect: string; grammar?: string }[] = [];
  rootWord: string = "";
}

export class EpigraphicPrefixTrie {
  private root = new EpigraphicPrefixTrieNode();

  constructor() {
    this.buildIndex();
  }

  private buildIndex(): void {
    for (const [key, entries] of Object.entries(OFFLINE_LEXICON)) {
      this.insert(key, entries);
    }
  }

  public insert(
    word: string,
    entries: { meaning: string; dialect: string; grammar?: string }[],
  ): void {
    let current = this.root;
    for (const char of word) {
      if (!current.children.has(char)) {
        current.children.set(char, new EpigraphicPrefixTrieNode());
      }
      current = current.children.get(char)!;
    }
    current.isEndOfWord = true;
    current.entries = entries;
    current.rootWord = word;
  }

  public searchPrefix(prefix: string): EpigraphicMatch[] {
    let current = this.root;
    for (const char of prefix) {
      if (!current.children.has(char)) {
        return [];
      }
      current = current.children.get(char)!;
    }
    const results: EpigraphicMatch[] = [];
    this.collectAll(current, results);
    return results;
  }

  private collectAll(node: EpigraphicPrefixTrieNode, results: EpigraphicMatch[]): void {
    if (node.isEndOfWord) {
      for (const item of node.entries) {
        results.push({
          root: node.rootWord,
          arabicMeaning: item.meaning,
          dialect: item.dialect as EpigraphicMatch["dialect"],
          confidence: 0.95,
          grammarNote: item.grammar,
        });
      }
    }
    for (const child of node.children.values()) {
      this.collectAll(child, results);
    }
  }
}

export class EpigraphicRootMatcher {
  private trie = new EpigraphicPrefixTrie();

  public normalizeEpigraphicText(input: string): string {
    return input
      .trim()
      .replace(/[\u10A60-\u10A7F]/gu, (char) => this.musnadToProtoArabic(char))
      .replace(/𐩽/gu, " ")
      .replace(/[إأآا]/gu, "ا")
      .replace(/[ىي]/gu, "ي")
      .replace(/ة/gu, "ه");
  }

  private musnadToProtoArabic(char: string): string {
    const code = char.codePointAt(0);
    if (!code) return char;
    const musnadMap: Record<number, string> = {
      0x10a60: "ه",
      0x10a61: "ل",
      0x10a62: "ح",
      0x10a63: "م",
      0x10a64: "ق",
      0x10a65: "و",
      0x10a66: "ش",
      0x10a67: "ر",
      0x10a68: "ب",
      0x10a69: "ت",
      0x10a6a: "س",
      0x10a6b: "ك",
      0x10a6c: "ن",
      0x10a6d: "خ",
      0x10a6e: "ذ",
      0x10a6f: "ص",
      0x10a70: "ض",
      0x10a71: "ف",
      0x10a72: "ع",
      0x10a73: "ظ",
      0x10a74: "ز",
      0x10a75: "غ",
      0x10a76: "ط",
      0x10a77: "د",
      0x10a78: "ي",
      0x10a79: "ث",
      0x10a7a: "ص",
      0x10a7b: "ظ",
      0x10a7c: "س",
      0x10a7d: "س",
      0x10a7e: "ث",
      0x10a7f: " ",
    };
    return musnadMap[code] || char;
  }

  public matchRoot(word: string): EpigraphicMatch[] {
    const clean = this.normalizeEpigraphicText(word);
    const results: EpigraphicMatch[] = [];

    if (OFFLINE_LEXICON[clean]) {
      for (const item of OFFLINE_LEXICON[clean]!) {
        results.push({
          root: clean,
          arabicMeaning: item.meaning,
          dialect: item.dialect as EpigraphicMatch["dialect"],
          confidence: 1.0,
          grammarNote: item.grammar,
        });
      }
      return results;
    }

    for (const [dictRoot, entries] of Object.entries(OFFLINE_LEXICON)) {
      const dist = this.levenshtein(clean, dictRoot);
      if (dist <= 1) {
        for (const item of entries) {
          results.push({
            root: dictRoot,
            arabicMeaning: item.meaning,
            dialect: item.dialect as EpigraphicMatch["dialect"],
            confidence: Math.max(0.65, 1.0 - dist * 0.25),
            grammarNote: `${item.grammar || ""} (مطابقة تقريبية لتآكل الحرف الصخري)`,
          });
        }
      }
    }

    return results;
  }

  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0]![j] = j;

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1,
          );
        }
      }
    }
    return matrix[b.length]![a.length]!;
  }
}
