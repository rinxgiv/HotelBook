# HotelBook

Jednoducha frontend aplikace pro vyhledani hotelu a vytvoreni rezervace.
Bezi cele v prohlizeci (zadny backend) a hleda hotely primo pres Google Places API.

## Spusteni

Aplikace je PWA, takze service worker funguje jen pres http(s), ne pres `file://`.
Spust si proto jednoduchy lokalni server, napr.:

```
python3 -m http.server 8080
```

a otevri `http://localhost:8080/index.html`.

## Soubory

- `index.html` - vyhledavani hotelu
- `hotel.html` - detail hotelu a rezervace
- `reservations.html` - moje rezervace
- `script.js` - JavaScript aplikace a prime volani Google Places API
- `css/style.css` - vzhled aplikace
- `service-worker.js` a `manifest.json` - PWA

## Funkce

- prime volani Google Places API (new) z prohlizece
- hledani hotelu podle mesta
- odkazy na mapu a trasu
- rezervace pokoju
- zruseni rezervace
- ulozeni dat do `localStorage`

## Google Places API klic

Klic je ulozeny v `script.js` (konstanta `GOOGLE_PLACES_KEY`). Protoze je aplikace
cele frontendova, klic je videt v prohlizeci - omez ho proto v Google Cloud Console
(HTTP referrer + povolena API).
