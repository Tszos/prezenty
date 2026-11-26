// Creates a new gift list in D1 and its owner key.
// Usage: node scripts/new-list.mjs <person>   (person = folder name in docs/, e.g. "ola")
// The key goes only into git-ignored setup-links.local.md; D1 keeps its SHA-256.
// Then: add the person to docs/config.js (apiUrl https://prezenty-api.tszos.workers.dev/<person>),
// copy docs/tomek/index.html to docs/<person>/ with data-person="<person>", run scripts/stamp.sh.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const person = process.argv[2] || '';
if (!/^[a-z0-9-]{1,40}$/.test(person)) { console.error('usage: new-list.mjs <person> (a-z, 0-9, -)'); process.exit(1); }
const root = new URL('..', import.meta.url).pathname;
const key = crypto.randomBytes(12).toString('hex');
const hash = crypto.createHash('sha256').update(key).digest('hex');

execFileSync('wrangler', ['d1', 'execute', 'prezenty', '--remote', '--command',
  `INSERT INTO lists (person, key_hash) VALUES ('${person}', '${hash}')`], { cwd: root + 'worker', stdio: 'inherit' });

fs.appendFileSync(root + 'setup-links.local.md', `\nList ${person} (created ${new Date().toISOString().slice(0, 10)}): key ${key}\n`);
console.log(`List "${person}" created. Its key is in setup-links.local.md.`);
