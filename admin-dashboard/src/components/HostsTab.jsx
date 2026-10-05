import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  listingTitle,
  listingLocation,
  listingPrice,
  formatRating,
  ListingStatusBadge,
} from './ListingsTab';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const PAGE_SIZE = 7;

function isActiveValue(value) {
  return value === true || value === 1 || value === '1';
}

function HostListings({ hostId, token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/admin/hosts/${hostId}/listings`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error((body && body.message) || `Could not load listings (status ${res.status}).`);
        return body;
      })
      .then((body) => {
        if (!cancelled) setData(body);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load listings.');
      });
    return () => {
      cancelled = true;
    };
  }, [hostId, token]);

  if (error) return <p className="text-red-500 text-sm">{error}</p>;
  if (!data) return <p className="text-gray-500 text-sm">Loading listings...</p>;

  const sections = [
    { type: 'houses', label: 'Houses', rows: data.houses || [] },
    { type: 'cars', label: 'Cars', rows: data.cars || [] },
  ];

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {sections.map((section) => (
        <div key={section.type}>
          <p className="text-sm font-semibold mb-2">
            {section.label} ({section.rows.length})
          </p>
          {section.rows.length === 0 ? (
            <p className="text-xs text-gray-500">No {section.label.toLowerCase()} listed.</p>
          ) : (
            <ul className="space-y-2">
              {section.rows.map((row) => (
                <li key={row.id} className="bg-white border border-gray-200 rounded-lg px-3 py-2 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{listingTitle(row, section.type)}</p>
                    <p className="text-xs text-gray-500">
                      {[listingLocation(row), listingPrice(row, section.type)].filter(Boolean).join(' • ') || '—'}
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.bookingCount ?? 0} bookings
                      {formatRating(row.avgRating) && ` • ★ ${formatRating(row.avgRating)}`}
                    </p>
                  </div>
                  <ListingStatusBadge status={row.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

export default function HostsTab() {
  const { token } = useAuth();

  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actingId, setActingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`${API_BASE_URL}/admin/hosts`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.message) || `Could not load hosts (status ${res.status}).`);
        }
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setHosts(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load hosts.');
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
    if (!term) return hosts;
    return hosts.filter((h) => `${h.firstName || ''} ${h.lastName || ''}`.toLowerCase().includes(term));
  }, [hosts, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const activeCount = hosts.filter((h) => isActiveValue(h.isActive)).length;
  const totalListings = hosts.reduce((sum, h) => sum + Number(h.houseCount || 0) + Number(h.carCount || 0), 0);

  const toggleActive = async (host) => {
    setActingId(host.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/hosts/${host.id}/toggle-active`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.message) || `Could not update ${host.firstName}'s account.`);
        return;
      }
      setHosts((prev) =>
        prev.map((h) => {
          if (h.id !== host.id) return h;
          if (data && data.id === host.id) return { ...h, ...data };
          return { ...h, isActive: !isActiveValue(h.isActive) };
        })
      );
    } catch (err) {
      setError('Could not reach the server.');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Hosts</p>
          <p className="text-2xl font-bold">{loading ? '...' : hosts.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Active</p>
          <p className="text-2xl font-bold">{loading ? '...' : activeCount}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <p className="text-sm text-gray-500">Listings</p>
          <p className="text-2xl font-bold">{loading ? '...' : totalListings}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by name"
          className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
        {!loading && (
          <p className="text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? 'host' : 'hosts'}
            {search.trim() && ` matching "${search.trim()}"`}
          </p>
        )}
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && !error && hosts.length === 0 && (
        <p className="text-gray-500">No hosts yet. Approved host applications will show up here.</p>
      )}
      {!loading && hosts.length > 0 && filtered.length === 0 && (
        <p className="text-gray-500">No hosts match that name. Try a different spelling.</p>
      )}

      {!loading && pageRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Listings</th>
                <th className="px-4 py-3 font-medium">Bookings</th>
                <th className="px-4 py-3 font-medium">Rating</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.map((h) => {
                const active = isActiveValue(h.isActive);
                const houses = Number(h.houseCount || 0);
                const cars = Number(h.carCount || 0);
                const bookings = Number(h.houseBookingCount || 0) + Number(h.carBookingCount || 0);
                const expanded = expandedId === h.id;
                return (
                  <React.Fragment key={h.id}>
                    <tr className={active ? '' : 'bg-gray-50'}>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">
                        {h.firstName} {h.lastName}
                      </td>
                      <td className="px-4 py-3">
                        <p>{h.email}</p>
                        {h.phone && <p className="text-xs text-gray-500">{h.phone}</p>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="font-semibold">{houses + cars}</p>
                        <p className="text-xs text-gray-500">
                          {houses} {houses === 1 ? 'house' : 'houses'}, {cars} {cars === 1 ? 'car' : 'cars'}
                        </p>
                      </td>
                      <td className="px-4 py-3">{bookings}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {formatRating(h.avgRating) ? (
                          <span className="text-amber-500">★ <span className="text-gray-700">{formatRating(h.avgRating)}</span></span>
                        ) : (
                          <span className="text-xs text-gray-400">No reviews</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => setExpandedId(expanded ? null : h.id)}
                          className="text-xs font-medium px-3 py-2 rounded-lg border border-gray-300 hover:bg-gray-50 mr-2"
                        >
                          {expanded ? 'Hide listings' : 'View listings'}
                        </button>
                        <button
                          onClick={() => toggleActive(h)}
                          disabled={actingId === h.id}
                          className={`text-white text-xs font-medium px-3 py-2 rounded-lg transition disabled:opacity-50 ${
                            active ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          {actingId === h.id ? 'Saving...' : active ? 'Disable' : 'Enable'}
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={7} className="px-4 py-4 bg-gray-50">
                          <HostListings hostId={h.id} token={token} />
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