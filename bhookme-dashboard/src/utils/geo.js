// ============================================================
// geo.js - "Nearby" helpers
// ------------------------------------------------------------
// - getVisitorLocation(): asks the browser where the visitor is.
// - withCoords(list): makes sure every listing has a map position.
//   Listings that already have latitude/longitude keep them. Ones
//   that don't get the center of their city, looked up once from
//   OpenStreetMap's free place search and remembered in the browser
//   so the lookup never repeats.
// - milesBetween(a, b) / distanceLabel(miles)
// ============================================================

const CACHE_KEY = 'bhookme_city_coords_v1';
const LOOKUP_GAP_MS = 1100; // OpenStreetMap asks for at most 1 lookup per second

function readCache() {
  try {
    const data = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // storage blocked or full - lookups just won't be remembered
  }
}

const memoryCache = readCache();
const pending = new Map();
let lastLookupAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function coordsOf(item) {
  const lat = Number(item?.latitude ?? item?.lat);
  const lng = Number(item?.longitude ?? item?.lng);
  if (item?.latitude == null && item?.lat == null) return null;
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
}

export function milesBetween(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export function distanceLabel(miles) {
  if (!Number.isFinite(miles)) return null;
  if (miles < 1) return 'Less than 1 mi away';
  return `${Math.round(miles).toLocaleString()} mi away`;
}

function cityKeyOf(item) {
  const city = String(item?.city || '').trim();
  const state = String(item?.state || '').trim();
  const country = String(item?.country || '').trim();
  if (!city) return null;
  return [city, state, country].filter(Boolean).join(', ');
}

// Center of a city, e.g. "Houston, TX" -> { lat, lng }. null if not found.
export async function geocodeCity(key) {
  if (!key) return null;
  if (key in memoryCache) return memoryCache[key];
  if (pending.has(key)) return pending.get(key);

  const job = (async () => {
    const wait = lastLookupAt + LOOKUP_GAP_MS - Date.now();
    lastLookupAt = Date.now() + Math.max(0, wait);
    if (wait > 0) await sleep(wait);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(key)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = res.ok ? await res.json() : [];
      const hit = Array.isArray(data) && data[0] ? { lat: Number(data[0].lat), lng: Number(data[0].lon) } : null;
      memoryCache[key] = hit && Number.isFinite(hit.lat) && Number.isFinite(hit.lng) ? hit : null;
      writeCache(memoryCache);
    } catch {
      // network problem - don't remember, try again next time
      pending.delete(key);
      return null;
    }
    pending.delete(key);
    return memoryCache[key];
  })();

  pending.set(key, job);
  return job;
}

// Returns a copy of the list where every listing has latitude/longitude
// when it can be found (own position first, else its city's center).
export async function withCoords(list) {
  const items = Array.isArray(list) ? list : [];
  const keys = [...new Set(items.filter((i) => !coordsOf(i)).map(cityKeyOf).filter(Boolean))];
  for (const key of keys) {
    // one at a time, to stay within OpenStreetMap's limit
    // eslint-disable-next-line no-await-in-loop
    await geocodeCity(key);
  }
  return items.map((item) => {
    if (coordsOf(item)) return item;
    const c = memoryCache[cityKeyOf(item)];
    return c ? { ...item, latitude: c.lat, longitude: c.lng, approximateLocation: true } : item;
  });
}

// Promise of { lat, lng }. Rejects with 'denied' or 'unsupported'.
export function getVisitorLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => reject(new Error('denied')),
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 15000 }
    );
  });
}

// Sort listings nearest first and attach `miles` to each.
// Listings with no findable position go last.
export function sortByDistance(list, from) {
  return list
    .map((item) => {
      const c = coordsOf(item);
      return { ...item, miles: c && from ? milesBetween(from, c) : Infinity };
    })
    .sort((a, b) => a.miles - b.miles);
}