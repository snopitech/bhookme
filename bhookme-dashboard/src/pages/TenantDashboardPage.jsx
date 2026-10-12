import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import MessageHostPanel from '../components/MessageHostPanel';
import { downloadLeaseAgreementPdf } from '../utils/leaseAgreement';
import LeaseChat from '../components/LeaseChat';
import LeaseDocumentsTab from '../components/LeaseDocumentsTab';

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

const LEASE_STATUS_LABELS = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  CANCELLED: 'Withdrawn',
};

const LEASE_STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'houses', label: 'House Bookings' },
  { id: 'cars', label: 'Car Rentals' },
  { id: 'leases', label: 'Leases' },
  { id: 'payments', label: 'Payments & Balance' },
  { id: 'documents', label: 'Documents' },
  { id: 'maintenance', label: 'Maintenance & Messages' },
  { id: 'account', label: 'Account' },
];

export default function TenantDashboardPage() {
  const { user, token } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab');
    return TABS.some((tab) => tab.id === t) ? t : 'overview';
  });

  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [carBookings, setCarBookings] = useState([]);
  const [carBookingsLoading, setCarBookingsLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState(null);
  const [openMessageKey, setOpenMessageKey] = useState(null);
  const [leaseApps, setLeaseApps] = useState([]);
  const [leaseAppsLoading, setLeaseAppsLoading] = useState(true);
  const [pdfBusyId, setPdfBusyId] = useState(null);

  const downloadAgreement = async (app) => {
    setPdfBusyId(app.id);
    try {
      await downloadLeaseAgreementPdf(app.agreement);
    } catch (err) {
      setError('Could not create the lease agreement PDF. Please try again.');
    } finally {
      setPdfBusyId(null);
    }
  };

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

  useEffect(() => {
    fetch(`${API_BASE_URL}/lease-applications/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setLeaseApps(Array.isArray(data) ? data : []))
      .catch(() => setLeaseApps([]))
      .finally(() => setLeaseAppsLoading(false));
  }, [token]);

  const loading = bookingsLoading || carBookingsLoading || leaseAppsLoading;

  // Leases: the amount due shows only once the host approves.
  const leasesDue = leaseApps.filter((a) => a.status === 'APPROVED' && !a.paid && a.amountDue != null);
  const pendingLeaseBalance = leasesDue.reduce((sum, a) => sum + Number(a.amountDue), 0);
  const paidLeaseTotal = leaseApps.filter((a) => a.status === 'APPROVED' && a.paid).reduce((sum, a) => sum + Number(a.amountDue || 0), 0);
  const openLeaseCount = leaseApps.filter((a) => a.status === 'PENDING' || a.status === 'APPROVED').length;
  const activeLeases = leaseApps.filter((a) => a.status === 'APPROVED');
  const unreadLeaseMessages = leaseApps.reduce((sum, a) => sum + (a.unreadMessages || 0), 0);
  const patchLeaseApp = (id, patch) => setLeaseApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const cancelLeaseApp = async (app) => {
    if (!window.confirm('Withdraw this lease application?')) return;
    setCancellingId(`lease-${app.id}`);
    try {
      const res = await fetch(`${API_BASE_URL}/lease-applications/${app.id}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setLeaseApps((prev) => prev.map((a) => (a.id === data.id ? data : a)));
      } else {
        setError((data && data.message) || 'Could not withdraw this application.');
      }
    } catch (err) {
      setError('Could not reach the server.');
    } finally {
      setCancellingId(null);
    }
  };

  const upcomingStays = bookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status) && b.checkInDate >= todayString());
  const activeCarRentals = carBookings.filter((b) => ['PENDING', 'CONFIRMED'].includes(b.status) && b.endDate >= todayString());

  const pendingHouseBalance = bookings.filter((b) => b.status === 'PENDING').reduce((sum, b) => sum + Number(b.totalPrice), 0);
  const pendingCarBalance = carBookings.filter((b) => b.status === 'PENDING').reduce((sum, b) => sum + Number(b.totalPrice), 0);
  const totalBalanceDue = pendingHouseBalance + pendingCarBalance + pendingLeaseBalance;

  const totalSpent =
    [...bookings, ...carBookings]
      .filter((b) => ['CONFIRMED', 'COMPLETED'].includes(b.status))
      .reduce((sum, b) => sum + Number(b.totalPrice), 0) + paidLeaseTotal;

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
            {tab.id === 'leases' && unreadLeaseMessages > 0 && (
              <span className="ml-1.5 bg-rose-500 text-white text-xs font-bold rounded-full px-1.5">{unreadLeaseMessages}</span>
            )}
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
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Upcoming stays</p>
                  <p className="text-2xl font-bold">{upcomingStays.length}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Active car rentals</p>
                  <p className="text-2xl font-bold">{activeCarRentals.length}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('leases')}
                  className="border border-gray-200 rounded-xl p-4 text-left hover:shadow-md transition"
                >
                  <p className="text-sm text-gray-500">Lease applications</p>
                  <p className="text-2xl font-bold">{openLeaseCount}</p>
                </button>
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

      {activeTab === 'leases' && (
        <div>
          {leaseAppsLoading && <p className="text-gray-500">Loading...</p>}
          {!leaseAppsLoading && leaseApps.length === 0 && (
            <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-500 mb-4">No lease applications yet.</p>
              <Link to="/" className="text-rose-500 font-medium hover:underline">Browse monthly stays</Link>
            </div>
          )}
          <div className="space-y-4">
            {leaseApps.map((a) => {
              const key = `lease-${a.id}`;
              const canWithdraw = a.status === 'PENDING' || (a.status === 'APPROVED' && !a.paid);
              return (
                <div key={a.id} className={`border border-gray-200 rounded-xl p-4 ${['CANCELLED', 'DECLINED'].includes(a.status) ? 'opacity-70' : ''}`}>
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Link to={`/lease/${a.leaseId}`} className="shrink-0">
                      <img src={a.leaseImageUrl || 'https://placehold.co/300x200?text=Home'} alt={a.leaseTitle} className="w-full sm:w-44 h-32 object-cover rounded-lg bg-gray-200" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link to={`/lease/${a.leaseId}`} className="font-semibold hover:underline block truncate">{a.leaseTitle}</Link>
                          <p className="text-sm text-gray-500">{[a.leaseCity, a.leaseState].filter(Boolean).join(', ')}</p>
                        </div>
                        <span className={`shrink-0 px-2 py-1 rounded-full text-xs font-medium ${LEASE_STATUS_STYLES[a.status] || 'bg-gray-100'}`}>
                          {a.status === 'APPROVED' && a.confirmed
                            ? 'Confirmed'
                            : a.status === 'APPROVED' && a.paid
                              ? 'Approved · Paid'
                              : LEASE_STATUS_LABELS[a.status] || a.status}
                        </span>
                      </div>
                      <p className="mt-2 text-sm">
                        Move in {formatDate(a.moveInDate)} to {formatDate(a.moveOutDate)}
                        <span className="text-gray-500"> ({a.months} month{a.months !== 1 ? 's' : ''} · ${Number(a.monthlyRent).toFixed(2)}/month)</span>
                      </p>

                      {a.status === 'PENDING' && (
                        <p className="mt-2 text-sm text-amber-700">
                          The host is reviewing your application. The amount to pay will appear here once it's approved.
                        </p>
                      )}

                      {a.status === 'APPROVED' && (
                        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                          {a.leaseAddress && (
                            <p className="mb-1">
                              <span className="font-medium">Address:</span> {a.leaseAddress}
                              {a.leaseZip ? `, ${a.leaseZip}` : ''}
                            </p>
                          )}
                          <div className="flex justify-between"><span>First month</span><span>${Number(a.monthlyRent).toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Security deposit</span><span>${Number(a.securityDeposit).toFixed(2)}</span></div>
                          <div className="flex justify-between font-semibold border-t border-green-200 mt-1 pt-1">
                            <span>{a.paid ? 'Paid' : 'Amount due now'}</span>
                            <span>${Number(a.amountDue).toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      {a.status === 'APPROVED' && a.paid && !a.confirmed && (
                        <p className="mt-2 text-sm text-gray-600">
                          Payment received. Your host will confirm your lease next - your signed lease agreement (PDF) will then appear in{' '}
                          <button type="button" onClick={() => setActiveTab('documents')} className="text-rose-500 font-medium hover:underline">
                            Documents
                          </button>
                          .
                        </p>
                      )}

                      {a.agreement && (
                        <div className="mt-3 flex items-center justify-between gap-3 border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="text-2xl" aria-hidden="true">📄</span>
                            <div className="min-w-0">
                              <p className="text-sm font-medium">Signed lease agreement · Confirmed</p>
                              <p className="text-xs text-gray-500 truncate">
                                Signed by {a.agreement.signatureName} · PDF · also in{' '}
                                <button type="button" onClick={() => setActiveTab('documents')} className="text-rose-500 hover:underline">
                                  Documents
                                </button>
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadAgreement(a)}
                            disabled={pdfBusyId === a.id}
                            className="shrink-0 bg-gray-900 hover:bg-black text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
                          >
                            {pdfBusyId === a.id ? 'Preparing...' : 'Download PDF'}
                          </button>
                        </div>
                      )}

                      {a.hostNote && ['APPROVED', 'DECLINED'].includes(a.status) && (
                        <p className="mt-2 text-sm text-gray-600">
                          <span className="font-medium">Note from host:</span> {a.hostNote}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-between flex-wrap gap-2">
                        <p className="font-semibold">${Number(a.leaseTotal).toFixed(2)} lease total</p>
                        <div className="flex items-center gap-3">
                          {a.status !== 'CANCELLED' && (
                            <button onClick={() => toggleMessage(key)} className="text-sm text-rose-500 font-medium hover:underline">
                              {openMessageKey === key ? 'Hide messages' : 'Message host'}
                              {a.unreadMessages > 0 && openMessageKey !== key && (
                                <span className="ml-1 bg-rose-500 text-white text-xs font-bold rounded-full px-1.5">{a.unreadMessages}</span>
                              )}
                            </button>
                          )}
                          {a.status === 'APPROVED' && !a.paid && (
                            <button disabled className="bg-gray-300 text-gray-500 text-sm font-medium px-4 py-2 rounded-lg cursor-not-allowed">
                              Pay now
                            </button>
                          )}
                          {canWithdraw && (
                            <button
                              onClick={() => cancelLeaseApp(a)}
                              disabled={cancellingId === key}
                              className="text-sm text-red-500 font-medium hover:underline disabled:opacity-50"
                            >
                              {cancellingId === key ? 'Withdrawing...' : 'Withdraw'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {openMessageKey === key && (
                    <div className="mt-3">
                      <LeaseChat
                        applicationId={a.id}
                        otherName={a.hostName || 'your host'}
                        closed={a.status === 'CANCELLED'}
                        onRead={() => patchLeaseApp(a.id, { unreadMessages: 0 })}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {leasesDue.length > 0 && (
            <p className="mt-4 text-sm text-gray-500">
              Online payment isn't connected yet. Arrange payment with your host - they'll mark it paid here.
            </p>
          )}
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
              ...carBookings.filter((b) => b.status === 'PENDING').map((b) => ({ ...b, kind: 'car', label: `${b.make} ${b.model}` })),
              ...leasesDue.map((a) => ({ ...a, kind: 'lease', label: `${a.leaseTitle} (first month + deposit)`, totalPrice: a.amountDue }))]
              .map((b) => (
                <div key={`${b.kind}-${b.id}`} className="flex items-center justify-between gap-3 border border-gray-200 rounded-xl p-4">
                  <div>
                    <p className="font-medium">{b.label}</p>
                    <p className="text-sm text-gray-500">
                      {b.kind === 'house'
                        ? `${formatDate(b.checkInDate)} - ${formatDate(b.checkOutDate)}`
                        : b.kind === 'lease'
                          ? `Lease ${formatDate(b.moveInDate)} - ${formatDate(b.moveOutDate)}`
                          : `${formatDate(b.startDate)} - ${formatDate(b.endDate)}`}
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

      {activeTab === 'documents' && <LeaseDocumentsTab role="tenant" />}

      {activeTab === 'maintenance' && (
        <div>
          <p className="text-gray-500 mb-4">Reach out to your host about any active or upcoming booking.</p>
          {loading ? (
            <p className="text-gray-500">Loading...</p>
          ) : upcomingStays.length === 0 && activeCarRentals.length === 0 && activeLeases.length === 0 ? (
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
              {activeLeases.map((a) => (
                <div key={`msg-lease-${a.id}`} className="border border-gray-200 rounded-xl p-4">
                  <p className="font-medium mb-2">🏡 {a.leaseTitle} <span className="text-sm font-normal text-gray-500">(lease)</span></p>
                  <LeaseChat
                    applicationId={a.id}
                    otherName={a.hostName || 'your host'}
                    onRead={() => patchLeaseApp(a.id, { unreadMessages: 0 })}
                  />
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