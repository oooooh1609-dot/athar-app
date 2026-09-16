/** Messages & Feedback inbox for the administrator. */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireAdminRequest } from "@/lib/access.server";
import { adminReply, inbox, setStatus, threadDetail } from "@/lib/feedback.server";

const Body = z.union([
  z.object({
    action: z.literal("list"),
    status: z.enum(["new", "in_review", "planned", "resolved", "closed"]).optional(),
  }),
  z.object({ action: z.literal("thread"), id: z.string().uuid() }),
  z.object({
    action: z.literal("reply"),
    id: z.string().uuid(),
    message: z.string().min(1).max(4000),
  }),
  z.object({
    action: z.literal("status"),
    id: z.string().uuid(),
    status: z.enum(["new", "in_review", "planned", "resolved", "closed"]),
    note: z.string().max(400).optional(),
  }),
]);

export const Route = createFileRoute("/api/admin/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAdminRequest(request);
        if (!gate.ok) return gate.response;

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });

        const data = parsed.data;
        try {
          if (data.action === "list")
            return Response.json({ ok: true, ...(await inbox(data.status)) });
          if (data.action === "thread") {
            const detail = await threadDetail(data.id, null);
            if (!detail)
              return Response.json(
                { ok: false, error: "Conversation not found." },
                { status: 404 },
              );
            return Response.json({ ok: true, ...detail });
          }
          if (data.action === "reply") {
            const res = await adminReply(data.id, data.message);
            return Response.json(res, { status: res.ok ? 200 : 400 });
          }
          const res = await setStatus(data.id, data.status, data.note);
          return Response.json(res, { status: res.ok ? 200 : 400 });
        } catch (err) {
          console.error("admin feedback failed", err);
          return Response.json({ ok: false, error: "Request failed." }, { status: 500 });
        }
      },
    },
  },
});
