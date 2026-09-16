/** Access Management endpoint. Administrator session required for every action. */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdminRequest } from "@/lib/access.server";
import {
  cancelInvitation,
  createAccessCode,
  decideAccess,
  listAccess,
  listAccessCodes,
  revokeAccessCode,
  sendInvitation,
} from "@/lib/access-admin.server";

const Body = z.union([
  z.object({ action: z.literal("list") }),
  z.object({ action: z.literal("invite"), email: z.string().email().max(200) }),
  z.object({ action: z.literal("cancel"), id: z.string().uuid() }),
  z.object({
    action: z.literal("newCode"),
    label: z.string().max(120).optional(),
    maxUses: z.number().int().min(0).max(500),
    days: z.number().int().min(0).max(365),
  }),
  z.object({ action: z.literal("revokeCode"), id: z.string().uuid() }),
  z.object({
    action: z.literal("decide"),
    userId: z.string().uuid(),
    decision: z.enum(["approve", "reject", "suspend", "restore", "revoke"]),
    note: z.string().max(400).optional(),
  }),
]);

export const Route = createFileRoute("/api/admin/access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAdminRequest(request);
        if (!gate.ok) return gate.response;

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });

        const origin = new URL(request.url).origin;
        try {
          const data = parsed.data;
          if (data.action === "list")
            return Response.json({
              ok: true,
              ...(await listAccess(origin)),
              codes: await listAccessCodes(),
            });
          if (data.action === "newCode") {
            const res = await createAccessCode(data);
            return Response.json(res, { status: res.ok ? 200 : 400 });
          }
          if (data.action === "revokeCode") {
            const res = await revokeAccessCode(data.id);
            return Response.json(res, { status: res.ok ? 200 : 400 });
          }
          if (data.action === "invite") {
            const res = await sendInvitation(data.email, origin);
            return Response.json(res, { status: res.ok ? 200 : 400 });
          }
          if (data.action === "cancel") {
            const res = await cancelInvitation(data.id);
            return Response.json(res, { status: res.ok ? 200 : 400 });
          }
          const res = await decideAccess(data.userId, data.decision, data.note);
          return Response.json(res, { status: res.ok ? 200 : 400 });
        } catch (err) {
          console.error("access management failed", err);
          return Response.json({ ok: false, error: "Request failed." }, { status: 500 });
        }
      },
    },
  },
});
