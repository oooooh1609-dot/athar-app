import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Endpoint the self-hosted Meshroom worker polls over outbound HTTPS.
 *
 * The caller is authenticated inside the handler with a scoped, revocable
 * worker token (`Authorization: Bearer atw_…`) that the administrator issues —
 * never the administrator password. Nothing here is reachable without a valid,
 * non-revoked token, and no inbound port has to be opened on the worker
 * computer.
 */

const Body = z.union([
  z.object({
    action: z.literal("hello"),
    host: z.string().max(120).optional(),
    meshroomVersion: z.string().max(80).optional(),
  }),
  z.object({ action: z.literal("claim") }),
  z.object({
    action: z.literal("progress"),
    jobId: z.string().uuid(),
    stage: z.string().max(200).optional(),
    progress: z.number().min(0).max(100).optional(),
    log: z.string().max(20000).optional(),
  }),
  z.object({
    action: z.literal("upload-url"),
    jobId: z.string().uuid(),
    ext: z.enum(["glb", "obj", "zip"]),
  }),
  z.object({
    action: z.literal("complete"),
    jobId: z.string().uuid(),
    modelPath: z.string().min(3).max(300),
    formats: z.record(z.string(), z.string()).optional(),
    log: z.string().max(20000).optional(),
  }),
  z.object({
    action: z.literal("fail"),
    jobId: z.string().uuid(),
    error: z.string().min(1).max(1000),
    retry: z.boolean().optional(),
    log: z.string().max(20000).optional(),
  }),
]);

export const Route = createFileRoute("/api/public/worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const recon = await import("@/lib/recon.server");
        const headers = { "cache-control": "no-store" };
        const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

        const worker = await recon.authenticateWorker(request);
        if (!worker)
          return json({ ok: false, error: "Invalid or revoked worker credential." }, 401);

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ ok: false, error: "Invalid request." }, 400);
        const data = parsed.data;

        if (data.action === "hello") {
          await recon.touchWorker(worker.id, {
            host: data.host ?? null,
            meshroomVersion: data.meshroomVersion ?? null,
          });
          return json({ ok: true, workerId: worker.id, label: worker.label });
        }

        await recon.touchWorker(worker.id);

        switch (data.action) {
          case "claim": {
            const res = await recon.claimJob(worker.id);
            return json({ ok: true, job: res.job });
          }
          case "progress": {
            const res = await recon.workerProgress(worker.id, data.jobId, {
              ...(data.stage ? { stage: data.stage } : {}),
              ...(typeof data.progress === "number" ? { progress: data.progress } : {}),
              ...(data.log ? { log: data.log } : {}),
            });
            return json({ ok: true, status: res.status, canceled: res.canceled });
          }
          case "upload-url": {
            const ticket = await recon.modelUploadTicket(worker.id, data.jobId, data.ext);
            if (!ticket) return json({ ok: false, error: "This job is not claimed by you." }, 403);
            return json({ ok: true, ...ticket });
          }
          case "complete": {
            const done = await recon.completeJob(worker.id, data.jobId, {
              modelPath: data.modelPath,
              ...(data.formats ? { formats: data.formats } : {}),
              ...(data.log ? { log: data.log } : {}),
            });
            return json(
              done ? { ok: true } : { ok: false, error: "This job is not claimed by you." },
              done ? 200 : 403,
            );
          }
          case "fail": {
            const done = await recon.failJob(worker.id, data.jobId, {
              error: data.error,
              ...(data.log ? { log: data.log } : {}),
              ...(data.retry === undefined ? {} : { retry: data.retry }),
            });
            return json(
              done ? { ok: true } : { ok: false, error: "This job is not claimed by you." },
              done ? 200 : 403,
            );
          }
        }
      },
    },
  },
});
