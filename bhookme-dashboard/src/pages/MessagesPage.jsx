import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const REFRESH_MS = 15000; // re-check for new messages every 15 seconds

function initials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function shortTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function threadKey(t) {
  return `${t.listingType}-${t.propertyId || t.carId}`;
}

// One conversation with a host about one listing.
function Conversation({ host, thread, token, onSent }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const url =
    thread.listingType === 'car'
      ? `${API_BASE_URL}/messages/conversation/car/${thread.carId}/with/${host.partnerId}`
      : `${API_BASE_URL}/messages/conversation/property/${thread.propertyId}/with/${host.partnerId}`;

  const load = useCallback(
    (quiet) => {
      if (!quiet) setLoading(true);
      return fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error((data && data.message) || 'Could not load this conversation.');
          setMessages(Array.isArray(data) ? data : []);
          setError('');
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [url, token]
  );

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    setSending(true);
    setError('');
    try {
      // Guest -> host: the backend works out the host from the listing.
      const res = await fetch(`${API_BASE_URL}/messages/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content,
          ...(thread.listingType === 'car' ? { carId: thread.carId } : { propertyId: thread.propertyId }),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not send your message.');
      setMessages((prev) => [...prev, data]);
      setDraft('');
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {loading && <p className="text-sm text-gray-500">Loading conversation...</p>}
        {!loading && messages.length === 0 && <p className="text-sm text-gray-500">No messages in this conversation yet.</p>}
        {!loading &&
          messages.map((m) => {
            const mine = m.senderId !== host.partnerId;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-line ${
                    mine ? 'bg-gray-900 text-white rounded-br-sm' : 'bg-white border border-gray-200 rounded-bl-sm'
                  }`}
                >
                  <p>{m.content}</p>
                  <p className={`text-[11px] mt-1 ${mine ? 'text-gray-300' : 'text-gray-400'}`}>{m.formattedTime}</p>
                </div>
              </div>
            );
          })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="text-sm text-red-500 px-4 pt-2">{error}</p>}

      <form onSubmit={send} className="flex items-end gap-2 p-3 border-t border-gray-200 bg-white">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e);
          }}
          rows={1}
          placeholder={`Message ${host.partnerName.split(' ')[0]}...`}
          className="flex-1 resize-none max-h-32 px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:opacity-40"
        >
          {sending ? 'Sending...' : 'Send'}
        </button>
      </form>
    </div>
  );
}

