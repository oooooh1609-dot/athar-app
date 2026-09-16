/** The documented, openly licensed photographs behind the letter training set. */

import { createFileRoute } from "@tanstack/react-router";

import { listCorpus } from "@/lib/corpus.server";
import { requireApproved } from "@/lib/access.server";

export const Route = createFileRoute("/api/corpus/images")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const script = new URL(request.url).searchParams.get("script");
        try {
          const images = await listCorpus(script ?? undefined);
          return Response.json({ ok: true, images }, { headers: { "cache-control": "no-store" } });
        } catch (err) {
          console.error("corpus list failed", err);
          return Response.json({ ok: false, error: "Could not read the corpus." }, { status: 502 });
        }
      },
    },
  },
});
