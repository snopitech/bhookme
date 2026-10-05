// ============================================================
// Pending Action helper
// ------------------------------------------------------------
// When a user clicks "Continue with Microsoft" inside a login popup
// on a page where they were trying to do something (Reserve, Review),
// we need to remember what they were doing across the MSAL redirect
// round-trip. The popup is destroyed by the redirect, so we can't
// keep React state - we persist to sessionStorage instead.
//
// After MSAL returns and login succeeds, the calling page checks
// for a pending action and prompts the user: "You're signed in!
// Tap Reserve to continue" - tapping it triggers the original flow.
// ============================================================

const PENDING_KEY = 'bhookme_pending_action';
const RETURN_KEY = 'bhookme_pending_return';

export function setPendingAction(action) {
  try {
    sessionStorage.setItem(PENDING_KEY, action);
    sessionStorage.setItem(
      RETURN_KEY,
      window.location.pathname + window.location.search
    );
  } catch (e) {
    console.error('setPendingAction failed:', e);
  }
}

export function getPendingAction() {
  try {
    return sessionStorage.getItem(PENDING_KEY);
  } catch (e) {
    return null;
  }
}

export function getPendingReturn() {
  try {
    return sessionStorage.getItem(RETURN_KEY);
  } catch (e) {
    return null;
  }
}

export function clearPendingAction() {
  try {
    sessionStorage.removeItem(PENDING_KEY);
    sessionStorage.removeItem(RETURN_KEY);
  } catch (e) {
    // ignore
  }
}