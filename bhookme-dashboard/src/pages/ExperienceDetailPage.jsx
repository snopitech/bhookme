import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { findExperienceCategory, formatDuration } from '../data/experienceCategories';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

function parseSlot(iso) {
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return { date, when: new Date(y, m - 1, d, hh, mm) };
}

function dayLabel(dateIso) {
  const [y, m, d] = dateIso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeLabel(when, minutes) {
  const end = new Date(when.getTime() + minutes * 60000);
  const fmt = (d) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${fmt(when)} – ${fmt(end)}`;
}

export default function ExperienceDetailPage() {
  const { id } = useParams();
  const { search } = useLocation();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const [exp, setExp] = useState(null);
  const [error, setError] = useState('');
  const [selectedSlotId, setSelectedSlotId] = useState(null);
  const [guests, setGuests] = useState(Math.max(1, Number(params.get('guests')) || 1));
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let cancelled = false;
    setExp(null);
    setError('');
    fetch(`${API_BASE_URL}/experiences/${id}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || `Could not load this experience (status ${res.status}).`);
        return data;
      })
      .then((data) => {
        if (cancelled) return;
        setExp(data);
        // Pre-select the first time on the date chosen in search, if any.
        const wanted = params.get('date');
        const first = (data.slots || []).find((s) => !wanted || s.startTime.startsWith(wanted));
        if (first) setSelectedSlotId(first.id);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id, params]);

  const slotsByDay = useMemo(() => {
    const groups = [];
    (exp?.slots || []).forEach((s) => {
      const { date, when } = parseSlot(s.startTime);
      let group = groups.find((g) => g.date === date);
      if (!group) {
        group = { date, slots: [] };
        groups.push(group);
      }
      group.slots.push({ ...s, when });
    });
    return groups.slice(0, 14);
  }, [exp]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-red-500 mb-4">{error}</p>
        <Link to="/category/experiences" className="font-semibold underline">
          Back to experiences
        </Link>
      </div>
    );
  }

  if (!exp) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="h-8 w-2/3 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="aspect-[2/1] bg-gray-200 rounded-2xl animate-pulse" />
      </div>
    );
  }

  const cat = findExperienceCategory(exp.category);
  const images = (exp.images || []).map((i) => i.imageUrl);
  const selectedSlot = (exp.slots || []).find((s) => s.id === selectedSlotId) || null;
  const maxGuests = selectedSlot ? Math.min(selectedSlot.spotsLeft, exp.maxGuests) : exp.maxGuests;
  const price = Number(exp.pricePerPerson);
  const included = (exp.whatsIncluded || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const hasMap = exp.latitude != null && exp.longitude != null;

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-2xl sm:text-3xl font-semibold">{exp.title}</h1>
      <p className="text-gray-500 mt-1">
        {cat ? `${cat.icon} ${cat.label} · ` : ''}
        {exp.city}
        {exp.state ? `, ${exp.state}` : ''}
      </p>

      {/* Photo gallery */}
      <div className="mt-6 grid grid-cols-4 grid-rows-2 gap-2 h-64 sm:h-96 rounded-2xl overflow-hidden">
        {images.length === 0 ? (
          <div className="col-span-4 row-span-2 bg-gray-100 flex items-center justify-center text-7xl" aria-hidden="true">
            {cat?.icon || '🎟️'}
          </div>
        ) : (
          <>
            <img
              src={images[0]}
              alt={exp.title}
              className={`w-full h-full object-cover ${images.length === 1 ? 'col-span-4 row-span-2' : 'col-span-4 sm:col-span-2 row-span-2'}`}
            />
            {images.slice(1, 5).map((url, i) => (
              <img key={url} src={url} alt={`${exp.title} photo ${i + 2}`} className="hidden sm:block w-full h-full object-cover" />
            ))}
          </>
        )}
      </div>

      <div className="mt-8 grid lg:grid-cols-[minmax(0,1fr)_380px] gap-10">
        <div>
          <div className="flex items-center justify-between gap-4 pb-6 border-b border-gray-200">
            <div>
              <p className="text-lg font-semibold">Hosted by {exp.hostFirstName || 'your host'}</p>
              <p className="text-gray-500 text-sm">
                {formatDuration(exp.durationMinutes)} · Up to {exp.maxGuests} guests · Hosted in {exp.language || 'English'}
              </p>
            </div>
            <span className="w-12 h-12 rounded-full bg-gray-900 text-white flex items-center justify-center font-semibold shrink-0">
              {(exp.hostFirstName || '?')[0].toUpperCase()}
            </span>
          </div>

          {exp.description && <p className="py-6 border-b border-gray-200 whitespace-pre-line">{exp.description}</p>}

          {exp.whatYouWillDo && (
            <section className="py-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold mb-3">What you'll do</h2>
              <p className="whitespace-pre-line text-gray-700">{exp.whatYouWillDo}</p>
            </section>
          )}

          {included.length > 0 && (
            <section className="py-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold mb-3">What's included</h2>
              <ul className="grid sm:grid-cols-2 gap-2">
                {included.map((item) => (
                  <li key={item} className="flex items-center gap-2 text-gray-700">
                    <span aria-hidden="true">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(exp.meetingPoint || hasMap) && (
            <section className="py-6">
              <h2 className="text-xl font-semibold mb-1">Where you'll meet</h2>
              {exp.meetingPoint && <p className="text-gray-600 mb-3">{exp.meetingPoint}</p>}
              {hasMap && (
                <div className="h-64 rounded-2xl overflow-hidden border border-gray-200">
                  <MapContainer
                    center={[Number(exp.latitude), Number(exp.longitude)]}
                    zoom={14}
                    scrollWheelZoom={false}
                    className="w-full h-full z-0"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <CircleMarker
                      center={[Number(exp.latitude), Number(exp.longitude)]}
                      radius={12}
                      pathOptions={{ color: '#f43f5e', fillColor: '#f43f5e', fillOpacity: 0.6 }}
                    />
                  </MapContainer>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Booking card */}
        <aside className="lg:sticky lg:top-28 h-fit border border-gray-200 rounded-2xl shadow-lg p-6 bg-white">
          <p className="text-xl">
            <span className="font-semibold">${price.toFixed(0)}</span>
            <span className="text-gray-500 text-base"> / guest</span>
          </p>

          <div className="mt-4">
            <p className="text-sm font-semibold mb-2">Choose a time</p>
            {slotsByDay.length === 0 ? (
              <p className="text-sm text-gray-500">No upcoming times right now. Check back soon.</p>
            ) : (
              <div className="max-h-72 overflow-y-auto pr-1 space-y-4">
                {slotsByDay.map((group) => (
                  <div key={group.date}>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{dayLabel(group.date)}</p>
                    <div className="space-y-2">
                      {group.slots.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setSelectedSlotId(s.id);
                            setGuests((g) => Math.min(g, s.spotsLeft));
                            setNotice('');
                          }}
                          aria-pressed={selectedSlotId === s.id}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm text-left transition ${
                            selectedSlotId === s.id ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <span className="font-medium">{timeLabel(s.when, exp.durationMinutes)}</span>
                          <span className={s.spotsLeft <= 3 ? 'text-rose-600' : 'text-gray-500'}>
                            {s.spotsLeft} spot{s.spotsLeft === 1 ? '' : 's'} left
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedSlot && (
            <div className="mt-5 flex items-center justify-between">
              <span className="text-sm font-semibold">Guests</span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setGuests((g) => Math.max(1, g - 1))}
                  disabled={guests <= 1}
                  aria-label="Fewer guests"
                  className="w-8 h-8 rounded-full border border-gray-300 disabled:opacity-30"
                >
                  −
                </button>
                <span className="w-5 text-center">{guests}</span>
                <button
                  type="button"
                  onClick={() => setGuests((g) => Math.min(maxGuests, g + 1))}
                  disabled={guests >= maxGuests}
                  aria-label="More guests"
                  className="w-8 h-8 rounded-full border border-gray-300 disabled:opacity-30"
                >
                  +
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={!selectedSlot}
            onClick={() => setNotice('Booking for experiences opens soon. Your spot is not reserved yet.')}
            className="mt-5 w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-xl transition disabled:opacity-40"
          >
            {selectedSlot ? 'Reserve' : 'Choose a time'}
          </button>
          {notice && <p className="text-sm text-gray-600 mt-3 text-center">{notice}</p>}

          {selectedSlot && (
            <div className="mt-5 pt-4 border-t border-gray-200 flex justify-between font-semibold">
              <span>
                ${price.toFixed(0)} × {guests} guest{guests === 1 ? '' : 's'}
              </span>
              <span>${(price * guests).toFixed(2)}</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}