/**
 * Athar service worker — offline support for field use.
 *
 * Sites have no coverage. Without this the app is unusable the moment the
 * signal drops, which is exactly when it is needed.
 *
 * Deliberate choices, because a careless service worker is worse than none:
 *
 *  - HTML is never served cache-first. An SSR app that serves a stale shell
 *    strands users on an old build with no way back; navigations go to the
 *    network first and fall back to a cached copy only when the network fails.
 *  - /api/ is never cached. A stale reading, a stale job status or a stale
 *    permission check is worse than an honest failure.
 *  - A new worker never takes over mid-session. It waits until the page tells
 *    it to, so a build does not swap under someone editing a photograph.
 *  - Only same-origin GET plus the two font hosts. Anything else passes
 *    straight through untouched.
 */

const VERSION = "athar-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const FONTS = `${VERSION}-fonts`;
const KEEP = new Set([SHELL, ASSETS, FONTS]);

const OFFLINE_URL = "/offline.html";

const PRECACHE = [
  OFFLINE_URL,
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/favicon.ico",
];

const FONT_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);

/**
 * Which strategy a request gets. Pure, so it can be reasoned about and tested
 * on its own rather than only in a browser.
 *
 * @param {URL} url
 * @param {string} mode   the request's `mode` ("navigate" for page loads)
 * @param {string} method
 * @param {string} origin the worker's own origin
 * @returns {"passthrough"|"navigate"|"asset"|"font"|"network-only"}
 */
function chooseStrategy(url, mode, method, origin) {
  if (method !== "GET") return "passthrough";
  if (FONT_HOSTS.has(url.hostname)) return "font";
  if (url.origin !== origin) return "passthrough";
  // Nothing under /api/ is ever cached: a stale reading, job status or
  // permission check is worse than an honest network failure.
  if (url.pathname.startsWith("/api/")) return "network-only";
  if (mode === "navigate") return "navigate";
  if (/\.(?:js|mjs|css|woff2?|png|jpe?g|webp|svg|gif|ico|json|glb|wasm)$/i.test(url.pathname))
    return "asset";
  return "passthrough";
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // One failed entry must not fail the whole install, so they are added
      // individually rather than with addAll.
      await Promise.all(
        PRECACHE.map((path) => cache.add(new Request(path, { cache: "reload" })).catch(() => {})),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !KEEP.has(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })(),
  );
});

/** The page asks for the update; the worker does not force it. */
self.addEventListener("message", (event) => {
  if (event.data === "athar:skip-waiting") void self.skipWaiting();
});

const isCacheable = (res) => res && res.status === 200 && res.type !== "opaque";

async function handleNavigate(event) {
  try {
    const preloaded = await event.preloadResponse;
    const res = preloaded || (await fetch(event.request));
    if (isCacheable(res)) {
      const copy = res.clone();
      void caches.open(SHELL).then((c) => c.put(event.request, copy));
    }
    return res;
  } catch {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    return new Response("Offline", { status: 503, headers: { "content-type": "text/plain" } });
  }
}

/**
 * Cache-first for build output.
 *
 * Safe here because these filenames are content-hashed: a changed file is a
 * changed URL, so a cached entry can never be the wrong version. The
 * background refresh covers the unhashed ones.
 */
async function handleAsset(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    void fetch(request)
      .then((res) => {
        if (isCacheable(res)) void cache.put(request, res);
      })
      .catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (isCacheable(res)) void cache.put(request, res.clone());
    return res;
  } catch (err) {
    const fallback = await cache.match(request);
    if (fallback) return fallback;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const strategy = chooseStrategy(
    url,
    event.request.mode,
    event.request.method,
    self.location.origin,
  );

  // Range requests must reach the network untouched or seeking breaks.
  if (
    strategy === "passthrough" ||
    strategy === "network-only" ||
    event.request.headers.has("range")
  )
    return;

  if (strategy === "navigate") {
    event.respondWith(handleNavigate(event));
    return;
  }
  event.respondWith(handleAsset(event.request, strategy === "font" ? FONTS : ASSETS));
});
