/**
 * Backend listy prezentów — Google Apps Script podpięty pod arkusz Google.
 *
 * Arkusz "Prezenty":     ID | Nazwa | Opis | Cena | Sklep | Link
 * Arkusz "Rezerwacje":   ID prezentu | Kto | Token | Data
 *
 * Ty wpisujesz prezenty do arkusza "Prezenty" (kolumnę ID zostaw pustą —
 * skrypt sam ją uzupełni). Rezerwacje zapisują się w arkuszu "Rezerwacje".
 * Jeśli chcesz zachować niespodziankę, po prostu do niego nie zaglądaj :)
 *
 * Dodawanie prezentów z telefonu (aplikacja docs/dodaj/) wymaga klucza zapisanego
 * we właściwościach skryptu (ADMIN_KEY). Uruchom raz funkcję authorize() z edytora:
 * nada uprawnienia i wypisze klucz w dzienniku wykonania.
 *
 * Instrukcja wdrożenia: zobacz README.md w repozytorium.
 */

var ITEMS_SHEET = 'Prezenty';
var CLAIMS_SHEET = 'Rezerwacje';
var ITEM_HEADERS = ['ID', 'Nazwa', 'Opis', 'Cena', 'Sklep', 'Link'];
var CLAIM_HEADERS = ['ID prezentu', 'Kto', 'Token', 'Data'];

/** Uruchom raz ręcznie z edytora: tworzy arkusze z nagłówkami i przykładowym prezentem. */
function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var items = ss.getSheetByName(ITEMS_SHEET) || ss.insertSheet(ITEMS_SHEET);
  if (items.getLastRow() === 0) {
    items.appendRow(ITEM_HEADERS);
    items.appendRow(['', 'Przykładowy prezent', 'Opis: kolor, rozmiar, wariant…', 'ok. 100 zł', 'Allegro', 'https://allegro.pl']);
    items.setFrozenRows(1);
  }
  var claims = ss.getSheetByName(CLAIMS_SHEET) || ss.insertSheet(CLAIMS_SHEET);
  if (claims.getLastRow() === 0) {
    claims.appendRow(CLAIM_HEADERS);
    claims.setFrozenRows(1);
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  // Podgląd strony sklepu (nazwa, cena) dla aplikacji do dodawania. Bez blokady: nic nie zapisuje.
  if (p.action === 'preview') {
    if (!keyOk(p.key)) return json({ ok: false, error: 'bad_key' });
    try { return json(preview(String(p.url || ''), String(p.title || ''))); }
    catch (err) { return json({ ok: true, title: '', price: '', shop: '' }); }
  }
  if (p.action === 'check') return json({ ok: keyOk(p.key), error: keyOk(p.key) ? undefined : 'bad_key' });
  var token = String(p.token || '');
  return withLock(function () { return list(token); });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'bad_request' }); }
  if (body.action === 'add') {
    if (!keyOk(body.key)) return json({ ok: false, error: 'bad_key' });
    // Uzupełnianie danych (pobieranie stron) poza blokadą, żeby nie wstrzymywać rezerwacji.
    var item = enrich(body);
    return withLock(function () { return addItem(item); });
  }
  if (body.action === 'remove') {
    if (!keyOk(body.key)) return json({ ok: false, error: 'bad_key' });
    return withLock(function () { return removeItem(String(body.id || '')); });
  }
  var token = String(body.token || '');
  if (!/^[0-9a-f]{16,64}$/i.test(token)) return json({ ok: false, error: 'bad_token' });
  var id = String(body.id || '');

  return withLock(function () {
    if (body.action === 'claim') return claim(id, String(body.name || ''), token);
    if (body.action === 'unclaim') return unclaim(id, token);
    return { ok: false, error: 'unknown_action' };
  });
}

// ---------------------------------------------------------------------------

function withLock(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json({ ok: false, error: 'busy' });
  try { return json(fn()); }
  catch (err) { return json({ ok: false, error: 'server', detail: String(err) }); }
  finally { lock.releaseLock(); }
}

/** Wpis zaczynający się od = + - @ arkusz potraktowałby jak formułę; apostrof wymusza zwykły tekst. */
function sheetSafe(s) {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function sheet(name) {
  var s = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!s) throw new Error('Brak arkusza "' + name + '". Uruchom funkcję setup().');
  return s;
}

