import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ComingSoonTab from '../components/ComingSoonTab';
import AddListingForm from '../components/AddListingForm';
import HostExperiencesTab from '../components/HostExperiencesTab';
import HostMessagesTab from '../components/HostMessagesTab';
import HostReviewsTab from '../components/HostReviewsTab';
import HostCarsTab from '../components/HostCarsTab';
import HostBookingsTab from '../components/HostBookingsTab';
import HostLeasesTab from '../components/HostLeasesTab';
import LeaseDocumentsTab from '../components/LeaseDocumentsTab';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const LISTINGS_PER_PAGE = 5;

const LISTING_STATUS_STYLES = {
  ACTIVE: 'bg-green-100 text-green-700',
  DRAFT: 'bg-gray-100 text-gray-700',
  INACTIVE: 'bg-red-100 text-red-700',
};

const TABS = [
  { id: 'houses', label: 'House Listings' },
  { id: 'cars', label: 'Car Rental' },
  { id: 'leases', label: 'Monthly Leases' },
  { id: 'experiences', label: 'Experiences' },
  { id: 'bookings', label: 'Bookings' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'messages', label: 'Messages' },
  { id: 'documents', label: 'Documents' },
];

export default function HostDashboardPage() {
  const { token, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => {
    const t = searchParams.get('tab');
    return TABS.some((tab) => tab.id === t) ? t : 'houses';
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingListing, setEditingListing] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [listingNotice, setListingNotice] = useState(null); // { ok, text }

  const [properties, setProperties] = useState([]);
  const [propertiesLoading, setPropertiesLoading] = useState(true);
  const [propertiesError, setPropertiesError] = useState('');
  const [listingsPage, setListingsPage] = useState(1);

  // Bookings + earnings still need the house-bookings list here (for
  // the Earnings tab math). The Bookings TAB itself lives in
  // HostBookingsTab, which fetches its own merged house+car list.
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/properties/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load your listings');
        return res.json();
      })
      .then((data) => {
        setProperties(data);
        setPropertiesLoading(false);
      })
      .catch(() => {
        setPropertiesError('Could not load your listings. Is the backend running?');
        setPropertiesLoading(false);
      });
  }, [token]);

  useEffect(() => {
    fetch(`${API_BASE_URL}/bookings/host`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load bookings');
        return res.json();
      })
      .then((data) => {
        setBookings(data);
        setBookingsLoading(false);
      })
      .catch(() => {
        setBookingsError('Could not load your bookings.');
        setBookingsLoading(false);
      });
  }, [token]);

  const listingsPageCount = Math.max(1, Math.ceil(properties.length / LISTINGS_PER_PAGE));
  useEffect(() => {
    if (listingsPage > listingsPageCount) setListingsPage(listingsPageCount);
  }, [listingsPage, listingsPageCount]);

  const paginatedProperties = properties.slice(
    (listingsPage - 1) * LISTINGS_PER_PAGE,
    listingsPage * LISTINGS_PER_PAGE
  );

  const activeListingCount = properties.filter((p) => p.status === 'ACTIVE').length;

  const earningsOf = (statuses) =>
    bookings
      .filter((b) => statuses.includes(b.status))
      .reduce((sum, b) => sum + Number(b.totalPrice), 0);

  const confirmedEarnings = earningsOf(['CONFIRMED', 'COMPLETED']);
  const pendingEarnings = earningsOf(['PENDING']);
  const confirmedBookingCount = bookings.filter((b) => ['CONFIRMED', 'COMPLETED'].includes(b.status)).length;

  const handleListingCreated = (newProperty) => {
    setProperties((prev) => [newProperty, ...prev]);
    setShowAddForm(false);
    setListingsPage(1);
    setListingNotice({ ok: true, text: 'Listing published.' });
  };

  const handleListingUpdated = (updated) => {
    setProperties((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    setEditingListing(null);
    setListingNotice({ ok: true, text: 'Changes saved.' });
  };

  const startEdit = (property) => {
    setShowAddForm(false);
    setListingNotice(null);
    setEditingListing(property);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleListingStatus = async (property) => {
    setActingId(property.id);
    setListingNotice(null);
    try {
      const res = await fetch(`${API_BASE_URL}/properties/${property.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: property.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not update this listing.');
      setProperties((prev) => prev.map((p) => (p.id === data.id ? data : p)));
      setListingNotice({
        ok: true,
        text: data.status === 'ACTIVE' ? 'Listing is live again.' : 'Listing paused - guests can no longer find it.',
      });
    } catch (err) {
      setListingNotice({ ok: false, text: err.message });
    } finally {
      setActingId(null);
    }
  };

  const deleteListing = async (property) => {
    const ok = window.confirm(
      `Delete "${property.title}"?\n\nThis permanently removes the listing and its photos. This can't be undone.`
    );
    if (!ok) return;
    setActingId(property.id);
    setListingNotice(null);
    try {
      const res = await fetch(`${API_BASE_URL}/properties/${property.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not delete this listing.');
      setProperties((prev) => prev.filter((p) => p.id !== property.id));
      if (editingListing?.id === property.id) setEditingListing(null);
      setListingNotice({ ok: true, text: 'Listing deleted.' });
    } catch (err) {
      setListingNotice({ ok: false, text: err.message });
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Host dashboard</h1>
          <p className="text-gray-500">Welcome back, {user?.firstName}.</p>
        </div>

        {activeTab === 'houses' && (
          <button
            onClick={() => {
              setEditingListing(null);
              setListingNotice(null);
              setShowAddForm((prev) => !prev);
            }}
            className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 py-2.5 rounded-lg transition"
          >
            {showAddForm ? 'Cancel' : '+ Add listing'}
          </button>
        )}

      </div>

      <div className="flex gap-1 mb-6 border-b border-gray-200 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setShowAddForm(false);
              setEditingListing(null);
            }}
            className={`shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === tab.id
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'houses' && (
        <div>
          {listingNotice && (
            <div
              className={`mb-4 p-3 rounded-lg text-sm border ${
                listingNotice.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'
              }`}
              role="status"
            >
              {listingNotice.text}
            </div>
          )}

          {showAddForm && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Add a house listing</h2>
              <AddListingForm onSuccess={handleListingCreated} onCancel={() => setShowAddForm(false)} />
            </div>
          )}

          {editingListing && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Edit listing: {editingListing.title}</h2>
              <AddListingForm
                key={editingListing.id}
                listing={editingListing}
                onSuccess={handleListingUpdated}
                onCancel={() => setEditingListing(null)}
              />
            </div>
          )}

          {propertiesLoading && <p className="text-gray-500">Loading your listings...</p>}
          {propertiesError && <p className="text-red-500">{propertiesError}</p>}

          {!propertiesLoading && !propertiesError && properties.length === 0 && !showAddForm && (
            <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-500 mb-4">You haven't listed any properties yet.</p>
              <button onClick={() => setShowAddForm(true)} className="text-rose-500 font-medium hover:underline">
                Create your first listing
              </button>
            </div>
          )}

          {!propertiesLoading && !propertiesError && properties.length > 0 && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Total listings</p>
                  <p className="text-2xl font-bold">{properties.length}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Active listings</p>
                  <p className="text-2xl font-bold">{activeListingCount}</p>
                </div>
              </div>

              <div className="border border-gray-200 rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-500">
                    <tr>
                      <th className="px-4 py-3 font-medium">Listing</th>
                      <th className="px-4 py-3 font-medium">Location</th>
                      <th className="px-4 py-3 font-medium">Price/night</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedProperties.map((property) => (
                      <tr key={property.id} className={editingListing?.id === property.id ? 'bg-rose-50' : ''}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {property.imageUrls?.[0] ? (
                              <img src={property.imageUrls[0]} alt="" className="w-14 h-10 object-cover rounded-md bg-gray-100 shrink-0" />
                            ) : (
                              <span className="w-14 h-10 rounded-md bg-gray-100 shrink-0" />
                            )}
                            <span className="font-medium">{property.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{property.city}, {property.state}</td>
                        <td className="px-4 py-3">${Number(property.basePricePerNight).toFixed(0)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${LISTING_STATUS_STYLES[property.status] || 'bg-gray-100 text-gray-700'}`}>
                            {property.status === 'INACTIVE' ? 'PAUSED' : property.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => startEdit(property)}
                            disabled={actingId === property.id}
                            className="text-gray-900 font-medium hover:underline mr-4 disabled:opacity-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleListingStatus(property)}
                            disabled={actingId === property.id}
                            className="text-gray-700 font-medium hover:underline mr-4 disabled:opacity-50"
                          >
                            {actingId === property.id ? 'Saving...' : property.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteListing(property)}
                            disabled={actingId === property.id}
                            className="text-red-600 font-medium hover:underline mr-4 disabled:opacity-50"
                          >
                            Delete
                          </button>
                          <Link to={`/property/${property.id}`} className="text-rose-500 font-medium hover:underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {listingsPageCount > 1 && (
                <div className="flex items-center justify-between mt-4 text-sm">
                  <p className="text-gray-500">
                    Showing {(listingsPage - 1) * LISTINGS_PER_PAGE + 1}
                    {'\u2013'}
                    {Math.min(listingsPage * LISTINGS_PER_PAGE, properties.length)} of {properties.length}
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setListingsPage((p) => Math.max(1, p - 1))}
                      disabled={listingsPage === 1}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      Previous
                    </button>
                    <span className="text-gray-600">
                      Page {listingsPage} of {listingsPageCount}
                    </span>
                    <button
                      type="button"
                      onClick={() => setListingsPage((p) => Math.min(listingsPageCount, p + 1))}
                      disabled={listingsPage === listingsPageCount}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === 'cars' && <HostCarsTab />}

      {activeTab === 'leases' && <HostLeasesTab />}

      {activeTab === 'experiences' && <HostExperiencesTab />}

      {activeTab === 'bookings' && <HostBookingsTab />}

      {activeTab === 'earnings' && (
        <div>
          {bookingsLoading && <p className="text-gray-500">Loading earnings...</p>}
          {bookingsError && <p className="text-red-500">{bookingsError}</p>}

          {!bookingsLoading && !bookingsError && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Confirmed earnings</p>
                  <p className="text-2xl font-bold text-green-700">${confirmedEarnings.toFixed(2)}</p>
                  <p className="text-xs text-gray-400 mt-1">{confirmedBookingCount} booking{confirmedBookingCount !== 1 ? 's' : ''}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4">
                  <p className="text-sm text-gray-500">Pending (awaiting payment)</p>
                  <p className="text-2xl font-bold text-amber-700">${pendingEarnings.toFixed(2)}</p>
                </div>
                <div className="border border-gray-200 rounded-xl p-4 opacity-50">
                  <p className="text-sm text-gray-500">Payouts</p>
                  <p className="text-2xl font-bold">—</p>
                  <p className="text-xs text-gray-400 mt-1">Coming soon</p>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                Confirmed earnings will update automatically once Stripe payments are connected. Right now every booking stays "Awaiting payment" and nothing has actually been charged.
              </p>
            </>
          )}
        </div>
      )}

      {activeTab === 'reviews' && <HostReviewsTab />}
      {activeTab === 'messages' && <HostMessagesTab />}
      {activeTab === 'documents' && <LeaseDocumentsTab role="host" />}
    </div>
  );
}