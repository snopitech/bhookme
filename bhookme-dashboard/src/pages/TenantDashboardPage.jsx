import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MessageHostPanel from '../components/MessageHostPanel';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const BOOKING_STATUS_LABELS = {
  PENDING: 'Awaiting payment',
  CONFIRMED: 'Confirmed',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

const BOOKING_STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  COMPLETED: 'bg-blue-100 text-blue-700',
};

function formatDate(dateString) {
  const [y, m, d] = dateString.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'houses', label: 'House Bookings' },
  { id: 'cars', label: 'Car Rentals' },
  { id: 'payments', label: 'Payments & Balance' },
  { id: 'maintenance', label: 'Maintenance & Messages' },
  { id: 'account', label: 'Account' },
];

export default function TenantDashboardPage() {
  const { user, token } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [carBookings, setCarBookings] = useState([]);
  const [carBookingsLoading, setCarBookingsLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [openMessageKey, setOpenMessageKey] = useState(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/bookings/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setBookings(data);
        setBookingsLoading(false);
      })
      .catch(() => {
        setError('Could not load your house bookings.');
        setBookingsLoading(false);
      });
  }, [token]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/car-bookings/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setCarBookings(data);
        setCarBookingsLoading(false);
      })
      .catch(() => {
        setError('Could not load your car rentals.');
        setCarBookingsLoading(false);
      });
  }, [token]);

  const loading = bookingsLoading || carBookingsLoading;

  const upcomingStays = bookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status) && b.checkInDate >= todayString());
  const activeCarRentals = carBookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status) && b.endDate >= todayString());

  const pendingHouseBalance = bookings.filter((b) => b.status === 'PENDING').reduce((sum, b) => sum + Number(b.totalPrice), 0);
  const pendingCarBalance = carBookings.filter((b) => b.status === 'PENDING').reduce((sum, b) => sum + Number(b.totalPrice), 0);
  const totalBalanceDue = pendingHouseBalance + pendingCarBalance;

  const totalSpent = [...bookings, ...carBookings]
    .filter((b) => ['CONFIRMED', 'COMPLETED'].includes(b.status))
    .reduce((sum, b) => sum + Number(b.totalPrice), 0);

  const canCancelHouse = (b) => ['PENDING', 'CONFIRMED'].includes(b.status) && b.checkInDate >= todayString();
  const canCancelCar = (b) => ['PENDING', 'CONFIRMED'].includes(b.status) && b.startDate >= todayString();

  const cancelHouseBooking = async (booking) => {
    if (!window.confirm('Cancel this booking?')) return;
    setCancellingId(`house-${booking.id}`);
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

  const cancelCarBooking = async (booking) => {
    if (!window.confirm('Cancel this car rental?')) return;
    setCancellingId(`car-${booking.id}`);
    try {
      const res = await fetch(`${API_BASE_URL}/car-bookings/${booking.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setCarBookings((prev) => prev.map((b) => (b.id === data.id ? data : b)));
      } else {
        setError(data.message || 'Could not cancel this rental.');
      }
    } catch (err) {
      setError('Could not reach the server.');
    } finally {
      setCancellingId(null);
    }
  };

  const toggleMessage = (key) => {
    setOpenMessageKey((prev) => (prev === key ? null : key));
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">My Dashboard</h1>
        <p className="text-gray-500">Welcome back, {user?.firstName}.</p>
      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {activeTab === 'overview' && (
        <div>
          {loading ? (
            <p className="text-gray-500">Loading your dashboard...</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Upcoming stays</p>
                  <p className="text-2xl font-bold">{upcomingStays.length}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Active car rentals</p>
                  <p className="text-2xl font-bold">{activeCarRentals.length}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Balance due</p>
                  <p className="text-2xl font-bold text-amber-700">${totalBalanceDue.toFixed(2)}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Total spent</p>
                  <p className="text-2xl font-bold text-green-700">${totalSpent.toFixed(2)}</p>
                </div>
              </div>

              <h2 className="text-lg font-semibold mb-3">Next up</h2>
              {upcomingStays.length === 0 && activeCarRentals.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl">
                  <p className="text-gray-500 mb-3">Nothing booked yet.</p>
                  <Link to="/" className="text-rose-500 font-medium hover:underline">Browse homes and cars</Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingStays.slice(0, 3).map((b) => (
                    <div key={`house-${b.id}`} className="flex items-center gap-4 border border-gray-200 rounded-xl p-3">
                      <img src={b.propertyImageUrl || 'https://placehold.co/100x100?text=Stay'} alt={b.propertyTitle} className="w-16 h-16 object-cover rounded-lg bg-gray-200" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{b.propertyTitle}</p>
                        <p className="text-sm text-gray-500">{formatDate(b.checkInDate)} - {formatDate(b.checkOutDate)}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${BOOKING_STATUS_STYLES[b.status]}`}>
                        {BOOKING_STATUS_LABELS[b.status]}
                      </span>
                    </div>
                  ))}
                  {activeCarRentals.slice(0, 3).map((b) => (
                    <div key={`car-${b.id}`} className="flex items-center gap-4 border border-gray-200 rounded-xl p-3">
                      <img src={b.imageUrl || 'https://placehold.co/100x100?text=Car'} alt={`${b.make} ${b.model}`} className="w-16 h-16 object-cover rounded-lg bg-gray-200" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{b.make} {b.model}</p>
                        <p className="text-sm text-gray-500">{formatDate(b.startDate)} - {formatDate(b.endDate)}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${BOOKING_STATUS_STYLES[b.status]}`}>
                        {BOOKING_STATUS_LABELS[b.status]}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'houses' && (
        <div>
          {bookingsLoading && <p className="text-gray-500">Loading...</p>}
          {!bookingsLoading && bookings.length === 0 && (
            <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-500 mb-4">No house bookings yet.</p>
              <Link to="/" className="text-rose-500 font-medium hover:underline">Browse homes</Link>
            </div>
          )}
          <div className="space-y-4">
            {bookings.map((b) => {
              const key = `house-${b.id}`;
              return (
                <div key={b.id} className={`border border-gray-200 rounded-xl p-4 ${b.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link to={`/property/${b.propertyId}`} className="shrink-0">
                      <img src={b.propertyImageUrl || 'https://placehold.co/300x200?text=No+Photo'} alt={b.propertyTitle} className="w-full sm:w-44 h-32 object-cover rounded-lg bg-gray-200" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link to={`/property/${b.propertyId}`} className="font-semibold hover:underline block truncate">{b.propertyTitle}</Link>
                          <p className="text-sm text-gray-500">{b.propertyCity}, {b.propertyState}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${BOOKING_STATUS_STYLES[b.status]}`}>
                          {BOOKING_STATUS_LABELS[b.status]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">
                        {formatDate(b.checkInDate)} to {formatDate(b.checkOutDate)}
                        <span className="text-gray-500"> ({b.totalNights} night{b.totalNights !== 1 ? 's' : ''}, {b.numGuests} guest{b.numGuests !== 1 ? 's' : ''})</span>
                      </p>
                      <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                        <p className="font-semibold">${Number(b.totalPrice).toFixed(2)} total</p>
                        <div className="flex gap-3">
                          <button onClick={() => toggleMessage(key)} className="text-sm text-rose-500 font-medium hover:underline">
                            {openMessageKey === key ? 'Hide messages' : 'Message host'}
                          </button>
                          {canCancelHouse(b) && (
                            <button
                              onClick={() => cancelHouseBooking(b)}
                              disabled={cancellingId === key}
                              className="text-sm text-red-500 font-medium hover:underline disabled:opacity-50"
                            >
                              {cancellingId === key ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {openMessageKey === key && (
                    <div className="mt-3">
                      <MessageHostPanel propertyId={b.propertyId} hostId={b.hostId} hostName={b.propertyTitle} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'cars' && (
        <div>
          {carBookingsLoading && <p className="text-gray-500">Loading...</p>}
          {!carBookingsLoading && carBookings.length === 0 && (
            <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-500 mb-4">No car rentals yet.</p>
              <Link to="/category/car-rental" className="text-rose-500 font-medium hover:underline">Browse cars</Link>
            </div>
          )}
          <div className="space-y-4">
            {carBookings.map((b) => {
              const key = `car-${b.id}`;
              return (
                <div key={b.id} className={`border border-gray-200 rounded-xl p-4 ${b.status === 'CANCELLED' ? 'opacity-60' : ''}`}>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link to={`/car/${b.carId}`} className="shrink-0">
                      <img src={b.imageUrl || 'https://placehold.co/300x200?text=Car'} alt={`${b.make} ${b.model}`} className="w-full sm:w-44 h-32 object-cover rounded-lg bg-gray-200" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link to={`/car/${b.carId}`} className="font-semibold hover:underline block truncate">{b.make} {b.model}</Link>
                        </div>
                        <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${BOOKING_STATUS_STYLES[b.status]}`}>
                          {BOOKING_STATUS_LABELS[b.status]}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">
                        {formatDate(b.startDate)} to {formatDate(b.endDate)}
                        <span className="text-gray-500"> ({b.totalDays} day{b.totalDays !== 1 ? 's' : ''})</span>
                      </p>
                      <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                        <p className="font-semibold">${Number(b.totalPrice).toFixed(2)} total</p>
                        <div className="flex gap-3">
                          <button onClick={() => toggleMessage(key)} className="text-sm text-rose-500 font-medium hover:underline">
                            {openMessageKey === key ? 'Hide messages' : 'Message host'}
                          </button>
                          {canCancelCar(b) && (
                            <button
                              onClick={() => cancelCarBooking(b)}
                              disabled={cancellingId === key}
                              className="text-sm text-red-500 font-medium hover:underline disabled:opacity-50"
                            >
                              {cancellingId === key ? 'Cancelling...' : 'Cancel'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {openMessageKey === key && (
                    <div className="mt-3">
                      <MessageHostPanel carId={b.carId} hostId={b.hostId} hostName={`${b.make} ${b.model}`} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === 'payments' && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Total balance due</p>
              <p className="text-2xl font-bold text-amber-700">${totalBalanceDue.toFixed(2)}</p>
            </div>
            <div className="border border-gray-200 rounded-xl p-4">
              <p className="text-sm text-gray-500">Total paid (confirmed/completed)</p>
              <p className="text-2xl font-bold text-green-700">${totalSpent.toFixed(2)}</p>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm mb-6">
            Online payment isn't connected yet, so "Pay now" can't charge a card today. Every booking below is still being held for you at its quoted price.
          </div>

          <h2 className="text-lg font-semibold mb-3">Awaiting payment</h2>
          <div className="space-y-3">
            {[...bookings.filter((b) => b.status === 'PENDING').map((b) => ({ ...b, kind: 'house', label: b.propertyTitle })),
              ...carBookings.filter((b) => b.status === 'PENDING').map((b) => ({ ...b, kind: 'car', label: `${b.make} ${b.model}` }))]
              .map((b) => (
                <div key={`${b.kind}-${b.id}`} className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl p-4">
                  <div>
                    <p className="font-medium">{b.label}</p>
                    <p className="text-sm text-gray-500">
                      {b.kind === 'house' ? `${formatDate(b.checkInDate)} - ${formatDate(b.checkOutDate)}` : `${formatDate(b.startDate)} - ${formatDate(b.endDate)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="font-semibold">${Number(b.totalPrice).toFixed(2)}</p>
                    <button disabled className="bg-gray-300 text-gray-500 text-sm font-medium px-4 py-2 rounded-lg cursor-not-allowed">
                      Pay now
                    </button>
                  </div>
                </div>
              ))}
            {totalBalanceDue === 0 && !loading && (
              <p className="text-gray-500">Nothing awaiting payment right now.</p>
            )}
          </div>
        </div>
      )}

      {activeTab === 'maintenance' && (
        <div>
          <p className="text-gray-500 mb-4">Reach out to your host about any active or upcoming booking.</p>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : upcomingStays.length === 0 && activeCarRentals.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-500">No active bookings to message a host about yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingStays.map((b) => (
                <div key={`msg-house-${b.id}`} className="border border-gray-200 rounded-xl p-4">
                  <p className="font-medium mb-2">{b.propertyTitle}</p>
                  <MessageHostPanel propertyId={b.propertyId} hostId={b.hostId} hostName={b.propertyTitle} />
                </div>
              ))}
              {activeCarRentals.map((b) => (
                <div key={`msg-car-${b.id}`} className="border border-gray-200 rounded-xl p-4">
                  <p className="font-medium mb-2">{b.make} {b.model}</p>
                  <MessageHostPanel carId={b.carId} hostId={b.hostId} hostName={`${b.make} ${b.model}`} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'account' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link to="/profile" className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition">
            <p className="font-semibold mb-1">Profile</p>
            <p className="text-sm text-gray-500">Update your name, phone, and date of birth.</p>
          </Link>
          <Link to="/wishlist" className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition">
            <p className="font-semibold mb-1">Wishlist</p>
            <p className="text-sm text-gray-500">Places and cars you've saved.</p>
          </Link>
          <Link to="/become-host" className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition">
            <p className="font-semibold mb-1">Become a host</p>
            <p className="text-sm text-gray-500">List your own place or car on bhookme.</p>
          </Link>
        </div>
      )}
    </div>
  );
}