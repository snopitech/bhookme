import React from 'react';

// ============================================================
// POST LOGIN PROMPT
// ------------------------------------------------------------
// Shown after a Microsoft sign-in completes (which requires a full
// browser redirect, so any state in the original login popup is
// gone). Tells the user they're signed in and prompts them to tap
// the action they originally wanted (Reserve, Write a review, etc).
//
// This replaces the confusing "click twice and hope it works" flow
// with clear messaging: the user knows they're signed in, and they
// know exactly what to tap to continue.
//
// Rendered as a centered modal overlay so it's visible even if the
// component that shows it is tucked into a corner of the page.
// ============================================================

export default function PostLoginPrompt({ actionLabel, onConfirm, onDismiss }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm text-center">
        <div className="text-4xl mb-3">✅</div>
        <h2 className="text-lg font-bold text-gray-800 mb-2">
          You&apos;re signed in!
        </h2>
        <p className="text-sm text-gray-600 mb-5">
          Tap below to continue with your {actionLabel}.
        </p>
        <button
          type="button"
          onClick={onConfirm}
          className="w-full bg-rose-500 hover:bg-rose-600 text-white py-2.5 rounded-lg font-semibold text-sm mb-2 transition"
        >
          Continue with {actionLabel}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="w-full text-gray-500 hover:text-gray-700 py-2 text-xs"
        >
          Not now
        </button>
      </div>
    </div>
  );
}