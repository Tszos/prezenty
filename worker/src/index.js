// Gift list API on Cloudflare Workers + D1 (replaces the per-person Google Apps Script backends).
// Same requests as apps-script/Code.gs, one path per list:
//   GET  /<person>?token=…                 list (items + claims, "mine" for this token)
//   GET  /<person>?action=check&key=…      is this the list's admin key?
//   GET  /<person>?action=preview&key=…&url=…&title=…   shop page -> name, price, shop
//   POST /<person>  {action: claim|unclaim|add|edit|remove|move|reorder, …}
import { UA, clip, moveOrder, cleanEdit, reorderRanks, shopFromUrl, slugTitle, cleanTitle, junkTitle, extractMeta } from './lib.js';

const ORIGINS = ['https://tszos.github.io', 'http://localhost:8000', 'http://127.0.0.1:8000'];
const TOKEN_RE = /^[0-9a-f]{16,64}$/i;

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let out;
    try { out = await handle(req, env); }
    catch (err) { out = { ok: false, error: 'server', detail: String(err && err.message || err) }; }
    return new Response(JSON.stringify(out), {
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
    });
  }
};

export async function handle(req, env) {
  const url = new URL(req.url);
  const person = url.pathname.replace(/^\/+|\/+$/g, '');
  if (!person) return { ok: true, service: 'prezenty-api' };
  if (!/^[a-z0-9-]{1,40}$/.test(person)) return { ok: false, error: 'no_list' };
  const db = env.DB;
  const list = await db.prepare('SELECT key_hash FROM lists WHERE person = ?').bind(person).first();
  if (!list) return { ok: false, error: 'no_list' };
  const keyOk = async (key) => !!key && (await sha256(String(key))) === list.key_hash;

  if (req.method === 'GET') {
    const p = url.searchParams;
    const action = p.get('action') || '';
    if (action === 'check') return (await keyOk(p.get('key'))) ? { ok: true } : { ok: false, error: 'bad_key' };
    if (action === 'preview') {
      if (!(await keyOk(p.get('key')))) return { ok: false, error: 'bad_key' };
      try { return await preview(String(p.get('url') || ''), String(p.get('title') || '')); }
      catch (err) { return { ok: true, title: '', price: '', shop: '' }; }
    }
    return listItems(db, person, String(p.get('token') || ''));
  }
  if (req.method !== 'POST') return { ok: false, error: 'bad_request' };

  const text = await req.text();
  if (text.length > 20000) return { ok: false, error: 'bad_request' };
  let body;
  try { body = JSON.parse(text); } catch (err) { return { ok: false, error: 'bad_request' }; }
  if (!body || typeof body !== 'object') return { ok: false, error: 'bad_request' };
  const id = String(body.id || '').trim();

  if (['add', 'remove', 'edit', 'reorder', 'move'].includes(body.action)) {
    if (!(await keyOk(body.key))) return { ok: false, error: 'bad_key' };
    if (body.action === 'add') return addItem(db, person, await enrich(body));
    if (body.action === 'remove') return removeItem(db, person, id);
    if (body.action === 'edit') return editItem(db, person, id, body);
    if (body.action === 'reorder') return reorderItems(db, person, Array.isArray(body.ids) ? body.ids.map(String) : []);
    return moveItem(db, person, id, String(body.before || '').trim());
  }

  const token = String(body.token || '');
  if (!TOKEN_RE.test(token)) return { ok: false, error: 'bad_token' };
  if (body.action === 'claim') return claim(db, person, id, String(body.name || ''), token);
  if (body.action === 'unclaim') return unclaim(db, person, id, token);
  return { ok: false, error: 'unknown_action' };
}

