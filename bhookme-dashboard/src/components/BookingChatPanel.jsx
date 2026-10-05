import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const REFRESH_MS = 15000;

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

// Chat modal shown when a host clicks "Message guest" on a booking.
// `booking` is the merged HostBookingsTab row; `kind` is 'house' or 'car'.
export default function BookingChatPanel({ booking, kind, onClose }) {
  const { token } = useAuth();
  const isHouse = kind === 'house';
  const listingId = isHouse ? booking.propertyId : booking.carId;
  const listingTitle = isHouse ? booking.propertyTitle : `${booking.make} ${booking.model}`;
  const listingLink = isHouse ? `/property/${booking.propertyId}` : `/car/${booking.carId}`;
  const guestId = booking.guestUserId || booking.guest?.id;
  const guestName = [booking.guestFirstName, booking.guestLastName].filter(Boolean).join(' ') || 'Guest';

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const conversationUrl = isHouse
    ? `${API_BASE_URL}/messages/conversation/property/${listingId}/with/${guestId}`
    : `${API_BASE_URL}/messages/conversation/car/${listingId}/with/${guestId}`;

  const load = useCallback(
    (quiet) => {
      if (!guestId) {
        setError('Could not find the guest for this booking.');
        setLoading(false);
        return Promise.resolve();
      }
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
    [conversationUrl, token, guestId]
  );

  useEffect(() => {
    load(false);
    const timer = setInterval(() => load(true), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  // Escape closes the modal
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = async (e) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !guestId) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/messages/reply/${guestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          content,
          subject: `Re: ${listingTitle}`,
          ...(isHouse ? { propertyId: listingId } : { carId: listingId }),
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not send your message.');
      setMessages((prev) => [...prev, data]);
      setDraft('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Message ${guestName}`}
      onClick={(e) => {
        // Click outside the panel closes it
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200">
          <span className="w-9 h-9 rounded-full bg-gray-900 text-white text-sm font-semibold flex items-center justify-center shrink-0">
            {initials(guestName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold truncate">{guestName}</p>
            <Link to={listingLink} className="text-xs text-gray-500 hover:underline truncate block">
              {isHouse ? '🏠' : '🚗'} {listingTitle}
            </Link>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-xl text-gray-500 shrink-0"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50">
          {loading && <p className="text-sm text-gray-500">Loading conversation...</p>}
          {!loading && messages.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">
              No messages yet. Send the first one below.
            </p>
          )}
          {!loading &&
            messages.map((m) => {
              const mine = m.senderId !== guestId;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-line ${
                      mine
                        ? 'bg-gray-900 text-white rounded-br-sm'
                        : 'bg-white border border-gray-200 rounded-bl-sm'
                    }`}
                  >
                    <p>{m.content}</p>
                    <p className={`text-[11px] mt-1 ${mine ? 'text-gray-300' : 'text-gray-400'}`}>
                      {m.formattedTime || shortTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })}
          <div ref={bottomRef} />
        </div>

        {error && <p className="text-sm text-red-500 px-4 pt-2">{error}</p>}

        {/* Composer */}
        <form onSubmit={send} className="flex items-end gap-2 p-3 border-t border-gray-200">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) send(e);
            }}
            rows={1}
            placeholder={`Message ${guestName.split(' ')[0]}...`}
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
    </div>
  );
}