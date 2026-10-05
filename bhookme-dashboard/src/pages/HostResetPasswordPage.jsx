import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PasswordInput from '../components/PasswordInput';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

/**
 * Landing page for the password-reset link we email hosts.
 *
 * The email contains: https://bhookme.com/host-reset-password?token=<uuid>
 * When the user clicks it, this page loads, reads the token from the
 * query string, shows a new-password form, and POSTs to
 * /api/auth/host-reset-password. On success:
 *   - the backend returns a fresh session (token + user info)
 *   - we save it into AuthContext
 *   - we start the host session
 *   - we show "Password changed successfully" for 2 seconds
 *   - we navigate to /host/dashboard
 */
export default function HostResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setSessionFromResponse, startHostSession } = useAuth();

  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const t = params.get('token') || '';
    setToken(t);
    if (!t) {
      setError('This reset link is missing its token. Please request a new one.');
    }
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/host-reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || 'Could not reset your password. Please try again.');
        return;
      }

      // Auto-login: save the session and mark as host-verified.
      setSessionFromResponse(data);
      startHostSession(data.email);

      setSuccess(true);

      // Give the user a beat to see the success message, then go.
      setTimeout(() => {
        navigate('/host/dashboard', { replace: true });
      }, 2000);
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ===== SUCCESS SCREEN =====
  if (success) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-b from-rose-50 via-white to-white px-4 py-10">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-100 p-8 text-center">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-2xl font-bold mb-2">Password changed successfully</h1>
          <p className="text-gray-500 text-sm">
            Redirecting you to your host dashboard...
          </p>
        </div>
      </div>
    );
  }

  // ===== RESET FORM =====
  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-b from-rose-50 via-white to-white px-4 py-10">
      <div className="max-w-md w-full">
        <Link
          to="/become-host"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 mb-6 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </Link>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div className="text-center mb-6">
            <p className="text-4xl mb-2">🔐</p>
            <h1 className="text-2xl font-bold">Set a new password</h1>
            <p className="text-sm text-gray-500 mt-1">
              Choose a new password for your host account.
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
              <PasswordInput value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} />
            </div>

            <button
              type="submit"
              disabled={submitting || !token}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
            >
              {submitting ? 'Changing password...' : 'Change password'}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-4">
            Remembered it?{' '}
            <Link to="/become-host" className="text-rose-500 font-medium hover:underline">
              Back to host login
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}