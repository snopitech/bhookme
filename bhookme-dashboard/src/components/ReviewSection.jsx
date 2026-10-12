import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import InlineLoginPopup from './InlineLoginPopup';
import PostLoginPrompt from './PostLoginPrompt';
import { getPendingAction, clearPendingAction } from '../utils/pendingAction';
import PhotoUploader from './PhotoUploader';
import ReviewPhotos from './ReviewPhotos';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const REVIEWS_PER_PAGE = 2;

function StarInput({ value, onChange }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          className="text-2xl leading-none min-h-[36px] min-w-[36px] flex items-center justify-center"
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          <span className={n <= value ? 'text-yellow-400' : 'text-gray-300'}>★</span>
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ rating }) {
  return (
    <div className="flex gap-0.5 text-sm">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rating ? 'text-yellow-400' : 'text-gray-300'}>★</span>
      ))}
    </div>
  );
}

function ReviewerAvatar({ url, name }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  if (url) {
    return <img src={url} alt={name || 'Reviewer'} className="w-10 h-10 rounded-full object-cover border border-gray-200 flex-shrink-0" />;
  }
  return (
    <div className="w-10 h-10 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-semibold flex-shrink-0">
      {initial}
    </div>
  );
}

// Round photo picker for the reviewer's avatar (shown where the initial
// letter would otherwise be). Uploads one image to /api/upload/image.
function AvatarPicker({ value, onChange, name, token, onUploadingChange }) {
  const inputRef = React.useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';

  const pick = async (file) => {
    if (!file) return;
    setError('');
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('Photo must be under 10MB.');
      return;
    }
    setUploading(true);
    onUploadingChange?.(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('folder', 'profiles');
      const res = await fetch(`${API_BASE_URL}/upload/image`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.url) throw new Error((data && data.message) || 'Upload failed.');
      onChange(data.url);
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      onUploadingChange?.(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-label={value ? 'Change your photo' : 'Add your photo'}
        className="relative w-14 h-14 rounded-full overflow-hidden bg-gray-200 text-gray-500 flex items-center justify-center text-lg font-semibold border border-gray-300 hover:opacity-90 shrink-0"
      >
        {value ? <img src={value} alt="Your photo" className="w-full h-full object-cover" /> : initial}
        {uploading && (
          <span className="absolute inset-0 bg-white/70 flex items-center justify-center text-xs text-gray-700">...</span>
        )}
      </button>
      <div className="text-sm">
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="font-medium text-gray-800 underline">
          {uploading ? 'Uploading...' : value ? 'Change photo' : 'Add your photo'}
        </button>
        {value && !uploading && (
          <button type="button" onClick={() => onChange(null)} className="ml-3 text-gray-500 underline">
            Remove
          </button>
        )}
        <p className="text-xs text-gray-400">Optional. Shown next to your name.</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}

// Used on house, car and monthly-lease pages. Pass exactly one of
// propertyId, carId or leaseId. Lease reviews use their own endpoints
// (/api/lease-reviews/...) and only tenants with a confirmed lease
// can write one - the server tells us via canReview / reason.
export default function ReviewSection({ propertyId, carId, leaseId, showToast, onReviewCountChange }) {
  const { user, token } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPostLoginPrompt, setShowPostLoginPrompt] = useState(false);
  const [canReview, setCanReview] = useState(true);
  const [cantReviewReason, setCantReviewReason] = useState('');

  const [rating, setRating] = useState(5);
  const [reviewerName, setReviewerName] = useState('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [photosUploading, setPhotosUploading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(reviews.length / REVIEWS_PER_PAGE));
  const paginatedReviews = reviews.slice((currentPage - 1) * REVIEWS_PER_PAGE, currentPage * REVIEWS_PER_PAGE);

  useEffect(() => setCurrentPage(1), [reviews.length, propertyId, carId, leaseId]);

  const isLease = Boolean(leaseId);
  const reviewsBase = isLease ? `${API_BASE_URL}/lease-reviews` : `${API_BASE_URL}/reviews`;

  const listingEndpoint = propertyId
    ? `${API_BASE_URL}/reviews/property/${propertyId}`
    : carId
      ? `${API_BASE_URL}/reviews/car/${carId}`
      : `${API_BASE_URL}/lease-reviews/lease/${leaseId}`;

  const fetchReviews = () => {
    setLoading(true);
    fetch(listingEndpoint)
      .then((res) => res.json())
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setReviews(list);
        if (onReviewCountChange) onReviewCountChange(list.length);
        setLoading(false);
      })
      .catch(() => {
        setReviews([]);
        setLoading(false);
      });
  };

  const fetchMyReviewStatus = () => {
    if (!token) return;
    const params = propertyId ? `propertyId=${propertyId}` : carId ? `carId=${carId}` : `leaseId=${leaseId}`;
    fetch(`${reviewsBase}/my-review?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        setHasReviewed(!!data.hasReviewed);
        // House/car answers don't include canReview - anyone may review those.
        setCanReview(data.canReview !== false || !!data.hasReviewed);
        setCantReviewReason(data.reason || '');
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchReviews();
    if (user) fetchMyReviewStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId, carId, leaseId, user]);

  useEffect(() => {
    if (user && !reviewerName) {
      const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      if (fullName) setReviewerName(fullName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Detect a pending Microsoft review that survived the MSAL redirect.
  // MicrosoftSignInButton saved 'review' to sessionStorage before
  // navigating away; this opens the review form once the user comes
  // back and is authenticated.
  useEffect(() => {
    if (user && getPendingAction() === 'review') {
      setShowPostLoginPrompt(true);
    }
  }, [user]);

  const notify = (message, type = 'info') => {
    if (showToast) showToast(message, type);
  };

  const resetForm = () => {
    setTitle('');
    setComment('');
    setRating(5);
    setAvatarUrl(null);
    setPhotos([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!reviewerName.trim()) {
      notify('Please enter your name', 'error');
      return;
    }
    if (!comment.trim()) {
      notify('Please write a comment for your review', 'error');
      return;
    }
    if (photosUploading || avatarUploading) {
      notify('Please wait for your photos to finish uploading', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(reviewsBase, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          propertyId: propertyId || null,
          carId: carId || null,
          leaseId: leaseId || null,
          rating,
          title,
          comment,
          reviewerDisplayName: reviewerName.trim(),
          reviewerAvatarUrl: avatarUrl,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        // Attach any uploaded photos to the new review.
        if (photos.length > 0 && data && data.id) {
          try {
            const photoRes = await fetch(`${reviewsBase}/${data.id}/photos`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ imageUrls: photos }),
            });
            if (!photoRes.ok) {
              const photoData = await photoRes.json().catch(() => null);
              notify((photoData && photoData.message) || 'Your review was saved, but the photos could not be attached.', 'error');
            }
          } catch {
            notify('Your review was saved, but the photos could not be attached.', 'error');
          }
        }
        // New reviews start as pending until the host publishes them.
        notify('Thanks for your review! It will appear here once the host publishes it.', 'success');
        setShowForm(false);
        resetForm();
        setHasReviewed(true);
        setJustSubmitted(true);
      } else {
        notify(data.message || 'Failed to submit review', 'error');
      }
    } catch (err) {
      notify('Network error while submitting review', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const averageRating = reviews.length
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">
            Reviews {reviews.length > 0 && `(${reviews.length})`}
          </h3>
          {averageRating && (
            <div className="flex items-center gap-2 mt-1">
              <StarDisplay rating={Math.round(averageRating)} />
              <span className="text-sm text-gray-600">{averageRating} out of 5</span>
            </div>
          )}
        </div>

        {user && !hasReviewed && canReview && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-600 min-h-[40px]"
          >
            Write a review
          </button>
        )}
      </div>

      {!user && (
        <div className="mb-4">
          <InlineLoginPopup
            linkText="Log in to leave a review"
            onLoginSuccess={() => setShowForm(true)}
            pendingAction="review"
          />
        </div>
      )}

      {user && !hasReviewed && !canReview && cantReviewReason && (
        <p className="text-sm text-gray-500 mb-4">{cantReviewReason}</p>
      )}

      {user && hasReviewed && !showForm && (
        <p className="text-sm text-gray-500 mb-4">
          {justSubmitted
            ? 'Thanks for your review! It will appear here once the host publishes it.'
            : "You've already reviewed this listing. Thanks for sharing your feedback!"}
        </p>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
            <StarInput value={rating} onChange={setRating} />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">Your photo</label>
            <AvatarPicker
              value={avatarUrl}
              onChange={setAvatarUrl}
              name={reviewerName}
              token={token}
              onUploadingChange={setAvatarUploading}
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Your name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={reviewerName}
              onChange={(e) => setReviewerName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm min-h-[40px]"
              placeholder="How should we show your name?"
              required
            />
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm min-h-[40px]"
              placeholder={isLease ? 'Summarize your time living here' : 'Summarize your stay'}
            />
          </div>
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">Comment</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
              placeholder="Tell others about your experience"
              required
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Photos (optional)</label>
            <PhotoUploader
              value={photos}
              onChange={setPhotos}
              folder="reviews"
              max={6}
              onUploadingChange={setPhotosUploading}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || photosUploading || avatarUploading}
              className="bg-rose-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-rose-600 min-h-[40px] disabled:opacity-50"
            >
              {photosUploading || avatarUploading ? 'Uploading photos...' : submitting ? 'Submitting...' : 'Submit review'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); resetForm(); }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 min-h-[40px]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading reviews...</p>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-gray-500">No reviews yet. Be the first to review this listing!</p>
      ) : (
        <>
          <div className="space-y-4">
            {paginatedReviews.map((r) => (
              <div key={r.id} className="border-b border-gray-200 pb-4">
                <div className="flex items-start gap-3">
                  <ReviewerAvatar url={r.reviewerAvatarUrl} name={r.reviewerDisplayName} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-800">{r.reviewerDisplayName || 'Anonymous'}</span>
                      <StarDisplay rating={r.rating} />
                      {r.isVerifiedStay && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Verified stay</span>
                      )}
                    </div>
                    {r.title && <p className="font-medium text-gray-800 mt-1">{r.title}</p>}
                    <p className="text-sm text-gray-600 mt-1">{r.comment}</p>
                    <ReviewPhotos urls={r.imageUrls || []} />
                    <p className="text-xs text-gray-400 mt-1">{new Date(r.createdAt).toLocaleDateString()}</p>

                    {r.hostReply && (
                      <div className="mt-3 bg-gray-50 border-l-2 border-gray-300 rounded-r-lg px-3 py-2">
                        <p className="text-xs font-semibold text-gray-700">
                          Response from the host
                          {r.hostRepliedAt && (
                            <span className="font-normal text-gray-400"> · {new Date(r.hostRepliedAt).toLocaleDateString()}</span>
                          )}
                        </p>
                        <p className="text-sm text-gray-600 mt-1 whitespace-pre-line">{r.hostReply}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1.5 mt-4">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 rounded text-sm min-h-[36px] border border-gray-300 text-gray-600 disabled:opacity-40"
              >
                ‹ Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1.5 rounded text-sm min-h-[36px] min-w-[36px] ${
                    currentPage === pageNum ? 'bg-rose-500 text-white font-semibold' : 'border border-gray-300 text-gray-600'
                  }`}
                >
                  {pageNum}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 rounded text-sm min-h-[36px] border border-gray-300 text-gray-600 disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          )}
        </>
      )}

      {showPostLoginPrompt && (
        <PostLoginPrompt
          actionLabel="Write a review"
          onConfirm={() => {
            setShowPostLoginPrompt(false);
            clearPendingAction();
            setShowForm(true);
          }}
          onDismiss={() => {
            setShowPostLoginPrompt(false);
            clearPendingAction();
          }}
        />
      )}
    </div>
  );
}