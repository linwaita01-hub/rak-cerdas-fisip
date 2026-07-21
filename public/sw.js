/* Service worker Perpus FISIP ULM — ditulis tangan (tanpa Workbox) agar
 * kompatibel dengan build Nitro/Cloudflare dan konfigurasi Vite yang terkunci.
 *
 * Strategi:
 *  - Navigasi halaman  : network-first  -> cache -> offline.html
 *  - Aset statis (prod): stale-while-revalidate (di-skip untuk modul dev Vite)
 *  - Katalog (Supabase REST GET): stale-while-revalidate (bisa dibuka offline)
 *  - Aksi tulis (POST/PATCH/DELETE, RPC, auth, realtime): selalu online (tidak di-cache)
 */
const VERSION = "v1";
const SHELL = `perpus-shell-${VERSION}`;
const STATIC = `perpus-static-${VERSION}`;
const DATA = `perpus-data-${VERSION}`;
const KEEP = [SHELL, STATIC, DATA];

const PRECACHE = [
  "/offline.html",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

// ===== Web Push (PART 4.4) =====
self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "Perpus FISIP ULM", body: event.data ? event.data.text() : "" };
  }
  const title = payload.title || "Perpus FISIP ULM";
  const options = {
    body: payload.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: payload.url || "/app" },
    tag: payload.tag,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/app";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

function isSupabaseRead(url) {
  return url.hostname.endsWith(".supabase.co") && url.pathname.startsWith("/rest/v1/");
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  // Modul dev Vite punya query (?v=, ?t=) atau berada di path internal — jangan di-cache.
  if (url.search) return false;
  if (/\/(?:@|src\/|node_modules|\.vite)/.test(url.pathname)) return false;
  return /\.(?:js|mjs|css|woff2?|ttf|png|jpe?g|svg|webp|ico)$/.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // aksi tulis selalu online

  const url = new URL(req.url);

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, SHELL, "/offline.html"));
    return;
  }
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(req, STATIC));
    return;
  }
  if (isSupabaseRead(url)) {
    event.respondWith(staleWhileRevalidate(req, DATA));
    return;
  }
  // Sisanya: biarkan jaringan menangani secara default.
});

async function networkFirst(req, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    if (cached) return cached;
    if (fallbackUrl) {
      const fb = await cache.match(fallbackUrl);
      if (fb) return fb;
    }
    return new Response("Offline", { status: 503, statusText: "Offline" });
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  return (
    cached || (await network) || new Response("Offline", { status: 503, statusText: "Offline" })
  );
}
