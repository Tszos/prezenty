(function () {
  "use strict";

  var CFG = window.GIFT_CONFIG || {};
  var OWNER_GEN = CFG.ownerName || "solenizanta";
  var OWNER_NOM = CFG.ownerNameNominative || "Solenizant";
  var DEMO = !CFG.apiUrl;
  var POLL_MS = 30000;

  // ---------- pamięć przeglądarki (zawsze w try/catch) ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // Anonimowy token tej przeglądarki: pozwala anulować własną rezerwację bez konta.
  function randomToken() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  var TOKEN = lsGet("gift-token");
  if (!TOKEN || TOKEN.length < 16) { TOKEN = randomToken(); lsSet("gift-token", TOKEN); }

  var S = {
    items: [], claims: {}, loaded: false, error: "", openClaim: null, busy: {}, claimErr: null,
    myName: lsGet("gift-name") || "",
    surprise: lsGet("gift-surprise") === "1"
  };

  // ---------- backend ----------
  var api = DEMO ? demoApi() : remoteApi(CFG.apiUrl);

  function remoteApi(url) {
    return {
      list: function () {
        var u = url + (url.indexOf("?") >= 0 ? "&" : "?") + "token=" + encodeURIComponent(TOKEN) + "&t=" + Date.now();
        return fetch(u, { redirect: "follow" }).then(function (r) { return r.json(); });
      },
      post: function (body) {
        body.token = TOKEN;
        // text/plain = brak preflight CORS, co działa z Google Apps Script.
        return fetch(url, {
          method: "POST", redirect: "follow",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
      }
    };
  }

  // Tryb demo: wszystko w localStorage, żeby można było obejrzeć stronę bez backendu.
  function demoApi() {
    var KEY = "gift-demo";
    function load() {
      try { var d = JSON.parse(lsGet(KEY)); if (d && d.items) return d; } catch (e) {}
      return {
        items: [
          { id: "a1", title: "Kubek termiczny", desc: "Najlepiej zielony, ok. 450 ml", price: "ok. 120 zł", shop: "Allegro", url: "https://allegro.pl" },
          { id: "a2", title: "Książka „Projekt Hail Mary”", desc: "Andy Weir, wydanie w twardej oprawie", price: "ok. 55 zł", shop: "Empik", url: "https://www.empik.com" },
          { id: "a3", title: "Skarpetki w renifery", desc: "Rozmiar 43–46", price: "ok. 30 zł", shop: "", url: "" }
        ],
        claims: { a2: { name: "Ciocia Basia", token: "someone-else-token" } }
      };
    }
    function save(d) { lsSet(KEY, JSON.stringify(d)); }
    function later(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 250); }); }
    return {
      list: function () {
        var d = load(), claims = {};
        Object.keys(d.claims).forEach(function (id) { claims[id] = { name: d.claims[id].name, mine: d.claims[id].token === TOKEN }; });
        return later({ ok: true, items: d.items, claims: claims });
      },
      post: function (b) {
        var d = load(), c = d.claims[b.id];
        if (b.action === "claim") {
          if (c && c.token !== TOKEN) return later({ ok: false, error: "taken" });
          d.claims[b.id] = { name: b.name, token: TOKEN };
        } else if (b.action === "unclaim") {
          if (!c || c.token !== TOKEN) return later({ ok: false, error: "not_yours" });
          delete d.claims[b.id];
        }
        save(d); return later({ ok: true });
      }
    };
  }

  // ---------- pomocnicze ----------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      var v = attrs[k];
      if (k === "text") n.textContent = v;
      else if (k === "class") n.className = v;
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v === true ? "" : v);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function safeUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null; }
  function str(v) { return v === null || v === undefined ? "" : String(v); }
  function plural(n, one, few, many) {
    if (n === 1) return one;
    var m10 = n % 10, m100 = n % 100;
    return (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? few : many;
  }
  function claimOf(id) { return S.surprise ? null : (S.claims[id] || null); }

  // ---------- render ----------
  function render() {
    document.title = "Lista prezentów " + OWNER_GEN;
    document.getElementById("title").textContent = "Lista prezentów " + OWNER_GEN;
    document.getElementById("occasion").textContent = CFG.occasion || "";
    document.getElementById("footer-text").textContent = S.surprise
      ? "Tryb niespodzianki jest włączony: rezerwacje są ukryte na tym urządzeniu."
      : "Rezerwację możesz w każdej chwili anulować z tego samego urządzenia i przeglądarki.";
    document.getElementById("surprise-toggle").textContent = S.surprise
      ? "Pokaż rezerwacje"
      : "Jestem " + OWNER_NOM + " – ukryj przede mną rezerwacje";
    renderSummary(); renderNotice(); renderList();
  }

  function renderSummary() {
    var box = document.getElementById("summary");
    box.textContent = "";
    if (!S.loaded || !S.items.length) return;
    var total = S.items.length;
    if (S.surprise) {
      box.appendChild(el("span", { class: "pill free", text: total + " " + plural(total, "prezent", "prezenty", "prezentów") + " na liście" }));
      return;
    }
    var taken = S.items.filter(function (it) { return claimOf(it.id); }).length;
    box.appendChild(el("span", { class: "pill free", text: (total - taken) + " " + plural(total - taken, "wolny", "wolne", "wolnych") }));
    box.appendChild(el("span", { class: "pill taken", text: taken + " " + plural(taken, "zarezerwowany", "zarezerwowane", "zarezerwowanych") }));
  }

  function renderNotice() {
    var box = document.getElementById("notice");
    box.textContent = "";
    if (S.error) box.appendChild(el("div", { class: "notice", role: "alert", text: S.error }));
    if (DEMO) box.appendChild(el("div", { class: "notice demo", text: "Tryb demo: brak adresu backendu w config.js, więc rezerwacje zapisują się tylko w tej przeglądarce." }));
  }

  function renderList() {
    var list = document.getElementById("list");
    list.textContent = "";
    if (!S.loaded) { list.appendChild(el("li", { class: "empty", text: S.error ? "" : "Ładuję listę…" })); return; }
    if (!S.items.length) { list.appendChild(el("li", { class: "empty", text: "Lista jest jeszcze pusta." })); return; }
    S.items.forEach(function (it, i) { list.appendChild(card(it, i + 1)); });
  }

  function card(it, n) {
    var c = claimOf(it.id);
    var mine = c && c.mine;
    var url = safeUrl(it.url);
    var busy = !!S.busy[it.id];
    var actions = el("div", { class: "actions" });

    if (mine) {
      actions.appendChild(el("span", { class: "status mine", text: "✓ Zarezerwowane przez Ciebie" }));
      actions.appendChild(el("button", { class: "btn-ghost", type: "button", disabled: busy, text: busy ? "Anuluję…" : "Anuluj rezerwację", onclick: function () { unclaim(it.id); } }));
    } else if (c) {
      var who = str(c.name).trim();
      actions.appendChild(el("span", { class: "status taken", text: "Zajęte" + (who ? " · " + who : "") }));
    } else if (!S.surprise) {
      if (S.openClaim === it.id) {
        var inp = el("input", { type: "text", id: "name-" + it.id, placeholder: "np. Ciocia Basia", maxlength: "40", autocomplete: "name" });
        inp.value = S.myName;
        actions.appendChild(el("form", { class: "claim-form", onsubmit: function (e) { e.preventDefault(); claim(it.id, inp.value.trim()); } }, [
          el("label", { for: "name-" + it.id, text: "Jak się podpisać? Zobaczą to inne osoby z listy (" + OWNER_NOM + " może to ukryć)." }),
          inp,
          el("button", { class: "btn-primary", type: "submit", disabled: busy, text: busy ? "Rezerwuję…" : "Potwierdź" }),
          el("button", { class: "btn-ghost", type: "button", text: "Anuluj", onclick: function () { S.openClaim = null; render(); } }),
          el("div", { class: "err", role: "alert", text: S.claimErr && S.claimErr.id === it.id ? S.claimErr.msg : "" })
        ]));
        setTimeout(function () { var x = document.getElementById("name-" + it.id); if (x && document.activeElement !== x && !busy) x.focus(); }, 0);
      } else {
        actions.appendChild(el("button", { class: "btn-primary", type: "button", text: "Rezerwuję ten prezent", onclick: function () { S.openClaim = it.id; S.claimErr = null; render(); } }));
      }
    }

    return el("li", { class: "tag" + (c ? " taken" : "") + (mine ? " mine" : "") }, [
      el("div", { class: "num", "aria-hidden": "true", text: String(n) }),
      el("h2", { text: it.title || "Bez nazwy" }),
      it.desc ? el("p", { class: "desc", text: it.desc }) : null,
      el("div", { class: "meta" }, [
        it.price ? el("span", { class: "price", text: it.price }) : null,
        url ? el("a", { class: "shop", href: url, target: "_blank", rel: "noopener noreferrer", text: "Zobacz w " + (it.shop || "sklepie") + " ↗" }) : null
      ]),
      actions.childNodes.length ? actions : null
    ]);
  }

  // ---------- akcje ----------
  function refresh() {
    return api.list().then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.error) || "bad");
      S.items = (d.items || []).map(function (x) {
        return { id: str(x.id), title: str(x.title), desc: str(x.desc), price: str(x.price), shop: str(x.shop), url: str(x.url) };
      });
      S.claims = d.claims || {};
      S.loaded = true; S.error = "";
    }).catch(function () {
      S.error = "Nie udało się wczytać listy. Sprawdź połączenie i odśwież stronę.";
    }).then(render);
  }

  function claim(id, name) {
    if (S.busy[id]) return;
    if (!name) { S.claimErr = { id: id, msg: "Wpisz, jak się podpisać." }; render(); return; }
    S.myName = name; lsSet("gift-name", name);
    S.busy[id] = true; S.claimErr = null; render();
    api.post({ action: "claim", id: id, name: name }).then(function (r) {
      if (r && r.ok) { S.openClaim = null; return; }
      S.claimErr = { id: id, msg: r && r.error === "taken"
        ? "Ktoś właśnie zarezerwował ten prezent. Wybierz inny."
        : "Nie udało się zarezerwować. Spróbuj ponownie za chwilę." };
      if (r && r.error === "taken") S.openClaim = null;
    }).catch(function () {
      S.claimErr = { id: id, msg: "Nie udało się zarezerwować. Spróbuj ponownie za chwilę." };
    }).then(function () { S.busy[id] = false; return refresh(); });
  }

  function unclaim(id) {
    if (S.busy[id]) return;
    S.busy[id] = true; render();
    api.post({ action: "unclaim", id: id }).catch(function () {
      S.error = "Nie udało się anulować rezerwacji. Spróbuj ponownie.";
    }).then(function () { S.busy[id] = false; return refresh(); });
  }

  document.getElementById("surprise-toggle").addEventListener("click", function () {
    S.surprise = !S.surprise;
    lsSet("gift-surprise", S.surprise ? "1" : "0");
    S.openClaim = null;
    render();
  });

  // Odświeżaj co jakiś czas i po powrocie do karty (nie w trakcie wpisywania imienia).
  setInterval(function () { if (!document.hidden && !S.openClaim) refresh(); }, POLL_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !S.openClaim) refresh(); });

  render();
  refresh();
})();
