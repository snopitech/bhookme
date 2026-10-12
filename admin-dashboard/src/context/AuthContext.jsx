import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

export function AuthProvider({ children }) {
  const [admin, setAdmin] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('adminToken'));
  const [loading, setLoading] = useState(true);

  const logout = () => {
    setToken(null);
    setAdmin(null);
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('adminToken');
    const storedAdmin = localStorage.getItem('adminUser');
    if (storedToken && storedAdmin) {
      try {
        setAdmin(JSON.parse(storedAdmin));
      } catch (e) {
        console.error('Failed to parse stored admin:', e);
      }
    }
    setLoading(false);
  }, []);

  // Confirms the token is still valid against the dedicated admin-auth
  // endpoint (not the tenant /api/profile), since admins now live in
  // their own table entirely separate from users.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetch(`${API_BASE_URL}/admin-auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403 || res.status === 400) {
          logout();
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((profile) => {
        if (cancelled || !profile) return;
        const adminInfo = {
          id: profile.id,
          email: profile.email,
          firstName: profile.firstName,
          lastName: profile.lastName,
          role: profile.role,
        };
        setAdmin(adminInfo);
        localStorage.setItem('adminUser', JSON.stringify(adminInfo));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [token]);

  // Step 1: email + password. Never signs in by itself - returns what the
  // next step is: 'code' (enter app code) or 'setup' (scan QR, then code).
  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        return { success: false, error: data.message || 'Invalid credentials' };
      }
      if (data.setupRequired) {
        return {
          success: true,
          stage: 'setup',
          challengeId: data.challengeId,
          secret: data.secret,
          otpauthUrl: data.otpauthUrl,
          email: data.email,
        };
      }
      if (data.totpRequired) {
        return { success: true, stage: 'code', challengeId: data.challengeId, email: data.email };
      }
      return { success: false, error: 'Unexpected response from the server.' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Step 2: the 6-digit code. On success the admin is signed in.
  const verifyCode = async (challengeId, code) => {
    try {
      const response = await fetch(`${API_BASE_URL}/admin-auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.token) {
        return { success: false, error: data.message || 'That code did not work.' };
      }

      const adminInfo = {
        id: data.id,
        email: data.email,
        firstName: data.firstName,
        lastName: data.lastName,
        role: data.role,
      };
      setToken(data.token);
      setAdmin(adminInfo);
      localStorage.setItem('adminToken', data.token);
      localStorage.setItem('adminUser', JSON.stringify(adminInfo));
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const value = {
    admin,
    token,
    login,
    verifyCode,
    logout,
    loading,
    isHR: admin?.role === 'HR',
    isAuthenticated: !!admin
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}