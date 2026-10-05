import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const PAGE_SIZE = 10;

export default function SubscribersTab() {
  const { token } = useAuth();

  const [subscribers, setSubscribers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [actingId, setActingId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`${API_BASE_URL}/admin/subscribers`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.message) || `Could not load subscribers (status ${res.status}).`);
        }
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setSubscribers(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load subscribers.');
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
    if (!term) return subscribers;
    return subscribers.filter((s) => (s.email || '').toLowerCase().includes(term));
  }, [subscribers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const toggleStatus = async (sub) => {
    setActingId(sub.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/subscribers/${sub.id}/toggle-status`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.message) || 'Could not update this subscriber.');
        return;
      }
      setSubscribers((prev) => prev.map((s) => (s.id === sub.id ? { ...s, ...data } : s)));
    } catch (err) {
      setError('Could not reach the server.');
    } finally {
      setActingId(null);
    }
  };

  const deleteSubscriber = async (sub) => {
    if (!window.confirm(`Delete ${sub.email}? This cannot be undone.`)) return;
    setActingId(sub.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/subscribers/${sub.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.message) || 'Could not delete this subscriber.');
        return;
      }
      setSubscribers((prev) => prev.filter((s) => s.id !== sub.id));
    } catch (err) {
      setError('Could not reach the server.');
    } finally {
      setActingId(null);
    }
  };

  const exportCsv = () => {
    const rows = [
      ['id', 'email', 'status', 'subscribed_at', 'unsubscribed_at'],
      ...filtered.map((s) => [
        s.id,
        s.email,
        s.status,
        s.subscribedAt || '',
        s.unsubscribedAt || '',
      ]),
    ];
    const csv = rows
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bhookme-subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const activeCount = subscribers.filter((s) => s.status === 'ACTIVE').length;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search by email"
            className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="shrink-0 border border-gray-300 bg-white hover:bg-gray-50 text-sm font-medium px-3 py-2 rounded-lg disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>

        {!loading && (
          <p className="text-sm text-gray-500">
            {subscribers.length} {subscribers.length === 1 ? 'subscriber' : 'subscribers'}
            {subscribers.length > 0 && ` (${activeCount} active)`}
            {search.trim() && ` · ${filtered.length} matching "${search.trim()}"`}
          </p>
        )}
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && !error && subscribers.length === 0 && (
        <p className="text-gray-500">No subscribers yet.</p>
      )}
      {!loading && subscribers.length > 0 && filtered.length === 0 && (
        <p className="text-gray-500">No subscribers match that email.</p>
      )}

      {!loading && pageRows.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Subscribed</th>
                <th className="px-4 py-3 font-medium">Unsubscribed</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pageRows.map((s) => (
                <tr key={s.id} className={s.status === 'ACTIVE' ? '' : 'bg-gray-50'}>
                  <td className="px-4 py-3 font-medium">{s.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        s.status === 'ACTIVE'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {s.status === 'ACTIVE' ? 'Active' : 'Unsubscribed'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {s.subscribedAt ? new Date(s.subscribedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {s.unsubscribedAt ? new Date(s.unsubscribedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => toggleStatus(s)}
                      disabled={actingId === s.id}
                      className={`text-white text-xs font-medium px-3 py-2 rounded-lg transition disabled:opacity-50 ${
                        s.status === 'ACTIVE'
                          ? 'bg-gray-500 hover:bg-gray-600'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {actingId === s.id
                        ? 'Saving...'
                        : s.status === 'ACTIVE'
                          ? 'Mark Unsubscribed'
                          : 'Re-activate'}
                    </button>
                    <button
                      onClick={() => deleteSubscriber(s)}
                      disabled={actingId === s.id}
                      className="text-red-600 hover:text-red-800 text-xs font-medium underline disabled:opacity-50"
                    >
                      Delete
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