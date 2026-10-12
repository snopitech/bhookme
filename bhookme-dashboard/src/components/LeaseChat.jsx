import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

// ============================================================
// LeaseChat - messages between the tenant and the host about one
// lease application. Used in the host's Monthly Leases >
// Applications cards and in the tenant's Dashboard > Leases cards.
// Refreshes every 10 seconds while open. Opening it marks the
// other person's messages as read.
// ============================================================

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

function timeLabel(value) {
  if (!value) return '';
  const d = new Date(String(value).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function LeaseChat({ applicationId, otherName, closed = false, onRead }) {
  const { token } = useAuth();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);
  const lastCount = useRef(0);

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/lease-applications/${applicationId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not load messages.');
      setMessages(Array.isArray(data) ? data : []);
      if (onRead) onRead();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 10000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId, token]);

  // Scroll to the newest message when a new one arrives.
  useEffect(() => {
    if (messages.length !== lastCount.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    lastCount.current = messages.length;
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/lease-applications/${applicationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: text.trim() }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not send your message.');
      setMessages((prev) => [...prev, data]);
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-gray-50">
      <div className="px-4 py-2 border-b border-gray-200 text-sm font-medium text-gray-700">
        💬 Conversation with {otherName || 'the other party'}
      </div>

      <div ref={listRef} className="max-h-72 overflow-y-auto px-4 py-3 space-y-2">
        {loading && <p className="text-sm text-gray-500">Loading messages...</p>}
        {!loading && messages.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-4">No messages yet. Say hello!</p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                m.mine ? 'bg-rose-500 text-white rounded-br-sm' : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm'
              }`}
            >
              {!m.mine && m.senderName && <p className="text-xs font-semibold text-gray-500 mb-0.5">{m.senderName}</p>}
              <p className="whitespace-pre-line break-words">{m.content}</p>
              <p className={`text-[10px] mt-1 ${m.mine ? 'text-rose-100' : 'text-gray-400'}`}>
                {timeLabel(m.createdAt)}
                {m.mine && m.read ? ' · Seen' : ''}
              </p>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="px-4 pb-2 text-sm text-red-600">{error}</p>}

      {closed ? (
        <p className="px-4 py-3 border-t border-gray-200 text-sm text-gray-500">Messaging is closed for this application.</p>
      ) : (
        <form onSubmit={send} className="flex gap-2 p-3 border-t border-gray-200">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={2000}
            placeholder={`Message ${otherName || ''}...`.replace(' ...', '...')}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </form>
      )}
    </div>
  );
}