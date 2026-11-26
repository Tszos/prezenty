# Lista prezentów 🎁

Strona z listą prezentów, którą możesz wysłać rodzinie i znajomym. Każdy może
zarezerwować prezent jednym kliknięciem, **bez zakładania konta**. Inni od razu
widzą, że dana pozycja jest zajęta.

- **Strona** (`docs/`): statyczny HTML/JS hostowany za darmo na GitHub Pages.
- **Dane** (`worker/`): Cloudflare Worker + baza D1 (darmowy plan), jedno API dla wszystkich list:
  `https://prezenty-api.tszos.workers.dev/<osoba>`. Lista ładuje się w ok. 0,1 s.
  Prezenty dodajesz aplikacją „Dodaj prezent” albo edytujesz na stronie listy (tryb właściciela).
- Do listopada 2026 dane były w arkuszach Google z Apps Script (`apps-script/`, już nieużywane).

## Jak to działa bez kont?

Przy pierwszej wizycie przeglądarka dostaje losowy, anonimowy token (zapisany w
`localStorage`). Rezerwacja jest do niego przypisana, więc tylko ta sama osoba
(na tym samym urządzeniu i w tej samej przeglądarce) może ją anulować. Pozostali
widzą tylko imię, którym się podpisała. Rezerwacje chroni blokada po stronie
serwera (jedna rezerwacja na prezent w bazie), więc dwie osoby nie zarezerwują tego samego prezentu.

**Tryb niespodzianki:** w stopce jest przycisk „Jestem Tomek – ukryj przede mną
rezerwacje”. Ukrywa rezerwacje na Twoim urządzeniu.

## Konfiguracja

### 1. Backend (Cloudflare Worker + D1)

Wymaga darmowego konta Cloudflare i `wrangler login`. Jednorazowo:

```bash
cd worker
wrangler d1 create prezenty          # wpisz database_id do wrangler.jsonc
wrangler d1 migrations apply prezenty --remote
wrangler deploy
```

Zmiany w `worker/src/` wdrażasz samym `wrangler deploy` (z folderu `worker/`). Nowa migracja w
`worker/migrations/` → najpierw `wrangler d1 migrations apply prezenty --remote`.

### 2. Strona

1. W [`docs/config.js`](docs/config.js) każda osoba ma `apiUrl` = `https://prezenty-api.tszos.workers.dev/<folder>`. Pusty `apiUrl` = tryb demo.
2. Commit i push na `main`. GitHub Pages: **Settings → Pages**, *Branch:* **main**, folder **/docs**.
3. Strona: `https://<login>.github.io/<repo>/`. Ten link wysyłasz rodzinie.

> GitHub Pages na darmowym planie działa tylko dla **publicznych** repozytoriów.
> Lista jest oznaczona `noindex`, ale każdy z linkiem może ją otworzyć.

### Nowa lista (osoba)

1. `node scripts/new-list.mjs <osoba>`: zakłada listę w D1 i dopisuje jej klucz właściciela do `setup-links.local.md`.
2. Dopisz osobę w `people` w `docs/config.js` i skopiuj folder `docs/tomek/` pod nazwą `<osoba>`, zmieniając w `index.html` tylko `data-person`.
3. `scripts/stamp.sh`, commit, push. Klucz dopisz do linku aplikacji „Dodaj prezent”.

### Dodawanie prezentów z telefonu (aplikacja „Dodaj prezent”)

`docs/dodaj/` to mała aplikacja (PWA), która po instalacji pojawia się w menu **Udostępnij** na Androidzie.
Udostępniasz stronę produktu, wybierasz listę, poprawiasz nazwę i cenę, klikasz **Dodaj**.

1. Każda lista ma własny klucz właściciela. W bazie jest tylko jego skrót (SHA-256); sam klucz jest w `setup-links.local.md`.
2. Na telefonie otwórz w **Chrome** link `…/prezenty/dodaj/#klucze=tomek:KLUCZ,ania:KLUCZ` (część po `#` nie trafia na serwer),
   potem menu ⋮ → **Zainstaluj aplikację**.
3. Klucz pozwala zmieniać listę, więc nie publikuj go. Nowy klucz: zmień `key_hash` danej listy w tabeli `lists`.

### Edycja listy

Właściciel listy (przeglądarka z kluczem z aplikacji „Dodaj prezent”) na samej stronie listy
edytuje prezenty, zmienia ich grupę listą „Grupa” na kafelku (z gotowymi propozycjami z `defaultGroups`
w `config.js` i opcją „+ Nowa grupa…”), zmienia kolejność przeciąganiem w obrębie grupy, przestawia
całe grupy przeciąganiem za uchwyt w nagłówku (albo strzałkami z klawiatury) i usuwa pozycje. U niego rezerwacje są
domyślnie ukryte; „Pokaż rezerwacje” działa do zamknięcia karty.
`Grupa` dzieli listę na sekcje w kolejności pierwszego prezentu z każdej grupy; prezenty bez grupy trafiają do „Pozostałe”.

Ręczne poprawki (np. zwolnienie rezerwacji): `wrangler d1 execute prezenty --remote --command "…"`
na tabelach `items` i `claims` (schemat w `worker/migrations/`).

## Publikowanie zmian strony

GitHub Pages pozwala przeglądarkom trzymać każdy plik przez 10 minut. Przed commitem zmian w `docs/`
uruchom `scripts/stamp.sh`: dopisuje `?v=…` do linków CSS/JS, więc telefony pobiorą nową wersję w całości.

## Podgląd lokalny

Lokalnie (`localhost:8000`) strona korzysta z prawdziwego API, bo Worker przyjmuje zapytania z tego adresu.
Bez ustawionego `apiUrl` działa w **trybie demo** (przykładowe prezenty, dane tylko w przeglądarce):

```bash
cd docs && python3 -m http.server 8000
# otwórz http://localhost:8000 (wybór osoby) lub http://localhost:8000/ania/
```