export default function MessagesPage() {
  const { token } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeHostId, setActiveHostId] = useState(null);
  const [activeThreadKey, setActiveThreadKey] = useState(null);

  const loadThreads = useCallback(
    () =>
      fetch(`${API_BASE_URL}/messages/threads`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error((data && data.message) || 'Could not load your messages.');
          // Only conversations with hosts (you were the guest).
          setThreads(Array.isArray(data) ? data.filter((t) => t.iAmListingHost === false) : []);
          setError('');
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false)),
    [token]
  );

  useEffect(() => {
    loadThreads();
    const timer = setInterval(loadThreads, REFRESH_MS);
    return () => clearInterval(timer);
  }, [loadThreads]);

  // One entry per host: their name, unread total, newest time, and their listings.
  const hosts = useMemo(() => {
    const map = new Map();
    threads.forEach((t) => {
      if (!map.has(t.partnerId)) {
        map.set(t.partnerId, {
          partnerId: t.partnerId,
          partnerName: t.partnerName,
          unread: 0,
          lastTime: t.lastMessageTime,
          threads: [],
        });
      }
      const h = map.get(t.partnerId);
      h.unread += Number(t.unreadCount || 0);
      if (t.lastMessageTime && (!h.lastTime || t.lastMessageTime > h.lastTime)) h.lastTime = t.lastMessageTime;
      h.threads.push(t);
    });
    return Array.from(map.values()).sort((a, b) => String(b.lastTime || '').localeCompare(String(a.lastTime || '')));
  }, [threads]);

  const activeHost = hosts.find((h) => h.partnerId === activeHostId) || null;
  const activeThread = activeHost
    ? activeHost.threads.find((t) => threadKey(t) === activeThreadKey) || activeHost.threads[0]
    : null;

  const openHost = (h) => {
    setActiveHostId(h.partnerId);
    setActiveThreadKey(threadKey(h.threads[0]));
  };

  // Opening a conversation marks it read on the server; reflect that right away.
  useEffect(() => {
    if (!activeHost || !activeThread) return;
    const key = threadKey(activeThread);
    setThreads((prev) =>
      prev.map((t) => (t.partnerId === activeHost.partnerId && threadKey(t) === key ? { ...t, unreadCount: 0 } : t))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHostId, activeThreadKey]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Messages</h1>

      {loading && <p className="text-gray-500">Loading your messages...</p>}
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {!loading && !error && hosts.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-4xl mb-3" aria-hidden="true">💬</p>
          <p className="font-semibold mb-1">You haven't messaged any hosts yet</p>
          <p className="text-gray-500 text-sm mb-4">When you contact a host about a home or car, the conversation shows up here.</p>
          <Link to="/" className="text-rose-500 font-medium hover:underline">
            Browse homes
          </Link>
        </div>
      )}

      {!loading && hosts.length > 0 && (
        <div className="border border-gray-200 rounded-xl overflow-hidden bg-white grid md:grid-cols-[300px_minmax(0,1fr)] h-[70vh] min-h-[480px]">
          {/* Host names */}
          <div className={`border-r border-gray-200 flex-col min-h-0 ${activeHost ? 'hidden md:flex' : 'flex'}`}>
            <p className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-gray-500">Hosts</p>
            <div className="flex-1 overflow-y-auto">
              {hosts.map((h) => (
                <button
                  key={h.partnerId}
                  type="button"
                  onClick={() => openHost(h)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-100 transition ${
                    activeHostId === h.partnerId ? 'bg-gray-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="w-10 h-10 rounded-full bg-gray-900 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                    {initials(h.partnerName)}
                  </span>
                  <span className={`flex-1 min-w-0 truncate ${h.unread ? 'font-bold' : 'font-medium'}`}>{h.partnerName}</span>
                  <span className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-xs text-gray-400">{shortTime(h.lastTime)}</span>
                    {h.unread > 0 && (
                      <span className="bg-rose-500 text-white text-xs font-semibold rounded-full px-2 py-0.5">{h.unread}</span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Conversation (only after a host name is clicked) */}
          <div className={`min-h-0 flex-col ${activeHost ? 'flex' : 'hidden md:flex'}`}>
            {activeHost && activeThread ? (
              <>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
                  <button
                    type="button"
                    onClick={() => setActiveHostId(null)}
                    className="md:hidden text-xl px-1"
                    aria-label="Back to hosts"
                  >
                    ‹
                  </button>
                  <span className="w-9 h-9 rounded-full bg-gray-900 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                    {initials(activeHost.partnerName)}
                  </span>
                  <p className="font-semibold truncate">{activeHost.partnerName}</p>
                </div>

                {/* Listings with this host */}
                <div className="flex gap-2 overflow-x-auto px-4 py-2 border-b border-gray-200 bg-white">
                  {activeHost.threads.map((t) => {
                    const key = threadKey(t);
                    const on = threadKey(activeThread) === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveThreadKey(key)}
                        className={`shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border ${
                          on ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 hover:border-gray-900'
                        }`}
                      >
                        {t.listingType === 'car' ? '🚗' : '🏠'} {t.listingTitle}
                        {Number(t.unreadCount) > 0 && !on && <span className="ml-1 text-rose-500">●</span>}
                      </button>
                    );
                  })}
                  <Link
                    to={activeThread.listingType === 'car' ? `/car/${activeThread.carId}` : `/property/${activeThread.propertyId}`}
                    className="shrink-0 text-xs text-gray-500 underline self-center ml-auto"
                  >
                    View listing
                  </Link>
                </div>

                <Conversation
                  key={`${activeHost.partnerId}-${threadKey(activeThread)}`}
                  host={activeHost}
                  thread={activeThread}
                  token={token}
                  onSent={loadThreads}
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-gray-500 text-sm p-6 text-center">
                Select a host to see your conversation.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}