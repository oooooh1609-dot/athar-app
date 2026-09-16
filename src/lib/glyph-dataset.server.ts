/** Server-side access to the labelled-glyph dataset and its honest evaluation. */

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import type { DatasetStats, Exemplar } from "@/lib/glyph-model";

export const SCRIPTS = ["thamudic", "dadanitic", "nabataean", "other"] as const;
export type ScriptKey = (typeof SCRIPTS)[number];

export function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"]!;
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

export async function approvedExemplars(script: string): Promise<Exemplar[]> {
  const supabase = publicClient();
  const res = await supabase
    .from("glyph_exemplars")
    .select("letter, transliteration, features")
    .eq("script", script)
    .eq("review_status", "approved")
    .eq("feature_version", 1)
    .limit(4000);
  if (res.error) {
    console.error("exemplar read failed", res.error.message);
    return [];
  }
  return (res.data ?? []).map((r) => ({
    letter: r.letter,
    transliteration: r.transliteration,
    features: (r.features ?? []) as number[],
  }));
}

export async function datasetStats(script: string): Promise<DatasetStats> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const supabase = supabaseAdmin;
  // Aggregate counts only: unreviewed measurements are never exposed to the app.
  const counts = await supabase.rpc("glyph_dataset_counts", { _script: script });
  if (counts.error) console.error("dataset counts failed", counts.error.message);

  const perLetter = new Map<string, { approved: number; pending: number }>();
  let approved = 0;
  let pending = 0;
  for (const r of counts.data ?? []) {
    perLetter.set(r.letter, { approved: r.approved, pending: r.pending });
    approved += r.approved;
    pending += r.pending;
  }

  const evalRun = await supabase
    .from("glyph_eval_runs")
    .select("accuracy, exemplars, created_at")
    .eq("script", script)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const list = [...perLetter.entries()]
    .map(([letter, c]) => ({ letter, ...c }))
    .sort((a, b) => b.approved - a.approved || a.letter.localeCompare(b.letter));

  return {
    script,
    approved,
    pending,
    letters: list.filter((l) => l.approved > 0).length,
    lettersReady: list.filter((l) => l.approved >= 5).length,
    perLetter: list,
    accuracy: evalRun.data?.accuracy ?? null,
    evaluatedOn: evalRun.data?.exemplars ?? null,
    evaluatedAt: evalRun.data?.created_at ?? null,
  };
}

/** Leave-one-out 1-nearest-neighbour accuracy over the approved examples. */
export function evaluateLeaveOneOut(exemplars: Exemplar[]) {
  const per = new Map<string, { total: number; correct: number }>();
  let correct = 0;
  let total = 0;
  for (let i = 0; i < exemplars.length; i++) {
    const probe = exemplars[i]!;
    let bestS = -Infinity;
    let bestLetter: string | null = null;
    for (let j = 0; j < exemplars.length; j++) {
      if (i === j) continue;
      const other = exemplars[j]!;
      let dot = 0;
      let na = 0;
      let nb = 0;
      const n = Math.min(probe.features.length, other.features.length);
      for (let d = 0; d < n; d++) {
        const x = probe.features[d] ?? 0;
        const y = other.features[d] ?? 0;
        dot += x * y;
        na += x * x;
        nb += y * y;
      }
      const s = na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
      if (s > bestS) {
        bestS = s;
        bestLetter = other.letter;
      }
    }
    if (bestLetter === null) continue;
    total += 1;
    const rec = per.get(probe.letter) ?? { total: 0, correct: 0 };
    rec.total += 1;
    if (bestLetter === probe.letter) {
      rec.correct += 1;
      correct += 1;
    }
    per.set(probe.letter, rec);
  }
  return {
    total,
    accuracy: total ? correct / total : null,
    perLetter: Object.fromEntries(
      [...per.entries()].map(([letter, r]) => [
        letter,
        { total: r.total, correct: r.correct, accuracy: r.total ? r.correct / r.total : null },
      ]),
    ),
  };
}
