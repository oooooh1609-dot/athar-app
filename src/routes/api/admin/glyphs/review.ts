/**
 * Expert review queue for submitted letter labels, and the accuracy measurement
 * of the matcher. Approving a label is what adds it to the shared dataset.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdmin } from "@/lib/athar-auth.server";
import { approvedExemplars, evaluateLeaveOneOut } from "@/lib/glyph-dataset.server";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), script: z.string().max(40).optional() }),
  z.object({
    action: z.literal("decide"),
    ids: z.array(z.string().uuid()).min(1).max(200),
    decision: z.enum(["approved", "rejected"]),
  }),
  z.object({ action: z.literal("evaluate"), script: z.string().max(40) }),
]);

export const Route = createFileRoute("/api/admin/glyphs/review")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await requireAdmin(request)))
          return Response.json(
            { ok: false, error: "Administrator sign-in required." },
            { status: 401 },
          );

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const body = parsed.data;

        if (body.action === "list") {
          let q = supabaseAdmin
            .from("glyph_exemplars")
            .select("id, script, letter, transliteration, provenance, notes, created_at")
            .eq("review_status", "pending")
            .order("created_at", { ascending: true })
            .limit(200);
          if (body.script) q = q.eq("script", body.script);
          const res = await q;
          if (res.error)
            return Response.json({ ok: false, error: res.error.message }, { status: 502 });
          return Response.json({ ok: true, pending: res.data ?? [] });
        }

        if (body.action === "decide") {
          const upd = await supabaseAdmin
            .from("glyph_exemplars")
            .update({ review_status: body.decision, reviewed_at: new Date().toISOString() })
            .in("id", body.ids);
          if (upd.error)
            return Response.json({ ok: false, error: upd.error.message }, { status: 502 });
          return Response.json({ ok: true, updated: body.ids.length, decision: body.decision });
        }

        const exemplars = await approvedExemplars(body.script);
        if (exemplars.length < 10)
          return Response.json({
            ok: true,
            state: "insufficient_data",
            message: `Only ${exemplars.length} approved example(s) for ${body.script}. At least 10 are needed before accuracy can be measured.`,
          });

        const result = evaluateLeaveOneOut(exemplars);
        const letters = new Set(exemplars.map((e) => e.letter)).size;
        const ins = await supabaseAdmin.from("glyph_eval_runs").insert({
          script: body.script,
          feature_version: 1,
          exemplars: result.total,
          letters,
          accuracy: result.accuracy,
          per_letter: result.perLetter,
          method: "leave-one-out 1-nn cosine",
        });
        if (ins.error)
          return Response.json({ ok: false, error: ins.error.message }, { status: 502 });

        return Response.json({
          ok: true,
          state: "measured",
          accuracy: result.accuracy,
          exemplars: result.total,
          letters,
          perLetter: result.perLetter,
        });
      },
    },
  },
});
