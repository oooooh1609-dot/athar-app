/**
 * Submitting a reading correction, and reading the approved ones.
 *
 * A submission is stored as pending and is not visible to anyone else until an
 * expert reviewer approves it in the administrator page.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { approvedCorrections, submitCorrection } from "@/lib/corrections.server";
import { requireApproved } from "@/lib/access.server";

const Submit = z.object({
  action: z.literal("submit"),
  script: z.enum(["thamudic", "dadanitic", "nabataean", "musnad", "other", "auto"]),
  machineReading: z.string().max(2000).optional(),
  correctedReading: z.string().min(1).max(2000),
  word: z.string().max(40).optional(),
  meaningAr: z.string().max(400).optional(),
  reason: z.string().max(1000).optional(),
  siglum: z.string().max(60).optional(),
  sourceNote: z.string().max(600).optional(),
  permissionNote: z.string().max(600).optional(),
  consent: z.literal(true),
});

const Body = z.union([
  Submit,
  z.object({
    action: z.literal("approved"),
    script: z.string().max(40).optional(),
  }),
]);

export const Route = createFileRoute("/api/corrections")({
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
                "Invalid request. A correction needs the corrected reading and explicit consent to share it.",
            },
            { status: 400 },
          );

        try {
          if (parsed.data.action === "approved") {
            const items = await approvedCorrections(parsed.data.script);
            return Response.json({ ok: true, items });
          }

          const { consent: _consent, ...input } = parsed.data;
          const id = await submitCorrection(input);
          return Response.json({
            ok: true,
            id,
            status: "pending",
            note: "Stored for expert review. It stays private and does not affect other people's readings until it is approved.",
          });
        } catch (err) {
          console.error("corrections endpoint failed", err);
          return Response.json(
            { ok: false, error: "Could not store the correction." },
            { status: 500 },
          );
        }
      },
    },
  },
});
