/**
 * Server side of model training: reads the expert-approved examples of one
 * script, trains a prototype model on them, stores it as a candidate version
 * with its measured scores, and activates a version only when it has earned it.
 *
 * Training never touches unreviewed labels and never rewrites application code.
 */

import { approvedExemplars, publicClient } from "@/lib/glyph-dataset.server";
import {
  activationCheck,
  trainModel,
  type ModelClass,
  type ModelMetrics,
  type TrainedModel,
} from "@/lib/glyph-training";

type Row = {
  script: string;
  version: number;
  feature_version: number;
  classes: unknown;
  metrics: unknown;
  accuracy: number | null;
  macro_f1: number | null;
  trained_on: number;
  letters: number;
  status: string;
  provenance: string | null;
  created_at: string;
};

function toModel(r: Row): TrainedModel {
  return {
    script: r.script,
    version: r.version,
    featureVersion: r.feature_version,
    classes: (r.classes ?? []) as ModelClass[],
    metrics: (r.metrics ?? {}) as ModelMetrics,
    accuracy: r.accuracy,
    macroF1: r.macro_f1,
    trainedOn: r.trained_on,
    letters: r.letters,
    status: r.status as TrainedModel["status"],
    provenance: r.provenance,
    createdAt: r.created_at,
  };
}

/** The model the app is allowed to use for this script, if one is active. */
export async function activeModel(script: string): Promise<TrainedModel | null> {
  const supabase = publicClient();
  const res = await supabase
    .from("glyph_models")
    .select(
      "script, version, feature_version, classes, metrics, accuracy, macro_f1, trained_on, letters, status, provenance, created_at",
    )
    .eq("script", script)
    .eq("status", "active")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (res.error) {
    console.error("active model read failed", res.error.message);
    return null;
  }
  return res.data ? toModel(res.data as Row) : null;
}

/** Every stored version of one script's model, newest first (admin view). */
export async function listModels(script: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const res = await supabaseAdmin
    .from("glyph_models")
    .select(
      "id, script, version, feature_version, metrics, accuracy, macro_f1, trained_on, letters, status, provenance, created_at, activated_at",
    )
    .eq("script", script)
    .order("version", { ascending: false })
    .limit(50);
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

export type TrainOutcome =
  | { ok: false; state: "insufficient_data"; message: string; approved: number }
  | {
      ok: true;
      state: "trained";
      version: number;
      accuracy: number | null;
      macroF1: number | null;
      letters: number;
      trainedOn: number;
      metrics: ModelMetrics;
      eligible: boolean;
      reasons: string[];
    };

/** Trains a new candidate version for one script from its approved examples. */
export async function trainScript(script: string, provenance?: string): Promise<TrainOutcome> {
  const exemplars = await approvedExemplars(script);
  const result = trainModel(exemplars, 1);
  if (result.insufficient)
    return {
      ok: false,
      state: "insufficient_data",
      approved: exemplars.length,
      message:
        `Training needs at least two letters with 5 approved examples each. This script currently has ` +
        `${exemplars.length} approved example(s), so no model was produced.`,
    };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const last = await supabaseAdmin
    .from("glyph_models")
    .select("version")
    .eq("script", script)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (last.data?.version ?? 0) + 1;

  const letters = result.classes.length;
  const check = activationCheck({
    accuracy: result.metrics.accuracy,
    letters,
    metrics: result.metrics,
  });

  const ins = await supabaseAdmin.from("glyph_models").insert({
    script,
    version,
    feature_version: result.featureVersion,
    classes: result.classes,
    metrics: result.metrics,
    accuracy: result.metrics.accuracy,
    macro_f1: result.metrics.macroF1,
    trained_on: result.trainedOn,
    letters,
    status: "candidate",
    provenance: provenance ?? null,
  });
  if (ins.error) throw new Error(ins.error.message);

  return {
    ok: true,
    state: "trained",
    version,
    accuracy: result.metrics.accuracy,
    macroF1: result.metrics.macroF1,
    letters,
    trainedOn: result.trainedOn,
    metrics: result.metrics,
    eligible: check.eligible,
    reasons: check.reasons,
  };
}

/** Activates one stored version, retiring the version it replaces. */
export async function activateVersion(script: string, version: number) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const row = await supabaseAdmin
    .from("glyph_models")
    .select("id, accuracy, letters, metrics")
    .eq("script", script)
    .eq("version", version)
    .maybeSingle();
  if (row.error) throw new Error(row.error.message);
  if (!row.data) return { ok: false as const, error: "That model version does not exist." };

  const check = activationCheck({
    accuracy: row.data.accuracy,
    letters: row.data.letters,
    metrics: (row.data.metrics ?? {}) as ModelMetrics,
  });
  if (!check.eligible)
    return {
      ok: false as const,
      error: `This version cannot be activated: it ${check.reasons.join("; and it ")}.`,
    };

  const retire = await supabaseAdmin
    .from("glyph_models")
    .update({ status: "retired" })
    .eq("script", script)
    .eq("status", "active");
  if (retire.error) throw new Error(retire.error.message);

  const upd = await supabaseAdmin
    .from("glyph_models")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", row.data.id);
  if (upd.error) throw new Error(upd.error.message);
  return { ok: true as const, version };
}

/** Takes the active model out of use, so the app stops naming letters. */
export async function retireActive(script: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const upd = await supabaseAdmin
    .from("glyph_models")
    .update({ status: "retired" })
    .eq("script", script)
    .eq("status", "active");
  if (upd.error) throw new Error(upd.error.message);
  return { ok: true as const };
}
