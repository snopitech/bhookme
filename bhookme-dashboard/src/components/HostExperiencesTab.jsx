import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { EXPERIENCE_CATEGORIES, findExperienceCategory, formatDuration } from '../data/experienceCategories';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const STATUS_STYLES = {
  ACTIVE: 'bg-green-100 text-green-700',
  PAUSED: 'bg-gray-100 text-gray-600',
};

const DURATION_OPTIONS = [30, 45, 60, 90, 120, 150, 180, 240, 300, 360, 480];

const EMPTY_FORM = {
  title: '',
  category: '',
  city: '',
  state: '',
  meetingPoint: '',
  durationMinutes: 120,
  pricePerPerson: '',
  maxGuests: 8,
  language: 'English',
  description: '',
  whatYouWillDo: '',
  whatsIncluded: '',
  photoLinks: '',
};

const inputClass =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500';

function formatSlot(iso) {
  const [date, time] = iso.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

async function apiCall(path, token, options = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `Request failed (status ${res.status}).`);
  return data;
}

function Field({ label, hint, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

function ExperienceForm({ token, initial, onSaved, onCancel }) {
  const [form, setForm] = useState(() =>
    initial
      ? {
          ...EMPTY_FORM,
          ...Object.fromEntries(Object.keys(EMPTY_FORM).map((k) => [k, initial[k] ?? EMPTY_FORM[k]])),
          pricePerPerson: initial.pricePerPerson != null ? String(Number(initial.pricePerPerson)) : '',
          photoLinks: (initial.imageUrls || []).join('\n'),
        }
      : EMPTY_FORM
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  const photos = form.photoLinks
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    const { photoLinks, ...rest } = form;
    try {
      const saved = await apiCall(initial ? `/experiences/${initial.id}` : '/experiences', token, {
        method: initial ? 'PUT' : 'POST',
        body: JSON.stringify({ ...rest, imageUrls: photos }),
      });
      onSaved(saved);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Title" className="sm:col-span-2">
          <input className={inputClass} value={form.title} onChange={set('title')} maxLength={150} required placeholder="Sunset kayak tour on Lake Conroe" />
        </Field>
        <Field label="Category">
          <select className={inputClass} value={form.category} onChange={set('category')} required>
            <option value="">Pick a category</option>
            {EXPERIENCE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Language">
          <input className={inputClass} value={form.language} onChange={set('language')} />
        </Field>
        <Field label="City">
          <input className={inputClass} value={form.city} onChange={set('city')} required placeholder="Houston" />
        </Field>
        <Field label="State">
          <input className={inputClass} value={form.state} onChange={set('state')} placeholder="TX" />
        </Field>
        <Field label="Meeting point" hint="Where guests meet you" className="sm:col-span-2">
          <input className={inputClass} value={form.meetingPoint} onChange={set('meetingPoint')} placeholder="Main entrance, Discovery Green park" />
        </Field>
        <Field label="Duration">
          <select className={inputClass} value={form.durationMinutes} onChange={set('durationMinutes')}>
            {DURATION_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {formatDuration(m)}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Price per person ($)">
            <input type="number" min="1" step="1" className={inputClass} value={form.pricePerPerson} onChange={set('pricePerPerson')} required />
          </Field>
          <Field label="Max guests">
            <input type="number" min="1" max="100" className={inputClass} value={form.maxGuests} onChange={set('maxGuests')} required />
          </Field>
        </div>
        <Field label="Short description" className="sm:col-span-2">
          <textarea rows={3} className={inputClass} value={form.description} onChange={set('description')} placeholder="A one-paragraph pitch for your experience" />
        </Field>
        <Field label="What you'll do" className="sm:col-span-2">
          <textarea rows={4} className={inputClass} value={form.whatYouWillDo} onChange={set('whatYouWillDo')} placeholder="Walk guests through the plan, step by step" />
        </Field>
        <Field label="What's included" hint="One item per line, e.g. Snacks, Equipment, Photos" className="sm:col-span-2">
          <textarea rows={3} className={inputClass} value={form.whatsIncluded} onChange={set('whatsIncluded')} />
        </Field>
        <Field
          label="Photo links"
          hint="Paste one image link per line (https://...). The first photo is the cover. Direct photo upload is coming later."
          className="sm:col-span-2"
        >
          <textarea rows={3} className={inputClass} value={form.photoLinks} onChange={set('photoLinks')} />
        </Field>
      </div>

      {photos.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {photos.slice(0, 10).map((url, i) => (
            <div key={url} className="relative shrink-0">
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className="w-28 h-20 object-cover rounded-lg bg-gray-100 border border-gray-200"
                onError={(e) => {
                  e.currentTarget.style.opacity = '0.3';
                }}
              />
              {i === 0 && (
                <span className="absolute top-1 left-1 bg-white text-xs font-semibold px-1.5 py-0.5 rounded">Cover</span>
              )}
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 py-2.5 rounded-lg transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : initial ? 'Save changes' : 'Create experience'}
        </button>
        <button type="button" onClick={onCancel} className="px-5 py-2.5 rounded-lg border border-gray-300 font-medium hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

function SlotManager({ token, experience, onChanged }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [capacity, setCapacity] = useState(String(experience.maxGuests));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const slots = experience.slots || [];

  const add = async () => {
    if (!date || !time) {
      setError('Pick a date and a start time.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const updated = await apiCall(`/experiences/${experience.id}/slots`, token, {
        method: 'POST',
        body: JSON.stringify({ startTime: `${date}T${time}`, capacity: Number(capacity) }),
      });
      onChanged({ ...experience, slots: updated });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (slotId) => {
    setBusy(true);
    setError('');
    try {
      const updated = await apiCall(`/experiences/${experience.id}/slots/${slotId}`, token, { method: 'DELETE' });
      onChanged({ ...experience, slots: updated });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="font-semibold text-sm mb-3">Available times</p>
      <div className="flex flex-wrap items-end gap-2 mb-3">
        <Field label="Date">
          <input type="date" min={todayISO()} className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Start time">
          <input type="time" className={inputClass} value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Spots">
          <input
            type="number"
            min="1"
            max={experience.maxGuests}
            className={`${inputClass} w-20`}
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
          />
        </Field>
        <button
          type="button"
          onClick={add}
          disabled={busy}
          className="bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
        >
          Add time
        </button>
      </div>
      {error && <p className="text-red-500 text-sm mb-2">{error}</p>}
      {slots.length === 0 ? (
        <p className="text-sm text-gray-500">
          No upcoming times yet. Guests can only find and book your experience once it has at least one.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
          {slots.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>{formatSlot(s.startTime)}</span>
              <span className="text-gray-500">
                {s.bookedCount} booked · {s.spotsLeft} left
              </span>
              <button
                type="button"
                onClick={() => remove(s.id)}
                disabled={busy || s.bookedCount > 0}
                title={s.bookedCount > 0 ? 'Guests have booked this time' : 'Remove this time'}
                className="text-rose-500 font-medium hover:underline disabled:text-gray-300 disabled:no-underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function HostExperiencesTab() {
  const { token } = useAuth();
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mode, setMode] = useState(null); // null | 'create' | { edit: experience }
  const [openSlotsId, setOpenSlotsId] = useState(null);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    apiCall('/experiences/mine', token)
      .then((data) => setExperiences(Array.isArray(data) ? data : []))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const replace = (updated) => setExperiences((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));

  const handleSaved = (saved) => {
    if (mode === 'create') {
      setExperiences((prev) => [saved, ...prev]);
      setOpenSlotsId(saved.id); // next step: add times
    } else {
      replace(saved);
    }
    setMode(null);
  };

  const toggleStatus = async (exp) => {
    setActionError('');
    try {
      const updated = await apiCall(`/experiences/${exp.id}/status`, token, {
        method: 'PUT',
        body: JSON.stringify({ status: exp.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' }),
      });
      replace(updated);
    } catch (err) {
      setActionError(err.message);
    }
  };

  const remove = async (exp) => {
    if (!window.confirm(`Delete "${exp.title}"? This can't be undone.`)) return;
    setActionError('');
    try {
      await apiCall(`/experiences/${exp.id}`, token, { method: 'DELETE' });
      setExperiences((prev) => prev.filter((x) => x.id !== exp.id));
    } catch (err) {
      setActionError(err.message);
    }
  };

  if (mode) {
    const editing = mode !== 'create' ? mode.edit : null;
    return (
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold mb-4">{editing ? 'Edit experience' : 'Create an experience'}</h2>
        <ExperienceForm token={token} initial={editing} onSaved={handleSaved} onCancel={() => setMode(null)} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <p className="text-sm text-gray-500">
          Host tours, classes, food, and more. Guests book a spot at one of your times.
        </p>
        <button
          onClick={() => setMode('create')}
          className="shrink-0 bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 py-2.5 rounded-lg transition"
        >
          + Add experience
        </button>
      </div>

      {loading && <p className="text-gray-500">Loading your experiences...</p>}
      {error && <p className="text-red-500">{error}</p>}
      {actionError && <p className="text-red-500 mb-3">{actionError}</p>}

      {!loading && !error && experiences.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-4xl mb-3" aria-hidden="true">🎟️</p>
          <p className="text-gray-500 mb-4">You haven't created any experiences yet.</p>
          <button onClick={() => setMode('create')} className="text-rose-500 font-medium hover:underline">
            Create your first experience
          </button>
        </div>
      )}

      <div className="space-y-4">
        {experiences.map((exp) => {
          const cat = findExperienceCategory(exp.category);
          const cover = exp.imageUrls?.[0] || exp.imageUrl;
          const upcoming = exp.slots?.length || 0;
          return (
            <div key={exp.id} className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="flex flex-col sm:flex-row gap-4">
                {cover ? (
                  <img src={cover} alt={exp.title} className="w-full sm:w-40 h-28 object-cover rounded-lg bg-gray-100 shrink-0" />
                ) : (
                  <div className="w-full sm:w-40 h-28 rounded-lg bg-gray-100 shrink-0 flex items-center justify-center text-4xl" aria-hidden="true">
                    {cat?.icon || '🎟️'}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{exp.title}</p>
                      <p className="text-sm text-gray-500">
                        {cat ? `${cat.label} · ` : ''}
                        {exp.city}
                        {exp.state ? `, ${exp.state}` : ''} · {formatDuration(exp.durationMinutes)}
                      </p>
                    </div>
                    <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[exp.status] || 'bg-gray-100 text-gray-700'}`}>
                      {exp.status === 'ACTIVE' ? 'Live' : 'Paused'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm">
                    <span className="font-semibold">${Number(exp.pricePerPerson).toFixed(0)}</span> per person · up to {exp.maxGuests} guests
                  </p>
                  <p className={`text-sm mt-1 ${upcoming ? 'text-gray-500' : 'text-amber-700'}`}>
                    {upcoming
                      ? `${upcoming} upcoming time${upcoming === 1 ? '' : 's'}`
                      : 'No upcoming times. Add one so guests can book.'}
                  </p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-sm font-medium">
                    <button onClick={() => setOpenSlotsId(openSlotsId === exp.id ? null : exp.id)} className="text-gray-900 hover:underline">
                      {openSlotsId === exp.id ? 'Hide times' : 'Manage times'}
                    </button>
                    <button onClick={() => setMode({ edit: exp })} className="text-gray-900 hover:underline">
                      Edit
                    </button>
                    <button onClick={() => toggleStatus(exp)} className="text-gray-900 hover:underline">
                      {exp.status === 'ACTIVE' ? 'Pause' : 'Make live'}
                    </button>
                    <button onClick={() => remove(exp)} className="text-rose-500 hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
              </div>
              {openSlotsId === exp.id && <SlotManager token={token} experience={exp} onChanged={replace} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}