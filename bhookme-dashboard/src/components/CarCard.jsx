import React, { useState } from 'react';
import { Link } from 'react-router-dom';

export default function CarCard({ car }) {
  const [imgError, setImgError] = useState(false);
  const showFallback = imgError || !car.imageUrl;

  return (
    <Link to={`/car/${car.id}`} className="shrink-0 w-32 cursor-pointer group block">
      <div className="w-32 h-20 rounded-lg overflow-hidden bg-gray-200 flex items-center justify-center">
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
      </div>
      <p className="mt-1 text-xs font-medium text-gray-900 truncate">{car.make} {car.model}</p>
      <p className="text-xs text-gray-500">${Number(car.dailyRate).toFixed(0)}/day</p>
    </Link>
  );
}