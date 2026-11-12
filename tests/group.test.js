// Checks for group gifts (Składka) and owner editing in apps-script/Code.gs.
const test = require("node:test");
const assert = require("assert");
const { shapeClaims, cleanEdit, isYes } = require("../apps-script/Code.gs");

test("Składka column values", () => {
  for (const v of ["TAK", "tak", " x ", 1, true, "yes"]) assert.strictEqual(isYes(v), true, String(v));
  for (const v of ["", "nie", 0, false, null, undefined]) assert.strictEqual(isYes(v), false, String(v));
});

test("single reservation keeps the old shape and hides tokens", () => {
  const items = [{ id: "a", group: false }];
  const c = shapeClaims(items, [{ id: "a", name: "Ania", token: "t1" }], "t1");
  assert.deepStrictEqual(c, { a: { name: "Ania", mine: true, people: [{ name: "Ania", mine: true }] } });
  assert.strictEqual(items[0].group, false);
  assert.ok(!JSON.stringify(c).includes("t1"));
});

test("group gift lists everyone, marks mine", () => {
  const items = [{ id: "g", group: true }];
  const c = shapeClaims(items, [{ id: "g", name: "Ania", token: "t1" }, { id: "g", name: "Marek", token: "t2" }], "t2");
  assert.strictEqual(c.g.name, "Ania, Marek");
  assert.strictEqual(c.g.mine, true);
  assert.deepStrictEqual(c.g.people.map((p) => p.mine), [false, true]);
});

test("several people on an item with Składka switched off still show as a group", () => {
  const items = [{ id: "g", group: false }];
  shapeClaims(items, [{ id: "g", name: "A", token: "1" }, { id: "g", name: "B", token: "2" }], "");
  assert.strictEqual(items[0].group, true);
});

test("reservations of deleted gifts are left out", () => {
  assert.deepStrictEqual(shapeClaims([], [{ id: "gone", name: "A", token: "1" }], ""), {});
});

test("no token means nothing is mine", () => {
  const c = shapeClaims([{ id: "a" }], [{ id: "a", name: "A", token: "" }], "");
  assert.strictEqual(c.a.mine, false);
});

test("edit: trims and clips fields", () => {
  const f = cleanEdit({ title: "  Kubek  ", price: " 120 ", desc: "x".repeat(400), shop: "", url: "https://a.pl", group: true });
  assert.strictEqual(f.title, "Kubek");
  assert.strictEqual(f.price, "120");
  assert.strictEqual(f.desc.length, 300);
  assert.strictEqual(f.group, true);
});

test("edit: needs a name, rejects non-http links, group only when true", () => {
  assert.deepStrictEqual(cleanEdit({ title: "  " }), { error: "no_title" });
  assert.deepStrictEqual(cleanEdit({ title: "A", url: "javascript:alert(1)" }), { error: "bad_url" });
  assert.strictEqual(cleanEdit({ title: "A", group: "true" }).group, false);
  assert.strictEqual(cleanEdit({ title: "A" }).url, "");
});
