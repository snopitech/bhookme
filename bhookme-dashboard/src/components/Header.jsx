import React, { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MapButton } from './MapPanel';
import SearchBar from './SearchBar';

// bhookme roof "b" icon, stored in the bhookme-images R2 bucket.
const LOGO_ICON_URL = 'https://pub-5a9bbe3019424f9fa1ac570f455abcd1.r2.dev/apple-touch-icon.png?v=2';

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

  // Close the menu whenever we navigate to a new route.
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  const handleLogout = () => {
    logout();
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-wrap md:flex-nowrap items-center justify-between gap-x-4 gap-y-3 min-w-0">
        <div className="flex items-center gap-3 shrink-0">
          {/* Logo: pink roof "b" icon + "bhookme" wordmark. Clicking it goes home. */}
          <Link to="/" aria-label="bhookme home" className="flex items-center gap-2">
            <img
              src={LOGO_ICON_URL}
              alt=""
              aria-hidden="true"
              className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg"
              width="36"
              height="36"
            />
            <span className="text-2xl font-extrabold tracking-tight text-gray-900">
              bhookme
            </span>
          </Link>
          {/* Mobile only, and only on pages that have the map */}
          <MapButton />
        </div>

        {/* Live search: full-width second row on phones, centered pill on larger screens */}
        <div className="order-last w-full min-w-0 md:order-none md:w-auto md:flex-1 md:max-w-xl">
          <SearchBar />
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {/* Host access needs a separate verification (password + code), so
              this goes to the verify flow until the host session is active.
              Desktop only - mobile users get the same link in the category
              row below instead. */}
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

      {/* Category tabs: ONE row that swipes left/right on small screens,
          so more tabs can be added later without wrapping or pushing
          the page wider. The scrollbar is hidden; the row just swipes. */}
      <nav
        aria-label="Categories"
        className="max-w-7xl mx-auto px-4 sm:px-6 pb-2 sm:pb-3 flex items-center gap-6 sm:gap-8 overflow-x-auto overscroll-x-contain snap-x [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        {CATEGORIES.map((cat) => {
          const active = location.pathname === cat.path;
          return (
            <Link
              key={cat.label}
              to={cat.path}
              className={`snap-start shrink-0 text-sm font-bold whitespace-nowrap py-1.5 border-b-2 transition ${
                active
                  ? 'border-rose-500 text-rose-500'
                  : 'border-transparent text-gray-500 hover:text-gray-900'
              }`}
            >
              {cat.label}
            </Link>
          );
        })}

        {/* Mobile-only Host link, sits right after Services. Uses the
            same 🏠 icon and dynamic label ("Host" / "Hosting") as the
            bottom-nav host item, and the same destination logic:
            verified hosts go straight to the dashboard, everyone else
            goes through /become-host. The bottom-nav item is being
            removed in a separate edit so this is the single mobile
            entry point. */}
        <Link
          to={hostVerified ? '/host/dashboard' : '/become-host'}
          className={`sm:hidden snap-start shrink-0 inline-flex items-center gap-1.5 text-sm font-bold whitespace-nowrap py-1.5 border-b-2 transition ${
            location.pathname.startsWith('/host/') || location.pathname === '/become-host'
              ? 'border-rose-500 text-rose-500'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
        >
          <span aria-hidden="true">🏠</span>
          {hostVerified ? 'Hosting' : 'Host'}
        </Link>
      </nav>
    </header>
  );
}