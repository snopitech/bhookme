import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import MockMap, { pick, priceOf, imageOf } from '../components/MapPanel';
import { withCoords, getVisitorLocation, sortByDistance, distanceLabel } from '../utils/geo';

const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const API_BASE_URL = `${API_ORIGIN}/api`;

const NO_RESULTS = [];

function nightsBetween(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const [y1, m1, d1] = checkIn.split('-').map(Number);
  const [y2, m2, d2] = checkOut.split('-').map(Number);
  const diff = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  return diff > 0 ? diff : 0;
}

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function money(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function ResultCard({ listing, nights, query, showDistance }) {
  const title = pick(listing, ['title', 'name']) || 'Listing';
  const place = [pick(listing, ['city']), pick(listing, ['state', 'country'])].filter(Boolean).join(', ');
  const img = imageOf(listing);
  const price = priceOf(listing);

  return (
    <Link to={`/property/${listing.id}${query ? `?${query}` : ''}`} className="group block">
      <div className="aspect-square rounded-xl overflow-hidden bg-gray-200">
        {img ? (
          <img
            src={img}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl" aria-hidden="true">🏠</div>
        )}
      </div>
      <div className="mt-3">
        <p className="font-semibold truncate">{place || title}</p>
        {place && <p className="text-sm text-gray-500 truncate">{title}</p>}
        {showDistance && distanceLabel(listing.miles) && (
          <p className="text-sm text-gray-500 truncate">📍 {distanceLabel(listing.miles)}</p>
        )}
        {price ? (
          <p className="mt-1 text-sm">
            <span className="font-semibold">{money(price)}</span> night
            {nights > 0 && <span className="text-gray-500"> · {money(price * nights)} total</span>}
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-500">See price</p>
        )}
      </div>
    </Link>
  );
}

export default function SearchResultsPage() {
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const location = params.get('location') || '';
  // Nearby: /search?near=1 - every home, nearest first (no distance limit).
  const nearMode = params.get('near') === '1';
  const checkIn = params.get('checkIn') || '';
  const checkOut = params.get('checkOut') || '';
  const guests = Number(params.get('guests')) || 0;
  const nights = nightsBetween(checkIn, checkOut);

  // Passed on to the property page so it can pre-fill the same dates/guests.
  const carryQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (checkIn && checkOut) {
      p.set('checkIn', checkIn);
      p.set('checkOut', checkOut);
    }
    if (guests) p.set('guests', String(guests));
    return p.toString();
  }, [checkIn, checkOut, guests]);

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Results with a map position filled in (own position, or their city's center).
  const [located, setLocated] = useState(null);
  const [visitor, setVisitor] = useState(null);
  const [nearStatus, setNearStatus] = useState('idle'); // idle | locating | ready | denied | unsupported
  const [nearAttempt, setNearAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    // "near" is for this page only - the server gets the normal search.
    const serverParams = new URLSearchParams(params);
    serverParams.delete('near');
    fetch(`${API_BASE_URL}/properties/search?${serverParams.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || `Search failed (status ${res.status}).`);
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Search failed.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [params]);

  // Fill in map positions so the map gets pins and Nearby can measure distance.
  useEffect(() => {
    let cancelled = false;
    setLocated(null);
    if (loading || results.length === 0) return undefined;
    withCoords(results).then((list) => {
      if (!cancelled) setLocated(list);
    });
    return () => {
      cancelled = true;
    };
  }, [results, loading]);

  // Ask where the visitor is when Nearby is on.
  useEffect(() => {
    if (!nearMode) return undefined;
    let cancelled = false;
    setNearStatus('locating');
    getVisitorLocation()
      .then((pos) => {
        if (cancelled) return;
        setVisitor(pos);
        setNearStatus('ready');
      })
      .catch((err) => {
        if (!cancelled) setNearStatus(err.message === 'unsupported' ? 'unsupported' : 'denied');
      });
    return () => {
      cancelled = true;
    };
  }, [nearMode, nearAttempt]);

  // What the page shows: nearest first in Nearby mode, otherwise as returned.
  const shown = useMemo(() => {
    const base = located || results;
    if (nearMode && visitor) return sortByDistance(base, visitor);
    return base;
  }, [located, results, nearMode, visitor]);

  const summary = [
    nearMode ? 'Nearby' : location || 'Anywhere',
    checkIn && checkOut ? `${shortDate(checkIn)} – ${shortDate(checkOut)}` : null,
    guests ? `${guests} guest${guests === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="max-w-7xl mx-auto px-6 py-6 grid lg:grid-cols-[minmax(0,1fr)_40%] gap-8">
      <div>
        <p className="text-sm text-gray-500 mb-1">{summary}</p>
        <h1 className="text-2xl font-semibold mb-6">
          {loading
            ? 'Searching...'
            : nearMode
              ? `${results.length} ${results.length === 1 ? 'home' : 'homes'} near you`
              : `${results.length} ${results.length === 1 ? 'home' : 'homes'}${location ? ` in ${location}` : ''}`}
        </h1>

        {nearMode && nearStatus === 'locating' && (
          <p className="text-sm text-gray-500 -mt-4 mb-6">Finding your location...</p>
        )}
        {nearMode && nearStatus === 'ready' && results.length > 0 && (
          <p className="text-sm text-gray-500 -mt-4 mb-6">Closest first, based on your location.</p>
        )}
        {nearMode && (nearStatus === 'denied' || nearStatus === 'unsupported') && (
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-4 mb-6 text-sm">
            <p className="font-semibold">We couldn't get your location</p>
            <p className="text-gray-600 mt-1">
              Allow location for bhookme in your browser (the icon left of the web address), then try again. Showing all homes for now.
            </p>
            <button
              type="button"
              onClick={() => setNearAttempt((n) => n + 1)}
              className="mt-3 px-4 py-2 rounded-full bg-rose-500 text-white font-semibold"
            >
              Try again
            </button>
          </div>
        )}

        {error && <p className="text-red-500 mb-4">{error}</p>}

        {!loading && !error && results.length === 0 && (
          <div className="border border-gray-200 rounded-xl p-8 text-center bg-white">
            <p className="font-semibold mb-1">No homes match this search</p>
            <p className="text-gray-500 text-sm mb-4">
              Try other dates, fewer guests, or a nearby city.
            </p>
            <Link to="/" className="inline-block text-sm font-semibold underline">
              Back to all homes
            </Link>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i}>
                <div className="aspect-square rounded-xl bg-gray-200 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded mt-3 w-2/3 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded mt-2 w-1/3 animate-pulse" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {shown.map((l) => (
              <ResultCard
                key={l.id}
                listing={l}
                nights={nights}
                query={carryQuery}
                showDistance={nearMode && !!visitor}
              />
            ))}
          </div>
        )}
      </div>

      <MockMap listings={loading ? NO_RESULTS : located || results} />
    </div>
  );
}