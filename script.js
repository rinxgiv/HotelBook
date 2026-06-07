const MAX_RESULTS = 20;
const MAX_SEARCHES = 5;

const GOOGLE_PLACES_KEY = 'AIzaSyC4A9XOTK2PPIvwva-wsmBtTxpAGGVAvzg';

// klice pro localStorage; OCC mapuje "roomId|datum" -> id rezervace (obsazenost po jednotlivych nocich)
const KEYS = {
  RES:      'hotelbook_reservations',
  OCC:      'hotelbook_occupancy',
  CACHE:    'hotelbook_hotels_cache',
  SEARCHES: 'hotelbook_searches',
};

const ROOM_TYPES = [
  ['Standard jednoluzkovy', 1, 79],
  ['Standard dvouluzkovy', 2, 109],
  ['Deluxe dvouluzkovy',   2, 149],
  ['Junior Suite',         3, 199],
  ['Executive Suite',      4, 279],
];

function read(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (value) return JSON.parse(value);
    return fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// YYYY-MM-DD v UTC - pouziva se pro klice obsazenosti (konzistentni napric casovymi pasmy)
function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

// YYYY-MM-DD v mistnim case - pro predvyplneni datovych inputu (jinak by datum hralo o den)
function isoDateLocal(date) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

function czDate(value) {
  const parts = value.split('-');
  return parts[2] + '. ' + parts[1] + '. ' + parts[0];
}

// ochrana proti XSS: nahradi HTML znaky entitami pred vlozenim textu do innerHTML
function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function nights(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 86400000); // 86400000 ms = 1 den
}

function pluralNights(n) {
  if (n === 1) return 'noc';
  return 'noci';
}

function show(id, display) {
  const el = document.getElementById(id);
  if (el) el.style.display = display;
}

// vrati vsechny noci pobytu jako YYYY-MM-DD (od prijezdu do dne pred odjezdem)
function nightDates(from, to) {
  const dates   = [];
  const current = new Date(from);
  const end     = new Date(to);
  while (current < end) {
    dates.push(isoDate(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

// --- localStorage ---

function saveRecentSearch(query) {
  const searches = read(KEYS.SEARCHES, []).filter(function(item) {
    return item.toLowerCase() !== query.toLowerCase();
  });
  searches.unshift(query);
  write(KEYS.SEARCHES, searches.slice(0, MAX_SEARCHES));
}

function saveHotel(hotel) {
  const cache = read(KEYS.CACHE, {});
  cache[hotel.place_id] = hotel;
  write(KEYS.CACHE, cache);
}

function getHotel(placeId) {
  return read(KEYS.CACHE, {})[placeId] || null;
}

// vola Google Places API primo z prohlizece; FieldMask urcuje, ktera pole se maji vratit
async function searchHotels(city, checkIn, checkOut) {
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_PLACES_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.rating,places.websiteUri,places.nationalPhoneNumber,places.location,places.photos',
    },
    body: JSON.stringify({
      textQuery: 'hotely ' + city,
      includedType: 'lodging',
      maxResultCount: MAX_RESULTS,
      languageCode: 'cs',
    }),
  });
  const data = await response.json().catch(function() { return null; });
  if (!response.ok || !data) {
    throw new Error((data && data.error && data.error.message) || ('Chyba Google Places API (' + response.status + ')'));
  }
  if (data.error) throw new Error(data.error.message || 'Chyba Google Places API');
  return (data.places || []).map(function(h, i) {
    return normalizeHotel(h, city, i);
  });
}

// prevede odpoved Google Places do jednotneho tvaru, ktery appka pouziva
function normalizeHotel(hotel, city, index) {
  const loc = hotel.location || {};
  let image = '';
  if (hotel.photos && hotel.photos[0]) {
    image = 'https://places.googleapis.com/v1/' + hotel.photos[0].name + '/media?maxWidthPx=400&key=' + GOOGLE_PLACES_KEY;
  }
  return {
    place_id:               hotel.id || String(index),
    name:                   (hotel.displayName && hotel.displayName.text) || 'Hotel',
    city:                   city,
    formatted_address:      hotel.formattedAddress || '',
    formatted_phone_number: hotel.nationalPhoneNumber || '',
    website:                hotel.websiteUri || '',
    rating:                 hotel.rating || '',
    image:                  image,
    price_per_night_text:   '',
    price_per_night:        120,
    latitude:               loc.latitude  || null,
    longitude:              loc.longitude || null,
  };
}

// --- mapy ---

function mapQuery(hotel) {
  if (hotel.formatted_address) return hotel.formatted_address;
  if (hotel.latitude && hotel.longitude) return hotel.latitude + ',' + hotel.longitude;
  return hotel.name + ', ' + (hotel.city || '');
}

function mapUrl(hotel) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQuery(hotel));
}

