import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const PAGE_SIZE = 7;

const LISTING_STATUS_STYLES = {
  ACTIVE: 'bg-green-100 text-green-700',
  PENDING: 'bg-amber-100 text-amber-700',
  INACTIVE: 'bg-gray-100 text-gray-600',
  REJECTED: 'bg-red-100 text-red-700',
};

// Returns the first non-empty value among the given keys.
export function pick(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

export function listingTitle(row, type) {
  const title = pick(row, ['title', 'name', 'listing_name']);
  if (title) return title;
  if (type === 'cars') {
    const parts = [pick(row, ['year']), pick(row, ['make', 'brand']), pick(row, ['model'])].filter(Boolean);
    if (parts.length) return parts.join(' ');
  }
  return `#${row.id}`;
}

export function listingLocation(row) {
  return [pick(row, ['city']), pick(row, ['state', 'region'])].filter(Boolean).join(', ');
}

export function listingPrice(row, type) {
  const price =
    type === 'cars'
      ? pick(row, ['price_per_day', 'daily_rate', 'price'])
      : pick(row, ['price_per_night', 'base_price_per_night', 'nightly_rate', 'price']);
  if (price === null) return null;
  const num = Number(price);
  const formatted = Number.isFinite(num) ? `$${num.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : price;
  return `${formatted} / ${type === 'cars' ? 'day' : 'night'}`;
}

export function formatRating(value) {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(1) : null;
}

export function ListingStatusBadge({ status }) {
  if (!status) return <span className="text-gray-400">—</span>;
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${LISTING_STATUS_STYLES[status] || 'bg-gray-100 text-gray-700'}`}>
      {status}
    </span>
  );
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export default function ListingsTab({ type }) {
  const { token } = useAuth();
  const noun = type === 'cars' ? 'car' : 'house';

  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const [notice, setNotice] = useState(null); // { ok, text }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setSearch('');
    setStatusFilter('ALL');
    setPage(1);
    setNotice(null);

    fetch(`${API_BASE_URL}/admin/listings/${type}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.message) || `Could not load ${noun} listings (status ${res.status}).`);
        }
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setListings(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || `Could not load ${noun} listings.`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, type, noun]);

  const statuses = useMemo(() => {
    const set = new Set(listings.map((l) => l.status).filter(Boolean));
    return ['ALL', ...Array.from(set)];
  }, [listings]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return listings.filter((l) => {
      if (statusFilter !== 'ALL' && l.status !== statusFilter) return false;
      if (!term) return true;
      const haystack = [listingTitle(l, type), listingLocation(l), l.hostName, l.hostEmail]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [listings, search, statusFilter, type]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Admin delete: show exactly what else goes with it, then delete.
  const handleDelete = async (listing) => {
    const title = listingTitle(listing, type);
    setNotice(null);
    setDeletingId(listing.id);
    try {
      const previewRes = await fetch(`${API_BASE_URL}/admin/listings/${type}/${listing.id}/delete-preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const preview = await previewRes.json().catch(() => null);
      if (!previewRes.ok) throw new Error((preview && preview.message) || 'Could not check this listing.');

      const lines = [`Delete "${title}" permanently?`, ''];
      if (preview.bookings > 0) {
        lines.push(
          `This ${noun} has ${plural(preview.bookings, 'booking')}` +
            (preview.upcomingBookings > 0 ? ` (${preview.upcomingBookings} UPCOMING)` : '') +
            '.'
        );
      }
      const extras = [];
      if (preview.bookings > 0) extras.push(plural(preview.bookings, 'booking'));
      if (preview.reviews > 0) extras.push(plural(preview.reviews, 'review'));
      if (preview.messages > 0) extras.push(plural(preview.messages, 'message'));
      if (extras.length) {
        lines.push(`Deleting it will ALSO permanently delete: ${extras.join(', ')}.`);
      }
      if (preview.upcomingBookings > 0) {
        lines.push('', 'Guests with upcoming bookings will lose their reservation. Consider contacting them first.');
      }
      lines.push('', "This can't be undone.");

      if (!window.confirm(lines.join('\n'))) return;

      const res = await fetch(`${API_BASE_URL}/admin/listings/${type}/${listing.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not delete this listing.');

      setListings((prev) => prev.filter((l) => l.id !== listing.id));
      setNotice({ ok: true, text: `"${title}" was deleted.` });
    } catch (err) {
      setNotice({ ok: false, text: err.message });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by title, city, or host"
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
        {statuses.length > 2 && (
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : s}
              </option>
            ))}
          </select>
        )}
        {!loading && (
          <p className="text-sm text-gray-500 sm:ml-auto">
            {filtered.length} {filtered.length === 1 ? `${noun} listing` : `${noun} listings`}
          </p>
        )}
      </div>

      {notice && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm border ${
            notice.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
          }`}
          role="status"
        >
          {notice.text}
        </div>
      )}

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && !error && listings.length === 0 && (
        <p className="text-gray-500">No {noun} listings yet. They'll show here once hosts post them.</p>
      )}
      {!loading && listings.length > 0 && filtered.length === 0 && (
        <p className="text-gray-500">No {noun} listings match your search.</p>
      )}

      {!loading && pageRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-medium">Listing</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Host</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Bookings</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.map((l) => (
                <tr key={l.id}>
                  <td className="px-4 py-3 font-semibold">{listingTitle(l, type)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {listingLocation(l) || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <p className="whitespace-nowrap">{l.hostName?.trim() || '—'}</p>
                    {l.hostEmail && <p className="text-xs text-gray-500">{l.hostEmail}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {listingPrice(l, type) || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">{l.bookingCount ?? 0}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {formatRating(l.avgRating) ? (
                      <span className="text-amber-500">★ <span className="text-gray-700">{formatRating(l.avgRating)}</span></span>
                    ) : (
                      <span className="text-xs text-gray-400">No reviews</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <ListingStatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleDelete(l)}
                      disabled={deletingId !== null}
                      className="text-red-600 font-medium hover:underline disabled:opacity-50"
                    >
                      {deletingId === l.id ? 'Working...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm">
          <button
            onClick={() => setPage(currentPage - 1)}
            disabled={currentPage === 1}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-gray-500">
            Page {currentPage} of {totalPages}
          </span>
          <button
            onClick={() => setPage(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="px-3 py-2 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}