// Offline support: keeps the app and its two libraries available without a connection.
// Weather, elevation, place-name and map-tile requests are never cached here.
const VERSION = "gpxweather-v1";
const APP = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
const LIBS = [
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdn.plot.ly/plotly-2.35.2.min.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(APP);
    await Promise.all(LIBS.map(async (url) => {
      try { await cache.put(url, await fetch(url, { mode: "no-cors" })); } catch (e) { /* cached on first use */ }
    }));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The app itself: network first so updates arrive, cache when offline.
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok) (await caches.open(VERSION)).put(req, res.clone());
        return res;
      } catch (e) {
        return (await caches.match(req, { ignoreSearch: true })) || caches.match("./index.html");
      }
    })());
    return;
  }

  // Versioned libraries: cache first.
  if (LIBS.includes(req.url)) {
    event.respondWith((async () => {
      const hit = await caches.match(req.url);
      if (hit) return hit;
      const res = await fetch(req);
      (await caches.open(VERSION)).put(req.url, res.clone());
      return res;
    })());
  }
});
