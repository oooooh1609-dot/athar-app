/**
 * Serves one corpus photograph through the app. External hosts do not allow
 * cross-origin pixel reads, so labelling needs the image to arrive from here.
 */

import { createFileRoute } from "@tanstack/react-router";

import { proxyCorpusImage } from "@/lib/corpus.server";
import { requireApproved } from "@/lib/access.server";

export const Route = createFileRoute("/api/corpus/image")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const id = new URL(request.url).searchParams.get("id");
        if (!id) return new Response("Missing id", { status: 400 });
        try {
          return await proxyCorpusImage(id);
        } catch (err) {
          console.error("corpus image proxy failed", err);
          return new Response("Could not fetch that photograph", { status: 502 });
        }
      },
    },
  },
});
