/**
 * Server-side access control for Athar (shared PIN).
 *
 * - The PIN is never stored in plaintext and never reaches client code.
 *   ATHAR_PIN_HASH holds "pbkdf2$<iterations>$<saltHex>$<hashHex>".
 * - Sessions are HMAC-signed tokens in an HttpOnly cookie, sliding 30-minute
 *   inactivity expiry.
 * - Failed attempts are rate limited per client with a temporary cooldown.
 */

const enc = new TextEncoder();

export const SESSION_COOKIE = "athar_session";
export const ADMIN_COOKIE = "athar_admin";
export const IDLE_MS = 30 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const COOLDOWN_MS = 5 * 60 * 1000;

const hex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function pbkdf2(pin: string, saltHex: string, iterations: number) {
  const salt = new Uint8Array((saltHex.match(/.{2}/g) ?? []).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", enc.encode(pin), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    256,
  );
  return hex(bits);
}

/**
 * Verifies a submitted PIN against the stored hash. Never logs the PIN.
 *
 * There is deliberately no built-in fallback hash: a default that ships in the
 * repository is a published password. With ATHAR_PIN_HASH unset, PIN sign-in is
 * simply closed and the access-code / account routes remain the way in.
 */
export async function verifyPin(pin: string): Promise<boolean> {
  const stored = process.env["ATHAR_PIN_HASH"];
  if (!stored) return false;
  if (!stored.startsWith("pbkdf2$")) {
    return stored === pin;
  }
  const [scheme, itStr, salt, digest] = stored.split("$");
  if (scheme !== "pbkdf2" || !itStr || !salt || !digest) return false;
  const iterations = Number(itStr);
  if (!Number.isInteger(iterations) || iterations < 1000 || iterations > 1_000_000) return false;
  const computed = await pbkdf2(pin, salt, iterations);
  return timingSafeEqualHex(computed, digest);
}

const isProduction = () => process.env["NODE_ENV"] === "production";

/**
 * Development-only signing secret.
 *
 * Random per process, so a forged cookie cannot be produced from anything in
 * this repository. It also means sessions do not survive a dev-server restart,
 * which is the correct trade: the previous code derived the secret from a
 * constant that is visible to everyone with a copy of the source, so anyone
 * could mint `role: "admin"` cookies and walk into every administrator
 * endpoint. Production must set ATHAR_SESSION_SECRET.
 */
