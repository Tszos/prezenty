// Minimalny service worker: pozwala zainstalować aplikację i otworzyć formularz bez sieci.
// Zawsze najpierw sieć (świeża wersja), pamięć podręczna tylko jako zapas.
var CACHE = "dodaj-v2";
var SHELL = ["./", "dodaj.js", "manifest.webmanifest", "../tokens.css", "../components.css", "../style.css", "../theme.js", "../icons.svg", "../config.js", "../price.js", "icons/icon-192.png"];

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

// Aplikacja pyta po otwarciu i przy powrocie na ekran: czy na serwerze jest nowsza wersja niż ta,
// która działa? Porównujemy znacznik ?v= przy dodaj.js (scripts/stamp.sh zmienia go przy każdym wydaniu).
self.addEventListener("message", function (e) {
  var build = e.data && e.data.type === "check-update" && e.data.build;
  if (!build) return;
  e.waitUntil(fetch("./", { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (html) {
    if (html.indexOf("dodaj.js?v=") > 0 && html.indexOf(build) < 0 && e.source) e.source.postMessage({ type: "update-ready" });
  }).catch(function () {}));
});
