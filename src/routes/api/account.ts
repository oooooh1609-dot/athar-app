/**
 * Signed-in user's own account state.
 *
 * `me` reports the access status the interface should show; `accept` records
 * that an invited person has set their own password. Status itself can only be
 * changed by the administrator.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { currentAccount } from "@/lib/access.server";
import { markInvitationAccepted } from "@/lib/access-admin.server";

const Body = z.object({ action: z.enum(["me", "accept"]) });

export const Route = createFileRoute("/api/account")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });

        const account = await currentAccount(request);
        if (!account)
          return Response.json({ ok: false, error: "Sign in to continue." }, { status: 401 });

        if (parsed.data.action === "accept") {
          const res = await markInvitationAccepted(account.email, account.userId);
          if (!res.ok) return Response.json(res, { status: 400 });
        }
        return Response.json({
          ok: true,
          account: {
            email: account.email,
            displayName: account.displayName,
            status: account.status,
            emailVerified: account.emailVerified,
          },
        });
      },
    },
  },
});
