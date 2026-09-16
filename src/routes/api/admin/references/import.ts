import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdmin } from "@/lib/athar-auth.server";
import { OCIANA_COLLECTION, fetchRecords } from "@/lib/reference-import.server";

const Input = z.object({
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(100).max(8000).default(4000),
});

export const Route = createFileRoute("/api/admin/references/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const admin = await requireAdmin(request);
        if (!admin)
          return Response.json(
            { ok: false, error: "Administrator sign-in required." },
            { status: 401 },
          );

        const json = (body: unknown, status = 200) =>
          Response.json(body, { status, headers: { "cache-control": "no-store" } });

        const parsed = Input.safeParse(await request.json().catch(() => ({})));
        if (!parsed.success) return json({ ok: false, error: "Invalid import request." }, 400);
        const { offset, limit } = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        try {
          const existing = await supabaseAdmin
            .from("reference_collections")
            .select("id")
            .eq("source", OCIANA_COLLECTION.source)
            .eq("version", OCIANA_COLLECTION.version)
            .maybeSingle();

          let collectionId = existing.data?.id ?? null;
          if (!collectionId) {
            const created = await supabaseAdmin
              .from("reference_collections")
              .insert({
                source: OCIANA_COLLECTION.source,
                version: OCIANA_COLLECTION.version,
                license_note: OCIANA_COLLECTION.licenseNote,
                source_url: OCIANA_COLLECTION.landingUrl,
              })
              .select("id")
              .single();
            if (created.error) throw new Error(created.error.message);
            collectionId = created.data.id;
          }

          const { records, nextOffset, done } = await fetchRecords(offset, limit);

          // The corpus repeats a few sigla; Postgres rejects a batch that hits the
          // same conflict target twice, so keep the last record per siglum.
          const bySiglum = new Map<string, (typeof records)[number]>();
          for (const r of records) bySiglum.set(r.siglum, r);
          const unique = [...bySiglum.values()];

          for (let i = 0; i < unique.length; i += 500) {
            const slice = unique
              .slice(i, i + 500)
              .map((r) => ({ ...r, collection_id: collectionId }));
            const up = await supabaseAdmin
              .from("reference_inscriptions")
              .upsert(slice, { onConflict: "source,siglum" });
            if (up.error) throw new Error(up.error.message);
          }

          const count = await supabaseAdmin
            .from("reference_inscriptions")
            .select("id", { count: "exact", head: true })
            .eq("source", OCIANA_COLLECTION.source);

          const total = count.count ?? 0;
          await supabaseAdmin
            .from("reference_collections")
            .update({ records: total })
            .eq("id", collectionId);

          return json({
            ok: true,
            imported: unique.length,
            nextOffset,
            done,
            total,
            source: OCIANA_COLLECTION.source,
            version: OCIANA_COLLECTION.version,
          });
        } catch (err) {
          console.error("reference import failed", err);
          return json(
            {
              ok: false,
              error:
                err instanceof Error
                  ? `Import failed: ${err.message}`
                  : "Import failed for an unknown reason.",
            },
            502,
          );
        }
      },
    },
  },
});