function routeUrl(hotels) {
  const list = hotels.filter(function(h) { return h.latitude && h.longitude; }).slice(0, 10);
  if (!list.length) return '';
  if (list.length === 1) return mapUrl(list[0]);
  const last = list[list.length - 1];
  const waypoints = list.slice(0, list.length - 1).map(mapQuery).join('|');
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving'
    + '&destination=' + encodeURIComponent(mapQuery(last))
    + '&waypoints=' + encodeURIComponent(waypoints);
}

// --- pokoje ---

// deterministicky hash - pro stejny text vraci vzdy stejne cislo
function hash(text) {
  let value = 0;
  for (let i = 0; i < text.length; i++) {
    value = (value * 31 + text.charCodeAt(i)) >>> 0;
  }
  return value;
}

// pokoje jsou odvozene z place_id, takze jsou pro dany hotel vzdy stejne (nemame DB)
function roomsFor(placeId) {
  const base  = hash(placeId);
  const rooms = [];
  ROOM_TYPES.forEach(function(roomType, typeIndex) {
    const type          = roomType[0];
    const capacity      = roomType[1];
    const price         = roomType[2];
    const count         = 2 + ((base + typeIndex * 7) % 4);
    const floor         = typeIndex + 1;
    const pricePerNight = Math.round(price * (1 + (base % 20) / 100));
    for (let i = 0; i < count; i++) {
      const number = String(floor * 100 + i + 1);
      rooms.push({ roomId: placeId + '#' + number, roomNumber: number, type: type, capacity: capacity, pricePerNight: pricePerNight });
    }
  });
  return rooms;
}

function isRoomFree(roomId, checkIn, checkOut) {
  const occupied = read(KEYS.OCC, {});
  return nightDates(checkIn, checkOut).every(function(date) {
    return !occupied[roomId + '|' + date];
  });
}

// --- rezervace ---

function saveReservation(data) {
  const count = nights(data.checkInDate, data.checkOutDate);
  if (!(count >= 1)) return null;
  const reservation = {
    id:           'res_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    guestName:    data.guestName.trim(),
    hotelPlaceId: data.hotelPlaceId,
    hotelName:    data.hotelName,
    roomId:       data.roomId,
    roomNumber:   data.roomNumber,
    roomType:     data.roomType,
    checkInDate:  data.checkInDate,
    checkOutDate: data.checkOutDate,
    nights:       count,
    totalPrice:   Math.round(data.pricePerNight * count),
    status:       'confirmed',
    createdAt:    new Date().toISOString(),
  };
  const reservations = read(KEYS.RES, []);
  const occupied     = read(KEYS.OCC, {});
  reservations.push(reservation);
  // oznac kazdou noc pobytu jako obsazenou
  nightDates(data.checkInDate, data.checkOutDate).forEach(function(date) {
    occupied[data.roomId + '|' + date] = reservation.id;
  });
  write(KEYS.RES, reservations);
  write(KEYS.OCC, occupied);
  return reservation;
}

