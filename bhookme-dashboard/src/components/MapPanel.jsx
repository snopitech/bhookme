import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// ============================================================
// MAP PANEL
// ------------------------------------------------------------
// Renders the listings map. Two placements:
//
//  - mobileOnly   → inline panel, small (h-56), shown only on
//                   screens < 1024px. Renders nothing on desktop
//                   and doesn't fetch, listen, or mount.
//  - desktopOnly  → sticky sidebar (unchanged from before), shown
//                   only on screens >= 1024px. Renders nothing on
//                   mobile and doesn't fetch, listen, or mount.
//
// HomePage mounts BOTH. Only one is ever live at a time based on
// the current viewport width, so there's no double-fetch, no
// double-listener, and no confusion about which instance owns
// window.__bhookmeMapMounted.
//
// Default (no prop): the old behavior - desktop sidebar + mobile
// popup - kept so other pages (e.g. SearchResultsPage) can still
// use it if they want.
// ============================================================

const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const API_BASE_URL = `${API_ORIGIN}/api`;

const listingPath = (id) => `/property/${id}`;
const US_CENTER = [39.8, -98.6];

export function pick(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function positiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

const EXCLUDED_PRICE_WORDS = /fee|deposit|clean|tax|week|month|discount|service/i;

export function priceOf(row) {
  const known = positiveNumber(
    pick(row, ['price_per_night', 'nightly_price', 'nightly_rate', 'base_price', 'price'])
  );
  if (known) return known;
  const keys = Object.keys(row || {}).filter((k) => !EXCLUDED_PRICE_WORDS.test(k));
  for (const pattern of [/night/i, /price/i, /rate/i]) {
    for (const key of keys) {
      if (pattern.test(key)) {
        const num = positiveNumber(row[key]);
        if (num) return num;
      }
    }
  }
  return null;
}

export function imageOf(row) {
  const url = pick(row?.image, ['image_url', 'url', 'file_url', 'path']);
  if (!url) return null;
  return url.startsWith('/') ? `${API_ORIGIN}${url}` : url;
}

function pinIcon(label, selected) {
  return L.divIcon({
    className: '',
    iconSize: [0, 0],
    html: `<div class="bh-pin${selected ? ' bh-pin--selected' : ''}">${label}</div>`,
  });
}

function FitToListings({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 12);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
    }
  }, [map, points]);
  return null;
}

const MAP_STYLES = `
  .bh-pin {
    position: absolute;
    transform: translate(-50%, -50%);
    white-space: nowrap;
    background: #fff;
    color: #222;
    font: 600 13px/1 system-ui, -apple-system, sans-serif;
    padding: 7px 10px;
    border-radius: 9999px;
    box-shadow: 0 1px 4px rgba(0,0,0,.28);
    transition: transform .12s ease, background .12s ease, color .12s ease;
    cursor: pointer;
  }
  .bh-pin:hover { transform: translate(-50%, -50%) scale(1.08); }
  .bh-pin--selected { background: #222; color: #fff; transform: translate(-50%, -50%) scale(1.08); }
  .leaflet-popup-content-wrapper { padding: 0; border-radius: 12px; overflow: hidden; }
  .leaflet-popup-content { margin: 0; width: 240px !important; }
  .leaflet-popup-content a, .leaflet-popup-content a:hover { color: inherit; text-decoration: none; }
  .leaflet-popup-content p { margin: 0; }
  @media (prefers-reduced-motion: reduce) { .bh-pin { transition: none; } }
`;

function useIsDesktop() {
  const query = '(min-width: 1024px)';
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

const OPEN_EVENT = 'bhookme:open-map';
const CLOSE_EVENT = 'bhookme:close-map';
const AVAILABLE_EVENT = 'bhookme:map-available';

export function MapButton({ className = '' }) {
  const [available, setAvailable] = useState(
    () => typeof window !== 'undefined' && !!window.__bhookmeMapMounted
  );

  useEffect(() => {
    const onAvailable = (e) => setAvailable(!!e.detail);
    window.addEventListener(AVAILABLE_EVENT, onAvailable);
    setAvailable(!!window.__bhookmeMapMounted);
    return () => window.removeEventListener(AVAILABLE_EVENT, onAvailable);
  }, []);

  if (!available) return null;

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className={`lg:hidden inline-flex items-center gap-1.5 border border-gray-300 rounded-full px-3 py-1.5 text-sm font-semibold text-gray-900 bg-white hover:shadow-md active:scale-95 transition ${className}`}
    >
      <span aria-hidden="true">🗺️</span>
      Map
    </button>
  );
}

