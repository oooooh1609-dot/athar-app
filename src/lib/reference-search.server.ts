/** Server-side retrieval of published inscriptions that resemble a reading. */

import { supabase } from "@/integrations/supabase/client";
import { plainForm } from "@/lib/reference-import.server";

export type Parallel = {
  siglum: string;
  script: string | null;
  language: string | null;
  transliteration: string | null;
  translation: string | null;
  site: string | null;
  url: string | null;
  source: string;
  similarity: number;
};

function publicClient() {
  return supabase;
}

/** Maps the app's script choice to the script labels used in the corpus. */
const SCRIPT_FILTER: Record<string, string | null> = {
  auto: null,
  other: null,
  thamudic: "Thamudic",
  dadanitic: "Dadanitic",
  nabataean: "Nabataean",
};

export async function findParallels(
  transliteration: string,
  script: string,
  limit = 5,
): Promise<{
  parallels: Parallel[];
  collection: { source: string; version: string; records: number } | null;
}> {
  const q = plainForm(transliteration);
  const supabase = publicClient();

  const collectionRow = await supabase
    .from("reference_collections")
    .select("source, version, records")
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const collection = collectionRow.data ?? null;

  if (!q || !collection || collection.records === 0) return { parallels: [], collection };

  const filter = SCRIPT_FILTER[script] ?? null;
  const run = async (scriptFilter: string | null) =>
    supabase.rpc("search_reference_inscriptions", {
      _q: q,
      ...(scriptFilter ? { _script: scriptFilter } : {}),
      _limit: limit,
    });

  let res = await run(filter);
  if (!res.error && (res.data?.length ?? 0) === 0 && filter) res = await run(null);
  if (res.error) {
    console.error("reference search failed", res.error.message);
    return { parallels: [], collection };
  }

  return { parallels: (res.data ?? []) as Parallel[], collection };
}
