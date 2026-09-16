/** Real counts and the last measured accuracy for each script's training dataset. */

import { createFileRoute } from "@tanstack/react-router";

import { SCRIPTS, datasetStats } from "@/lib/glyph-dataset.server";
import { requireApproved } from "@/lib/access.server";

export const Route = createFileRoute("/api/glyphs/dataset")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const stats = await Promise.all(SCRIPTS.map((s) => datasetStats(s)));
        return Response.json({ ok: true, stats }, { headers: { "cache-control": "no-store" } });
      },
    },
  },
});
