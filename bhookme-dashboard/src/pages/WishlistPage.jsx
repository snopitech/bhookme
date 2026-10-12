import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import PropertyCard from '../components/PropertyCard';
import CarCard from '../components/CarCard';
import { LeaseCard } from '../components/LeaseRow';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

export default function WishlistPage() {
  const { token } = useAuth();
  const { isSaved, isCarSaved, isLeaseSaved, loaded } = useWishlist();
  const [properties, setProperties] = useState([]);
  const [cars, setCars] = useState([]);
  const [leases, setLeases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const headers = { Authorization: `Bearer ${token}` };
    const getList = (url) =>
      fetch(url, { headers })
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []);

    Promise.all([
      getList(`${API_BASE_URL}/wishlist`),
      getList(`${API_BASE_URL}/wishlist/cars`),
      getList(`${API_BASE_URL}/wishlist/leases`),
    ])
      .then(([props, carList, leaseList]) => {
        setProperties(Array.isArray(props) ? props : []);
        setCars(Array.isArray(carList) ? carList : []);
        setLeases(Array.isArray(leaseList) ? leaseList : []);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load your wishlist.');
        setLoading(false);
      });
  }, [token]);

  // Filter out un-heart items the moment the user un-saves.
  const visibleProperties = loaded ? properties.filter((p) => isSaved(p.id)) : properties;
  const visibleCars = loaded ? cars.filter((c) => isCarSaved(c.id)) : cars;
  const visibleLeases = loaded ? leases.filter((l) => isLeaseSaved(l.id)) : leases;
  const isEmpty =
    !loading && !error && visibleProperties.length === 0 && visibleCars.length === 0 && visibleLeases.length === 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Wishlist</h1>

      {loading && <p className="text-gray-500">Loading your wishlist...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {isEmpty && (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-gray-500 mb-4">Nothing saved yet. Tap the heart on any listing, car or monthly stay to save it here.</p>
          <Link to="/" className="text-rose-500 font-medium hover:underline">
            Browse homes
          </Link>
        </div>
      )}

      {visibleProperties.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Homes</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {visibleProperties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        </section>
      )}

      {visibleLeases.length > 0 && (
        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-4">Monthly stays &amp; leases</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {visibleLeases.map((lease) => (
              <LeaseCard key={lease.id} lease={lease} />
            ))}
          </div>
        </section>
      )}

      {visibleCars.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold mb-4">Cars</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
            {visibleCars.map((car) => (
              <CarCard key={car.id} car={car} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}