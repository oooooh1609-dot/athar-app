import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireApproved } from "@/lib/access.server";
import { anyWorkerOnline, cancelJob, createJob, listJobs } from "@/lib/recon.server";

/**
 * Reconstruction jobs, processed by a self-hosted Meshroom/AliceVision worker.
 * No paid reconstruction API is used: photographs go to this project's private
 * storage and wait in the queue until the administrator's own computer picks
 * them up.
 */

const Body = z.union([
  z.object({
    action: z.literal("create").optional(),
    images: z.array(z.string().min(32)).min(2).max(120),
    projectName: z.string().max(120).optional(),
    scaleReference: z.string().max(200).optional(),
  }),
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("cancel"), jobId: z.string().uuid() }),
]);

export const Route = createFileRoute("/api/three-d/jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireApproved(request);
        if (!gate.ok) return gate.response;
        const headers = { "cache-control": "no-store" };
        const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
        const ownerKey = gate.account?.userId ?? "administrator";

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return json(
            {
              ok: false,
              configured: true,
              error: "At least two overlapping photographs are required.",
            },
            400,
          );
        const data = parsed.data;

        if ("action" in data && data.action === "list")
          return json({
            ok: true,
            jobs: await listJobs(ownerKey),
            workerOnline: await anyWorkerOnline(),
          });

        if ("action" in data && data.action === "cancel") {
          const res = await cancelJob(data.jobId, ownerKey);
          return json(res.ok ? { ok: true } : { ok: false, error: res.error }, res.ok ? 200 : 400);
        }

        if (!("images" in data)) return json({ ok: false, error: "Invalid request." }, 400);

        const created = await createJob({
          ownerKey,
          ownerLabel: gate.account?.displayName ?? null,
          images: data.images,
          ...(data.projectName ? { projectName: data.projectName } : {}),
          ...(data.scaleReference ? { scaleReference: data.scaleReference } : {}),
        });
        if (!created.ok) return json({ ok: false, configured: true, error: created.error }, 400);

        const online = await anyWorkerOnline();
        return json({
          ok: true,
          configured: true,
          jobId: created.jobId,
          workerOnline: online,
          note: online
            ? "Your photographs were uploaded and the processing computer will pick the job up shortly."
            : "Your photographs were uploaded and the job is queued. It will start as soon as the processing computer is running.",
        });
      },
    },
  },
});
