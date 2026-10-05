import React, { useEffect, useRef } from 'react';

// ============================================================
// YAHOO SIGN-IN BUTTON
// ------------------------------------------------------------
// Yahoo's OAuth flow is entirely backend-driven (no browser SDK).
// This component just navigates the browser to the backend's
// /api/auth/yahoo endpoint, which redirects to Yahoo's consent
// screen. After the user signs in, the backend finishes the
// handshake and redirects back to the frontend with
// ?yahoo_token=... in the URL.
//
// The backend URL is configurable via VITE_YAHOO_LOGIN_URL - falls
// back to localhost:8080 for development. Set it to your production
// backend URL when deployed.
//
// returnTo MUST point at /login (not the site root) - the
// LoginPage component is where the ?yahoo_token=... handler lives.
// If we send the browser back to '/', the token never gets saved
// and the user looks logged-out. LoginPage's own logic can then
// bounce them onward to wherever they were before.
//
// autoStart: when true, fires the redirect once on mount. Used by
// LoginPage when the URL contains ?provider=yahoo (set by the
// inline login popup).
// ============================================================

const YAHOO_LOGIN_URL =
  import.meta.env.VITE_YAHOO_LOGIN_URL ||
  'http://localhost:8080/api/auth/yahoo';

function YahooSignInButton({ text = 'Continue with Yahoo', disabled, autoStart = false }) {
  const autoStartedRef = useRef(false);

  const handleClick = () => {
    if (disabled) return;

    // Land on /login so the query-param handler there can save the
    // session from ?yahoo_token=...
    const returnTo = window.location.origin + '/login';
    const url = `${YAHOO_LOGIN_URL}?returnTo=${encodeURIComponent(returnTo)}`;

    console.log('Redirecting to Yahoo login:', url);
    window.location.href = url;
  };

  // Fire the redirect once on mount when autoStart is true. Used by
  // LoginPage when ?provider=yahoo is present.
  useEffect(() => {
    if (!autoStart) return;
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    handleClick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="w-full max-w-[350px] mx-auto flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] text-sm font-medium text-gray-700"
      aria-label={text}
    >
      {/* Yahoo "Y!" logo — purple background, white Y! */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        width="20"
        height="20"
        aria-hidden="true"
        className="flex-shrink-0"
      >
        <rect width="24" height="24" rx="3" fill="#6001D2" />
        <path
          d="M16.8 6.5h-2.6l-2.2 3.5-2.2-3.5H7.2l3.5 5.3v5.7h2.4v-5.7l3.7-5.3z"
          fill="#ffffff"
        />
      </svg>

      <span>{text}</span>
    </button>
  );
}

export default YahooSignInButton;