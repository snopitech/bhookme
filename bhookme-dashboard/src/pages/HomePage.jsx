import React, { useEffect, useMemo, useState } from 'react';
import PropertyRow from '../components/PropertyRow';
import MapPanel from '../components/MapPanel';
import CarRentalRow from '../components/CarRentalRow';
import LeaseRow from '../components/LeaseRow';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

// How many cities the home page's "Short Stay" lane pulls from.
const NEAREST_CITY_COUNT = 3;

// A home's map position, whichever field names the listing uses.
function coordsOf(p) {
  const lat = Number(p.latitude ?? p.lat);
  const lng = Number(p.longitude ?? p.lng ?? p.lon);
  return Number.isFinite(lat) && Number.isFinite(lng) && (lat !== 0 || lng !== 0) ? { lat, lng } : null;
}

// Straight-line distance in miles between two map points.
function milesBetween(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

export default function HomePage() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // The visitor's location, if their browser shares it. null = unknown.
  const [visitor, setVisitor] = useState(null);

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

  // Ask the browser once where the visitor is, so "Short Stay" can
  // show the closest cities. If they say no (or it isn't available),
  // we fall back to the cities with the most homes.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setVisitor({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { maximumAge: 30 * 60 * 1000, timeout: 10000 }
    );
  }, []);

  // ONE "Short Stay" lane with the homes from the 3 closest cities,
  // nearest city first. The full list lives on /stays (bottom nav).
  const shortStays = useMemo(() => {
    const groups = new Map();
    properties.forEach((p) => {
      const key = `${p.city}, ${p.state}`;
      if (!groups.has(key)) groups.set(key, { list: [], points: [] });
      const g = groups.get(key);
      g.list.push(p);
      const c = coordsOf(p);
      if (c) g.points.push(c);
    });

    const cities = [...groups.values()].map((g) => {
      let distance = Infinity;
      if (visitor && g.points.length > 0) {
        const center = {
          lat: g.points.reduce((s, c) => s + c.lat, 0) / g.points.length,
          lng: g.points.reduce((s, c) => s + c.lng, 0) / g.points.length,
        };
        distance = milesBetween(visitor, center);
      }
      return { ...g, distance };
    });

    // Closest first; without a location, busiest cities first.
    cities.sort((a, b) => a.distance - b.distance || b.list.length - a.list.length);
    return cities.slice(0, NEAREST_CITY_COUNT).flatMap((g) => g.list);
  }, [properties, visitor]);

  return (
    <div>
      {/* Mobile-only map - renders INLINE right under the header.
          Pushes every section below it down when open. Closed by
          default; the header's Map button toggles it. */}
      <div className="lg:hidden px-6 pt-4">
        <MapPanel mobileOnly />
      </div>

      <CarRentalRow />

      {loading && (
        <div className="max-w-7xl mx-auto px-6 py-8 text-gray-500">Loading properties...</div>
      )}

      {!loading && error && (
        <div className="max-w-7xl mx-auto px-6 py-8 text-red-500">{error}</div>
      )}

      {!loading && !error && (
        <div className="max-w-[1600px] mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            {/* Monthly stays & leases - sits next to the map like the house rows. */}
            <LeaseRow />

            {properties.length === 0 && (
              <p className="text-gray-500 py-4">No home listings yet. Be the first to become a host!</p>
            )}

            {shortStays.length > 0 && (
              <PropertyRow title="shortStay" properties={shortStays} />
            )}
          </div>
          <div className="lg:col-span-1">
            {/* Desktop-only map - sticky sidebar on the right. */}
            <MapPanel desktopOnly />
          </div>
        </div>
      )}
    </div>
  );
}