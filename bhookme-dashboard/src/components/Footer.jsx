import React, { useState } from 'react';
import { Link } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const COLUMNS = [
  {
    title: 'Support',
    links: [
      { label: 'Help Center', to: '/help' },
      { label: 'Get help with a safety issue', to: '/help?topic=SAFETY#contact' },
      { label: 'Cancellation options', to: '/help#cancellations' },
      { label: 'Contact us', to: '/help#contact' },
    ],
  },
  {
    title: 'Hosting',
    links: [
      { label: 'Become a host', to: '/become-host' },
      { label: 'Responsible hosting', to: '/info/responsible-hosting' },
      { label: 'Hosting help', to: '/help?topic=HOSTING#contact' },
    ],
  },
  {
    title: 'bhookme',
    links: [
      { label: 'Explore', to: '/explore' },
      { label: 'Newsroom', to: '/info/newsroom' },
      { label: 'Careers', to: '/info/careers' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Terms of Service', to: '/info/terms' },
      { label: 'Privacy Policy', to: '/info/privacy' },
    ],
  },
];

function NewsletterSignup() {
  const [email, setEmail] = useState('');
  const [trap, setTrap] = useState(''); // hidden field bots fill in
  const [status, setStatus] = useState(null); // { ok, message }
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE_URL}/newsletter/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website: trap }),
      });
      const data = await res.json().catch(() => null);
      setStatus({ ok: res.ok, message: (data && data.message) || (res.ok ? 'Subscribed!' : 'Could not subscribe.') });
      if (res.ok) setEmail('');
    } catch {
      setStatus({ ok: false, message: 'Could not reach the server. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h3 className="font-semibold mb-1">Stay in the loop</h3>
      <p className="text-sm text-gray-600 mb-3">New homes, cars, experiences and deals, straight to your inbox.</p>
      <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2">
        <label htmlFor="footer-newsletter-email" className="sr-only">Email address</label>
        <input
          id="footer-newsletter-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="flex-1 min-w-0 px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
        {/* Honeypot: hidden from people, filled in by spam bots. */}
        <input
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={trap}
          onChange={(e) => setTrap(e.target.value)}
          className="hidden"
          aria-hidden="true"
        />
        <button
          type="submit"
          disabled={sending}
          className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg transition disabled:opacity-50"
        >
          {sending ? 'Subscribing...' : 'Subscribe'}
        </button>
      </form>
      {status && (
        <p className={`text-sm mt-2 ${status.ok ? 'text-green-700' : 'text-red-600'}`} role="status">
          {status.message}
        </p>
      )}
    </div>
  );
}

export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-6 lg:mt-16">
      <div className="max-w-7xl mx-auto px-6 pt-10 pb-6 border-b border-gray-200">
        <NewsletterSignup />
      </div>

      <div className="max-w-7xl mx-auto px-6 py-10 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        {COLUMNS.map((col) => (
          <div key={col.title}>
            <h3 className="font-semibold mb-3">{col.title}</h3>
            <ul className="space-y-2 text-gray-600">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link to={link.to} className="hover:underline hover:text-gray-900">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t border-gray-200 py-4 px-6 max-w-7xl mx-auto flex flex-col sm:flex-row gap-2 justify-between items-center text-sm text-gray-500">
        <span>© {new Date().getFullYear()} bhookme, Inc.</span>
        <div className="flex items-center gap-4">
          <Link to="/info/terms" className="hover:underline">Terms</Link>
          <Link to="/info/privacy" className="hover:underline">Privacy</Link>
          <span>United States (USD $)</span>
        </div>
      </div>
    </footer>
  );
}