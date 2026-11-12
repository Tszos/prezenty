// Checks for group gifts (składka) and owner editing in apps-script/Code.gs.
const test = require("node:test");
const assert = require("assert");
const { shapeClaims, cleanEdit, isYes, claimPlan } = require("../apps-script/Code.gs");

test("Składka column values", () => {
  for (const v of ["TAK", "tak", " x ", 1, true, "yes"]) assert.strictEqual(isYes(v), true, String(v));
  for (const v of ["", "nie", 0, false, null, undefined]) assert.strictEqual(isYes(v), false, String(v));
});

// ---- what the page gets ----
test("single reservation keeps the old shape and hides tokens", () => {
  const items = [{ id: "a", group: false }];
  const c = shapeClaims(items, [{ id: "a", name: "Ania", token: "t1", group: false, amount: "" }], "t1");
  assert.deepStrictEqual(c, { a: { name: "Ania", mine: true, people: [{ name: "Ania", mine: true, amount: "" }] } });
  assert.strictEqual(items[0].group, false);
  assert.ok(!JSON.stringify(c).includes("t1"));
});

test("one person who started a składka makes it a group gift", () => {
  const items = [{ id: "g", group: false }];
  const c = shapeClaims(items, [{ id: "g", name: "Ania", token: "t1", group: true, amount: "100 zł" }], "");
  assert.strictEqual(items[0].group, true);
  assert.strictEqual(c.g.people[0].amount, "100 zł");
});

test("group gift lists everyone with amounts, marks mine", () => {
  const items = [{ id: "g", group: false }];
  const c = shapeClaims(items, [
    { id: "g", name: "Ania", token: "t1", group: true, amount: "100 zł" },
    { id: "g", name: "Marek", token: "t2", group: true, amount: "" }
  ], "t2");
  assert.strictEqual(c.g.name, "Ania, Marek");
  assert.strictEqual(c.g.mine, true);
  assert.deepStrictEqual(c.g.people.map((p) => [p.mine, p.amount]), [[false, "100 zł"], [true, ""]]);
});

test("several people on an item count as a group even without the flag (older rows)", () => {
  const items = [{ id: "g", group: false }];
  shapeClaims(items, [{ id: "g", name: "A", token: "1" }, { id: "g", name: "B", token: "2" }], "");
  assert.strictEqual(items[0].group, true);
});

test("reservations of deleted gifts are left out; no token means nothing is mine", () => {
  assert.deepStrictEqual(shapeClaims([], [{ id: "gone", name: "A", token: "1" }], ""), {});
  assert.strictEqual(shapeClaims([{ id: "a" }], [{ id: "a", name: "A", token: "" }], "").a.mine, false);
});

// ---- reserving alone vs chipping in ----
const solo = [{ row: 5, token: "other", group: false }];
const grp = [{ row: 5, token: "other", group: true }];

test("free gift: reserve alone or start a składka", () => {
  assert.deepStrictEqual(claimPlan([], "me", false), { append: true, group: false });
  assert.deepStrictEqual(claimPlan([], "me", true), { append: true, group: true });
});

test("someone reserved it alone: nobody else can reserve or join", () => {
  assert.deepStrictEqual(claimPlan(solo, "me", false), { error: "taken" });
  assert.deepStrictEqual(claimPlan(solo, "me", true), { error: "taken" });
});

test("a składka is running: join it, but can't take it alone", () => {
  assert.deepStrictEqual(claimPlan(grp, "me", true), { append: true, group: true });
  assert.deepStrictEqual(claimPlan(grp, "me", false), { error: "group_started" });
});

test("my own reservation is updated; alone I can switch, in a group I stay in it", () => {
  assert.deepStrictEqual(claimPlan([{ row: 7, token: "me", group: false }], "me", true), { update: 7, group: true });
  assert.deepStrictEqual(claimPlan([{ row: 7, token: "me", group: true }], "me", false), { update: 7, group: false });
  assert.deepStrictEqual(claimPlan([{ row: 7, token: "me", group: true }, { row: 8, token: "x", group: true }], "me", false), { update: 7, group: true });
});

test("składka is capped at 20 people", () => {
  const full = Array.from({ length: 20 }, (_, i) => ({ row: i + 2, token: "t" + i, group: true }));
  assert.deepStrictEqual(claimPlan(full, "me", true), { error: "full" });
});

// ---- owner editing ----
test("edit: trims and clips fields", () => {
  const f = cleanEdit({ title: "  Kubek  ", price: " 120 ", desc: "x".repeat(400), shop: "", url: "https://a.pl" });
  assert.deepStrictEqual([f.title, f.price, f.desc.length, f.url], ["Kubek", "120", 300, "https://a.pl"]);
  assert.ok(!("group" in f));
});

test("edit: needs a name, rejects non-http links", () => {
  assert.deepStrictEqual(cleanEdit({ title: "  " }), { error: "no_title" });
  assert.deepStrictEqual(cleanEdit({ title: "A", url: "javascript:alert(1)" }), { error: "bad_url" });
  assert.strictEqual(cleanEdit({ title: "A" }).url, "");
});
