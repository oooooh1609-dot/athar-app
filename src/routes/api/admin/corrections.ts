/** Expert review of submitted reading corrections. Administrator only. */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdmin } from "@/lib/athar-auth.server";
import { correctionCounts, listCorrections, reviewCorrection } from "@/lib/corrections.server";

const Body = z.union([
  z.object({
    action: z.literal("list"),
    status: z.enum(["pending", "approved", "rejected"]).default("pending"),
  }),
  z.object({
    action: z.literal("review"),
    id: z.string().uuid(),
    decision: z.enum(["approved", "rejected"]),
    reviewerNote: z.string().max(600).optional(),
  }),
]);

export const Route = createFileRoute("/api/admin/corrections")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await requireAdmin(request)))
          return Response.json({ ok: false, error: "Not signed in." }, { status: 401 });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });

        try {
          if (parsed.data.action === "list") {
            const items = await listCorrections(parsed.data.status);
            return Response.json({ ok: true, items, counts: await correctionCounts() });
          }
          await reviewCorrection(parsed.data.id, parsed.data.decision, parsed.data.reviewerNote);
          return Response.json({ ok: true, counts: await correctionCounts() });
        } catch (err) {
          console.error("admin corrections failed", err);
          return Response.json({ ok: false, error: "Request failed." }, { status: 500 });
        }
      },
    },
  },
});
