import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';

export default function PropertyCard({ property }) {
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

  return (
    <Link to={`/property/${property.id}`} className="cursor-pointer group block">
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
        <div className="flex justify-between items-start">
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