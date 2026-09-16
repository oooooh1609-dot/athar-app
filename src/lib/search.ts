/**
 * Search across saved projects.
 *
 * Everything runs on the device against the local store — no query is sent
 * anywhere. That is not only a privacy choice: the projects only exist
 * locally, so there is nothing on a server to search.
 *
 * The work is almost entirely in normalisation, because three scripts meet
 * here and a naive `includes()` fails on all of them:
 *
 *  - **Arabic.** "مُحَمَّد" and "محمد" are the same word to a reader and
 *    different strings to a computer. Diacritics, tatweel, and the alif and
 *    ya families all have to be folded, or a recorder who typed a hamza
 *    cannot find their own note.
 *  - **Epigraphic transliteration.** Ancient South Arabian is written with
 *    ḏ, ṯ, ṣ, ḍ, ṭ, ẓ, ġ, ḫ, ḥ, and the ʾ and ʿ markers. Nobody types those
 *    on a field tablet, so "hdr" must find "ḥḏr".
 *  - **Arabic-Indic digits.** ٢٠٢٦ and 2026 are the same year.
 */

import type { AtharProject } from "./athar-db";

/* ————————————————— normalisation ————————————————— */

const ARABIC_DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g;
const TATWEEL = /\u0640/g;

/** Latin letters used in epigraphic transliteration, folded to plain ASCII. */
const TRANSLIT_FOLD: Record<string, string> = {
  ā: "a",
  ă: "a",
  â: "a",
  ē: "e",
  ê: "e",
  ī: "i",
  î: "i",
  ō: "o",
  ô: "o",
  ū: "u",
  û: "u",
  ḏ: "d",
  ḍ: "d",
  ḑ: "d",
  ṯ: "t",
  ṭ: "t",
  ṱ: "t",
  ṣ: "s",
  š: "s",
  ś: "s",
  ş: "s",
  ẓ: "z",
  ż: "z",
  ž: "z",
  ḥ: "h",
  ḫ: "h",
  ẖ: "h",
  ḩ: "h",
  ġ: "g",
  ǧ: "g",
  ğ: "g",
  ḳ: "k",
  q̄: "q",
  ṇ: "n",
  ṅ: "n",
  ṛ: "r",
  ḷ: "l",
  ẉ: "w",
  ʾ: "",
  ʿ: "",
  ʼ: "",
  ʽ: "",
  ʹ: "",
  ˀ: "",
  ˁ: "",
};

const ARABIC_FOLD: Record<string, string> = {
  أ: "ا",
  إ: "ا",
  آ: "ا",
  ٱ: "ا",
  ٲ: "ا",
  ٳ: "ا",
  ى: "ي",
  ئ: "ي",
  ؤ: "و",
  ة: "ه",
  ک: "ك",
  ګ: "ك",
  ی: "ي",
  ء: "",
};

/**
 * Superscript and subscript digits, dropped entirely.
 *
 * Ancient South Arabian transliteration distinguishes three sibilants as
 * s¹ s² s³. The distinction is real and is preserved in the stored text — but
 * nobody can type a superscript on a field tablet, so for *searching* they
 * fold to a plain s and "slm" finds "s¹lm".
 */
const SUPERSCRIPTS = /[\u00B2\u00B3\u00B9\u2070-\u209C]/g;

/** Arabic-Indic and extended Arabic-Indic digits to ASCII. */
const foldDigits = (s: string) =>
  s.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });

/**
 * Folds a string to its searchable form.
 *
 * Order matters: NFD first so a composed ḥ and a decomposed h+dot both reach
 * the same place, then strip the combining marks, then fold what is left.
 */
