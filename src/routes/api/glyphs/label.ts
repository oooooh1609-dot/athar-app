/**
 * Submits a human label for one detected sign. Every submission is stored as
 * pending: it only reaches the shared dataset after an expert approves it, and
 * it never changes application code or an existing reading.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { FEATURE_DIM } from "@/lib/glyph-kernels.js";
import { requireApproved } from "@/lib/access.server";

const Body = z.object({
  script: z.enum(["thamudic", "dadanitic", "nabataean", "other"]),
  letter: z.string().trim().min(1).max(24),
  transliteration: z.string().trim().max(24).optional(),
  features: z.array(z.number()).length(FEATURE_DIM),
  provenance: z.string().trim().max(400).optional(),
  notes: z.string().trim().max(600).optional(),
  appVersion: z.string().trim().max(40).optional(),
  consent: z.literal(true),
});

export const Route = createFileRoute("/api/glyphs/label")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json(
            {
              ok: false,
              error:
                "Invalid label. A shape measurement of the detected sign, a letter name and explicit consent to share it are required.",
            },
            { status: 400 },
          );

        const d = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ins = await supabaseAdmin.from("glyph_exemplars").insert({
          script: d.script,
          letter: d.letter,
          transliteration: d.transliteration ?? null,
          features: d.features,
          feature_version: 1,
          source: "user_label",
          provenance: d.provenance ?? null,
          notes: d.notes ?? null,
          app_version: d.appVersion ?? null,
          review_status: "pending",
        });
        if (ins.error) {
          console.error("glyph label insert failed", ins.error.message);
          return Response.json({ ok: false, error: "Could not store the label." }, { status: 502 });
        }
        return Response.json({
          ok: true,
          state: "pending_review",
          message:
            "Label stored and queued for expert review. It is not used for matching until it is approved.",
        });
      },
    },
  },
});
