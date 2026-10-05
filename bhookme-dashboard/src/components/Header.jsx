import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapButton } from './MockMap';
import SearchBar from './SearchBar';

const CATEGORIES = [
  { label: 'Homes', path: '/' },
  { label: 'Experiences', path: '/category/experiences' },
  { label: 'Services', path: '/category/services' },
];

export default function Header() {
  const { user, logout, isAuthenticated, hostVerified } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const menuRef = useRef(null);

  // Close the avatar menu on any click that lands outside it, and on
  // Escape. The ref wraps BOTH the trigger button and the dropdown, so
  // clicks on the trigger still toggle normally instead of being caught
  // as "outside" and closed before the toggle runs.
  useEffect(() => {
    if (!menuOpen) return;

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const handleEscape = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [menuOpen]);

  // Close the menu whenever we navigate to a new route. React Router
  // doesn't give us a per-Link close, so catching the pathname change
  // here means every menu item click (and browser back/forward) closes it.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    // No redirect - stay on whatever page the user was viewing when
    // they logged out. If that page happens to be a protected one
    // (Tenant/Host dashboard), ProtectedRoute will redirect to /login
    // on its own once `isAuthenticated` flips to false.
    logout();
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 py-4 flex flex-wrap md:flex-nowrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-3 shrink-0">
          <Link to="/" className="text-2xl font-bold text-rose-500">
            bhookme
          </Link>
          {/* Mobile only, and only on pages that have the map */}
          <MapButton />
        </div>

        {/* Live search: full-width second row on phones, centered pill on larger screens */}
        <div className="order-last w-full md:order-none md:w-auto md:flex-1 md:max-w-xl">
          <SearchBar />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Host access needs a separate verification (password + code), so
              this goes to the verify flow until the host session is active. */}
          <Link
            to={hostVerified ? '/host/dashboard' : '/become-host'}
            className="hidden sm:block text-sm font-medium px-3 py-2 rounded-full hover:bg-gray-100"
          >
            Host
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center border border-gray-300 rounded-full p-1 hover:shadow-md transition"
            >
              <span className="w-8 h-8 bg-gray-500 text-white rounded-full flex items-center justify-center text-sm">
                {isAuthenticated ? user.firstName?.[0]?.toUpperCase() : '👤'}
              </span>
            </button>

            {menuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-gray-200 py-2">
                {isAuthenticated ? (
                  <>
                    <div className="px-4 py-2 text-sm text-gray-500 border-b border-gray-100">
                      {user.firstName} {user.lastName}
                    </div>
                    <Link
                      to="/tenant-dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      My dashboard
                    </Link>
                    <Link
                      to="/messages"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      Messages
                    </Link>
                    <Link
                      to="/profile"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      Profile
                    </Link>
                    {hostVerified && (
                      <Link
                        to="/host/dashboard"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2 text-sm hover:bg-gray-50"
                      >
                        Host dashboard
                      </Link>
                    )}
                    <Link
                      to="/wishlist"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm hover:bg-gray-50"
                    >
                      Wishlist
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-50 border-t border-gray-100 mt-1"
                    >
                      Log out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/login"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      Log in
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      Sign up
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pb-3 flex items-center gap-8 overflow-x-auto">
        {CATEGORIES.map((cat) => {
          const active = location.pathname === cat.path;
          return (
            <Link
              key={cat.label}
              to={cat.path}
              className={`text-sm font-medium whitespace-nowrap pb-1 border-b-2 transition ${
                active ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {cat.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}