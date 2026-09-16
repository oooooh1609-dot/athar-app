/**
 * Retrains the Thamudic reading model from the 27 supplied chart glyphs,
 * including photographic-condition variants (raking light, cast shadow, rock
 * texture, cracks, blur, low contrast, wear) produced by
 * scripts/make-thamudic-variants.py.
 *
 * It reports two honest numbers before touching the active model:
 *   1. how the clean-only model scores on the degraded images (robustness now)
 *   2. cross-validated accuracy of the retrained model on everything
 *
 * Run: bun --env-file=.env scripts/train-thamudic.ts [--write] [--activate]
 */
import { readFileSync } from "node:fs";

import { segmentGlyphs } from "@/lib/glyph-kernels.js";
import { trainModel, predictWithModel, type TrainedModel } from "@/lib/glyph-training";
import type { Exemplar } from "@/lib/glyph-model";

const DIR = "/tmp/thamudic-variants";
const PROVENANCE =
  "AD.pdf Thamudic chart supplied by the project owner (glyph pack 3.0); " +
  "geometric variants plus photographic-condition variants (raking light, cast shadow, " +
  "rock texture, cracks, blur, low contrast, surface wear) rendered from the printed glyph image";

type Row = { id: string; label: string; group: string; variant: string; features: number[] };

type ManifestEntry = {
  id: string;
  label: string;
  group: string;
  variant: string;
  file: string;
  width: number;
  height: number;
};

function extract(): Row[] {
  const manifest: ManifestEntry[] = JSON.parse(readFileSync(`${DIR}/manifest.json`, "utf8"));
  const rows: Row[] = [];
  let skipped = 0;
  for (const m of manifest) {
    const buf = readFileSync(`${DIR}/${m.file}`);
    const rgba = new Uint8ClampedArray(buf.buffer, buf.byteOffset, buf.byteLength);
    const seg = segmentGlyphs(rgba, m.width, m.height, { direction: "ltr" });
    // One glyph per image. If the pipeline breaks the sign into pieces the
    // vector would describe a fragment, not the letter, so the image is skipped
    // rather than stored under a label it does not show.
    const total = seg.glyphs.reduce((s, g) => s + g.area, 0);
    const best = [...seg.glyphs].sort((a, b) => b.area - a.area)[0];
    if (!best || best.area < total * 0.85) {
      skipped += 1;
      continue;
    }
    rows.push({
      id: m.id,
      label: m.label,
      group: m.group,
      variant: m.variant,
      features: best.features,
    });
  }
  console.log(`extracted ${rows.length} feature vectors (${skipped} images yielded no candidate)`);
  return rows;
}

function asExemplars(rows: Row[]): Exemplar[] {
  return rows.map((r) => ({ letter: r.id, transliteration: null, features: r.features }));
}

function scoreAgainst(model: TrainedModel, rows: Row[]) {
  let named = 0;
  let correct = 0;
  let abstained = 0;
  for (const r of rows) {
    const p = predictWithModel(r.features, model);
    if (p.kind === "letter") {
      named += 1;
      if (p.letter === r.id) correct += 1;
    } else abstained += 1;
  }
  return {
    named,
    abstained,
    correct,
    precision: named ? correct / named : null,
    recall: rows.length ? correct / rows.length : null,
  };
}

function toModel(result: ReturnType<typeof trainModel>): TrainedModel {
  return {
    id: "local",
    script: "thamudic",
    version: 0,
    featureVersion: result.featureVersion,
    classes: result.classes,
    metrics: result.metrics,
  } as TrainedModel;
}

const rows = extract();
const clean = rows.filter((r) => r.group === "clean");
const degraded = rows.filter((r) => r.group === "degraded");

const cleanOnly = trainModel(asExemplars(clean), 1);
console.log("clean-only CV:", {
  accuracy: cleanOnly.metrics.accuracy,
  macroF1: cleanOnly.metrics.macroF1,
  letters: cleanOnly.classes.length,
});
console.log("clean-only model on degraded images:", scoreAgainst(toModel(cleanOnly), degraded));

const all = trainModel(asExemplars(rows), 1);
console.log("clean+degraded CV:", {
  accuracy: all.metrics.accuracy,
  macroF1: all.metrics.macroF1,
  letters: all.classes.length,
  trainedOn: all.trainedOn,
  abstained: all.metrics.abstained,
});

// Held-out check: train on clean + half the degraded variants, test on the rest.
const heldVariants = new Set(["cast_shadow", "cracks", "wear", "shadow_cracks"]);
const trainSplit = rows.filter((r) => r.group === "clean" || !heldVariants.has(r.variant));
const testSplit = rows.filter((r) => r.group === "degraded" && heldVariants.has(r.variant));
const split = trainModel(asExemplars(trainSplit), 1);
console.log(
  "trained with light degradations, tested on unseen shadow/crack/wear images:",
  scoreAgainst(toModel(split), testSplit),
);

if (process.argv.includes("--write")) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const del = await supabaseAdmin
    .from("glyph_exemplars")
    .delete()
    .eq("script", "thamudic")
    .eq("source", "chart_reference");
  if (del.error) throw new Error(del.error.message);
  const payload = rows.map((r) => ({
    script: "thamudic",
    letter: r.id,
    transliteration: null,
    features: r.features,
    feature_version: 1,
    source: "chart_reference",
    provenance: PROVENANCE,
    notes: `${r.group}/${r.variant}`,
    review_status: "approved" as const,
  }));
  for (let i = 0; i < payload.length; i += 100) {
    const ins = await supabaseAdmin.from("glyph_exemplars").insert(payload.slice(i, i + 100));
    if (ins.error) throw new Error(ins.error.message);
  }
  console.log(`stored ${payload.length} approved chart examples`);

  const { trainScript, activateVersion } = await import("@/lib/glyph-train.server");
  const outcome = await trainScript("thamudic", PROVENANCE);
  console.log("trainScript:", outcome);
  if (outcome.ok && outcome.eligible && process.argv.includes("--activate")) {
    console.log("activate:", await activateVersion("thamudic", outcome.version));
  }
}
