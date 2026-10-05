import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';

const WishlistContext = createContext();

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

export function WishlistProvider({ children }) {
  const { token, isAuthenticated } = useAuth();
  const [savedIds, setSavedIds] = useState(new Set());
  const [savedCarIds, setSavedCarIds] = useState(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setSavedIds(new Set());
      setSavedCarIds(new Set());
      setLoaded(false);
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_BASE_URL}/wishlist/ids`, { headers }).then((res) => (res.ok ? res.json() : [])).catch(() => []),
      fetch(`${API_BASE_URL}/wishlist/cars/ids`, { headers }).then((res) => (res.ok ? res.json() : [])).catch(() => []),
    ]).then(([homeIds, carIds]) => {
      setSavedIds(new Set(Array.isArray(homeIds) ? homeIds : []));
      setSavedCarIds(new Set(Array.isArray(carIds) ? carIds : []));
      setLoaded(true);
    });
  }, [isAuthenticated, token]);

  // ---------- Homes ----------
  const isSaved = useCallback((propertyId) => savedIds.has(propertyId), [savedIds]);

  const toggle = async (propertyId) => {
    const currentlySaved = savedIds.has(propertyId);

    const applyChange = (shouldBeSaved) => {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (shouldBeSaved) next.add(propertyId);
        else next.delete(propertyId);
        return next;
      });
    };

    // Update the heart instantly, then undo it if the server says no.
    applyChange(!currentlySaved);

    try {
      const res = await fetch(`${API_BASE_URL}/wishlist/${propertyId}`, {
        method: currentlySaved ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Request failed');
    } catch (err) {
      applyChange(currentlySaved);
    }
  };

  // ---------- Cars ----------
  const isCarSaved = useCallback((carId) => savedCarIds.has(carId), [savedCarIds]);

  const toggleCar = async (carId) => {
    const currentlySaved = savedCarIds.has(carId);

    const applyChange = (shouldBeSaved) => {
      setSavedCarIds((prev) => {
        const next = new Set(prev);
        if (shouldBeSaved) next.add(carId);
        else next.delete(carId);
        return next;
      });
    };

    applyChange(!currentlySaved);

    try {
      const res = await fetch(`${API_BASE_URL}/wishlist/cars/${carId}`, {
        method: currentlySaved ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Request failed');
    } catch (err) {
      applyChange(currentlySaved);
    }
  };

  return (
    <WishlistContext.Provider value={{ isSaved, toggle, isCarSaved, toggleCar, loaded }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}