function cancelReservation(id) {
  const reservations = read(KEYS.RES, []);
  const reservation  = reservations.find(function(item) { return item.id === id; });
  if (!reservation || reservation.status === 'cancelled') return;
  reservation.status = 'cancelled';
  const occupied = read(KEYS.OCC, {});
  // uvolni jen noci patrici teto rezervaci (at neuvolnime cizi novou rezervaci na stejny pokoj)
  nightDates(reservation.checkInDate, reservation.checkOutDate).forEach(function(date) {
    const key = reservation.roomId + '|' + date;
    if (occupied[key] === reservation.id) delete occupied[key];
  });
  write(KEYS.RES, reservations);
  write(KEYS.OCC, occupied);
}

// prijezd = zitra, odjezd = pozitri; min brani vyberu data v minulosti
function setDefaultDates(checkInId, checkOutId) {
  const tomorrow      = new Date();
  const afterTomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  afterTomorrow.setDate(afterTomorrow.getDate() + 2);
  document.getElementById(checkInId).value = isoDateLocal(tomorrow);
  document.getElementById(checkOutId).value = isoDateLocal(afterTomorrow);
  document.getElementById(checkInId).min = isoDateLocal(tomorrow);
  document.getElementById(checkOutId).min = isoDateLocal(afterTomorrow);
}

// --- inicializace stranky ---

// podle pritomnosti unikatniho prvku pozna, na ktere strance jsme, a spusti spravny init
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('search-form'))       initSearchPage();
  if (document.getElementById('detail-content'))    initHotelPage();
  if (document.getElementById('reservations-list')) initReservationsPage();
});

function initSearchPage() {
  setDefaultDates('checkin-input', 'checkout-input');
  renderRecentSearches();
  document.getElementById('search-form').addEventListener('submit', function(event) {
    event.preventDefault();
  });
  document.getElementById('search-button').addEventListener('click', function() {
    const city     = document.getElementById('search-input').value.trim();
    const checkIn  = document.getElementById('checkin-input').value;
    const checkOut = document.getElementById('checkout-input').value;
    if (!city) return showSearchError('Zadejte prosim mesto.');
    if (!(nights(checkIn, checkOut) >= 1)) return showSearchError('Odjezd musi byt pozdeji nez prijezd.');
    runSearch(city, checkIn, checkOut);
  });
}

async function runSearch(city, checkIn, checkOut) {
  show('spinner', 'flex');
  ['results-section', 'results-list', 'search-error', 'no-results'].forEach(function(id) { show(id, 'none'); });
  try {
    const hotels = await searchHotels(city, checkIn, checkOut);
    hotels.forEach(saveHotel);
    saveRecentSearch(city);
    renderRecentSearches();
    history.replaceState({}, '', '?q=' + encodeURIComponent(city));
    if (hotels.length) {
      renderHotels(city, hotels);
    } else {
      showNoResults(city);
    }
  } catch (error) {
    showSearchError(error.message);
  } finally {
    show('spinner', 'none');
  }
}

function renderHotels(city, hotels) {
  document.getElementById('results-query').textContent = city;
  document.getElementById('results-count').textContent = '- ' + hotels.length + ' hotelu';
  const route = routeUrl(hotels);
  document.getElementById('maps-route-link').href = route || '#';
  document.getElementById('maps-route-link').style.display = route ? 'inline-flex' : 'none';
  document.getElementById('hotel-results').innerHTML = hotels.map(hotelCard).join('');
  show('results-section', 'flex');
  show('results-list', 'block');
}

function hotelCard(hotel, index) {
  const params = new URLSearchParams({ place_id: hotel.place_id, name: hotel.name });
  let image;
  if (hotel.image) {
    image = '<img src="' + escapeHtml(hotel.image) + '" alt="' + escapeHtml(hotel.name) + '" class="hotel-card-img">';
  } else {
    image = '<div class="hotel-card-img hotel-card-img-empty">' + (index + 1) + '</div>';
  }
  const rating = hotel.rating ? hotel.rating + ' / 5' : 'Bez hodnoceni';
  const price  = hotel.price_per_night_text || 'Cena neni uvedena';
  return `
    <article class="hotel-card">
      ${image}
      <div class="hotel-card-body">
        <div class="hotel-card-top">
          <span class="hotel-number">${index + 1}</span>
          <div><h2>${escapeHtml(hotel.name)}</h2><p>${escapeHtml(hotel.formatted_address || hotel.city || 'Adresa neni uvedena')}</p></div>
        </div>
        <div class="hotel-card-meta">
          <span>${rating}</span>
          <span>${price} / noc</span>
        </div>
        <div class="hotel-card-actions">
          <a class="btn btn-primary btn-sm" href="hotel.html?${params}">Rezervovat</a>
          <a class="btn btn-outline btn-sm" href="${mapUrl(hotel)}" target="_blank" rel="noopener">Mapa</a>
        </div>
      </div>
    </article>`;
}

