// Service Worker — cache doar pentru "scheletul" aplicației (HTML/CSS/JS/iconițe),
// NU pentru date (Firebase) — acelea rămân mereu live, din rețea.

const CACHE_NAME = "inventar-parfumuri-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
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

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Nu cachea niciodată cererile către Firebase —
  // acelea trebuie să fie mereu live, altfel ai vedea date vechi.
  if (url.hostname.includes("firebaseio.com")) {
    return; // lasă cererea să treacă normal, prin rețea
  }

  // Pentru fișierele aplicației: încearcă din cache primul (rapid, funcționează offline),
  // și actualizează cache-ul din rețea pe fundal.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});