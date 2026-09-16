/**
 * Evidence retrieval for the research assistant.
 *
 * Two distinct, real sources:
 *  - Internal: the imported published-inscription corpus, the permitted
 *    research documents uploaded by an administrator (searched per page), and
 *    the uploaded alphabet pack (reference data only, not a trained model).
 *  - External: OpenAlex and Crossref, two open scholarly metadata APIs that
 *    need no key. Only what those APIs actually return is used; titles,
 *    authors, DOIs and abstracts are never composed here.
 *
 * Nothing in this module invents a reference, a page number or a quotation.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ALPHABET_PACK, MUSNAD_SCRIPT, THAMUDIC_SCRIPT, lettersOf } from "@/lib/alphabet-pack";
import { findParallels } from "@/lib/reference-search.server";

export type EvidenceKind = "corpus" | "document" | "alphabet" | "web";

/** How much of the source was actually retrieved — never overstated. */
export type EvidenceDepth = "record" | "page_text" | "abstract" | "metadata_only";

export type Evidence = {
  id: string;
  kind: EvidenceKind;
  title: string;
  authors: string | null;
  year: number | null;
  url: string | null;
  page: number | null;
  license: string | null;
  depth: EvidenceDepth;
  content: string;
};

export type RetrievalReport = {
  evidence: Evidence[];
  notes: string[];
  externalSearched: boolean;
};

const clip = (s: string, n = 900) => (s.length > n ? `${s.slice(0, n)}…` : s);

/* ------------------------------- internal -------------------------------- */