function renderRecentSearches() {
  const box = document.getElementById('recent-searches');
  if (!box) return;
  const searches = read(KEYS.SEARCHES, []);
  box.style.display = searches.length ? 'flex' : 'none';
  box.innerHTML = searches.map(function(item) {
    return '<button class="recent-chip" type="button" data-query="' + escapeHtml(item) + '">' + escapeHtml(item) + '</button>';
  }).join('');
  box.querySelectorAll('button').forEach(function(button) {
    button.addEventListener('click', function() {
      document.getElementById('search-input').value = button.dataset.query;
      document.getElementById('search-button').click();
    });
  });
}

function showNoResults(city) {
  document.querySelector('.no-results-query').textContent = '"' + city + '"';
  show('no-results', 'block');
}

function showSearchError(message) {
  document.getElementById('search-error').querySelector('.error-msg').textContent = message;
  show('search-error', 'block');
}

// --- hotel detail ---

let currentHotel = null;
let selectedRoom  = null;

function initHotelPage() {
  const params  = new URLSearchParams(location.search);
  const placeId = params.get('place_id');
  if (!placeId) {
    location.href = 'index.html';
    return;
  }
  // hotel vezmi z cache; pokud tam neni (primy odkaz), pouzij aspon nazev z URL
  currentHotel = getHotel(placeId) || { place_id: placeId, name: params.get('name') || 'Hotel', price_per_night: 120 };
  setDefaultDates('room-checkin', 'room-checkout');
  document.getElementById('room-checkin').addEventListener('change',  function() { renderRooms(placeId); });
  document.getElementById('room-checkout').addEventListener('change', function() { renderRooms(placeId); });
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', function(event) {
    if (event.target.id === 'modal-overlay') closeModal();
  });
  document.getElementById('booking-form').addEventListener('submit', function(event) { bookRoom(event, placeId); });
  renderHotel();
  renderRooms(placeId);
}

function renderHotel() {
  document.title = currentHotel.name + ' - HotelBook';
  document.getElementById('hotel-name-title').textContent      = currentHotel.name;
  document.getElementById('hotel-breadcrumb-name').textContent = currentHotel.name;
  document.getElementById('hotel-address-header').textContent  = currentHotel.formatted_address || currentHotel.city || '';
  document.getElementById('info-address').textContent = currentHotel.formatted_address || 'Adresa neni uvedena';
  document.getElementById('info-phone').textContent   = currentHotel.formatted_phone_number || 'Neuvedeno';
  // jen http(s) odkaz, aby slo do href vlozit nebezpecne "javascript:"
  const website = currentHotel.website || '';
  if (/^https?:\/\//i.test(website)) {
    document.getElementById('info-website').innerHTML = '<a href="' + escapeHtml(website) + '" target="_blank" rel="noopener">Otevrit web</a>';
  } else {
    document.getElementById('info-website').textContent = 'Neuvedeno';
  }
  document.getElementById('info-maps').innerHTML = '<a href="' + mapUrl(currentHotel) + '" target="_blank" rel="noopener">Otevrit mapu</a>';
  show('detail-content', 'block');
  show('detail-spinner', 'none');
}

