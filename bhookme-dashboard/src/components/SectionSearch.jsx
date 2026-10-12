import React, { useEffect, useRef, useState } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const DEBOUNCE_MS = 300;

// Ideas shown under the box before the guest types anything.
const HINTS = {
  homes: ['1 bedroom', '2br under 150', 'sleeps 4', 'pool', 'studio'],
  cars: ['SUV', 'Toyota', '2020', 'under 60'],
};

// ============================================================
// SECTION SEARCH
// ------------------------------------------------------------
// Header for one home-page section ("Stay in Houston, TX",
// "Cars for your trip") with its own 🔍 button. The search only
// looks inside that section: homes in that city, or cars.
//
// It uses the smart search (/api/properties/search/smart), which
// understands "1bedroom", "2 br", "under 100", "sleeps 4", "pool",
// "toyota 2020" and small typos.
//
// onResults(ids) gets the matching listing ids (best first) while a
// search is active, or null when the box is empty/closed - the row
// then shows its normal listings again.
// ============================================================
export default function SectionSearch({
  title,
  titleClassName = '',
  wrapperClassName = '',
  scope = 'homes',
  city,
  state,
  onResults,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [understood, setUnderstood] = useState([]);
  const [count, setCount] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setUnderstood([]);
      setCount(null);
      setError('');
      setLoading(false);
      onResults(null);
      return undefined;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      const params = new URLSearchParams({ q: term, scope });
      if (city) params.set('city', city);
      if (state) params.set('state', state);

      fetch(`${API_BASE_URL}/properties/search/smart?${params.toString()}`)
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error((data && data.message) || 'Search failed. Please try again.');
          return data || {};
        })
        .then((data) => {
          if (cancelled) return;
          const ids = ((scope === 'cars' ? data.carIds : data.homeIds) || []).map(String);
          setUnderstood(Array.isArray(data.understood) ? data.understood : []);
          setCount(ids.length);
          onResults(ids);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || 'Search failed.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // onResults is a state setter from the parent row (stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, scope, city, state]);

  const close = () => {
    setQuery('');
    setOpen(false);
  };

  const placeLabel = scope === 'cars' ? 'cars' : [city, state].filter(Boolean).join(', ') || 'this section';

  return (
    <div className={wrapperClassName}>
      <div className="flex items-center gap-2">
        <h2 className={titleClassName} style={{ marginBottom: 0 }}>
          {title}
        </h2>
        <button
          type="button"
          onClick={() => (open ? close() : setOpen(true))}
          aria-label={open ? `Close search in ${placeLabel}` : `Search in ${placeLabel}`}
          aria-expanded={open}
          title={open ? 'Close search' : `Search in ${placeLabel}`}
          className={`w-8 h-8 shrink-0 rounded-full border flex items-center justify-center transition ${
            open ? 'bg-rose-500 border-rose-500 text-white' : 'border-gray-300 text-gray-600 hover:border-gray-900 hover:text-gray-900'
          }`}
        >
          {open ? (
            <span className="text-lg leading-none" aria-hidden="true">×</span>
          ) : (
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          )}
        </button>
      </div>

      {open && (
        <div className="mt-3">
          <div className="flex items-center gap-2 border border-gray-300 rounded-full px-4 py-2 bg-white focus-within:ring-2 focus-within:ring-rose-500">
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && close()}
              placeholder={scope === 'cars' ? 'Search cars: SUV, Toyota 2020, under 60...' : `Search ${placeLabel}: 1 bedroom, under 150, pool...`}
              aria-label={`Search in ${placeLabel}`}
              className="flex-1 min-w-0 text-sm outline-none bg-transparent"
            />
            {query && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label="Clear search"
                className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 leading-none shrink-0"
              >
                ×
              </button>
            )}
          </div>

          {!query.trim() && (
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs text-gray-500">Try:</span>
              {(HINTS[scope] || HINTS.homes).map((hint) => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => setQuery(hint)}
                  className="text-xs px-3 py-1 rounded-full border border-gray-300 text-gray-700 hover:border-gray-900"
                >
                  {hint}
                </button>
              ))}
            </div>
          )}

          {query.trim() && (
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs">
              {understood.map((u) => (
                <span key={u} className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                  {u}
                </span>
              ))}
              <span className="text-gray-500">
                {loading
                  ? 'Searching...'
                  : error
                    ? ''
                    : count !== null
                      ? `${count} ${count === 1 ? 'match' : 'matches'} in ${placeLabel}`
                      : ''}
              </span>
              {error && <span className="text-red-500">{error}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
