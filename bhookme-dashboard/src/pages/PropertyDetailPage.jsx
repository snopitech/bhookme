import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import PropertyGallery from '../components/PropertyGallery';
import ReserveCard from '../components/ReserveCard';
import ReviewSection from '../components/ReviewSection';
import MessageHostPanel from '../components/MessageHostPanel';
import PropertyCard from '../components/PropertyCard';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const RECENT_KEY = 'bhookme_recently_viewed';
const MAX_RECENT = 12;
const MAX_SIMILAR = 8;

// ---------- Recently viewed (kept on this device, like eStore) ----------

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Stores just what PropertyCard needs, newest first.
function rememberViewed(property) {
  const entry = {
    id: property.id,
    title: property.title,
    city: property.city,
    state: property.state,
    basePricePerNight: property.basePricePerNight,
    imageUrls: property.imageUrls?.length ? [property.imageUrls[0]] : [],
  };
  const next = [entry, ...readRecent().filter((p) => p.id !== property.id)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked - recently viewed is just a convenience
  }
  return next;
}

// ---------- Similar homes ----------
// Same city scores highest, then similar price, then same place type.
function pickSimilar(current, all) {
  const price = Number(current.basePricePerNight) || 0;
  return all
    .filter((p) => p.id !== current.id)
    .map((p) => {
      let score = 0;
      if ((p.city || '').toLowerCase() === (current.city || '').toLowerCase()) score += 3;
      if ((p.state || '').toLowerCase() === (current.state || '').toLowerCase()) score += 1;
      const otherPrice = Number(p.basePricePerNight) || 0;
      if (price > 0 && otherPrice > 0) {
        const diff = Math.abs(otherPrice - price) / price;
        if (diff <= 0.25) score += 2;
        else if (diff <= 0.5) score += 1;
      }
      if (p.propertyType && p.propertyType === current.propertyType) score += 1;
      return { p, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SIMILAR)
    .map((x) => x.p);
}

// Sideways row of PropertyCards with arrows on larger screens.
function HomeRow({ title, homes }) {
  const ref = useRef(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return undefined;
    el.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [homes.length]);

  const scrollBy = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  if (!homes.length) return null;

  return (
    <section className="border-t border-gray-200 pt-8 mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="hidden md:flex gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            disabled={!canLeft}
            aria-label={`Scroll ${title} left`}
            className="w-8 h-8 rounded-full border border-gray-300 bg-white flex items-center justify-center hover:shadow disabled:opacity-30"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            disabled={!canRight}
            aria-label={`Scroll ${title} right`}
            className="w-8 h-8 rounded-full border border-gray-300 bg-white flex items-center justify-center hover:shadow disabled:opacity-30"
          >
            ›
          </button>
        </div>
      </div>
      <div ref={ref} className="flex gap-5 overflow-x-auto snap-x pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {homes.map((home) => (
          <div key={home.id} className="shrink-0 snap-start w-[70%] sm:w-[45%] md:w-[30%] lg:w-[23%]">
            <PropertyCard property={home} />
          </div>
        ))}
      </div>
    </section>
  );
}

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 3v13" />
      <path d="m7 8 5-5 5 5" />
      <path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

