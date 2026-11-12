// Checks for planMove() in apps-script/Code.gs (owner reordering: which sheet row goes where).
const test = require("node:test");
const assert = require("assert");
const { planMove } = require("../apps-script/Code.gs");

const ids = ["a", "b", "c", "d"]; // rows 2..5

test("move up: c before b", () => assert.deepStrictEqual(planMove(ids, "c", "b"), { from: 4, to: 3, noop: false }));
test("move down: b before d", () => assert.deepStrictEqual(planMove(ids, "b", "d"), { from: 3, to: 5, noop: false }));
test("to the end", () => assert.deepStrictEqual(planMove(ids, "a", ""), { from: 2, to: 6, noop: false }));
test("already last is a no-op", () => assert.strictEqual(planMove(ids, "d", "").noop, true));
test("already right before target is a no-op", () => assert.strictEqual(planMove(ids, "b", "c").noop, true));
test("ids with spaces and numbers", () => assert.deepStrictEqual(planMove([" a ", 12, "c"], "12", "a"), { from: 3, to: 2, noop: false }));
test("unknown item", () => assert.deepStrictEqual(planMove(ids, "x", ""), { error: "not_found" }));
test("unknown target (deleted meanwhile)", () => assert.deepStrictEqual(planMove(ids, "a", "x"), { error: "not_found" }));
test("before itself", () => assert.deepStrictEqual(planMove(ids, "a", "a"), { error: "not_found" }));
test("empty id", () => assert.deepStrictEqual(planMove(ids, "", "a"), { error: "not_found" }));
