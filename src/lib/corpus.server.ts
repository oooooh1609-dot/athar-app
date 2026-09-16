/**
 * The curated corpus of openly licensed inscription photographs that the letter
 * model is trained on.
 *
 * Every entry records where the photograph came from and under which licence, so
 * each training example can be traced back to a real, citable image. Signs whose
 * letter cannot be identified are stored as "unknown" and are never used as
 * training examples — they only document that the sign exists.
 */

import { publicClient } from "@/lib/glyph-dataset.server";

export type { CorpusImage } from "@/lib/corpus-types";
import type { CorpusImage } from "@/lib/corpus-types";

const CORPUS_USER_AGENT =
  "AtharCorpus/1.0 (inscription reading study app; contact via the app operator)";

const COLUMNS =
  "id, title, siglum, script, image_url, source_url, license, credit, notes, labelled_signs, unknown_signs, created_at";

export async function listCorpus(script?: string) {
  const supabase = publicClient();
  let q = supabase.from("corpus_images").select(COLUMNS).order("created_at", { ascending: false });
  if (script) q = q.eq("script", script);
  const res = await q.limit(200);
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []) as CorpusImage[];
}

export async function addCorpusImage(input: {
  title: string;
  siglum?: string | undefined;
  script: string;
  imageUrl: string;
  sourceUrl?: string | undefined;
  license: string;
  credit?: string | undefined;
  notes?: string | undefined;
}) {
  // A photograph is only accepted if it can actually be fetched, so the corpus
  // never holds entries that cannot be labelled later.
  // Image hosts such as Wikimedia refuse anonymous automated requests, so every
  // outbound fetch identifies this app and how to reach its operator.
  let head: Response;
  try {
    head = await fetch(input.imageUrl, {
      method: "GET",
      headers: { range: "bytes=0-1023", "user-agent": CORPUS_USER_AGENT, accept: "image/*" },
    });
  } catch {
    return { ok: false as const, error: "That image link could not be fetched from the server." };
  }
  if (!head.ok) return { ok: false as const, error: `The image link returned ${head.status}.` };
  const type = head.headers.get("content-type") ?? "";
  if (!type.startsWith("image/"))
    return {
      ok: false as const,
      error: `That link is not an image (server sent ${type || "no type"}).`,
    };

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ins = await supabaseAdmin
    .from("corpus_images")
    .insert({
      title: input.title,
      siglum: input.siglum ?? null,
      script: input.script,
      image_url: input.imageUrl,
      source_url: input.sourceUrl ?? null,
      license: input.license,
      credit: input.credit ?? null,
      notes: input.notes ?? null,
    })
    .select(COLUMNS)
    .maybeSingle();
  if (ins.error)
    return {
      ok: false as const,
      error: ins.error.message.includes("duplicate")
        ? "That image link is already in the corpus."
        : ins.error.message,
    };
  return { ok: true as const, image: ins.data as CorpusImage };
}

export async function deleteCorpusImage(id: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const del = await supabaseAdmin.from("corpus_images").delete().eq("id", id);
  if (del.error) throw new Error(del.error.message);
  return { ok: true as const };
}

export type SignLabel = {
  letter: string;
  transliteration?: string | undefined;
  features: number[];
  bbox: { x: number; y: number; w: number; h: number };
  unknown: boolean;
};

/**
 * Stores signs labelled on one corpus photograph. Named letters go in as
 * approved training examples; signs marked unknown are recorded but excluded
 * from training.
 */
export async function saveCorpusLabels(imageId: string, signs: SignLabel[]) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const img = await supabaseAdmin
    .from("corpus_images")
    .select("id, script, siglum, title, source_url, license, labelled_signs, unknown_signs")
    .eq("id", imageId)
    .maybeSingle();
  if (img.error) throw new Error(img.error.message);
  if (!img.data) return { ok: false as const, error: "That photograph is not in the corpus." };

  const provenance = [img.data.siglum, img.data.title, img.data.source_url, img.data.license]
    .filter(Boolean)
    .join(" · ");

  const rows = signs.map((s) => ({
    script: img.data!.script,
    letter: s.unknown ? "unknown" : s.letter,
    transliteration: s.unknown ? null : (s.transliteration ?? null),
    features: s.features,
    source: "curated_corpus",
    provenance,
    corpus_image_id: imageId,
    bbox: s.bbox,
    unknown_sign: s.unknown,
    // Unknown signs are documented, never trained on.
    review_status: s.unknown ? "rejected" : "approved",
    reviewed_at: new Date().toISOString(),
  }));

  const ins = await supabaseAdmin.from("glyph_exemplars").insert(rows);
  if (ins.error) throw new Error(ins.error.message);

  const named = signs.filter((s) => !s.unknown).length;
  const unknown = signs.length - named;
  const upd = await supabaseAdmin
    .from("corpus_images")
    .update({
      labelled_signs: (img.data.labelled_signs ?? 0) + named,
      unknown_signs: (img.data.unknown_signs ?? 0) + unknown,
    })
    .eq("id", imageId);
  if (upd.error) throw new Error(upd.error.message);

  return { ok: true as const, named, unknown };
}

/** Streams a corpus photograph through the app so its pixels can be read here. */
export async function proxyCorpusImage(id: string) {
  const supabase = publicClient();
  const row = await supabase.from("corpus_images").select("image_url").eq("id", id).maybeSingle();
  if (row.error || !row.data) return new Response("Not found", { status: 404 });
  const res = await fetch(row.data.image_url, {
    headers: { "user-agent": CORPUS_USER_AGENT, accept: "image/*" },
  });
  if (!res.ok) return new Response(`Source returned ${res.status}`, { status: 502 });
  const type = res.headers.get("content-type") ?? "image/jpeg";
  return new Response(res.body, {
    headers: { "content-type": type, "cache-control": "public, max-age=3600" },
  });
}
