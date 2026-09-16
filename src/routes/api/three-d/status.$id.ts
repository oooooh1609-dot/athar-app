import { createFileRoute } from "@tanstack/react-router";

import { requireApproved } from "@/lib/access.server";
import { anyWorkerOnline, jobForOwner, signedModelUrl } from "@/lib/recon.server";

export const Route = createFileRoute("/api/three-d/status/$id")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const headers = { "cache-control": "no-store" };
        const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
        const ownerKey = gate.account?.userId ?? "administrator";

        const row = await jobForOwner(params.id, ownerKey);
        if (!row) return json({ ok: false, configured: true, error: "Job not found." }, 404);

        const workerOnline = await anyWorkerOnline();
        const modelUrl = row.model_path ? await signedModelUrl(row.model_path) : null;
        const formats: Record<string, string> = {};
        for (const [fmt, path] of Object.entries(row.formats ?? {})) {
          const url = await signedModelUrl(path);
          if (url) formats[fmt] = url;
        }

        return json({
          ok: true,
          configured: true,
          workerOnline,
          job: {
            status: row.status,
            stage:
              row.status === "queued" && !workerOnline
                ? "Processing computer offline — job stays queued"
                : row.stage,
            progress: row.progress,
            photoCount: row.photo_count,
            attempts: row.attempts,
            error: row.error,
            log: row.log,
            createdAt: row.created_at,
            ...(modelUrl ? { modelUrl } : {}),
            formats,
          },
        });
      },
    },
  },
});
