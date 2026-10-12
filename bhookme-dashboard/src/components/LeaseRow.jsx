import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';

// ============================================================
// LeaseRow - "Monthly stays & leases" on the home page.
// ------------------------------------------------------------
// Sits in the left column next to the map, above the house rows.
// Big square photos, 2 across (phones and computers), with a small
// pink "Monthly" label so they stand out from nightly stays.
// Has its own 🔍 that only searches lease listings, and
// understands things like "2br", "studio", "under 1500",
// "furnished", "pets", or a city name.
// ============================================================

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const TYPE_LABELS = {
  APARTMENT: 'Apartment',
  HOUSE: 'House',
  CONDO: 'Condo',
  TOWNHOUSE: 'Townhouse',
  STUDIO: 'Studio',
  ROOM: 'Private room',
};

export function bedsLabel(n) {
  const beds = Number(n) || 0;
  return beds === 0 ? 'Studio' : `${beds} bed${beds === 1 ? '' : 's'}`;
}

export function money(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

// Square card: a big square photo, 2 across. The heart saves it to
// the wishlist, like the house and car cards.
// min-w-0 + truncate keep every photo the same size: long text gets
// "..." instead of stretching its card wider than the others.
export function LeaseCard({ lease }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isLeaseSaved, toggleLease } = useWishlist();
  const saved = isLeaseSaved(lease.id);
  const cover = lease.imageUrls?.[0] || lease.imageUrl;

  const handleHeart = (e) => {
    // The whole card is a link, so stop the click from opening the listing.
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    toggleLease(lease.id);
  };

  return (
    <Link to={`/lease/${lease.id}`} className="cursor-pointer group block min-w-0">
      <div className="aspect-square rounded-xl overflow-hidden bg-gray-200 relative">
        {cover ? (
          <img
            src={cover}
            alt={lease.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl" aria-hidden="true">🏠</div>
        )}
        <span className="absolute top-3 left-3 max-w-[70%] truncate bg-white/95 text-rose-600 text-[11px] font-semibold px-2 py-0.5 rounded-full shadow-sm">
          {lease.minMonths > 1 ? `${lease.minMonths}+ months` : 'Monthly'}
        </span>
        <button
          type="button"
          onClick={handleHeart}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          className={`absolute top-3 right-3 text-2xl leading-none ${saved ? 'text-rose-500' : 'text-white'}`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
        >
          {saved ? '♥' : '♡'}
        </button>
      </div>
      <div className="mt-2">
        <p className="font-medium text-gray-900 truncate">
          {lease.city}, {lease.state}
        </p>
        <p className="text-gray-500 text-sm truncate">
          {TYPE_LABELS[lease.propertyType] || 'Home'} · {bedsLabel(lease.bedrooms)} · {Number(lease.bathrooms)} bath
          {lease.furnished ? ' · Furnished' : ''}
        </p>
        <p className="mt-1">
          <span className="font-semibold">{money(lease.monthlyRent)}</span>
          <span className="text-gray-500"> month</span>
        </p>
      </div>
    </Link>
  );
}

// ---------- Search (this section only) ----------

function matchesQuery(lease, query) {
  let q = query.toLowerCase().trim();
  if (!q) return true;

  // "under 1500", "below $2000", "max 1200", "< 1000"
  const under = q.match(/(?:under|below|max|less than|<)\s*\$?\s*(\d[\d,]*)/);
  if (under) {
    if (Number(lease.monthlyRent) > Number(under[1].replace(/,/g, ''))) return false;
    q = q.replace(under[0], ' ');
  }
  // "2br", "2 bed", "2 bedroom(s)", "2bd"
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
  if (/\butilities\b/.test(q)) {
    if (!lease.utilitiesIncluded) return false;
    q = q.replace(/\butilities\b/, ' ');
  }

  const haystack = [
    lease.title,
    lease.city,
    lease.state,
    TYPE_LABELS[lease.propertyType],
    lease.propertyType,
    lease.description,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const words = q.split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !['in', 'for', 'the', 'and', 'a', 'near'].includes(w));
  return words.every((w) => haystack.includes(w));
}

export default function LeaseRow() {
  const [leases, setLeases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/leases`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLeases(Array.isArray(data) ? data : []))
      .catch(() => setLeases([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (searchOpen && inputRef.current) inputRef.current.focus();
  }, [searchOpen]);

  const shown = useMemo(() => leases.filter((l) => matchesQuery(l, query)), [leases, query]);

  const scroll = (direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = el.firstChild?.offsetWidth || 220;
    el.scrollBy({ left: direction * (cardWidth + 24) * 2, behavior: 'smooth' });
  };

  // Stays invisible until there is at least one lease listing.
  if (loading || leases.length === 0) return null;

  return (
    <div className="mb-10">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-xl font-semibold">Monthly stays &amp; leases</h2>
        <button
          type="button"
          onClick={() => {
            setSearchOpen((o) => !o);
            if (searchOpen) setQuery('');
          }}
          aria-label={searchOpen ? 'Close search' : 'Search monthly stays'}
          className="w-9 h-9 rounded-full border border-gray-200 hover:bg-gray-50 flex items-center justify-center shrink-0"
        >
          {searchOpen ? '✕' : '🔍'}
        </button>
      </div>

      {searchOpen && (
        <div className="mb-3">
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Try "2br under 1500", "studio", "furnished Houston"'
            className="w-full px-4 py-2 border border-gray-300 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
      )}

      {shown.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl px-4 py-6 text-center text-sm text-gray-500">
          No monthly stays match your search. Try fewer words, like just "2br" or a city.
        </div>
      ) : (
        <div className="relative">
          <button
            type="button"
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
            className="absolute top-[40%] -translate-y-1/2 -left-4 z-10 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-xl hover:scale-105 transition"
          >
            ‹
          </button>

          <div
            ref={scrollRef}
            className="flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {shown.map((lease) => (
              <div
                key={lease.id}
                className="snap-start shrink-0 min-w-0 basis-[calc((100%-1.5rem)/2)]"
              >
                <LeaseCard lease={lease} />
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => scroll(1)}
            aria-label="Scroll right"
            className="absolute top-[40%] -translate-y-1/2 -right-4 z-10 w-8 h-8 rounded-full bg-white border border-gray-200 shadow-md flex items-center justify-center text-xl hover:scale-105 transition"
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}