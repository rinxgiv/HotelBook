# Dokumentace – HotelBook

HotelBook je jednoduchá **frontendová PWA** pro vyhledávání hotelů a rezervaci pokojů.
Běží celá v prohlížeči – nemá žádný backend ani databázi. Hotely hledá přímo přes
**Google Places API** a vše ostatní (rezervace, obsazenost) si pamatuje v prohlížeči
v `localStorage`.

---

## 1. Jak appku spustit

Protože je to PWA, **service worker funguje jen přes `http(s)`**, ne přes otevření
souboru `file://`. Spusť si proto jednoduchý lokální server:

```
python3 -m http.server 8080
```

a otevři `http://localhost:8080/index.html`.

> Když po úpravách vidíš starou verzi, smaž starý service worker:
> DevTools (F12) → **Application** → **Service Workers** → **Unregister**, pak tvrdý reload (Cmd/Ctrl+Shift+R).

---

## 2. Struktura souborů

| Soubor | K čemu slouží |
|---|---|
| `index.html` | stránka vyhledávání hotelů |
| `hotel.html` | detail hotelu + rezervace pokoje |
| `reservations.html` | moje rezervace |
| `script.js` | veškerá logika aplikace (sdílená všemi stránkami) |
| `css/style.css` | vzhled |
| `manifest.json` | popis PWA (jméno, ikony, barvy) |
| `service-worker.js` | offline režim a cache |
| `icons/` | ikony aplikace (192 a 512 px) |

---

## 3. Jak to funguje

### Architektura
Aplikace má tři HTML stránky, ale **jediný** `script.js`, který je do všech vložený.
Na konci souboru je „rozcestník", který podle přítomnosti unikátního prvku pozná,
na které stránce právě jsme, a spustí jen tu správnou inicializaci:

```js
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('search-form'))       initSearchPage();
  if (document.getElementById('detail-content'))    initHotelPage();
  if (document.getElementById('reservations-list')) initReservationsPage();
});
```

### Vyhledávání hotelů (Google Places API)
Funkce `searchHotels()` volá Google Places API **přímo z prohlížeče** (podporuje CORS,
takže není potřeba žádný server-prostředník). Posílá `POST` na
`places.googleapis.com/v1/places:searchText`, kde:

- hlavička `X-Goog-Api-Key` nese API klíč,
- hlavička `X-Goog-FieldMask` určuje, **která pole** se mají vrátit (jméno, adresa,
  hodnocení, web, telefon, souřadnice, fotky) – tím se šetří data,
- tělo obsahuje hledané město, jazyk a typ `lodging` (ubytování).

Odpověď z Googlu má jiný tvar, než aplikace potřebuje, proto ji `normalizeHotel()`
převede do jednotného formátu (`place_id`, `name`, `formatted_address`, `website`,
`rating`, `image`, souřadnice…).

### Kam a co se ukládá (`localStorage`)
`localStorage` je úložiště v prohlížeči typu „klíč → text". Aplikace používá pomocné
funkce `read()` a `write()`, které data převádějí na JSON a zpět.

| Klíč | Co obsahuje |
|---|---|
| `hotelbook_reservations` | seznam všech rezervací |
| `hotelbook_occupancy` | obsazenost pokojů; klíč `"roomId\|datum"` → id rezervace |
| `hotelbook_hotels_cache` | stažené hotely (aby fungoval detail i offline) |
| `hotelbook_searches` | posledních 5 hledaných měst |
| `hotelbook_last_guest` | naposledy zadané jméno (předvyplnění) |

Klíčový nápad je **obsazenost po jednotlivých nocích**: každá obsazená noc má vlastní
záznam. Díky tomu je kontrola volnosti pokoje jednoduchá – stačí se zeptat na každou
noc pobytu zvlášť, není potřeba počítat překrývání intervalů.

### Pokoje
Google nevrací seznam pokojů, takže si je aplikace **vygeneruje sama** – ale
**deterministicky** z funkce `hash(place_id)`. To znamená, že stejný hotel má pokaždé
stejné pokoje, čísla i ceny. Kdyby se losovaly náhodně, neseděly by uložené rezervace.

### Rezervace a obsazenost
- `saveReservation()` – vytvoří rezervaci s unikátním id a označí každou noc pobytu
  jako obsazenou.
- `isRoomFree()` – ověří, že žádná noc pobytu není obsazená.
- `cancelReservation()` – nastaví stav „zrušeno" a uvolní jen noci patřící dané rezervaci.
- `renderReservations()` – najde rezervace podle **přesné shody jména** a vykreslí je.

### PWA (instalace a offline)
PWA stojí na dvou věcech:

- **`manifest.json`** – popisuje aplikaci pro instalaci (jméno, ikony, barvy,
  `display: standalone`, relativní `start_url`/`scope`).
- **`service-worker.js`** – běží na pozadí a má tři fáze:
  - `install` – uloží do cache soubory aplikace (každý zvlášť, aby jeden chybějící
    neshodil celou instalaci),
  - `activate` – smaže staré verze cache a převezme řízení (`clients.claim()`),
  - `fetch` – **network-first**: zkusí síť, a když selže (offline), vrátí soubor z cache.

Network-first znamená, že uživatel vždy vidí čerstvou verzi, a cache slouží hlavně
jako záchrana pro offline.

### Mapy
Funkce `mapUrl()` a `routeUrl()` jen sestaví odkaz na Google Maps z adresy nebo
souřadnic. Nejde o žádné placené volání API, jen o proklik.

### Datumy
- `isoDate()` – formát `YYYY-MM-DD` v UTC, používá se pro klíče obsazenosti.
- `isoDateLocal()` – formát `YYYY-MM-DD` v místním čase, pro předvyplnění polí.
- `nights()` – počet nocí mezi dvěma daty, `czDate()` – český formát data.

### Bezpečnost (XSS)
Cokoli, co pochází z API, od uživatele nebo z `localStorage`, se před vložením do
`innerHTML` prožene funkcí `escapeHtml()`, která nahradí nebezpečné HTML znaky
entitami. Odkaz na web hotelu se navíc vloží jen tehdy, když začíná na `http(s)://`.

---

## 4. Poznámky

- **API klíč** je v `script.js` (konstanta `GOOGLE_PLACES_KEY`). Protože je aplikace
  čistě frontendová, klíč je v prohlížeči vidět – je potřeba ho omezit v Google Cloud
  Console (povolené API + HTTP referrer).
- Aplikace **nepotřebuje build ani instalaci závislostí** – jsou to jen statické soubory.
