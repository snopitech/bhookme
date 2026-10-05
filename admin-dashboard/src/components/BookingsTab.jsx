import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const PAGE_SIZE = 8;

// Colored pill per booking status. Both house (enum) and car (varchar)
// statuses come through as strings from the backend.
const STATUS_STYLES = {
  PENDING:   'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-gray-100 text-gray-700',
};

function formatDate(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function formatMoney(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `$${n.toFixed(2)}`;
}

function BookingDetails({ booking }) {
  return (
    <div className="grid md:grid-cols-2 gap-4 text-sm">
      <div className="space-y-1.5">
        <p>
          <span className="text-gray-500">Guest:</span>{' '}
          <span className="font-medium">{booking.guestName || '—'}</span>
        </p>
        <p>
          <span className="text-gray-500">Email:</span>{' '}
          <a href={`mailto:${booking.guestEmail}`} className="text-blue-600 hover:underline">
            {booking.guestEmail || '—'}
          </a>
        </p>
        <p>
          <span className="text-gray-500">Phone:</span> {booking.guestPhone || '—'}
        </p>
      </div>
      <div className="space-y-1.5">
        <p>
          <span className="text-gray-500">Listing:</span>{' '}
          <span className="font-medium">{booking.listingTitle || '—'}</span>
        </p>
        <p>
          <span className="text-gray-500">Location:</span> {booking.listingLocation || '—'}
        </p>
        <p>
          <span className="text-gray-500">Dates:</span>{' '}
          {formatDate(booking.startDate)} → {formatDate(booking.endDate)}
        </p>
        {booking.type === 'HOUSE' && booking.guests != null && (
          <p>
            <span className="text-gray-500">Guests:</span> {booking.guests}
          </p>
        )}
        <p>
          <span className="text-gray-500">Total:</span>{' '}
          <span className="font-semibold">{formatMoney(booking.totalPrice)}</span>
        </p>
        <p>
          <span className="text-gray-500">Booked on:</span> {formatDate(booking.createdAt)}
        </p>
      </div>
    </div>
  );
}

export default function BookingsTab() {
  const { token } = useAuth();

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`${API_BASE_URL}/admin/bookings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.message) || `Could not load bookings (status ${res.status}).`);
        }
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setBookings(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load bookings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return bookings.filter((b) => {
      if (typeFilter !== 'ALL' && b.type !== typeFilter) return false;
      if (statusFilter !== 'ALL' && b.status !== statusFilter) return false;
      if (!term) return true;
      const haystack = `${b.guestName || ''} ${b.guestEmail || ''} ${b.listingTitle || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [bookings, search, typeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Summary numbers
  const houseCount = bookings.filter((b) => b.type === 'HOUSE').length;
  const carCount = bookings.filter((b) => b.type === 'CAR').length;
  const pendingCount = bookings.filter((b) => b.status === 'PENDING').length;

  const statusesPresent = useMemo(() => {
    const set = new Set(bookings.map((b) => b.status).filter(Boolean));
    return ['ALL', ...Array.from(set).sort()];
  }, [bookings]);

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Total bookings</p>
          <p className="text-2xl font-bold">{loading ? '...' : bookings.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">House</p>
          <p className="text-2xl font-bold">{loading ? '...' : houseCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Car</p>
          <p className="text-2xl font-bold">{loading ? '...' : carCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold">{loading ? '...' : pendingCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search guest, email, or listing"
            className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="ALL">All types</option>
            <option value="HOUSE">Houses</option>
            <option value="CAR">Cars</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            {statusesPresent.map((s) => (
              <option key={s} value={s}>
                {s === 'ALL' ? 'All statuses' : s}
              </option>
            ))}
          </select>
        </div>
        {!loading && (
          <p className="text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? 'booking' : 'bookings'}
            {filtered.length !== bookings.length && ` of ${bookings.length}`}
          </p>
        )}
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && !error && bookings.length === 0 && (
        <p className="text-gray-500">No bookings yet.</p>
      )}
      {!loading && bookings.length > 0 && filtered.length === 0 && (
        <p className="text-gray-500">No bookings match those filters.</p>
      )}

      {/* Table */}
      {!loading && pageRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Guest</th>
                <th className="px-4 py-3 font-medium">Listing</th>
                <th className="px-4 py-3 font-medium">Dates</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.map((b) => {
                const expanded = expandedId === `${b.type}-${b.id}`;
                return (
                  <React.Fragment key={`${b.type}-${b.id}`}>
                    <tr>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            b.type === 'HOUSE'
                              ? 'bg-indigo-100 text-indigo-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {b.type === 'HOUSE' ? '🏠 House' : '🚗 Car'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold whitespace-nowrap">{b.guestName || '—'}</p>
                        <p className="text-xs text-gray-500 truncate max-w-[220px]">{b.guestEmail || '—'}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium">{b.listingTitle || '—'}</p>
                        <p className="text-xs text-gray-500">{b.listingLocation || ''}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                        {formatDate(b.startDate)} → {formatDate(b.endDate)}
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">
                        {formatMoney(b.totalPrice)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            STATUS_STYLES[b.status] || 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {b.status || '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setExpandedId(expanded ? null : `${b.type}-${b.id}`)}
                          className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50"
                        >
                          {expanded ? 'Hide booking' : 'View booking'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 bg-gray-50">
                          <BookingDetails booking={b} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
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