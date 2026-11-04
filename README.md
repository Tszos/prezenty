# Lista prezentów 🎁

Strona z listą prezentów, którą możesz wysłać rodzinie i znajomym. Każdy może
zarezerwować prezent jednym kliknięciem, **bez zakładania konta**. Inni od razu
widzą, że dana pozycja jest zajęta.

- **Strona** (`docs/`): statyczny HTML/JS hostowany za darmo na GitHub Pages.
- **Dane** (`apps-script/Code.gs`): arkusz Google + Google Apps Script jako darmowe API.
  Prezenty dodajesz, wpisując je do arkusza. Rezerwacje zapisują się w drugiej zakładce.

## Jak to działa bez kont?

Przy pierwszej wizycie przeglądarka dostaje losowy, anonimowy token (zapisany w
`localStorage`). Rezerwacja jest do niego przypisana, więc tylko ta sama osoba
(na tym samym urządzeniu i w tej samej przeglądarce) może ją anulować. Pozostali
widzą tylko imię, którym się podpisała. Rezerwacje chroni blokada po stronie
serwera, więc dwie osoby nie zarezerwują tego samego prezentu.

**Tryb niespodzianki:** w stopce jest przycisk „Jestem Tomek – ukryj przede mną
rezerwacje”. Ukrywa rezerwacje na Twoim urządzeniu. W arkuszu po prostu nie
otwieraj zakładki „Rezerwacje” 🙂

## Konfiguracja (ok. 10 minut)

### 1. Arkusz Google + backend

1. Utwórz nowy arkusz na <https://sheets.new>.
2. Menu **Rozszerzenia → Apps Script**.
3. Usuń zawartość pliku `Kod.gs` i wklej całą zawartość [`apps-script/Code.gs`](apps-script/Code.gs). Zapisz (Ctrl+S).
4. Na górze wybierz funkcję **`setup`** i kliknij **Uruchom**. Zatwierdź uprawnienia
   (Google ostrzeże, że aplikacja jest niezweryfikowana: *Zaawansowane → Przejdź do projektu*).
   W arkuszu pojawią się zakładki **Prezenty** i **Rezerwacje**.
5. Kliknij **Wdróż → Nowe wdrożenie** → typ **Aplikacja internetowa**:
   - *Wykonaj jako:* **Ja**
   - *Kto ma dostęp:* **Każdy**
6. Skopiuj **URL aplikacji internetowej** (kończy się na `/exec`).

### 2. Strona

1. W pliku [`docs/config.js`](docs/config.js) wklej URL do `apiUrl` i ustaw swoje imię i okazję.
2. Zrób commit i push na gałąź `main`.
3. W repo na GitHubie: **Settings → Pages → Build and deployment**:
   *Source:* **Deploy from a branch**, *Branch:* **main**, folder **/docs**.
4. Po minucie strona będzie dostępna pod `https://<twój-login>.github.io/<nazwa-repo>/`.
   Ten link wysyłasz rodzinie.

> GitHub Pages na darmowym planie działa tylko dla **publicznych** repozytoriów.
> Lista jest oznaczona `noindex`, więc nie pojawi się w wyszukiwarkach, ale każdy z linkiem może ją otworzyć.

### 3. Dodawanie prezentów

Wpisuj kolejne wiersze w zakładce **Prezenty**: `Nazwa`, `Opis`, `Cena`, `Sklep`, `Link`.
Kolumnę `ID` zostaw pustą, uzupełni się sama. Kolejność wierszy = kolejność na stronie.
Aby usunąć prezent, usuń jego wiersz. Aby ręcznie zwolnić rezerwację, usuń wiersz w zakładce **Rezerwacje**.

> Zmiany w `Code.gs` wymagają nowej wersji wdrożenia (**Wdróż → Zarządzaj wdrożeniami → Edytuj → Nowa wersja**).
> Zmiany w samym arkuszu (prezenty) działają od razu.

## Podgląd lokalny

Bez ustawionego `apiUrl` strona działa w **trybie demo** (przykładowe prezenty, dane tylko w przeglądarce):

```bash
cd docs && python3 -m http.server 8000
# otwórz http://localhost:8000
```