async function sha256(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function orderedIds(db, person) {
  const r = await db.prepare('SELECT id FROM items WHERE person = ? ORDER BY pos, id').bind(person).all();
  return r.results.map((x) => x.id);
}

async function writeOrder(db, person, ids) {
  const st = db.prepare('UPDATE items SET pos = ? WHERE person = ? AND id = ?');
  await db.batch(ids.map((id, i) => st.bind(i + 1, person, id)));
}

async function listItems(db, person, token) {
  const [items, claims] = await db.batch([
    db.prepare('SELECT id, title, descr, price, shop, url, grp FROM items WHERE person = ? ORDER BY pos, id').bind(person),
    db.prepare('SELECT item_id, name, token FROM claims WHERE person = ?').bind(person)
  ]);
  const out = {};
  // The token never leaves the server: only whether the claim is yours.
  for (const c of claims.results) out[c.item_id] = { name: c.name, mine: !!token && c.token === token };
  return {
    ok: true,
    items: items.results.map((r) => ({ id: r.id, title: r.title, desc: r.descr, price: r.price, shop: r.shop, url: r.url, group: r.grp })),
    claims: out
  };
}

async function claim(db, person, id, name, token) {
  const it = await db.prepare('SELECT 1 FROM items WHERE person = ? AND id = ?').bind(person, id).first();
  if (!it) return { ok: false, error: 'not_found' };
  name = name.trim().slice(0, 40);
  // Insert, or rename your own claim; someone else's claim stays (0 changes = taken).
  const r = await db.prepare(
    'INSERT INTO claims (person, item_id, name, token, created_at) VALUES (?, ?, ?, ?, ?) ' +
    'ON CONFLICT (person, item_id) DO UPDATE SET name = excluded.name WHERE claims.token = excluded.token'
  ).bind(person, id, name, token, new Date().toISOString()).run();
  return r.meta.changes ? { ok: true } : { ok: false, error: 'taken' };
}

async function unclaim(db, person, id, token) {
  const r = await db.prepare('DELETE FROM claims WHERE person = ? AND item_id = ? AND token = ?').bind(person, id, token).run();
  return r.meta.changes ? { ok: true } : { ok: false, error: 'not_yours' };
}

async function addItem(db, person, b) {
  if (!b.title) return { ok: false, error: 'no_title' };
  const id = crypto.randomUUID().slice(0, 8);
  await db.prepare(
    'INSERT INTO items (person, id, title, descr, price, shop, url, grp, pos) ' +
    'VALUES (?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(pos), 0) + 1 FROM items WHERE person = ?))'
  ).bind(person, id, b.title, b.desc, b.price, b.shop, b.url, b.group, person).run();
  return { ok: true, id, title: b.title, price: b.price, shop: b.shop };
}

async function removeItem(db, person, id) {
  if (!id) return { ok: false, error: 'no_id' };
  const [r] = await db.batch([
    db.prepare('DELETE FROM items WHERE person = ? AND id = ?').bind(person, id),
    db.prepare('DELETE FROM claims WHERE person = ? AND item_id = ?').bind(person, id)
  ]);
  return r.meta.changes ? { ok: true } : { ok: false, error: 'not_found' };
}

async function editItem(db, person, id, b) {
  const f = cleanEdit(b);
  if (f.error) return { ok: false, error: f.error };
  if (!id) return { ok: false, error: 'not_found' };
  const r = await db.prepare('UPDATE items SET title = ?, descr = ?, price = ?, shop = ?, url = ?, grp = ? WHERE person = ? AND id = ?')
    .bind(f.title, f.desc, f.price, f.shop, f.url, f.group, person, id).run();
  return r.meta.changes ? { ok: true } : { ok: false, error: 'not_found' };
}

async function moveItem(db, person, id, before) {
  const m = moveOrder(await orderedIds(db, person), id, before);
  if (m.error) return { ok: false, error: m.error };
  if (!m.noop) await writeOrder(db, person, m.order);
  return { ok: true };
}

async function reorderItems(db, person, ids) {
  const cur = await orderedIds(db, person);
  if (cur.length < 2 || !ids.length) return { ok: true };
  const ranks = reorderRanks(cur, ids);
  const order = cur.map((id, i) => [id, ranks[i]]).sort((a, b) => a[1] - b[1]).map((x) => x[0]);
  await writeOrder(db, person, order);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Adding gifts: expand short links, clean the name, find the shop and, when the shop allows it,
// take name and price from the product page.

async function enrich(b) {
  const out = {
    title: clip(b.title, 200), desc: clip(b.desc, 300), price: clip(b.price, 40),
    shop: clip(b.shop, 60), url: clip(b.url, 500), group: clip(b.group, 40)
  };
  if (out.url && !/^https?:\/\//i.test(out.url)) out.url = '';
  if (out.url) {
    let page = null;
    try { page = await fetchPage(out.url); } catch (err) {}
    if (page) {
      out.url = page.url.slice(0, 500);
      const meta = page.html ? extractMeta(page.html) : { title: '', price: '', shop: '' };
      if (meta.title && !junkTitle(meta.title) && !b.keepTitle) out.title = meta.title;
      if (meta.price && !out.price) out.price = meta.price;
      const host = shopFromUrl(out.url);
      if (host && (!out.shop || out.shop === 'Share' || out.shop === 'Google' || b.autoShop)) out.shop = meta.shop || host;
    }
    if (!out.title) out.title = slugTitle(out.url);
  }
  out.title = cleanTitle(out.title, out.shop).slice(0, 120);
  return out;
}

/** Follows up to 6 redirects; returns the final address and the HTML when the page gave it. */
async function fetchPage(url) {
  for (let hop = 0; hop < 6; hop++) {
    const res = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, 'Accept-Language': 'pl-PL,pl;q=0.9', 'Accept': 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(8000)
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      if (!loc) break;
      url = new URL(loc, url).href;
      continue;
    }
    const html = res.status < 400 ? (await res.text()).slice(0, 600000) : '';
    return { url, html };
  }
  return { url, html: '' };
}

async function preview(url, title) {
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'bad_url' };
  const e = await enrich({ url, title, autoShop: true });
  return { ok: true, title: e.title, price: e.price, shop: e.shop, url: e.url };
}
