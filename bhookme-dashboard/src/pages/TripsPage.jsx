import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

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

function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function TripsPage() {
  const { token } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/bookings/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load trips');
        return res.json();
      })
      .then((data) => {
        setBookings(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load your trips.');
        setLoading(false);
      });
  }, [token]);

  const canCancel = (booking) =>
    (booking.status === 'PENDING' || booking.status === 'CONFIRMED') &&
    booking.checkInDate >= todayString();

  const handleCancel = async (booking) => {
    if (!window.confirm('Cancel this booking?')) return;

    setError('');
    setCancellingId(booking.id);

    try {
      const res = await fetch(`${API_BASE_URL}/bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        setBookings((prev) => prev.map((b) => (b.id === data.id ? data : b)));
      } else {
        setError(data.message || 'Could not cancel this booking.');
      }
    } catch (err) {
      setError('Could not reach the server.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Trips</h1>

      {loading && <p className="text-gray-500">Loading your trips...</p>}
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {!loading && bookings.length === 0 && !error && (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-gray-500 mb-4">No trips yet. When you reserve a place, it shows up here.</p>
          <Link to="/" className="text-rose-500 font-medium hover:underline">
            Browse homes
          </Link>
        </div>
      )}

      <div className="space-y-4">
        {bookings.map((booking) => (
          <div
            key={booking.id}
            className={`flex flex-col sm:flex-row gap-4 border border-gray-200 rounded-xl p-4 ${
              booking.status === 'CANCELLED' ? 'opacity-60' : ''
            }`}
          >
            <Link to={`/property/${booking.propertyId}`} className="shrink-0">
              <img
                src={booking.propertyImageUrl || 'https://placehold.co/300x200?text=No+Photo'}
                alt={booking.propertyTitle}
                className="w-full sm:w-44 h-32 object-cover rounded-lg bg-gray-200"
              />
            </Link>

            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <Link
                    to={`/property/${booking.propertyId}`}
                    className="font-semibold hover:underline block truncate"
                  >
                    {booking.propertyTitle}
                  </Link>
                  <p className="text-sm text-gray-500">
                    {booking.propertyCity}, {booking.propertyState}
                  </p>
                </div>
                <span
                  className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${
                    STATUS_STYLES[booking.status] || 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {STATUS_LABELS[booking.status] || booking.status}
                </span>
              </div>

              <p className="mt-2 text-sm">
                {formatDate(booking.checkInDate)} to {formatDate(booking.checkOutDate)}
                <span className="text-gray-500">
                  {' '}
                  ({booking.totalNights} night{booking.totalNights !== 1 ? 's' : ''},{' '}
                  {booking.numGuests} guest{booking.numGuests !== 1 ? 's' : ''})
                </span>
              </p>

              <div className="mt-2 flex items-center justify-between">
                <p className="font-semibold">${Number(booking.totalPrice).toFixed(2)} total</p>
                {canCancel(booking) && (
                  <button
                    onClick={() => handleCancel(booking)}
                    disabled={cancellingId === booking.id}
                    className="text-sm text-rose-500 font-medium hover:underline disabled:opacity-50"
                  >
                    {cancellingId === booking.id ? 'Cancelling...' : 'Cancel booking'}
                  </button>
                )}
              </div>

              {booking.status === 'PENDING' && (
                <p className="mt-2 text-xs text-gray-500">
                  Payment isn't connected yet, so nothing has been charged. These dates are being held for you.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}