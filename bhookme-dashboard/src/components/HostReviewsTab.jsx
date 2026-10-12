import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ReviewPhotos from './ReviewPhotos';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const REVIEWS_PER_PAGE = 5;

const STATUS_TABS = [
  { id: 'PENDING', label: 'To review' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Ignored' },
  { id: 'ALL', label: 'All' },
];

function Stars({ rating, size = 'text-base' }) {
  return (
    <span className={`${size} tracking-tight`} aria-label={`${rating} out of 5 stars`}>
      <span className="text-yellow-400">{'★'.repeat(rating)}</span>
      <span className="text-gray-300">{'★'.repeat(Math.max(0, 5 - rating))}</span>
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// House and car reviews come from /api/reviews, monthly-lease reviews
// from /api/lease-reviews. Their ids can overlap, so each review gets a
// kind ('stay' or 'lease') and the pair is used as its key.
function isLeaseReview(r) {
  return r.kind === 'lease' || r.leaseId != null;
}

function reviewKey(r) {
  return `${isLeaseReview(r) ? 'lease' : 'stay'}-${r.id}`;
}

function listingOf(r) {
  if (isLeaseReview(r)) {
    return { key: `lease-${r.leaseId}`, label: r.leaseTitle, link: `/lease/${r.leaseId}`, icon: '🏡' };
  }
  return r.propertyId
    ? { key: `property-${r.propertyId}`, label: r.propertyTitle, link: `/property/${r.propertyId}`, icon: '🏠' }
    : { key: `car-${r.carId}`, label: r.carLabel, link: `/car/${r.carId}`, icon: '🚗' };
}

function ReviewCard({ review, token, onUpdated }) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState(review.hostReply || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const listing = listingOf(review);

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
      onUpdated(data);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const lease = isLeaseReview(review);
  const setStatus = (status) =>
    call(
      lease ? `${API_BASE_URL}/lease-reviews/${review.id}/status` : `${API_BASE_URL}/reviews/moderate/${review.id}`,
      { status }
    );

  const saveReply = async (text) => {
    const ok = await call(
      lease ? `${API_BASE_URL}/lease-reviews/${review.id}/reply` : `${API_BASE_URL}/reviews/${review.id}/reply`,
      { reply: text }
    );
    if (ok) setReplyOpen(false);
  };

  return (
    <div className={`border border-gray-200 rounded-xl p-4 bg-white ${review.status === 'REJECTED' ? 'opacity-70' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {review.reviewerAvatarUrl ? (
            <img src={review.reviewerAvatarUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-gray-100 shrink-0" />
          ) : (
            <span className="w-10 h-10 rounded-full bg-gray-900 text-white font-semibold flex items-center justify-center shrink-0">
              {(review.reviewerDisplayName || '?')[0].toUpperCase()}
            </span>
          )}
          <div className="min-w-0">
            <p className="font-semibold truncate">
              {review.reviewerDisplayName}
              {review.isVerifiedStay && (
                <span className="ml-2 align-middle text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                  {lease ? 'Verified tenant' : 'Verified guest'}
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500">{formatDate(review.createdAt)}</p>
          </div>
        </div>
        <Stars rating={review.rating} />
      </div>

      <Link to={listing.link} className="inline-block mt-2 text-xs text-gray-500 hover:underline">
        {listing.icon} {listing.label}
      </Link>

      {review.title && <p className="font-semibold mt-2">{review.title}</p>}
      {review.comment && <p className="text-gray-700 mt-1 whitespace-pre-line">{review.comment}</p>}
      <ReviewPhotos urls={review.imageUrls || []} />

      {review.hostReply && !replyOpen && (
        <div className="mt-3 ml-4 pl-3 border-l-2 border-gray-200">
          <p className="text-xs font-semibold text-gray-500">
            Your reply · {formatDate(review.hostRepliedAt)}
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-line">{review.hostReply}</p>
        </div>
      )}

      {replyOpen && (
        <div className="mt-3">
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={2000}
            placeholder="Thank your guest or respond to their feedback. Your reply is public."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => saveReply(draft)}
              disabled={busy || !draft.trim()}
              className="bg-gray-900 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-40"
            >
              {busy ? 'Saving...' : 'Post reply'}
            </button>
            <button
              type="button"
              onClick={() => {
                setReplyOpen(false);
                setDraft(review.hostReply || '');
              }}
              className="text-sm font-medium px-4 py-2 rounded-lg border border-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-sm font-medium">
        {review.status === 'PENDING' && (
          <>
            <button
              type="button"
              onClick={() => setStatus('APPROVED')}
              disabled={busy}
              className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => setStatus('REJECTED')}
              disabled={busy}
              title="Keep this review saved, but don't show it on your listing"
              className="px-4 py-1.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Ignore
            </button>
          </>
        )}
        {review.status === 'APPROVED' && (
          <>
            {!replyOpen && (
              <button type="button" onClick={() => setReplyOpen(true)} className="text-gray-900 hover:underline">
                {review.hostReply ? 'Edit reply' : 'Reply'}
              </button>
            )}
            {review.hostReply && !replyOpen && (
              <button type="button" onClick={() => saveReply('')} disabled={busy} className="text-gray-500 hover:underline">
                Delete reply
              </button>
            )}
            <button
              type="button"
              onClick={() => setStatus('REJECTED')}
              disabled={busy}
              title="Remove from your listing page but keep it saved"
              className="text-gray-500 hover:underline"
            >
              Ignore
            </button>
          </>
        )}
        {review.status === 'REJECTED' && (
          <>
            <span className="text-xs text-gray-500">Saved, not shown on your listing.</span>
            <button
              type="button"
              onClick={() => setStatus('APPROVED')}
              disabled={busy}
              className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-1.5 rounded-lg disabled:opacity-50"
            >
              Approve
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function HostReviewsTab() {
  const { token } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('PENDING');
  const [listingFilter, setListingFilter] = useState('ALL');
  const [ratingFilter, setRatingFilter] = useState('ALL');
  const [needsReplyOnly, setNeedsReplyOnly] = useState(false);
  const [statusPicked, setStatusPicked] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_BASE_URL}/reviews/host`, { headers }).then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new Error((data && data.message) || 'Could not load your reviews.');
        return Array.isArray(data) ? data : [];
      }),
      // Lease reviews are extra - if they fail, still show house and car reviews.
      fetch(`${API_BASE_URL}/lease-reviews/host`, { headers })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => (Array.isArray(data) ? data.map((r) => ({ ...r, kind: 'lease' })) : []))
        .catch(() => []),
    ])
      .then(([stays, leases]) => {
        // Newest first across houses, cars and leases.
        const data = [...stays, ...leases].sort(
          (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
        );
        setReviews(data);
        // Open on "To review" if anything is waiting, otherwise on "Approved".
        if (!statusPicked && !data.some((r) => r.status === 'PENDING')) setStatus('APPROVED');
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const published = reviews.filter((r) => r.status === 'APPROVED');
  const average = published.length ? published.reduce((s, r) => s + r.rating, 0) / published.length : 0;
  const breakdown = [5, 4, 3, 2, 1].map((stars) => ({
    stars,
    count: published.filter((r) => r.rating === stars).length,
  }));
  const counts = {
    PENDING: reviews.filter((r) => r.status === 'PENDING').length,
    APPROVED: published.length,
    REJECTED: reviews.filter((r) => r.status === 'REJECTED').length,
    ALL: reviews.length,
  };
  const awaitingReply = published.filter((r) => !r.hostReply).length;

  const listings = useMemo(() => {
    const map = new Map();
    reviews.forEach((r) => {
      const l = listingOf(r);
      if (!map.has(l.key)) map.set(l.key, l);
    });
    return Array.from(map.values()).sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  }, [reviews]);

  const shown = reviews.filter((r) => {
    if (status !== 'ALL' && r.status !== status) return false;
    if (listingFilter !== 'ALL' && listingOf(r).key !== listingFilter) return false;
    if (ratingFilter !== 'ALL' && r.rating !== Number(ratingFilter)) return false;
    if (needsReplyOnly && (r.status !== 'APPROVED' || r.hostReply)) return false;
    return true;
  });

  // Pagination applies to whatever the filters currently show.
  const pageCount = Math.max(1, Math.ceil(shown.length / REVIEWS_PER_PAGE));

  // Jump back to page 1 whenever the visible set changes for any reason.
  useEffect(() => {
    setPage(1);
  }, [status, listingFilter, ratingFilter, needsReplyOnly]);

  // Guard against falling off the end when a card is approved/ignored.
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const paginatedShown = shown.slice((page - 1) * REVIEWS_PER_PAGE, page * REVIEWS_PER_PAGE);

  const replace = (updated) =>
    setReviews((prev) => prev.map((r) => (reviewKey(r) === reviewKey(updated) ? updated : r)));

  if (loading) return <p className="text-gray-500">Loading your reviews...</p>;
  if (error) return <p className="text-red-500">{error}</p>;

  if (reviews.length === 0) {
    return (
      <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
        <p className="text-4xl mb-3" aria-hidden="true">⭐</p>
        <p className="font-semibold mb-1">No reviews yet</p>
        <p className="text-gray-500 text-sm">When guests review your homes, cars or monthly stays, you'll approve, ignore, or reply to them here.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Summary */}
      <div className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-6 border border-gray-200 rounded-xl p-5 bg-white mb-6">
        <div className="flex md:flex-col items-center md:items-start gap-4 md:gap-1">
          <p className="text-4xl font-bold">{published.length ? average.toFixed(2) : '—'}</p>
          <div>
            {published.length > 0 && <Stars rating={Math.round(average)} size="text-lg" />}
            <p className="text-sm text-gray-500">
              {published.length} approved review{published.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          {breakdown.map((b) => (
            <div key={b.stars} className="flex items-center gap-3 text-sm">
              <span className="w-8 text-gray-600">{b.stars}★</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gray-900 rounded-full"
                  style={{ width: `${published.length ? (b.count / published.length) * 100 : 0}%` }}
                />
              </div>
              <span className="w-8 text-right text-gray-500">{b.count}</span>
            </div>
          ))}
        </div>
      </div>

      {counts.PENDING > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 text-sm mb-4">
          {counts.PENDING} new review{counts.PENDING === 1 ? ' is' : 's are'} waiting. Approve a review to show it on your listing, or ignore it to keep it saved without showing it.
        </div>
      )}

      {/* Status tabs */}
      <div className="flex gap-2 overflow-x-auto mb-4">
        {STATUS_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setStatus(t.id);
              setStatusPicked(true);
            }}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium border ${
              status === t.id ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-300 hover:border-gray-900'
            }`}
          >
            {t.label} ({counts[t.id]})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <select
          value={listingFilter}
          onChange={(e) => setListingFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white sm:max-w-xs"
        >
          <option value="ALL">All listings</option>
          {listings.map((l) => (
            <option key={l.key} value={l.key}>
              {l.icon} {l.label}
            </option>
          ))}
        </select>
        <select
          value={ratingFilter}
          onChange={(e) => setRatingFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
        >
          <option value="ALL">All ratings</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n === 1 ? '' : 's'}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={needsReplyOnly} onChange={(e) => setNeedsReplyOnly(e.target.checked)} />
          Needs a reply ({awaitingReply})
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">No reviews match these filters.</p>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedShown.map((r) => (
              <ReviewCard key={reviewKey(r)} review={r} token={token} onUpdated={replace} />
            ))}
          </div>

          {pageCount > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm">
              <p className="text-gray-500">
                Showing {(page - 1) * REVIEWS_PER_PAGE + 1}
                {'\u2013'}
                {Math.min(page * REVIEWS_PER_PAGE, shown.length)} of {shown.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Previous
                </button>
                <span className="text-gray-600">
                  Page {page} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  disabled={page === pageCount}
                  className="px-3 py-1.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}