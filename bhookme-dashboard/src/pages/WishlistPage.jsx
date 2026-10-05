import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../context/WishlistContext';
import PropertyCard from '../components/PropertyCard';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

export default function WishlistPage() {
  const { token } = useAuth();
  const { isSaved, loaded } = useWishlist();
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`${API_BASE_URL}/wishlist`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load wishlist');
        return res.json();
      })
      .then((data) => {
        setProperties(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load your wishlist.');
        setLoading(false);
      });
  }, [token]);

  // Once the saved-ids list has loaded, un-hearting a card removes it right away.
  const visible = loaded ? properties.filter((p) => isSaved(p.id)) : properties;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold mb-6">Wishlist</h1>

      {loading && <p className="text-gray-500">Loading your wishlist...</p>}
      {error && <p className="text-red-500">{error}</p>}

      {!loading && !error && visible.length === 0 && (
        <div className="text-center py-16 border border-dashed border-gray-300 rounded-xl">
          <p className="text-gray-500 mb-4">Nothing saved yet. Tap the heart on any listing to save it here.</p>
          <Link to="/" className="text-rose-500 font-medium hover:underline">
            Browse homes
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {visible.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </div>
  );
}