import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import CarReserveCard from '../components/CarReserveCard';
import ReviewSection from '../components/ReviewSection';
import MessageHostPanel from '../components/MessageHostPanel';
import PropertyGallery from '../components/PropertyGallery';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const RECENT_KEY = 'bhookme_recently_viewed_cars';
const MAX_RECENT = 12;
const MAX_SIMILAR = 8;

function carName(car) {
  return [car.year, car.make, car.model].filter(Boolean).join(' ');
}

function photosOf(car) {
  if (car.imageUrls?.length) return car.imageUrls;
  return car.imageUrl ? [car.imageUrl] : [];
}

// ---------- Recently viewed cars (kept on this device) ----------

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function rememberViewed(car) {
  const entry = {
    id: car.id,
    make: car.make,
    model: car.model,
    year: car.year,
    category: car.category,
    city: car.city,
    state: car.state,
    dailyRate: car.dailyRate,
    imageUrl: photosOf(car)[0] || null,
  };
  const next = [entry, ...readRecent().filter((c) => c.id !== car.id)].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked - recently viewed is just a convenience
  }
  return next;
}

// ---------- Similar cars ----------
// Same city scores highest, then same category, then similar daily price.
function pickSimilar(current, all) {
  const price = Number(current.dailyRate) || 0;
  return all
    .filter((c) => c.id !== current.id)
    .map((c) => {
      let score = 0;
      if ((c.city || '').toLowerCase() === (current.city || '').toLowerCase()) score += 3;
      if ((c.category || '').toLowerCase() === (current.category || '').toLowerCase()) score += 2;
      if ((c.make || '').toLowerCase() === (current.make || '').toLowerCase()) score += 1;
      const otherPrice = Number(c.dailyRate) || 0;
      if (price > 0 && otherPrice > 0) {
        const diff = Math.abs(otherPrice - price) / price;
        if (diff <= 0.25) score += 2;
        else if (diff <= 0.5) score += 1;
      }
      return { c, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SIMILAR)
    .map((x) => x.c);
}

function CarCard({ car }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isCarSaved, toggleCar } = useWishlist();
  const saved = isCarSaved(car.id);
  const cover = car.imageUrls?.[0] || car.imageUrl;

  const handleHeart = (e) => {
    // The whole card is a link, so stop the click from opening the car.
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    toggleCar(car.id);
  };

  return (
    <Link to={`/car/${car.id}`} className="group block">
      <div className="aspect-square rounded-xl overflow-hidden bg-gray-200 relative">
        {cover ? (
          <img src={cover} alt={carName(car)} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl" aria-hidden="true">🚗</div>
        )}
        <button
          type="button"
          onClick={handleHeart}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          className={`absolute top-3 right-3 text-2xl leading-none ${saved ? 'text-rose-500' : 'text-white'}`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
        >
          {saved ? '♥' : '♡'}
        </button>
      </div>
      <div className="mt-2">
        <p className="font-medium text-gray-900 truncate">{carName(car)}</p>
        <p className="text-gray-500 text-sm truncate">
          {[car.category, [car.city, car.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
        </p>
        {Number(car.dailyRate) > 0 && (
          <p className="mt-1">
            <span className="font-semibold">${Number(car.dailyRate).toFixed(0)}</span>
            <span className="text-gray-500"> day</span>
          </p>
        )}
      </div>
    </Link>
  );
}

// Sideways row of car cards with arrows on larger screens.
function CarRow({ title, cars }) {
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
  }, [cars.length]);

  const scrollBy = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' });
  };

  if (!cars.length) return null;

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
        {cars.map((car) => (
          <div key={car.id} className="shrink-0 snap-start w-[70%] sm:w-[45%] md:w-[30%] lg:w-[23%]">
            <CarCard car={car} />
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

export default function CarDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isCarSaved, toggleCar } = useWishlist();

  const [car, setCar] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewCount, setReviewCount] = useState(null);
  const [toast, setToast] = useState(null);
  const [allCars, setAllCars] = useState([]);
  const [recent, setRecent] = useState([]);

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    window.scrollTo(0, 0);
    fetch(`${API_BASE_URL}/cars/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Car not found');
        return res.json();
      })
      .then((data) => {
        setCar(data);
        setRecent(rememberViewed(data));
        setLoading(false);
      })
      .catch(() => {
        setError('This car listing could not be found.');
        setLoading(false);
      });
  }, [id]);

  // All active cars, for "Similar cars".
  useEffect(() => {
    fetch(`${API_BASE_URL}/cars`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setAllCars(Array.isArray(data) ? data : []))
      .catch(() => setAllCars([]));
  }, []);

  const similar = useMemo(() => (car ? pickSimilar(car, allCars) : []), [car, allCars]);
  const recentlyViewed = useMemo(() => (car ? recent.filter((c) => c.id !== car.id) : []), [recent, car]);

  if (loading) return <div className="max-w-6xl mx-auto px-6 py-12 text-gray-500">Loading...</div>;
  if (error) return <div className="max-w-6xl mx-auto px-6 py-12 text-red-500">{error}</div>;
  if (!car) return null;

  const displayedReviewCount = reviewCount !== null ? reviewCount : 0;
  const saved = isCarSaved(car.id);
  const photos = photosOf(car);
  const name = carName(car);

  const handleSave = () => {
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    toggleCar(car.id);
    showToast(saved ? 'Removed from your wishlist' : 'Saved to your wishlist', 'success');
  };

  const handleShare = async () => {
    const url = window.location.href;
    const shareData = { title: name, text: `${name} for rent in ${car.city}, ${car.state} on bhookme`, url };
    // Phones: the native share sheet. Computers: copy the link.
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
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
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold">{name}</h1>
            <p className="text-gray-600">
              {car.category} · {car.city}, {car.state}
            </p>
          </div>
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

        {photos.length > 0 ? (
          <PropertyGallery images={photos} title={name} />
        ) : (
          <div className="w-full h-72 sm:h-96 rounded-xl overflow-hidden bg-gray-200 mb-6 flex items-center justify-center">
            <span className="text-6xl" aria-hidden="true">🚗</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2">
            <div className="border border-gray-200 rounded-xl p-4 mb-6 flex items-center gap-3">
              <span className="text-xl">🚙</span>
              <div>
                <p className="font-medium">
                  {displayedReviewCount > 0 ? `${displayedReviewCount} review${displayedReviewCount !== 1 ? 's' : ''}` : 'New to bhookme'}
                </p>
                {displayedReviewCount === 0 && (
                  <p className="text-sm text-gray-500">No reviews yet - be the first to rent this car.</p>
                )}
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 mb-6 flex items-center gap-4">
              <div className="w-14 h-14 rounded-full bg-gray-300 flex items-center justify-center text-lg font-semibold text-white">
                {car.hostFirstName?.[0]?.toUpperCase()}
              </div>
              <div>
                <p className="font-semibold">Hosted by {car.hostFirstName} {car.hostLastName}</p>
              </div>
            </div>

            <MessageHostPanel
              carId={car.id}
              hostId={car.hostId}
              hostName={`${car.hostFirstName} ${car.hostLastName}`}
            />

            <div className="border-t border-gray-200 pt-6 mt-6">
              <h3 className="font-semibold mb-2">Vehicle details</h3>
              <div className="grid grid-cols-2 gap-3 text-gray-700">
                <div>Make: {car.make}</div>
                <div>Model: {car.model}</div>
                <div>Year: {car.year}</div>
                <div>Type: {car.category}</div>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6 mt-6">
              <ReviewSection carId={car.id} showToast={showToast} onReviewCountChange={setReviewCount} />
            </div>
          </div>

          <div className="lg:col-span-1">
            <CarReserveCard car={car} />
          </div>
        </div>

        <CarRow title={`Similar cars${car.city ? ` near ${car.city}` : ''}`} cars={similar} />
        <CarRow title="Recently viewed cars" cars={recentlyViewed} />
      </div>
    </div>
  );
}