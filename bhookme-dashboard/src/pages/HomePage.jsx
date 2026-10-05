import React, { useEffect, useState } from 'react';
import PropertyRow from '../components/PropertyRow';
import MockMap from '../components/MockMap';
import CarRentalRow from '../components/CarRentalRow';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

export default function HomePage() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/properties`)
      .then((res) => res.json())
      .then((data) => {
        setProperties(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load properties. Is the backend running?');
        setLoading(false);
      });
  }, []);

  const cityGroups = properties.reduce((groups, property) => {
    const key = `${property.city}, ${property.state}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(property);
    return groups;
  }, {});

  return (
    <div>
      <CarRentalRow />

      {loading && (
        <div className="max-w-7xl mx-auto px-6 py-8 text-gray-500">Loading properties...</div>
      )}

      {!loading && error && (
        <div className="max-w-7xl mx-auto px-6 py-8 text-red-500">{error}</div>
      )}

      {!loading && !error && properties.length === 0 && (
        <div className="max-w-7xl mx-auto px-6 py-8 text-gray-500">
          No listings yet. Be the first to become a host!
        </div>
      )}

      {!loading && !error && properties.length > 0 && (
        <div className="max-w-[1600px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {Object.entries(cityGroups).map(([cityLabel, cityProperties]) => (
              <PropertyRow
                key={cityLabel}
                title={`Stay in ${cityLabel}`}
                properties={cityProperties}
              />
            ))}
          </div>
          <div className="hidden lg:block lg:col-span-1">
            <MockMap />
          </div>
        </div>
      )}
    </div>
  );
}