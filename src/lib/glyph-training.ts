/**
 * Training and inference for the letter-shape model.
 *
 * The model is a per-letter shape prototype (a centroid of the L2-normalised
 * shape descriptors produced by glyph-kernels.js) with a per-letter acceptance
 * threshold learned from held-out folds. It is deliberately simple, fully
 * inspectable and small enough to ship to the browser, and it is trained ONLY on
 * expert-approved examples that came from documented photographs.
 *
 * What it is not: it is not a neural network, it does not learn from unreviewed
 * user data, and its similarity values are not calibrated probabilities. When a
 * detected sign does not clear its letter's learned threshold, the letter stays
 * "?" — the model never fills a gap by guessing.
 */

import type { Exemplar } from "@/lib/glyph-model";

export type ModelClass = {
  letter: string;
  transliteration: string | null;
  /** Mean of the L2-normalised descriptors of this letter's approved examples. */
  centroid: number[];
  /** Approved examples behind this prototype. */
  count: number;
  /** Similarity a detected sign must reach before this letter may be named. */
  threshold: number;
  /** Cross-validated per-letter scores, or null when the letter was untestable. */
  precision: number | null;
  recall: number | null;
};

export type ModelMetrics = {
  folds: number;
  evaluated: number;
  accuracy: number | null;
  macroF1: number | null;
  /** Held-out signs that cleared no threshold; abstention is a wanted outcome. */
  abstained: number;
  perLetter: {
    letter: string;
    support: number;
    correct: number;
    precision: number | null;
    recall: number | null;
    f1: number | null;
  }[];
};

export type TrainedModel = {
  script: string;
  version: number;
  featureVersion: number;
  classes: ModelClass[];
  metrics: ModelMetrics;
  accuracy: number | null;
  macroF1: number | null;
  trainedOn: number;
  letters: number;
  status: "candidate" | "active" | "retired";
  provenance: string | null;
  createdAt: string | null;
};

/** Approved examples a letter needs before it becomes a class of the model. */
export const MIN_EXAMPLES_PER_CLASS = 5;
/** Similarity floor: no learned threshold is ever allowed below this. */
export const MIN_CLASS_THRESHOLD = 0.82;
/** Accuracy a candidate model must reach before it may be activated. */
export const MIN_ACTIVATION_ACCURACY = 0.6;
/** Letters a candidate model must cover before it may be activated. */
export const MIN_ACTIVATION_LETTERS = 8;

function l2(v: number[]) {
  let n = 0;
  for (const x of v) n += x * x;
  const d = Math.sqrt(n);
  if (!d) return v.slice();
  return v.map((x) => x / d);
}

