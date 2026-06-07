# HotelBook – dokumentace

## Účel aplikace

HotelBook je webová aplikace, ve které si uživatel najde hotel a zarezervuje pokoj.
Celá běží v prohlížeči, nemá žádný server ani databázi. Hotely se hledají přes Google
Places API a vytvořené rezervace se ukládají do `localStorage`. Aplikace je zároveň PWA,
takže jde nainstalovat a po prvním načtení funguje i bez internetu.

## Struktura projektu

Soubory v repozitáři:

- `index.html` – vyhledávání hotelů
- `hotel.html` – detail hotelu a rezervace pokoje
- `reservations.html` – moje rezervace
- `script.js` – logika celé aplikace, sdílí ji všechny tři stránky
- `css/style.css` – styly
- `manifest.json` – nastavení PWA (název, ikony, barvy)
- `service-worker.js` – cache a offline režim
- `icons/` – ikony aplikace (192 a 512 px)
- `ZADANI.md` – zadání projektu
- `DOKUMENTACE.md` – tento soubor

## Použité API endpointy

Aplikace volá Google Places API (New) přímo z prohlížeče.

**`POST https://places.googleapis.com/v1/places:searchText`**
Najde hotely podle zadaného města. V hlavičkách se posílá `X-Goog-Api-Key` (API klíč)
a `X-Goog-FieldMask`, kterým aplikace říká, jaká pole chce vrátit (název, adresa,
hodnocení, web, telefon, souřadnice, fotka).

**`GET https://places.googleapis.com/v1/{nazev_fotky}/media?maxWidthPx=400&key=API_KEY`**
Stáhne náhledovou fotku hotelu.

Kromě toho aplikace skládá odkazy na Google Maps. To už ale nejsou volání API, jen
běžné odkazy:
`https://www.google.com/maps/search/?api=1&query=...` (hotel na mapě) a
`https://www.google.com/maps/dir/?api=1&travelmode=driving&...` (trasa přes více hotelů).

## Use-case diagram

```
     
      Uživatel (host)   
      |
      v
  +---------------------------------------
  |  HotelBook
  |
  |    ( Vyhledat hotely podle města )
  |    ( Zobrazit detail hotelu )
  |    ( Zkontrolovat dostupnost pokojů )
  |    ( Rezervovat pokoj )
  |    ( Zobrazit moje rezervace )
  |    ( Zrušit rezervaci )
  |    ( Otevřít mapu / trasu hotelu )
  +---------------------------------------
```

## Jak jednotlivé části fungují

### Rozdělení na stránky
Aplikace má tři HTML stránky, ale jen jeden `script.js`. Aby se na každé stránce spustil
jen ten správný kód, je na konci souboru jednoduchý přepínač. Ten se podívá, jestli na
stránce existuje určitý prvek (např. vyhledávací formulář), a podle toho zavolá patřičnou
inicializační funkci:

```js
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('search-form'))       initSearchPage();
  if (document.getElementById('detail-content'))    initHotelPage();
  if (document.getElementById('reservations-list')) initReservationsPage();
});
```

### Vyhledávání hotelů
Funkce `searchHotels()` pošle požadavek na endpoint `places:searchText` se jménem města.
Odpověď z Googlu má jiný tvar, než aplikace používá, takže ji `normalizeHotel()` přepíše
do vlastního formátu (`place_id`, `name`, `formatted_address`, `website`, `rating`,
`image`, souřadnice). Hotely se zároveň uloží do cache v `localStorage`, aby šel později
otevřít jejich detail i bez nového dotazu.

### Ukládání do localStorage
`localStorage` umí ukládat jen text, proto data procházejí přes funkce `read()` a
`write()`, které je převádějí na JSON a zpět. Aplikace používá tyto klíče:

- `hotelbook_reservations` – seznam rezervací
- `hotelbook_occupancy` – obsazenost pokojů, klíč má tvar `roomId|datum` a hodnotou je id rezervace
- `hotelbook_hotels_cache` – stažené hotely
- `hotelbook_searches` – posledních pět hledaných měst
- `hotelbook_last_guest` – naposledy zadané jméno

Obsazenost se ukládá zvlášť pro každou noc pobytu. Díky tomu je kontrola volnosti
pokoje snadná, protože se jen pro každou noc ověří, jestli už není zabraná. Nemusí se
počítat překrývání termínů.

### Generování pokojů
Google seznam pokojů nevrací, takže si je aplikace dopočítá sama funkcí `roomsFor()`.
Počet pokojů, patra i ceny vycházejí z `hash(place_id)`, což je číslo, které je pro
stejný hotel vždycky stejné. Stejný hotel tak má pořád stejné pokoje. Kdyby se losovaly
náhodně, po znovunačtení stránky by se rozpadly už uložené rezervace.

### Rezervace a obsazenost
- `saveReservation()` vytvoří rezervaci, dá jí vlastní id a každou noc pobytu označí jako obsazenou.
- `isRoomFree()` zkontroluje, že žádná noc pobytu není zabraná.
- `cancelReservation()` rezervaci označí jako zrušenou a uvolní jen ty noci, které k ní patří.
- `renderReservations()` najde rezervace podle přesné shody jména a vypíše je.

### PWA a service worker
O PWA se starají dva soubory. `manifest.json` popisuje aplikaci pro instalaci (název,
ikony, barvy, režim `standalone`). `service-worker.js` běží na pozadí a má tři části:

- `install` uloží soubory aplikace do cache (každý zvlášť, aby jeden chybějící soubor neshodil celou instalaci),
- `activate` smaže staré verze cache a převezme řízení nad otevřenými stránkami,
- `fetch` používá strategii network-first: nejdřív zkusí síť a teprve když není dostupná, vezme soubor z cache.

### Datumy
`isoDate()` vrací datum ve formátu `YYYY-MM-DD` v UTC a používá se pro klíče obsazenosti.
`isoDateLocal()` dělá to samé v místním čase a slouží k předvyplnění datových polí, aby
datum nehrálo o den. `nights()` spočítá počet nocí a `czDate()` převede datum do českého
zápisu.

### Ochrana proti XSS
Texty, které přicházejí z API, od uživatele nebo z `localStorage`, se před vložením do
stránky přes `innerHTML` proženou funkcí `escapeHtml()`. Ta nahradí nebezpečné HTML znaky
za entity. Odkaz na web hotelu se navíc vloží jen tehdy, když začíná na `http://` nebo
`https://`.

## Poznámky

API klíč je uložený v `script.js` v konstantě `GOOGLE_PLACES_KEY`. Protože je aplikace
čistě frontendová, klíč je v prohlížeči vidět, takže by měl být v Google Cloud Console
omezený (povolená API a HTTP referrer). Aplikace nepotřebuje žádný build ani instalaci
knihoven, jsou to jen statické soubory.
