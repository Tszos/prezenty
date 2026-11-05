// Plain Node test script for docs/price.js. Run: node tests/price.test.js
"use strict";

var assert = require("assert");
var P = require("../docs/price.js");

var passed = 0;
var failed = 0;

function check(name, fn) {
  try {
    fn();
    passed++;
    console.log("PASS " + name);
  } catch (e) {
    failed++;
    console.log("FAIL " + name + " -- " + e.message);
  }
}

// parsePrice cases: [input, expected]
var priceCases = [
  ["ok. 100 zł", 100],
  ["ok. 950–1150 zł", 950],
  ["1149,99 zł", 1149.99],
  ["", null],
  [null, null],
  [undefined, null],
  ["   ", null],
  ["do ustalenia", null],
  ["1 200 zł", 1200],
  ["1 200 zł", 1200],
  ["1 200 zł", 1200],
  ["1 299,00 zł", 1299],
  ["12 345,50", 12345.5],
  ["950 - 1150 zł", 950],
  ["950-1150", 950],
  ["950 1150", 950],
  ["19.99", 19.99],
  ["1.200 zł", 1200],
  ["1.200,50 zł", 1200.5],
  ["około 45zł", 45],
  [19.99, 19.99],
  [45, 45]
];

priceCases.forEach(function (c) {
  var label = "parsePrice(" + JSON.stringify(c[0]) + ") -> " + c[1];
  check(label, function () {
    assert.strictEqual(P.parsePrice(c[0]), c[1]);
  });
});

// groupOf boundary cases: [input, expected group key]
var groupCases = [
  ["100", "to100"],
  ["100.01", "100-300"],
  ["300", "100-300"],
  ["600", "300-600"],
  ["600.5", "over600"],
  [null, "none"],
  ["do ustalenia", "none"]
];

groupCases.forEach(function (c) {
  var label = "groupOf(" + JSON.stringify(c[0]) + ") -> " + c[1];
  check(label, function () {
    assert.strictEqual(P.groupOf(c[0]), c[1]);
  });
});

// GROUPS order and labels
check("GROUPS keys in order", function () {
  assert.deepStrictEqual(
    P.GROUPS.map(function (g) { return g.key; }),
    ["to100", "100-300", "300-600", "over600", "none"]
  );
});

check("GROUPS labels", function () {
  assert.deepStrictEqual(
    P.GROUPS.map(function (g) { return g.label; }),
    ["do 100 zł", "100–300 zł", "300–600 zł", "powyżej 600 zł", "Bez ceny"]
  );
});

console.log(passed + " passed" + (failed ? ", " + failed + " failed" : ""));
process.exit(failed ? 1 : 0);
