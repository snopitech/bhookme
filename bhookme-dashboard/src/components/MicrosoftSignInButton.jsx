/* eslint-disable no-unused-vars */
import React, { useState, useEffect, useRef } from 'react';
import { PublicClientApplication } from '@azure/msal-browser';
import { setPendingAction } from '../utils/pendingAction';

const msalConfig = {
  auth: {
    clientId: import.meta.env.VITE_MICROSOFT_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${import.meta.env.VITE_MICROSOFT_TENANT_ID || 'common'}`,
    redirectUri: window.location.origin + '/login',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

const loginRequest = {
  scopes: ['openid', 'profile', 'email', 'User.Read'],
};

let msalInstance = null;
const getMsalInstance = () => {
  if (!msalInstance) {
    msalInstance = new PublicClientApplication(msalConfig);
  }
  return msalInstance;
};

/**
 * Microsoft sign-in button.
 *
 * mode:
 *  - "redirect" (default): uses MSAL loginRedirect(). Navigates the
 *    whole browser away to Microsoft and back to a hardcoded
 *    redirectUri of /login. After the return, LoginPage processes the
 *    token and (if `pendingAction` was passed by the caller) redirects
 *    the user back to where they started, where PostLoginPrompt can
 *    offer to continue their original action.
 *
 *  - "popup": uses MSAL loginPopup(). Currently not wired up - kept
 *    for future use. In practice popup mode can be blocked by browser
 *    popup blockers.
 *
 * pendingAction: optional string. When set, saved to sessionStorage
 * before the redirect so the return page knows what the user was
 * trying to do (e.g. 'reserve', 'review'). The return page reads it
 * with getPendingAction() and shows a PostLoginPrompt.
 *
 * autoStart: when true, fires loginRedirect once on mount. Used by
 * LoginPage when the URL contains ?provider=microsoft (set by the
 * inline login popup).
 */
function MicrosoftSignInButton({
  onSuccess,
  onError,
  disabled,
  text = 'Continue with Microsoft',
  mode = 'redirect',
  pendingAction = null,
  autoStart = false,
}) {
  const [loading, setLoading] = useState(false);

  // Only used in "redirect" mode: MSAL returns to /login and hands
  // the token to whatever's mounted. In "popup" mode, the token
  // comes back directly from loginPopup(), so this effect is a no-op.
  useEffect(() => {
    if (mode !== 'redirect') return;
    let cancelled = false;

    const handleRedirectResult = async () => {
      try {
        const instance = getMsalInstance();
        await instance.initialize();
        const result = await instance.handleRedirectPromise();

        if (cancelled) return;

        if (result && result.idToken) {
          console.log('Microsoft redirect returned an ID token');
          setLoading(false);
          if (onSuccess) {
            onSuccess({ credential: result.idToken, account: result.account });
          }
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error handling Microsoft redirect:', err);
        setLoading(false);
        if (onError) onError(err);
      }
    };

    handleRedirectResult();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const handleClick = async () => {
    if (loading || disabled) return;

    setLoading(true);
    try {
      // Remember what the user was trying to do before the browser
      // navigates away. The page we return to will read this and show
      // a "continue with X" prompt.
      if (pendingAction) {
        setPendingAction(pendingAction);
      }

      const instance = getMsalInstance();
      await instance.initialize();

      if (mode === 'popup') {
        const result = await instance.loginPopup(loginRequest);
        setLoading(false);
        if (result && result.idToken) {
          if (onSuccess) {
            onSuccess({ credential: result.idToken, account: result.account });
          }
        }
      } else {
        await instance.loginRedirect(loginRequest);
      }
    } catch (err) {
      console.error('Microsoft login error:', err);
      setLoading(false);
      if (onError) onError(err);
    }
  };

  // When autoStart is true (set by LoginPage when ?provider=microsoft
  // is present), fire loginRedirect once on mount. Guarded with a ref
  // so it only runs once per mount and only in redirect mode. Placed
  // after handleClick's declaration so the closure is valid.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || mode !== 'redirect') return;
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    handleClick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, mode]);

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading || disabled}
      className="w-full max-w-[350px] mx-auto flex items-center justify-center gap-3 bg-white border border-gray-300 rounded-lg px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-50 disabled:cursor-not-allowed min-h-[48px] text-sm font-medium text-gray-700"
      aria-label={text}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 23 23"
        width="20"
        height="20"
        aria-hidden="true"
        className="flex-shrink-0"
      >
        <rect x="1" y="1" width="10" height="10" fill="#f25022" />
        <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
        <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
        <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
      </svg>

      <span>{loading ? 'Redirecting…' : text}</span>
    </button>
  );
}

export default MicrosoftSignInButton;