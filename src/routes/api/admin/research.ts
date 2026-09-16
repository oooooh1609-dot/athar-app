/**
 * Administrator management of the permitted research library.
 *
 * The browser extracts the text of each page from a PDF the administrator is
 * permitted to use and posts it here with its licence note, so the assistant can
 * cite a real page. No document is fetched or scraped by the server.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdmin } from "@/lib/athar-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Add = z.object({
  action: z.literal("add"),
  title: z.string().min(2).max(300),
  authors: z.string().max(300).optional(),
  year: z.number().int().min(1500).max(2100).optional(),
  publisher: z.string().max(200).optional(),
  sourceUrl: z.string().url().max(500).optional(),
  license: z.string().min(2).max(300),
  permissionNote: z.string().max(600).optional(),
  pages: z
    .array(z.object({ page: z.number().int().min(1), text: z.string().max(60000) }))
    .min(1)
    .max(1200),
});

const Body = z.union([
  Add,
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("delete"), id: z.string().uuid() }),
]);

export const Route = createFileRoute("/api/admin/research")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await requireAdmin(request)))
          return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
        const body = parsed.data;

        if (body.action === "delete") {
          const { error } = await supabaseAdmin
            .from("research_documents")
            .delete()
            .eq("id", body.id);
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        if (body.action === "add") {
          const pages = body.pages.filter((p) => p.text.trim().length > 20);
          if (pages.length === 0)
            return Response.json(
              {
                ok: false,
                error:
                  "No selectable text was found in that PDF. A scanned image-only PDF cannot be cited by page here.",
              },
              { status: 400 },
            );

          const doc = await supabaseAdmin
            .from("research_documents")
            .insert({
              title: body.title,
              authors: body.authors ?? null,
              year: body.year ?? null,
              publisher: body.publisher ?? null,
              source_url: body.sourceUrl ?? null,
              license: body.license,
              permission_note: body.permissionNote ?? null,
              page_count: pages.length,
            })
            .select("id")
            .single();
          if (doc.error || !doc.data)
            return Response.json(
              { ok: false, error: doc.error?.message ?? "Insert failed." },
              { status: 500 },
            );

          for (let i = 0; i < pages.length; i += 100) {
            const chunk = pages.slice(i, i + 100).map((p) => ({
              document_id: doc.data.id,
              page: p.page,
              text: p.text.slice(0, 60000),
            }));
            const { error } = await supabaseAdmin.from("research_pages").insert(chunk);
            if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
          }
        }

        const list = await supabaseAdmin
          .from("research_documents")
          .select("id, title, authors, year, license, page_count, source_url, created_at")
          .order("created_at", { ascending: false })
          .limit(100);

        return Response.json({ ok: true, documents: list.data ?? [] });
      },
    },
  },
});
