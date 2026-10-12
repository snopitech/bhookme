import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';

export default function CarCard({ car }) {
  const [imgError, setImgError] = useState(false);
  const showFallback = imgError || !car.imageUrl;

  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const { isCarSaved, toggleCar } = useWishlist();
  const saved = isCarSaved(car.id);

  const handleHeartClick = (e) => {
    // The whole card is a link, so stop the click from opening the car page.
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    toggleCar(car.id);
  };

  return (
    <Link to={`/car/${car.id}`} className="shrink-0 w-32 cursor-pointer group block">
      <div className="w-32 h-20 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center relative">
        {showFallback ? (
          <span className="text-2xl">🚗</span>
        ) : (
          <img
            src={car.imageUrl}
            alt={`${car.make} ${car.model}`}
            onError={() => setImgError(true)}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        )}
        <button
          type="button"
          onClick={handleHeartClick}
          aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
          className={`absolute top-1.5 right-1.5 text-lg leading-none ${saved ? 'text-rose-500' : 'text-white'}`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
        >
          {saved ? '♥' : '♡'}
        </button>
      </div>
      <p className="mt-1 text-xs font-medium text-gray-900 truncate">
        {car.make} {car.model}
      </p>
      <p className="text-xs text-gray-500">${Number(car.dailyRate).toFixed(0)}/day</p>
    </Link>
  );
}