import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { downloadLeaseAgreementPdf } from '../utils/leaseAgreement';

// ============================================================
// LeaseDocumentsTab - the "Documents" tab in both dashboards.
// ------------------------------------------------------------
// Lists every CONFIRMED lease agreement:
//   role="tenant" -> leases the user signed as a tenant
//   role="host"   -> copies of leases for the host's listings
// Each one downloads as a PDF. A document appears here when the
// host presses Confirm, and disappears if they Unconfirm.
// ============================================================

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

function formatDate(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function LeaseDocumentsTab({ role = 'tenant' }) {
  const { token } = useAuth();
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/lease-documents`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || 'Could not load your documents.');
        const list = role === 'host' ? data?.asHost : data?.asTenant;
        setDocs(Array.isArray(list) ? list : []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [token, role]);

  const download = async (doc) => {
    setBusyId(doc.applicationId);
    setError('');
    try {
      await downloadLeaseAgreementPdf(doc.agreement);
    } catch (err) {
      setError('Could not create the PDF. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const q = query.trim().toLowerCase();
  const shown = q
    ? docs.filter((d) => [d.leaseTitle, d.otherPartyName, d.leaseCity, d.leaseState].filter(Boolean).join(' ').toLowerCase().includes(q))
    : docs;

  if (loading) return <p className="text-gray-500">Loading documents...</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-gray-500">
          {role === 'host'
            ? 'Copies of confirmed lease agreements for your listings.'
            : 'Your confirmed lease agreements. Download them anytime.'}
        </p>
        {docs.length > 3 && (
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={role === 'host' ? 'Search by tenant or listing' : 'Search by listing'}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full sm:w-64 focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        )}
      </div>

      {error && <p className="text-red-500 mb-4">{error}</p>}

      {docs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-4xl mb-3" aria-hidden="true">📄</p>
          <p className="text-gray-500 mb-1">No documents yet.</p>
          <p className="text-gray-400 text-sm">
            {role === 'host'
              ? 'When you confirm a paid lease, a copy of the signed agreement is kept here.'
              : 'Your signed lease agreement appears here once your host confirms your lease.'}
          </p>
          {role === 'tenant' && (
            <Link to="/tenant-dashboard?tab=leases" className="inline-block mt-4 text-rose-500 font-medium hover:underline">
              See my lease applications
            </Link>
          )}
        </div>
      ) : shown.length === 0 ? (
        <p className="text-gray-500">No documents match your search.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((doc) => (
            <div key={doc.applicationId} className="flex flex-col sm:flex-row sm:items-center gap-4 border border-gray-200 rounded-xl p-4">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="relative shrink-0">
                  {doc.leaseImageUrl ? (
                    <img src={doc.leaseImageUrl} alt="" className="w-16 h-16 object-cover rounded-lg bg-gray-100" />
                  ) : (
                    <span className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-2xl">🏠</span>
                  )}
                  <span className="absolute -bottom-1 -right-1 bg-white rounded-full shadow text-base w-7 h-7 flex items-center justify-center" aria-hidden="true">
                    📄
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{doc.title}</p>
                  <p className="text-sm text-gray-500 truncate">
                    {role === 'host' ? 'Tenant' : 'Landlord'}: {doc.otherPartyName || '—'}
                    {doc.leaseCity ? ` · ${doc.leaseCity}, ${doc.leaseState}` : ''}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatDate(doc.moveInDate)} → {formatDate(doc.moveOutDate)} ({doc.months} month{doc.months === 1 ? '' : 's'})
                    {doc.confirmedAt ? ` · Confirmed ${formatDate(doc.confirmedAt)}` : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => download(doc)}
                disabled={busyId === doc.applicationId}
                className="shrink-0 bg-gray-900 hover:bg-black text-white text-sm font-medium px-4 py-2 rounded-lg disabled:opacity-50"
              >
                {busyId === doc.applicationId ? 'Preparing...' : 'Download PDF'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}