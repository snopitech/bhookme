import React, { useMemo, useRef, useState } from 'react';
import PropertyCard from './PropertyCard';
import SectionSearch from './SectionSearch';
import './PropertyRow.css';

// One home-page section ("Stay in Houston, TX"). The 🔍 next to the
// title searches only this section's homes (same city/state).
export default function PropertyRow({ title, properties, city, state }) {
  const scrollRef = useRef(null);
  // null = not searching; otherwise matching ids, best first.
  const [matchIds, setMatchIds] = useState(null);

  const shown = useMemo(() => {
    if (!properties) return [];
    if (!matchIds) return properties;
    const byId = new Map(properties.map((p) => [String(p.id), p]));
    return matchIds.map((id) => byId.get(id)).filter(Boolean);
  }, [properties, matchIds]);

  if (!properties || properties.length === 0) return null;

  const scroll = (direction) => {
    if (scrollRef.current) {
      const cardWidth = scrollRef.current.firstChild?.offsetWidth || 250;
      scrollRef.current.scrollBy({ left: direction * (cardWidth + 24) * 2, behavior: 'smooth' });
    }
  };

  return (
    <div className="property-row-section">
      <SectionSearch
        title={title}
        titleClassName="property-row-title"
        wrapperClassName="mb-4"
        scope="homes"
        city={city}
        state={state}
        onResults={setMatchIds}
      />

      {shown.length === 0 ? (
        <div className="border border-dashed border-gray-300 rounded-xl px-4 py-8 text-center text-sm text-gray-500">
          No homes in this section match your search. Try fewer words, like just "2 bedroom".
        </div>
      ) : (
        <div className="property-row-wrapper">
          <button className="property-row-arrow property-row-arrow-left" onClick={() => scroll(-1)} aria-label="Scroll left">
            ‹
          </button>
          <div className="property-row-scroll" ref={scrollRef}>
            {shown.map((property) => (
              <div className="property-row-item" key={property.id}>
                <PropertyCard property={property} />
              </div>
            ))}
          </div>
          <button className="property-row-arrow property-row-arrow-right" onClick={() => scroll(1)} aria-label="Scroll right">
            ›
          </button>
        </div>
      )}
    </div>
  );
}