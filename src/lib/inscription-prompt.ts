/** Shared types + prompt material for assisted inscription reading. */

export type ScriptChoice = "auto" | "thamudic" | "dadanitic" | "nabataean" | "other";
export type ExplainLang = "ar" | "en" | "zh" | "fr";

export type ReadingReference = { title: string; url: string };

/** A published inscription whose letters resemble the reading. Never a verified match. */
export type ReferenceParallel = {
  siglum: string;
  script: string | null;
  language: string | null;
  transliteration: string | null;
  translation: string | null;
  site: string | null;
  url: string | null;
  source: string;
  similarity: number;
};

export type ReferenceCollectionInfo = { source: string; version: string; records: number };

export type ReadingResult = {
  script: string;
  direction: string;
  transliteration: string;
  proposedReading: string;
  wordSplit: string;
  meaning: string;
  meaningLang: ExplainLang;
  uncertainties: string;
  alternatives: string;
  unreadable: boolean;
  note: string;
  references: ReadingReference[];
};

/**
 * Documented, citable corpora. None of them publishes an open, documented
 * public API, so they are offered as links for manual verification and as the
 * only citation targets allowed to the model.
 */
export const REFERENCE_SOURCES = [
  {
    title: "OCIANA — Online Corpus of the Inscriptions of Ancient North Arabia",
    url: "https://ociana.osu.edu/",
    note: "Ancient North Arabian corpus: Thamudic, Safaitic, Dadanitic, Hismaic.",
  },
  {
    title: "OCIANA project documentation (University of Oxford)",
    url: "https://krc.web.ox.ac.uk/ociana",
    note: "Project method and transliteration conventions.",
  },
  {
    title: "DASI — Digital Archive for the Study of pre-Islamic Arabian Inscriptions",
    url: "http://dasi.cnr.it/",
    note: "Includes Nabataean and Dadanitic material with record identifiers.",
  },
];

export const SCRIPT_BRIEF: Record<ScriptChoice, string> = {
  auto: "Suggest the script class yourself among: Thamudic (name a subtype only if the letter shapes support it), Dadanitic (formerly Lihyanite), Nabataean, or unknown.",
  thamudic: "The user believes the script is Thamudic. Verify; name a subtype only if supported.",
  dadanitic: "The user believes the script is Dadanitic (formerly called Lihyanite). Verify.",
  nabataean: "The user believes the script is Nabataean. Verify.",
  other:
    "The user marked the script as other/unknown. Say so plainly if the class cannot be established.",
};

const MEANING_LANG: Record<ExplainLang, string> = {
  ar: "اكتب حقل meaning بالعربية الفصحى.",
  en: "Write the `meaning` field in English.",
  zh: "用简体中文书写 `meaning` 字段。",
  fr: "Rédigez le champ `meaning` en français.",
};

export function systemPrompt(lang: ExplainLang) {
  const meaningLang = MEANING_LANG[lang] ?? MEANING_LANG.en;

  return `You assist with Ancient North Arabian and Nabataean inscriptions (Thamudic and its subtypes, Dadanitic/Lihyanite, Nabataean). You assist a reader; you never assert.

Hard rules:
- Use only what is visible in the supplied images (original + pixel-enhanced versions). Never invent letters and never complete what is not visible.
- Transliterate sign by sign, in reading order, using one "?" per sign you cannot identify, and separating groups you believe are words with a space. Collapsing an entire text into a single "?" is acceptable only when no individual sign can be delimited at all; when signs can be delimited, give the sequence even if most members are "?".
- Put "?" where a character is unreadable. Any proposed restoration goes in [ ] and is explicitly described as a restoration, not a visible character.
- If evidence is insufficient, set unreadable=true and write in note: "No reliable reading can be proposed from this image", with the reason and a request for better photographs (side lighting, steady camera, less glare).
- Never give numeric confidence values. Never infer date, authorship, or historical attribution from an image alone.
- Do not infer the language of the text from the script alone.
- References: never invent record numbers, titles, or URLs. Cite only from the provided source list; you may describe the type of comparable published material without claiming it matches the user's inscription. A similar published inscription is not a verified match — say so where relevant.
- Transliteration uses standard scholarly characters (ẓ ṯ ḏ ṣ ḍ ġ ḥ ʾ ʿ).
- Use current reference terminology: "Dadanitic", noting the older label "Lihyanite" only where useful.
- ${meaningLang}
Answer only with the requested JSON.`;
}

export const readingJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    script: { type: "string" },
    direction: { type: "string" },
    transliteration: { type: "string" },
    proposedReading: { type: "string" },
    wordSplit: { type: "string" },
    meaning: { type: "string" },
    uncertainties: { type: "string" },
    alternatives: { type: "string" },
    unreadable: { type: "boolean" },
    note: { type: "string" },
    references: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { title: { type: "string" }, url: { type: "string" } },
        required: ["title", "url"],
      },
    },
  },
  required: [
    "script",
    "direction",
    "transliteration",
    "proposedReading",
    "wordSplit",
    "meaning",
    "uncertainties",
    "alternatives",
    "unreadable",
    "note",
    "references",
  ],
} as const;
