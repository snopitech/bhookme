import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { pick, priceOf, imageOf } from '../components/MapPanel';
import { SERVICE_CATEGORIES } from '../data/serviceCategories';
import { EXPERIENCE_CATEGORIES, findExperienceCategory, formatDuration } from '../data/experienceCategories';
import { withCoords, sortByDistance, distanceLabel } from '../utils/geo';

const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const API_BASE_URL = `${API_ORIGIN}/api`;

const RECENT_KEY = 'bhookme_recent_searches';
const MAX_RECENT = 8;
const DEBOUNCE_MS = 300;

const TABS = [
  { id: 'all', label: 'All' },
  { id: 'homes', label: 'Homes', icon: '🏠' },
  { id: 'cars', label: 'Cars', icon: '🚗' },
  { id: 'experiences', label: 'Experiences', icon: '🎟️' },
  { id: 'services', label: 'Services', icon: '🛎️' },
  { id: 'places', label: 'Places', icon: '📍' },
];

// Shown before typing, so guests see what the search understands.
const SMART_EXAMPLES = ['1 bedroom', '2br houston', 'under 100', 'sleeps 4', 'pool', 'studio', 'SUV', 'Toyota 2020'];

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveRecent(term) {
  const t = term.trim();
  if (t.length < 2) return readRecent();
  const next = [t, ...readRecent().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked - recent searches are just a convenience
  }
  return next;
}

function absoluteUrl(url) {
  if (!url || typeof url !== 'string') return null;
  return url.startsWith('/') ? `${API_ORIGIN}${url}` : url;
}

function carImage(car) {
  const fromTable = pick(car?.image, ['image_url', 'url', 'file_url', 'photo_url', 'path']);
  return absoluteUrl(fromTable || car?.image_url);
}

function money(n) {
  const num = Number(n);
  return Number.isFinite(num) && num > 0 ? `$${Math.round(num).toLocaleString()}` : null;
}

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error((body && body.message) || `Search failed (status ${res.status}).`);
  return body || {};
}

// ===== NEAR ME =====
// Everything is shown, nearest first - no distance limit (like
// Airbnb's "Nearby"). Listings without their own map position use
// their city's center (see utils/geo.js).