function renderRooms(placeId) {
  const checkIn  = document.getElementById('room-checkin').value;
  const checkOut = document.getElementById('room-checkout').value;
  // seskup pokoje podle typu a u kazdeho typu najdi prvni volny pokoj
  const groups   = new Map();
  roomsFor(placeId).forEach(function(room) {
    if (!groups.has(room.type)) groups.set(room.type, []);
    groups.get(room.type).push(room);
  });
  document.getElementById('rooms-list').innerHTML = '';
  groups.forEach(function(rooms, type) {
    const first = rooms[0];
    const free  = rooms.find(function(room) { return isRoomFree(room.roomId, checkIn, checkOut); });
    const item  = document.createElement('div');
    item.className = 'room-item' + (free ? '' : ' occupied');
    item.innerHTML = `
      <div class="room-info">
        <div class="room-type">${type}</div>
        <div class="room-capacity">Kapacita: ${first.capacity} os.</div>
      </div>
      <div class="room-actions">
        <span class="badge ${free ? 'badge-available' : 'badge-occupied'}">${free ? 'Volny' : 'Obsazeny'}</span>
        <div class="price">${first.pricePerNight} EUR<span class="price-night"> / noc</span></div>
        ${free ? '<button class="btn btn-primary btn-sm">Rezervovat</button>' : ''}
      </div>`;
    if (free) {
      item.querySelector('button').addEventListener('click', function() { openModal(free); });
    }
    document.getElementById('rooms-list').appendChild(item);
  });
}

function openModal(room) {
  selectedRoom = room;
  const checkIn  = document.getElementById('room-checkin').value;
  const checkOut = document.getElementById('room-checkout').value;
  const count    = nights(checkIn, checkOut);
  document.getElementById('modal-room-type').textContent   = room.type;
  document.getElementById('modal-room-number').textContent = 'Pokoj ' + room.roomNumber;
  document.getElementById('modal-checkin').textContent     = czDate(checkIn);
  document.getElementById('modal-checkout').textContent    = czDate(checkOut);
  document.getElementById('modal-nights').textContent      = count + ' ' + pluralNights(count);
  document.getElementById('modal-price').textContent       = room.pricePerNight * count + ' EUR';
  document.getElementById('modal-guest-name').value        = localStorage.getItem('hotelbook_last_guest') || '';
  document.getElementById('modal-error').classList.remove('visible');
  document.getElementById('modal-overlay').classList.add('open');
  document.getElementById('modal-guest-name').focus();
}

function closeModal() {
  selectedRoom = null;
  document.getElementById('modal-overlay').classList.remove('open');
}

function bookRoom(event, placeId) {
  event.preventDefault();
  const guestName = document.getElementById('modal-guest-name').value.trim();
  const checkIn   = document.getElementById('room-checkin').value;
  const checkOut  = document.getElementById('room-checkout').value;
  if (!guestName) return showModalError('Zadejte prosim sve jmeno.');
  if (!selectedRoom || !isRoomFree(selectedRoom.roomId, checkIn, checkOut)) return showModalError('Tento pokoj uz je obsazeny.');
  const reservation = saveReservation({
    guestName:     guestName,
    hotelPlaceId:  placeId,
    hotelName:     currentHotel.name,
    roomId:        selectedRoom.roomId,
    roomNumber:    selectedRoom.roomNumber,
    roomType:      selectedRoom.type,
    checkInDate:   checkIn,
    checkOutDate:  checkOut,
    pricePerNight: selectedRoom.pricePerNight,
  });
  if (!reservation) return showModalError('Zkontrolujte prosim data pobytu.');
  localStorage.setItem('hotelbook_last_guest', guestName);
  closeModal();
  renderRooms(placeId);
  document.getElementById('success-banner').innerHTML =
    'Rezervace potvrzena pro <strong>' + escapeHtml(reservation.guestName) + '</strong>. ' +
    'Pokoj <strong>' + escapeHtml(reservation.roomNumber) + '</strong>, ' +
    czDate(reservation.checkInDate) + ' - ' + czDate(reservation.checkOutDate) + ', ' +
    'cena <strong>' + reservation.totalPrice + ' EUR</strong>.' +
    '<br><a href="reservations.html">Zobrazit moje rezervace</a>';
  document.getElementById('success-banner').classList.add('visible');
}

