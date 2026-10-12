import React, { useEffect, useMemo, useRef, useState } from 'react';
import CarCard from './CarCard';
import SectionSearch from './SectionSearch';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

export default function CarRentalRow() {
  const [cars, setCars] = useState([]);
  const [loading, setLoading] = useState(true);
  // null = not searching; otherwise matching car ids, best first.
  const [matchIds, setMatchIds] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/cars`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        setCars(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const shown = useMemo(() => {
    if (!matchIds) return cars;
    const byId = new Map(cars.map((c) => [String(c.id), c]));
    return matchIds.map((id) => byId.get(id)).filter(Boolean);
  }, [cars, matchIds]);

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
      <SectionSearch
        title="Cars for your trip"
        titleClassName="text-sm font-semibold text-gray-700"
        wrapperClassName="mb-2"
        scope="cars"
        onResults={setMatchIds}
      />

      {shown.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl px-4 py-6 text-center text-sm text-gray-500">
          No cars match your search. Try fewer words, like just "SUV" or "Toyota".
        </div>
      ) : (
        <>
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
            {shown.map((car) => (
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
        </>
      )}
    </div>
  );
}