async function corpusEvidence(query: string, script: string): Promise<Evidence[]> {
  if (!query.trim()) return [];
  try {
    const { parallels } = await findParallels(query, script, 6);
    return parallels.map((p, i) => ({
      id: `corpus-${i + 1}`,
      kind: "corpus" as const,
      title: `${p.siglum}${p.site ? ` — ${p.site}` : ""}`,
      authors: null,
      year: null,
      url: p.url,
      page: null,
      license: p.source,
      depth: "record" as const,
      content: [
        p.script ? `script: ${p.script}` : "",
        p.language ? `language: ${p.language}` : "",
        p.transliteration ? `published transliteration: ${p.transliteration}` : "",
        p.translation ? `published translation: ${p.translation}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    }));
  } catch (err) {
    console.error("corpus retrieval failed", err);
    return [];
  }
}

/** Common words that would match almost every page and drown the ranking. */
const STOP = new Set([
  "the",
  "and",
  "for",
  "from",
  "with",
  "that",
  "this",
  "which",
  "what",
  "who",
  "whom",
  "how",
  "are",
  "was",
  "were",
  "has",
  "have",
  "had",
  "its",
  "their",
  "about",
  "into",
  "over",
  "under",
  "between",
  "been",
  "does",
  "did",
  "can",
  "could",
  "would",
  "should",
  "any",
  "all",
  "also",
  "not",
  "but",
  "you",
  "your",
  "our",
  "when",
  "where",
  "why",
  "there",
  "here",
  "them",
  "they",
  "these",
  "those",
  "such",
  "more",
  "most",
  "other",
  "than",
  "then",
  "some",
  "only",
  "one",
  "two",
  "three",
  "record",
  "recorded",
  "inscription",
  "inscriptions",
  "please",
  "tell",
  "في",
  "من",
  "على",
  "عن",
  "إلى",
  "التي",
  "الذي",
  "هذه",
  "هذا",
  "هل",
  "ما",
  "ماذا",
  "كيف",
  "هي",
  "هو",
  "كان",
  "مع",
  "أو",
  "و",
  "بين",
  "حول",
  "أهم",
  "يمكن",
]);

/** websearch_to_tsquery ANDs every word, so a natural question matches nothing.
 *  Search instead on the significant terms, joined with OR, ranked by relevance. */
function searchTerms(query: string): string {
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}ʾʿ\s'-]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
  const unique = [...new Set(words)].slice(0, 10);
  return unique.join(" or ");
}

async function documentEvidence(query: string): Promise<Evidence[]> {
  const q = searchTerms(query);
  if (q.length < 3) return [];
  try {
    const { data, error } = await supabaseAdmin.rpc("search_research_pages", {
      _q: q,
      _limit: 6,
    });
    if (error) {
      console.error("document retrieval failed", error.message);
      return [];
    }
    type Row = {
      document_id: string;
      title: string;
      authors: string | null;
      year: number | null;
      source_url: string | null;
      license: string;
      page: number;
      snippet: string;
    };
    return ((data ?? []) as Row[]).map((r, i) => ({
      id: `doc-${i + 1}`,
      kind: "document" as const,
      title: r.title,
      authors: r.authors,
      year: r.year,
      url: r.source_url,
      page: r.page,
      license: r.license,
      depth: "page_text" as const,
      content: clip(r.snippet.replace(/\s+/g, " ").trim()),
    }));
  } catch (err) {
    console.error("document retrieval failed", err);
    return [];
  }
}

function alphabetEvidence(): Evidence {
  const musnad = lettersOf(ALPHABET_PACK, MUSNAD_SCRIPT);
  const thamudic = lettersOf(ALPHABET_PACK, THAMUDIC_SCRIPT);
  return {
    id: "alphabet-pack",
    kind: "alphabet",
    title: "Athar alphabet pack (uploaded reference sheets)",
    authors: null,
    year: null,
    url: null,
    page: null,
    license: "uploaded by the project owner",
    depth: "record",
    content: [
      `Old South Arabian (Musnad) rows: ${musnad.length}, each with a reference-image region and the Unicode character supplied in the pack.`,
      `Thamudic source-table rows: ${thamudic.length}, kept as ordered source-row tokens with reference-image regions; the pack supplies no Unicode mapping for them.`,
      "This pack is reference imagery and row metadata. It is not a trained OCR model and contains no letter classifier. Letter values that the pack does not supply must be reported as unknown.",
    ].join("\n"),
  };
}

/* ------------------------------- external -------------------------------- */

async function getJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AtharResearchApp/1.0 (archaeology research assistant)",
      },
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function abstractFromInverted(index: unknown): string | null {
  if (!index || typeof index !== "object") return null;
  const words: { pos: number; w: string }[] = [];
  for (const [w, positions] of Object.entries(index as Record<string, number[]>)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) words.push({ pos: p, w });
  }
  if (words.length === 0) return null;
  words.sort((a, b) => a.pos - b.pos);
  return clip(words.map((x) => x.w).join(" "));
}

async function openAlex(query: string, offset: number): Promise<Evidence[]> {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=4&mailto=athar-app@example.org`;
  const json = (await getJson(url)) as {
    results?: {
      display_name?: string;
      publication_year?: number;
      doi?: string | null;
      authorships?: { author?: { display_name?: string } }[];
      primary_location?: { landing_page_url?: string | null; source?: { display_name?: string } };
      best_oa_location?: { pdf_url?: string | null; landing_page_url?: string | null };
      abstract_inverted_index?: unknown;
    }[];
  } | null;
  const results = json?.results ?? [];
  return results
    .filter((r) => r.display_name)
    .map((r, i) => {
      const abstract = abstractFromInverted(r.abstract_inverted_index);
      const link =
        r.best_oa_location?.pdf_url ??
        r.best_oa_location?.landing_page_url ??
        r.primary_location?.landing_page_url ??
        r.doi ??
        null;
      return {
        id: `web-${offset + i + 1}`,
        kind: "web" as const,
        title: r.display_name!,
        authors:
          r.authorships
            ?.map((a) => a.author?.display_name)
            .filter(Boolean)
            .slice(0, 4)
            .join(", ") || null,
        year: r.publication_year ?? null,
        url: link,
        page: null,
        license: r.primary_location?.source?.display_name ?? "OpenAlex record",
        depth: abstract ? ("abstract" as const) : ("metadata_only" as const),
        content:
          abstract ??
          "Only bibliographic metadata was returned; no abstract or full text was retrieved.",
      };
    });
}

async function crossref(query: string, offset: number): Promise<Evidence[]> {
  const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(
    query,
  )}&rows=3&select=title,author,issued,URL,abstract,container-title`;
  const json = (await getJson(url)) as {
    message?: {
      items?: {
        title?: string[];
        author?: { given?: string; family?: string }[];
        issued?: { "date-parts"?: number[][] };
        URL?: string;
        abstract?: string;
        "container-title"?: string[];
      }[];
    };
  } | null;
  const items = json?.message?.items ?? [];
  return items
    .filter((it) => it.title?.[0])
    .map((it, i) => {
      const abstract = it.abstract
        ? clip(
            it.abstract
              .replace(/<[^>]+>/g, " ")
              .replace(/\s+/g, " ")
              .trim(),
          )
        : null;
      return {
        id: `web-${offset + i + 1}`,
        kind: "web" as const,
        title: it.title![0]!,
        authors:
          it.author
            ?.map((a) => [a.given, a.family].filter(Boolean).join(" "))
            .filter(Boolean)
            .slice(0, 4)
            .join(", ") || null,
        year: it.issued?.["date-parts"]?.[0]?.[0] ?? null,
        url: it.URL ?? null,
        page: null,
        license: it["container-title"]?.[0] ?? "Crossref record",
        depth: abstract ? ("abstract" as const) : ("metadata_only" as const),
        content:
          abstract ??
          "Only bibliographic metadata was returned; no abstract or full text was retrieved.",
      };
    });
}

/* ------------------------------ orchestration ---------------------------- */

export async function retrieveEvidence(opts: {
  /** The user's question or the transliteration being researched. */
  query: string;
  /** Extra Arabic query terms, when the question is in Arabic. */
  arabicQuery?: string | undefined;
  script: string;
  /** Detailed mode also searches the external scholarly APIs. */
  external: boolean;
}): Promise<RetrievalReport> {
  const notes: string[] = [];
  const [corpus, docs] = await Promise.all([
    corpusEvidence(opts.query, opts.script),
    documentEvidence(opts.query),
  ]);

  let web: Evidence[] = [];
  if (opts.external) {
    const scriptTerm =
      opts.script === "auto" || opts.script === "other" ? "Ancient North Arabian" : opts.script;
    const queries = [`${opts.query} ${scriptTerm} inscription`, opts.arabicQuery ?? ""].filter(
      (q) => q.trim().length > 2,
    );
    const batches = await Promise.all([
      openAlex(queries[0]!, 0),
      queries[1] ? openAlex(queries[1], 8) : Promise.resolve([]),
      crossref(queries[0]!, 16),
    ]);
    const seen = new Set<string>();
    web = batches.flat().filter((e) => {
      const key = e.title.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (web.length === 0)
      notes.push("The external scholarly search returned no matching publication for this query.");
  }

  if (docs.length === 0)
    notes.push(
      "No permitted research document in the internal library matches this query. An administrator can upload licensed PDFs to make page-level evidence available.",
    );
  if (corpus.length === 0)
    notes.push("No published inscription record in the imported corpus contains these forms.");

  return {
    evidence: [...docs, ...corpus, alphabetEvidence(), ...web],
    notes,
    externalSearched: opts.external,
  };
}
