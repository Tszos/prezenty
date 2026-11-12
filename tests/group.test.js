// Checks for owner groups (Grupa column), reordering and editing in apps-script/Code.gs.
const test = require("node:test");
const assert = require("assert");
const { reorderRanks, cleanEdit } = require("../apps-script/Code.gs");

test("reorder: rows follow the new order", () => {
  assert.deepStrictEqual(reorderRanks(["a", "b", "c"], ["c", "a", "b"]), [1, 2, 0]);
});

test("reorder: rows missing from the order keep their place after the ordered ones", () => {
  // "new" was added while the page was open; blank rows have no ID.
  assert.deepStrictEqual(reorderRanks(["a", "new", "b", ""], ["b", "a"]), [1, 3, 0, 5]);
});

test("reorder: ids are trimmed and compared as text, duplicates in the order count once", () => {
  assert.deepStrictEqual(reorderRanks([" a ", 12], ["12", "a", "12"]), [1, 0]);
});

test("reorder: unknown ids in the order are ignored", () => {
  assert.deepStrictEqual(reorderRanks(["a", "b"], ["x", "b", "a"]), [2, 1]);
});

test("edit: trims and clips fields, group included", () => {
  const f = cleanEdit({ title: "  Kubek  ", price: " 120 ", desc: "x".repeat(400), shop: "", url: "https://a.pl", group: "  Dom  " });
  assert.deepStrictEqual([f.title, f.price, f.desc.length, f.url, f.group], ["Kubek", "120", 300, "https://a.pl", "Dom"]);
  assert.strictEqual(cleanEdit({ title: "A", group: "g".repeat(60) }).group.length, 40);
  assert.strictEqual(cleanEdit({ title: "A" }).group, "");
});

test("edit: needs a name, rejects non-http links", () => {
  assert.deepStrictEqual(cleanEdit({ title: "  " }), { error: "no_title" });
  assert.deepStrictEqual(cleanEdit({ title: "A", url: "javascript:alert(1)" }), { error: "bad_url" });
});
