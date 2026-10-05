import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import MockMap, { pick, priceOf, imageOf } from '../components/MockMap';

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

function ResultCard({ listing, nights, query }) {
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`${API_BASE_URL}/properties/search?${params.toString()}`)
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

  const summary = [
    location || 'Anywhere',
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
            : `${results.length} ${results.length === 1 ? 'home' : 'homes'}${location ? ` in ${location}` : ''}`}
        </h1>

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
            {results.map((l) => (
              <ResultCard key={l.id} listing={l} nights={nights} query={carryQuery} />
            ))}
          </div>
        )}
      </div>

      <MockMap listings={loading ? NO_RESULTS : results} />
    </div>
  );
}