import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const PAGE_SIZE = 8;

const TOPIC_LABELS = {
  GENERAL: 'General',
  BOOKING: 'Booking',
  PAYMENT: 'Payment',
  CANCELLATION: 'Cancellation',
  SAFETY: 'Safety',
  HOSTING: 'Hosting',
  ACCOUNT: 'Account',
  OTHER: 'Other',
};

export default function MessagesTab() {
  const { token } = useAuth();

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [topicFilter, setTopicFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [actingId, setActingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetch(`${API_BASE_URL}/admin/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data && data.message) || `Could not load messages (status ${res.status}).`);
        }
        return Array.isArray(data) ? data : [];
      })
      .then((data) => {
        if (!cancelled) setMessages(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Could not load messages.');
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
    return messages.filter((m) => {
      if (topicFilter !== 'ALL' && m.topic !== topicFilter) return false;
      if (!term) return true;
      const haystack = `${m.name || ''} ${m.email || ''} ${m.message || ''}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [messages, search, topicFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const deleteMessage = async (m) => {
    if (!window.confirm(`Delete this message from ${m.name}? This cannot be undone.`)) return;
    setActingId(m.id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/admin/messages/${m.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError((data && data.message) || 'Could not delete this message.');
        return;
      }
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
    } catch {
      setError('Could not reach the server.');
    } finally {
      setActingId(null);
    }
  };

  const topicsPresent = useMemo(() => {
    const set = new Set(messages.map((m) => m.topic).filter(Boolean));
    return ['ALL', ...Array.from(set).sort()];
  }, [messages]);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search name, email, or message"
            className="w-full sm:w-72 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <select
            value={topicFilter}
            onChange={(e) => {
              setTopicFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            {topicsPresent.map((t) => (
              <option key={t} value={t}>
                {t === 'ALL' ? 'All topics' : (TOPIC_LABELS[t] || t)}
              </option>
            ))}
          </select>
        </div>
        {!loading && (
          <p className="text-sm text-gray-500">
            {messages.length} {messages.length === 1 ? 'message' : 'messages'}
            {filtered.length !== messages.length && ` · ${filtered.length} shown`}
          </p>
        )}
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}
      {loading && <p className="text-gray-500">Loading...</p>}

      {!loading && !error && messages.length === 0 && (
        <p className="text-gray-500">No contact messages yet.</p>
      )}
      {!loading && messages.length > 0 && filtered.length === 0 && (
        <p className="text-gray-500">No messages match those filters.</p>
      )}

      {!loading && pageRows.length > 0 && (
        <div className="space-y-3">
          {pageRows.map((m) => {
            const isOpen = expandedId === m.id;
            return (
              <div key={m.id} className="bg-white border border-gray-200 rounded-xl p-4">
                <div
                  className="flex flex-wrap items-start justify-between gap-3 cursor-pointer"
                  onClick={() => setExpandedId(isOpen ? null : m.id)}
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{m.name}</p>
                    <p className="text-sm text-gray-500 truncate">{m.email}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                      {TOPIC_LABELS[m.topic] || m.topic || 'General'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {m.createdAt ? new Date(m.createdAt).toLocaleString() : ''}
                    </span>
                  </div>
                </div>

                {!isOpen && (
                  <p className="mt-2 text-sm text-gray-700 line-clamp-2">{m.message}</p>
                )}

                {isOpen && (
                  <>
                    <p className="mt-3 text-sm text-gray-700 whitespace-pre-line">{m.message}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <a
                        href={`mailto:${m.email}?subject=Re: bhookme contact — ${TOPIC_LABELS[m.topic] || m.topic}`}
                        className="text-xs font-medium text-blue-600 hover:underline"
                      >
                        Reply by email
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteMessage(m);
                        }}
                        disabled={actingId === m.id}
                        className="text-red-600 hover:text-red-800 text-xs font-medium underline disabled:opacity-50"
                      >
                        {actingId === m.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
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