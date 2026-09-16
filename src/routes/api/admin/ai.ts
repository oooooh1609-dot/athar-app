/** Administrator view of the configured AI provider, models and usage. */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { aiSettings, usageThisMonth } from "@/lib/ask.server";
import { requireAdmin } from "@/lib/athar-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Update = z.object({
  action: z.literal("update"),
  quickModel: z.string().min(3).max(80),
  detailedModel: z.string().min(3).max(80),
  monthlyCallLimit: z.number().int().min(0).max(100000),
  enabled: z.boolean(),
});

const Body = z.union([z.object({ action: z.literal("status") }), Update]);

export const Route = createFileRoute("/api/admin/ai")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await requireAdmin(request)))
          return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });

        if (parsed.data.action === "update") {
          const { error } = await supabaseAdmin
            .from("ai_settings")
            .update({
              quick_model: parsed.data.quickModel,
              detailed_model: parsed.data.detailedModel,
              monthly_call_limit: parsed.data.monthlyCallLimit,
              enabled: parsed.data.enabled,
              updated_at: new Date().toISOString(),
            })
            .eq("id", true);
          if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        }

        const settings = await aiSettings();
        const used = await usageThisMonth();

        const docs = await supabaseAdmin
          .from("research_documents")
          .select("id, title, authors, year, license, page_count, source_url")
          .order("created_at", { ascending: false })
          .limit(50);

        const recent = await supabaseAdmin
          .from("ai_usage")
          .select("mode, model, status, had_image, created_at")
          .order("created_at", { ascending: false })
          .limit(10);

        return Response.json({
          ok: true,
          provider: "Lovable AI Gateway (Responses API)",
          credentialPresent: Boolean(process.env["LOVABLE_API_KEY"]),
          externalSearch: [
            { name: "OpenAlex", keyRequired: false, available: true },
            { name: "Crossref", keyRequired: false, available: true },
          ],
          settings,
          usage: { callsThisMonth: used, limit: settings.monthlyCallLimit },
          documents: docs.data ?? [],
          recent: recent ?? [],
        });
      },
    },
  },
});
