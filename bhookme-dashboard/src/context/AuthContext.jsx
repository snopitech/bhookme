import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

// How long host access lasts after verifying (password + code).
const HOST_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const HOST_SESSION_KEY = 'hostSession';

// Clear any MSAL-managed sessionStorage/localStorage keys. MSAL uses
// keys prefixed with "msal." (e.g. msal.<clientId>.account, msal.token.keys...).
// Without clearing these on logout, MSAL still thinks the user is
// signed in, and the next "Sign in with Microsoft" click silently
// reuses the cached account - skipping the account picker entirely.
function clearMsalCache() {
  try {
    const prefixes = ['msal.'];
    for (const storage of [sessionStorage, localStorage]) {
      const keysToRemove = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && prefixes.some((p) => key.startsWith(p))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    }
  } catch (e) {
    console.error('clearMsalCache failed:', e);
  }
}

function readHostSession() {
  try {
    const stored = localStorage.getItem(HOST_SESSION_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (e) {
    return null;
  }
}

export function AuthProvider({ children }) {
  // Initialize user AND token synchronously from localStorage so the
  // first render already has the logged-in state.
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('user');
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      return null;
    }
  });
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  // { email, expiresAt } - set only after host verification succeeds.
  const [hostSession, setHostSession] = useState(readHostSession);
  const [now, setNow] = useState(Date.now());

  // Re-check expiry once a minute so host access ends on time.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const endHostSession = () => {
    setHostSession(null);
    localStorage.removeItem(HOST_SESSION_KEY);
  };

  const startHostSession = (email) => {
    const session = { email, expiresAt: Date.now() + HOST_SESSION_MS };
    setHostSession(session);
    localStorage.setItem(HOST_SESSION_KEY, JSON.stringify(session));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    endHostSession();
    // Also clear MSAL's cached account/session. Without this, Microsoft
    // sign-in silently reuses the previous account on the next click.
    clearMsalCache();
  };

  const applyProfile = (profile) => {
    const userInfo = {
      id: profile.id,
      email: profile.email,
      firstName: profile.firstName,
      lastName: profile.lastName,
      phone: profile.phone,
      dateOfBirth: profile.dateOfBirth,
      isHost: profile.isHost,
      isAdmin: profile.isAdmin,
      totpEnabled: profile.totpEnabled,
      profileComplete: profile.profileComplete
    };
    setUser(userInfo);
    localStorage.setItem('user', JSON.stringify(userInfo));
  };

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse stored user:', e);
      }
    }
    setLoading(false);
  }, []);

  const fetchProfile = () => {
    const currentToken = localStorage.getItem('token');
    if (!currentToken) return Promise.resolve(null);

    return fetch(`${API_BASE_URL}/profile`, {
      headers: { Authorization: `Bearer ${currentToken}` }
    })
      .then((res) => {
        if (res.status === 401 || res.status === 403) {
          logout();
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .catch(() => null);
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetchProfile().then((profile) => {
      if (profile && !cancelled) applyProfile(profile);
    });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const refreshProfile = async () => {
    const profile = await fetchProfile();
    if (profile) applyProfile(profile);
  };

  const saveSession = (data) => {
    const userInfo = {
      id: data.userId,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
      isHost: data.isHost
    };
    // A different account logging in must never inherit host access.
    if (hostSession && hostSession.email !== data.email) {
      endHostSession();
    }
    setToken(data.token);
    setUser(userInfo);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(userInfo));
  };

  // Exposed publicly so the host TOTP-verify step can start a real
  // session from its own response shape (token, userId, email, ...),
  // the same way login() and googleLogin() do internally.
  const setSessionFromResponse = (data) => saveSession(data);

  const register = async (registerData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerData)
      });
      const data = await response.json();

      if (response.ok && data.token) {
        saveSession(data);
        return { success: true };
      }
      return { success: false, error: data.message || 'Registration failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await response.json();

      if (response.ok && data.token) {
        saveSession(data);
        return { success: true };
      }
      return { success: false, error: data.message || 'Invalid credentials' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const googleLogin = async (idToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });
      const data = await response.json();

      if (response.ok && data.token) {
        saveSession(data);
        return { success: true };
      }
      return { success: false, error: data.message || 'Google sign-in failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Microsoft sign-in: MSAL.js obtains an ID token client-side; we
  // send it to the backend as { token: "..." } (matches the backend's
  // /api/auth/microsoft endpoint), and the backend returns our JWT.
  const microsoftLogin = async (idToken) => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/microsoft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: idToken })
      });
      const data = await response.json();

      if (response.ok && data.token) {
        saveSession(data);
        return { success: true };
      }
      return { success: false, error: data.message || 'Microsoft sign-in failed' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  const updateProfile = async (profileData) => {
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });
      const data = await response.json();

      if (response.ok) {
        applyProfile(data);
        return { success: true };
      }
      return { success: false, error: data.message || 'Could not save your profile' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  };

  // Host access = approved host + verified this session + not expired.
  const hostVerified =
    !!user?.isHost &&
    !!hostSession &&
    hostSession.email === user?.email &&
    hostSession.expiresAt > now;

  const value = {
    user,
    token,
    login,
    register,
    googleLogin,
    microsoftLogin,
    updateProfile,
    refreshProfile,
    setSessionFromResponse,
    startHostSession,
    endHostSession,
    hostVerified,
    logout,
    loading,
    isAuthenticated: !!user
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