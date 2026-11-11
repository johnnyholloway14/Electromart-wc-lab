// sw.js: the service worker. It lets the app install and work offline.
//
// Network first: every request tries the internet first, so each merged change
// shows up. The copy it gets is saved in the cache. If there's no connection,
// the saved copy is used instead.
//
// All paths are relative to this file, because the site lives at
// https://<username>.github.io/<repository>/, not at the root of a domain.

const CACHE = "electromart-ccc-v1";

const APP_FILES = [
  "./",
  "index.html",
  "styles.css",
  "ccc.js",
  "app.js",
  "manifest.webmanifest",
  "data/electromart.csv",
  "data/assumptions.csv",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

// On install, save a copy of every file the app needs, so it works offline right away.
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(APP_FILES.map(f => new Request(f, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

// On activate, delete caches from older versions of this file.
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  // Only handle this site's own GET requests.
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          event.waitUntil(caches.open(CACHE).then(cache => cache.put(req, copy)));
        }
        return res;
      })
      .catch(() =>
        caches.match(req, { ignoreSearch: true }).then(hit =>
          hit || (req.mode === "navigate" ? caches.match("./") : Response.error())
        )
      )
  );
});
