/**
 * Approved, human-labelled letter examples for one script, plus the current
 * dataset state. The browser matches detected shapes against these locally.
 */

import { createFileRoute } from "@tanstack/react-router";

import { approvedExemplars, datasetStats } from "@/lib/glyph-dataset.server";
import { requireApproved } from "@/lib/access.server";

export const Route = createFileRoute("/api/glyphs/exemplars")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const script = new URL(request.url).searchParams.get("script") ?? "thamudic";
        const [exemplars, stats] = await Promise.all([
          approvedExemplars(script),
          datasetStats(script),
        ]);
        return Response.json(
          { ok: true, script, featureVersion: 1, exemplars, stats },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
