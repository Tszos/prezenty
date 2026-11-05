// Ustawienia list prezentów — tylko ten plik musisz edytować.
window.GIFT_CONFIG = {
  // Nadtytuł nad nagłówkiem.
  occasion: "Boże Narodzenie 2026",

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
      apiUrl: ""
    },
    mikolaj: {
      name: "Mikołaj",
      nameGen: "Mikołaja",
      apiUrl: ""
    }
  }
};
