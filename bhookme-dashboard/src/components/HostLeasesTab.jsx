import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import PhotoUploader from './PhotoUploader';
import { downloadLeaseAgreementPdf } from '../utils/leaseAgreement';
import LeaseChat from './LeaseChat';

// ============================================================
// HostLeasesTab - host dashboard "Monthly Leases" tab.
// ------------------------------------------------------------
//  - Listings: add / edit / pause / delete lease listings
//    (no limit on how many).
//  - Applications: works like Bookings. Read each rental
//    application, Approve or Decline (with an optional note),
//    Mark as paid, then Confirm - which sends the signed lease
//    agreement (PDF) to the tenant and keeps a copy in Documents.
//    Unconfirm / Unmark paid undo it. Message tenant opens a chat.
// ============================================================

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Apartment' },
  { value: 'HOUSE', label: 'House' },
  { value: 'CONDO', label: 'Condo' },
  { value: 'TOWNHOUSE', label: 'Townhouse' },
  { value: 'STUDIO', label: 'Studio' },
  { value: 'ROOM', label: 'Private room' },
];

const APP_STATUS_LABELS = {
  PENDING: 'Needs review',
  APPROVED: 'Approved',
  DECLINED: 'Declined',
  CANCELLED: 'Withdrawn',
};

const APP_STATUS_STYLES = {
  PENDING: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  DECLINED: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const EMPTY_FORM = {
  title: '',
  propertyType: '',
  description: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  bedrooms: '1',
  bathrooms: '1',
  monthlyRent: '',
  securityDeposit: '',
  minMonths: '1',
  maxMonths: '12',
  availableFrom: '',
  furnished: false,
  petsAllowed: false,
  utilitiesIncluded: false,
};

const inputClass =
  'w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 bg-white';

function money(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  const [y, m, d] = dateString.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---------- Add / edit lease listing ----------

function LeaseForm({ token, lease, onSaved, onCancel }) {
  const isEdit = Boolean(lease);
  const [form, setForm] = useState(() =>
    isEdit
      ? {
          title: lease.title || '',
          propertyType: lease.propertyType || '',
          description: lease.description || '',
          address: lease.address || '',
          city: lease.city || '',
          state: lease.state || '',
          zip: lease.zip || '',
          bedrooms: String(lease.bedrooms ?? 1),
          bathrooms: String(lease.bathrooms ?? 1),
          monthlyRent: lease.monthlyRent != null ? String(lease.monthlyRent) : '',
          securityDeposit: lease.securityDeposit != null ? String(lease.securityDeposit) : '',
          minMonths: String(lease.minMonths ?? 1),
          maxMonths: String(lease.maxMonths ?? 12),
          availableFrom: lease.availableFrom || '',
          furnished: !!lease.furnished,
          petsAllowed: !!lease.petsAllowed,
          utilitiesIncluded: !!lease.utilitiesIncluded,
        }
      : EMPTY_FORM
  );
  const [photos, setPhotos] = useState(() => (isEdit ? lease.imageUrls || [] : []));
  const [photosUploading, setPhotosUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (photosUploading) {
      setError('Please wait for your photos to finish uploading.');
      return;
    }
    if (photos.length === 0) {
      setError('Add at least one photo.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(isEdit ? `${API_BASE_URL}/leases/${lease.id}` : `${API_BASE_URL}/leases`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...form, imageUrls: photos }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not save this listing.');
      onSaved(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Title</label>
          <input className={inputClass} value={form.title} onChange={set('title')} placeholder="Bright 2-bedroom near downtown" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Property type</label>
          <select className={inputClass} value={form.propertyType} onChange={set('propertyType')} required>
            <option value="">Pick a type</option>
            {PROPERTY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Photos</label>
        <PhotoUploader value={photos} onChange={setPhotos} folder="properties" max={30} onUploadingChange={setPhotosUploading} />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <textarea
          className={`${inputClass} min-h-[100px]`}
          value={form.description}
          onChange={set('description')}
          placeholder="What's the place like? Parking, laundry, nearby schools, transport..."
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium mb-1">Street address</label>
          <input className={inputClass} value={form.address} onChange={set('address')} placeholder="Shown to tenants after you approve" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">City</label>
          <input className={inputClass} value={form.city} onChange={set('city')} placeholder="Houston" required />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-sm font-medium mb-1">State</label>
            <input className={inputClass} value={form.state} onChange={set('state')} placeholder="TX" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Zip</label>
            <input className={inputClass} value={form.zip} onChange={set('zip')} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Bedrooms</label>
          <input className={inputClass} type="number" min="0" max="20" value={form.bedrooms} onChange={set('bedrooms')} required />
          <p className="text-xs text-gray-400 mt-1">0 = studio</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Bathrooms</label>
          <input className={inputClass} type="number" min="0" max="20" step="0.5" value={form.bathrooms} onChange={set('bathrooms')} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Monthly rent ($)</label>
          <input className={inputClass} type="number" min="1" step="0.01" value={form.monthlyRent} onChange={set('monthlyRent')} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Security deposit ($)</label>
          <input className={inputClass} type="number" min="0" step="0.01" value={form.securityDeposit} onChange={set('securityDeposit')} placeholder="0" />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Minimum months</label>
          <input className={inputClass} type="number" min="1" max="36" value={form.minMonths} onChange={set('minMonths')} required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Maximum months</label>
          <input className={inputClass} type="number" min="1" max="36" value={form.maxMonths} onChange={set('maxMonths')} required />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium mb-1">Available from</label>
          <input className={inputClass} type="date" value={form.availableFrom} onChange={set('availableFrom')} />
          <p className="text-xs text-gray-400 mt-1">Leave empty = available now</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2">
        {[
          ['furnished', 'Furnished'],
          ['petsAllowed', 'Pets allowed'],
          ['utilitiesIncluded', 'Utilities included'],
        ].map(([field, label]) => (
          <label key={field} className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" checked={form[field]} onChange={set(field)} className="w-4 h-4 accent-rose-500" />
            {label}
          </label>
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || photosUploading}
          className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-6 py-3 rounded-lg transition disabled:opacity-50"
        >
          {photosUploading ? 'Uploading photos...' : saving ? 'Saving...' : isEdit ? 'Save changes' : 'Publish listing'}
        </button>
        <button type="button" onClick={onCancel} className="px-6 py-3 rounded-lg border border-gray-300 font-medium hover:bg-gray-50">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------- One application card ----------
// Works like the Bookings cards: Message tenant, Mark as paid /
// Unmark paid, Confirm / Unconfirm, Decline. Confirming releases the
// signed lease agreement (PDF) to the tenant and keeps a copy in the
// host's Documents tab.

function ApplicationCard({ app, token, onChanged, onPatch }) {
  const [showDetails, setShowDetails] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [decision, setDecision] = useState(null); // null | 'APPROVED' | 'DECLINED'
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const d = app.details || {};

  const isPending = app.status === 'PENDING';
  const isApproved = app.status === 'APPROVED';
  const isCancelled = app.status === 'CANCELLED';
  const isClosed = app.status === 'CANCELLED' || app.status === 'DECLINED';

  const call = async (url, body) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Something went wrong.');
      onChanged(data);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setPaid = (paid) => {
    if (!paid && app.confirmed && !window.confirm('Unmarking paid will also unconfirm this lease and take the lease document back from the tenant. Continue?')) {
      return;
    }
    call(`${API_BASE_URL}/lease-applications/${app.id}/paid`, { paid });
  };

  const setConfirmed = (confirmed) => {
    if (!confirmed && !window.confirm('Unconfirm this lease? The lease document will be removed from the tenant\'s Documents until you confirm again.')) {
      return;
    }
    call(`${API_BASE_URL}/lease-applications/${app.id}/confirm`, { confirmed });
  };

  const submitDecision = async () => {
    const ok = await call(`${API_BASE_URL}/lease-applications/${app.id}/decision`, { decision, note });
    if (ok) {
      setDecision(null);
      setNote('');
    }
  };

  const Row = ({ label, value }) =>
    value || value === 0 ? (
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm text-gray-900 break-words">{value}</p>
      </div>
    ) : null;

  const badge = isApproved && app.confirmed
    ? { label: 'Confirmed', style: 'bg-green-100 text-green-700' }
    : { label: APP_STATUS_LABELS[app.status] || app.status, style: APP_STATUS_STYLES[app.status] || 'bg-gray-100' };

  return (
    <div className={`border border-gray-200 rounded-xl p-4 ${isCancelled ? 'opacity-60' : ''}`}>
      <div className="flex flex-col sm:flex-row gap-4">
        <Link to={`/lease/${app.leaseId}`} className="shrink-0">
          {app.leaseImageUrl ? (
            <img src={app.leaseImageUrl} alt={app.leaseTitle} className="w-full sm:w-40 h-28 object-cover rounded-lg bg-gray-200" />
          ) : (
            <div className="w-full sm:w-40 h-28 rounded-lg bg-gray-100 flex items-center justify-center text-3xl">🏠</div>
          )}
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span aria-hidden="true">🏡</span>
                <Link to={`/lease/${app.leaseId}`} className="font-semibold hover:underline block truncate">
                  {app.leaseTitle}
                </Link>
              </div>
              <p className="text-sm text-gray-500">Tenant: {app.fullName || '—'}</p>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${badge.style}`}>{badge.label}</span>
              {isApproved && (
                <span className={`text-xs font-medium ${app.paid ? 'text-green-700' : 'text-amber-700'}`}>
                  {app.paid ? 'Paid' : 'Awaiting payment'}
                </span>
              )}
            </div>
          </div>

          <p className="mt-2 text-sm">
            {formatDate(app.moveInDate)} to {formatDate(app.moveOutDate)}
            <span className="text-gray-500">
              {' '}
              ({app.months} month{app.months === 1 ? '' : 's'} · {money(app.monthlyRent)}/month)
            </span>
          </p>
          <p className="mt-1 font-semibold">
            {money(app.leaseTotal)} total
            {isApproved && (
              <span className="font-normal text-sm text-gray-500"> · due at move-in {money(app.amountDue)}</span>
            )}
          </p>

          {/* ===== Actions ===== */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-sm font-medium">
            {!isCancelled && (
              <button
                type="button"
                onClick={() => setChatOpen((o) => !o)}
                className="relative inline-flex items-center gap-1.5 border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 hover:bg-gray-50"
              >
                <span aria-hidden="true">💬</span>
                {chatOpen ? 'Hide messages' : 'Message tenant'}
                {app.unreadMessages > 0 && !chatOpen && (
                  <span className="ml-1 bg-rose-500 text-white text-xs font-bold rounded-full px-1.5">{app.unreadMessages}</span>
                )}
              </button>
            )}

            {isPending && !decision && (
              <>
                <button
                  type="button"
                  onClick={() => setDecision('APPROVED')}
                  disabled={busy}
                  className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => setDecision('DECLINED')}
                  disabled={busy}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  Decline
                </button>
              </>
            )}

            {isApproved && (
              <>
                {app.paid ? (
                  <button type="button" onClick={() => setPaid(false)} disabled={busy} className="text-gray-500 hover:underline disabled:opacity-50">
                    Unmark paid
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setPaid(true)}
                    disabled={busy}
                    className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    Mark as paid
                  </button>
                )}

                {app.paid && !app.confirmed && (
                  <button
                    type="button"
                    onClick={() => setConfirmed(true)}
                    disabled={busy}
                    className="bg-gray-900 hover:bg-gray-800 text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
                  >
                    Confirm
                  </button>
                )}
                {app.confirmed && (
                  <button type="button" onClick={() => setConfirmed(false)} disabled={busy} className="text-gray-500 hover:underline disabled:opacity-50">
                    Unconfirm
                  </button>
                )}

                {!app.confirmed && !decision && (
                  <button
                    type="button"
                    onClick={() => setDecision('DECLINED')}
                    disabled={busy}
                    className="text-red-600 hover:underline disabled:opacity-50"
                  >
                    Decline
                  </button>
                )}

                {app.agreement && (
                  <button
                    type="button"
                    onClick={() => downloadLeaseAgreementPdf(app.agreement)}
                    className="inline-flex items-center gap-1.5 text-gray-900 hover:underline"
                  >
                    <span aria-hidden="true">📄</span> Lease PDF
                  </button>
                )}
              </>
            )}

            <button type="button" onClick={() => setShowDetails((o) => !o)} className="text-rose-500 hover:underline">
              {showDetails ? 'Hide application' : 'View application'}
            </button>
          </div>

          {busy && <p className="mt-2 text-xs text-gray-500">Saving...</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

          {isApproved && app.paid && !app.confirmed && (
            <p className="mt-2 text-xs text-gray-500">
              Press Confirm to send the signed lease agreement (PDF) to {app.fullName?.split(' ')[0] || 'the tenant'}. A copy goes to your Documents tab.
            </p>
          )}
          {app.confirmed && (
            <p className="mt-2 text-xs text-green-700">
              ✓ Lease document sent to the tenant{app.confirmedAt ? ` on ${formatDate(app.confirmedAt)}` : ''}. Your copy is in Documents.
            </p>
          )}

          {/* ===== Approve / decline with a note ===== */}
          {decision && (
            <div
              className={`mt-3 p-3 rounded-lg border ${
                decision === 'APPROVED' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <p className={`text-sm font-medium mb-1 ${decision === 'APPROVED' ? 'text-green-800' : 'text-red-800'}`}>
                {decision === 'APPROVED' ? `Approve ${app.fullName}'s application?` : `Decline ${app.fullName}'s application?`}
              </p>
              <p className={`text-xs mb-2 ${decision === 'APPROVED' ? 'text-green-700' : 'text-red-700'}`}>
                {decision === 'APPROVED'
                  ? `They'll get an email with the address and the amount due (${money(app.amountDue)}: first month + deposit).`
                  : app.paid
                    ? 'They were marked paid, so the decline email will tell them to contact you about a refund.'
                    : 'They will receive a decline email.'}
              </p>
              <input
                className={inputClass}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder={decision === 'APPROVED' ? 'Optional note (e.g. key pickup details)' : 'Optional reason the tenant will see'}
              />
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={submitDecision}
                  disabled={busy}
                  className={`text-white text-sm font-semibold px-4 py-1.5 rounded-lg disabled:opacity-50 ${
                    decision === 'APPROVED' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {busy ? 'Saving...' : decision === 'APPROVED' ? 'Approve and email tenant' : 'Decline and email tenant'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDecision(null);
                    setNote('');
                  }}
                  className="text-sm font-medium px-4 py-1.5 rounded-lg border border-gray-300 hover:bg-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ===== Messages ===== */}
      {chatOpen && (
        <div className="mt-4">
          <LeaseChat
            applicationId={app.id}
            otherName={app.fullName}
            closed={isCancelled}
            onRead={() => onPatch(app.id, { unreadMessages: 0 })}
          />
        </div>
      )}

      {/* ===== Full application ===== */}
      {showDetails && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-4">
            <Row label="Full name" value={app.fullName} />
            <Row label="Email" value={app.tenantEmail} />
            <Row label="Phone" value={app.phone} />
            <Row label="Date of birth" value={app.dateOfBirth ? formatDate(app.dateOfBirth) : ''} />
            <Row label="Current address" value={app.currentAddress} />
            <Row label="Employer" value={app.employer} />
            <Row label="Monthly income" value={app.monthlyIncome != null ? money(app.monthlyIncome) : ''} />
            <Row label="People living there" value={app.occupants} />
            <Row label="Pets" value={app.hasPets ? app.petDetails || 'Yes' : 'No'} />
            <Row label="Move-in → move-out" value={`${formatDate(app.moveInDate)} → ${formatDate(app.moveOutDate)}`} />
            <Row label="Rent" value={`${money(app.monthlyRent)} / month`} />
            <Row label="Due after approval" value={`${money(app.amountDue)} (first month + ${money(app.securityDeposit)} deposit)`} />
          </div>

          {Object.keys(d).length > 0 && (
            <div className="space-y-4 mb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Residence</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Row label="Time at address" value={d.timeAtAddress} />
                  <Row label="Current rent" value={d.currentRent ? money(d.currentRent) : ''} />
                  <Row label="Current landlord" value={[d.landlordName, d.landlordPhone].filter(Boolean).join(' · ')} />
                  <Row label="Reason for moving" value={d.reasonForLeaving} />
                  <Row label="Previous address" value={d.previousAddress} />
                  <Row label="Photo ID type" value={d.idType} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Employment</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Row label="Status" value={d.employmentStatus} />
                  <Row label="Job title" value={d.jobTitle} />
                  <Row label="Employer phone" value={d.employerPhone} />
                  <Row label="Time employed" value={d.timeEmployed} />
                  <Row label="Other income" value={d.otherIncome} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Household & contacts</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Row label="Other occupants" value={d.otherOccupants} />
                  <Row label="Vehicles" value={d.vehicles} />
                  <Row
                    label="Emergency contact"
                    value={[d.emergencyName, d.emergencyRelationship, d.emergencyPhone].filter(Boolean).join(' · ')}
                  />
                  <Row label="Reference" value={[d.referenceName, d.referenceRelationship, d.referencePhone].filter(Boolean).join(' · ')} />
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2">Background</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Row label="Ever evicted" value={d.evicted} />
                  <Row label="Ever broken a lease" value={d.brokenLease} />
                  <Row label="Felony conviction" value={d.felony} />
                  <Row label="Bankruptcy (7 yrs)" value={d.bankruptcy} />
                  <Row label="Smoker in household" value={d.smoker} />
                </div>
                {d.backgroundExplanation && (
                  <p className="text-sm text-gray-700 mt-2">
                    <span className="font-medium">Explanation:</span> {d.backgroundExplanation}
                  </p>
                )}
              </div>
            </div>
          )}

          {app.signatureName && (
            <p className="text-sm text-gray-600 mb-4">
              ✍️ Lease agreement signed by <span className="font-serif italic text-base text-gray-900">{app.signatureName}</span>
              {app.signedAt ? ` on ${formatDate(app.signedAt)}` : ''}
            </p>
          )}

          {app.message && (
            <div className="bg-gray-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-gray-500 mb-1">Message with the application</p>
              <p className="text-sm whitespace-pre-line">{app.message}</p>
            </div>
          )}

          {app.hostNote && !isPending && (
            <p className="text-sm text-gray-600">
              <span className="font-medium">Your note:</span> {app.hostNote}
            </p>
          )}
          {isClosed && !app.hostNote && <p className="text-sm text-gray-400">This application is closed.</p>}
        </div>
      )}
    </div>
  );
}

// ---------- The tab ----------

export default function HostLeasesTab() {
  const { token } = useAuth();
  const [view, setView] = useState('listings'); // 'listings' | 'applications'
  const [leases, setLeases] = useState([]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [appFilter, setAppFilter] = useState('PENDING');

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_BASE_URL}/leases/mine`, { headers }).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || 'Could not load your lease listings.');
        return Array.isArray(data) ? data : [];
      }),
      fetch(`${API_BASE_URL}/lease-applications/host`, { headers }).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || 'Could not load applications.');
        return Array.isArray(data) ? data : [];
      }),
    ])
      .then(([l, a]) => {
        setLeases(l);
        setApps(a);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const pendingCount = apps.filter((a) => a.status === 'PENDING').length;
  const unreadCount = apps.reduce((sum, a) => sum + (a.unreadMessages || 0), 0);

  const updateApp = (updated) => {
    const before = apps.find((a) => a.id === updated.id);
    setApps((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    // A pending application was just approved/declined: lower that
    // listing's "to review" count by one.
    if (before && before.status === 'PENDING' && updated.status !== 'PENDING') {
      setLeases((prev) =>
        prev.map((l) =>
          l.id === updated.leaseId ? { ...l, pendingApplications: Math.max(0, (l.pendingApplications || 0) - 1) } : l
        )
      );
    }
  };

  // Small local change (e.g. unread messages back to 0 after reading).
  const patchApp = (id, patch) => setApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const toggleStatus = async (lease) => {
    setActingId(lease.id);
    try {
      const res = await fetch(`${API_BASE_URL}/leases/${lease.id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: lease.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not update this listing.');
      setLeases((prev) => prev.map((l) => (l.id === data.id ? { ...data, pendingApplications: l.pendingApplications } : l)));
    } catch (err) {
      window.alert(err.message);
    } finally {
      setActingId(null);
    }
  };

  const deleteLease = async (lease) => {
    if (!window.confirm(`Delete "${lease.title}"? Tenants will no longer see it. This can't be undone.`)) return;
    setActingId(lease.id);
    try {
      const res = await fetch(`${API_BASE_URL}/leases/${lease.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.message) || 'Could not delete this listing.');
      setLeases((prev) => prev.filter((l) => l.id !== lease.id));
      if (editing?.id === lease.id) setEditing(null);
    } catch (err) {
      window.alert(err.message);
    } finally {
      setActingId(null);
    }
  };

  const filteredApps =
    appFilter === 'ALL'
      ? apps
      : appFilter === 'CONFIRMED'
        ? apps.filter((a) => a.status === 'APPROVED' && a.confirmed)
        : appFilter === 'APPROVED'
          ? apps.filter((a) => a.status === 'APPROVED' && !a.confirmed)
          : apps.filter((a) => a.status === appFilter);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="inline-flex rounded-lg border border-gray-200 p-1 bg-gray-50">
          <button
            type="button"
            onClick={() => setView('listings')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md ${view === 'listings' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
          >
            Listings ({leases.length})
          </button>
          <button
            type="button"
            onClick={() => setView('applications')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md flex items-center gap-2 ${view === 'applications' ? 'bg-white shadow-sm' : 'text-gray-600'}`}
          >
            Applications
            {pendingCount > 0 && (
              <span className="bg-rose-500 text-white text-xs font-bold rounded-full px-2 py-0.5">{pendingCount}</span>
            )}
            {unreadCount > 0 && (
              <span className="text-xs" title={`${unreadCount} unread message${unreadCount === 1 ? '' : 's'}`}>
                💬{unreadCount}
              </span>
            )}
          </button>
        </div>

        {view === 'listings' && !showForm && !editing && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="bg-rose-500 hover:bg-rose-600 text-white font-semibold px-5 py-2.5 rounded-lg transition"
          >
            + Add lease listing
          </button>
        )}
      </div>

      {loading && <p className="text-gray-500">Loading...</p>}
      {error && <p className="text-red-500 mb-4">{error}</p>}

      {/* ===== LISTINGS ===== */}
      {!loading && view === 'listings' && (
        <>
          {editing && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Edit: {editing.title}</h2>
              <LeaseForm
                key={editing.id}
                token={token}
                lease={editing}
                onSaved={(saved) => {
                  setLeases((prev) => prev.map((l) => (l.id === saved.id ? { ...saved, pendingApplications: l.pendingApplications } : l)));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}

          {showForm && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Add a lease listing</h2>
              <LeaseForm
                token={token}
                onSaved={(created) => {
                  setLeases((prev) => [{ ...created, pendingApplications: 0 }, ...prev]);
                  setShowForm(false);
                }}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}

          {!error && leases.length === 0 && !showForm && (
            <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
              <p className="text-4xl mb-3" aria-hidden="true">🏠</p>
              <p className="text-gray-500 mb-1">No lease listings yet.</p>
              <p className="text-gray-400 text-sm mb-4">Rent out a home or apartment by the month (1 month minimum).</p>
              <button type="button" onClick={() => setShowForm(true)} className="text-rose-500 font-medium hover:underline">
                Create your first lease listing
              </button>
            </div>
          )}

          {leases.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Listing</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium">Rent/month</th>
                    <th className="px-4 py-3 font-medium">Applications</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leases.map((lease) => (
                    <tr key={lease.id} className={editing?.id === lease.id ? 'bg-rose-50' : ''}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {lease.imageUrls?.[0] ? (
                            <img src={lease.imageUrls[0]} alt="" className="w-14 h-10 object-cover rounded-md bg-gray-100 shrink-0" />
                          ) : (
                            <span className="w-14 h-10 rounded-md bg-gray-100 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate max-w-[220px]">{lease.title}</p>
                            <p className="text-xs text-gray-500">
                              {lease.bedrooms === 0 ? 'Studio' : `${lease.bedrooms} bed`} · {lease.minMonths}–{lease.maxMonths} mo
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {lease.city}, {lease.state}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">{money(lease.monthlyRent)}</td>
                      <td className="px-4 py-3">
                        {lease.pendingApplications > 0 ? (
                          <button
                            type="button"
                            onClick={() => {
                              setView('applications');
                              setAppFilter('PENDING');
                            }}
                            className="text-amber-700 font-medium hover:underline"
                          >
                            {lease.pendingApplications} to review
                          </button>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${
                            lease.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {lease.status === 'ACTIVE' ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => toggleStatus(lease)}
                          disabled={actingId === lease.id}
                          className="text-gray-700 font-medium hover:underline mr-4 disabled:opacity-50"
                        >
                          {actingId === lease.id ? 'Saving...' : lease.status === 'ACTIVE' ? 'Pause' : 'Activate'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowForm(false);
                            setEditing(lease);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-gray-700 font-medium hover:underline mr-4"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteLease(lease)}
                          disabled={actingId === lease.id}
                          className="text-red-600 font-medium hover:underline mr-4 disabled:opacity-50"
                        >
                          Delete
                        </button>
                        <Link to={`/lease/${lease.id}`} className="text-rose-500 font-medium hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ===== APPLICATIONS ===== */}
      {!loading && view === 'applications' && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">
            {[
              ['PENDING', `Needs review (${pendingCount})`],
              ['APPROVED', 'Approved'],
              ['CONFIRMED', 'Confirmed'],
              ['DECLINED', 'Declined'],
              ['CANCELLED', 'Withdrawn'],
              ['ALL', 'All'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setAppFilter(value)}
                className={`px-3 py-1.5 rounded-full text-sm border ${
                  appFilter === value ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredApps.length === 0 ? (
            <div className="text-center py-12 border border-dashed border-gray-300 rounded-xl text-gray-500">
              {apps.length === 0 ? 'No applications yet.' : 'Nothing here.'}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredApps.map((app) => (
                <ApplicationCard key={app.id} app={app} token={token} onChanged={updateApp} onPatch={patchApp} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}