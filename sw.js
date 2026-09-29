/* ALTARIS™ service worker — offline support for in-gym use (CDC §7).
   © 2026 ALTARIS™. All rights reserved.

   Strategy:
   - App shell (this origin): stale-while-revalidate, so a dropped
     connection at the wall never blanks the page.
   - Google Fonts: cache-first, they never change under a given URL.
   - Everything else: network, falling back to cache.

   PRECACHE lists every module. It is generated from the source tree —
   if you add a file under src/, add it here too or it will be missing
   offline. Bump VERSION on every release so clients refresh the cache. */
const VERSION = "altaris-v1.23.0";
const SHELL = VERSION + "-shell";
const FONTS = VERSION + "-fonts";
const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./src/actions.js",
  "./src/bus.js",
  "./src/config.js",
  "./src/core.js",
  "./src/data.js",
  "./src/domain/availability.js",
  "./src/domain/benchmarks.js",
  "./src/domain/calendar.js",
  "./src/domain/exercises.js",
  "./src/domain/gear.js",
  "./src/domain/grades.js",
  "./src/domain/hang.js",
  "./src/domain/loads.js",
  "./src/domain/logbook.js",
  "./src/domain/periodization.js",
  "./src/domain/plans.js",
  "./src/domain/program.js",
  "./src/domain/progress.js",
  "./src/domain/recap.js",
  "./src/domain/scoring.js",
  "./src/domain/warmup.js",
  "./src/domain/workload.js",
  "./src/export.js",
  "./src/i18n/en-US.js",
  "./src/i18n/fr-FR.js",
  "./src/i18n/index.js",
  "./src/main.js",
  "./src/media.js",
  "./src/modals.js",
  "./src/remote.js",
  "./src/seed.js",
  "./src/sw-register.js",
  "./src/ui/brand.js",
  "./src/ui/charts.js",
  "./src/ui/components.css",
  "./src/ui/feedback.js",
  "./src/ui/icons.js",
  "./src/ui/poses.js",
  "./src/ui/tokens.css",
  "./src/vendor/supabase.js",
  "./src/views/auth.js",
  "./src/views/availgrid.js",
  "./src/views/calendar.js",
  "./src/views/calls.js",
  "./src/views/climber.js",
  "./src/views/hang.js",
  "./src/views/library.js",
  "./src/views/logbook.js",
  "./src/views/onboarding.js",
  "./src/views/player.js",
  "./src/views/progress.js",
  "./src/views/recap.js",
  "./src/views/review.js",
  "./src/views/shell.js",
  "./src/views/staff.js",
  "./src/views/testing.js",
  "./src/views/today.js",
  "./src/views/training.js",
  "./src/views/videos.js"
];

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

/* Notifications (Web Push, envoyées par les Edge Functions notify / remind).
   Le message porte { title, body, url, tag } ; un tap ouvre l'appli au bon onglet. */
self.addEventListener("push", (e) => {
  let msg = {};
  try { msg = e.data ? e.data.json() : {}; } catch (err) { msg = { title: "ALTARIS", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(msg.title || "ALTARIS", {
    body: msg.body || "",
    tag: msg.tag,
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    data: { url: msg.url || "./" }
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.location.origin).href;
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find(w => new URL(w.url).origin === self.location.origin);
    if (open) { await open.focus(); return open.navigate(url); }
    return clients.openWindow(url);
  })());
});
