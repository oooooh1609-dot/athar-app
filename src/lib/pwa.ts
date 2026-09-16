/**
 * Service worker registration and connection state.
 *
 * Registration is deliberately conditional. A service worker persists after
 * it is unregistered-by-deletion — an old one keeps serving until something
 * replaces it — so it is only installed on real deployments, never on a dev
 * server or inside the Lovable preview iframe, where a leftover worker would
 * keep serving a stale build long after the page was rebuilt.
 */

import { useEffect, useState } from "react";

export type SwState = {
  /** The browser reports a live connection. Not a guarantee of reachability. */
  online: boolean;
  /** A newer build is installed and waiting for permission to take over. */
  updateReady: boolean;
  /** Applies the waiting build and reloads. */
  applyUpdate: () => void;
};

const shouldRegister = () =>
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  window.location.protocol === "https:" &&
  // localhost is served over http in development, and the check above already
  // excludes it; this second one keeps a worker out of preview sandboxes.
  !/\.lovable(project)?\.(app|dev)$/.test(window.location.hostname);

export function useServiceWorker(): SwState {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  useEffect(() => {
    if (!shouldRegister()) return;
    let cancelled = false;

    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        if (reg.waiting) setWaiting(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener("statechange", () => {
            // "installed" with an existing controller means an update is
            // ready; without one it is the very first install, which needs
            // no prompt.
            if (next.state === "installed" && navigator.serviceWorker.controller) setWaiting(next);
          });
        });
      })
      .catch(() => {
        /* Offline on first load, or the worker is blocked. Nothing to do. */
      });

    // The page reloads once, after the new worker takes control.
    let reloading = false;
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return {
    online,
    updateReady: waiting !== null,
    applyUpdate: () => waiting?.postMessage("athar:skip-waiting"),
  };
}

/**
 * Removes any worker and cache this origin holds.
 *
 * Kept because a service worker is the one thing a user cannot clear by
 * reloading. If a bad build ever ships, this is the escape hatch — call it
 * from the console: `import("/src/lib/pwa").then(m => m.unregisterAll())`.
 */
export async function unregisterAll() {
  if (!("serviceWorker" in navigator)) return;
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.map((n) => caches.delete(n)));
  }
}
