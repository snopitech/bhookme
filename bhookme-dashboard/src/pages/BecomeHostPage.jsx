import React, { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const STATUS_COPY = {
  PENDING: {
    title: 'Application under review',
    body: "We're reviewing your application to host on bhookme. We'll email you once a decision is made.",
  },
  REJECTED: {
    title: 'Application not approved',
    body: "We weren't able to approve your host application this time.",
  },
};

function NoHostAccountNotice({ email }) {
  return (
    <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-sm">
      <p className="font-semibold">We found no host account associated with this email.</p>
      <p className="mt-1">
        <span className="font-medium">{email}</span> isn't an approved host yet. Fill in the form below to apply.
      </p>
    </div>
  );
}

// ------------------------------------------------------------
// Shared pieces
// ------------------------------------------------------------

function HostLoginForm({ email, onCodeSent }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Forgot-password sub-flow
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState(email || '');
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/host-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onCodeSent();
      } else {
        setError(data.message || 'Login failed. Please check your password.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setForgotSubmitting(true);
    try {
      await fetch(`${API_BASE_URL}/auth/host-forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: forgotEmail }),
      });
      // Backend always returns success (never reveals whether the
      // email is registered), so we just show the confirmation.
      setForgotSent(true);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setForgotSubmitting(false);
    }
  };

  // ===== FORGOT PASSWORD SCREEN =====
  if (showForgot) {
    return (
      <div className="max-w-md mx-auto px-6 py-10">
        <div className="text-center mb-6">
          <p className="text-4xl mb-2">🔑</p>
          <h1 className="text-2xl font-bold">Reset your host password</h1>
          <p className="text-sm text-gray-500 mt-2">
            Enter the email on your host account and we'll send you a link to set a new password.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        {forgotSent ? (
          <div className="p-4 bg-green-50 border border-green-200 text-green-800 rounded-lg text-sm">
            <p className="font-semibold">Check your email</p>
            <p className="mt-1">
              If a host account exists with <span className="font-medium">{forgotEmail}</span>, we've sent
              a password reset link. It expires in 24 hours.
            </p>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                required
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
              />
            </div>
            <button
              type="submit"
              disabled={forgotSubmitting}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
            >
              {forgotSubmitting ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <button
          type="button"
          onClick={() => { setShowForgot(false); setForgotSent(false); setError(''); }}
          className="mt-4 w-full text-sm text-gray-500 hover:text-gray-800"
        >
          ← Back to login
        </button>
      </div>
    );
  }

  // ===== NORMAL LOGIN SCREEN =====
  return (
    <div className="max-w-md mx-auto px-6 py-10">
      <div className="text-center mb-6">
        <p className="text-4xl mb-2">🏠</p>
        <h1 className="text-2xl font-bold">Switch to hosting</h1>
        <p className="text-gray-500 mt-1">{email}</p>
        <p className="text-sm text-gray-500 mt-2">
          For your security, confirm it's you. Enter your host password and we'll email you a 6-digit code.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Sending code...' : 'Continue'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <button
          type="button"
          onClick={() => { setShowForgot(true); setError(''); }}
          className="text-sm text-rose-500 hover:underline font-medium"
        >
          Forgot your password?
        </button>
      </div>
    </div>
  );
}

function HostVerifyForm({ email, onVerified }) {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [timeLeft, setTimeLeft] = useState(300);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (timeLeft <= 0) {
      setCanResend(true);
      return;
    }
    const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft]);

  const submitCode = async (codeString) => {
    if (codeString.length !== 6) {
      setError('Please enter all 6 digits');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/host-verify-totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: codeString }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onVerified(data);
      } else {
        setError(data.message || 'Invalid verification code. Please try again.');
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (code.every((digit) => digit !== '')) {
      submitCode(code.join(''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleChange = (index, value) => {
    if (value && !/^\d+$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(0, 1);
    setCode(newCode);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pasted)) {
      setCode(pasted.split(''));
    }
  };

  const handleResend = async () => {
    if (!canResend) return;
    setResending(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/host-resend-totp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage('New verification code sent to your email.');
        setTimeLeft(300);
        setCanResend(false);
        setCode(['', '', '', '', '', '']);
        inputRefs.current[0]?.focus();
      } else {
        setError(data.message || 'Failed to resend code.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setResending(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-md mx-auto px-6 py-10">
      <div className="text-center mb-6">
        <p className="text-4xl mb-2">🔐</p>
        <h1 className="text-2xl font-bold">Verify your identity</h1>
        <p className="text-sm text-gray-500 mt-1">Enter the 6-digit code sent to your email</p>
        <p className="text-xs text-gray-400 mt-1">{email}</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}
      {message && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 text-green-700 rounded-lg text-sm">{message}</div>
      )}

      <div className="grid grid-cols-6 gap-2 mb-6">
        {code.map((digit, index) => (
          <input
            key={index}
            ref={(el) => (inputRefs.current[index] = el)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(index, e.target.value)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onPaste={index === 0 ? handlePaste : undefined}
            disabled={loading}
            autoFocus={index === 0}
            className="w-full aspect-square text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        ))}
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          Code expires in <span className={timeLeft < 60 ? 'text-red-600 font-semibold' : 'font-semibold'}>{formatTime(timeLeft)}</span>
        </span>
        <button
          onClick={handleResend}
          disabled={!canResend || resending}
          className={`font-medium ${canResend && !resending ? 'text-rose-500 hover:underline' : 'text-gray-400 cursor-not-allowed'}`}
        >
          {resending ? 'Sending...' : 'Resend code'}
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Guest (not logged in) flow
// ------------------------------------------------------------

function GuestEmailForm({ onChecked }) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/check-host?email=${encodeURIComponent(email)}`);
      const data = await res.json();
      onChecked(email, data.accountExists, data.isHost);
    } catch (err) {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-2">Become a host</h1>
      <p className="text-gray-500 mb-6">Enter your email to get started.</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Checking...' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

function GuestApplyForm({ email, onSubmitted }) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/host-applications/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email, password, message }),
      });
      const data = await res.json();
      if (res.ok) {
        onSubmitted();
      } else {
        setError(data.message || 'Could not submit your application.');
      }
    } catch (err) {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-4">Become a host</h1>

      <NoHostAccountNotice email={email} />

      <p className="text-gray-500 mb-6">
        Create your account and tell us a bit about what you'd like to host. If approved, this password logs you in.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">First name</label>
            <input
              type="text"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Last name</label>
            <input
              type="text"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Create a password</label>
          <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
          <p className="text-xs text-gray-500 mt-1">This is what you'll use to log in once approved.</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Tell us about your place (optional)</label>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. I have a two-bedroom apartment in Houston I'd like to list..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit application'}
        </button>
      </form>
    </div>
  );
}

