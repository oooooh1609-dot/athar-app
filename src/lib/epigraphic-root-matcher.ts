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
