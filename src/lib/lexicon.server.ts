/**
 * Word-level evidence for "Search Meaning".
 *
 * Every gloss shown to the user is grounded in the imported published-inscription
 * corpus: for each word of the user's transliteration we retrieve real records
 * whose own editors published a transliteration and a translation. The Arabic
 * text is a machine rendering of those published English translations — never an
 * invented meaning, and never a dictionary entry, because no lexicon API is
 * connected.
 */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { plainForm } from "@/lib/reference-import.server";

export type WordExample = {
  siglum: string;
  script: string | null;
  transliteration: string | null;
  translation: string;
  translationAr: string | null;
  url: string | null;
};

export type WordEvidence = {
  token: string;
  occurrences: number;
  /** Arabic gloss derived only from the published translations below. */
  arabic: string | null;
  english: string | null;
  examples: WordExample[];
  /** Expert-approved corrections submitted by users, shown as human evidence. */
  expertNotes?: {
    meaningAr: string | null;
    correctedReading: string;
    siglum: string | null;
    sourceNote: string | null;
  }[];
};

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
          h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

/** Splits a reading into candidate words, dropping unread signs. */
export function tokenize(transliteration: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of transliteration.split(/[\s\n·،,;/|-]+/)) {
    const t = (plainForm(raw) ?? "").trim();
    if (!t || t.includes("?") || t.length > 12) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

const boundary = (haystack: string, token: string) => {
  const words = haystack.split(/[^a-z0-9ʾʿ¹²³ʼ']+/i);
  return words.some((w) => w === token);
};

/** Finds published records that actually contain each word. */
export async function wordEvidence(tokens: string[], script: string | null) {
  const supabase = publicClient();
  const results: WordEvidence[] = [];
  // Approved user corrections are shared knowledge; pending ones are never read.
  const { correctionsForWords } = await import("@/lib/corrections.server");
  const expert = await correctionsForWords(tokens).catch(() => ({}) as Record<string, never[]>);

  for (const token of tokens) {
    let query = supabase
      .from("reference_inscriptions")
      .select("siglum, script, transliteration, translation, url, transliteration_plain")
      .not("translation", "is", null)
      .ilike("transliteration_plain", `%${token}%`)
      .limit(60);
    // Corpus script labels carry subtypes ("Thamudic B", "Thamudic D"), so match
    // the family by prefix instead of requiring an exact label.
    if (script) query = query.ilike("script", `${script}%`);
    const res = await query;
    if (res.error) {
      console.error("word lookup failed", res.error.message);
      continue;
    }
    const hits = (res.data ?? []).filter((r) => boundary(r.transliteration_plain ?? "", token));
    const notes = (expert[token.toLowerCase()] ?? []).map((c) => ({
      meaningAr: c.meaningAr,
      correctedReading: c.correctedReading,
      siglum: c.siglum,
      sourceNote: c.sourceNote,
    }));
    results.push({
      token,
      occurrences: hits.length,
      ...(notes.length ? { expertNotes: notes } : {}),
      arabic: null,
      english: null,
      examples: hits.slice(0, 3).map((r) => ({
        siglum: r.siglum,
        script: r.script,
        transliteration: r.transliteration,
        translation: r.translation!,
        translationAr: null,
        url: r.url,
      })),
    });
  }
  return results;
}

const LANG_NAME: Record<string, string> = {
  ar: "Arabic",
  en: "English",
  fr: "French",
  zh: "Simplified Chinese",
};

const systemFor = (lang: string) => `You work with published Ancient North Arabian inscriptions.
You will receive words from a reading, and for each word REAL published records
(siglum, transliteration, and the editors' own English translation).

Rules, without exception:
- Use ONLY the supplied published translations as evidence. Never add outside knowledge,
  never invent a meaning, never guess a root.
- "ar" is a short gloss, in ${LANG_NAME[lang] ?? "English"}, of what the word denotes in those records
  (for example a personal name, a kinship term, a verb of a given sense).
  If the records do not make the word's sense clear, set "ar" to null.
- "en" mirrors "ar" in English, or null.
- For each record, "trAr" is a faithful ${LANG_NAME[lang] ?? "English"} rendering of that record's
  English translation. Do not embellish, complete, or interpret it.
- Reply with JSON only, no prose, no markdown fence.

Reply shape:
{"words":[{"token":"...","ar":"...|null","en":"...|null",
  "records":[{"siglum":"...","trAr":"..."}]}]}`;

/**
 * Adds glosses in the requested interface language plus a faithful rendering of
 * each published translation into that language. The published English text is
 * always preserved alongside; nothing is overwritten.
 */
export async function addArabic(
  words: WordEvidence[],
  lang: "ar" | "en" | "zh" | "fr" = "ar",
): Promise<{ words: WordEvidence[]; arabic: "ready" | "setup_required" | "failed" }> {
  const withEvidence = words.filter((w) => w.examples.length > 0);
  if (withEvidence.length === 0) return { words, arabic: "ready" };

  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return { words, arabic: "setup_required" };

  const payload = withEvidence.map((w) => ({
    token: w.token,
    records: w.examples.map((e) => ({
      siglum: e.siglum,
      transliteration: e.transliteration,
      translation: e.translation,
    })),
  }));

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: systemFor(lang) },
          { role: "user", content: JSON.stringify({ words: payload }) },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`arabic gloss failed [${res.status}]: ${await res.text()}`);
      return { words, arabic: "failed" };
    }
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return { words, arabic: "failed" };
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      words?: {
        token?: string;
        ar?: string | null;
        en?: string | null;
        records?: { siglum?: string; trAr?: string | null }[];
      }[];
    };

    const byToken = new Map((parsed.words ?? []).map((w) => [w.token ?? "", w]));
    const merged = words.map((w) => {
      const g = byToken.get(w.token);
      if (!g) return w;
      const recs = new Map((g.records ?? []).map((r) => [r.siglum ?? "", r.trAr ?? null]));
      return {
        ...w,
        arabic: g.ar ?? null,
        english: g.en ?? null,
        examples: w.examples.map((e) => ({ ...e, translationAr: recs.get(e.siglum) ?? null })),
      };
    });
    return { words: merged, arabic: "ready" };
  } catch (err) {
    console.error("arabic gloss error", err);
    return { words, arabic: "failed" };
  }
}

