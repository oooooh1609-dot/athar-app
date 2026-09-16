/**
 * Contact & feedback for signed-in users.
 *
 * Everyone reaches only their own conversations. People awaiting approval may
 * use the contact form and read replies, nothing else.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { requireAccount } from "@/lib/access.server";
import { createThread, listMine, threadDetail, userReply } from "@/lib/feedback.server";

const Body = z.union([
  z.object({ action: z.literal("list") }),
  z.object({
    action: z.literal("create"),
    category: z.enum(["contact_admin", "problem", "improvement"]),
    subject: z.string().min(2).max(160),
    message: z.string().min(2).max(4000),
    screenshot: z.string().max(7_000_000).optional(),
  }),
  z.object({ action: z.literal("thread"), id: z.string().uuid() }),
  z.object({
    action: z.literal("reply"),
    id: z.string().uuid(),
    message: z.string().min(1).max(4000),
  }),
]);

export const Route = createFileRoute("/api/feedback")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const gate = await requireAccount(request);
        if (!gate.ok) return gate.response;

        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });

        const data = parsed.data;
        try {
          if (data.action === "list")
            return Response.json({ ok: true, ...(await listMine(gate.account)) });

          if (data.action === "create") {
            const res = await createThread(gate.account, data);
            return Response.json(res, { status: res.ok ? 200 : 400 });
          }

          if (data.action === "thread") {
            const detail = await threadDetail(data.id, gate.account);
            if (!detail)
              return Response.json(
                { ok: false, error: "Conversation not found." },
                { status: 404 },
              );
            return Response.json({ ok: true, ...detail });
          }

          const res = await userReply(gate.account, data.id, data.message);
          return Response.json(res, { status: res.ok ? 200 : 400 });
        } catch (err) {
          console.error("feedback request failed", err);
          return Response.json({ ok: false, error: "Request failed." }, { status: 500 });
        }
      },
    },
  },
});
