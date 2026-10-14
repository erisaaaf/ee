// Vitality service worker — offline support.
//  * Pages & static assets: network-first, falling back to the last cached copy.
//  * GET /api/* (read-only data): network-first, falling back to the last cached response ("view recent information").
//  * Writes are never cached here — the app's outbox queues them with idempotency keys.
//  * The cache is cleared on sign-out (the app deletes all caches).
const CACHE = "vitality-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never cache auth endpoints, exports, or AI responses.
  if (/^\/api\/(auth|account|ai)\b/.test(url.pathname)) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && (req.mode === "navigate" || url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/api/"))) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(
          (hit) =>
            hit ||
            (url.pathname.startsWith("/api/")
              ? new Response(JSON.stringify({ error: { code: "offline", message: "You're offline and this hasn't been loaded before." } }), { status: 503, headers: { "Content-Type": "application/json" } })
              : caches.match("/").then((home) => home || new Response("Offline", { status: 503 }))),
        ),
      ),
  );
});
