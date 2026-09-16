import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/integrations/supabase/types";
import { requireApproved } from "@/lib/access.server";

export const Route = createFileRoute("/api/references/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const supabase = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
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

        const { data, error } = await supabase
          .from("reference_collections")
          .select("source, version, records, license_note, source_url")
          .order("imported_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (error)
          return Response.json(
            { ok: false, error: "The reference library status could not be read." },
            { status: 502, headers: { "cache-control": "no-store" } },
          );

        return Response.json(
          {
            ok: true,
            collection: data
              ? {
                  source: data.source,
                  version: data.version,
                  records: data.records,
                  licenseNote: data.license_note ?? undefined,
                  sourceUrl: data.source_url ?? undefined,
                }
              : null,
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
