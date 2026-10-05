import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

function maxBirthDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 18);
  return d.toISOString().split('T')[0];
}

export default function ProfileCompleteModal() {
  const { user, isAuthenticated, updateProfile } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [edits, setEdits] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // profileComplete is undefined until the profile has loaded, so only
  // an explicit false shows the modal (no flash for complete accounts).
  const shouldShow = isAuthenticated && user && user.profileComplete === false && !dismissed;
  if (!shouldShow) return null;

  const value = (field) => (edits[field] !== undefined ? edits[field] : user[field] || '');

  const handleChange = (e) => {
    setEdits({ ...edits, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const result = await updateProfile({
      firstName: value('firstName'),
      lastName: value('lastName'),
      phone: value('phone'),
      dateOfBirth: value('dateOfBirth') || null
    });

    setSaving(false);
    if (!result.success) {
      setError(result.error);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <span className="w-6" />
          <h2 className="font-semibold">Let's finish your account</h2>
          <button
            onClick={() => setDismissed(true)}
            aria-label="Close"
            className="w-6 text-xl text-gray-500 hover:text-gray-800"
          >
            {'\u00D7'}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <p className="text-sm text-gray-500">
            This information is required to book or host.
          </p>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block font-semibold mb-2">Legal name</label>
            <div className="border border-gray-300 rounded-lg overflow-hidden">
              <input
                type="text"
                name="firstName"
                placeholder="First name"
                required
                value={value('firstName')}
                onChange={handleChange}
                className="w-full px-4 py-3 border-b border-gray-300 focus:outline-none"
              />
              <input
                type="text"
                name="lastName"
                placeholder="Last name"
                required
                value={value('lastName')}
                onChange={handleChange}
                className="w-full px-4 py-3 focus:outline-none"
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Make sure it matches the name on your government ID.
            </p>
          </div>

          <div>
            <label className="block font-semibold mb-2">Date of birth</label>
            <input
              type="date"
              name="dateOfBirth"
              required
              max={maxBirthDate()}
              value={value('dateOfBirth')}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <p className="text-xs text-gray-500 mt-2">
              You must be at least 18 to book or host.
            </p>
          </div>

          <div>
            <label className="block font-semibold mb-2">Phone (optional)</label>
            <input
              type="tel"
              name="phone"
              value={value('phone')}
              onChange={handleChange}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>

          <div>
            <label className="block font-semibold mb-2">Email</label>
            <input
              type="email"
              value={user.email}
              disabled
              className="w-full px-4 py-3 border border-gray-200 rounded-lg bg-gray-100 text-gray-500"
            />
            <p className="text-xs text-gray-500 mt-2">
              We'll email you trip confirmations and receipts.
            </p>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gray-900 hover:bg-black text-white font-semibold py-3 rounded-lg transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Agree and continue'}
          </button>
        </form>
      </div>
    </div>
  );
}