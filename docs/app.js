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
  var PRICE = window.GiftPrice;

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
    // Rezerwacje: { id: [{ name, token }, …] }. Starszy zapis (jeden obiekt) zamieniamy na listę.
    function load() {
      var d = lsJson(KEY);
      if (d && d.items) {
        Object.keys(d.claims || {}).forEach(function (id) { if (!Array.isArray(d.claims[id])) d.claims[id] = [d.claims[id]]; });
        d.claims = d.claims || {};
        return d;
      }
      return {
        items: [
          { id: "a1", title: "Kubek termiczny", desc: "Najlepiej zielony, ok. 450 ml", price: "ok. 120 zł", shop: "Allegro", url: "https://allegro.pl" },
          { id: "a2", title: "Książka „Projekt Hail Mary”", desc: "Andy Weir, wydanie w twardej oprawie", price: "ok. 55 zł", shop: "Empik", url: "https://www.empik.com" },
          { id: "a3", title: "Skarpetki w lisy", desc: "Rozmiar 43–46", price: "ok. 30 zł", shop: "", url: "" },
          { id: "a4", title: "Słuchawki bezprzewodowe", desc: "Nauszne, z redukcją szumów", price: "ok. 350–420 zł", shop: "Media Expert", url: "https://www.mediaexpert.pl" },
          { id: "a5", title: "Ekspres przelewowy", desc: "Z termosem zamiast szklanego dzbanka", price: "ok. 950–1150 zł", shop: "", url: "https://www.ceneo.pl", group: true },
          { id: "a6", title: "Gra planszowa „Wsiąść do pociągu: Europa”", desc: "", price: "ok. 100 zł", shop: "Rebel", url: "https://www.rebel.pl" },
          { id: "a7", title: "Plecak na rower", desc: "Wodoodporny, 20–25 l", price: "1149,99 zł", shop: "Decathlon", url: "https://www.decathlon.pl" },
          { id: "a8", title: "Kurs ceramiki dla dwojga", desc: "Dowolna pracownia w Warszawie", price: "ok. 280 zł", shop: "", url: "" },
          { id: "a9", title: "Niespodzianka", desc: "Coś, co Twoim zdaniem mi się spodoba", price: "", shop: "", url: "" }
        ],
        claims: {
          a2: [{ name: "Ciocia Basia", token: "someone-else-token" }],
          a4: [{ name: "Marek", token: "another-token" }],
          a5: [{ name: "Ania", token: "third-token" }, { name: "Wujek Staszek", token: "fourth-token" }]
        }
      };
    }
    function save(d) { lsSet(KEY, JSON.stringify(d)); }
    function later(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 250); }); }
    return {
      list: function () {
        var d = load(), claims = {};
        var items = d.items.map(function (it) { var x = {}; for (var k in it) x[k] = it[k]; return x; });
        items.forEach(function (it) {
          var rs = d.claims[it.id];
          if (!rs || !rs.length) return;
          if (rs.length > 1) it.group = true;
          var people = rs.map(function (c) { return { name: c.name, mine: c.token === TOKEN }; });
          claims[it.id] = { name: people.map(function (p) { return p.name; }).join(", "), mine: people.some(function (p) { return p.mine; }), people: people };
        });
        return later({ ok: true, items: items, claims: claims });
      },
      post: function (b) {
        var d = load(), rs = d.claims[b.id] || [];
        var mine = rs.filter(function (c) { return c.token === TOKEN; })[0];
        var item = d.items.filter(function (x) { return x.id === b.id; })[0];
        if (b.action === "remove") {
          if (b.key !== "demo") return later({ ok: false, error: "bad_key" });
          d.items = d.items.filter(function (it) { return it.id !== b.id; });
          delete d.claims[b.id];
        } else if (b.action === "move") {
          if (b.key !== "demo") return later({ ok: false, error: "bad_key" });
          var it = d.items.filter(function (x) { return x.id === b.id; })[0];
          if (!it) return later({ ok: false, error: "not_found" });
          d.items = d.items.filter(function (x) { return x !== it; });
          var at = b.before ? d.items.map(function (x) { return x.id; }).indexOf(b.before) : -1;
          d.items.splice(at < 0 ? d.items.length : at, 0, it);
        } else if (b.action === "edit") {
          if (b.key !== "demo") return later({ ok: false, error: "bad_key" });
          if (!item) return later({ ok: false, error: "not_found" });
          if (!String(b.title || "").trim()) return later({ ok: false, error: "no_title" });
          ["title", "desc", "price", "shop", "url"].forEach(function (k) { item[k] = String(b[k] || "").trim(); });
          item.group = b.group === true;
        } else if (b.action === "claim") {
          if (!item) return later({ ok: false, error: "not_found" });
          if (mine) mine.name = b.name;
          else if (rs.length && !item.group && rs.length < 2) return later({ ok: false, error: "taken" });
          else d.claims[b.id] = rs.concat([{ name: b.name, token: TOKEN }]);
        } else if (b.action === "unclaim") {
          if (!mine) return later({ ok: false, error: "not_yours" });
          d.claims[b.id] = rs.filter(function (c) { return c !== mine; });
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
  // Składka nigdy nie jest „zajęta”: zawsze można się dołożyć.
  function taken(it) { return !it.group && !!claimOf(it.id); }
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

  function renderGroups() {
    var box = document.getElementById("groups");
    box.textContent = "";
    if (!S.loaded) { if (!S.error) box.appendChild(el("p", { class: "empty", text: "Ładuję listę…" })); return; }
    if (!S.items.length) { box.appendChild(el("p", { class: "empty", text: "Lista jest jeszcze pusta." })); return; }

    // Bez podziału cenowego (domyślnie): jedna lista w kolejności z arkusza.
    if (!CFG.groupByPrice || !PRICE) {
      box.appendChild(el("div", { class: "group flat" }, [el("ul", { class: "gifts", "aria-label": "Prezenty" }, S.items.map(card))]));
      return;
    }
    var byKey = {};
    S.items.forEach(function (it) { var k = PRICE.groupOf(it.price); (byKey[k] = byKey[k] || []).push(it); });
    PRICE.GROUPS.forEach(function (g) { if (byKey[g.key]) box.appendChild(group(g, byKey[g.key])); });
  }

  function group(g, items) {
    var total = items.length;
    var free = items.filter(function (it) { return !taken(it); }).length;
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

    if (it.group) {
      var people = (c && c.people) || [];
      if (!S.surprise) act.appendChild(el("div", { class: "who" }, [
        el("span", { text: people.length
          ? "Dokładają się: " + people.map(function (p) { return p.mine ? "Ty" : (str(p.name).trim() || "ktoś"); }).join(", ")
          : "Możecie złożyć się na to w kilka osób." })
      ]));
      if (mine) {
        act.appendChild(el("span", { class: "tag-mine" + (S.justClaimed === it.id ? " pop" : "") }, [icon("", "M5 12.5l4.5 4.5L19 7.5"), "Dokładasz się"]));
        act.appendChild(el("button", {
          class: "d-btn d-btn--secondary btn-ghost", type: "button", disabled: busy, "data-focus": "unclaim:" + it.id,
          "aria-label": "Wycofaj się ze składki: " + title,
          text: busy ? "Wycofuję…" : "Wycofaj się", onclick: function () { unclaim(it.id); }
        }));
      } else if (!S.surprise) {
        if (S.openClaim === it.id) form = claimForm(it, busy, "Jak się podpiszesz? Pozostali ze składki zobaczą Twoje imię, żebyście ustalili, kto kupuje.", "Dołączam", "Dołączam…");
        else act.appendChild(el("button", {
          class: "d-btn btn-primary", type: "button", "data-focus": "claim:" + it.id,
          "aria-label": "Dołączam do składki: " + title, text: "Dołączam się",
          onclick: function () { openForm(it.id); }
        }));
      }
    } else if (mine) {
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
        form = claimForm(it, busy, "Jak się podpiszesz? Zobaczą to inne osoby z listy (" + OWNER_NOM + " może to ukryć).", "Potwierdź", "Rezerwuję…");
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
          it.group ? el("span", { class: "d-tag d-tag--note", text: "Składka" }) : null,
          url ? el("a", { class: "shop", href: url, target: "_blank", rel: "noopener noreferrer", text: "Zobacz w " + (it.shop || "sklepie") + " ↗" }) : null
        ])
      ]),
      act.childNodes.length ? act : null,
      form,
      ownerRow(it, title)
    ]);
  }

  function claimForm(it, busy, label, ok, okBusy) {
    var inp = el("input", {
      type: "text", id: "name-" + it.id, placeholder: "np. Ciocia Basia", maxlength: "40",
      autocomplete: "name", "data-focus": "name:" + it.id,
      oninput: function () { S.draft = inp.value; }
    });
    inp.value = S.draft;
    return el("form", { class: "claim-form" + (S.formFresh ? " enter" : ""), onsubmit: function (e) { e.preventDefault(); claim(it.id, inp.value.trim()); } }, [
      el("label", { for: "name-" + it.id, text: label }),
      inp,
      el("button", { class: "d-btn btn-primary", type: "submit", disabled: busy, "data-focus": "confirm:" + it.id, text: busy ? okBusy : ok }),
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
      // Przesuwanie tylko w zwykłej liście: przy podziale cenowym kolejność i tak miesza grupa.
      var i = S.items.indexOf(it), lastI = S.items.length - 1, flat = !CFG.groupByPrice;
      function mv(dir, label, text, off) {
        return el("button", { class: "link-btn", type: "button", "data-focus": dir + ":" + it.id, disabled: off,
          "aria-label": label + ": " + title, text: text, onclick: function () { moveGift(it.id, dir); } });
      }
      return el("div", { class: "owner" }, [
        el("button", { class: "link-btn", type: "button", "data-focus": "ed:" + it.id, "aria-label": "Edytuj: " + title, text: "Edytuj",
          onclick: function () { openEdit(it); } }),
        flat ? mv("up", "Przesuń wyżej", "↑ Wyżej", i <= 0) : null,
        flat ? mv("down", "Przesuń niżej", "↓ Niżej", i >= lastI) : null,
        flat ? mv("end", "Przesuń na koniec listy", "Na koniec", i >= lastI) : null,
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

  var EDIT_FIELDS = [
    { k: "title", label: "Nazwa", max: 120 },
    { k: "price", label: "Cena", max: 40, ph: "np. ok. 150 zł" },
    { k: "desc", label: "Opis", max: 300, area: true },
    { k: "shop", label: "Sklep", max: 60 },
    { k: "url", label: "Link", max: 500, mode: "url", ph: "https://…" }
  ];
  function openEdit(it) {
    S.edit = { id: it.id, title: it.title, price: it.price, desc: it.desc, shop: it.shop, url: it.url, group: !!it.group, err: "", fresh: true };
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
        placeholder: f.ph || null, "data-focus": "edf:" + f.k + ":" + it.id,
        oninput: function () { E[f.k] = inp.value; }
      });
      inp.value = E[f.k] || "";
      return el("div", { class: "d-field" }, [el("label", { for: id, text: f.label }), inp]);
    });
    var chk = el("input", { type: "checkbox", class: "d-check", id: "ed-group-" + it.id, checked: E.group, "data-focus": "edf:group:" + it.id,
      onchange: function () { E.group = chk.checked; } });
    var fresh = E.fresh; E.fresh = false;
    var form = el("form", { class: "owner edit-form" + (fresh ? " enter" : ""), onsubmit: function (e) { e.preventDefault(); saveEdit(it.id); } }, fields.concat([
      el("label", { class: "check-row", for: "ed-group-" + it.id }, [chk, el("span", { text: "Składka: kilka osób może się dołożyć" })]),
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
    api.post({ action: "edit", key: adminKey(), id: id, title: E.title, price: E.price, desc: E.desc, shop: E.shop, url: url, group: E.group }).then(function (r) {
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

  // Przesunięcie widać od razu; zapisy idą po kolei, więc szybkie klikanie nie miesza kolejności.
  // Dopóki coś czeka w kolejce, odświeżanie nie nadpisuje lokalnej kolejności.
  var moveChain = Promise.resolve();
  S.moving = 0;
  function moveGift(id, dir) {
    var from = -1;
    S.items.forEach(function (x, j) { if (x.id === id) from = j; });
    var to = dir === "up" ? from - 1 : dir === "down" ? from + 1 : S.items.length - 1;
    if (from < 0 || to < 0 || to >= S.items.length || to === from) return;
    var it = S.items.splice(from, 1)[0];
    S.items.splice(to, 0, it);
    var before = S.items[to + 1] ? S.items[to + 1].id : "";
    var key = adminKey();
    S.moving++; S.error = ""; render();
    moveChain = moveChain.then(function () {
      return api.post({ action: "move", id: id, before: before, key: key }).then(function (r) {
        if (!r || !r.ok) S.error = r && r.error === "bad_key"
          ? "Klucz tej listy nie pasuje. Wklej go ponownie w aplikacji „Dodaj prezent”."
          : "Nie udało się zapisać nowej kolejności. Pokazuję aktualną listę.";
      }).catch(function () {
        S.error = "Nie udało się zapisać nowej kolejności. Sprawdź połączenie.";
      }).then(function () {
        S.moving--;
        if (!S.moving) { var err = S.error; return refresh().then(function () { if (err) { S.error = err; render(); } }); }
      });
    });
  }

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
        return { id: str(x.id), title: str(x.title), desc: str(x.desc), price: str(x.price), shop: str(x.shop), url: str(x.url), group: x.group === true };
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
        : r && r.error === "full" ? "Ta składka ma już komplet osób."
        : "Nie udało się zapisać. Spróbuj ponownie za chwilę." };
      if (r && r.error === "taken") S.openClaim = null;
    }).catch(function () {
      S.claimErr = { id: id, msg: "Nie udało się zapisać. Spróbuj ponownie za chwilę." };
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
      if (!r || !r.ok) S.error = "Nie udało się anulować. Spróbuj ponownie.";
    }).catch(function () {
      S.error = "Nie udało się anulować. Spróbuj ponownie.";
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
  setInterval(function () { if (!document.hidden && !S.openClaim && !S.confirmRemove && !S.edit) refresh(); }, POLL_MS);
  document.addEventListener("visibilitychange", function () { if (!document.hidden && !S.openClaim && !S.confirmRemove && !S.edit) refresh(); });

  render();
  refresh();
})();
