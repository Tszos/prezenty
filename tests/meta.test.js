// Checks for extractMeta() in apps-script/Code.gs (shop page -> name, price, shop).
const assert = require("assert");
const { extractMeta } = require("../apps-script/Code.gs");
let n = 0;
function check(label, html, want) {
  const got = extractMeta(html);
  for (const k of Object.keys(want)) assert.strictEqual(got[k], want[k], label + " " + k + ": " + JSON.stringify(got));
  console.log("PASS " + label); n++;
}
check("og tags + PLN",
  '<meta property="og:title" content="Kubek &amp; spodek"><meta property="product:price:amount" content="1149.99"><meta property="product:price:currency" content="PLN"><meta property="og:site_name" content="Sklep X">',
  { title: "Kubek & spodek", price: "1149,99 zł", shop: "Sklep X" });
check("content before property, whole price",
  "<meta content='Plecak 20 l' property='og:title'><meta content=\"250.00\" property=\"product:price:amount\">",
  { title: "Plecak 20 l", price: "250 zł" });
check("title tag fallback + JSON-LD price",
  '<title> Gra „Wsiąść do pociągu” | Rebel </title><script type="application/ld+json">{"offers":{"price":"99.95","priceCurrency":"PLN"}}</script>',
  { title: "Gra „Wsiąść do pociągu” | Rebel", price: "99,95 zł", shop: "" });
check("other currency", '<meta property="og:title" content="Book"><meta itemprop="price" content="20"><meta itemprop="priceCurrency" content="EUR">',
  { title: "Book", price: "20 EUR" });
check("nothing useful", "<html><body>hi</body></html>", { title: "", price: "", shop: "" });
check("numeric entity", '<meta name="twitter:title" content="Caf&#233; &#x2013; zestaw">', { title: "Café – zestaw" });
console.log(n + " passed");
