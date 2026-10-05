import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const REFRESH_MS = 15000; // re-check for new messages every 15 seconds

function threadKey(t) {
  return `${t.partnerId}-${t.listingType}-${t.propertyId || t.carId}`;
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

function initials(name) {
  return (name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

function Conversation({ thread, token, onBack, onSent }) {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const conversationUrl =
    thread.listingType === 'car'
      ? `${API_BASE_URL}/messages/conversation/car/${thread.carId}/with/${thread.partnerId}`
      : `${API_BASE_URL}/messages/conversation/property/${thread.propertyId}/with/${thread.partnerId}`;

  const load = useCallback(
    (quiet) => {
      if (!quiet) setLoading(true);
      return fetch(conversationUrl, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error((data && data.message) || 'Could not load this conversation.');
          setMessages(Array.isArray(data) ? data : []);
          setError('');
        })
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    },
    [conversationUrl, token]
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
      const res = await fetch(`${API_BASE_URL}/messages/reply/${thread.partnerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content,
          subject: `Re: ${thread.listingTitle}`,
          ...(thread.listingType === 'car' ? { carId: thread.carId } : { propertyId: thread.propertyId }),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not send your reply.');
      setMessages((prev) => [...prev, data]);
      setDraft('');
      onSent();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  const listingLink = thread.listingType === 'car' ? `/car/${thread.carId}` : `/property/${thread.propertyId}`;

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
        <button type="button" onClick={onBack} className="md:hidden text-xl px-1" aria-label="Back to all messages">
          ‹
        </button>
        <span className="w-9 h-9 rounded-full bg-gray-900 text-white text-sm font-semibold flex items-center justify-center shrink-0">
          {initials(thread.partnerName)}
        </span>
        <div className="min-w-0">
          <p className="font-semibold truncate">{thread.partnerName}</p>
          <Link to={listingLink} className="text-xs text-gray-500 hover:underline truncate block">
            {thread.listingType === 'car' ? '🚗' : '🏠'} {thread.listingTitle}
          </Link>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
        {loading && <p className="text-sm text-gray-500">Loading conversation...</p>}
        {!loading &&
          messages.map((m) => {
            const mine = m.senderId !== thread.partnerId;
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

      <form onSubmit={send} className="flex items-end gap-2 p-3 border-t border-gray-200">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) send(e);
          }}
          rows={1}
          placeholder={`Reply to ${thread.partnerName.split(' ')[0]}...`}
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

export default function HostMessagesTab() {
  const { token } = useAuth();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeKey, setActiveKey] = useState(null);
  const [filter, setFilter] = useState('all');

  const loadThreads = useCallback(
    () =>
      fetch(`${API_BASE_URL}/messages/threads`, { headers: { Authorization: `Bearer ${token}` } })
        .then(async (res) => {
          const data = await res.json().catch(() => null);
          if (!res.ok) throw new Error((data && data.message) || 'Could not load your messages.');
          // Only conversations with guests about this host's own listings.
          setThreads(Array.isArray(data) ? data.filter((t) => t.iAmListingHost !== false) : []);
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

  const active = threads.find((t) => threadKey(t) === activeKey) || null;
  const unreadTotal = threads.reduce((sum, t) => sum + Number(t.unreadCount || 0), 0);
  const shown = filter === 'unread' ? threads.filter((t) => Number(t.unreadCount) > 0) : threads;

  const open = (t) => {
    setActiveKey(threadKey(t));
    // Opening a conversation marks it read on the server; reflect that right away.
    setThreads((prev) => prev.map((x) => (threadKey(x) === threadKey(t) ? { ...x, unreadCount: 0 } : x)));
  };

  if (loading) return <p className="text-gray-500">Loading your messages...</p>;

  if (!error && threads.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
        <p className="text-4xl mb-3" aria-hidden="true">💬</p>
        <p className="font-semibold mb-1">No messages yet</p>
        <p className="text-gray-500 text-sm">When a guest messages you about one of your listings, the conversation shows up here.</p>
      </div>
    );
  }

  return (
    <div>
      {error && <p className="text-red-500 mb-3">{error}</p>}

      <div className="border border-gray-200 rounded-xl overflow-hidden bg-white grid md:grid-cols-[320px_minmax(0,1fr)] h-[70vh] min-h-[480px]">
        {/* Thread list */}
        <div className={`border-r border-gray-200 flex flex-col min-h-0 ${active ? 'hidden md:flex' : 'flex'}`}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200">
            {['all', 'unread'].map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-sm font-medium border ${
                  filter === f ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 hover:border-gray-900'
                }`}
              >
                {f === 'all' ? 'All' : `Unread${unreadTotal ? ` (${unreadTotal})` : ''}`}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {shown.length === 0 && <p className="text-sm text-gray-500 p-4">No unread messages.</p>}
            {shown.map((t) => {
              const key = threadKey(t);
              const unread = Number(t.unreadCount) > 0;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => open(t)}
                  className={`w-full flex gap-3 px-4 py-3 text-left border-b border-gray-100 transition ${
                    activeKey === key ? 'bg-gray-100' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="w-10 h-10 rounded-full bg-gray-900 text-white text-sm font-semibold flex items-center justify-center shrink-0">
                    {initials(t.partnerName)}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center justify-between gap-2">
                      <span className={`truncate ${unread ? 'font-bold' : 'font-medium'}`}>{t.partnerName}</span>
                      <span className="text-xs text-gray-400 shrink-0">{shortTime(t.lastMessageTime)}</span>
                    </span>
                    <span className="block text-xs text-gray-500 truncate">
                      {t.listingType === 'car' ? '🚗' : '🏠'} {t.listingTitle}
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={`text-sm truncate ${unread ? 'text-gray-900' : 'text-gray-500'}`}>
                        {t.lastFromMe ? 'You: ' : ''}
                        {t.lastMessage}
                      </span>
                      {unread && (
                        <span className="shrink-0 bg-rose-500 text-white text-xs font-semibold rounded-full px-2 py-0.5">
                          {t.unreadCount}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Conversation */}
        <div className={`min-h-0 ${active ? 'flex flex-col' : 'hidden md:flex md:flex-col'}`}>
          {active ? (
            <Conversation
              key={activeKey}
              thread={active}
              token={token}
              onBack={() => setActiveKey(null)}
              onSent={loadThreads}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 text-sm p-6 text-center">
              Pick a conversation to read and reply.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}