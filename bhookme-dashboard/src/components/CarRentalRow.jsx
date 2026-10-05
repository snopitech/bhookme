import React, { useEffect, useRef, useState } from 'react';
import CarCard from './CarCard';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

export default function CarRentalRow() {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/cars`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setCars(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const scroll = (direction) => {
    if (!scrollRef.current) return;
    const amount = direction === 'left' ? -300 : 300;
    scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
  };

  // Renders nothing while loading or if there are no cars, so this
  // stays invisible rather than showing an empty section.
  if (loading || cars.length === 0) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 pt-3 pb-2 relative group/row">
      <h2 className="text-sm font-semibold text-gray-700 mb-2">Cars for your trip</h2>

      <button
        onClick={() => scroll('left')}
        aria-label="Scroll left"
        className="hidden group-hover/row:flex absolute left-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center hover:scale-105 transition"
      >
        ‹
      </button>

      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {cars.map((car) => (
          <CarCard key={car.id} car={car} />
        ))}
      </div>

      <button
        onClick={() => scroll('right')}
        aria-label="Scroll right"
        className="hidden group-hover/row:flex absolute right-2 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-white shadow-md border border-gray-200 items-center justify-center hover:scale-105 transition"
      >
        ›
      </button>
    </div>
  );
}