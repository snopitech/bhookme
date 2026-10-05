import React, { useRef } from 'react';
import PropertyCard from './PropertyCard';
import './PropertyRow.css';

export default function PropertyRow({ title, properties }) {
  const scrollRef = useRef(null);

  if (!properties || properties.length === 0) return null;

  const scroll = (direction) => {
    if (scrollRef.current) {
      const cardWidth = scrollRef.current.firstChild?.offsetWidth || 250;
      scrollRef.current.scrollBy({ left: direction * (cardWidth + 24) * 2, behavior: 'smooth' });
    }
  };

  return (
    <div className="property-row-section">
      <h2 className="property-row-title">{title}</h2>
      <div className="property-row-wrapper">
        <button className="property-row-arrow property-row-arrow-left" onClick={() => scroll(-1)} aria-label="Scroll left">
          ‹
        </button>
        <div className="property-row-scroll" ref={scrollRef}>
          {properties.map((property) => (
            <div className="property-row-item" key={property.id}>
              <PropertyCard property={property} />
            </div>
          ))}
        </div>
        <button className="property-row-arrow property-row-arrow-right" onClick={() => scroll(1)} aria-label="Scroll right">
          ›
        </button>
      </div>
    </div>
  );
}