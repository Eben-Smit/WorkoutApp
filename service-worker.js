const CACHE_NAME = "workout-app-v2";

const APP_SHELL = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "exercises_data.json",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);

      try {
        const res = await fetch("exercises_data.json");
        const data = await res.json();
        const imageUrls = data.exercises
          .filter((e) => e.hasImage)
          .map((e) => `exercise_images/${e.image}`);
        await cache.addAll(imageUrls);
      } catch (err) {
        // Data fetch failed during install; app shell is still cached.
      }

      self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
      self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Network-first: while actively developed, the app shell and data change
  // often, so prefer fresh content and only fall back to cache when offline.
  event.respondWith(
    (async () => {
      try {
        const response = await fetch(event.request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, response.clone());
        }
        return response;
      } catch (err) {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        throw err;
      }
    })()
  );
});
