/**
 * Shared reading corrections.
 *
 * A correction a user submits is stored as `pending` and is invisible to
 * everyone else. Only after an expert reviewer approves it does it become
 * readable and start informing other people's readings and word evidence.
 * Approval never changes a machine reading by itself: an approved correction is
 * shown as human-supplied evidence, attributed to its source note.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SharedCorrection = {
  id: string;
  script: string;
  machineReading: string | null;
  correctedReading: string;
  word: string | null;
  meaningAr: string | null;
  reason: string | null;
  siglum: string | null;
  sourceNote: string | null;
  createdAt: string;
};

export type CorrectionInput = {
  script: string;
  machineReading?: string | undefined;
  correctedReading: string;
  word?: string | undefined;
  meaningAr?: string | undefined;
  reason?: string | undefined;
  siglum?: string | undefined;
  sourceNote?: string | undefined;
  permissionNote?: string | undefined;
};

export async function submitCorrection(input: CorrectionInput) {
  const { error, data } = await supabaseAdmin
    .from("reading_corrections")
    .insert({
      script: input.script,
      machine_reading: input.machineReading ?? null,
      corrected_reading: input.correctedReading,
      word: input.word ?? null,
      meaning_ar: input.meaningAr ?? null,
      reason: input.reason ?? null,
      siglum: input.siglum ?? null,
      source_note: input.sourceNote ?? null,
      permission_note: input.permissionNote ?? null,
      review_status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return data.id;
}

function map(r: {
  id: string;
  script: string;
  machine_reading: string | null;
  corrected_reading: string;
  word: string | null;
  meaning_ar: string | null;
  reason: string | null;
  siglum: string | null;
  source_note: string | null;
  created_at: string;
}): SharedCorrection {
  return {
    id: r.id,
    script: r.script,
    machineReading: r.machine_reading,
    correctedReading: r.corrected_reading,
    word: r.word,
    meaningAr: r.meaning_ar,
    reason: r.reason,
    siglum: r.siglum,
    sourceNote: r.source_note,
    createdAt: r.created_at,
  };
}

const COLS =
  "id, script, machine_reading, corrected_reading, word, meaning_ar, reason, siglum, source_note, created_at";

/** Approved corrections only — this is what the whole app is allowed to use. */
export async function approvedCorrections(
  script?: string,
  limit = 50,
): Promise<SharedCorrection[]> {
  let q = supabaseAdmin
    .from("reading_corrections")
    .select(COLS)
    .eq("review_status", "approved")
    .order("reviewed_at", { ascending: false })
    .limit(limit);
  if (script && script !== "auto" && script !== "other") q = q.eq("script", script);
  const { data, error } = await q;
  if (error) {
    console.error("approved corrections read failed", error.message);
    return [];
  }
  return (data ?? []).map(map);
}

/** Approved corrections that mention one of these words, for word evidence. */
export async function correctionsForWords(
  words: string[],
): Promise<Record<string, SharedCorrection[]>> {
  const wanted = words.map((w) => w.toLowerCase()).filter(Boolean);
  if (!wanted.length) return {};
  const { data, error } = await supabaseAdmin
    .from("reading_corrections")
    .select(COLS)
    .eq("review_status", "approved")
    .not("word", "is", null)
    .limit(500);
  if (error) {
    console.error("word corrections read failed", error.message);
    return {};
  }
  const out: Record<string, SharedCorrection[]> = {};
  for (const row of data ?? []) {
    const w = (row.word ?? "").toLowerCase();
    if (!wanted.includes(w)) continue;
    (out[w] ??= []).push(map(row));
  }
  return out;
}

export async function listCorrections(status: "pending" | "approved" | "rejected") {
  const { data, error } = await supabaseAdmin
    .from("reading_corrections")
    .select(`${COLS}, permission_note, review_status, reviewer_note, reviewed_at`)
    .eq("review_status", status)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    ...map(r),
    permissionNote: r.permission_note,
    reviewStatus: r.review_status,
    reviewerNote: r.reviewer_note,
    reviewedAt: r.reviewed_at,
  }));
}

export async function reviewCorrection(
  id: string,
  decision: "approved" | "rejected",
  reviewerNote?: string,
) {
  const { error } = await supabaseAdmin
    .from("reading_corrections")
    .update({
      review_status: decision,
      reviewer_note: reviewerNote ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function correctionCounts() {
  const counts: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const s of Object.keys(counts)) {
    const { count } = await supabaseAdmin
      .from("reading_corrections")
      .select("id", { count: "exact", head: true })
      .eq("review_status", s);
    counts[s] = count ?? 0;
  }
  return counts;
}