export function cosine(a: number[], b: number[]) {
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

function centroid(rows: number[][]) {
  const dim = rows[0]?.length ?? 0;
  const acc = new Array<number>(dim).fill(0);
  for (const r of rows) {
    const u = l2(r);
    for (let i = 0; i < dim; i++) acc[i] = (acc[i] ?? 0) + (u[i] ?? 0);
  }
  return l2(acc.map((x) => x / Math.max(1, rows.length)));
}

type Grouped = Map<string, { transliteration: string | null; rows: number[][] }>;

function group(exemplars: Exemplar[]): Grouped {
  const g: Grouped = new Map();
  for (const e of exemplars) {
    if (!e.features?.length) continue;
    const cur = g.get(e.letter);
    if (cur) {
      cur.rows.push(e.features);
      if (!cur.transliteration && e.transliteration) cur.transliteration = e.transliteration;
    } else {
      g.set(e.letter, { transliteration: e.transliteration, rows: [e.features] });
    }
  }
  return g;
}

/** Deterministic shuffle so a retrain on the same data yields the same folds. */
function ordered(n: number, seed: number) {
  const idx = [...Array(n).keys()];
  let s = seed || 1;
  for (let i = n - 1; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    const tmp = idx[i]!;
    idx[i] = idx[j]!;
    idx[j] = tmp;
  }
  return idx;
}

type Prototype = { letter: string; transliteration: string | null; centroid: number[] };

function nearest(features: number[], protos: Prototype[]) {
  let best: { p: Prototype; s: number } | null = null;
  for (const p of protos) {
    const s = cosine(features, p.centroid);
    if (!best || s > best.s) best = { p, s };
  }
  return best;
}

/**
 * Trains a prototype model on approved examples and measures it with stratified
 * k-fold cross-validation. Thresholds come from the held-out folds, so they are
 * not fitted on the same rows they gate.
 */
export function trainModel(exemplars: Exemplar[], featureVersion = 1) {
  const grouped = group(exemplars);
  const usable = [...grouped.entries()].filter(([, v]) => v.rows.length >= MIN_EXAMPLES_PER_CLASS);
  if (usable.length < 2) {
    return {
      classes: [] as ModelClass[],
      metrics: {
        folds: 0,
        evaluated: 0,
        accuracy: null,
        macroF1: null,
        abstained: 0,
        perLetter: [],
      } as ModelMetrics,
      trainedOn: 0,
      featureVersion,
      insufficient: true as const,
    };
  }

  const folds = Math.min(5, Math.min(...usable.map(([, v]) => v.rows.length)));
  // Stratified assignment: each letter's rows are spread over the folds.
  const assign = new Map<string, number[]>();
  for (const [letter, v] of usable) {
    const order = ordered(v.rows.length, letter.length * 7919 + v.rows.length);
    const f = new Array<number>(v.rows.length).fill(0);
    order.forEach((rowIdx, k) => {
      f[rowIdx] = k % folds;
    });
    assign.set(letter, f);
  }

  const stat = new Map<string, { support: number; correct: number; predicted: number }>();
  for (const [letter] of usable) stat.set(letter, { support: 0, correct: 0, predicted: 0 });
  // Held-out similarities of each letter's own rows to its own prototype.
  const ownSims = new Map<string, number[]>();
  let evaluated = 0;
  let correct = 0;

  for (let fold = 0; fold < folds; fold++) {
    const protos: Prototype[] = [];
    for (const [letter, v] of usable) {
      const f = assign.get(letter)!;
      const rows = v.rows.filter((_, i) => f[i] !== fold);
      if (rows.length === 0) continue;
      protos.push({ letter, transliteration: v.transliteration, centroid: centroid(rows) });
    }
    if (protos.length < 2) continue;

    for (const [letter, v] of usable) {
      const f = assign.get(letter)!;
      v.rows.forEach((row, i) => {
        if (f[i] !== fold) return;
        const hit = nearest(row, protos);
        if (!hit) return;
        evaluated += 1;
        const rec = stat.get(letter)!;
        rec.support += 1;
        const pred = stat.get(hit.p.letter);
        if (pred) pred.predicted += 1;
        if (hit.p.letter === letter) {
          rec.correct += 1;
          correct += 1;
        }
        const own = protos.find((p) => p.letter === letter);
        if (own) {
          const list = ownSims.get(letter) ?? [];
          list.push(cosine(row, own.centroid));
          ownSims.set(letter, list);
        }
      });
    }
  }

  const perLetter = [...usable].map(([letter]) => {
    const r = stat.get(letter)!;
    const precision = r.predicted ? r.correct / r.predicted : null;
    const recall = r.support ? r.correct / r.support : null;
    const f1 =
      precision !== null && recall !== null && precision + recall > 0
        ? (2 * precision * recall) / (precision + recall)
        : null;
    return { letter, support: r.support, correct: r.correct, precision, recall, f1 };
  });

  const f1s = perLetter.map((p) => p.f1).filter((x): x is number => x !== null);
  const metrics: ModelMetrics = {
    folds,
    evaluated,
    accuracy: evaluated ? correct / evaluated : null,
    macroF1: f1s.length ? f1s.reduce((a, b) => a + b, 0) / f1s.length : null,
    abstained: 0,
    perLetter: perLetter.sort((a, b) => b.support - a.support),
  };

  const classes: ModelClass[] = usable.map(([letter, v]) => {
    const sims = (ownSims.get(letter) ?? []).slice().sort((a, b) => a - b);
    // Threshold = 10th percentile of held-out own-prototype similarity, so about
    // nine in ten genuine examples of this letter clear it; never below the floor.
    const q = sims.length ? (sims[Math.floor(sims.length * 0.1)] ?? sims[0]!) : 1;
    const scores = perLetter.find((p) => p.letter === letter);
    return {
      letter,
      transliteration: v.transliteration,
      centroid: centroid(v.rows),
      count: v.rows.length,
      threshold: Math.max(MIN_CLASS_THRESHOLD, Number(q.toFixed(4))),
      precision: scores?.precision ?? null,
      recall: scores?.recall ?? null,
    };
  });

  const abstained = countAbstentions(usable, assign, folds, classes);
  metrics.abstained = abstained;

  return {
    classes,
    metrics,
    trainedOn: usable.reduce((n, [, v]) => n + v.rows.length, 0),
    featureVersion,
    insufficient: false as const,
  };
}

/** How many held-out rows the learned thresholds would leave unnamed. */
function countAbstentions(
  usable: [string, { transliteration: string | null; rows: number[][] }][],
  assign: Map<string, number[]>,
  folds: number,
  classes: ModelClass[],
) {
  let abstained = 0;
  for (const [letter, v] of usable) {
    const f = assign.get(letter)!;
    v.rows.forEach((row, i) => {
      if (folds && f[i] === undefined) return;
      const hit = nearest(
        row,
        classes.map((c) => ({
          letter: c.letter,
          transliteration: c.transliteration,
          centroid: c.centroid,
        })),
      );
      const th = classes.find((c) => c.letter === hit?.p.letter)?.threshold ?? 1;
      if (!hit || hit.s < th) abstained += 1;
    });
  }
  return abstained;
}

export type ModelPrediction =
  | { state: "no_model" }
  | { state: "abstain"; best: number; bestLetter: string | null }
  | {
      state: "named";
      letter: string;
      transliteration: string | null;
      similarity: number;
      margin: number;
      runnerUp: string | null;
    };

/** Names one detected sign with the trained model, or abstains. */
export function predictWithModel(features: number[], model: TrainedModel | null): ModelPrediction {
  if (!model || model.classes.length < 2) return { state: "no_model" };
  const scored = model.classes
    .map((c) => ({ c, s: cosine(features, c.centroid) }))
    .sort((a, b) => b.s - a.s);
  const top = scored[0];
  if (!top) return { state: "no_model" };
  if (top.s < top.c.threshold) return { state: "abstain", best: top.s, bestLetter: top.c.letter };
  return {
    state: "named",
    letter: top.c.letter,
    transliteration: top.c.transliteration,
    similarity: top.s,
    margin: top.s - (scored[1]?.s ?? 0),
    runnerUp: scored[1]?.c.letter ?? null,
  };
}

/** Sequence string for a whole detection: "?" wherever the model abstained. */
export function modelTransliteration(preds: ModelPrediction[]) {
  return preds.map((p) => (p.state === "named" ? (p.transliteration ?? p.letter) : "?")).join(" ");
}

/** Whether a candidate model has earned activation, and why not when it has not. */
export function activationCheck(m: {
  accuracy: number | null;
  letters: number;
  metrics: ModelMetrics;
}) {
  const reasons: string[] = [];
  if (m.letters < MIN_ACTIVATION_LETTERS)
    reasons.push(
      `covers ${m.letters} letter(s); ${MIN_ACTIVATION_LETTERS} are required before activation`,
    );
  if (m.accuracy === null) reasons.push("could not be cross-validated, so its accuracy is unknown");
  else if (m.accuracy < MIN_ACTIVATION_ACCURACY)
    reasons.push(
      `cross-validated accuracy is ${(m.accuracy * 100).toFixed(1)}%, below the ${(
        MIN_ACTIVATION_ACCURACY * 100
      ).toFixed(0)}% required`,
    );
  return { eligible: reasons.length === 0, reasons };
}

export type Guess = { letter: string; transliteration: string | null; similarity: number };

/**
 * Ranked nearest letters for one sign, ignoring the acceptance thresholds.
 *
 * This is the "worn sign" estimate: it always returns the closest letters, even
 * when none of them is close enough to be named. The values are raw shape
 * similarities, not confidence, and a low-similarity estimate is a guess about a
 * damaged shape — never a reading. Display it as such, and keep the accepted
 * reading in predictWithModel, which abstains.
 */
export function bestGuesses(features: number[], model: TrainedModel | null, top = 3): Guess[] {
  if (!model || model.classes.length === 0) return [];
  return model.classes
    .map((c) => ({
      letter: c.letter,
      transliteration: c.transliteration,
      similarity: cosine(features, c.centroid),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.max(1, top));
}

/** How much weight a raw shape similarity deserves, in plain words. */
export function guessStrength(similarity: number) {
  if (similarity >= 0.95) return "very close shape match";
  if (similarity >= 0.9) return "close shape match";
  if (similarity >= 0.82) return "loose shape match";
  if (similarity >= 0.7) return "weak — treat as a guess about a worn sign";
  return "no real resemblance — the sign is probably too damaged or is not in the trained set";
}

/**
 * A line of best guesses for every sign, for the worn-sign estimate view.
 * Guesses below `floor` are rendered as "?" because they carry no information.
 */
export function guessLine(guesses: Guess[][], floor = 0.7) {
  return guesses
    .map((g) => {
      const top = g[0];
      if (!top || top.similarity < floor) return "?";
      const label = top.transliteration ?? top.letter;
      return top.similarity >= MIN_CLASS_THRESHOLD ? label : `(${label})`;
    })
    .join(" ");
}
