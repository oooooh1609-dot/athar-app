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