/** Czyta prezenty; brakujące ID uzupełnia w arkuszu. */
function readItems() {
  var s = sheet(ITEMS_SHEET);
  var last = s.getLastRow();
  if (last < 2) return [];
  var values = s.getRange(2, 1, last - 1, ITEM_HEADERS.length).getValues();
  var items = [];
  for (var i = 0; i < values.length; i++) {
    var r = values[i];
    var title = String(r[1]).trim();
    if (!title) continue;
    var id = String(r[0]).trim();
    if (!id) {
      id = Utilities.getUuid().slice(0, 8);
      s.getRange(i + 2, 1).setValue(id);
    }
    items.push({
      id: id,
      title: title,
      desc: String(r[2]).trim(),
      price: String(r[3]).trim(),
      shop: String(r[4]).trim(),
      url: String(r[5]).trim()
    });
  }
  return items;
}

function readClaims() {
  var s = sheet(CLAIMS_SHEET);
  var last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, CLAIM_HEADERS.length).getValues().map(function (r, i) {
    return { row: i + 2, id: String(r[0]).trim(), name: String(r[1]), token: String(r[2]) };
  }).filter(function (c) { return c.id; });
}

function list(token) {
  var items = readItems();
  var claims = {};
  readClaims().forEach(function (c) {
    // Token nigdy nie wychodzi na zewnątrz — tylko informacja, czy to Twoja rezerwacja.
    claims[c.id] = { name: c.name, mine: !!token && c.token === token };
  });
  return { ok: true, items: items, claims: claims };
}

function claim(id, name, token) {
  var exists = readItems().some(function (it) { return it.id === id; });
  if (!exists) return { ok: false, error: 'not_found' };
  name = sheetSafe(name.trim().slice(0, 40));
  var existing = readClaims().filter(function (c) { return c.id === id; })[0];
  if (existing) {
    if (existing.token !== token) return { ok: false, error: 'taken' };
    sheet(CLAIMS_SHEET).getRange(existing.row, 2).setValue(name);
    return { ok: true };
  }
  sheet(CLAIMS_SHEET).appendRow([id, name, token, new Date()]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dodawanie prezentów (aplikacja „Dodaj prezent”)

function adminKey() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_KEY') || '';
}

function keyOk(key) {
  var k = adminKey();
  key = String(key || '');
  if (!k || key.length !== k.length) return false;
  var diff = 0;
  for (var i = 0; i < k.length; i++) diff |= k.charCodeAt(i) ^ key.charCodeAt(i);
  return diff === 0;
}

function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

/** Usuwa prezent i jego rezerwację (od dołu, żeby numery wierszy się nie przesuwały). */
function removeItem(id) {
  id = id.trim();
  if (!id) return { ok: false, error: 'no_id' };
  var s = sheet(ITEMS_SHEET), last = s.getLastRow(), found = false;
  if (last >= 2) {
    var ids = s.getRange(2, 1, last - 1, 1).getValues();
    for (var i = ids.length - 1; i >= 0; i--) {
      if (String(ids[i][0]).trim() === id) { s.deleteRow(i + 2); found = true; }
    }
  }
  if (!found) return { ok: false, error: 'not_found' };
  var claims = sheet(CLAIMS_SHEET);
  readClaims().filter(function (c) { return c.id === id; })
    .sort(function (a, b) { return b.row - a.row; })
    .forEach(function (c) { claims.deleteRow(c.row); });
  return { ok: true };
}

/** Dopisuje prezent (dane są już uzupełnione przez enrich()). */
function addItem(b) {
  if (!b.title) return { ok: false, error: 'no_title' };
  var id = Utilities.getUuid().slice(0, 8);
  var s = sheet(ITEMS_SHEET);
  s.appendRow([id, sheetSafe(b.title), sheetSafe(b.desc), sheetSafe(b.price), sheetSafe(b.shop), b.url]);
  // Cena jako tekst, żeby „100” nie zamieniło się w liczbę bez „zł”.
  s.getRange(s.getLastRow(), 4).setNumberFormat('@');
  return { ok: true, id: id, title: b.title, price: b.price, shop: b.shop };
}

/**
 * Uzupełnia to, co przysłał telefon: rozwija krótkie linki (share.google itp.), czyści nazwę,
 * ustala sklep, a gdy sklep na to pozwala, bierze nazwę i cenę ze strony produktu.
 */
function enrich(b) {
  var out = {
    title: clip(b.title, 200), desc: clip(b.desc, 300), price: clip(b.price, 40),
    shop: clip(b.shop, 60), url: clip(b.url, 500)
  };
  if (out.url && !/^https?:\/\//i.test(out.url)) out.url = '';
  if (out.url) {
    var page = null;
    try { page = fetchPage(out.url); } catch (err) {}
    if (page) {
      out.url = page.url.slice(0, 500);
      var meta = page.html ? extractMeta(page.html) : { title: '', price: '', shop: '' };
      if (meta.title && !b.keepTitle) out.title = meta.title;
      if (meta.price && !out.price) out.price = meta.price;
      var host = shopFromUrl(out.url);
      if (host && (!out.shop || out.shop === 'Share' || out.shop === 'Google' || b.autoShop)) out.shop = meta.shop || host;
    }
    if (!out.title) out.title = slugTitle(out.url);
  }
  out.title = cleanTitle(out.title, out.shop).slice(0, 120);
  return out;
}

var UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

/** Idzie za przekierowaniami (do 6), zwraca końcowy adres i HTML, jeśli strona go oddała. */
function fetchPage(url) {
  for (var hop = 0; hop < 6; hop++) {
    var res = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true, followRedirects: false,
      headers: { 'User-Agent': UA, 'Accept-Language': 'pl-PL,pl;q=0.9' }
    });
    var code = res.getResponseCode();
    if (code >= 300 && code < 400) {
      var h = res.getAllHeaders(), loc = h.Location || h.location;
      if (Array.isArray(loc)) loc = loc[0];
      if (!loc) break;
      url = /^https?:\/\//i.test(loc) ? loc : url.replace(/^(https?:\/\/[^\/]+).*$/, '$1') + (loc.charAt(0) === '/' ? '' : '/') + loc;
      continue;
    }
    return { url: url, html: code < 400 ? res.getContentText().slice(0, 600000) : '' };
  }
  return { url: url, html: '' };
}

