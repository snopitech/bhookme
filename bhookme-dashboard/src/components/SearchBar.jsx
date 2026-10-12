import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SERVICE_CATEGORIES, findServiceCategory } from '../data/serviceCategories';

const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const API_BASE_URL = `${API_ORIGIN}/api`;

// yyyy-mm-dd in the visitor's own time zone
function localISO(date) {
  const d = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return localISO(new Date(y, m - 1, d + days));
}

function shortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Stepper({ label, hint, value, min, onChange }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-b-0">
      <div>
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs text-gray-500">{hint}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Fewer ${label.toLowerCase()}`}
          className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 hover:border-gray-900 disabled:opacity-30 disabled:hover:border-gray-300"
        >
          −
        </button>
        <span className="w-5 text-center text-sm">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(16, value + 1))}
          aria-label={`More ${label.toLowerCase()}`}
          className="w-8 h-8 rounded-full border border-gray-300 text-gray-600 hover:border-gray-900"
        >
          +
        </button>
      </div>
    </div>
  );
}

export default function SearchBar() {
  const navigate = useNavigate();
  const routerLocation = useLocation();
  const wrapperRef = useRef(null);
  const whereInputRef = useRef(null);

  const [where, setWhere] = useState('');
  // "Nearby" picked in Where: search around the visitor's location.
  const [nearby, setNearby] = useState(false);
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [adults, setAdults] = useState(0);
  const [children, setChildren] = useState(0);
  const [serviceType, setServiceType] = useState('');
  const [panel, setPanel] = useState(null); // 'where' | 'when' | 'who' | null  (desktop)
  const [mobileOpen, setMobileOpen] = useState(false);
  const [locations, setLocations] = useState([]);

  const today = localISO(new Date());
  const guests = adults + children;
  // On the Services tab the third part of the bar becomes "Type of service".
  const isServices = routerLocation.pathname.startsWith('/category/services');
  // On the Experiences tab "When" is a single day (experiences are booked by time slot).
  const isExperiences = routerLocation.pathname.startsWith('/category/experiences');
  const serviceTypeLabel = findServiceCategory(serviceType)?.label || '';
  // Nearby is for stays (homes), like Airbnb's "Nearby".
  const nearbyAvailable = !isServices && !isExperiences;

  // Keep the bar filled in with whatever is in the URL on the /search and Services pages.
  useEffect(() => {
    const path = routerLocation.pathname;
    if (path !== '/search' && !path.startsWith('/category/services') && !path.startsWith('/category/experiences')) return;
    const p = new URLSearchParams(routerLocation.search);
    setServiceType(p.get('type') || '');
    if (path.startsWith('/category/experiences')) {
      setWhere(p.get('location') || '');
      setCheckIn(p.get('date') || '');
      setCheckOut('');
      setAdults(Number(p.get('guests')) || 0);
      setChildren(0);
      return;
    }
    setWhere(p.get('location') || '');
    setNearby(path === '/search' && p.get('near') === '1');
    setCheckIn(p.get('checkIn') || '');
    setCheckOut(p.get('checkOut') || '');
    setAdults(Number(p.get('adults')) || Number(p.get('guests')) || 0);
    setChildren(Number(p.get('children')) || 0);
  }, [routerLocation.pathname, routerLocation.search]);

  // Cities that actually have listings, for suggestions.
  useEffect(() => {
    fetch(`${API_BASE_URL}/properties/search/locations`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLocations(Array.isArray(data) ? data : []))
      .catch(() => setLocations([]));
  }, []);

  // Close the desktop dropdown on outside click or Escape.
  useEffect(() => {
    if (!panel) return;
    const onDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setPanel(null);
    };
    const onKey = (e) => e.key === 'Escape' && setPanel(null);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [panel]);

  // Lock page scroll while the mobile search sheet is open.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (panel === 'where') whereInputRef.current?.focus();
  }, [panel]);

  const suggestions = useMemo(() => {
    const term = where.trim().toLowerCase();
    const list = term ? locations.filter((l) => l.toLowerCase().includes(term)) : locations;
    return list.slice(0, 6);
  }, [where, locations]);

  const setCheckInSafe = (value) => {
    setCheckIn(value);
    if (value && (!checkOut || checkOut <= value)) setCheckOut(addDays(value, 1));
  };

  const clearAll = () => {
    setWhere('');
    setNearby(false);
    setCheckIn('');
    setCheckOut('');
    setAdults(0);
    setChildren(0);
    setServiceType('');
  };

  const submit = () => {
    if (isExperiences) {
      const ep = new URLSearchParams();
      if (where.trim()) ep.set('location', where.trim());
      if (checkIn) ep.set('date', checkIn);
      if (guests > 0) ep.set('guests', String(guests));
      const category = new URLSearchParams(routerLocation.search).get('category');
      if (category) ep.set('category', category);
      setPanel(null);
      setMobileOpen(false);
      const qs = ep.toString();
      navigate(`/category/experiences${qs ? `?${qs}` : ''}`);
      return;
    }
    if (isServices) {
      // Partner services (like IT) open their own website right from the click,
      // so the browser doesn't treat it as an unwanted pop-up.
      const picked = findServiceCategory(serviceType);
      if (picked?.external) {
        window.open(picked.external, '_blank', 'noopener,noreferrer');
        setPanel(null);
        setMobileOpen(false);
        return;
      }
      const sp = new URLSearchParams();
      if (where.trim()) sp.set('location', where.trim());
      if (checkIn && checkOut) {
        sp.set('checkIn', checkIn);
        sp.set('checkOut', checkOut);
      }
      if (serviceType) sp.set('type', serviceType);
      setPanel(null);
      setMobileOpen(false);
      const qs = sp.toString();
      navigate(`/category/services${qs ? `?${qs}` : ''}`);
      return;
    }
    const p = new URLSearchParams();
    if (nearby && nearbyAvailable) p.set('near', '1');
    else if (where.trim()) p.set('location', where.trim());
    if (checkIn && checkOut) {
      p.set('checkIn', checkIn);
      p.set('checkOut', checkOut);
    }
    if (guests > 0) {
      p.set('guests', String(guests));
      p.set('adults', String(adults));
      if (children > 0) p.set('children', String(children));
    }
    setPanel(null);
    setMobileOpen(false);
    navigate(`/search?${p.toString()}`);
  };

  const showNearby = nearby && nearbyAvailable;
  const whereLabel = showNearby ? 'Nearby' : where.trim() || 'Anywhere';
  const whenLabel = isExperiences
    ? checkIn ? shortDate(checkIn) : 'Add dates'
    : checkIn && checkOut
      ? `${shortDate(checkIn)} – ${shortDate(checkOut)}`
      : isServices ? 'Add dates' : 'Any week';
  const whoLabel = isServices
    ? serviceTypeLabel || 'Add service'
    : guests > 0 ? `${guests} guest${guests === 1 ? '' : 's'}` : 'Add guests';
  const whoTitle = isServices ? 'Type of service' : 'Who';
  const whoIsEmpty = isServices ? !serviceType : guests === 0;

  // ----- shared panel contents -----
  const whereContent = (
    <div>
      <label className="block text-xs font-semibold mb-1" htmlFor="bh-where">Where</label>
      <input
        id="bh-where"
        ref={whereInputRef}
        value={where}
        onChange={(e) => {
          setWhere(e.target.value);
          setNearby(false);
        }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder={showNearby ? 'Nearby' : 'Search destinations'}
        autoComplete="off"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
      />
      {nearbyAvailable && !where.trim() && (
        <button
          type="button"
          onClick={() => {
            setNearby(true);
            setWhere('');
            setPanel('when');
          }}
          className={`mt-2 w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left text-sm ${
            showNearby ? 'bg-gray-100' : 'hover:bg-gray-100'
          }`}
        >
          <span className="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center" aria-hidden="true">🧭</span>
          <span>
            <span className="block font-semibold">Nearby</span>
            <span className="block text-xs text-gray-500">Find what's around you</span>
          </span>
        </button>
      )}
      {suggestions.length > 0 && (
        <ul className="mt-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => {
                  setWhere(s);
                  setNearby(false);
                  setPanel('when');
                }}
                className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-100 text-left text-sm"
              >
                <span className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center" aria-hidden="true">📍</span>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  const whenContent = isExperiences ? (
    <label className="block">
      <span className="block text-xs font-semibold mb-1">Date</span>
      <input
        type="date"
        min={today}
        value={checkIn}
        onChange={(e) => setCheckIn(e.target.value)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
      />
    </label>
  ) : (
    <div className="grid grid-cols-2 gap-3">
      <label className="block">
        <span className="block text-xs font-semibold mb-1">Check in</span>
        <input
          type="date"
          min={today}
          value={checkIn}
          onChange={(e) => setCheckInSafe(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
      </label>
      <label className="block">
        <span className="block text-xs font-semibold mb-1">Check out</span>
        <input
          type="date"
          min={checkIn ? addDays(checkIn, 1) : addDays(today, 1)}
          value={checkOut}
          onChange={(e) => setCheckOut(e.target.value)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
      </label>
    </div>
  );

  const whoContent = (
    <div>
      <Stepper label="Adults" hint="Ages 13 or above" value={adults} min={children > 0 ? 1 : 0} onChange={setAdults} />
      <Stepper
        label="Children"
        hint="Ages 2–12"
        value={children}
        min={0}
        onChange={(v) => {
          setChildren(v);
          if (v > 0 && adults === 0) setAdults(1);
        }}
      />
    </div>
  );

  const serviceContent = (
    <ul className="grid grid-cols-2 gap-2">
      {SERVICE_CATEGORIES.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => setServiceType(serviceType === c.id ? '' : c.id)}
            aria-pressed={serviceType === c.id}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl border text-left text-sm transition ${
              serviceType === c.id ? 'border-gray-900 bg-gray-50 font-semibold' : 'border-gray-200 hover:border-gray-400'
            }`}
          >
            <span aria-hidden="true">{c.icon}</span>
            <span className="truncate">{c.label}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  const thirdContent = isServices ? serviceContent : whoContent;

  const segment = (id, title, value, extra = '') => (
    <button
      type="button"
      onClick={() => setPanel(panel === id ? null : id)}
      className={`text-left px-5 py-2 rounded-full transition ${extra} ${
        panel === id ? 'bg-white shadow-md' : 'hover:bg-gray-100'
      }`}
    >
      <span className="block text-xs font-semibold">{title}</span>
      <span className={`block text-sm truncate ${value.muted ? 'text-gray-500' : 'text-gray-900'}`}>{value.text}</span>
    </button>
  );

  return (
    <>
      {/* ---------- Desktop / tablet pill ---------- */}
      <div ref={wrapperRef} className="hidden md:block relative w-full">
        <div
          className={`flex items-center border border-gray-300 rounded-full shadow-sm hover:shadow-md transition ${
            panel ? 'bg-gray-100' : 'bg-white'
          }`}
        >
          {segment('where', 'Where', { text: whereLabel, muted: !where.trim() && !showNearby }, 'flex-1 min-w-0')}
          <span className="h-8 w-px bg-gray-300" />
          {segment('when', 'When', { text: whenLabel, muted: isExperiences ? !checkIn : !(checkIn && checkOut) }, 'flex-1 min-w-0')}
          <span className="h-8 w-px bg-gray-300" />
          <div className="flex-1 min-w-0 flex items-center">
            {segment('who', whoTitle, { text: whoLabel, muted: whoIsEmpty }, 'flex-1 min-w-0')}
            <button
              type="button"
              onClick={submit}
              aria-label="Search"
              className="mr-2 shrink-0 bg-rose-500 hover:bg-rose-600 text-white rounded-full w-10 h-10 flex items-center justify-center transition"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </div>
        </div>

        {panel && (
          <div
            className={`absolute top-full mt-3 z-50 bg-white rounded-3xl shadow-xl border border-gray-200 p-5 w-[min(26rem,90vw)] ${
              panel === 'where' ? 'left-0' : panel === 'when' ? 'left-1/2 -translate-x-1/2' : 'right-0'
            }`}
          >
            {panel === 'where' && whereContent}
            {panel === 'when' && (
              <>
                {whenContent}
                <div className="flex justify-between mt-4">
                  <button type="button" onClick={() => { setCheckIn(''); setCheckOut(''); }} className="text-sm underline">
                    Clear dates
                  </button>
                  <button type="button" onClick={() => setPanel('who')} className="text-sm font-semibold bg-gray-900 text-white px-4 py-2 rounded-lg">
                    Next
                  </button>
                </div>
              </>
            )}
            {panel === 'who' && (
              <>
                {thirdContent}
                <button
                  type="button"
                  onClick={submit}
                  className="w-full mt-4 bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-xl transition"
                >
                  Search
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ---------- Mobile "Start your search" pill ---------- */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="md:hidden w-full flex items-center gap-3 border border-gray-300 rounded-full shadow-sm px-4 py-2.5 text-left"
      >
        <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="min-w-0">
          <span className="block text-sm font-semibold truncate">{showNearby ? 'Nearby' : where.trim() || 'Start your search'}</span>
          <span className="block text-xs text-gray-500 truncate">
            {whenLabel} · {whoLabel}
          </span>
        </span>
      </button>

      {/* ---------- Mobile full-screen search ---------- */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[60] bg-gray-50 flex flex-col" role="dialog" aria-label="Search">
          <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close search"
              className="w-9 h-9 rounded-full border border-gray-300 flex items-center justify-center text-lg"
            >
              ×
            </button>
            <p className="font-semibold">{isServices ? 'Search services' : isExperiences ? 'Search experiences' : 'Search stays'}</p>
            <span className="w-9" />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <section className="bg-white rounded-2xl shadow-sm p-4">{whereContent}</section>
            <section className="bg-white rounded-2xl shadow-sm p-4">
              <p className="font-semibold mb-3">When</p>
              {whenContent}
            </section>
            <section className="bg-white rounded-2xl shadow-sm p-4">
              <p className={`font-semibold ${isServices ? 'mb-3' : ''}`}>{whoTitle}</p>
              {thirdContent}
            </section>
          </div>

          <div
            className="flex items-center justify-between px-4 py-3 bg-white border-t border-gray-200"
            style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
          >
            <button type="button" onClick={clearAll} className="text-sm font-semibold underline">
              Clear all
            </button>
            <button
              type="button"
              onClick={submit}
              className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-3 rounded-xl transition"
            >
              Search
            </button>
          </div>
        </div>
      )}
    </>
  );
}