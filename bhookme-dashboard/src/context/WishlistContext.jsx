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
  const [savedLeaseIds, setSavedLeaseIds] = useState(new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthenticated || !token) {
      setSavedIds(new Set());
      setSavedCarIds(new Set());
      setSavedLeaseIds(new Set());
      setLoaded(false);
      return;
    }

    const headers = { Authorization: `Bearer ${token}` };
    const getIds = (url) =>
      fetch(url, { headers })
        .then((res) => (res.ok ? res.json() : []))
        .catch(() => []);

    Promise.all([
      getIds(`${API_BASE_URL}/wishlist/ids`),
      getIds(`${API_BASE_URL}/wishlist/cars/ids`),
      getIds(`${API_BASE_URL}/wishlist/leases/ids`),
    ]).then(([homeIds, carIds, leaseIds]) => {
      setSavedIds(new Set(Array.isArray(homeIds) ? homeIds : []));
      setSavedCarIds(new Set(Array.isArray(carIds) ? carIds : []));
      setSavedLeaseIds(new Set(Array.isArray(leaseIds) ? leaseIds : []));
      setLoaded(true);
    });
  }, [isAuthenticated, token]);

  // Shared save/unsave: update the heart instantly, then undo it if
  // the server says no.
  const toggleIn = async (ids, setIds, itemId, url) => {
    const currentlySaved = ids.has(itemId);

    const applyChange = (shouldBeSaved) => {
      setIds((prev) => {
        const next = new Set(prev);
        if (shouldBeSaved) next.add(itemId);
        else next.delete(itemId);
        return next;
      });
    };

    applyChange(!currentlySaved);

    try {
      const res = await fetch(url, {
        method: currentlySaved ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Request failed');
    } catch (err) {
      applyChange(currentlySaved);
    }
  };

  // ---------- Homes ----------
  const isSaved = useCallback((propertyId) => savedIds.has(propertyId), [savedIds]);
  const toggle = (propertyId) => toggleIn(savedIds, setSavedIds, propertyId, `${API_BASE_URL}/wishlist/${propertyId}`);

  // ---------- Cars ----------
  const isCarSaved = useCallback((carId) => savedCarIds.has(carId), [savedCarIds]);
  const toggleCar = (carId) => toggleIn(savedCarIds, setSavedCarIds, carId, `${API_BASE_URL}/wishlist/cars/${carId}`);

  // ---------- Monthly stays & leases ----------
  const isLeaseSaved = useCallback((leaseId) => savedLeaseIds.has(leaseId), [savedLeaseIds]);
  const toggleLease = (leaseId) =>
    toggleIn(savedLeaseIds, setSavedLeaseIds, leaseId, `${API_BASE_URL}/wishlist/leases/${leaseId}`);

  return (
    <WishlistContext.Provider value={{ isSaved, toggle, isCarSaved, toggleCar, isLeaseSaved, toggleLease, loaded }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}