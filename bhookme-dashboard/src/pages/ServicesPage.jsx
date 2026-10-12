import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { pick } from '../components/MapPanel';
import { SERVICE_CATEGORIES, findServiceCategory } from '../data/serviceCategories';

const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const API_BASE_URL = `${API_ORIGIN}/api`;

const EXCLUDED_PRICE_WORDS = /fee|deposit|clean|tax|week|month|discount|service|mile|insurance/i;

function positiveNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function carPrice(car) {
  const known = positiveNumber(
    pick(car, ['price_per_day', 'daily_rate', 'daily_price', 'rate_per_day', 'price'])
  );
  if (known) return known;
  const keys = Object.keys(car || {}).filter((k) => !EXCLUDED_PRICE_WORDS.test(k));
  for (const pattern of [/day|daily/i, /price/i, /rate/i]) {
    for (const key of keys) {
      if (pattern.test(key)) {
        const num = positiveNumber(car[key]);
        if (num) return num;
      }
    }
  }
  return null;
}

function absoluteUrl(url) {
  if (!url || typeof url !== 'string') return null;
  return url.startsWith('/') ? `${API_ORIGIN}${url}` : url;
}

function carImage(car) {
  const fromTable = pick(car?.image, ['image_url', 'url', 'file_url', 'photo_url', 'path']);
  if (fromTable) return absoluteUrl(fromTable);
  for (const [key, value] of Object.entries(car || {})) {
    if (/image|photo|picture|thumbnail/i.test(key) && typeof value === 'string' && /^(https?:\/\/|\/)/.test(value)) {
      return absoluteUrl(value);
    }
  }
  return null;
}

function carTitle(car) {
  const title = pick(car, ['title', 'name']);
  if (title) return title;
  const parts = [pick(car, ['year']), pick(car, ['make', 'brand']), pick(car, ['model'])].filter(Boolean);
  return parts.length ? parts.join(' ') : 'Car rental';
}

function money(n) {
  return `$${Math.round(n).toLocaleString()}`;
}

function daysBetween(a, b) {
  if (!a || !b) return 0;
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  const diff = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
  return diff > 0 ? diff : 0;
}

// A sideways-scrolling row with Airbnb-style arrow buttons.
function ScrollRow({ title, subtitle, children }) {
  const ref = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  });

  const scrollBy = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  return (
    <section className="mb-12">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          {title && <h2 className="text-2xl font-semibold">{title}</h2>}
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className="hidden md:flex gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={!canLeft}
            aria-label="Scroll left"
            className="w-8 h-8 rounded-full border border-gray-300 bg-white flex items-center justify-center hover:shadow disabled:opacity-30 disabled:hover:shadow-none"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={!canRight}
            aria-label="Scroll right"
            className="w-8 h-8 rounded-full border border-gray-300 bg-white flex items-center justify-center hover:shadow disabled:opacity-30 disabled:hover:shadow-none"
          >
            ›
          </button>
        </div>
      </div>
      <div
        ref={ref}
        className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
    </section>
  );
}

