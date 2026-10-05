import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { EXPERIENCE_CATEGORIES, findExperienceCategory, formatDuration } from '../data/experienceCategories';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

function shortDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function nextSlotLabel(iso) {
  if (!iso) return null;
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const when = new Date(y, m - 1, d, hh, mm);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const t = when.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  if (when.toDateString() === today.toDateString()) return `Today, ${t}`;
  if (when.toDateString() === tomorrow.toDateString()) return `Tomorrow, ${t}`;
  return when.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + `, ${t}`;
}

// Sideways-scrolling chip row with left/right arrows that appear only
// when there is more to see in that direction.
function ChipScroller({ children }) {
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
  }, []);

  const scrollBy = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  const arrowClass =
    'absolute top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full bg-white border border-gray-300 shadow-md flex items-center justify-center text-lg hover:scale-105 transition';

  return (
    <div className="relative">
      {canLeft && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-white to-transparent z-[5]" />
          <button type="button" onClick={() => scrollBy(-1)} aria-label="Scroll categories left" className={`${arrowClass} left-0`}>
            ‹
          </button>
        </>
      )}
      <div ref={ref} className="flex gap-2 overflow-x-auto py-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
      {canRight && (
        <>
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-white to-transparent z-[5]" />
          <button type="button" onClick={() => scrollBy(1)} aria-label="Scroll categories right" className={`${arrowClass} right-0`}>
            ›
          </button>
        </>
      )}
    </div>
  );
}

export function ExperienceCard({ exp, query = '' }) {
  const cat = findExperienceCategory(exp.category);
  const next = nextSlotLabel(exp.nextSlot);
  return (
    <Link to={`/experience/${exp.id}${query ? `?${query}` : ''}`} className="group block">
      <div className="aspect-[4/5] rounded-2xl overflow-hidden bg-gray-100 relative">
        {exp.imageUrl ? (
          <img
            src={exp.imageUrl}
            alt={exp.title}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-6xl" aria-hidden="true">
            {cat?.icon || '🎟️'}
          </div>
        )}
        {next && (
          <span className="absolute top-3 left-3 bg-white/95 text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
            {next}
          </span>
        )}
      </div>
      <p className="mt-3 font-semibold leading-snug line-clamp-2">{exp.title}</p>
      <p className="text-sm text-gray-500 truncate">
        {exp.city}
        {exp.state ? `, ${exp.state}` : ''} · {formatDuration(exp.durationMinutes)}
      </p>
      <p className="text-sm mt-1">
        From <span className="font-semibold">${Number(exp.pricePerPerson).toFixed(0)}</span> / guest
      </p>
    </Link>
  );
}

export default function ExperiencesPage() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const location = params.get('location') || '';
  const date = params.get('date') || '';
  const guests = Number(params.get('guests')) || 0;
  const category = params.get('category') || '';
  const selected = findExperienceCategory(category);

  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const p = new URLSearchParams();
    if (location) p.set('location', location);
    if (date) p.set('date', date);
    if (guests) p.set('guests', String(guests));
    if (category) p.set('category', category);
    fetch(`${API_BASE_URL}/experiences?${p.toString()}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || `Could not load experiences (status ${res.status}).`);
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setExperiences(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [location, date, guests, category]);

  const setCategory = (id) => {
    const p = new URLSearchParams(search);
    if (!id || p.get('category') === id) p.delete('category');
    else p.set('category', id);
    const qs = p.toString();
    navigate(`/category/experiences${qs ? `?${qs}` : ''}`);
  };

  // Carry date/guests to the detail page so its slot picker starts there.
  const carryQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (date) p.set('date', date);
    if (guests) p.set('guests', String(guests));
    return p.toString();
  }, [date, guests]);

  const heading = selected
    ? `${selected.label}${location ? ` in ${location}` : ''}`
    : location
      ? `Experiences in ${location}`
      : 'Experiences on bhookme';
  const filters = [date ? shortDate(date) : null, guests ? `${guests} guest${guests === 1 ? '' : 's'}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-semibold">{heading}</h1>
      {filters && <p className="text-sm text-gray-500 mt-1">{filters}</p>}

      {/* Category chips */}
      <ChipScroller>
        <button
          type="button"
          onClick={() => setCategory('')}
          className={`shrink-0 px-4 py-2 rounded-full border text-sm font-medium transition ${
            !selected ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-900'
          }`}
        >
          All
        </button>
        {EXPERIENCE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            aria-pressed={selected?.id === c.id}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium transition ${
              selected?.id === c.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-300 hover:border-gray-900'
            }`}
          >
            <span aria-hidden="true">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </ChipScroller>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i}>
              <div className="aspect-[4/5] rounded-2xl bg-gray-200 animate-pulse" />
              <div className="h-4 bg-gray-200 rounded mt-3 w-3/4 animate-pulse" />
              <div className="h-4 bg-gray-200 rounded mt-2 w-1/2 animate-pulse" />
            </div>
          ))}
        </div>
      ) : (
        !error &&
        (experiences.length === 0 ? (
          <div className="text-center py-16 border border-dashed border-gray-300 rounded-2xl">
            <p className="text-5xl mb-3" aria-hidden="true">{selected?.icon || '🎟️'}</p>
            <p className="font-semibold">
              {location || date || selected ? 'No experiences match this search yet' : 'Experiences are coming to bhookme'}
            </p>
            <p className="text-sm text-gray-500 mt-1 mb-4">
              {location || date || selected
                ? 'Try another date, category, or city.'
                : 'Hosts are setting up tours, classes, and food experiences right now.'}
            </p>
            <Link to="/become-host" className="text-sm font-semibold underline">
              Host an experience
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-500 mb-4">
              {experiences.length} experience{experiences.length === 1 ? '' : 's'}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {experiences.map((exp) => (
                <ExperienceCard key={exp.id} exp={exp} query={carryQuery} />
              ))}
            </div>
          </>
        ))
      )}
    </div>
  );
}