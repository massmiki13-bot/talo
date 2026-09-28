// Service worker di Talo (generato dalla build: vedi precacheServiceWorker in vite.config.js).
// L'app si apre anche senza rete; i dati offline li gestisce l'app (src/lib/offlineStore.js).
// - pagine: rete prima, altrimenti la copia dell'app;
// - file della build: scaricati tutti all'installazione, poi dalla copia locale;
// - API e Supabase: mai in cache qui.
const VERSION = "__VERSION__";
const FILES = __FILES__;
const SHELL = ["/", "/manifest.json", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL);
    // Le pagine dell'app: se un file manca l'app lo scarica quando serve.
    await Promise.allSettled(FILES.map((f) => cache.add(f)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("talo-") && k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  // Navigazione: sempre la versione più recente, la copia salvata se offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put("/", copy)); } return res; })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  // File della build (nome con hash): non cambiano mai.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
    return;
  }

  // Altri file statici (logo, icone, manifest): copia locale aggiornata in background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); } return res; }).catch(() => hit);
      return hit || net;
    }),
  );
});