function MapView({ mapped, points, loading, error }) {
  const [selectedId, setSelectedId] = useState(null);

  return (
    <div className="relative w-full h-full">
      <MapContainer center={US_CENTER} zoom={4} scrollWheelZoom className="w-full h-full z-0">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToListings points={points} />

        {mapped.map((l) => {
          const price = priceOf(l);
          const title = pick(l, ['title', 'name']) || 'Listing';
          const place = [pick(l, ['city']), pick(l, ['state', 'country'])].filter(Boolean).join(', ');
          const img = imageOf(l);
          return (
            <Marker
              key={l.id}
              position={[l.lat, l.lng]}
              icon={pinIcon(price ? `$${Math.round(price).toLocaleString()}` : 'View', selectedId === l.id)}
              zIndexOffset={selectedId === l.id ? 1000 : 0}
              eventHandlers={{
                click: () => setSelectedId(l.id),
                popupclose: () => setSelectedId((cur) => (cur === l.id ? null : cur)),
              }}
            >
              <Popup closeButton offset={[0, -12]}>
                <Link to={listingPath(l.id)} className="block text-gray-900 no-underline">
                  {img ? (
                    <img src={img} alt={title} className="w-full h-36 object-cover" />
                  ) : (
                    <div className="w-full h-36 bg-gray-200 flex items-center justify-center text-3xl">🏠</div>
                  )}
                  <div className="p-3">
                    <p className="font-semibold text-sm truncate">{title}</p>
                    {place && <p className="text-xs text-gray-500 truncate">{place}</p>}
                    <p className="text-sm mt-1">
                      {price ? (
                        <>
                          <span className="font-semibold">${Math.round(price).toLocaleString()}</span> night
                        </>
                      ) : (
                        <span className="text-gray-500">See price</span>
                      )}
                    </p>
                  </div>
                </Link>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {(loading || error || mapped.length === 0) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-full shadow px-4 py-2 text-sm whitespace-nowrap">
          {loading && <span className="text-gray-600">Loading listings...</span>}
          {!loading && error && <span className="text-red-600">{error}</span>}
          {!loading && !error && mapped.length === 0 && (
            <span className="text-gray-600">No listings with a map location yet</span>
          )}
        </div>
      )}
    </div>
  );
}

export default function MapPanel({
  listings: providedListings,
  mobileOnly = false,
  desktopOnly = false,
}) {
  const isDesktop = useIsDesktop();
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);

  // Gate: if this instance is for one breakpoint only, skip the
  // other breakpoint entirely - no fetch, no listeners, no mount flag.
  const active = mobileOnly ? !isDesktop : desktopOnly ? isDesktop : true;

  useEffect(() => {
    if (!active) return undefined;
    if (providedListings) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    fetch(`${API_BASE_URL}/properties/map`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || `Could not load the map (status ${res.status}).`);
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setListings(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load the map.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [providedListings, active]);

  useEffect(() => {
    if (!active) return undefined;
    window.__bhookmeMapMounted = true;
    window.dispatchEvent(new CustomEvent(AVAILABLE_EVENT, { detail: true }));
    const onOpen = () => setMobileOpen((v) => !v);
    const onClose = () => setMobileOpen(false);
    window.addEventListener(OPEN_EVENT, onOpen);
    window.addEventListener(CLOSE_EVENT, onClose);
    return () => {
      window.__bhookmeMapMounted = false;
      window.dispatchEvent(new CustomEvent(AVAILABLE_EVENT, { detail: false }));
      window.removeEventListener(OPEN_EVENT, onOpen);
      window.removeEventListener(CLOSE_EVENT, onClose);
    };
  }, [active]);

  useEffect(() => {
    if (isDesktop) setMobileOpen(false);
  }, [isDesktop]);

  const mapped = useMemo(
    () =>
      (providedListings || listings)
        .map((l) => ({ ...l, lat: Number(l.latitude), lng: Number(l.longitude) }))
        .filter((l) => l.latitude != null && l.longitude != null && Number.isFinite(l.lat) && Number.isFinite(l.lng)),
    [providedListings, listings]
  );

  const points = useMemo(() => mapped.map((l) => [l.lat, l.lng]), [mapped]);
  const mapProps = { mapped, points, loading, error };

  // This instance doesn't apply to the current breakpoint - render nothing.
  if (!active) return null;

  // Desktop-only (or default) instance
  if (isDesktop) {
    return (
      <div className="sticky top-24 h-[calc(100vh-7rem)] w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
        <style>{MAP_STYLES}</style>
        <MapView {...mapProps} />
      </div>
    );
  }

  // Mobile-only (or default) instance, closed → nothing.
  if (!mobileOpen) return null;

  // Mobile-only (or default) instance, open → inline panel.
  return (
    <div className="relative h-56 w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
      <style>{MAP_STYLES}</style>
      <MapView {...mapProps} />
      <button
        type="button"
        onClick={() => setMobileOpen(false)}
        className="absolute top-3 right-3 z-[1000] w-9 h-9 rounded-full bg-white shadow-md border border-gray-200 flex items-center justify-center text-lg font-semibold"
        aria-label="Close map"
      >
        ×
      </button>
    </div>
  );
}