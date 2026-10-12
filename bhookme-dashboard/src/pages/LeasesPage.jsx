import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LeaseCard } from '../components/LeaseRow';

// ============================================================
// LeasesPage - "Monthly leases" (/leases)
// ------------------------------------------------------------
// Every monthly lease listing on one page, opened from the
// "Lease" button in the bottom nav. Uses the same square cards as
// the home page's "Monthly stays & leases" row. The search box
// understands a city, "2br", "studio", "under 1500", "furnished"
// and "pets".
// ============================================================

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

function matches(lease, query) {
  let q = query.toLowerCase().trim();
  if (!q) return true;

  const under = q.match(/(?:under|below|max|less than|<)\s*\$?\s*(\d[\d,]*)/);
  if (under) {
    if (Number(lease.monthlyRent) > Number(under[1].replace(/,/g, ''))) return false;
    q = q.replace(under[0], ' ');
  }
  const beds = q.match(/(\d+)\s*(?:br|bd|bed|beds|bedroom|bedrooms)\b/);
  if (beds) {
    if (Number(lease.bedrooms) !== Number(beds[1])) return false;
    q = q.replace(beds[0], ' ');
  }
  if (/\bstudio\b/.test(q)) {
    if (!(Number(lease.bedrooms) === 0 || lease.propertyType === 'STUDIO')) return false;
    q = q.replace(/\bstudio\b/, ' ');
  }
  if (/\bfurnished\b/.test(q)) {
    if (!lease.furnished) return false;
    q = q.replace(/\bfurnished\b/, ' ');
  }
  if (/\bpets?\b|\bdog\b|\bcat\b/.test(q)) {
    if (!lease.petsAllowed) return false;
    q = q.replace(/\bpets?\b|\bdog\b|\bcat\b/g, ' ');
  }

  const haystack = [lease.title, lease.city, lease.state, lease.propertyType, lease.description]
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

export default function LeasesPage() {
  const [leases, setLeases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/leases`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => setLeases(Array.isArray(data) ? data : []))
      .catch(() => setError('Could not load leases. Please try again.'))
      .finally(() => setLoading(false));
  }, []);

  const shown = useMemo(() => leases.filter((l) => matches(l, query)), [leases, query]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-24 lg:pb-10">
      <h1 className="text-2xl font-bold">Monthly leases</h1>
      <p className="text-gray-500 text-sm mt-1">Homes you can rent by the month.</p>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder='Try "2br under 1500", "studio", "furnished Houston"'
        className="mt-4 w-full px-4 py-2.5 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
      />

      {loading && <p className="mt-6 text-gray-500">Loading leases...</p>}
      {!loading && error && <p className="mt-6 text-red-500">{error}</p>}

      {!loading && !error && (
        <>
          <p className="mt-4 text-sm text-gray-500">
            {shown.length} {shown.length === 1 ? 'lease' : 'leases'}
          </p>
          {shown.length === 0 ? (
            <div className="mt-3 border border-dashed border-gray-300 rounded-xl px-4 py-10 text-center text-sm text-gray-500">
              {leases.length === 0
                ? 'No monthly leases listed yet.'
                : 'No leases match your search. Try fewer words, like just "2br" or a city.'}
            </div>
          ) : (
            <Lane>
              {shown.map((lease) => (
                <LeaseCard key={lease.id} lease={lease} />
              ))}
            </Lane>
          )}
        </>
      )}
    </div>
  );
}