function GuestExistingAccountNotice({ email }) {
  return (
    <div className="max-w-md mx-auto px-6 py-10 text-center">
      <p className="text-4xl mb-4">👋</p>
      <h1 className="text-2xl font-bold mb-2">We found no host account associated with this email</h1>
      <p className="text-gray-500 mb-6">
        {email} has a bhookme guest account but isn't an approved host. Log in, then come back to Become a host to apply.
      </p>
      <Link to="/login" className="text-rose-500 font-medium hover:underline">
        Go to login
      </Link>
    </div>
  );
}

// ------------------------------------------------------------
// Logged-in, not-a-host: application form
// ------------------------------------------------------------

function AuthenticatedApplyForm({ email, token, onSubmitted }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const passwordRes = await fetch(`${API_BASE_URL}/auth/set-password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: password }),
      });
      const passwordData = await passwordRes.json();
      if (!passwordRes.ok || !passwordData.success) {
        throw new Error(passwordData.message || 'Failed to set password');
      }

      const res = await fetch(`${API_BASE_URL}/host-applications`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (res.ok) {
        onSubmitted();
      } else {
        setError(data.message || 'Could not submit your application.');
      }
    } catch (err) {
      setError(err.message || 'Could not reach the server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-6 py-10">
      <h1 className="text-2xl font-bold mb-4">Become a host</h1>

      <NoHostAccountNotice email={email} />

      <p className="text-gray-500 mb-6">
        Set a password for host login, then tell us a bit about what you'd like to host.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="border-b border-gray-200 pb-5 mb-1">
          <h2 className="text-sm font-semibold mb-3">1. Set a host password</h2>
          <p className="text-xs text-gray-500 mb-3">
            You'll use <span className="font-medium">{email}</span> and this password to log in to your host dashboard once approved.
          </p>

          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-4 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-sm font-medium mb-1">Password</label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Confirm password</label>
              <PasswordInput value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} minLength={6} />
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold mb-2">2. Tell us about your place</h2>
          <label className="block text-sm font-medium mb-1">Message (optional)</label>
          <textarea
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. I have a two-bedroom apartment in Houston I'd like to list..."
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Set password & apply'}
        </button>
      </form>
    </div>
  );
}

// ------------------------------------------------------------
// Main page
// ------------------------------------------------------------

export default function BecomeHostPage() {
  const { user, token, isAuthenticated, setSessionFromResponse, startHostSession, hostVerified } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const returnTo = location.state?.from?.pathname?.startsWith('/host/')
    ? location.state.from.pathname
    : '/host/dashboard';

  const [loadingStatus, setLoadingStatus] = useState(true);
  const [application, setApplication] = useState(null);
  const [hostStep, setHostStep] = useState('login');
  const [guestStep, setGuestStep] = useState('email');
  const [guestEmail, setGuestEmail] = useState('');
  const [justSubmitted, setJustSubmitted] = useState(false);

  const isHost = isAuthenticated && !!user?.isHost;

  useEffect(() => {
    if (!isAuthenticated || isHost) {
      setLoadingStatus(false);
      return;
    }
    fetch(`${API_BASE_URL}/host-applications/mine`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        setApplication(data);
        setLoadingStatus(false);
      })
      .catch(() => setLoadingStatus(false));
  }, [isAuthenticated, isHost, token]);

  const handleVerified = (data) => {
    setSessionFromResponse(data);
    startHostSession(data.email);
    navigate(returnTo);
  };

  if (isHost) {
    if (hostVerified) {
      return <Navigate to={returnTo} replace />;
    }
    if (hostStep === 'login') {
      return <HostLoginForm email={user.email} onCodeSent={() => setHostStep('verify')} />;
    }
    return <HostVerifyForm email={user.email} onVerified={handleVerified} />;
  }

  if (!isAuthenticated) {
    if (guestStep === 'email') {
      return (
        <GuestEmailForm
          onChecked={(email, accountExists, hostAlready) => {
            setGuestEmail(email);
            if (hostAlready) {
              setGuestStep('password');
            } else if (accountExists) {
              setGuestStep('exists');
            } else {
              setGuestStep('apply');
            }
          }}
        />
      );
    }
    if (guestStep === 'password') {
      return <HostLoginForm email={guestEmail} onCodeSent={() => setGuestStep('verify')} />;
    }
    if (guestStep === 'verify') {
      return <HostVerifyForm email={guestEmail} onVerified={handleVerified} />;
    }
    if (guestStep === 'exists') {
      return <GuestExistingAccountNotice email={guestEmail} />;
    }
    if (guestStep === 'apply') {
      return <GuestApplyForm email={guestEmail} onSubmitted={() => setGuestStep('submitted')} />;
    }
    return (
      <div className="max-w-md mx-auto px-6 py-10 text-center">
        <p className="text-4xl mb-4">📋</p>
        <h1 className="text-2xl font-bold mb-2">{STATUS_COPY.PENDING.title}</h1>
        <p className="text-gray-500">{STATUS_COPY.PENDING.body}</p>
      </div>
    );
  }

  if (loadingStatus) {
    return <div className="max-w-md mx-auto px-6 py-10 text-gray-500">Loading...</div>;
  }

  if (!justSubmitted && application && application.status !== 'REJECTED') {
    const copy = STATUS_COPY[application.status] || STATUS_COPY.PENDING;
    return (
      <div className="max-w-md mx-auto px-6 py-10 text-center">
        <p className="text-4xl mb-4">📋</p>
        <h1 className="text-2xl font-bold mb-2">{copy.title}</h1>
        <p className="text-gray-500">{copy.body}</p>
      </div>
    );
  }

  if (justSubmitted) {
    return (
      <div className="max-w-md mx-auto px-6 py-10 text-center">
        <p className="text-4xl mb-4">🎉</p>
        <h1 className="text-2xl font-bold mb-2">Application submitted!</h1>
        <p className="text-gray-500">
          We'll review your application and get back to you by email. Once approved, use {user.email} and the password
          you just set to log in to your host dashboard.
        </p>
      </div>
    );
  }

  return <AuthenticatedApplyForm email={user.email} token={token} onSubmitted={() => setJustSubmitted(true)} />;
}