export default function PropertyDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isSaved, toggle } = useWishlist();

  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewCount, setReviewCount] = useState(null);
  const [toast, setToast] = useState(null);
  const [allHomes, setAllHomes] = useState([]);
  const [recent, setRecent] = useState([]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    window.scrollTo(0, 0);
    fetch(`${API_BASE_URL}/properties/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Property not found');
        return res.json();
      })
      .then((data) => {
        setProperty(data);
        setRecent(rememberViewed(data));
        setLoading(false);
      })
      .catch(() => {
        setError('This listing could not be found.');
        setLoading(false);
      });
  }, [id]);

  // All active homes, for "Similar homes".
  useEffect(() => {
    fetch(`${API_BASE_URL}/properties`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAllHomes(Array.isArray(data) ? data : []))
      .catch(() => setAllHomes([]));
  }, []);

  const similar = useMemo(() => (property ? pickSimilar(property, allHomes) : []), [property, allHomes]);
  const recentlyViewed = useMemo(
    () => (property ? recent.filter((p) => p.id !== property.id) : []),
    [recent, property]
  );

  if (loading) return <div className="max-w-6xl mx-auto px-6 py-12 text-gray-500">Loading...</div>;
  if (error) return <div className="max-w-6xl mx-auto px-6 py-12 text-red-500">{error}</div>;
  if (!property) return null;

  const displayedReviewCount = reviewCount !== null ? reviewCount : 0;
  const saved = isSaved(property.id);

  const handleSave = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    toggle(property.id);
    showToast(saved ? 'Removed from your wishlist' : 'Saved to your wishlist', 'success');
  };

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = {
      title: property.title,
      text: `${property.title} in ${property.city}, ${property.state} on bhookme`,
      url,
    };
    // Phones: the native share sheet (WhatsApp, Messages, ...). Computers: copy the link.
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return; // user closed the share sheet
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Link copied', 'success');
    } catch {
      window.prompt('Copy this link to share:', url);
    }
  };

  return (
    <div className="min-h-screen">
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white"
             style={{ backgroundColor: toast.type === 'success' ? '#16a34a' : toast.type === 'error' ? '#dc2626' : '#374151' }}>
          {toast.message}
        </div>
      )}

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Title + Share / Save */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
          <h1 className="text-2xl sm:text-3xl font-semibold">{property.title}</h1>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold underline hover:bg-gray-100"
            >
              <ShareIcon />
              Share
            </button>
            <button
              type="button"
              onClick={handleSave}
              aria-pressed={saved}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold underline hover:bg-gray-100"
            >
              <span className={`text-lg leading-none ${saved ? 'text-rose-500' : ''}`} aria-hidden="true">
                {saved ? '♥' : '♡'}
              </span>
              {saved ? 'Saved' : 'Save'}
            </button>
          </div>
        </div>

        <PropertyGallery images={property.imageUrls} title={property.title} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <h2 className="text-2xl font-bold mb-1">
              {property.propertyType.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())} in {property.city}, {property.state}
            </h2>
            <p className="text-gray-600 mb-4">
              {property.maxGuests} guests · {property.bedrooms} bedroom{property.bedrooms !== 1 ? 's' : ''} · {property.bathrooms} bath
            </p>

            <div className="border border-gray-200 rounded-xl p-4 mb-6 flex items-center gap-3">
              <span className="text-xl">✨</span>
              <div>
                <p className="font-medium">
                  {displayedReviewCount > 0 ? `${displayedReviewCount} review${displayedReviewCount !== 1 ? 's' : ''}` : 'New listing'}
                </p>
                {displayedReviewCount === 0 && (
                  <p className="text-sm text-gray-500">No reviews yet - be the first to stay here.</p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 mb-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gray-300 flex items-center justify-center text-lg font-semibold text-white">
                {property.hostFirstName?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">Hosted by {property.hostFirstName} {property.hostLastName}</p>
              </div>
            </div>

            <MessageHostPanel
              propertyId={property.id}
              hostId={property.hostId}
              hostName={`${property.hostFirstName} ${property.hostLastName}`}
            />

            <div className="border-t border-gray-200 pt-6 mb-6 mt-6">
              <h3 className="font-semibold mb-2">Where you will be</h3>
              <p className="text-gray-700">{property.city}, {property.state}</p>
              <p className="text-gray-500 text-sm mt-1">Exact address provided after booking is confirmed.</p>
            </div>

            <div className="border-t border-gray-200 pt-6 mb-6">
              <h3 className="font-semibold mb-2">About this place</h3>
              <p className="text-gray-700 whitespace-pre-line">{property.description}</p>
            </div>

            {property.amenityNames?.length > 0 && (
              <div className="border-t border-gray-200 pt-6 mb-6">
                <h3 className="font-semibold mb-3">What this place offers</h3>
                <div className="grid grid-cols-2 gap-3">
                  {property.amenityNames.map((amenity) => (
                    <div key={amenity} className="text-gray-700">{amenity}</div>
                  ))}
                </div>
              </div>
            )}

            <div className="border-t border-gray-200 pt-6">
              <ReviewSection propertyId={property.id} showToast={showToast} onReviewCountChange={setReviewCount} />
            </div>
          </div>

          <div className="lg:col-span-1">
            <ReserveCard property={property} />
          </div>
        </div>

        <HomeRow title={`Similar homes${property.city ? ` near ${property.city}` : ''}`} homes={similar} />
        <HomeRow title="Recently viewed" homes={recentlyViewed} />
      </div>
    </div>
  );
}