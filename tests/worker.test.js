// End-to-end checks for the Worker API (worker/src/index.js) on a real SQLite database
// with the D1 schema from worker/migrations, through a tiny D1-compatible shim.
const test = require("node:test");
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  const dir = path.join(__dirname, "../worker/migrations");
  for (const f of fs.readdirSync(dir).sort()) db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  function stmt(sql, args) {
    return {
      bind: (...a) => stmt(sql, a),
      first: async () => db.prepare(sql).get(...(args || [])) || null,
      all: async () => ({ results: db.prepare(sql).all(...(args || [])) }),
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args || [])).changes) } }),
      _exec() { return /^\s*select/i.test(sql) ? { results: db.prepare(sql).all(...(args || [])) } : { meta: { changes: Number(db.prepare(sql).run(...(args || [])).changes) } }; }
    };
  }
  return {
    raw: db,
    prepare: (sql) => stmt(sql),
    batch: async (list) => { db.exec("BEGIN"); try { const r = list.map((s) => s._exec()); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; } }
  };
}

const KEY = "owner-key-123";
const T1 = "a".repeat(32), T2 = "b".repeat(32);
let handle, env;

test.before(async () => {
  ({ handle } = await import("../worker/src/index.js"));
});
test.beforeEach(() => {
  env = { DB: fakeD1() };
  const h = crypto.createHash("sha256").update(KEY).digest("hex");
  env.DB.raw.prepare("INSERT INTO lists (person, key_hash) VALUES (?, ?)").run("tomek", h);
});

const get = (q) => handle(new Request("https://api.test/tomek" + q), env);
const post = (body, who = "tomek") => handle(new Request("https://api.test/" + who, { method: "POST", body: JSON.stringify(body) }), env);
const add = (title, extra = {}) => post({ action: "add", key: KEY, title, ...extra });

test("unknown list", async () => {
  assert.deepStrictEqual(await post({ action: "claim" }, "nobody"), { ok: false, error: "no_list" });
});

test("check key", async () => {
  assert.strictEqual((await get("?action=check&key=" + KEY)).ok, true);
  assert.deepStrictEqual(await get("?action=check&key=wrong"), { ok: false, error: "bad_key" });
});

test("owner actions need the key", async () => {
  assert.deepStrictEqual(await post({ action: "add", key: "nope", title: "X" }), { ok: false, error: "bad_key" });
});

test("add then list, in order, with fields", async () => {
  const a = await add("Kubek", { price: "20 zł", group: "Dom", desc: "zielony" });
  await add("Książka");
  assert.strictEqual(a.ok, true);
  const l = await get("?token=" + T1);
  assert.deepStrictEqual(l.items.map((i) => i.title), ["Kubek", "Książka"]);
  assert.deepStrictEqual(l.items[0], { id: a.id, title: "Kubek", desc: "zielony", price: "20 zł", shop: "", url: "", group: "Dom" });
});

test("claim, taken by others, rename own, unclaim", async () => {
  const { id } = await add("Kubek");
  assert.deepStrictEqual(await post({ action: "claim", id, name: "Ola", token: T1 }), { ok: true });
  assert.deepStrictEqual(await post({ action: "claim", id, name: "Ewa", token: T2 }), { ok: false, error: "taken" });
  assert.deepStrictEqual(await post({ action: "claim", id, name: "Ola K", token: T1 }), { ok: true });
  assert.deepStrictEqual((await get("?token=" + T1)).claims[id], { name: "Ola K", mine: true });
  assert.deepStrictEqual((await get("?token=" + T2)).claims[id], { name: "Ola K", mine: false });
  assert.deepStrictEqual(await post({ action: "unclaim", id, token: T2 }), { ok: false, error: "not_yours" });
  assert.deepStrictEqual(await post({ action: "unclaim", id, token: T1 }), { ok: true });
  assert.deepStrictEqual((await get("")).claims, {});
});

test("claim needs a valid token and an existing gift", async () => {
  assert.deepStrictEqual(await post({ action: "claim", id: "x", name: "A", token: "short" }), { ok: false, error: "bad_token" });
  assert.deepStrictEqual(await post({ action: "claim", id: "x", name: "A", token: T1 }), { ok: false, error: "not_found" });
});

test("edit and remove (removes its claim too)", async () => {
  const { id } = await add("Kubek");
  await post({ action: "claim", id, name: "Ola", token: T1 });
  assert.deepStrictEqual(await post({ action: "edit", key: KEY, id, title: "Kubek 2", group: "Dom" }), { ok: true });
  assert.strictEqual((await get("")).items[0].title, "Kubek 2");
  assert.deepStrictEqual(await post({ action: "edit", key: KEY, id: "zzz", title: "A" }), { ok: false, error: "not_found" });
  assert.deepStrictEqual(await post({ action: "remove", key: KEY, id }), { ok: true });
  const l = await get("");
  assert.deepStrictEqual([l.items.length, l.claims], [0, {}]);
  assert.deepStrictEqual(await post({ action: "remove", key: KEY, id }), { ok: false, error: "not_found" });
});

test("move and reorder", async () => {
  const ids = [];
  for (const t of ["a", "b", "c", "d"]) ids.push((await add(t)).id);
  const titles = async () => (await get("")).items.map((i) => i.title).join("");
  await post({ action: "move", key: KEY, id: ids[2], before: ids[0] });
  assert.strictEqual(await titles(), "cabd");
  await post({ action: "move", key: KEY, id: ids[2], before: "" });
  assert.strictEqual(await titles(), "abdc");
  assert.deepStrictEqual(await post({ action: "move", key: KEY, id: "x", before: "" }), { ok: false, error: "not_found" });
  await post({ action: "reorder", key: KEY, ids: [ids[3], ids[1]] });
  assert.strictEqual(await titles(), "dbac");
  const e = (await add("e")).id;
  assert.strictEqual(await titles(), "dbace");
  assert.ok(e);
});

test("bad JSON and unknown action", async () => {
  assert.deepStrictEqual(await handle(new Request("https://api.test/tomek", { method: "POST", body: "{" }), env), { ok: false, error: "bad_request" });
  assert.deepStrictEqual(await post({ action: "zzz", token: T1 }), { ok: false, error: "unknown_action" });
});
