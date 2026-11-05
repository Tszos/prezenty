(function () {
  "use strict";

  var CFG = window.GIFT_CONFIG || {};
  var PEOPLE = CFG.people || {};
  var KEYS_LS = "gift-admin-keys";
  var LAST_LS = "gift-add-last";

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function loadKeys() { try { var v = JSON.parse(lsGet(KEYS_LS)); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  function saveKeys() { lsSet(KEYS_LS, JSON.stringify(S.keys)); }

  var S = {
    keys: loadKeys(),
    person: lsGet(LAST_LS) || "",
    form: { title: "", price: "", desc: "", shop: "", url: "" },
    touched: {},          // pola, które użytkownik sam zmienił: podgląd ich nie nadpisuje
    preview: "",          // "", "loading", "done", "none"
    busy: false, error: "", done: null, notice: "",
    shared: false,        // otwarte z menu Udostępnij: pokazujemy szybkie przyciski list
    editing: false        // „Popraw przed dodaniem”
  };

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
  function gen(k) { return (PEOPLE[k] && PEOPLE[k].nameGen) || k; }
  function nom(k) { return (PEOPLE[k] && PEOPLE[k].name) || k; }
  function keyed() { return Object.keys(PEOPLE).filter(function (k) { return S.keys[k]; }); }
  function isDemo(k) { return !(PEOPLE[k] && PEOPLE[k].apiUrl); }

  // Nazwa sklepu z adresu, gdy strona sama jej nie podała.
  var SHOPS = { allegro: "Allegro", empik: "Empik", ceneo: "Ceneo", mediaexpert: "Media Expert", "x-kom": "x-kom",
    decathlon: "Decathlon", rebel: "Rebel", amazon: "Amazon", ikea: "IKEA", zalando: "Zalando", morele: "Morele",
    euro: "RTV Euro AGD", mediamarkt: "MediaMarkt", olx: "OLX", lego: "LEGO", smyk: "Smyk", rossmann: "Rossmann",
    sephora: "Sephora", notino: "Notino", taniaksiazka: "TaniaKsiążka", bonito: "Bonito", aliexpress: "AliExpress", temu: "Temu" };
  function shopFromUrl(u) {
    try {
      var parts = new URL(u).hostname.replace(/^www\.|^m\./, "").split(".");
      var name = parts.length > 2 && /^(com|co|org)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] || parts[0];
      if (/^(share|google|goo|bit|tinyurl)$/.test(name)) return "";
      return SHOPS[name] || (name.charAt(0).toUpperCase() + name.slice(1));
    } catch (e) { return ""; }
  }
  // „149” albo „149,99” bez waluty dostaje „zł”.
  function normPrice(p) {
    p = String(p || "").trim();
    return /^\d[\d\s]*([.,]\d{1,2})?$/.test(p) ? p.replace(".", ",") + " zł" : p;
  }

  // ---------- backend ----------
  function api(k) {
    var url = PEOPLE[k] && PEOPLE[k].apiUrl;
    if (!url) return demoApi(k);
    return {
      check: function (key) { return getJson(url, { action: "check", key: key }); },
      preview: function (key, u, t) { return getJson(url, { action: "preview", key: key, url: u, title: t || "" }); },
      add: function (key, item) {
        item.action = "add"; item.key = key;
        return fetch(url, { method: "POST", redirect: "follow", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(item) })
          .then(function (r) { return r.json(); });
      }
    };
  }
  function getJson(url, params) {
    var q = Object.keys(params).map(function (k) { return k + "=" + encodeURIComponent(params[k]); }).join("&");
    return fetch(url + (url.indexOf("?") >= 0 ? "&" : "?") + q, { redirect: "follow" }).then(function (r) { return r.json(); });
  }
  // Tryb demo (pusty apiUrl): klucz „demo”, prezenty trafiają do danych demo listy w tej przeglądarce.
  function demoApi(k) {
    function later(v) { return new Promise(function (res) { setTimeout(function () { res(v); }, 300); }); }
    return {
      check: function (key) { return later({ ok: key === "demo" }); },
      preview: function () { return later({ ok: true, title: "", price: "", shop: "" }); },
      add: function (key, item) {
        if (key !== "demo") return later({ ok: false, error: "bad_key" });
        var lsKey = k === "tomek" ? "gift-demo-v2" : "gift-demo-v2:" + k, d;
        try { d = JSON.parse(lsGet(lsKey)); } catch (e) {}
        if (d && d.items) {
          d.items.push({ id: "n" + Date.now(), title: item.title, desc: item.desc, price: item.price, shop: item.shop, url: item.url });
          lsSet(lsKey, JSON.stringify(d));
        }
        return later({ ok: true });
      }
    };
  }

  // ---------- dane z menu Udostępnij i link z kluczami ----------
  function readShare() {
    var q = new URLSearchParams(location.search);
    var text = q.get("text") || "", url = q.get("url") || "", title = q.get("title") || "";
    var m = text.match(/https?:\/\/\S+/);
    if (!url && m) url = m[0];
    // Android często wkleja link do pola „text”, czasem razem z nazwą.
    var rest = text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
    if (!title && rest) title = rest;
    if (title && /^https?:\/\//.test(title)) title = "";
    if (url) {
      S.form.url = url.replace(/[)\].,]+$/, "");
      S.form.shop = shopFromUrl(S.form.url);
    }
    if (title) S.form.title = title.slice(0, 200);
    S.shared = !!(S.form.url || S.form.title);
  }

  // Link konfiguracyjny: …/dodaj/#klucze=tomek:abc,ania:def (część po # nie trafia na serwer).
  function readKeysFromHash() {
    var m = /[#&]klucze=([^&]+)/.exec(location.hash);
    if (!m) return;
    var added = [];
    decodeURIComponent(m[1]).split(",").forEach(function (pair) {
      var i = pair.indexOf(":"), k = pair.slice(0, i), v = pair.slice(i + 1).trim();
      if (PEOPLE[k] && v) { S.keys[k] = v; added.push(nom(k)); }
    });
    saveKeys();
    history.replaceState(null, "", location.pathname + location.search);
    if (added.length) S.notice = "Zapisano na tym telefonie klucze do list: " + added.join(", ") + ".";
  }

  // ---------- widoki ----------
  // Widok jest budowany od nowa, więc zachowujemy fokus i kursor (np. gdy podgląd sklepu wróci w trakcie pisania).
  function render() {
    var a = document.activeElement, focusId = a && a.id, sel = null;
    try { if (a && a.setSelectionRange) sel = [a.selectionStart, a.selectionEnd]; } catch (e) {}
    draw();
    var t = focusId && document.getElementById(focusId);
    if (t && t !== document.activeElement) {
      t.focus({ preventScroll: true });
      if (sel) try { t.setSelectionRange(sel[0], sel[1]); } catch (e) {}
    }
  }

  function draw() {
    document.getElementById("occasion").textContent = "Listy prezentów";
    // Po udostępnieniu liczy się szybki wybór listy, więc opis aplikacji znika.
    document.getElementById("lead").hidden = S.shared && !S.done;
    var notice = document.getElementById("notice");
    notice.textContent = "";
    if (S.notice) notice.appendChild(el("div", { class: "notice demo", role: "status", text: S.notice }));
    var demo = keyed().filter(isDemo);
    if (demo.length) notice.appendChild(el("div", { class: "notice demo", text: "Tryb demo: lista bez adresu backendu w config.js, prezenty zapisują się tylko w tej przeglądarce." }));

    var view = document.getElementById("view");
    view.textContent = "";
    var people = keyed();
    if (S.done) view.appendChild(doneView());
    else if (!people.length) view.appendChild(setupIntro());
    else if (S.shared && !S.editing) view.appendChild(quickView(people));
    else view.appendChild(formView(people));
    view.appendChild(settingsView());
  }

  function setupIntro() {
    return el("section", { class: "panel" }, [
      el("h2", { class: "panel-title", text: "Najpierw połącz ten telefon z listą" }),
      el("p", { text: "Do dodawania prezentów potrzebny jest klucz listy. Najprościej otworzyć na tym telefonie link z kluczami. Możesz też wkleić klucz poniżej, w sekcji „Klucze na tym telefonie”." })
    ]);
  }

  function field(name, label, attrs, hint) {
    var id = "f-" + name;
    var input = el(attrs && attrs.rows ? "textarea" : "input", Object.assign({
      id: id, name: name, class: "input",
      oninput: function (e) { S.form[name] = e.target.value; S.touched[name] = true; }
    }, attrs || {}));
    input.value = S.form[name] || "";
    return el("div", { class: "field" }, [
      el("label", { for: id, text: label }), input,
      hint ? el("p", { class: "hint", text: hint }) : null
    ]);
  }

  // Szybka ścieżka po udostępnieniu: podgląd i jeden przycisk na listę.
  function quickView(people) {
    var f = S.form;
    var name = f.title || (S.preview === "loading" ? "Sprawdzam nazwę…" : "Bez nazwy: uzupełnię ją z linku");
    var meta = el("p", { class: "quick-meta" }, [
      f.shop ? el("span", { text: f.shop }) : null,
      f.price ? el("span", { class: "price", text: f.price }) : null
    ]);
    return el("section", { class: "panel quick" }, [
      el("p", { class: "quick-name", text: name }),
      meta.childNodes.length ? meta : null,
      el("p", { class: "hint", role: "status", text: S.preview === "loading" ? "Sprawdzam stronę sklepu…" : "" }),
      el("h2", { class: "quick-label", id: "quick-label", text: "Dodaj do listy:" }),
      el("div", { class: "quick-buttons", role: "group", "aria-labelledby": "quick-label" }, people.map(function (k) {
        var mine = S.busy && S.person === k;
        return el("button", { class: "btn-primary btn-person", type: "button", disabled: S.busy,
          "aria-label": "Dodaj do listy " + gen(k), text: mine ? "Dodaję…" : nom(k),
          onclick: function () { S.person = k; lsSet(LAST_LS, k); send(); } });
      })),
      el("div", { class: "err", role: "alert", text: S.error }),
      el("button", { class: "link-btn", type: "button", text: "Popraw przed dodaniem",
        onclick: function () { S.editing = true; render(); var t = document.getElementById("f-title"); if (t) t.focus(); } })
    ]);
  }

  function formView(people) {
    if (people.indexOf(S.person) < 0) S.person = people[0];
    var pick = null;
    if (people.length > 1) {
      pick = el("fieldset", { class: "pick" }, [el("legend", { text: "Do czyjej listy?" })].concat(people.map(function (k) {
        var id = "p-" + k;
        return el("span", { class: "pick-opt" }, [
          el("input", { type: "radio", name: "person", id: id, value: k, checked: S.person === k,
            onchange: function () { S.person = k; lsSet(LAST_LS, k); S.error = ""; render(); } }),
          el("label", { for: id, text: nom(k) })
        ]);
      })));
    }
    var status = S.preview === "loading" ? "Sprawdzam stronę sklepu…"
      : S.preview === "done" ? "Uzupełniono dane ze strony sklepu. Sprawdź, czy się zgadzają."
      : "";
    return el("form", { class: "panel add-form", novalidate: true, onsubmit: submit }, [
      pick,
      people.length === 1 ? el("p", { class: "for-whom", text: "Dodajesz do listy prezentów " + gen(people[0]) + "." }) : null,
      field("title", "Nazwa prezentu", { required: true, maxlength: "120", autocomplete: "off" }),
      field("price", "Cena", { maxlength: "40", inputmode: "text", placeholder: "np. ok. 150 zł" }, "Możesz wpisać przybliżoną cenę albo zakres, np. 100–150 zł."),
      field("desc", "Opis", { maxlength: "300", rows: "2", placeholder: "np. kolor, rozmiar, wariant" }),
      field("shop", "Sklep", { maxlength: "60", autocomplete: "off" }),
      field("url", "Link", { type: "url", maxlength: "500", inputmode: "url", placeholder: "https://…" }),
      el("p", { class: "hint status", role: "status", text: status }),
      el("div", { class: "err", role: "alert", text: S.error }),
      el("button", { class: "btn-primary btn-wide", type: "submit", disabled: S.busy,
        text: S.busy ? "Dodaję…" : "Dodaj do listy " + gen(S.person) })
    ]);
  }

  function doneView() {
    var d = S.done;
    return el("section", { class: "panel done" }, [
      el("h2", { class: "panel-title", text: "Dodano do listy " + gen(d.person) }),
      el("p", { text: "„" + d.title + "” jest już na liście. Inni zobaczą go w ciągu pół minuty." }),
      d.price ? el("p", { class: "hint", text: "Cena: " + d.price }) : null,
      el("div", { class: "done-actions" }, [
        el("button", { class: "btn-primary", type: "button", text: "Gotowe", onclick: function () {
          window.close();
          // Gdy okna nie da się zamknąć (zwykła karta), wracamy do pustego formularza.
          setTimeout(function () { location.replace(location.pathname); }, 300);
        } }),
        el("a", { class: "btn-ghost btn-link", href: "../" + d.person + "/", text: "Zobacz listę " + gen(d.person) }),
        el("button", { class: "btn-ghost", type: "button", text: "Dodaj kolejny", onclick: function () {
          S.done = null; S.form = { title: "", price: "", desc: "", shop: "", url: "" }; S.touched = {}; S.preview = "";
          S.shared = false; S.editing = false;
          history.replaceState(null, "", location.pathname); render();
          var t = document.getElementById("f-title"); if (t) t.focus();
        } })
      ])
    ]);
  }

  function settingsView() {
    var rows = Object.keys(PEOPLE).map(function (k) {
      var has = !!S.keys[k];
      return el("li", { class: "key-row" }, [
        el("span", { class: "key-name", text: "Lista " + gen(k) }),
        el("span", { class: has ? "key-ok" : "key-missing", text: has ? "połączona" : "brak klucza" }),
        has ? el("button", { class: "btn-ghost btn-small", type: "button", "aria-label": "Usuń klucz listy " + gen(k), text: "Usuń",
          onclick: function () { delete S.keys[k]; saveKeys(); render(); } }) : null
      ]);
    });
    var sel = el("select", { id: "k-person", class: "input" }, Object.keys(PEOPLE).map(function (k) {
      return el("option", { value: k, text: "Lista " + gen(k) });
    }));
    var inp = el("input", { id: "k-value", class: "input", autocomplete: "off", spellcheck: "false", placeholder: "Wklej klucz" });
    var msg = el("p", { class: "err", role: "alert" });
    var open = !keyed().length;
    return el("details", { class: "panel settings", open: open }, [
      el("summary", { text: "Klucze na tym telefonie" }),
      el("ul", { class: "keys" }, rows),
      el("form", { class: "key-form", onsubmit: function (e) {
        e.preventDefault();
        var k = sel.value, v = inp.value.trim();
        if (!v) { msg.textContent = "Wklej klucz."; inp.focus(); return; }
        msg.textContent = "Sprawdzam klucz…";
        api(k).check(v).then(function (r) {
          if (!r || !r.ok) { msg.textContent = "Ten klucz nie pasuje do listy " + gen(k) + "."; return; }
          S.keys[k] = v; saveKeys(); S.person = k; lsSet(LAST_LS, k);
          S.notice = "Połączono z listą " + gen(k) + ".";
          render(); maybePreview();
        }).catch(function () { msg.textContent = "Nie udało się sprawdzić klucza. Sprawdź połączenie."; });
      } }, [
        el("label", { for: "k-person", text: "Lista" }), sel,
        el("label", { for: "k-value", text: "Klucz" }), inp,
        el("button", { class: "btn-ghost", type: "submit", text: "Zapisz klucz" }),
        msg
      ])
    ]);
  }

  // ---------- akcje ----------
  function maybePreview() {
    var k = S.person;
    if (!S.form.url || !S.keys[k] || S.preview) return;
    S.preview = "loading"; render();
    api(k).preview(S.keys[k], S.form.url, S.form.title).then(function (r) {
      var filled = false;
      // Serwer rozwija krótkie linki i czyści nazwę, więc jego wersja wygrywa, chyba że ktoś już coś poprawił.
      ["title", "price", "shop", "url"].forEach(function (f) {
        if (r && r[f] && !S.touched[f] && r[f] !== S.form[f]) { S.form[f] = r[f]; filled = true; }
      });
      S.preview = filled ? "done" : "none";
    }).catch(function () { S.preview = "none"; }).then(render);
  }

  function submit(e) {
    e.preventDefault();
    if (S.busy) return;
    if (!S.form.title.trim() && !S.form.url.trim()) { S.error = "Wpisz nazwę prezentu."; render(); document.getElementById("f-title").focus(); return; }
    send();
  }

  // Wysyła prezent; brakującą nazwę, sklep i cenę serwer uzupełnia sam z linku.
  function send() {
    if (S.busy) return;
    var f = S.form, k = S.person;
    var item = { title: f.title.trim(), price: normPrice(f.price), desc: f.desc.trim(), shop: f.shop.trim(), url: f.url.trim(),
      keepTitle: !!S.touched.title, autoShop: !S.touched.shop };
    if (item.url && !/^https?:\/\//i.test(item.url)) item.url = "https://" + item.url;
    S.busy = true; S.error = ""; render();
    api(k).add(S.keys[k], item).then(function (r) {
      if (r && r.ok) { S.done = { person: k, title: r.title || item.title || "Prezent", price: r.price || item.price }; lsSet(LAST_LS, k); return; }
      S.error = r && r.error === "bad_key"
        ? "Klucz listy " + gen(k) + " przestał pasować. Wklej go ponownie w sekcji „Klucze na tym telefonie”."
        : "Nie udało się dodać prezentu. Spróbuj ponownie za chwilę.";
    }).catch(function () {
      S.error = "Nie udało się dodać prezentu. Sprawdź połączenie i spróbuj ponownie.";
    }).then(function () { S.busy = false; render(); });
  }

  // ---------- instalacja ----------
  var deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferred = e;
    document.getElementById("install").hidden = false;
  });
  document.getElementById("install").addEventListener("click", function () {
    if (!deferred) return;
    deferred.prompt();
    deferred.userChoice.then(function () { deferred = null; document.getElementById("install").hidden = true; });
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(function () {});

  window.addEventListener("hashchange", function () { readKeysFromHash(); render(); maybePreview(); });
  readKeysFromHash();
  readShare();
  render();
  maybePreview();
})();
