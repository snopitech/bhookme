import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import BookingChatPanel from './BookingChatPanel';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const BOOKINGS_PER_PAGE = 5;

const STATUS_LABELS = {
  PENDING: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

const STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-blue-100 text-blue-700',
};

const DECLINE_REASONS = [
  'Dates already taken',
  'Listing no longer available',
  'Unable to host these dates',
  'Other',
];

function formatDate(dateString) {
  if (!dateString) return '';
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function BookingRow({ booking, kind, token, onUpdated, onError, onOpenChat }) {
  const [busy, setBusy] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState(DECLINE_REASONS[0]);
  const [customReason, setCustomReason] = useState('');

  const isHouse = kind === 'house';
  const base = isHouse ? 'bookings' : 'car-bookings';

  const title = isHouse ? booking.propertyTitle : `${booking.make} ${booking.model}`;
  const link = isHouse ? `/property/${booking.propertyId}` : `/car/${booking.carId}`;
  const image = isHouse ? booking.propertyImageUrl : booking.imageUrl;
  const startDate = isHouse ? booking.checkInDate : booking.startDate;
  const endDate = isHouse ? booking.checkOutDate : booking.endDate;
  const guestName = [booking.guestFirstName, booking.guestLastName].filter(Boolean).join(' ');
  const spanLabel = isHouse
    ? `${booking.totalNights} night${booking.totalNights !== 1 ? 's' : ''}, ${booking.numGuests} guest${booking.numGuests !== 1 ? 's' : ''}`
    : `${booking.totalDays} day${booking.totalDays !== 1 ? 's' : ''}`;

  const call = async (url, body, method = 'PUT') => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Something went wrong.');
      onUpdated(data);
      return true;
    } catch (err) {
      onError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setPaid = (paid) => call(`${API_BASE_URL}/${base}/${booking.id}/paid`, { paid });
  const setConfirmed = (status) => call(`${API_BASE_URL}/${base}/${booking.id}/confirm`, { status });

  const submitDecline = async () => {
    const reason = declineReason === 'Other' ? customReason.trim() : declineReason;
    const ok = await call(`${API_BASE_URL}/${base}/${booking.id}/decline`, { reason });
    if (ok) {
      setDeclineOpen(false);
      setCustomReason('');
      setDeclineReason(DECLINE_REASONS[0]);
    }
  };

  const isCancelled = booking.status === 'CANCELLED';
  const isCompleted = booking.status === 'COMPLETED';
  const canMessage = !isCancelled && !!booking.guestUserId;

  return (
    <div className={`border border-gray-200 rounded-xl p-4 ${isCancelled ? 'opacity-60' : ''}`}>
      <div className="flex flex-col sm:flex-row gap-4">
        {image ? (
          <img
            src={image}
            alt={title}
            className="w-full sm:w-40 h-28 object-cover rounded-lg bg-gray-200 shrink-0"
          />
        ) : (
          <div className="w-full sm:w-40 h-28 rounded-lg bg-gray-100 flex items-center justify-center text-3xl shrink-0">
            {isHouse ? '🏠' : '🚗'}
          </div>
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">{isHouse ? '🏠' : '🚗'}</span>
                <Link to={link} className="font-semibold hover:underline block truncate">
                  {title}
                </Link>
              </div>
              <p className="text-sm text-gray-500">Guest: {guestName || '—'}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATUS_STYLES[booking.status] || 'bg-gray-100 text-gray-700'}`}>
                {STATUS_LABELS[booking.status] || booking.status}
              </span>
              {booking.paid && (
                <span className="text-xs font-medium text-green-700">Paid</span>
              )}
            </div>
          </div>

          <p className="mt-2 text-sm">
            {formatDate(startDate)} to {formatDate(endDate)}
            <span className="text-gray-500"> ({spanLabel})</span>
          </p>
          <p className="mt-1 font-semibold">${Number(booking.totalPrice).toFixed(2)} total</p>

          {(canMessage || (!isCancelled && !isCompleted)) && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-sm font-medium">
              {canMessage && (
                <button
                  type="button"
                  onClick={onOpenChat}
                  className="inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50"
                >
                  <span aria-hidden="true">💬</span>
                  Message guest
                </button>
              )}

              {!isCancelled && !isCompleted && (
                <>
                  {booking.paid ? (
                    <button
                      type="button"
                      onClick={() => setPaid(false)}
                      disabled={busy}
                      className="text-gray-500 hover:underline disabled:opacity-50"
                    >
                      Unmark paid
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPaid(true)}
                      disabled={busy}
                      className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      Mark as paid
                    </button>
                  )}

                  {booking.paid && booking.status !== 'CONFIRMED' && (
                    <button
                      type="button"
                      onClick={() => setConfirmed('CONFIRMED')}
                      disabled={busy}
                      className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
                    >
                      Confirm
                    </button>
                  )}
                  {booking.status === 'CONFIRMED' && (
                    <button
                      type="button"
                      onClick={() => setConfirmed('PENDING')}
                      disabled={busy}
                      className="text-gray-500 hover:underline disabled:opacity-50"
                    >
                      Unconfirm
                    </button>
                  )}

                  {!declineOpen && (
                    <button
                      type="button"
                      onClick={() => setDeclineOpen(true)}
                      disabled={busy}
                      className="text-red-600 hover:underline disabled:opacity-50"
                    >
                      Decline
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {declineOpen && (
            <div className="mt-3 p-3 border border-red-200 bg-red-50 rounded-lg">
              <p className="text-sm font-medium text-red-800 mb-2">Decline this booking?</p>
              <p className="text-xs text-red-700 mb-2">
                {booking.paid
                  ? 'The guest has been marked paid. They will receive a decline email that mentions a refund.'
                  : 'The guest will receive a decline email.'}
              </p>
              <select
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm bg-white mb-2"
              >
                {DECLINE_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {declineReason === 'Other' && (
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Brief reason the guest will see"
                  maxLength={200}
                  className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm bg-white mb-2"
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={submitDecline}
                  disabled={busy || (declineReason === 'Other' && !customReason.trim())}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50"
                >
                  {busy ? 'Declining...' : 'Decline and email guest'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeclineOpen(false);
                    setCustomReason('');
                    setDeclineReason(DECLINE_REASONS[0]);
                  }}
                  className="text-sm font-medium px-4 py-1.5 rounded-lg border border-gray-300 hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HostBookingsTab() {
  const { token } = useAuth();
  const [houseBookings, setHouseBookings] = useState([]);
  const [carBookings, setCarBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [chatTarget, setChatTarget] = useState(null); // { booking, kind }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([
      fetch(`${API_BASE_URL}/bookings/host`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
      fetch(`${API_BASE_URL}/car-bookings/host`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []),
    ])
      .then(([houses, cars]) => {
        if (cancelled) return;
        setHouseBookings(Array.isArray(houses) ? houses : []);
        setCarBookings(Array.isArray(cars) ? cars : []);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your bookings.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const merged = useMemo(
    () =>
      [
        ...houseBookings.map((b) => ({ ...b, kind: 'house' })),
        ...carBookings.map((b) => ({ ...b, kind: 'car' })),
      ].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')),
    [houseBookings, carBookings]
  );

  const pageCount = Math.max(1, Math.ceil(merged.length / BOOKINGS_PER_PAGE));

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paginated = merged.slice((page - 1) * BOOKINGS_PER_PAGE, page * BOOKINGS_PER_PAGE);

  const replaceInList = (kind, updated) => {
    const setter = kind === 'house' ? setHouseBookings : setCarBookings;
    setter((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
  };

  if (loading) return <p className="text-gray-500">Loading bookings...</p>;

  return (
    <div>
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {!error && merged.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-gray-500">
            No bookings yet. When a guest reserves one of your listings or cars, it shows up here.
          </p>
        </div>
      )}

      {!error && merged.length > 0 && (
        <>
          <div className="space-y-4">
            {paginated.map((booking) => (
              <BookingRow
                key={`${booking.kind}-${booking.id}`}
                booking={booking}
                kind={booking.kind}
                token={token}
                onUpdated={(updated) => replaceInList(booking.kind, updated)}
                onError={(msg) => setError(msg)}
                onOpenChat={() => setChatTarget({ booking, kind: booking.kind })}
              />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <p className="text-gray-500">
                Showing {(page - 1) * BOOKINGS_PER_PAGE + 1}
                {'\u2013'}
                {Math.min(page * BOOKINGS_PER_PAGE, merged.length)} of {merged.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Previous
                </button>
                <span className="text-gray-600">
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {chatTarget && (
        <BookingChatPanel
          booking={chatTarget.booking}
          kind={chatTarget.kind}
          onClose={() => setChatTarget(null)}
        />
      )}
    </div>
  );
}