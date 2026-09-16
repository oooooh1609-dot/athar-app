/**
 * Invitation-only access control for Athar.
 *
 * Two separate identities:
 *  - The administrator (فهد / Fahad) signs in with a password that exists only
 *    as a PBKDF2 hash in `admin_credentials`. The plain password is never in
 *    client code, never in configuration files and never logged.
 *  - Regular users are Supabase auth accounts that can only be created from an
 *    administrator invitation. Their access status lives in `profiles` and is
 *    writable by the backend only, so nobody can approve or promote themselves.
 *
 * Every protected endpoint calls `requireApproved` (full features) or
 * `requireAccount` (invited + email-verified, awaiting approval: contact only).
 */

import { createClient } from "@supabase/supabase-js";

import { ADMIN_COOKIE, IDLE_MS, readCookie, readToken } from "@/lib/athar-auth.server";

const enc = new TextEncoder();

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(password: string, saltHex: string, iterations: number) {
  const salt = new Uint8Array((saltHex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return hex(bits);
}

/** Builds "pbkdf2$iterations$salt$digest" for storage. */
export async function hashPassword(password: string) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = [...saltBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  // The production Web Crypto runtime supports PBKDF2 up to 100,000 rounds.
  const iterations = 100000;
  return `pbkdf2$${iterations}$${salt}$${await pbkdf2(password, salt, iterations)}`;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/* ————————————————— administrator credential ————————————————— */

export async function adminRecord() {
  const db = await admin();
  const res = await db
    .from("admin_credentials")
    .select("display_name, password_hash, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Verifies an administrator password against the stored hash only. */
export async function verifyAdminPassword(password: string) {
  const rec = await adminRecord();
  if (!rec) return false;
  const [scheme, itStr, salt, digest] = rec.password_hash.split("$");
  if (scheme !== "pbkdf2" || !itStr || !salt || !digest) return false;
  return timingSafeEqualHex(await pbkdf2(password, salt, Number(itStr)), digest);
}

export async function setAdminPassword(next: string) {
  const db = await admin();
  const res = await db
    .from("admin_credentials")
    .update({ password_hash: await hashPassword(next), updated_at: new Date().toISOString() })
    .eq("id", true);
  if (res.error) throw new Error(res.error.message);
}

/** True when the request carries a valid administrator session cookie. */
export async function isAdminRequest(request: Request) {
  return (await readToken(readCookie(request, ADMIN_COOKIE), "admin")) !== null;
}

export const ADMIN_SESSION_SECONDS = IDLE_MS / 1000;

/* ————————————————— user identity ————————————————— */

export type Account = {
  userId: string;
  email: string;
  displayName: string | null;
  status: "pending" | "approved" | "suspended" | "revoked";
  emailVerified: boolean;
};

function bearer(request: Request) {
  const raw = request.headers.get("authorization") ?? "";
  return raw.toLowerCase().startsWith("bearer ") ? raw.slice(7).trim() : "";
}

/**
 * Resolves the signed-in user from the request bearer token and reads the
 * authoritative status from the database. Returns null when not signed in.
 */
export async function currentAccount(request: Request): Promise<Account | null> {
  const token = bearer(request);
  if (!token) return null;
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
  if (!url || !key) return null;

  const client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;

  const db = await admin();
  const prof = await db
    .from("profiles")
    .select("status, display_name, email")
    .eq("id", data.user.id)
    .maybeSingle();

  return {
    userId: data.user.id,
    email: prof.data?.email ?? data.user.email ?? "",
    displayName: prof.data?.display_name ?? null,
    status: (prof.data?.status as Account["status"]) ?? "pending",
    emailVerified: Boolean(data.user.email_confirmed_at ?? data.user.confirmed_at),
  };
}

const deny = (message: string, status: number) =>
  Response.json({ ok: false, error: message, code: status }, { status });

/* ————————————————— access codes ————————————————— */

/**
 * Browsing access is granted with a code the administrator creates. The code
 * itself is stored server-side only; a signed HttpOnly cookie carries the code
 * id afterwards, and the code row is re-read on every request, so revoking a
 * code ends every session that used it immediately.
 */
export const CODE_COOKIE = "athar_access";
export const CODE_SESSION_SECONDS = 30 * 24 * 60 * 60;
const CODE_SESSION_MS = CODE_SESSION_SECONDS * 1000;

export type AccessCodeRow = {
  id: string;
  code: string;
  label: string | null;
  max_uses: number;
  uses: number;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

// Validity is decided in SQL by redeem_access_code(), so the check and the
// use-count increment cannot be split by a concurrent request.

const CODE_STATUS_MESSAGE: Record<string, string> = {
  not_found: "Incorrect access code.",
  revoked: "This access code has been revoked.",
  expired: "This access code has expired.",
  exhausted: "This access code has already been used.",
};

/**
 * Checks a submitted code and, when valid, counts one use.
 *
 * The check and the increment happen inside `redeem_access_code`, so two
 * people submitting a single-use code at the same moment cannot both get in —
 * the read-check-write version here previously let them.
 */
export async function redeemAccessCode(
  code: string,
): Promise<{ ok: true; row: AccessCodeRow } | { ok: false; error: string }> {
  const db = await admin();
  const res = await db.rpc("redeem_access_code", { p_code: code.trim().toUpperCase() });
  if (res.error) throw new Error(res.error.message);

  const rows = (res.data ?? []) as (AccessCodeRow & { status: string })[];
  const row = rows[0];
  if (!row || row.status !== "ok")
    return {
      ok: false,
      error: CODE_STATUS_MESSAGE[row?.status ?? "not_found"] ?? "Incorrect access code.",
    };

  const { status: _status, ...clean } = row;
  return { ok: true, row: clean };
}

/** Resolves the browsing session carried by the access-code cookie. */
export async function codeSession(request: Request): Promise<Account | null> {
  const payload = await readToken(readCookie(request, CODE_COOKIE), "user", CODE_SESSION_MS);
  if (!payload?.sub) return null;
  const db = await admin();
  const res = await db.from("access_codes").select("*").eq("id", payload.sub).maybeSingle();
  const row = res.data as AccessCodeRow | null;
  if (!row || row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return {
    userId: row.id,
    email: row.label ?? "Access code",
    displayName: row.label ?? payload.name ?? null,
    status: "approved",
    emailVerified: true,
  };
}

/**
 * Gate for every application feature, research file, image and 3D endpoint.
 * Access ends on the next request when a code is revoked or expires, or when a
 * user account is suspended — the state is read from the database each time.
 */
/**
 * Local trial mode: run the app on a laptop without a Supabase project.
 *
 * Everything that makes Athar useful in the field — camera, enhancement,
 * measurement, the letter keyboards, projects, reports, search — is
 * client-side and needs no server at all. The only thing standing between a
 * fresh clone and a working app was this access gate, which cannot answer
 * without a database.
 *
 * Three conditions, all required, because an access-control bypass that can
 * be switched on by accident is a vulnerability and not a feature:
 *
 *   1. ATHAR_LOCAL_MODE is exactly "1"
 *   2. NODE_ENV is not "production"
 *   3. no Supabase service key is configured — if a real database is
 *      attached, the real gate runs
 *
 * It grants only the visitor role. Administrator endpoints still require the
 * password, so nothing here can reach the management screens.
 */
export function localTrialMode(): boolean {
  const on =
    process.env["ATHAR_LOCAL_MODE"] === "1" &&
    process.env["NODE_ENV"] !== "production" &&
    !process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (on && !warnedAboutLocalMode) {
    warnedAboutLocalMode = true;
    console.warn(
      "[athar] LOCAL TRIAL MODE — the access gate is open and no database is attached. " +
        "Never set ATHAR_LOCAL_MODE on a deployed instance.",
    );
  }
  return on;
}
let warnedAboutLocalMode = false;

export async function requireApproved(
  request: Request,
): Promise<{ ok: true; account: Account | null } | { ok: false; response: Response }> {
  if (localTrialMode()) return { ok: true, account: null };
  // The administrator's own session also opens these endpoints, since the
  // review screens read the same data.
  if (await isAdminRequest(request)) return { ok: true, account: null };
  const viaCode = await codeSession(request);
  if (viaCode) return { ok: true, account: viaCode };
  const account = await currentAccount(request);
  if (!account) return { ok: false, response: deny("Enter your access code to continue.", 401) };
  if (!account.emailVerified)
    return { ok: false, response: deny("Verify your email address first.", 403) };
  if (account.status === "pending")
    return {
      ok: false,
      response: deny("Your account is awaiting administrator approval.", 403),
    };
  if (account.status !== "approved")
    return { ok: false, response: deny("Your access has been withdrawn.", 403) };
  return { ok: true, account };
}

/** Gate for the contact form: a valid access code or an invited account. */
export async function requireAccount(
  request: Request,
): Promise<{ ok: true; account: Account } | { ok: false; response: Response }> {
  const viaCode = await codeSession(request);
  if (viaCode) return { ok: true, account: viaCode };
  const account = await currentAccount(request);
  if (!account) return { ok: false, response: deny("Enter your access code to continue.", 401) };
  if (!account.emailVerified)
    return { ok: false, response: deny("Verify your email address first.", 403) };
  if (account.status === "revoked" || account.status === "suspended")
    return { ok: false, response: deny("Your access has been withdrawn.", 403) };
  return { ok: true, account };
}

/** Administrator-only gate for the management endpoints. */
export async function requireAdminRequest(
  request: Request,
): Promise<{ ok: true } | { ok: false; response: Response }> {
  if (await isAdminRequest(request)) return { ok: true };
  return { ok: false, response: deny("Administrator sign-in required.", 401) };
}

/* ————————————————— audit log ————————————————— */

export async function audit(entry: {
  action: string;
  actor?: string;
  subjectEmail?: string | null;
  subjectUser?: string | null;
  detail?: string | null;
}) {
  const db = await admin();
  // Never store passwords or invitation links here.
  await db.from("access_audit").insert({
    action: entry.action,
    actor: entry.actor ?? "administrator",
    subject_email: entry.subjectEmail ?? null,
    subject_user: entry.subjectUser ?? null,
    detail: entry.detail ?? null,
  });
}
