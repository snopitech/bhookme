import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const PAGE_SIZE = 7;

function ReviewCell({ user }) {
  if (user.reviewRating != null) {
    return (
      <div className="max-w-xs">
        <p className="text-amber-500 text-sm" aria-label={`${user.reviewRating} out of 5 stars`}>
          {'★'.repeat(user.reviewRating)}
          <span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - user.reviewRating))}</span>
        </p>
        {user.reviewComment && (
          <p className="text-xs text-gray-600 mt-1 line-clamp-2" title={user.reviewComment}>
            {user.reviewComment}
          </p>
        )}
      </div>
    );
  }
  if (user.hasCheckedOut) {
    return <span className="text-xs text-gray-500">Checked out, no review yet</span>;
  }
  return <span className="text-xs text-gray-400">Not checked out yet</span>;
}

export default function UsersTab() {
  const { token } = useAuth();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`${API_BASE_URL}/admin/users`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.message) || `Could not load users (status ${res.status}).`);
        }
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load users.');
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
    if (!term) return users;
    return users.filter((u) => {
      const fullName = `${u.firstName || ''} ${u.lastName || ''}`.toLowerCase();
      return fullName.includes(term);
    });
  }, [users, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleActive = async (user) => {
    setActingId(user.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${user.id}/toggle-active`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.message) || `Could not update ${user.firstName}'s account.`);
        return;
      }
      setUsers((prev) =>
        prev.map((u) => {
          if (u.id !== user.id) return u;
          // Use the server's updated record when it sends one back; otherwise flip locally.
          if (data && data.id === user.id) return { ...u, ...data };
          return { ...u, isActive: !u.isActive };
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
            {filtered.length} {filtered.length === 1 ? 'tenant' : 'tenants'}
            {search.trim() && ` matching "${search.trim()}"`}
          </p>
        )}
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && !error && users.length === 0 && (
        <p className="text-gray-500">No tenants have signed up yet.</p>
      )}
      {!loading && users.length > 0 && filtered.length === 0 && (
        <p className="text-gray-500">No tenants match that name. Try a different spelling.</p>
      )}

      {!loading && pageRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Host</th>
                <th className="px-4 py-3 font-medium">Review</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.map((u) => (
                <tr key={u.id} className={u.isActive ? '' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-semibold whitespace-nowrap">
                    {u.firstName} {u.lastName}
                  </td>
                  <td className="px-4 py-3">
                    <p>{u.email}</p>
                    {u.phone && <p className="text-xs text-gray-500">{u.phone}</p>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {u.hostName || <span className="text-gray-400">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <ReviewCell user={u} />
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        u.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(u)}
                      disabled={actingId === u.id}
                      className={`text-white text-xs font-medium px-3 py-2 rounded-lg transition disabled:opacity-50 ${
                        u.isActive ? 'bg-red-500 hover:bg-red-600' : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {actingId === u.id ? 'Saving...' : u.isActive ? 'Disable' : 'Enable'}
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