const REVISE_SYSTEM = `You are revising an assisted reading of an inscription using ONLY documented evidence
from a published corpus. You never see the image at this stage, so you may NOT change the letters.

You receive: the current reading fields, plus for each word of the reading the published records
that really contain that word (siglum, transliteration, the editors' translation).

Rules:
- Never change the transliteration, and never add, remove, or complete a letter.
- Revise "meaning" only where the supplied records support it, and cite the sigla you used in the text.
- Where the records support nothing, say plainly that the corpus offers no support for that part.
- Add to "uncertainties" any place where the records suggest a different word division or a rival word.
- A similar published record is never proof that this inscription says the same thing; keep that caveat.
- Never invent a record, a siglum, a translation, or a confidence number.
- "lexiconNote" is one or two sentences on what the corpus did and did not support.
- Reply with JSON only, no prose, no markdown fence:
{"meaning":"...","uncertainties":"...","lexiconNote":"...","citedSigla":["..."]}`;

/** Second analysis pass: grounds the meaning in corpus records for the read words. */
export async function reviseWithLexicon(
  reading: {
    script: string;
    transliteration: string;
    wordSplit: string;
    meaning: string;
    uncertainties: string;
  },
  words: WordEvidence[],
  lang: "ar" | "en" | "zh" | "fr",
): Promise<{
  meaning: string;
  uncertainties: string;
  lexiconNote: string;
  citedSigla: string[];
} | null> {
  const evidence = words.filter((w) => w.examples.length > 0);
  if (evidence.length === 0) return null;
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) return null;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          {
            role: "system",
            content: `${REVISE_SYSTEM}\nWrite "meaning", "uncertainties" and "lexiconNote" in ${
              {
                ar: "Modern Standard Arabic",
                en: "English",
                zh: "Simplified Chinese",
                fr: "French",
              }[lang] ?? "English"
            }.`,
          },
          {
            role: "user",
            content: JSON.stringify({
              reading,
              corpus: evidence.map((w) => ({
                word: w.token,
                occurrences: w.occurrences,
                records: w.examples.map((e) => ({
                  siglum: e.siglum,
                  script: e.script,
                  transliteration: e.transliteration,
                  translation: e.translation,
                })),
              })),
            }),
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`lexicon revision failed [${res.status}]: ${await res.text()}`);
      return null;
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = json.choices?.[0]?.message?.content ?? "";
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      meaning?: string;
      uncertainties?: string;
      lexiconNote?: string;
      citedSigla?: string[];
    };
    if (!parsed.meaning && !parsed.lexiconNote) return null;
    return {
      meaning: parsed.meaning ?? reading.meaning,
      uncertainties: parsed.uncertainties ?? reading.uncertainties,
      lexiconNote: parsed.lexiconNote ?? "",
      citedSigla: Array.isArray(parsed.citedSigla) ? parsed.citedSigla.slice(0, 20) : [],
    };
  } catch (err) {
    console.error("lexicon revision error", err);
    return null;
  }
}
