/**
 * Administrator sign-in (فهد / Fahad).
 *
 * The password is compared against a PBKDF2 hash held in the database; it is
 * never present in client code or configuration and is never logged. Repeated
 * failures trigger a temporary lockout per client.
 */

import { createFileRoute } from "@tanstack/react-router";

import {
  ADMIN_COOKIE,
  clientKey,
  cookieHeader,
  cooldownLeft,
  issueToken,
  readCookie,
  readToken,
  registerFailure,
  clearFailures,
  slideToken,
} from "@/lib/athar-auth.server";
import {
  ADMIN_SESSION_SECONDS,
  adminRecord,
  setAdminPassword,
  verifyAdminPassword,
} from "@/lib/access.server";

export const Route = createFileRoute("/api/admin/login")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const rec = await adminRecord().catch(() => null);
        // Renew the idle window while the administrator is active. Without
        // this the session expired 30 minutes after sign-in regardless of use,
        // because `seen` is only stamped when the token is issued.
        const payload = await readToken(readCookie(request, ADMIN_COOKIE), "admin");
        const renewed = payload ? await slideToken(payload) : null;
        return Response.json(
          {
            ok: true,
            signedIn: payload !== null,
            displayName: rec?.display_name ?? "Administrator",
          },
          {
            headers: {
              "cache-control": "no-store",
              ...(renewed
                ? { "set-cookie": cookieHeader(ADMIN_COOKIE, renewed, ADMIN_SESSION_SECONDS) }
                : {}),
            },
          },
        );
      },
      POST: async ({ request }) => {
        const key = `admin:${clientKey(request)}`;
        const wait = cooldownLeft(key);
        if (wait > 0)
          return Response.json(
            { ok: false, error: `Too many attempts. Locked for ${wait} more seconds.` },
            { status: 429 },
          );

        let body: { password?: unknown; newPassword?: unknown; action?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        const password = typeof body.password === "string" ? body.password : "";

        if (!(await verifyAdminPassword(password))) {
          const state = registerFailure(key);
          return Response.json(
            {
              ok: false,
              error: state.cooldown
                ? `Too many attempts. Locked for ${state.cooldown} seconds.`
                : `Incorrect password. ${state.remaining} attempt(s) left.`,
            },
            { status: 401 },
          );
        }
        clearFailures(key);

        // Password change: requires the current password in the same request.
        if (body.action === "change") {
          const next = typeof body.newPassword === "string" ? body.newPassword : "";
          // 4 characters was the previous floor: roughly 1.7 million
          // possibilities, which the online rate limit alone does not protect.
          if (next.length < 12)
            return Response.json(
              { ok: false, error: "Choose a new password of at least 12 characters." },
              { status: 400 },
            );
          if (next.length > 200)
            return Response.json(
              { ok: false, error: "That password is too long (200 characters maximum)." },
              { status: 400 },
            );
          if (next === password)
            return Response.json(
              { ok: false, error: "The new password must differ from the current one." },
              { status: 400 },
            );
          await setAdminPassword(next);
          return Response.json({ ok: true, changed: true });
        }

        const rec = await adminRecord().catch(() => null);
        return Response.json(
          { ok: true, displayName: rec?.display_name ?? "Administrator" },
          {
            headers: {
              "cache-control": "no-store",
              "set-cookie": cookieHeader(
                ADMIN_COOKIE,
                await issueToken("admin"),
                ADMIN_SESSION_SECONDS,
              ),
            },
          },
        );
      },
      DELETE: async () =>
        Response.json(
          { ok: true },
          { headers: { "set-cookie": cookieHeader(ADMIN_COOKIE, "", 0) } },
        ),
    },
  },
});