function showModalError(message) {
  document.getElementById('modal-error').textContent = message;
  document.getElementById('modal-error').classList.add('visible');
}

// --- stranka rezervaci ---

function initReservationsPage() {
  document.getElementById('name-search-form').addEventListener('submit', function(event) {
    event.preventDefault();
    const name = document.getElementById('guest-name-input').value.trim();
    if (name) renderReservations(name);
  });
  const name = new URLSearchParams(location.search).get('name');
  if (name) document.getElementById('guest-name-input').value = name;
}

function renderReservations(name) {
  history.replaceState({}, '', '?name=' + encodeURIComponent(name));
  // presna shoda jmena, aby uzivatel nevidel cizi rezervace
  const reservations = read(KEYS.RES, []).filter(function(item) {
    return item.guestName.trim().toLowerCase() === name.trim().toLowerCase();
  });
  document.getElementById('reservations-list').innerHTML = '';
  if (!reservations.length) {
    document.getElementById('reservations-count').textContent = '';
    document.getElementById('reservations-list').innerHTML =
      '<div class="empty-state"><h3>Zadne rezervace nenalezeny</h3>' +
      '<p>Pro jmeno "' + escapeHtml(name) + '" nebyly nalezeny zadne rezervace.</p>' +
      '<a href="index.html" class="btn btn-outline" style="display:inline-flex;margin-top:12px">Hledat hotely</a></div>';
    return;
  }
  const activni = reservations.filter(function(item) { return item.status === 'confirmed'; }).length;
  document.getElementById('reservations-count').textContent = 'Nalezeno ' + reservations.length + ' rezervaci (' + activni + ' aktivnich)';
  reservations.sort(function(a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  reservations.forEach(function(reservation) {
    const cancelled = reservation.status === 'cancelled';
    const card = document.createElement('div');
    card.className = 'reservation-card' + (cancelled ? ' cancelled' : '');
    card.innerHTML = `
      <div>
        <div class="reservation-hotel-name"><a href="hotel.html?place_id=${encodeURIComponent(reservation.hotelPlaceId)}&name=${encodeURIComponent(reservation.hotelName)}">${escapeHtml(reservation.hotelName)}</a></div>
        <div class="reservation-details">
          <span>${reservation.roomType} - pokoj ${reservation.roomNumber}</span>
          <span>${czDate(reservation.checkInDate)} - ${czDate(reservation.checkOutDate)} (${reservation.nights} ${pluralNights(reservation.nights)})</span>
          <span>Celkem: <strong>${reservation.totalPrice} EUR</strong></span>
          <span>Rezervovano: ${new Date(reservation.createdAt).toLocaleString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>
      <div class="reservation-actions">
        <span class="badge ${cancelled ? 'badge-cancelled' : 'badge-confirmed'}">${cancelled ? 'Zruseno' : 'Potvrzeno'}</span>
        ${cancelled ? '' : '<button class="btn btn-danger btn-sm">Zrusit</button>'}
      </div>`;
    const button = card.querySelector('.btn-danger');
    if (button) {
      button.addEventListener('click', function() {
        if (confirm('Opravdu chcete zrusit rezervaci?')) {
          cancelReservation(reservation.id);
          renderReservations(name);
        }
      });
    }
    document.getElementById('reservations-list').appendChild(card);
  });
}

// --- service worker ---

// registrace service workeru -> PWA a offline rezim
if ('serviceWorker' in navigator) {
  addEventListener('load', function() {
    navigator.serviceWorker.register('service-worker.js').catch(function() {});
  });
}

addEventListener('offline', function() {
  var banner = document.getElementById('offline-banner');
  if (banner) banner.classList.add('visible');
});
addEventListener('online', function() {
  var banner = document.getElementById('offline-banner');
  if (banner) banner.classList.remove('visible');
});
if (!navigator.onLine) {
  document.addEventListener('DOMContentLoaded', function() {
    var banner = document.getElementById('offline-banner');
    if (banner) banner.classList.add('visible');
  });
}
