import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

export default function MessageHostPanel({ propertyId, carId, hostId, hostName }) {
  const { user, token, isAuthenticated } = useAuth();
  const [showMessages, setShowMessages] = useState(false);
  const [messageThread, setMessageThread] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageContent, setMessageContent] = useState('');
  const [messageSending, setMessageSending] = useState(false);
  const [messageError, setMessageError] = useState('');
  const refreshInterval = useRef(null);

  const isOwnListing = isAuthenticated && user && user.id === hostId;

  const conversationEndpoint = propertyId
    ? `${API_BASE_URL}/messages/conversation/property/${propertyId}/with/${hostId}`
    : `${API_BASE_URL}/messages/conversation/car/${carId}/with/${hostId}`;

  const fetchMessages = async () => {
    try {
      const res = await fetch(conversationEndpoint, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMessageThread(data);
      }
    } catch (err) {
      console.error('Error fetching messages:', err);
    }
  };

  useEffect(() => {
    if (showMessages && user) {
      fetchMessages();
      refreshInterval.current = setInterval(fetchMessages, 10000);
      return () => {
        if (refreshInterval.current) clearInterval(refreshInterval.current);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMessages, user]);

  const handleToggleMessages = async () => {
    if (!isAuthenticated) return;
    const next = !showMessages;
    setShowMessages(next);
    if (next) {
      setMessagesLoading(true);
      await fetchMessages();
      setMessagesLoading(false);
      setTimeout(() => {
        const el = document.getElementById('message-thread');
        if (el) el.scrollTop = el.scrollHeight;
      }, 200);
    } else if (refreshInterval.current) {
      clearInterval(refreshInterval.current);
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!messageContent.trim()) return;

    setMessageSending(true);
    setMessageError('');

    try {
      const res = await fetch(`${API_BASE_URL}/messages/send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: propertyId || null,
          carId: carId || null,
          content: messageContent,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setMessageThread((prev) => [...prev, data]);
        setMessageContent('');
        setTimeout(() => {
          const el = document.getElementById('message-thread');
          if (el) el.scrollTop = el.scrollHeight;
        }, 100);
      } else {
        setMessageError(data.message || 'Failed to send message.');
      }
    } catch (err) {
      setMessageError('Network error. Please try again.');
    } finally {
      setMessageSending(false);
    }
  };

  if (isOwnListing) return null;

  return (
    <div className="border-t border-b border-gray-200 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-sm text-gray-500">Have a question?</p>
          <p className="font-semibold text-sm">{hostName}</p>
        </div>
        <button
          onClick={handleToggleMessages}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg transition text-sm min-h-[40px] ${
            showMessages ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-rose-50 text-rose-600 hover:bg-rose-100'
          }`}
        >
          {showMessages ? 'Close' : 'Message host'}
        </button>
      </div>

      {showMessages && !isAuthenticated && (
        <p className="text-sm text-gray-500">Please log in to message the host.</p>
      )}

      {showMessages && isAuthenticated && (
        <div className="border rounded-lg overflow-hidden bg-gray-50">
          <div className="p-3 bg-gray-100 border-b flex justify-between items-center">
            <h3 className="font-semibold text-sm text-gray-700">Conversation with {hostName}</h3>
          </div>

          <div id="message-thread" className="p-3 max-h-[250px] overflow-y-auto space-y-2">
            {messagesLoading ? (
              <div className="text-center text-gray-500 text-sm py-3">Loading messages...</div>
            ) : messageThread.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-3">No messages yet. Start the conversation!</div>
            ) : (
              messageThread.map((msg) => (
                <div key={msg.id} className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] rounded-lg px-3 py-2 ${msg.senderId === user?.id ? 'bg-rose-500 text-white' : 'bg-gray-200 text-gray-800'}`}>
                    <div className="text-sm break-words">{msg.content}</div>
                    <div className={`text-[10px] mt-1 ${msg.senderId === user?.id ? 'text-rose-100' : 'text-gray-500'}`}>
                      {msg.senderId === user?.id ? 'You' : msg.senderName} • {msg.formattedTime}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t bg-white">
            {messageError && <div className="text-red-500 text-sm mb-2">{messageError}</div>}
            <form onSubmit={handleSendMessage} className="flex gap-2">
              <input
                type="text"
                value={messageContent}
                onChange={(e) => setMessageContent(e.target.value)}
                placeholder="Type your message..."
                className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 text-sm min-h-[40px]"
                required
              />
              <button
                type="submit"
                disabled={messageSending || !messageContent.trim()}
                className="bg-rose-500 text-white px-4 py-2 rounded-lg hover:bg-rose-600 disabled:opacity-50 text-sm min-h-[40px]"
              >
                {messageSending ? '...' : 'Send'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}