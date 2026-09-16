/**
 * Attaches the signed-in person's access token to every call this app makes to
 * its own backend, so the server can check identity, approval status and
 * permissions on each request.
 *
 * The token is kept in memory from sign-in events and read from stored session
 * data as a fallback. It is never fetched inside the request itself, because
 * that can deadlock while a sign-in event is being handled.
 */

import { supabase } from "@/integrations/supabase/client";

let installed = false;
let token: string | null = null;

function storedToken(): string | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { access_token?: string };
      if (parsed.access_token) return parsed.access_token;
    }
  } catch {
    return null;
  }
  return null;
}

export function installAuthFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  try {
    token = storedToken();
    supabase.auth.onAuthStateChange((_event, session) => {
      token = session?.access_token ?? null;
    });

    const original = typeof window.fetch === "function" ? window.fetch.bind(window) : undefined;
    if (!original) return;

    const patchedFetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      const sameOriginApi =
        url.startsWith("/api/") || url.startsWith(`${window.location.origin}/api/`);
      const current = token ?? storedToken();
      if (!sameOriginApi || !current) return original(input as RequestInfo, init);

      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined),
      );
      if (!headers.has("authorization")) headers.set("authorization", `Bearer ${current}`);
      return original(input as RequestInfo, { ...init, headers });
    };

    const descriptor =
      Object.getOwnPropertyDescriptor(window, "fetch") ||
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(window), "fetch");
    const isWritable = !descriptor || descriptor.writable || Boolean(descriptor.set);

    if (isWritable) {
      try {
        window.fetch = patchedFetch;
      } catch {
        // Ignored if non-writable in strict mode
      }
    } else if (descriptor?.configurable) {
      try {
        Object.defineProperty(window, "fetch", {
          value: patchedFetch,
          writable: true,
          configurable: true,
        });
      } catch {
        // Ignored
      }
    }
  } catch (err) {
    console.warn("[Athar] Could not patch fetch:", err);
  }
}
