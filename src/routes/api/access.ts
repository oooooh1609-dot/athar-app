/**
 * Browsing access with a code created by the administrator.
 *
 * The code is checked on the server, rate limited per client, and never kept in
 * browser code. A valid code sets a signed HttpOnly session cookie; the code
 * itself is re-checked on every request, so revoking it ends access at once.
 */

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import {
  clientKey,
  clearFailures,
  cookieHeader,
  cooldownLeft,
  issueToken,
  registerFailure,
} from "@/lib/athar-auth.server";
import {
  CODE_COOKIE,
  CODE_SESSION_SECONDS,
  codeSession,
  isAdminRequest,
  localTrialMode,
  redeemAccessCode,
} from "@/lib/access.server";

const Body = z.union([
  z.object({ action: z.literal("me") }),
  z.object({ action: z.literal("enter"), code: z.string().min(4).max(40) }),
  z.object({ action: z.literal("leave") }),
]);

export const Route = createFileRoute("/api/access")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success)
          return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
        const data = parsed.data;

        if (data.action === "leave")
          return Response.json(
            { ok: true },
            { headers: { "set-cookie": cookieHeader(CODE_COOKIE, "", 0) } },
          );

        if (data.action === "me") {
          // Local trial mode reports the visitor as already admitted, so a
          // fresh clone opens straight into the app with no database.
          if (localTrialMode())
            return Response.json({ ok: true, signedIn: true, label: "Local trial" });
          const session = await codeSession(request);
          return Response.json({
            ok: true,
            signedIn: Boolean(session) || (await isAdminRequest(request)),
            label: session?.displayName ?? null,
          });
        }

        const key = `code:${clientKey(request)}`;
        const wait = cooldownLeft(key);
        if (wait > 0)
          return Response.json(
            { ok: false, error: `Too many attempts. Try again in ${wait} seconds.` },
            { status: 429 },
          );

        const result = await redeemAccessCode(data.code);
        if (!result.ok) {
          const state = registerFailure(key);
          return Response.json(
            {
              ok: false,
              error: state.cooldown
                ? `Too many attempts. Locked for ${state.cooldown} seconds.`
                : `${result.error} ${state.remaining} attempt(s) left.`,
            },
            { status: 401 },
          );
        }
        clearFailures(key);

        return Response.json(
          { ok: true, label: result.row.label },
          {
            headers: {
              "cache-control": "no-store",
              "set-cookie": cookieHeader(
                CODE_COOKIE,
                await issueToken("user", {
                  sub: result.row.id,
                  name: result.row.label ?? undefined,
                }),
                CODE_SESSION_SECONDS,
              ),
            },
          },
        );
      },
    },
  },
});
