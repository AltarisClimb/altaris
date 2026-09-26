/* ALTARIS™ service worker — offline support for in-gym use (CDC §7).
   © 2026 ALTARIS™. All rights reserved.

   Strategy:
   - App shell (this origin): stale-while-revalidate, so a dropped
     connection at the wall never blanks the page.
   - Google Fonts: cache-first, they never change under a given URL.
   - Everything else: network, falling back to cache. */
const VERSION = "altaris-v1.0.0";
const SHELL = VERSION + "-shell";
const FONTS = VERSION + "-fonts";
const PRECACHE = ["./", "./index.html", "./manifest.webmanifest", "./favicon.svg", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Google Fonts — immutable once fetched
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(
      caches.open(FONTS).then(async cache => {
        const hit = await cache.match(req);
        if (hit) return hit;
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch (err) {
          return hit || Response.error();
        }
      })
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Navigations always resolve to the app shell (single-page app)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  e.respondWith(
    caches.open(SHELL).then(async cache => {
      const hit = await cache.match(req);
      const net = fetch(req).then(res => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