export function normalise(input: string): string {
  let s = input.normalize("NFD");
  // Combining marks left over from NFD, plus Arabic vowel signs.
  s = s
    .replace(/[\u0300-\u036F]/g, "")
    .replace(ARABIC_DIACRITICS, "")
    .replace(TATWEEL, "")
    .replace(SUPERSCRIPTS, "");
  s = foldDigits(s).toLowerCase();
  let out = "";
  for (const ch of s) out += TRANSLIT_FOLD[ch] ?? ARABIC_FOLD[ch] ?? ch;
  // Collapse punctuation and runs of whitespace to single spaces.
  return out.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

export const tokenise = (input: string): string[] => normalise(input).split(" ").filter(Boolean);

/* ————————————————— matching ————————————————— */

export type SearchHit = {
  project: AtharProject;
  score: number;
  /** Which fields matched, for showing the user why. */
  fields: string[];
};

type Field = { name: string; text: string; weight: number };

/**
 * Weights reflect what a recorder actually remembers. The name of a project
 * is what comes to mind first; a transliteration buried in a machine
 * suggestion is the weakest signal that it is the right record.
 */
function fieldsOf(p: AtharProject): Field[] {
  const f: Field[] = [
    { name: "name", text: p.name, weight: 10 },
    { name: "notes", text: p.notes, weight: 4 },
  ];
  const r = p.machineReading;
  if (r) {
    f.push({ name: "transliteration", text: r.transliteration, weight: 6 });
    f.push({ name: "reading", text: r.proposedReading, weight: 6 });
    f.push({ name: "meaning", text: r.meaning, weight: 3 });
    f.push({ name: "script", text: r.script, weight: 2 });
  }
  for (const v of p.versions) if (v.text) f.push({ name: "correction", text: v.text, weight: 5 });
  for (const a of p.annotations) f.push({ name: "annotation", text: a.label, weight: 3 });
  if (p.composition) {
    f.push({ name: "composition", text: p.composition.text, weight: 6 });
    f.push({ name: "composition", text: p.composition.transliteration, weight: 5 });
  }
  return f.filter((x) => x.text && x.text.trim());
}

/**
 * Scores one field against one query token.
 *
 * A whole-word hit outranks a prefix, which outranks a hit in the middle of
 * a word — "hdr" should rank a project called "Hdr stone" above one whose
 * notes happen to contain "shdrq".
 */
function scoreToken(haystack: string, token: string): number {
  const idx = haystack.indexOf(token);
  if (idx === -1) return 0;
  const before = idx === 0 ? " " : haystack[idx - 1];
  const after = haystack[idx + token.length] ?? " ";
  if (before === " " && after === " ") return 3;
  if (before === " ") return 2;
  return 1;
}

/**
 * Ranked results. Every query token must appear somewhere in the record, so
 * adding a word narrows the results rather than widening them.
 */
export function searchProjects(projects: AtharProject[], query: string): SearchHit[] {
  const tokens = tokenise(query);
  if (tokens.length === 0) return [];

  const hits: SearchHit[] = [];
  for (const project of projects) {
    const fields = fieldsOf(project).map((f) => ({ ...f, norm: normalise(f.text) }));
    let total = 0;
    const matched = new Set<string>();

    for (const token of tokens) {
      let best = 0;
      let bestField = "";
      for (const f of fields) {
        const s = scoreToken(f.norm, token) * f.weight;
        if (s > best) {
          best = s;
          bestField = f.name;
        }
      }
      if (best === 0) {
        total = 0;
        break;
      }
      total += best;
      matched.add(bestField);
    }

    if (total > 0) {
      // A gentle recency nudge, enough to separate otherwise equal records
      // without letting a new project outrank a genuinely better match.
      const ageDays = (Date.now() - project.createdAt) / 86_400_000;
      total += Math.max(0, 2 - ageDays / 30);
      hits.push({ project, score: total, fields: [...matched] });
    }
  }

  return hits.sort((a, b) => b.score - a.score || b.project.createdAt - a.project.createdAt);
}

/** Short extract around the first match, for the result list. */
export function excerpt(text: string, query: string, radius = 40): string {
  const tokens = tokenise(query);
  const norm = normalise(text);
  let at = -1;
  for (const t of tokens) {
    const i = norm.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return text.slice(0, radius * 2).trim();
  // Normalisation can shift offsets, so this is an approximation that is
  // close enough to put the match on screen rather than a guarantee.
  const start = Math.max(0, at - radius);
  const end = Math.min(text.length, at + radius * 2);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}
