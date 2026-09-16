/**
 * The trained letter model the app may use for one script. Only an activated
 * version is served; with none the app says training data is still required and
 * leaves every detected sign unnamed.
 */

import { createFileRoute } from "@tanstack/react-router";

import { datasetStats } from "@/lib/glyph-dataset.server";
import { activeModel } from "@/lib/glyph-train.server";
import { requireApproved } from "@/lib/access.server";

export const Route = createFileRoute("/api/glyphs/model")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const script = new URL(request.url).searchParams.get("script") ?? "thamudic";
        const [model, stats] = await Promise.all([activeModel(script), datasetStats(script)]);
        return Response.json(
          {
            ok: true,
            script,
            model,
            stats,
            state: model ? "active" : "training_data_required",
          },
          { headers: { "cache-control": "no-store" } },
        );
      },
    },
  },
});
