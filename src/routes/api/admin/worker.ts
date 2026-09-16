import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { audit, requireAdminRequest } from "@/lib/access.server";
import {
  issueWorkerCredential,
  listJobs,
  listWorkerCredentials,
  revokeWorkerCredential,
} from "@/lib/recon.server";

/** Administrator-only management of the self-hosted processing computers. */

const Body = z.union([
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("jobs") }),
  z.object({ action: z.literal("issue"), label: z.string().min(2).max(80) }),
  z.object({ action: z.literal("revoke"), id: z.string().uuid() }),
]);

export const Route = createFileRoute("/api/admin/worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAdminRequest(request);
        if (!gate.ok) return gate.response;
        const headers = { "cache-control": "no-store" };
        const json = (body: unknown, status = 200) => Response.json(body, { status, headers });

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return json({ ok: false, error: "Invalid request." }, 400);
        const data = parsed.data;

        if (data.action === "list")
          return json({ ok: true, workers: await listWorkerCredentials() });

        // Every reconstruction job with its current state and progress.
        if (data.action === "jobs")
          return json({ ok: true, jobs: await listJobs("administrator") });

        if (data.action === "issue") {
          const { credential, token } = await issueWorkerCredential(data.label);
          await audit({
            action: "worker_credential_issued",
            actor: "administrator",
            detail: credential.id,
          });
          // The token is shown once here and never stored in readable form.
          return json({ ok: true, credential, token });
        }

        await revokeWorkerCredential(data.id);
        await audit({
          action: "worker_credential_revoked",
          actor: "administrator",
          detail: data.id,
        });
        return json({ ok: true, workers: await listWorkerCredentials() });
      },
    },
  },
});
