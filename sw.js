const CACHE_NAME = "zoo-it-citizenship-v2";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./manifest.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// IMPORTANT: only intercept same-origin GET requests for the app shell.
// Firestore and Storage rely on long-lived streaming/long-polling
// connections to firestore.googleapis.com and firebasestorage.googleapis.com;
// if a service worker's fetch handler wraps those cross-origin requests,
// it can break that streaming behavior and make the Firestore SDK think
// it's offline (the "Failed to get document because the client is
// offline" error). So anything not on this exact origin — Firestore,
// Storage, Google Sign-In, Google Fonts, the Chart.js CDN — is left
// completely untouched and goes straight to the network.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return; // don't touch cross-origin requests at all

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
