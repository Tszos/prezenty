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
      // Adres wdrożonego Google Apps Script tej osoby (kończy się na /exec).
      // Pusty = tryb demo (dane tylko w Twojej przeglądarce).
      apiUrl: "https://script.google.com/macros/s/AKfycbyA6W5XQH1PJ1OJVd0bneBrsmfsp0QNA2uFwysnDNbDAyN28mGaSC7io81_drorKnJhGw/exec"
    },
    ania: {
      name: "Ania",
      nameGen: "Ani",
      apiUrl: "https://script.google.com/macros/s/AKfycby9f2SlGQaxQ5f0-iFEslZT216jcQCVcXx6qn8DtQixA5fofcBFz8Q4gdboMroAzDxD/exec"
    },
    mikolaj: {
      name: "Mikołaj",
      nameGen: "Mikołaja",
      apiUrl: "https://script.google.com/macros/s/AKfycby_oR-PiLL9PeSCLiTdUntDjhGsXZExgVJBPp5P5UEl3N79LepIrNadrjpjtep1O3CQ/exec"
    }
  }
};
