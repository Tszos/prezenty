// Pure helpers shared by the Worker and the Node tests (moved from apps-script/Code.gs).

export const UA = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

const SHOPS = { allegro: 'Allegro', empik: 'Empik', ceneo: 'Ceneo', mediaexpert: 'Media Expert', 'x-kom': 'x-kom',
  decathlon: 'Decathlon', rebel: 'Rebel', amazon: 'Amazon', ikea: 'IKEA', zalando: 'Zalando', morele: 'Morele',
  euro: 'RTV Euro AGD', mediamarkt: 'MediaMarkt', olx: 'OLX', lego: 'LEGO', smyk: 'Smyk', rossmann: 'Rossmann',
  sephora: 'Sephora', notino: 'Notino', taniaksiazka: 'TaniaKsiążka', bonito: 'Bonito', aliexpress: 'AliExpress', temu: 'Temu' };

export function clip(v, n) { return String(v == null ? '' : v).trim().slice(0, n); }

/**
 * Where to move an item: before item `before`, or to the end when `before` is empty.
 * Positions are 2-based like the old sheet rows: { from, to, noop } or { error }.
 */
export function planMove(ids, id, before) {
  ids = ids.map(function (x) { return String(x).trim(); });
  var i = ids.indexOf(id);
  if (!id || i < 0) return { error: 'not_found' };
  var to = ids.length + 2;
  if (before) {
    var b = ids.indexOf(before);
    if (b < 0 || b === i) return { error: 'not_found' };
    to = b + 2;
  }
  var from = i + 2;
  return { from: from, to: to, noop: to === from || to === from + 1 };
}

/** New order of ids after moving `id` before `before` (or to the end): { order } or { error }. */
export function moveOrder(ids, id, before) {
  var p = planMove(ids, id, before);
  if (p.error) return p;
  ids = ids.map(function (x) { return String(x).trim(); });
  if (p.noop) return { order: ids, noop: true };
  var rest = ids.filter(function (x) { return x !== id; });
  var at = before ? rest.indexOf(before) : rest.length;
  rest.splice(at, 0, id);
  return { order: rest, noop: false };
}

/** Checks and clips the fields of the edit form. */
export function cleanEdit(b) {
  var out = {
    title: clip(b.title, 120), desc: clip(b.desc, 300), price: clip(b.price, 40),
    shop: clip(b.shop, 60), url: clip(b.url, 500), group: clip(b.group, 40)
  };
  if (!out.title) return { error: 'no_title' };
  if (out.url && !/^https?:\/\//i.test(out.url)) return { error: 'bad_url' };
  return out;
}

/**
 * New order: items from `ids` first in that order, then the rest as they were.
 * Returns the rank of each current item.
 */
export function reorderRanks(rowIds, ids) {
  var pos = {};
  ids.forEach(function (id, i) { id = String(id).trim(); if (id && !(id in pos)) pos[id] = i; });
  var n = ids.length;
  return rowIds.map(function (id, i) {
    id = String(id).trim();
    return id in pos ? pos[id] : n + i;
  });
}

export function shopFromUrl(u) {
  var m = /^https?:\/\/([^\/?#]+)/i.exec(String(u || ''));
  if (!m) return '';
  var parts = m[1].toLowerCase().replace(/^(www|m)\./, '').split('.');
  var name = parts.length > 2 && /^(com|co|org)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : (parts[parts.length - 2] || parts[0]);
  if (/^(share|google|goo|bit|tinyurl)$/.test(name)) return '';
  return SHOPS[name] || name.charAt(0).toUpperCase() + name.slice(1);
}

/** Name from the link when nothing else is known, e.g. allegro.pl/oferta/lego-icons-shire-10354-123456789. */
export function slugTitle(u) {
  var m = /^https?:\/\/[^\/]+\/([^?#]*)/i.exec(String(u || ''));
  if (!m) return '';
  var segs = m[1].split('/').filter(function (x) { return /[a-z].*-.*[a-z]/i.test(x); });
  if (!segs.length) return '';
  var slug;
  try { slug = decodeURIComponent(segs[segs.length - 1]); } catch (e) { slug = segs[segs.length - 1]; }
  slug = slug
    .replace(/\.html?$/i, '')
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, '')
    .replace(/-\d{7,}$/, '');
  var t = slug.replace(/[-_]+/g, ' ').trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/** Strips shop suffixes: „• Cena • Opinie - Allegro”, „| Empik”, „- Ceneo.pl”, offer numbers. */
export function cleanTitle(t, shop) {
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

/** Titles of bot checks and shop home pages, which say nothing about the product. */
export function junkTitle(t) {
  t = String(t || '').trim();
  return !t || /^(amazon\.pl|allegro(\.pl)?|ceneo(\.pl)?|empik(\.com)?)$/i.test(t) ||
    /^ceneo - porównanie cen/i.test(t) ||
    /captcha|just a moment|access denied|attention required|robot|weryfikacja|are you a human/i.test(t);
}

export function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, function (_, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&#(\d+);/g, function (_, d) { return String.fromCharCode(+d); })
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

export function metaContent(html, names) {
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

/** Shop page HTML -> { title, price, shop }. */
export function extractMeta(html) {
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
