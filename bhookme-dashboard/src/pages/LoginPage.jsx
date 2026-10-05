import React, { useState, useEffect } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import GoogleSignInButton from '../components/GoogleSignInButton';
import MicrosoftSignInButton from '../components/MicrosoftSignInButton';
import YahooSignInButton from '../components/YahooSignInButton';
import { getPendingReturn } from '../utils/pendingAction';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, microsoftLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ============================================================
  // Yahoo return handler
  // ------------------------------------------------------------
  // Yahoo's flow is entirely server-side. The backend redirects
  // the browser here with ?yahoo_token=...&yahoo_email=...&...
  // We read those, save them to localStorage (matching AuthContext's
  // session shape), then hard-navigate away so AuthContext picks
  // up the new session.
  // ============================================================
  useEffect(() => {
    const params = new URLSearchParams(location.search);

    const yahooError = params.get('yahoo_error');
    if (yahooError) {
      console.error('[Yahoo] Error from backend:', yahooError);
      setError('Yahoo sign-in failed. Please try again.');
      window.history.replaceState({}, '', location.pathname);
      return;
    }

    const yahooToken = params.get('yahoo_token');
    if (yahooToken) {
      const yahooUser = {
        id: params.get('yahoo_userId') ? Number(params.get('yahoo_userId')) : null,
        email: params.get('yahoo_email') || '',
        firstName: params.get('yahoo_firstName') || '',
        lastName: params.get('yahoo_lastName') || '',
        isHost: params.get('yahoo_isHost') === 'true'
      };

      console.log('[Yahoo] Saving session for', yahooUser.email);

      localStorage.setItem('token', yahooToken);
      localStorage.setItem('user', JSON.stringify(yahooUser));

      const returnTo = getPendingReturn() || '/';
      window.location.href = returnTo;
    }
  }, [location.search, location.pathname]);

  // If we were sent here from the inline login popup, the URL will
  // be /login?provider=microsoft (or yahoo). Store the provider in
  // state so the buttons below can auto-fire once on mount, then
  // strip the query param so a refresh doesn't re-trigger.
  const [autoProvider, setAutoProvider] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const provider = params.get('provider');
    if (provider === 'microsoft' || provider === 'yahoo') {
      setAutoProvider(provider);
      window.history.replaceState({}, '', location.pathname);
    }
  }, [location.search, location.pathname]);

  const handleBack = () => {
    // Go back to whatever page the visitor was actually on (a property
    // page, a car page, etc). window.history.state?.idx is set by
    // React Router - anything above 0 means there's a real previous
    // entry in this tab's history to return to. Falls back to home
    // only if /login was opened directly (e.g. a bookmark or a new
    // tab), where there's nothing to go back to.
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    setLoading(false);

    if (result.success) {
      navigate('/');
    } else {
      setError(result.error);
    }
  };

  // Microsoft success: save the session, then hard-navigate back to
  // whatever page the user was on when they clicked the Microsoft
  // button (saved to sessionStorage by MicrosoftSignInButton via
  // pendingAction.js), or the homepage if nothing was saved.
  //
  // The hard navigation (window.location.href, not React Router
  // navigate) is deliberate: it forces a full page load so AuthContext
  // re-initializes from localStorage and the logged-in state is
  // consistent everywhere. When there's a pending action, the page we
  // return to will show a PostLoginPrompt to continue the original
  // action (Reserve, Review, etc).
  const handleMicrosoftSuccess = async ({ credential }) => {
    setError('');
    const result = await microsoftLogin(credential);
    if (result.success) {
      const returnTo = getPendingReturn() || '/';
      window.location.href = returnTo;
    } else {
      setError(result.error || 'Microsoft sign-in failed');
    }
  };

  const handleMicrosoftError = (err) => {
    console.error('Microsoft sign-in error:', err);
    setError(err?.message || 'Microsoft sign-in failed. Please try again.');
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center bg-gradient-to-b from-rose-50 via-white to-white px-4 py-10">
      <div className="max-w-md w-full">
        <button
          type="button"
          onClick={handleBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 mb-6 transition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back
        </button>

        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <div className="text-center mb-6">
            <Link to="/" className="text-2xl font-bold text-rose-500">bhookme</Link>
            <h1 className="text-xl font-semibold mt-3">Welcome back</h1>
            <p className="text-gray-500 text-sm mt-1">Log in to book a stay, rent a car, or manage your listings.</p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Password</label>
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="w-full px-4 py-2.5 pr-11 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 min-h-[24px] min-w-[24px] flex items-center justify-center"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-2.5 rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Logging in...' : 'Log in'}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">OR CONTINUE WITH</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="space-y-3">
            <GoogleSignInButton />
            <YahooSignInButton
              text="Continue with Yahoo"
              autoStart={autoProvider === 'yahoo'}
            />
            <MicrosoftSignInButton
              onSuccess={handleMicrosoftSuccess}
              onError={handleMicrosoftError}
              autoStart={autoProvider === 'microsoft'}
            />
          </div>

          <p className="text-center text-sm text-gray-600 mt-6">
            Don't have an account?{' '}
            <Link to="/register" className="text-rose-500 font-medium hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}