function Section({ title, count, onSeeAll, children }) {
  return (
    <section className="mb-10">
      <div className="flex items-end justify-between mb-3">
        <h2 className="text-lg font-semibold">
          {title} <span className="text-gray-400 font-normal">({count})</span>
        </h2>
        {onSeeAll && (
          <button type="button" onClick={onSeeAll} className="text-sm font-semibold underline">
            See all
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function ResultCard({ to, image, fallbackIcon, title, subtitle, price }) {
  return (
    <Link to={to} className="group block min-w-0">
      <div className="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100">
        {image ? (
          <img src={image} alt={title} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl" aria-hidden="true">
            {fallbackIcon}
          </div>
        )}
      </div>
      <p className="mt-2 font-semibold text-sm leading-snug line-clamp-2">{title}</p>
      {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
      {price && <p className="text-sm mt-0.5">{price}</p>}
    </Link>
  );
}

const grid = 'grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4';

// "1 bedroom · sleeps 2" style line for a home card.
function homeFacts(h) {
  const bits = [];
  const beds = Number(h.bedrooms);
  if (Number.isFinite(beds)) bits.push(beds === 0 ? 'Studio' : `${beds} bedroom${beds === 1 ? '' : 's'}`);
  const guests = Number(h.max_guests);
  if (Number.isFinite(guests) && guests > 0) bits.push(`sleeps ${guests}`);
  return bits.join(' · ');
}

export default function ExplorePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const urlQuery = params.get('q') || '';
  const nearMode = !urlQuery && params.get('near') === '1';
  const [input, setInput] = useState(urlQuery);
  const [tab, setTab] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState(readRecent);
  const [popularPlaces, setPopularPlaces] = useState([]);
  const inputRef = useRef(null);

  // Near me: where the visitor is, and what's around them.
  // nearStatus: 'idle' | 'locating' | 'denied' | 'unsupported' | 'ready'
  const [nearCoords, setNearCoords] = useState(null);
  const [nearStatus, setNearStatus] = useState('idle');
  const [nearAttempt, setNearAttempt] = useState(0);
  const [nearHomes, setNearHomes] = useState(null);
  const [nearLeases, setNearLeases] = useState(null);

  useEffect(() => {
    inputRef.current?.focus();
    fetch(`${API_BASE_URL}/properties/search/locations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => setPopularPlaces(Array.isArray(list) ? list.slice(0, 8) : []))
      .catch(() => {});
  }, []);

  // Keep the box in sync when the URL changes (back/forward buttons).
  useEffect(() => {
    setInput(urlQuery);
  }, [urlQuery]);

  // Typing updates the URL after a short pause.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = input.trim();
      if (next !== urlQuery) {
        setParams(next ? { q: next } : {}, { replace: true });
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input]);

  // Search whenever the URL query changes.
  // Homes and cars come from the SMART search (understands "1 bedroom",
  // "2br", "under 100", "sleeps 4", "pool", "toyota 2020", small typos).
  // Experiences and places still come from the word search. If the smart
  // search ever fails, the word search's homes/cars are used instead.
  useEffect(() => {
    if (!urlQuery) {
      setData(null);
      setError('');
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    const q = encodeURIComponent(urlQuery);

    Promise.allSettled([
      getJson(`${API_BASE_URL}/properties/search/all?q=${q}`),
      getJson(`${API_BASE_URL}/properties/search/smart?q=${q}&scope=all`),
    ])
      .then(([wordResult, smartResult]) => {
        if (cancelled) return;
        if (wordResult.status === 'rejected' && smartResult.status === 'rejected') {
          throw wordResult.reason || new Error('Search failed.');
        }
        const word = wordResult.status === 'fulfilled' ? wordResult.value : {};
        const smart = smartResult.status === 'fulfilled' ? smartResult.value : null;

        const merged = {
          query: urlQuery,
          experiences: word.experiences || [],
          places: word.places || [],
          homes: smart ? smart.homes || [] : word.homes || [],
          cars: smart ? smart.cars || [] : word.cars || [],
          understood: smart && Array.isArray(smart.understood) ? smart.understood : [],
          counts: {
            experiences: word.counts?.experiences ?? (word.experiences || []).length,
            places: word.counts?.places ?? (word.places || []).length,
            homes: smart ? smart.counts?.homes ?? (smart.homes || []).length : word.counts?.homes ?? 0,
            cars: smart ? smart.counts?.cars ?? (smart.cars || []).length : word.counts?.cars ?? 0,
          },
        };
        setData(merged);
        setRecent(saveRecent(urlQuery));
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
  }, [urlQuery]);

  // Ask the browser for the visitor's location whenever Near me is on
  // (also after a page refresh on /explore?near=1).
  useEffect(() => {
    if (!nearMode || nearCoords) return;
    if (!navigator.geolocation) {
      setNearStatus('unsupported');
      return;
    }
    setNearStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setNearCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearStatus('ready');
      },
      () => setNearStatus('denied'),
      { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 15000 }
    );
  }, [nearMode, nearCoords, nearAttempt]);

  // Load homes and leases once Near me is on.
  useEffect(() => {
    if (!nearMode || nearHomes) return;
    Promise.all([
      fetch(`${API_BASE_URL}/properties`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch(`${API_BASE_URL}/leases`).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(async ([homeList, leaseList]) => {
      const [homesLocated, leasesLocated] = await Promise.all([
        withCoords(Array.isArray(homeList) ? homeList : []),
        withCoords(Array.isArray(leaseList) ? leaseList : []),
      ]);
      setNearHomes(homesLocated);
      setNearLeases(leasesLocated);
    });
  }, [nearMode, nearHomes]);

  // Sort everything by distance from the visitor, nearest first.
  const nearResults = useMemo(() => {
    if (!nearCoords || !nearHomes) return null;
    const wrap = (list) => sortByDistance(list || [], nearCoords).map((item) => ({ item, miles: item.miles }));
    return { homes: wrap(nearHomes), leases: wrap(nearLeases) };
  }, [nearCoords, nearHomes, nearLeases]);

  const startNearMe = () => {
    setInput('');
    setTab('all');
    setParams({ near: '1' }, { replace: false });
  };

  // Services are a fixed list, matched on this side.
  const services = useMemo(() => {
    const words = urlQuery.toLowerCase().split(/[\s,]+/).filter(Boolean);
    if (!words.length) return [];
    return SERVICE_CATEGORIES.filter((s) => {
      const hay = `${s.label} ${s.blurb || ''} ${s.partner || ''}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [urlQuery]);

  const homes = data?.homes || [];
  const cars = data?.cars || [];
  const experiences = data?.experiences || [];
  const places = data?.places || [];
  const understood = data?.understood || [];
  const counts = {
    homes: data?.counts?.homes ?? homes.length,
    cars: data?.counts?.cars ?? cars.length,
    experiences: data?.counts?.experiences ?? experiences.length,
    services: services.length,
    places: data?.counts?.places ?? places.length,
  };
  const total = counts.homes + counts.cars + counts.experiences + counts.services + counts.places;

  const runSearch = (term) => {
    setInput(term);
    setParams({ q: term }, { replace: false });
    setTab('all');
  };

  const clearRecent = () => {
    try {
      localStorage.removeItem(RECENT_KEY);
    } catch {
      // ignore
    }
    setRecent([]);
  };

  const show = (id) => tab === 'all' || tab === id;
  const limit = (list) => (tab === 'all' ? list.slice(0, 8) : list);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
      {/* Search box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim()) runSearch(input.trim());
        }}
        className="sticky top-0 z-10 bg-white pt-1 pb-3"
      >
        <div className="flex items-center gap-3 border border-gray-300 rounded-full shadow-sm px-4 py-3 focus-within:ring-2 focus-within:ring-rose-500">
          <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-gray-500" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Try 2 bedroom houston, under 100, pool, SUV..."
            aria-label="Search bhookme"
            className="flex-1 min-w-0 text-base outline-none bg-transparent"
          />
          {input && (
            <button
              type="button"
              onClick={() => {
                setInput('');
                setParams({}, { replace: true });
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="w-7 h-7 rounded-full bg-gray-100 text-gray-600 text-lg leading-none shrink-0"
            >
              ×
            </button>
          )}
        </div>
      </form>

      {/* Near me - like Airbnb's "Nearby" */}
      {!urlQuery && !nearMode && (
        <button
          type="button"
          onClick={startNearMe}
          className="mt-2 w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:shadow-md hover:border-gray-300 transition text-left"
        >
          <span className="w-12 h-12 shrink-0 rounded-xl bg-rose-50 flex items-center justify-center text-2xl" aria-hidden="true">
            📍
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">Near me</span>
            <span className="block text-sm text-gray-500">Find homes and monthly stays around you</span>
          </span>
        </button>
      )}

      {/* Near me results */}
      {nearMode && (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold">📍 Near you</h2>
            <button
              type="button"
              onClick={() => setParams({}, { replace: false })}
              className="text-sm font-semibold underline shrink-0"
            >
              Close
            </button>
          </div>

          {nearStatus === 'locating' && <p className="text-gray-500">Finding your location...</p>}

          {(nearStatus === 'denied' || nearStatus === 'unsupported') && (
            <div className="border border-dashed border-gray-300 rounded-xl px-4 py-8 text-center">
              <p className="font-semibold">We couldn't get your location</p>
              <p className="text-sm text-gray-500 mt-1">
                Allow location for bhookme in your browser settings and try again, or search a city instead.
              </p>
              <button
                type="button"
                onClick={() => setNearAttempt((n) => n + 1)}
                className="mt-4 px-4 py-2 rounded-full bg-rose-500 text-white text-sm font-semibold"
              >
                Try again
              </button>
            </div>
          )}

          {nearStatus === 'ready' && !nearResults && <p className="text-gray-500">Loading places near you...</p>}

          {nearResults && (
            <>
              <p className="text-sm text-gray-500 mb-4">Closest first, based on your location.</p>

              {nearResults.homes.length > 0 && (
                <Section title="Homes" count={nearResults.homes.length}>
                  <div className={grid}>
                    {nearResults.homes.map(({ item: h, miles }) => (
                      <ResultCard
                        key={h.id}
                        to={`/property/${h.id}`}
                        image={imageOf(h)}
                        fallbackIcon="🏠"
                        title={pick(h, ['title', 'name']) || 'Home'}
                        subtitle={[distanceLabel(miles), [pick(h, ['city']), pick(h, ['state'])].filter(Boolean).join(', ')]
                          .filter(Boolean)
                          .join(' · ')}
                        price={money(priceOf(h)) ? `${money(priceOf(h))} night` : null}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {nearResults.leases.length > 0 && (
                <Section title="Monthly stays" count={nearResults.leases.length}>
                  <div className={grid}>
                    {nearResults.leases.map(({ item: l, miles }) => (
                      <ResultCard
                        key={l.id}
                        to={`/lease/${l.id}`}
                        image={absoluteUrl(l.imageUrls?.[0] || l.imageUrl)}
                        fallbackIcon="🏠"
                        title={l.title || 'Monthly stay'}
                        subtitle={[distanceLabel(miles), [l.city, l.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                        price={money(l.monthlyRent) ? `${money(l.monthlyRent)} month` : null}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {nearResults.homes.length === 0 && nearResults.leases.length === 0 && (
                <p className="text-gray-500 text-sm py-8 text-center">No homes or monthly stays listed yet.</p>
              )}
            </>
          )}
        </div>
      )}

      {/* Before typing */}
      {!urlQuery && !nearMode && (
        <div className="mt-4 space-y-8">
          <section>
            <h2 className="font-semibold mb-2">Search the way you talk</h2>
            <div className="flex flex-wrap gap-2">
              {SMART_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => runSearch(ex)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-300 text-sm hover:border-gray-900"
                >
                  <span aria-hidden="true">✨</span>
                  {ex}
                </button>
              ))}
            </div>
          </section>

          {recent.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">Recent searches</h2>
                <button type="button" onClick={clearRecent} className="text-sm text-gray-500 underline">
                  Clear
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recent.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => runSearch(r)}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-300 text-sm hover:border-gray-900"
                  >
                    <span aria-hidden="true">🕘</span>
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}

          {popularPlaces.length > 0 && (
            <section>
              <h2 className="font-semibold mb-2">Popular places</h2>
              <div className="flex flex-wrap gap-2">
                {popularPlaces.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => runSearch(p.split(',')[0])}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-300 text-sm hover:border-gray-900"
                  >
                    <span aria-hidden="true">📍</span>
                    {p}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="font-semibold mb-3">Browse bhookme</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { to: '/', icon: '🏠', label: 'Homes', hint: 'Places to stay' },
                { to: '/category/services?type=car-rentals', icon: '🚗', label: 'Cars', hint: 'Car rentals' },
                { to: '/category/experiences', icon: '🎟️', label: 'Experiences', hint: 'Tours, food, classes' },
                { to: '/category/services', icon: '🛎️', label: 'Services', hint: 'IT, chefs, and more' },
              ].map((b) => (
                <Link key={b.label} to={b.to} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition">
                  <span className="text-3xl" aria-hidden="true">{b.icon}</span>
                  <p className="font-semibold mt-2">{b.label}</p>
                  <p className="text-xs text-gray-500">{b.hint}</p>
                </Link>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-semibold mb-2">Experience ideas</h2>
            <div className="flex flex-wrap gap-2">
              {EXPERIENCE_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => navigate(`/category/experiences?category=${c.id}`)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-300 text-sm hover:border-gray-900"
                >
                  <span aria-hidden="true">{c.icon}</span>
                  {c.label}
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Results */}
      {urlQuery && (
        <div className="mt-2">
          <div className="flex gap-2 overflow-x-auto pb-3 mb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {TABS.map((t) => {
              const count = t.id === 'all' ? total : counts[t.id];
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border ${
                    tab === t.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 hover:border-gray-900'
                  }`}
                >
                  {t.icon ? `${t.icon} ` : ''}
                  {t.label} {data ? `(${count})` : ''}
                </button>
              );
            })}
          </div>

          {understood.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4 text-xs">
              <span className="text-gray-500">Looking for:</span>
              {understood.map((u) => (
                <span key={u} className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-medium">
                  {u}
                </span>
              ))}
            </div>
          )}

          {loading && !data && <p className="text-gray-500">Searching...</p>}
          {error && <p className="text-red-500 mb-4">{error}</p>}

          {data && total === 0 && !loading && (
            <div className="text-center py-16">
              <p className="text-4xl mb-3" aria-hidden="true">🔎</p>
              <p className="font-semibold">No results for "{urlQuery}"</p>
              <p className="text-sm text-gray-500 mt-1">
                Try fewer words, or something like "1 bedroom", "under 100", "Houston", "SUV" or "tour".
              </p>
            </div>
          )}

          {data && (
            <div className={loading ? 'opacity-60 transition' : ''}>
              {show('places') && places.length > 0 && (
                <Section title="Places" count={counts.places} onSeeAll={tab === 'all' && places.length > 8 ? () => setTab('places') : null}>
                  <div className="flex flex-wrap gap-2">
                    {limit(places).map((p) => (
                      <Link
                        key={p.label}
                        to={`/search?location=${encodeURIComponent(p.label)}`}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 hover:shadow-md transition text-sm"
                      >
                        <span aria-hidden="true">📍</span>
                        <span className="font-medium">{p.label}</span>
                        <span className="text-gray-400">· {p.listings} listing{p.listings === 1 ? '' : 's'}</span>
                      </Link>
                    ))}
                  </div>
                </Section>
              )}

              {show('homes') && homes.length > 0 && (
                <Section title="Homes" count={counts.homes} onSeeAll={tab === 'all' && counts.homes > 8 ? () => setTab('homes') : null}>
                  <div className={grid}>
                    {limit(homes).map((h) => (
                      <ResultCard
                        key={h.id}
                        to={`/property/${h.id}`}
                        image={imageOf(h)}
                        fallbackIcon="🏠"
                        title={pick(h, ['title', 'name']) || 'Home'}
                        subtitle={[[pick(h, ['city']), pick(h, ['state'])].filter(Boolean).join(', '), homeFacts(h)]
                          .filter(Boolean)
                          .join(' · ')}
                        price={money(priceOf(h)) ? `${money(priceOf(h))} night` : null}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {show('cars') && cars.length > 0 && (
                <Section title="Cars" count={counts.cars} onSeeAll={tab === 'all' && counts.cars > 8 ? () => setTab('cars') : null}>
                  <div className={grid}>
                    {limit(cars).map((c) => (
                      <ResultCard
                        key={c.id}
                        to={`/car/${c.id}`}
                        image={carImage(c)}
                        fallbackIcon="🚗"
                        title={[c.year, c.make, c.model].filter(Boolean).join(' ') || 'Car'}
                        subtitle={[c.category, [c.city, c.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                        price={money(c.daily_rate) ? `${money(c.daily_rate)} day` : null}
                      />
                    ))}
                  </div>
                </Section>
              )}

              {show('experiences') && experiences.length > 0 && (
                <Section
                  title="Experiences"
                  count={counts.experiences}
                  onSeeAll={tab === 'all' && counts.experiences > 8 ? () => setTab('experiences') : null}
                >
                  <div className={grid}>
                    {limit(experiences).map((e) => {
                      const cat = findExperienceCategory(e.category);
                      return (
                        <ResultCard
                          key={e.id}
                          to={`/experience/${e.id}`}
                          image={absoluteUrl(e.cover_image)}
                          fallbackIcon={cat?.icon || '🎟️'}
                          title={e.title}
                          subtitle={[cat?.label, e.city, e.duration_minutes ? formatDuration(e.duration_minutes) : null]
                            .filter(Boolean)
                            .join(' · ')}
                          price={money(e.price_per_person) ? `From ${money(e.price_per_person)} / guest` : null}
                        />
                      );
                    })}
                  </div>
                </Section>
              )}

              {show('services') && services.length > 0 && (
                <Section title="Services" count={counts.services}>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {services.map((s) =>
                      s.external ? (
                        <a
                          key={s.id}
                          href={s.external}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition"
                        >
                          <span className="text-3xl" aria-hidden="true">{s.icon}</span>
                          <p className="font-semibold mt-2">{s.label} ↗</p>
                          <p className="text-xs text-gray-500">{s.blurb}</p>
                        </a>
                      ) : (
                        <Link
                          key={s.id}
                          to={`/category/services?type=${s.id}`}
                          className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition"
                        >
                          <span className="text-3xl" aria-hidden="true">{s.icon}</span>
                          <p className="font-semibold mt-2">{s.label}</p>
                          <p className="text-xs text-gray-500">{s.live ? s.blurb : 'Coming soon'}</p>
                        </Link>
                      )
                    )}
                  </div>
                </Section>
              )}

              {tab !== 'all' && counts[tab] === 0 && (
                <p className="text-gray-500 text-sm py-8 text-center">No {TABS.find((t) => t.id === tab)?.label.toLowerCase()} match "{urlQuery}".</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}