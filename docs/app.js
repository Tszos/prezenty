(function () {
  "use strict";

  var CFG = window.GIFT_CONFIG || {};
  var PEOPLE = CFG.people || {};
  // Czyja to lista: <body data-person="ania"> w docs/ania/index.html.
  var PERSON = document.body.getAttribute("data-person") || "";
  var P = PEOPLE[PERSON] || {};
  var OWNER_GEN = P.nameGen || "solenizanta";
  var OWNER_NOM = P.name || "Solenizant";
  var DEMO = !P.apiUrl;
  var POLL_MS = 30000;

  // ---------- pamięć przeglądarki (zawsze w try/catch) ----------
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsJson(k) { try { var v = JSON.parse(lsGet(k)); return v && typeof v === "object" ? v : null; } catch (e) { return null; } }
  // Klucze zależne od listy. Tomek zostaje przy starych nazwach, żeby zachować zapisany stan.
  function pk(k) { return PERSON === "tomek" ? k : k + ":" + PERSON; }

  // Anonimowy token tej przeglądarki: pozwala anulować własną rezerwację bez konta.
  function randomToken() {
    var a = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }
  var TOKEN = lsGet("gift-token");
  if (!TOKEN || TOKEN.length < 16) { TOKEN = randomToken(); lsSet("gift-token", TOKEN); }

  // Właściciel listy (ma jej klucz) zawsze startuje w trybie niespodzianki; „Pokaż rezerwacje”
  // działa u niego tylko do zamknięcia karty, żeby nie zobaczył ich przypadkiem przy następnej wizycie.
  function ssGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }
  var OWNER = !!adminKey();
  var S = {
    items: [], claims: {}, loaded: false, error: "", busy: {}, claimErr: null,
    openClaim: null, draft: "", formFresh: false, justClaimed: null,
    edit: null,           // szkic edycji prezentu przez właściciela: { id, title, …, err }
    myName: lsGet("gift-name") || "",
    surprise: OWNER ? ssGet("gift-show:" + PERSON) !== "1" : lsGet(pk("gift-surprise")) === "1",
    // Stan rozwinięcia grup: { klucz: false } = zwinięta. Domyślnie wszystkie rozwinięte.
    groupsOpen: lsJson(pk("gift-groups")) || {}
  };

  // ---------- backend ----------
  var api = DEMO ? demoApi() : remoteApi(P.apiUrl);

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
    var KEY = pk("gift-demo-v2");
    function load() {
      var d = lsJson(KEY);
      if (d && d.items) {
        // Krótko działająca wersja ze składkami zapisywała listy osób: zostaje pierwsza.
        d.claims = d.claims || {};
        Object.keys(d.claims).forEach(function (id) {
          var c = d.claims[id];
          if (Array.isArray(c)) { if (c.length) d.claims[id] = { name: c[0].name, token: c[0].token }; else delete d.claims[id]; }
        });
        return d;
      }
      return {
        items: [
          { id: "a1", title: "Kubek termiczny", desc: "Najlepiej zielony, ok. 450 ml", price: "ok. 120 zł", shop: "Allegro", url: "https://allegro.pl", group: "Dom" },
          { id: "a2", title: "Książka „Projekt Hail Mary”", desc: "Andy Weir, wydanie w twardej oprawie", price: "ok. 55 zł", shop: "Empik", url: "https://www.empik.com", group: "Książki i gry" },
          { id: "a3", title: "Skarpetki w lisy", desc: "Rozmiar 43–46", price: "ok. 30 zł", shop: "", url: "" },
          { id: "a4", title: "Słuchawki bezprzewodowe", desc: "Nauszne, z redukcją szumów", price: "ok. 350–420 zł", shop: "Media Expert", url: "https://www.mediaexpert.pl", group: "Gadżety" },
          { id: "a5", title: "Ekspres przelewowy", desc: "Z termosem zamiast szklanego dzbanka", price: "ok. 950–1150 zł", shop: "", url: "https://www.ceneo.pl", group: "Dom" },
          { id: "a6", title: "Gra planszowa „Wsiąść do pociągu: Europa”", desc: "", price: "ok. 100 zł", shop: "Rebel", url: "https://www.rebel.pl", group: "Książki i gry" },
          { id: "a7", title: "Plecak na rower", desc: "Wodoodporny, 20–25 l", price: "1149,99 zł", shop: "Decathlon", url: "https://www.decathlon.pl", group: "Gadżety" },
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
        var item = d.items.filter(function (x) { return x.id === b.id; })[0];
        var owner = b.action === "remove" || b.action === "reorder" || b.action === "edit";
        if (owner && b.key !== "demo") return later({ ok: false, error: "bad_key" });
        if (b.action === "remove") {
          d.items = d.items.filter(function (it) { return it.id !== b.id; });
          delete d.claims[b.id];
        } else if (b.action === "reorder") {
          var pos = {};
          (b.ids || []).forEach(function (id, i) { pos[id] = i; });
          d.items = d.items.map(function (x, i) { return [x.id in pos ? pos[x.id] : 1e6 + i, x]; })
            .sort(function (a, z) { return a[0] - z[0]; }).map(function (p) { return p[1]; });
        } else if (b.action === "edit") {
          if (!item) return later({ ok: false, error: "not_found" });
          if (!String(b.title || "").trim()) return later({ ok: false, error: "no_title" });
          ["title", "desc", "price", "shop", "url", "group"].forEach(function (k) { item[k] = String(b[k] || "").trim(); });
        } else if (b.action === "claim") {
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
  // Linki w opisie (np. drugi sklep) jako krótkie, klikalne „tchibo.pl ↗” zamiast długiego adresu.
  function linkify(text) {
    var out = [], re = /https?:\/\/[^\s)]+/g, last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      var host = m[0].replace(/^https?:\/\/(www\.)?/i, "").split(/[\/?#]/)[0];
      out.push(el("a", { class: "shop", href: m[0], target: "_blank", rel: "noopener noreferrer", text: host + " ↗" }));
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
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
  function taken(it) { return !!claimOf(it.id); }
  function isOpen(key) { return S.groupsOpen[key] !== false; }

  // ---------- render ----------
  // Cała lista jest budowana od nowa, więc zapamiętujemy fokus i kursor, żeby odświeżenie ich nie gubiło.
  function render() {
    // W trakcie przeciągania nie przebudowujemy listy; zrobimy to po upuszczeniu.
    if (S.dragging) { S.renderPending = true; return; }
    var a = document.activeElement, focusKey = a && a.getAttribute && a.getAttribute("data-focus");
    var sel = a && a.tagName === "INPUT" ? [a.selectionStart, a.selectionEnd] : null;

    document.title = "Lista prezentów " + OWNER_GEN;
    document.getElementById("title").textContent = "Lista prezentów " + OWNER_GEN;
    document.getElementById("occasion").textContent = CFG.occasion || "";
    document.getElementById("footer-text").textContent = S.surprise
      ? (OWNER ? "To Twoja lista, więc rezerwacje są ukryte. Pokażesz je tylko do zamknięcia tej karty."
        : "Tryb niespodzianki jest włączony: rezerwacje są ukryte na tym urządzeniu.")
      : "Rezerwację możesz w każdej chwili anulować z tego samego urządzenia i przeglądarki.";
    document.getElementById("surprise-toggle").textContent = S.surprise
      ? "Pokaż rezerwacje"
      : "Jestem " + OWNER_NOM + " – ukryj przede mną rezerwacje";
    renderSummary(); renderNotice(); renderGroups(); renderOthers();

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
    if (S.focusConfirm) {
      S.focusConfirm = false;
      var ok = document.getElementById("rmok-" + S.confirmRemove); if (ok) ok.focus({ preventScroll: true });
    }
  }

  function renderSummary() {
    var box = document.getElementById("summary");
    box.textContent = "";
    if (!S.loaded || !S.items.length) return;
    var total = S.items.length;
    if (S.surprise) { box.textContent = gifts(total) + " na liście"; return; }
    var free = S.items.filter(function (it) { return !taken(it); }).length;
    if (!free) { box.textContent = "Wszystko z listy jest już zarezerwowane."; return; }
    box.appendChild(document.createTextNode("Wolne: "));
    box.appendChild(el("strong", { text: String(free) }));
    box.appendChild(document.createTextNode(" z " + gifts(total)));
  }

  // Linki do pozostałych list w stopce.
  function renderOthers() {
    var nav = document.getElementById("others");
    if (!nav || nav.childNodes.length) return;
    var keys = Object.keys(PEOPLE).filter(function (k) { return k !== PERSON; });
    if (!keys.length) { nav.hidden = true; return; }
    nav.appendChild(el("span", { text: "Inne listy:" }));
    keys.forEach(function (k) {
      nav.appendChild(el("a", { href: "../" + k + "/", text: "Lista " + (PEOPLE[k].nameGen || k) }));
    });
  }

  function renderNotice() {
    var box = document.getElementById("notice");
    box.textContent = "";
    if (S.error) box.appendChild(el("div", { class: "d-notice d-notice--bad", role: "alert", text: S.error }));
    if (DEMO && PEOPLE[PERSON]) box.appendChild(el("div", { class: "d-notice", text: "Tryb demo: brak adresu backendu w config.js, więc rezerwacje zapisują się tylko w tej przeglądarce." }));
  }

  // Grupy właściciela (kolumna Grupa): sekcje w kolejności pierwszego prezentu z każdej,
  // wielkość liter bez znaczenia, prezenty bez grupy na końcu w „Pozostałe”. Bez żadnej grupy: jedna lista.
  function sections() {
    var map = {}, out = [], rest = [];
    S.items.forEach(function (it) {
      var g = str(it.group).trim();
      if (!g) { rest.push(it); return; }
      var k = g.toLowerCase();
      if (!map[k]) { map[k] = { key: "g:" + k, label: g, items: [] }; out.push(map[k]); }
      map[k].items.push(it);
    });
    if (!out.length) return [{ key: "", label: "", items: rest, flat: true }];
    if (rest.length) out.push({ key: "rest", label: "Pozostałe", items: rest, rest: true });
    return out;
  }
  function sectionOf(id) {
    var secs = sections();
    for (var i = 0; i < secs.length; i++) {
      for (var j = 0; j < secs[i].items.length; j++) if (secs[i].items[j].id === id) return { secs: secs, i: i, j: j };
    }
    return null;
  }
  function groupNames() {
    return sections().filter(function (g) { return !g.flat && !g.rest; }).map(function (g) { return g.label; });
  }
  // Gotowe grupy z config.js, których jeszcze nie ma na liście (wielkość liter bez znaczenia).
  function suggestedGroups() {
    var used = {};
    groupNames().forEach(function (g) { used[g.toLowerCase()] = true; });
    return (CFG.defaultGroups || []).filter(function (g) { return g && !used[g.toLowerCase()]; });
  }
  // Nazwa wpisana inaczej niż istniejąca grupa („lego” vs „LEGO”) dostaje jej pisownię.
  function canonGroup(name) {
    name = str(name).trim().slice(0, 40);
    var all = groupNames().concat(CFG.defaultGroups || []), low = name.toLowerCase();
    for (var i = 0; i < all.length; i++) if (all[i].toLowerCase() === low) return all[i];
    return name;
  }

  function renderGroups() {
    var box = document.getElementById("groups");
    box.textContent = "";
    if (!S.loaded) { if (!S.error) box.appendChild(el("p", { class: "empty", text: "Ładuję listę…" })); return; }
    if (!S.items.length) { box.appendChild(el("p", { class: "empty", text: "Lista jest jeszcze pusta." })); return; }
    var secs = sections();
    if (secs[0].flat) {
      box.appendChild(el("div", { class: "group flat" }, [el("ul", { class: "gifts", "aria-label": "Prezenty" }, S.items.map(card))]));
      return;
    }
    secs.forEach(function (g, i) { box.appendChild(group(g, i, secs)); });
  }

  function group(g, i, secs) {
    var items = g.items, total = items.length;
    var free = items.filter(function (it) { return !taken(it); }).length;
    var countText = S.surprise ? gifts(total)
      : free === 0 ? "wszystkie zajęte"
      : free + " z " + total + " " + plural(free, "wolny", "wolne", "wolnych");
    // Właściciel przeciąga całe grupy za uchwyt w nagłówku (albo strzałkami z klawiatury);
    // „Pozostałe” zawsze na końcu, więc nie ma uchwytu.
    var grip = null;
    var movable = secs.filter(function (s) { return !s.rest; }).length;
    if (adminKey() && !g.rest && movable > 1) {
      grip = el("button", { class: "link-btn grip sec-grip", type: "button", "data-focus": "secdrag:" + g.key,
        title: "Przeciągnij, żeby przesunąć grupę",
        "aria-label": "Przesuń grupę: " + g.label + ". Strzałki w górę i w dół zmieniają miejsce.",
        onpointerdown: function (e) { startGroupDrag(e, g.key); },
        // Klik w przycisk w <summary> zwijałby grupę.
        onclick: function (e) { e.preventDefault(); e.stopPropagation(); },
        onkeydown: function (e) {
          var dir = e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : "";
          if (dir) { e.preventDefault(); moveSection(g.key, dir); }
        }
      }, [icon("", "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01")]);
    }
    var d = el("details", { class: "group", "data-group": g.key, open: isOpen(g.key) }, [
      el("summary", { "data-focus": "group:" + g.key }, [
        grip,
        el("span", { class: "range", text: g.label }),
        el("span", { class: "count" + (!S.surprise && free === 0 ? " done" : ""), text: countText }),
        icon("chev", "M6 9l6 6 6-6")
      ]),
      el("ul", { class: "gifts", "aria-label": g.label }, items.map(card))
    ]);
    d.addEventListener("toggle", function () {
      if (isOpen(g.key) === d.open) return;
      if (d.open) delete S.groupsOpen[g.key]; else S.groupsOpen[g.key] = false;
      lsSet(pk("gift-groups"), JSON.stringify(S.groupsOpen));
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
        class: "d-btn d-btn--secondary btn-ghost", type: "button", disabled: busy, "data-focus": "unclaim:" + it.id,
        "aria-label": "Anuluj rezerwację: " + title,
        text: busy ? "Anuluję…" : "Anuluj rezerwację", onclick: function () { unclaim(it.id); }
      }));
    } else if (c) {
      var who = str(c.name).trim();
      act.appendChild(el("div", { class: "who" }, [
        el("span", { class: "d-tag", text: "Zajęte" }),
        who ? el("span", { text: "Kupuje: " + who }) : null
      ]));
    } else if (!S.surprise) {
      if (S.openClaim === it.id) {
        form = claimForm(it, busy);
      } else {
        act.appendChild(el("button", {
          class: "d-btn btn-primary", type: "button", "data-focus": "claim:" + it.id,
          "aria-label": "Rezerwuję: " + title, text: "Rezerwuję",
          onclick: function () { openForm(it.id); }
        }));
      }
    }

    return el("li", { class: "gift" + (taken(it) ? " taken" : "") + (mine ? " mine" : ""), "data-id": it.id }, [
      el("div", { class: "info" }, [
        el("h3", { text: title }),
        it.desc ? el("p", { class: "desc" }, linkify(it.desc)) : null,
        el("div", { class: "meta" }, [
          it.price ? el("span", { class: "price", text: it.price }) : null,
          url ? el("a", { class: "shop", href: url, target: "_blank", rel: "noopener noreferrer", text: "Zobacz w " + (it.shop || "sklepie") + " ↗" }) : null
        ])
      ]),
      act.childNodes.length ? act : null,
      form,
      ownerRow(it, title)
    ]);
  }

  function claimForm(it, busy) {
    var inp = el("input", {
      type: "text", id: "name-" + it.id, placeholder: "np. Ciocia Basia", maxlength: "40",
      autocomplete: "name", "data-focus": "name:" + it.id,
      oninput: function () { S.draft = inp.value; }
    });
    inp.value = S.draft;
    return el("form", { class: "claim-form" + (S.formFresh ? " enter" : ""), onsubmit: function (e) { e.preventDefault(); claim(it.id, inp.value.trim()); } }, [
      el("label", { for: "name-" + it.id, text: "Jak się podpiszesz? Zobaczą to inne osoby z listy (" + OWNER_NOM + " może to ukryć)." }),
      inp,
      el("button", { class: "d-btn btn-primary", type: "submit", disabled: busy, "data-focus": "confirm:" + it.id, text: busy ? "Rezerwuję…" : "Potwierdź" }),
      el("button", { class: "d-btn d-btn--secondary btn-ghost", type: "button", "data-focus": "close:" + it.id, text: "Zamknij", onclick: function () { closeForm(it.id); } }),
      el("div", { class: "err", role: "alert", text: S.claimErr && S.claimErr.id === it.id ? S.claimErr.msg : "" })
    ]);
  }

  // Klucz tej listy z aplikacji „Dodaj prezent” (ta sama przeglądarka) pozwala edytować, przesuwać i usuwać prezenty.
  function adminKey() { return (lsJson("gift-admin-keys") || {})[PERSON] || ""; }

  function ownerRow(it, title) {
    if (!adminKey()) return null;
    if (S.edit && S.edit.id === it.id) return editForm(it);
    var busy = !!S.busy["rm:" + it.id];
    if (S.confirmRemove !== it.id) {
      // Przeciąganie i „Na koniec” działają w obrębie grupy; do innej grupy przenosi lista „Grupa”.
      var at = sectionOf(it.id), i = at ? at.j : 0, lastI = at ? at.secs[at.i].items.length - 1 : 0, flat = true;
      // Uchwyt: przeciąganie myszą albo palcem, a z klawiatury strzałki w górę i w dół.
      var grip = flat ? el("button", { class: "link-btn grip", type: "button", "data-focus": "drag:" + it.id,
        "aria-label": "Przesuń: " + title + ". Strzałki w górę i w dół zmieniają miejsce.",
        onpointerdown: function (e) { startDrag(e, it.id); },
        onkeydown: function (e) {
          var dir = e.key === "ArrowUp" ? "up" : e.key === "ArrowDown" ? "down" : "";
          if (dir) { e.preventDefault(); moveGift(it.id, dir); }
        }
      }, [icon("", "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"), "Przeciągnij"]) : null;
      return el("div", { class: "owner" }, [
        groupPicker(it, title),
        grip,
        el("button", { class: "link-btn", type: "button", "data-focus": "ed:" + it.id, "aria-label": "Edytuj: " + title, text: "Edytuj",
          onclick: function () { openEdit(it); } }),
        flat ? el("button", { class: "link-btn", type: "button", "data-focus": "end:" + it.id, disabled: i >= lastI,
          "aria-label": "Przesuń na koniec " + (at && !at.secs[at.i].flat ? "grupy" : "listy") + ": " + title, text: "Na koniec", onclick: function () { moveGift(it.id, "end"); } }) : null,
        el("button", { class: "link-btn", type: "button", "data-focus": "rm:" + it.id, "aria-label": "Usuń z listy: " + title, text: "Usuń z listy",
          onclick: function () { S.confirmRemove = it.id; S.focusConfirm = true; render(); } })
      ]);
    }
    return el("div", { class: "owner confirm", role: "alert" }, [
      el("p", { text: "Usunąć ten prezent z listy? Jeśli ktoś go zarezerwował, rezerwacja też zniknie." }),
      el("div", { class: "confirm-actions" }, [
        el("button", { class: "d-btn btn-danger", type: "button", id: "rmok-" + it.id, "data-focus": "rmok:" + it.id, disabled: busy,
          text: busy ? "Usuwam…" : "Usuń", onclick: function () { removeGift(it.id); } }),
        el("button", { class: "d-btn d-btn--secondary btn-ghost", type: "button", disabled: busy, text: "Anuluj",
          onclick: function () { S.confirmRemove = null; render(); var b = document.querySelector('[data-focus="rm:' + it.id + '"]'); if (b) b.focus(); } })
      ])
    ]);
  }

  // Lista grup na kafelku: grupy z listy, gotowe propozycje, „Bez grupy” i „+ Nowa grupa…”.
  var NEW_GROUP = "__new__";
  function groupPicker(it, title) {
    var cur = str(it.group).trim(), busy = !!S.busy["gr:" + it.id];
    if (S.newGroup && S.newGroup.id === it.id) return newGroupForm(it, title);
    var opt = function (v, text) { return el("option", { value: v, text: text, selected: v === cur }); };
    var used = groupNames();
    var sel = el("select", { class: "group-pick", id: "gp-" + it.id, "data-focus": "gp:" + it.id, disabled: busy,
      "aria-label": "Grupa prezentu: " + title,
      onchange: function () {
        if (sel.value === NEW_GROUP) { S.newGroup = { id: it.id, name: "", err: "", fresh: true }; render(); return; }
        setGroup(it.id, sel.value);
      }
    }, [
      opt("", "Bez grupy"),
      used.length ? el("optgroup", { label: "Na liście" }, used.map(function (g) { return opt(g, g); })) : null,
      suggestedGroups().length ? el("optgroup", { label: "Propozycje" }, suggestedGroups().map(function (g) { return opt(g, g); })) : null,
      el("option", { value: NEW_GROUP, text: "+ Nowa grupa…" })
    ]);
    return el("label", { class: "group-field" }, [el("span", { text: "Grupa" }), sel]);
  }
  function newGroupForm(it, title) {
    var N = S.newGroup;
    var cancel = function () {
      S.newGroup = null; render();
      var s = document.getElementById("gp-" + it.id); if (s) s.focus({ preventScroll: true });
    };
    var inp = el("input", { type: "text", class: "group-new", id: "gn-" + it.id, maxlength: "40", autocomplete: "off",
      placeholder: "np. Kuchnia", "data-focus": "gn:" + it.id, "aria-label": "Nazwa nowej grupy dla: " + title,
      oninput: function () { N.name = inp.value; },
      onkeydown: function (e) { if (e.key === "Escape") { e.preventDefault(); cancel(); } }
    });
    inp.value = N.name;
    if (N.fresh) { N.fresh = false; setTimeout(function () { var f = document.getElementById("gn-" + it.id); if (f) f.focus({ preventScroll: true }); }, 0); }
    return el("form", { class: "group-field new", onsubmit: function (e) {
      e.preventDefault();
      var name = canonGroup(N.name);
      if (!name) { N.err = "Wpisz nazwę grupy."; render(); return; }
      S.newGroup = null; setGroup(it.id, name);
      var s = document.getElementById("gp-" + it.id); if (s) s.focus({ preventScroll: true });
    } }, [
      inp,
      el("button", { class: "d-btn btn-primary btn-small", type: "submit", text: "Dodaj" }),
      el("button", { class: "d-btn d-btn--secondary btn-ghost btn-small", type: "button", text: "Anuluj", onclick: cancel }),
      el("div", { class: "err", role: "alert", text: N.err })
    ]);
  }
  // Prezent trafia na koniec wybranej grupy; nowa grupa staje przed „Pozostałe”. Kolejność grup się nie zmienia.
  function setGroup(id, name) {
    var at = sectionOf(id);
    if (!at) return;
    var it = at.secs[at.i].items[at.j], secs = at.secs;
    name = canonGroup(name);
    if (str(it.group).trim() === name) { render(); return; }
    secs[at.i].items.splice(at.j, 1);
    it.group = name;
    var key = name ? "g:" + name.toLowerCase() : "", target = null, k;
    for (k = 0; k < secs.length; k++) {
      if (name ? secs[k].key === key : (secs[k].rest || secs[k].flat)) { target = secs[k]; break; }
    }
    if (!target) {
      target = { key: key, label: name, items: [] };
      var restAt = secs.length;
      for (k = 0; k < secs.length; k++) if (secs[k].rest || secs[k].flat) restAt = k;
      secs.splice(name ? restAt : secs.length, 0, target);
    }
    target.items.push(it);
    // Przy dużej grupie otwieramy ją, żeby było widać, gdzie prezent trafił.
    delete S.groupsOpen[target.key];
    lsSet(pk("gift-groups"), JSON.stringify(S.groupsOpen));
    var key2 = adminKey();
    applyOrder(secs, function () {
      return api.post({ action: "edit", key: key2, id: id, title: it.title, price: it.price, desc: it.desc, shop: it.shop, url: it.url, group: name })
        .then(function (r) {
          if (r && r.ok) return true;
          S.error = r && r.error === "bad_key"
            ? "Klucz tej listy nie pasuje. Wklej go ponownie w aplikacji „Dodaj prezent”."
            : "Nie udało się zmienić grupy. Pokazuję aktualną listę.";
        });
    });
  }

  var EDIT_FIELDS = [
    { k: "title", label: "Nazwa", max: 120 },
    { k: "price", label: "Cena", max: 40, ph: "np. ok. 150 zł" },
    { k: "desc", label: "Opis", max: 300, area: true },
    { k: "shop", label: "Sklep", max: 60 },
    { k: "url", label: "Link", max: 500, mode: "url", ph: "https://…" },
    { k: "group", label: "Grupa", max: 40, ph: "np. Książki (puste = Pozostałe)", list: true }
  ];
  function openEdit(it) {
    S.edit = { id: it.id, title: it.title, price: it.price, desc: it.desc, shop: it.shop, url: it.url, group: it.group, err: "", fresh: true };
    S.confirmRemove = null; render();
  }
  function closeEdit(id) {
    S.edit = null; render();
    var b = document.querySelector('[data-focus="ed:' + id + '"]'); if (b) b.focus();
  }
  function editForm(it) {
    var E = S.edit, busy = !!S.busy["ed:" + it.id];
    var fields = EDIT_FIELDS.map(function (f) {
      var id = "ed-" + f.k + "-" + it.id;
      var inp = el(f.area ? "textarea" : "input", {
        id: id, class: f.area ? "input" : null, type: f.area ? null : "text", inputmode: f.mode || null, maxlength: String(f.max),
        placeholder: f.ph || null, "data-focus": "edf:" + f.k + ":" + it.id, list: f.list ? "groups-" + it.id : null,
        autocomplete: f.list ? "off" : null,
        oninput: function () { E[f.k] = inp.value; }
      });
      inp.value = E[f.k] || "";
      // Podpowiedzi istniejących grup, żeby „Lego” i „LEGO” nie robiły dwóch sekcji.
      var dl = f.list ? el("datalist", { id: "groups-" + it.id }, groupNames().concat(suggestedGroups()).map(function (g) { return el("option", { value: g }); })) : null;
      return el("div", { class: "d-field" }, [el("label", { for: id, text: f.label }), inp, dl]);
    });
    var fresh = E.fresh; E.fresh = false;
    var form = el("form", { class: "owner edit-form" + (fresh ? " enter" : ""), onsubmit: function (e) { e.preventDefault(); saveEdit(it.id); } }, fields.concat([
      el("div", { class: "err", role: "alert", text: E.err }),
      el("div", { class: "confirm-actions" }, [
        el("button", { class: "d-btn btn-primary", type: "submit", disabled: busy, "data-focus": "edok:" + it.id, text: busy ? "Zapisuję…" : "Zapisz" }),
        el("button", { class: "d-btn d-btn--secondary btn-ghost", type: "button", disabled: busy, text: "Anuluj", onclick: function () { closeEdit(it.id); } })
      ])
    ]));
    if (fresh) setTimeout(function () { var f = document.getElementById("ed-title-" + it.id); if (f) f.focus({ preventScroll: true }); }, 0);
    return form;
  }
  function saveEdit(id) {
    var E = S.edit, k = "ed:" + id;
    if (!E || S.busy[k]) return;
    if (!String(E.title || "").trim()) { E.err = "Wpisz nazwę prezentu."; render(); return; }
    var url = String(E.url || "").trim();
    if (url && !/^https?:\/\//i.test(url)) { E.err = "Link musi zaczynać się od https://"; render(); return; }
    S.busy[k] = true; E.err = ""; render();
    api.post({ action: "edit", key: adminKey(), id: id, title: E.title, price: E.price, desc: E.desc, shop: E.shop, url: url, group: E.group || "" }).then(function (r) {
      if (r && r.ok) { S.edit = null; return; }
      E.err = r && r.error === "bad_key" ? "Klucz tej listy nie pasuje. Wklej go ponownie w aplikacji „Dodaj prezent”."
        : r && r.error === "not_found" ? "Tego prezentu już nie ma na liście."
        : "Nie udało się zapisać. Spróbuj ponownie.";
    }).catch(function () {
      E.err = "Nie udało się zapisać. Sprawdź połączenie i spróbuj ponownie.";
    }).then(function () {
      S.busy[k] = false;
      var done = !S.edit;
      return refresh().then(function () {
        if (done) { var b = document.querySelector('[data-focus="ed:' + id + '"]'); if (b) b.focus({ preventScroll: true }); }
      });
    });
  }

  function removeGift(id) {
    var k = "rm:" + id;
    if (S.busy[k]) return;
    S.busy[k] = true; render();
    api.post({ action: "remove", id: id, key: adminKey() }).then(function (r) {
      if (!r || !r.ok) S.error = r && r.error === "bad_key"
        ? "Klucz tej listy nie pasuje. Wklej go ponownie w aplikacji „Dodaj prezent”."
        : "Nie udało się usunąć prezentu. Spróbuj ponownie.";
    }).catch(function () {
      S.error = "Nie udało się usunąć prezentu. Sprawdź połączenie i spróbuj ponownie.";
    }).then(function () {
      S.busy[k] = false; S.confirmRemove = null;
      return refresh();
    });
  }

  // Przesunięcie widać od razu; zapisy (pełna nowa kolejność) idą po kolei, więc szybkie klikanie
  // nie miesza kolejności. Dopóki coś czeka w kolejce, odświeżanie nie nadpisuje lokalnej kolejności.
  var moveChain = Promise.resolve();
  S.moving = 0;
  // `before` (opcjonalnie) to zapis wykonany przed kolejnością; zwraca false, gdy się nie udał.
  function applyOrder(secs, before) {
    var order = [];
    secs.forEach(function (g) { order = order.concat(g.items); });
    S.items = order;
    var ids = order.map(function (x) { return x.id; }), key = adminKey();
    S.moving++; S.error = ""; render();
    moveChain = moveChain.then(function () {
      return (before ? before() : Promise.resolve(true)).then(function (ok) {
        if (!ok) return { ok: true };
        return api.post({ action: "reorder", ids: ids, key: key });
      }).then(function (r) {
        if (!r || !r.ok) S.error = r && r.error === "bad_key"
          ? "Klucz tej listy nie pasuje. Wklej go ponownie w aplikacji „Dodaj prezent”."
          : "Nie udało się zapisać nowej kolejności. Pokazuję aktualną listę.";
      }).catch(function () {
        S.error = "Nie udało się zapisać zmian. Sprawdź połączenie.";
      }).then(function () {
        S.moving--;
        if (!S.moving) { var err = S.error; return refresh().then(function () { if (err) { S.error = err; render(); } }); }
      });
    });
  }
  function moveGift(id, dir) {
    var at = sectionOf(id);
    if (!at) return;
    var n = at.secs[at.i].items.length;
    moveTo(id, dir === "up" ? at.j - 1 : dir === "down" ? at.j + 1 : n - 1);
  }
  // `to` = nowe miejsce w obrębie grupy prezentu.
  function moveTo(id, to) {
    var at = sectionOf(id);
    if (!at) return;
    var list = at.secs[at.i].items;
    if (to < 0 || to >= list.length || to === at.j) return;
    list.splice(to, 0, list.splice(at.j, 1)[0]);
    applyOrder(at.secs);
  }
  function sectionIndex(secs, key) {
    for (var k = 0; k < secs.length; k++) if (secs[k].key === key) return k;
    return -1;
  }
  function moveSection(key, dir) {
    var i = sectionIndex(sections(), key);
    if (i >= 0) moveSectionTo(key, dir === "up" ? i - 1 : i + 1);
  }
  // `to` = nowe miejsce grupy; „Pozostałe” zostaje na końcu.
  function moveSectionTo(key, to) {
    var secs = sections(), i = sectionIndex(secs, key);
    if (i < 0 || to < 0 || to >= secs.length || to === i || secs[i].rest || secs[to].rest) return;
    secs.splice(to, 0, secs.splice(i, 1)[0]);
    applyOrder(secs);
  }

  // ---------- przeciąganie ----------
  // Tylko za uchwyt (touch-action: none), więc przewijanie strony palcem działa jak zwykle.
  // Pozycje liczymy względem strony, żeby autoprzewijanie przy krawędzi nie psuło obliczeń.
  var D = null;
  function startDrag(e, id) {
    if (D || (e.pointerType === "mouse" && e.button !== 0)) return;
    var handle = e.currentTarget, li = handle.closest("li.gift");
    if (!li || !li.parentNode) return;
    var lis = Array.prototype.slice.call(li.parentNode.children);
    var from = lis.indexOf(li);
    var at = sectionOf(id);
    if (from < 0 || !at || lis.length !== at.secs[at.i].items.length) return;
    beginDrag(e, { li: li, lis: lis, from: from, box: li.parentNode, cls: "sorting", off: 0,
      commit: function (to) { moveTo(id, to); } });
  }
  // Grupy: na czas przeciągania wszystkie zwijają się do nagłówków, a strona przewija się tak,
  // żeby chwycony nagłówek został pod palcem.
  function startGroupDrag(e, key) {
    if (D || (e.pointerType === "mouse" && e.button !== 0)) return;
    var handle = e.currentTarget, box = document.getElementById("groups"), g = handle.closest("details.group");
    if (!g || !box) return;
    var els = Array.prototype.filter.call(box.children, function (x) { return x.getAttribute("data-group") !== "rest"; });
    var from = els.indexOf(g);
    var movable = sections().filter(function (s) { return !s.rest; }).length;
    if (from < 0 || els.length !== movable) return;
    var before = g.getBoundingClientRect().top;
    box.classList.add("sorting-groups");
    window.scrollBy(0, g.getBoundingClientRect().top - before);
    beginDrag(e, { li: g, lis: els, from: from, box: box, cls: "sorting-groups", key: key,
      off: before - g.getBoundingClientRect().top,
      commit: function (to) { moveSectionTo(key, to); } });
  }
  function beginDrag(e, o) {
    e.preventDefault();
    var sy = window.scrollY;
    D = o;
    D.to = o.from; D.y = e.clientY; D.startY = e.clientY + sy; D.handle = e.currentTarget;
    D.rects = o.lis.map(function (l) { var r = l.getBoundingClientRect(); return { top: r.top + sy, h: r.height }; });
    D.h = D.rects[o.from].h;
    // Odstęp między elementami (grupy mają przerwę, prezenty nie).
    D.gap = D.rects.length > 1 ? Math.max(0, D.rects[1].top - D.rects[0].top - D.rects[0].h) : 0;
    S.dragging = true;
    try { D.handle.setPointerCapture(e.pointerId); } catch (err) {}
    D.handle.addEventListener("pointermove", dragMove);
    D.handle.addEventListener("pointerup", dragUp);
    D.handle.addEventListener("pointercancel", dragCancel);
    D.li.classList.add("dragging");
    D.box.classList.add(D.cls);
    document.documentElement.classList.add("is-dragging");
    if (D.off) layoutDrag();
    D.raf = requestAnimationFrame(autoScroll);
  }
  function dragMove(e) { if (D) { D.y = e.clientY; layoutDrag(); } }
  function layoutDrag() {
    var dy = D.y + window.scrollY - D.startY + D.off, r = D.rects, center = r[D.from].top + D.h / 2 + dy, to = D.from, j;
    for (j = D.from + 1; j < r.length; j++) if (r[j].top + r[j].h / 2 < center) to = j;
    for (j = D.from - 1; j >= 0; j--) if (r[j].top + r[j].h / 2 > center) to = j;
    D.to = to;
    D.li.style.transform = "translateY(" + dy + "px)";
    var step = D.h + D.gap;
    D.lis.forEach(function (l, k) {
      if (k === D.from) return;
      var shift = D.from < to && k > D.from && k <= to ? -step : to < D.from && k >= to && k < D.from ? step : 0;
      l.style.transform = shift ? "translateY(" + shift + "px)" : "";
    });
  }
  function autoScroll() {
    if (!D) return;
    var edge = 80, v = 0, h = window.innerHeight;
    if (D.y < edge) v = -(edge - D.y) / 3;
    else if (D.y > h - edge) v = (D.y - (h - edge)) / 3;
    if (v) { window.scrollBy(0, v); layoutDrag(); }
    D.raf = requestAnimationFrame(autoScroll);
  }
  function endDrag(commit) {
    if (!D) return;
    var d = D; D = null;
    cancelAnimationFrame(d.raf);
    d.handle.removeEventListener("pointermove", dragMove);
    d.handle.removeEventListener("pointerup", dragUp);
    d.handle.removeEventListener("pointercancel", dragCancel);
    // Gdzie nagłówek grupy był w chwili upuszczenia, żeby po rozwinięciu grup został w tym miejscu.
    var dropTop = d.key ? d.li.getBoundingClientRect().top : 0;
    d.lis.forEach(function (l) { l.style.transform = ""; });
    d.li.classList.remove("dragging");
    d.box.classList.remove(d.cls);
    document.documentElement.classList.remove("is-dragging");
    S.dragging = false;
    var pending = S.renderPending; S.renderPending = false;
    if (commit && d.to !== d.from) d.commit(d.to);
    else if (pending) render();
    if (d.key) {
      var g = document.querySelector('#groups [data-group="' + d.key + '"]');
      if (g) window.scrollBy(0, g.getBoundingClientRect().top - dropTop);
    }
  }
  function dragUp() { endDrag(true); }
  function dragCancel() { endDrag(false); }

  // ---------- akcje ----------
  function openForm(id) { S.openClaim = id; S.draft = S.myName; S.claimErr = null; S.formFresh = true; render(); }
  function closeForm(id) {
    S.openClaim = null; S.claimErr = null; render();
    var b = document.querySelector('[data-focus="claim:' + id + '"]'); if (b) b.focus();
  }

  function refresh() {
    if (!PEOPLE[PERSON]) { S.error = "Nie ma takiej listy. Wybierz osobę na stronie głównej."; render(); return Promise.resolve(); }
    return api.list().then(function (d) {
      if (!d || !d.ok) throw new Error((d && d.error) || "bad");
      if (!S.moving) S.items = (d.items || []).map(function (x) {
        return { id: str(x.id), title: str(x.title), desc: str(x.desc), price: str(x.price), shop: str(x.shop), url: str(x.url), group: typeof x.group === "string" ? x.group.trim() : "" };
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
    if (OWNER) ssSet("gift-show:" + PERSON, S.surprise ? "0" : "1");
    else lsSet(pk("gift-surprise"), S.surprise ? "1" : "0");
    S.openClaim = null;
    render();
  });

  // Odświeżaj co jakiś czas i po powrocie do karty. Gdy formularz jest otwarty, czekamy,
  // żeby nie przebudowywać pola w trakcie pisania (render i tak zachowuje wpisany tekst).
  setInterval(function () { if (!document.hidden && !S.openClaim && !S.confirmRemove && !S.edit && !S.newGroup && !S.dragging) refresh(); }, POLL_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !S.openClaim && !S.confirmRemove && !S.edit && !S.newGroup && !S.dragging) refresh(); });

  render();
  refresh();
})();
