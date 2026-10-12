import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';

// Square photo by default (Wishlist page, etc.). With round, it shows a
// small circular photo - used by the home page's city rows.
export default function PropertyCard({ property, round = false }) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isSaved, toggle } = useWishlist();

  const imageUrl = property.imageUrls?.[0] || 'https://placehold.co/400x300?text=No+Photo';
  const saved = isSaved(property.id);

  const handleHeartClick = (e) => {
    // The whole card is a link, so stop the click from opening the listing.
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    toggle(property.id);
  };

  if (round) {
    return (
      <Link to={`/property/${property.id}`} className="cursor-pointer group block text-center min-w-0">
        <div className="relative">
          <button
            type="button"
            onClick={handleHeartClick}
            aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
            className={`absolute top-0 right-0 z-10 w-8 h-8 rounded-full bg-white shadow-md flex items-center justify-center text-lg leading-none hover:scale-110 transition ${
              saved ? 'text-rose-500' : 'text-gray-700'
            }`}
          >
            {saved ? '♥' : '♡'}
          </button>
          <div className="relative w-full aspect-square rounded-full overflow-hidden bg-gray-200 ring-4 ring-white shadow-md group-hover:shadow-xl group-hover:-translate-y-1 transition duration-300">
            <img
              src={imageUrl}
              alt={property.title}
              loading="lazy"
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            />
          </div>
        </div>
        <div className="mt-2 px-1">
          <p className="font-medium text-gray-900 truncate text-sm">{property.title}</p>
          <p className="text-gray-500 text-xs truncate">
            {property.city}, {property.state}
          </p>
          <p className="mt-0.5 text-sm">
            <span className="font-semibold">${Number(property.basePricePerNight).toFixed(0)}</span>
            <span className="text-gray-500"> night</span>
          </p>
        </div>
      </Link>
    );
  }

  return (
    <Link to={`/property/${property.id}`} className="cursor-pointer group block min-w-0">
      <div className="aspect-square rounded-xl overflow-hidden bg-gray-200 relative">
        <img
          src={imageUrl}
          alt={property.title}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
        />
        <button
          onClick={handleHeartClick}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          className={`absolute top-3 right-3 text-2xl leading-none ${saved ? 'text-rose-500' : 'text-white'}`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
        >
          {saved ? '♥' : '♡'}
        </button>
      </div>
      <div className="mt-2">
        <div className="flex justify-between items-start min-w-0">
          <p className="font-medium text-gray-900 truncate">{property.city}, {property.state}</p>
          <span className="text-sm text-gray-500 shrink-0 ml-2">★ New</span>
        </div>
        <p className="text-gray-500 text-sm truncate">{property.title}</p>
        <p className="mt-1">
          <span className="font-semibold">${Number(property.basePricePerNight).toFixed(0)}</span>
          <span className="text-gray-500"> night</span>
        </p>
      </div>
    </Link>
  );
}
