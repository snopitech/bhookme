import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const TOPICS = [
  { id: 'GENERAL', label: 'General question' },
  { id: 'BOOKING', label: 'A booking' },
  { id: 'PAYMENT', label: 'Payments' },
  { id: 'CANCELLATION', label: 'Cancellations' },
  { id: 'SAFETY', label: 'Safety issue' },
  { id: 'HOSTING', label: 'Hosting' },
  { id: 'ACCOUNT', label: 'My account' },
  { id: 'OTHER', label: 'Something else' },
];

const SECTIONS = [
  {
    id: 'booking',
    title: 'Booking & payments',
    faqs: [
      {
        q: 'How do I book a home or car?',
        a: 'Open the listing, pick your dates (and guests for homes), and tap Reserve. You can see every booking in Trips (your Tenant dashboard).',
      },
      {
        q: 'When am I charged?',
        a: "Online payment is still being connected. Until then, bookings are held at their quoted price and nothing is charged. You'll be told clearly before any payment is taken.",
      },
      {
        q: 'Can I message the host before booking?',
        a: 'Yes. Every listing has a Message host box. Your conversations appear under Messages in your profile menu.',
      },
    ],
  },
  {
    id: 'cancellations',
    title: 'Cancellation options',
    faqs: [
      {
        q: 'How do I cancel a booking?',
        a: 'Go to Trips (Tenant dashboard), find the booking, and tap Cancel. Upcoming bookings can be cancelled before the stay or rental starts.',
      },
      {
        q: 'Will I get a refund?',
        a: "Since payments aren't being charged yet, there's nothing to refund today. Refund rules will be shown on each listing once online payment goes live.",
      },
    ],
  },
  {
    id: 'safety',
    title: 'Safety',
    faqs: [
      {
        q: 'I feel unsafe right now. What should I do?',
        a: 'If you are in immediate danger, call your local emergency number (911 in the US) first. Then contact us using the form below with the topic "Safety issue" so we can help.',
      },
      {
        q: 'How do I report a listing or a host?',
        a: 'Use the contact form below, choose "Safety issue", and include the listing link. Our team reviews every safety report.',
      },
    ],
  },
  {
    id: 'hosting',
    title: 'Hosting',
    faqs: [
      {
        q: 'How do I become a host?',
        a: 'Tap Become a host, set a host password, and tell us about your place. Once approved, verify with your password and email code to open the host dashboard.',
      },
      {
        q: 'Why do I need a code to open my host dashboard?',
        a: 'Your host dashboard controls your listings, guests and earnings, so we ask for your password and a code sent to your email to keep it safe.',
      },
    ],
  },
];

function Faq({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-4 py-4 text-left font-medium"
      >
        {q}
        <span className={`text-xl text-gray-400 transition-transform ${open ? 'rotate-45' : ''}`} aria-hidden="true">
          +
        </span>
      </button>
      {open && <p className="pb-4 text-gray-600">{a}</p>}
    </div>
  );
}

function ContactForm({ initialTopic }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: user ? `${user.firstName || ''} ${user.lastName || ''}`.trim() : '',
    email: user?.email || '',
    topic: initialTopic,
    message: '',
    website: '', // honeypot
  });
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    setForm((f) => ({ ...f, topic: initialTopic }));
  }, [initialTopic]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    setStatus(null);
    try {
      const res = await fetch(`${API_BASE_URL}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      setStatus({ ok: res.ok, message: (data && data.message) || (res.ok ? 'Message sent.' : 'Could not send.') });
      if (res.ok) setForm((f) => ({ ...f, message: '' }));
    } catch {
      setStatus({ ok: false, message: 'Could not reach the server. Please try again.' });
    } finally {
      setSending(false);
    }
  };

  const input =
    'w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500';

  return (
    <form onSubmit={submit} className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
      {initialTopic === 'SAFETY' && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          If you are in immediate danger, call 911 (or your local emergency number) first.
        </div>
      )}
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className="block text-sm font-medium mb-1">Your name</span>
          <input className={input} value={form.name} onChange={set('name')} required maxLength={150} />
        </label>
        <label className="block">
          <span className="block text-sm font-medium mb-1">Email</span>
          <input type="email" className={input} value={form.email} onChange={set('email')} required />
        </label>
      </div>
      <label className="block">
        <span className="block text-sm font-medium mb-1">What's this about?</span>
        <select className={input} value={form.topic} onChange={set('topic')}>
          {TOPICS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="block text-sm font-medium mb-1">Message</span>
        <textarea
          rows={6}
          className={input}
          value={form.message}
          onChange={set('message')}
          required
          minLength={10}
          maxLength={5000}
          placeholder="Tell us what's going on. Include a listing link or booking date if it helps."
        />
      </label>
      {/* Honeypot: hidden from people, filled in by spam bots. */}
      <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} className="hidden" aria-hidden="true" />

      {status && (
        <p className={`text-sm ${status.ok ? 'text-green-700' : 'text-red-600'}`} role="status">
          {status.message}
        </p>
      )}

      <button
        type="submit"
        disabled={sending}
        className="w-full sm:w-auto bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50"
      >
        {sending ? 'Sending...' : 'Send message'}
      </button>
    </form>
  );
}

export default function HelpPage() {
  const { search, hash } = useLocation();
  const params = new URLSearchParams(search);
  const topicParam = (params.get('topic') || '').toUpperCase();
  const initialTopic = TOPICS.some((t) => t.id === topicParam) ? topicParam : 'GENERAL';

  // Jump to #contact / #cancellations etc. when linked from the footer.
  useEffect(() => {
    if (!hash) {
      window.scrollTo(0, 0);
      return;
    }
    const el = document.getElementById(hash.slice(1));
    if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [hash, search]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-3xl font-bold mb-2">Help Center</h1>
      <p className="text-gray-600 mb-6">Answers to common questions, and a way to reach us if you need more help.</p>

      <div className="flex flex-wrap gap-2 mb-10">
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className="px-4 py-2 rounded-full border border-gray-300 text-sm font-medium hover:border-gray-900">
            {s.title}
          </a>
        ))}
        <a href="#contact" className="px-4 py-2 rounded-full bg-gray-900 text-white text-sm font-medium">
          Contact us
        </a>
      </div>

      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id} className="mb-10 scroll-mt-40">
          <h2 className="text-xl font-semibold mb-2">{s.title}</h2>
          {s.faqs.map((f) => (
            <Faq key={f.q} q={f.q} a={f.a} />
          ))}
        </section>
      ))}

      <section id="contact" className="scroll-mt-40">
        <h2 className="text-xl font-semibold mb-1">Contact us</h2>
        <p className="text-gray-600 mb-4">
          Send us a message and we'll reply by email, usually within 1-2 business days. Already talking to a host? Use{' '}
          <Link to="/messages" className="underline">Messages</Link> instead.
        </p>
        <ContactForm initialTopic={initialTopic} />
      </section>
    </div>
  );
}