function CategoryTile({ category, onComingSoon, onLive }) {
  const inner = (
    <>
      <div className="aspect-square rounded-2xl bg-gray-100 flex items-center justify-center transition group-hover:bg-gray-200">
        <span className="text-5xl group-hover:scale-110 transition duration-200" aria-hidden="true">
          {category.icon}
        </span>
      </div>
      <p className="mt-2 text-sm">
        {category.label}
        {category.external && <span className="text-gray-400"> ↗</span>}
      </p>
    </>
  );
  const className =
    'group block shrink-0 snap-start w-28 sm:w-32 lg:w-36 text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900';

  if (category.external) {
    return (
      <a href={category.external} target="_blank" rel="noopener noreferrer" className={className}>
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={() => (category.live ? onLive(category) : onComingSoon(category))}
      className={className}
    >
      {inner}
    </button>
  );
}

function ComingSoonDialog({ category, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${category.label} coming soon`}>
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 w-8 h-8 rounded-full hover:bg-gray-100 text-xl leading-none"
        >
          ×
        </button>
        <p className="text-5xl mb-3" aria-hidden="true">{category.icon}</p>
        <h2 className="text-xl font-semibold">{category.label} is coming soon</h2>
        <p className="text-gray-500 mt-2">{category.blurb}. We're bringing this to bhookme soon.</p>
        <div className="mt-6 flex flex-col gap-2">
          <Link
            to="/become-host"
            className="bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-xl transition"
          >
            Offer this service
          </Link>
          <button type="button" onClick={onClose} className="py-2 text-sm font-semibold underline">
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}

function CarCard({ car, days, query }) {
  const title = carTitle(car);
  const place = [pick(car, ['city']), pick(car, ['state', 'country'])].filter(Boolean).join(', ');
  const img = carImage(car);
  const price = carPrice(car);

  return (
    <Link
      to={`/car/${car.id}${query ? `?${query}` : ''}`}
      className="group block shrink-0 snap-start w-[75%] sm:w-[45%] md:w-[30%] lg:w-[23%]"
    >
      <div className="aspect-square rounded-2xl overflow-hidden bg-gray-100">
        {img ? (
          <img
            src={img}
            alt={title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl" aria-hidden="true">🚗</div>
        )}
      </div>
      <p className="mt-3 font-semibold truncate">{title}</p>
      {place && <p className="text-sm text-gray-500 truncate">{place}</p>}
      {price ? (
        <p className="text-sm mt-1">
          <span className="font-semibold">{money(price)}</span> day
          {days > 0 && <span className="text-gray-500"> · {money(price * days)} total</span>}
        </p>
      ) : (
        <p className="text-sm mt-1 text-gray-500">See price</p>
      )}
    </Link>
  );
}

export default function ServicesPage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const location = params.get('location') || '';
  const checkIn = params.get('checkIn') || '';
  const checkOut = params.get('checkOut') || '';
  const type = params.get('type') || '';
  const days = daysBetween(checkIn, checkOut);

  const carsRef = useRef(null);
  const [comingSoon, setComingSoon] = useState(null);
  const [cars, setCars] = useState([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [carsError, setCarsError] = useState('');

  const carryQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (checkIn && checkOut) {
      p.set('checkIn', checkIn);
      p.set('checkOut', checkOut);
    }
    return p.toString();
  }, [checkIn, checkOut]);

  // A service picked in the header search: open its site, show "coming soon", or jump to cars.
  useEffect(() => {
    const category = findServiceCategory(type);
    if (!category) return;
    if (category.external) {
      window.open(category.external, '_blank', 'noopener,noreferrer');
    } else if (!category.live) {
      setComingSoon(category);
    } else {
      carsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    // Remove ?type= so refreshing doesn't repeat this.
    const p = new URLSearchParams(search);
    p.delete('type');
    const qs = p.toString();
    navigate(`/category/services${qs ? `?${qs}` : ''}`, { replace: true });
  }, [type, search, navigate]);

  useEffect(() => {
    let cancelled = false;
    setCarsLoading(true);
    setCarsError('');
    const p = new URLSearchParams();
    if (location) p.set('location', location);
    if (checkIn && checkOut) {
      p.set('checkIn', checkIn);
      p.set('checkOut', checkOut);
    }
    fetch(`${API_BASE_URL}/properties/search/cars?${p.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || `Could not load cars (status ${res.status}).`);
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setCars(data);
      })
      .catch((err) => {
        if (!cancelled) setCarsError(err.message || 'Could not load cars.');
      })
      .finally(() => {
        if (!cancelled) setCarsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location, checkIn, checkOut]);

  const carsSubtitle = carsLoading
    ? 'Loading cars...'
    : `${cars.length} ${cars.length === 1 ? 'car' : 'cars'} available${location ? ` in ${location}` : ''}${
        days ? ` for ${days} ${days === 1 ? 'day' : 'days'}` : ''
      }`;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-semibold mb-5">
        {location ? `Services in ${location}` : 'Services on bhookme'}
      </h1>

      <ScrollRow>
        {SERVICE_CATEGORIES.map((c) => (
          <CategoryTile
            key={c.id}
            category={c}
            onComingSoon={setComingSoon}
            onLive={() => carsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
        ))}
      </ScrollRow>

      <div ref={carsRef} className="scroll-mt-48">
        <ScrollRow title="Car rentals" subtitle={carsSubtitle}>
          {carsError && <p className="text-red-500">{carsError}</p>}
          {carsLoading &&
            [0, 1, 2, 3].map((i) => (
              <div key={i} className="shrink-0 w-[75%] sm:w-[45%] md:w-[30%] lg:w-[23%]">
                <div className="aspect-square rounded-2xl bg-gray-200 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded mt-3 w-2/3 animate-pulse" />
                <div className="h-4 bg-gray-200 rounded mt-2 w-1/3 animate-pulse" />
              </div>
            ))}
          {!carsLoading && !carsError && cars.length === 0 && (
            <div className="shrink-0 w-full sm:w-[45%] rounded-2xl border border-dashed border-gray-300 p-6 bg-white">
              <p className="font-semibold">No cars match this search yet</p>
              <p className="text-sm text-gray-500 mt-1">Try other dates or a nearby city, or list your own car.</p>
              <Link to="/become-host" className="inline-block mt-3 text-sm font-semibold underline">
                Rent out your car
              </Link>
            </div>
          )}
          {!carsLoading && cars.map((car) => <CarCard key={car.id} car={car} days={days} query={carryQuery} />)}
        </ScrollRow>
      </div>

      {comingSoon && <ComingSoonDialog category={comingSoon} onClose={() => setComingSoon(null)} />}
    </div>
  );
}