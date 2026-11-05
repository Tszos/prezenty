(function () {
  "use strict";

  var CFG = window.GIFT_CONFIG || {};
  var OWNER_GEN = CFG.ownerName || "solenizanta";
  var OWNER_NOM = CFG.ownerNameNominative || "Solenizant";
  var DEMO = !CFG.apiUrl;
  var POLL_MS = 30000;
  var PRICE = window.GiftPrice;

  // ---------- pamięć przeglądarki (zawsze w try/catch) ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsJson(k) { try { var v = JSON.parse(lsGet(k)); return v && typeof v === "object" ? v : null; } catch (e) { return null; } }

  // Anonimowy token tej przeglądarki: pozwala anulować własną rezerwację bez konta.
  function randomToken() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  var TOKEN = lsGet("gift-token");
  if (!TOKEN || TOKEN.length < 16) { TOKEN = randomToken(); lsSet("gift-token", TOKEN); }

  var S = {
    items: [], claims: {}, loaded: false, error: "", busy: {}, claimErr: null,
    openClaim: null, draft: "", formFresh: false, justClaimed: null,
    myName: lsGet("gift-name") || "",
    surprise: lsGet("gift-surprise") === "1",
    // Stan rozwinięcia grup: { klucz: false } = zwinięta. Domyślnie wszystkie rozwinięte.
    groupsOpen: lsJson("gift-groups") || {}
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
    var KEY = "gift-demo-v2";
    function load() {
      var d = lsJson(KEY);
      if (d && d.items) return d;
      return {
        items: [
          { id: "a1", title: "Kubek termiczny", desc: "Najlepiej zielony, ok. 450 ml", price: "ok. 120 zł", shop: "Allegro", url: "https://allegro.pl" },
          { id: "a2", title: "Książka „Projekt Hail Mary”", desc: "Andy Weir, wydanie w twardej oprawie", price: "ok. 55 zł", shop: "Empik", url: "https://www.empik.com" },
          { id: "a3", title: "Skarpetki w renifery", desc: "Rozmiar 43–46", price: "ok. 30 zł", shop: "", url: "" },
          { id: "a4", title: "Słuchawki bezprzewodowe", desc: "Nauszne, z redukcją szumów", price: "ok. 350–420 zł", shop: "Media Expert", url: "https://www.mediaexpert.pl" },
          { id: "a5", title: "Ekspres przelewowy", desc: "Z termosem zamiast szklanego dzbanka", price: "ok. 950–1150 zł", shop: "", url: "https://www.ceneo.pl" },
          { id: "a6", title: "Gra planszowa „Wsiąść do pociągu: Europa”", desc: "", price: "ok. 100 zł", shop: "Rebel", url: "https://www.rebel.pl" },
          { id: "a7", title: "Plecak na rower", desc: "Wodoodporny, 20–25 l", price: "1149,99 zł", shop: "Decathlon", url: "https://www.decathlon.pl" },
          { id: "a8", title: "Kurs ceramiki dla dwojga", desc: "Dowolna pracownia w Warszawie", price: "ok. 280 zł", shop: "", url: "" },
          { id: "a9", title: "Niespodzianka", desc: "Coś, co Twoim zdaniem mi się spodoba", price: "", shop: "", url: "" }
        ],
        claims: {
          a2: { name: "Ciocia Basia", token: "someone-else-token" },
          a4: { name: "Marek", token: "another-token" }
        }
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
  var SVGNS = "http://www.w3.org/2000/svg";
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
  function icon(cls, d) {
    var s = document.createElementNS(SVGNS, "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", cls);
    s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
    var p = document.createElementNS(SVGNS, "path");
    p.setAttribute("d", d); p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2.2"); p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
    s.appendChild(p); return s;
  }
  function safeUrl(u) { return typeof u === "string" && /^https?:\/\//i.test(u) ? u : null; }
  function str(v) { return v === null || v === undefined ? "" : String(v); }
  function plural(n, one, few, many) {
    if (n === 1) return one;
    var m10 = n % 10, m100 = n % 100;
    return (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) ? few : many;
  }
  function gifts(n) { return n + " " + plural(n, "prezent", "prezenty", "prezentów"); }
  function claimOf(id) { return S.surprise ? null : (S.claims[id] || null); }
  function isOpen(key) { return S.groupsOpen[key] !== false; }

  // ---------- render ----------
  // Cała lista jest budowana od nowa, więc zapamiętujemy fokus i kursor, żeby odświeżenie ich nie gubiło.
  function render() {
    var a = document.activeElement, focusKey = a && a.getAttribute && a.getAttribute("data-focus");
    var sel = a && a.tagName === "INPUT" ? [a.selectionStart, a.selectionEnd] : null;

    document.title = "Lista prezentów " + OWNER_GEN;
    document.getElementById("title").textContent = "Lista prezentów " + OWNER_GEN;
    document.getElementById("occasion").textContent = CFG.occasion || "";
    document.getElementById("footer-text").textContent = S.surprise
      ? "Tryb niespodzianki jest włączony: rezerwacje są ukryte na tym urządzeniu."
      : "Rezerwację możesz w każdej chwili anulować z tego samego urządzenia i przeglądarki.";
    document.getElementById("surprise-toggle").textContent = S.surprise
      ? "Pokaż rezerwacje"
      : "Jestem " + OWNER_NOM + " – ukryj przede mną rezerwacje";
    renderSummary(); renderNotice(); renderGroups();

    var target = null;
    if (S.formFresh || S.focusInput) {
      target = document.getElementById("name-" + S.openClaim);
      // Zapamiętane imię jest zaznaczone, więc pisanie od razu je zastępuje.
      sel = target && S.formFresh ? [0, target.value.length] : null;
      S.formFresh = false; S.focusInput = false;
    }
    else if (focusKey) target = document.querySelector('[data-focus="' + focusKey + '"]');
    if (target) {
      target.focus({ preventScroll: true });
      if (sel && target.setSelectionRange) try { target.setSelectionRange(sel[0], sel[1]); } catch (e) {}
    }
    S.justClaimed = null;
  }

  function renderSummary() {
    var box = document.getElementById("summary");
    box.textContent = "";
    if (!S.loaded || !S.items.length) return;
    var total = S.items.length;
    if (S.surprise) { box.textContent = gifts(total) + " na liście"; return; }
    var free = S.items.filter(function (it) { return !claimOf(it.id); }).length;
    if (!free) { box.textContent = "Wszystko z listy jest już zarezerwowane."; return; }
    box.appendChild(document.createTextNode("Wolne: "));
    box.appendChild(el("strong", { text: String(free) }));
    box.appendChild(document.createTextNode(" z " + gifts(total)));
  }

  function renderNotice() {
    var box = document.getElementById("notice");
    box.textContent = "";
    if (S.error) box.appendChild(el("div", { class: "notice", role: "alert", text: S.error }));
    if (DEMO) box.appendChild(el("div", { class: "notice demo", text: "Tryb demo: brak adresu backendu w config.js, więc rezerwacje zapisują się tylko w tej przeglądarce." }));
  }

  function renderGroups() {
    var box = document.getElementById("groups");
    box.textContent = "";
    if (!S.loaded) { if (!S.error) box.appendChild(el("p", { class: "empty", text: "Ładuję listę…" })); return; }
    if (!S.items.length) { box.appendChild(el("p", { class: "empty", text: "Lista jest jeszcze pusta." })); return; }

    var byKey = {};
    S.items.forEach(function (it) { var k = PRICE.groupOf(it.price); (byKey[k] = byKey[k] || []).push(it); });
    PRICE.GROUPS.forEach(function (g) { if (byKey[g.key]) box.appendChild(group(g, byKey[g.key])); });
  }

  function group(g, items) {
    var total = items.length;
    var free = items.filter(function (it) { return !claimOf(it.id); }).length;
    var countText = S.surprise ? gifts(total)
      : free === 0 ? "wszystkie zajęte"
      : free + " z " + total + " " + plural(free, "wolny", "wolne", "wolnych");
    var d = el("details", { class: "group", "data-group": g.key, open: isOpen(g.key) }, [
      el("summary", { "data-focus": "group:" + g.key }, [
        el("span", { class: "range", text: g.label }),
        el("span", { class: "count" + (!S.surprise && free === 0 ? " done" : ""), text: countText }),
        icon("chev", "M6 9l6 6 6-6")
      ]),
      el("ul", { class: "gifts" }, items.map(card))
    ]);
    d.addEventListener("toggle", function () {
      if (isOpen(g.key) === d.open) return;
      if (d.open) delete S.groupsOpen[g.key]; else S.groupsOpen[g.key] = false;
      lsSet("gift-groups", JSON.stringify(S.groupsOpen));
    });
    return d;
  }

  function card(it) {
    var c = claimOf(it.id);
    var mine = !!(c && c.mine);
    var url = safeUrl(it.url);
    var busy = !!S.busy[it.id];
    var act = el("div", { class: "act" });
    var form = null;
    var title = it.title || "Bez nazwy";

    if (mine) {
      act.appendChild(el("span", { class: "tag-mine" + (S.justClaimed === it.id ? " pop" : "") }, [icon("", "M5 12.5l4.5 4.5L19 7.5"), "Twoja rezerwacja"]));
      act.appendChild(el("button", {
        class: "btn-ghost", type: "button", disabled: busy, "data-focus": "unclaim:" + it.id,
        "aria-label": "Anuluj rezerwację: " + title,
        text: busy ? "Anuluję…" : "Anuluj rezerwację", onclick: function () { unclaim(it.id); }
      }));
    } else if (c) {
      var who = str(c.name).trim();
      act.appendChild(el("div", { class: "who" }, [
        el("span", { class: "tag-taken", text: "Zajęte" }),
        who ? el("span", { text: "Kupuje: " + who }) : null
      ]));
    } else if (!S.surprise) {
      if (S.openClaim === it.id) {
        var inp = el("input", {
          type: "text", id: "name-" + it.id, placeholder: "np. Ciocia Basia", maxlength: "40",
          autocomplete: "name", "data-focus": "name:" + it.id,
          oninput: function () { S.draft = inp.value; }
        });
        inp.value = S.draft;
        form = el("form", { class: "claim-form" + (S.formFresh ? " enter" : ""), onsubmit: function (e) { e.preventDefault(); claim(it.id, inp.value.trim()); } }, [
          el("label", { for: "name-" + it.id, text: "Jak się podpiszesz? Zobaczą to inne osoby z listy (" + OWNER_NOM + " może to ukryć)." }),
          inp,
          el("button", { class: "btn-primary", type: "submit", disabled: busy, "data-focus": "confirm:" + it.id, text: busy ? "Rezerwuję…" : "Potwierdź" }),
          el("button", { class: "btn-ghost", type: "button", "data-focus": "close:" + it.id, text: "Zamknij", onclick: function () { closeForm(it.id); } }),
          el("div", { class: "err", role: "alert", text: S.claimErr && S.claimErr.id === it.id ? S.claimErr.msg : "" })
        ]);
      } else {
        act.appendChild(el("button", {
          class: "btn-primary", type: "button", "data-focus": "claim:" + it.id,
          "aria-label": "Rezerwuję: " + title, text: "Rezerwuję",
          onclick: function () { openForm(it.id); }
        }));
      }
    }

    return el("li", { class: "gift" + (c ? " taken" : "") + (mine ? " mine" : "") }, [
      el("div", { class: "info" }, [
        el("h3", { text: title }),
        it.desc ? el("p", { class: "desc", text: it.desc }) : null,
        el("div", { class: "meta" }, [
          it.price ? el("span", { class: "price", text: it.price }) : null,
          url ? el("a", { class: "shop", href: url, target: "_blank", rel: "noopener noreferrer", text: "Zobacz w " + (it.shop || "sklepie") + " ↗" }) : null
        ])
      ]),
      act.childNodes.length ? act : null,
      form
    ]);
  }

  // ---------- akcje ----------
  function openForm(id) { S.openClaim = id; S.draft = S.myName; S.claimErr = null; S.formFresh = true; render(); }
  function closeForm(id) {
    S.openClaim = null; S.claimErr = null; render();
    var b = document.querySelector('[data-focus="claim:' + id + '"]'); if (b) b.focus();
  }

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
    if (!name) { S.claimErr = { id: id, msg: "Wpisz, jak się podpiszesz." }; S.focusInput = true; render(); return; }
    S.myName = name; lsSet("gift-name", name);
    S.busy[id] = true; S.claimErr = null; render();
    api.post({ action: "claim", id: id, name: name }).then(function (r) {
      if (r && r.ok) { S.openClaim = null; S.justClaimed = id; return; }
      S.claimErr = { id: id, msg: r && r.error === "taken"
        ? "Ktoś właśnie zarezerwował ten prezent. Wybierz inny."
        : "Nie udało się zarezerwować. Spróbuj ponownie za chwilę." };
      if (r && r.error === "taken") S.openClaim = null;
    }).catch(function () {
      S.claimErr = { id: id, msg: "Nie udało się zarezerwować. Spróbuj ponownie za chwilę." };
    }).then(function () {
      S.busy[id] = false;
      var keep = S.justClaimed;
      return refresh().then(function () {
        // Po rezerwacji fokus trafia na „Anuluj rezerwację”, żeby czytnik ekranu i klawiatura nie zgubiły miejsca.
        if (keep) { var b = document.querySelector('[data-focus="unclaim:' + keep + '"]'); if (b) b.focus({ preventScroll: true }); }
      });
    });
  }

  function unclaim(id) {
    if (S.busy[id]) return;
    S.busy[id] = true; render();
    api.post({ action: "unclaim", id: id }).then(function (r) {
      if (!r || !r.ok) S.error = "Nie udało się anulować rezerwacji. Spróbuj ponownie.";
    }).catch(function () {
      S.error = "Nie udało się anulować rezerwacji. Spróbuj ponownie.";
    }).then(function () {
      S.busy[id] = false;
      return refresh().then(function () {
        var b = document.querySelector('[data-focus="claim:' + id + '"]'); if (b) b.focus({ preventScroll: true });
      });
    });
  }

  document.getElementById("surprise-toggle").addEventListener("click", function () {
    S.surprise = !S.surprise;
    lsSet("gift-surprise", S.surprise ? "1" : "0");
    S.openClaim = null;
    render();
  });

  // Odświeżaj co jakiś czas i po powrocie do karty. Gdy formularz jest otwarty, czekamy,
  // żeby nie przebudowywać pola w trakcie pisania (render i tak zachowuje wpisany tekst).
  setInterval(function () { if (!document.hidden && !S.openClaim) refresh(); }, POLL_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !S.openClaim) refresh(); });

  render();
  refresh();
})();