/** Podgląd dla aplikacji: to samo co przy dodawaniu, ale bez zapisu. */
function preview(url, title) {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'bad_url' };
  var e = enrich({ url: url, title: title, autoShop: true });
  return { ok: true, title: e.title, price: e.price, shop: e.shop, url: e.url };
}

var SHOPS = { allegro: 'Allegro', empik: 'Empik', ceneo: 'Ceneo', mediaexpert: 'Media Expert', 'x-kom': 'x-kom',
  decathlon: 'Decathlon', rebel: 'Rebel', amazon: 'Amazon', ikea: 'IKEA', zalando: 'Zalando', morele: 'Morele',
  euro: 'RTV Euro AGD', mediamarkt: 'MediaMarkt', olx: 'OLX', lego: 'LEGO', smyk: 'Smyk', rossmann: 'Rossmann',
  sephora: 'Sephora', notino: 'Notino', taniaksiazka: 'TaniaKsiążka', bonito: 'Bonito', aliexpress: 'AliExpress', temu: 'Temu' };

function shopFromUrl(u) {
  var m = /^https?:\/\/([^\/?#]+)/i.exec(String(u || ''));
  if (!m) return '';
  var parts = m[1].toLowerCase().replace(/^(www|m)\./, '').split('.');
  var name = parts.length > 2 && /^(com|co|org)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : (parts[parts.length - 2] || parts[0]);
  if (/^(share|google|goo|bit|tinyurl)$/.test(name)) return '';
  return SHOPS[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

/** Nazwa z adresu, gdy nic innego nie ma, np. allegro.pl/oferta/lego-icons-shire-10354-123456789. */
function slugTitle(u) {
  var m = /^https?:\/\/[^\/]+\/([^?#]*)/i.exec(String(u || ''));
  if (!m) return '';
  var segs = m[1].split('/').filter(function (x) { return /[a-z].*-.*[a-z]/i.test(x); });
  if (!segs.length) return '';
  var slug = decodeURIComponent(segs[segs.length - 1])
    .replace(/\.html?$/i, '')
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
    .replace(/-\d{7,}$/, '');
  var t = slug.replace(/[-_]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/** Usuwa dopiski sklepów: „• Cena • Opinie - Allegro”, „| Empik”, „- Ceneo.pl”, numery ofert. */
function cleanTitle(t, shop) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  var noise = /^(allegro(\.pl)?|ceneo(\.pl)?|empik(\.com)?|amazon(\.pl)?|ikea|media ?expert|x-kom|rtv euro agd|mediamarkt|decathlon|zalando|olx|cena|opinie|cena i opinie|sklep.*|.*\.(pl|com))$/i;
  for (var i = 0; i < 6; i++) {
    var m = /\s+[•|\-–—:]\s+([^•|\-–—]{1,40})$/.exec(t);
    if (!m) break;
    var seg = m[1].trim();
    if (noise.test(seg) || (shop && seg.toLowerCase() === String(shop).toLowerCase())) t = t.slice(0, m.index).trim();
    else break;
  }
  return t.replace(/[,\s]+\(?\d{9,}\)?$/, '').replace(/[\s•|\-–—:,]+$/, '').trim();
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

function metaContent(html, names) {
  var tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (var n = 0; n < names.length; n++) {
    for (var i = 0; i < tags.length; i++) {
      var t = tags[i];
      var key = /\b(?:property|name|itemprop)\s*=\s*["']([^"']+)["']/i.exec(t);
      if (!key || key[1].toLowerCase() !== names[n]) continue;
      var c = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(t);
      if (c) { var v = decodeEntities(c[1] != null ? c[1] : c[2]); if (v) return v; }
    }
  }
  return '';
}

/** Czysta funkcja (bez usług Google), żeby dało się ją przetestować w Node. */
function extractMeta(html) {
  html = String(html || '');
  var title = metaContent(html, ['og:title', 'twitter:title']);
  if (!title) { var t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html); title = t ? decodeEntities(t[1]) : ''; }

  var amount = metaContent(html, ['product:price:amount', 'og:price:amount', 'price']);
  var currency = metaContent(html, ['product:price:currency', 'og:price:currency', 'pricecurrency']);
  if (!amount) {
    var ld = /"price"\s*:\s*"?(\d+(?:[.,]\d+)?)"?/.exec(html);
    if (ld) amount = ld[1];
    var cur = /"priceCurrency"\s*:\s*"([A-Z]{3})"/.exec(html);
    if (cur && !currency) currency = cur[1];
  }
  var price = '';
  var num = parseFloat(String(amount).replace(/\s/g, '').replace(',', '.'));
  if (isFinite(num) && num > 0) {
    var txt = (Math.round(num * 100) / 100).toFixed(2).replace(/\.00$/, '').replace('.', ',');
    price = !currency || /^PLN$/i.test(currency) ? txt + ' zł' : txt + ' ' + currency.toUpperCase();
  }
  return { title: title.slice(0, 120), price: price, shop: metaContent(html, ['og:site_name']).slice(0, 60) };
}

/**
 * Uruchom raz ręcznie z edytora po każdej zmianie uprawnień: nadaje dostęp do arkusza
 * i pobierania stron, a jeśli trzeba, tworzy klucz do dodawania prezentów i wypisuje go w dzienniku.
 */
function authorize() {
  SpreadsheetApp.getActiveSpreadsheet().getName();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  var props = PropertiesService.getScriptProperties();
  var key = props.getProperty('ADMIN_KEY');
  if (!key) {
    key = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 24);
    props.setProperty('ADMIN_KEY', key);
  }
  Logger.log('Klucz do dodawania prezentów: ' + key);
}

function unclaim(id, token) {
  var existing = readClaims().filter(function (c) { return c.id === id && c.token === token; })[0];
  if (!existing) return { ok: false, error: 'not_yours' };
  sheet(CLAIMS_SHEET).deleteRow(existing.row);
  return { ok: true };
}

// Dla testów w Node (w Apps Script `module` nie istnieje).
if (typeof module !== 'undefined') module.exports = { extractMeta: extractMeta, decodeEntities: decodeEntities, cleanTitle: cleanTitle, slugTitle: slugTitle, shopFromUrl: shopFromUrl };