let devSecret: string | null = null;
function developmentSecret() {
  if (!devSecret) {
    devSecret = [...crypto.getRandomValues(new Uint8Array(32))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    console.warn(
      "[athar] ATHAR_SESSION_SECRET is not set — using a random development secret. " +
        "Sessions will not survive a restart and will not work across instances. " +
        "Set ATHAR_SESSION_SECRET (32+ random bytes) before deploying.",
    );
  }
  return devSecret;
}

function sessionSecret() {
  const secret = process.env["ATHAR_SESSION_SECRET"];
  if (secret && secret.length >= 32) return secret;
  if (isProduction()) {
    throw new Error(
      "ATHAR_SESSION_SECRET is missing or shorter than 32 characters. " +
        "Session cookies cannot be signed safely. Generate one with: openssl rand -hex 32",
    );
  }
  if (secret) console.warn("[athar] ATHAR_SESSION_SECRET is shorter than 32 characters.");
  return secret || developmentSecret();
}

function signingKey() {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

const b64u = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s: string) =>
  atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

async function sign(payload: string) {
  const sig = await crypto.subtle.sign("HMAC", await signingKey(), enc.encode(payload));
  return `${payload}.${hex(sig)}`;
}

type SessionPayload = {
  role: "user" | "admin";
  seen: number;
  /** Access-code id for a browsing session; absent for the administrator. */
  sub?: string | undefined;
  /** Label the administrator gave the access code. */
  name?: string | undefined;
};

export async function issueToken(
  role: "user" | "admin",
  extra?: { sub?: string | undefined; name?: string | undefined },
) {
  const payload = b64u(
    JSON.stringify({ role, seen: Date.now(), ...extra } satisfies SessionPayload),
  );
  return sign(payload);
}

export async function readToken(
  token: string | undefined,
  role: "user" | "admin",
  maxAgeMs: number = IDLE_MS,
): Promise<SessionPayload | null> {
  if (!token) return null;
  const idx = token.lastIndexOf(".");
  if (idx < 1) return null;
  const payload = token.slice(0, idx);
  let expected: string;
  try {
    expected = await sign(payload);
  } catch (err) {
    // A misconfigured signing secret must deny access, not crash the request.
    console.error("[athar] cannot verify session token", err);
    return null;
  }
  if (!timingSafeEqualHex(expected.slice(idx + 1), token.slice(idx + 1))) return null;
  try {
    const data = JSON.parse(unb64u(payload)) as SessionPayload;
    if (data.role !== role) return null;
    if (typeof data.seen !== "number" || !Number.isFinite(data.seen)) return null;
    // A token stamped in the future would never expire.
    if (data.seen > Date.now() + 60_000) return null;
    if (Date.now() - data.seen > maxAgeMs) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Sliding expiry. The idle window is documented as 30 minutes of *inactivity*,
 * but `seen` is stamped once at sign-in, so without this the session died 30
 * minutes after login no matter how active the user was. Call it on a verified
 * request and set the returned cookie when it is not null.
 *
 * Re-issues only once the window is a third spent, so an active session does
 * not rewrite its cookie on every single request.
 */
export async function slideToken(
  payload: SessionPayload,
  maxAgeMs: number = IDLE_MS,
): Promise<string | null> {
  if (Date.now() - payload.seen < maxAgeMs / 3) return null;
  return issueToken(payload.role, { sub: payload.sub, name: payload.name });
}

export function readCookie(request: Request, name: string) {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/**
 * Secure is on unless NODE_ENV is explicitly "development".
 *
 * The previous rule was the other way round — Secure only when NODE_ENV was
 * exactly "production" — and serverless runtimes frequently leave NODE_ENV
 * unset, which quietly shipped session cookies that a plain-HTTP request could
 * carry.
 */
export function cookieHeader(name: string, value: string, maxAgeSeconds: number) {
  const secure = process.env["NODE_ENV"] === "development" ? "" : "; Secure";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

/**
 * Gate for protected endpoints. Access is invitation-only: the caller must be
 * a signed-in, email-verified account that the administrator has approved.
 * Imported lazily so the two access modules do not import each other.
 */
export async function requireSession(
  request: Request,
): Promise<{ ok: true; setCookie: string } | { ok: false; response: Response }> {
  const { requireApproved } = await import("@/lib/access.server");
  const gate = await requireApproved(request);
  if (!gate.ok) return gate;
  return { ok: true, setCookie: cookieHeader(SESSION_COOKIE, "", 0) };
}

export async function requireAdmin(request: Request) {
  return (await readToken(readCookie(request, ADMIN_COOKIE), "admin")) !== null;
}

/* ————— rate limiting (per worker isolate) ————— */
/**
 * Note the limits of this: the map lives in one isolate, so a platform that
 * spreads requests over several isolates multiplies the allowance. It is a
 * speed bump, not a lockout. Anything stronger needs shared state (a Supabase
 * table or a Durable Object) — see docs/AUDIT.md.
 */
const attempts = new Map<string, { count: number; until: number }>();
const MAX_TRACKED_CLIENTS = 5000;

/** Drops entries whose cooldown has passed; caps the map so it cannot grow without bound. */
function sweepAttempts() {
  const now = Date.now();
  for (const [k, v] of attempts) if (v.until <= now && v.count === 0) attempts.delete(k);
  if (attempts.size <= MAX_TRACKED_CLIENTS) return;
  const excess = attempts.size - MAX_TRACKED_CLIENTS;
  let i = 0;
  for (const k of attempts.keys()) {
    if (i++ >= excess) break;
    attempts.delete(k);
  }
}

export function clientKey(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function cooldownLeft(key: string) {
  const rec = attempts.get(key);
  if (!rec || rec.until <= Date.now()) return 0;
  return Math.ceil((rec.until - Date.now()) / 1000);
}

export function registerFailure(key: string) {
  sweepAttempts();
  const rec = attempts.get(key) ?? { count: 0, until: 0 };
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.until = Date.now() + COOLDOWN_MS;
    rec.count = 0;
  }
  attempts.set(key, rec);
  return { remaining: Math.max(0, MAX_ATTEMPTS - rec.count), cooldown: cooldownLeft(key) };
}

export function clearFailures(key: string) {
  attempts.delete(key);
}
