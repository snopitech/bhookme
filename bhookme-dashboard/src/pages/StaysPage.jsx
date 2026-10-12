import React, { useEffect, useMemo, useRef, useState } from 'react';
import PropertyCard from '../components/PropertyCard';

// ============================================================
// StaysPage - "Short stays" (/stays)
// ------------------------------------------------------------
// Every nightly house listing on one page, opened from the
// "Short Stay" button in the bottom nav. City chips at the top
// narrow it to one city; the search box understands a city or
// title word and "under 150" for a max nightly price.
// ============================================================

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

function matches(property, query) {
  let q = query.toLowerCase().trim();
  if (!q) return true;

  // "under 150", "below $200", "max 120", "< 100"
  const under = q.match(/(?:under|below|max|less than|<)\s*\$?\s*(\d[\d,]*)/);
  if (under) {
    if (Number(property.basePricePerNight) > Number(under[1].replace(/,/g, ''))) return false;
    q = q.replace(under[0], ' ');
  }

  const haystack = [property.title, property.city, property.state, property.description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !['in', 'for', 'the', 'and', 'near'].includes(w));
  return words.every((w) => haystack.includes(w));
}

// One horizontal lane: swipe it, or tap the ‹ › arrows (shown on
// phones and computers).
// 2 cards show on phones, 3 on tablets, 4 on computers.
function Lane({ children }) {
  const ref = useRef(null);
  const scroll = (dir) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };
  return (
    <div className="relative mt-3">
      <button
        type="button"
        onClick={() => scroll(-1)}
        aria-label="Scroll left"
        className="flex absolute top-[40%] -translate-y-1/2 left-1 sm:-left-4 z-10 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-md items-center justify-center text-xl hover:scale-105 transition"
      >
        ‹
      </button>
      <div
        ref={ref}
        className="flex gap-4 sm:gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {React.Children.map(children, (child) => (
          <div className="snap-start shrink-0 min-w-0 basis-[calc((100%-1rem)/2)] sm:basis-[calc((100%-3rem)/3)] lg:basis-[calc((100%-4.5rem)/4)]">
            {child}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => scroll(1)}
        aria-label="Scroll right"
        className="flex absolute top-[40%] -translate-y-1/2 right-1 sm:-right-4 z-10 w-9 h-9 rounded-full bg-white border border-gray-200 shadow-md items-center justify-center text-xl hover:scale-105 transition"
      >
        ›
      </button>
    </div>
  );
}

export default function StaysPage() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('ALL');

  useEffect(() => {
    fetch(`${API_BASE_URL}/properties`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setProperties(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not load stays. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const cities = useMemo(() => {
    const seen = new Map();
    properties.forEach((p) => {
      const label = `${p.city}, ${p.state}`;
      seen.set(label, (seen.get(label) || 0) + 1);
    });
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([label]) => label);
  }, [properties]);

  const shown = useMemo(
    () =>
      properties.filter(
        (p) => (city === 'ALL' || `${p.city}, ${p.state}` === city) && matches(p, query)
      ),
    [properties, city, query]
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-10">
      <h1 className="text-2xl font-bold">Short stays</h1>
      <p className="text-gray-500 text-sm mt-1">Homes you can book by the night.</p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Search a city or try "under 150"'
        className="mt-4 w-full px-4 py-2.5 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
      />

      {cities.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {['ALL', ...cities].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCity(c)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-sm border transition ${
                city === c
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-700 border-gray-300 hover:border-gray-500'
              }`}
            >
              {c === 'ALL' ? 'All cities' : c}
            </button>
          ))}
        </div>
      )}

      {loading && <p className="mt-6 text-gray-500">Loading stays...</p>}
      {!loading && error && <p className="mt-6 text-red-500">{error}</p>}

      {!loading && !error && (
        <>
          <p className="mt-4 text-sm text-gray-500">
            {shown.length} {shown.length === 1 ? 'stay' : 'stays'}
          </p>
          {shown.length === 0 ? (
            <div className="mt-3 border border-dashed border-gray-300 rounded-xl px-4 py-10 text-center text-sm text-gray-500">
              {properties.length === 0
                ? 'No short stays listed yet.'
                : 'No stays match your search. Try fewer words or another city.'}
            </div>
          ) : (
            <Lane>
              {shown.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </Lane>
          )}
        </>
      )}
    </div>
  );
}