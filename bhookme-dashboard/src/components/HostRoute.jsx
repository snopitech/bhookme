import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Guards host-only pages. Being logged in isn't enough: the user must
// be an approved host AND have completed host verification (password +
// code) in this session. Otherwise they're sent to the verify flow.
export default function HostRoute({ children }) {
  const { isAuthenticated, loading, hostVerified } = useAuth();
  const location = useLocation();

  if (loading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!hostVerified) {
    return <Navigate to="/become-host" state={{ from: location }} replace />;
  }

  return children;
}