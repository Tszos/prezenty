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
  var token = String((e && e.parameter && e.parameter.token) || '');
  return withLock(function () { return list(token); });
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json({ ok: false, error: 'bad_request' }); }
  var token = String(body.token || '');
  if (token.length < 16 || token.length > 64) return json({ ok: false, error: 'bad_token' });
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
  name = name.trim().slice(0, 40);
  var existing = readClaims().filter(function (c) { return c.id === id; })[0];
  if (existing) {
    if (existing.token !== token) return { ok: false, error: 'taken' };
    sheet(CLAIMS_SHEET).getRange(existing.row, 2).setValue(name);
    return { ok: true };
  }
  sheet(CLAIMS_SHEET).appendRow([id, name, token, new Date()]);
  return { ok: true };
}

function unclaim(id, token) {
  var existing = readClaims().filter(function (c) { return c.id === id && c.token === token; })[0];
  if (!existing) return { ok: false, error: 'not_yours' };
  sheet(CLAIMS_SHEET).deleteRow(existing.row);
  return { ok: true };
}
