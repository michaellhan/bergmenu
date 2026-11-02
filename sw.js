// Offline support. The page and the menu data come from the network when it
// answers within a few seconds, else from the copy saved last time; the
// versioned assets (style.css?v=…, app.js?v=…) and fonts are cached as-is.
//
// The deploy step replaces "dev" with a hash of the site's files, so each
// release gets a fresh cache. Left as "dev" (running locally) everything is
// network-first, so edits show up on reload.
const VERSION = "dev";
const CACHE = "berg-" + VERSION;
const SHELL = [
  "./", "style.css?v=dev", "app.js?v=dev", "manifest.webmanifest",
  "icon.svg?v=3", "icon-192.png?v=3", "apple-touch-icon.png?v=3", "data/menu.json",
];
const TIMEOUT = 3000;

addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => skipWaiting()));
});

addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("berg-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => clients.claim()));
});

// the network if it answers in time, else the saved copy (which the network
// response still replaces when it arrives)
async function networkFirst(e, key) {
  const cache = await caches.open(CACHE);
  const net = fetch(e.request).then((res) => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  e.waitUntil(net.catch(() => {}));
  try {
    const res = await Promise.race([net, new Promise((r) => setTimeout(r, TIMEOUT))]);
    if (res) return res;
  } catch (_) {}
  return (await cache.match(key)) || net;
}

async function cacheFirst(e) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(e.request);
  if (hit) return hit;
  const res = await fetch(e.request);
  if (res.ok) cache.put(e.request, res.clone());
  return res;
}

addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // every page URL (?d=…&m=…) is the same index.html
    if (req.mode === "navigate") return e.respondWith(networkFirst(e, registration.scope));
    if (VERSION === "dev" || url.pathname.includes("/data/")) return e.respondWith(networkFirst(e, req));
    return e.respondWith(cacheFirst(e));
  }
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") e.respondWith(cacheFirst(e));
});
