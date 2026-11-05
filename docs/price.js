(function (root) { "use strict";

  // Price groups, cheapest first. Labels use en dash (U+2013).
  var GROUPS = [
    { key: "to100", label: "do 100 zł" },
    { key: "100-300", label: "100–300 zł" },
    { key: "300-600", label: "300–600 zł" },
    { key: "over600", label: "powyżej 600 zł" },
    { key: "none", label: "Bez ceny" }
  ];

  // Take the first number in free text and return it as a number, or null.
  function parsePrice(text) {
    if (text === null || text === undefined) return null;
    var s = String(text);
    // Whole part: digits, optionally grouped by a space / NBSP / narrow NBSP
    // or a dot when followed by exactly 3 digits. Optional decimal part
    // after a comma or dot.
    var m = /([0-9]+(?:[   .][0-9]{3}(?![0-9]))*)(?:[,.]([0-9]+))?/.exec(s);
    if (!m) return null;
    // Strip thousands separators from the whole part.
    var whole = m[1].replace(/[   .]/g, "");
    return m[2] ? parseFloat(whole + "." + m[2]) : parseFloat(whole);
  }

  // Map a price (free text or number) to a group key.
  function groupOf(text) {
    var p = parsePrice(text);
    if (p === null) return "none";
    if (p <= 100) return "to100";
    if (p <= 300) return "100-300";
    if (p <= 600) return "300-600";
    return "over600";
  }

  var api = { parsePrice: parsePrice, groupOf: groupOf, GROUPS: GROUPS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.GiftPrice = api;
})(typeof window !== "undefined" ? window : this);
