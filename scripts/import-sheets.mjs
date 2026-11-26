// One-off move from the Google Apps Script lists to D1 (2026-11).
// Usage: node scripts/import-sheets.mjs <claims.json> <out.sql>
//   - items: read from each list's live Apps Script /exec (the URLs in apps-script/lists.txt),
//     so the order and fields match what the site showed;
//   - claims: from <claims.json> ([{person, item_id, name, token, created_at}]), copied from the
//     "Rezerwacje" tabs, because the public list never returns tokens;
//   - admin keys: from git-ignored setup-links.local.md, stored as SHA-256 only.
// The SQL replaces everything in D1. Apply: cd worker && wrangler d1 execute prezenty --remote --file <out.sql>
// Keep <claims.json> and <out.sql> outside the repo (they hold tokens) and trash them afterwards.
import fs from 'node:fs';
import crypto from 'node:crypto';

const [claimsFile, outFile] = process.argv.slice(2);
if (!claimsFile || !outFile) { console.error('usage: import-sheets.mjs <claims.json> <out.sql>'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;

const lists = fs.readFileSync(root + 'apps-script/lists.txt', 'utf8').split('\n')
  .filter((l) => l.trim() && !l.startsWith('#')).map((l) => l.trim().split(/\s+/))
  .map(([person, , dep]) => ({ person, url: `https://script.google.com/macros/s/${dep}/exec` }));

const keys = {};
for (const m of fs.readFileSync(root + 'setup-links.local.md', 'utf8').matchAll(/^\|\s*([a-z]+)\s*\|\s*([A-Za-z0-9]{16,})\s*\|/gm)) keys[m[1]] = m[2];

const q = (s) => "'" + String(s ?? '').replace(/'/g, "''") + "'";
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const claims = JSON.parse(fs.readFileSync(claimsFile, 'utf8'));
const sql = ['DELETE FROM claims;', 'DELETE FROM items;', 'DELETE FROM lists;'];

for (const { person, url } of lists) {
  if (!keys[person]) throw new Error('no key for ' + person);
  const d = await (await fetch(url + '?t=' + Date.now(), { redirect: 'follow' })).json();
  if (!d.ok) throw new Error(person + ': ' + JSON.stringify(d));
  sql.push(`INSERT INTO lists (person, key_hash) VALUES (${q(person)}, ${q(sha(keys[person]))});`);
  d.items.forEach((it, i) => sql.push(
    `INSERT INTO items (person, id, title, descr, price, shop, url, grp, pos) VALUES (${[person, it.id, it.title, it.desc, it.price, it.shop, it.url, it.group].map(q).join(', ')}, ${i + 1});`));
  const live = Object.keys(d.claims || {});
  const mine = claims.filter((c) => c.person === person);
  for (const c of mine) {
    if (!d.items.some((it) => it.id === c.item_id)) throw new Error(`${person}: claim for missing item ${c.item_id}`);
    sql.push(`INSERT INTO claims (person, item_id, name, token, created_at) VALUES (${[person, c.item_id, c.name, c.token, c.created_at].map(q).join(', ')});`);
  }
  const missing = live.filter((id) => !mine.some((c) => c.item_id === id));
  if (missing.length) throw new Error(`${person}: live claims not in claims.json: ${missing.join(', ')}`);
  console.log(`${person}: ${d.items.length} items, ${mine.length} claims`);
}
fs.writeFileSync(outFile, sql.join('\n') + '\n');
console.log('wrote ' + outFile);
