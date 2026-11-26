// Ustawienia list prezentów — tylko ten plik musisz edytować.
window.GIFT_CONFIG = {
  // Opcjonalny nadtytuł nad nagłówkiem, np. „Urodziny 2027”. Pusty = tylko ikona prezentu.
  occasion: "",

  // Gotowe grupy proponowane właścicielowi przy prezencie (obok grup, które już są na liście).
  defaultGroups: ["Książki", "Zabawki", "LEGO", "Gadżety", "Biżuteria", "Ubrania"],

  // Jedna pozycja na osobę. Klucz to nazwa folderu w docs/ (np. docs/ania/index.html),
  // a kolejność tutaj to kolejność na stronie wyboru.
  people: {
    tomek: {
      // Imię w mianowniku ("Jestem Tomek") i dopełniaczu ("Lista prezentów Tomka").
      name: "Tomek",
      nameGen: "Tomka",
      // Adres listy w API (Cloudflare Worker, worker/): https://prezenty-api.tszos.workers.dev/<folder>.
      // Pusty = tryb demo (dane tylko w Twojej przeglądarce).
      apiUrl: "https://prezenty-api.tszos.workers.dev/tomek"
    },
    ania: {
      name: "Ania",
      nameGen: "Ani",
      apiUrl: "https://prezenty-api.tszos.workers.dev/ania"
    },
    mikolaj: {
      name: "Mikołaj",
      nameGen: "Mikołaja",
      apiUrl: "https://prezenty-api.tszos.workers.dev/mikolaj"
    }
  }
};
