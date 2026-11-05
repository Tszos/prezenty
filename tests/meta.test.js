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

// ---- name cleanup, names from links, shop from address ----
const { cleanTitle, slugTitle, shopFromUrl } = require("../apps-script/Code.gs");
function eq(label, got, want) { assert.strictEqual(got, want, label + ": " + JSON.stringify(got)); console.log("PASS " + label); n2++; }
let n2 = 0;
eq("allegro suffix + offer number",
  cleanTitle("Drukarka wielofunkcyjna atramentowa (kolor) HP DeskJet 2920, 198701680109 • Cena • Opinie - Allegro", "Allegro"),
  "Drukarka wielofunkcyjna atramentowa (kolor) HP DeskJet 2920");
eq("empik pipe suffix", cleanTitle("Projekt Hail Mary - Andy Weir | Książka w Empik", "Empik"), "Projekt Hail Mary - Andy Weir | Książka w Empik");
eq("empik plain suffix", cleanTitle("Projekt Hail Mary | Empik", "Empik"), "Projekt Hail Mary");
eq("ceneo.pl suffix", cleanTitle("LEGO Icons Shire 10354 - Ceneo.pl", ""), "LEGO Icons Shire 10354");
eq("keeps hyphenated names", cleanTitle("Kubek termiczny - zielony", ""), "Kubek termiczny - zielony");
eq("slug from allegro produkt link",
  slugTitle("https://allegro.pl/produkt/drukarka-wielofunkcyjna-atramentowa-kolor-hp-deskjet-2920-7c0bbfe1-835e-4029-99ae-d6a08d599a9b?offerId=18566846548"),
  "Drukarka wielofunkcyjna atramentowa kolor hp deskjet 2920");
eq("slug from allegro oferta link", slugTitle("https://allegro.pl/oferta/lego-icons-shire-10354-15012345678"), "Lego icons shire 10354");
eq("no slug for short link", slugTitle("https://share.google/mU9GyQ6HpVxaww3da"), "");
eq("shop allegro", shopFromUrl("https://allegro.pl/oferta/x-1"), "Allegro");
eq("shop from share.google is empty", shopFromUrl("https://share.google/abc"), "");
eq("shop amazon.co.uk", shopFromUrl("https://www.amazon.co.uk/dp/1"), "Amazon");
eq("shop unknown", shopFromUrl("https://www.sklepzabawki.pl/x"), "Sklepzabawki");
console.log(n2 + " passed (names)");
