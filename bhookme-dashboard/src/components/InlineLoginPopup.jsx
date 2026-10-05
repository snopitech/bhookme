import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { setPendingAction } from '../utils/pendingAction';

// ============================================================
// INLINE LOGIN POPUP
// ------------------------------------------------------------
// Lets a logged-out visitor log in without leaving the current page.
// Two usage modes:
// - UNCONTROLLED (pass `linkText`): renders its own trigger link that
//   toggles the popup open/closed internally.
// - CONTROLLED (pass `open` + `onOpenChange`, omit `linkText`): renders
//   only the popup itself - the parent decides when to show it.
//
// onLoginSuccess fires once login succeeds. For email/password and
// Google, login is complete and in-place by the time this fires -
// safe to act immediately. For anything depending on the updated
// auth token, don't call it synchronously - have onLoginSuccess just
// close the popup, and let the parent react to its own `user`/`token`
// state changing via a separate useEffect.
//
// MICROSOFT AND YAHOO:
// Both use full-page redirect flows that navigate the browser away
// and back to /login - which destroys this popup's component
// instance before its onSuccess can fire. So their buttons here:
//   1. Save the current URL via setPendingAction (so the return page
//      knows where to send the user back).
//   2. Hard-navigate to /login?provider=microsoft (or yahoo), where
//      LoginPage auto-triggers the provider's flow.
// After the OAuth round-trip, LoginPage uses getPendingReturn() to
// send the user back to this page.
// ============================================================

export default function InlineLoginPopup({
  linkText,
  open,
  onOpenChange,
  onLoginSuccess,
  pendingAction = null, // kept for API compatibility, not used here
}) {
  const { login, googleLogin } = useAuth();
  const buttonRef = useRef(null);

  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : internalOpen;
  const setOpen = (value) => {
    if (isControlled) {
      if (onOpenChange) onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSuccess = () => {
    setOpen(false);
    setEmail('');
    setPassword('');
    setError('');
    if (onLoginSuccess) onLoginSuccess();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const result = await login(email, password);
      if (result.success) {
        handleSuccess();
      } else {
        setError(result.error || 'Login failed. Please check your credentials.');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Microsoft / Yahoo redirect handler.
  // Saves the current URL so LoginPage can send the user back here
  // after the OAuth round-trip, then navigates to /login with the
  // provider hint.
  const startRedirectProvider = (provider) => {
    setPendingAction('login');
    setOpen(false);
    window.location.href = `/login?provider=${provider}`;
  };

  // Renders Google's own button into buttonRef once the popup is open
  // and the Google script (loaded in index.html) is ready. Re-runs
  // each time the popup opens, since the button's DOM node gets
  // unmounted when the popup closes.
  useEffect(() => {
    if (!isOpen || !window.google || !buttonRef.current) return;

    window.google.accounts.id.initialize({
      client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
      callback: async (response) => {
        const result = await googleLogin(response.credential);
        if (result.success) {
          handleSuccess();
        } else {
          setError(result.error || 'Google sign-in failed');
        }
      },
    });

    window.google.accounts.id.renderButton(buttonRef.current, {
      theme: 'outline',
      size: 'large',
      width: '260',
      text: 'continue_with',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  return (
    <div>
      {linkText && (
        <button
          type="button"
          onClick={() => setOpen(!isOpen)}
          className="text-sm text-rose-500 hover:underline font-medium"
        >
          {linkText}
        </button>
      )}

      {isOpen && (
        <div className="w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4">
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}

          <div className="flex justify-center mb-3">
            <div ref={buttonRef} />
          </div>

          <div className="flex items-center gap-2 my-3">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="text-[10px] text-gray-400">OR</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="mb-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[40px]"
              />
            </div>
            <div className="mb-3">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm min-h-[40px]"
              />
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-rose-500 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-rose-600 min-h-[40px] disabled:opacity-50"
              >
                {submitting ? 'Logging in...' : 'Log in'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setError('');
                }}
                className="px-3 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100 min-h-[40px]"
              >
                Cancel
              </button>
            </div>
          </form>

          {/* Microsoft + Yahoo — both use redirect flows, so they
              save the current page and hand off to /login. */}
          <div className="mt-3 space-y-2">
            <button
              type="button"
              onClick={() => startRedirectProvider('microsoft')}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[40px]"
              aria-label="Continue with Microsoft"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 23 23"
                width="16"
                height="16"
                aria-hidden="true"
                className="flex-shrink-0"
              >
                <rect x="1" y="1" width="10" height="10" fill="#f25022" />
                <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
                <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
                <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
              </svg>
              <span>Microsoft</span>
            </button>
            <button
              type="button"
              onClick={() => startRedirectProvider('yahoo')}
              className="w-full flex items-center justify-center gap-2 border border-gray-300 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 min-h-[40px]"
              aria-label="Continue with Yahoo"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden="true"
                className="flex-shrink-0"
              >
                <rect width="24" height="24" rx="3" fill="#6001D2" />
                <path
                  d="M16.8 6.5h-2.6l-2.2 3.5-2.2-3.5H7.2l3.5 5.3v5.7h2.4v-5.7l3.7-5.3z"
                  fill="#ffffff"
                />
              </svg>
              <span>Yahoo</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}