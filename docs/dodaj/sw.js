// Minimalny service worker: pozwala zainstalować aplikację i otworzyć formularz bez sieci.
// Zawsze najpierw sieć (świeża wersja), pamięć podręczna tylko jako zapas.
var CACHE = "dodaj-v1";
var SHELL = ["./", "dodaj.js", "manifest.webmanifest", "../style.css", "../config.js", "../price.js", "icons/icon-192.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  // Tylko pliki tej strony; zapytania do Google Apps Script idą prosto do sieci.
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
      return res;
    }).catch(function () {
      return caches.match(e.request, { ignoreSearch: true });
    })
  );
});
