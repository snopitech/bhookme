import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const UNREAD_REFRESH_MS = 30000; // re-check unread messages every 30 seconds

// Mobile-only bottom navigation (hidden on large screens).
// 8 buttons: Explore, Short Stay, Lease, Cars, Wishlist, Trips,
// Messages, Profile. Labels use 9px text on phones so all 8 fit.
export default function MobileBottomNav() {
  const { token, isAuthenticated } = useAuth();
  const { pathname, search } = useLocation();
  const [unread, setUnread] = useState(0);

  // Unread messages from hosts, for the badge on the Messages icon.
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setUnread(0);
      return undefined;
    }
    let cancelled = false;
    const load = () =>
      fetch(`${API_BASE_URL}/messages/threads`, { headers: { Authorization: `Bearer ${token}` } })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => {
          if (cancelled || !Array.isArray(data)) return;
          const total = data
            .filter((t) => t.iAmListingHost === false)
            .reduce((sum, t) => sum + Number(t.unreadCount || 0), 0);
          setUnread(total);
        })
        .catch(() => {});
    load();
    const timer = setInterval(load, UNREAD_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // Refresh the badge when moving between pages (e.g. after reading messages).
  }, [isAuthenticated, token, pathname]);

  const items = [
    {
      key: 'explore',
      label: 'Explore',
      icon: '🔍',
      to: '/explore',
      active: pathname === '/explore',
    },
    {
      // Nightly house listings - every home on one page.
      key: 'stays',
      label: 'shortStay',
      icon: '🏠',
      to: '/stays',
      active: pathname === '/stays' || pathname.startsWith('/property/'),
    },
    {
      // Monthly leases - every lease listing on one page.
      key: 'leases',
      label: 'Lease',
      icon: '📅',
      to: '/leases',
      active: pathname === '/leases' || pathname.startsWith('/lease/'),
    },
    {
      key: 'cars',
      label: 'Cars',
      icon: '🚗',
      // Car rentals live on the Services page; type=car-rentals scrolls to the cars row.
      to: '/category/services?type=car-rentals',
      active: pathname.startsWith('/car/') || (pathname === '/category/services' && search.includes('car')),
    },
    {
      key: 'wishlist',
      label: 'Wishlist',
      icon: '♡',
      to: '/wishlist',
      active: pathname === '/wishlist',
    },
    {
      key: 'trips',
      label: 'Trips',
      icon: '🧳',
      to: '/tenant-dashboard',
      active: pathname === '/tenant-dashboard',
    },
    {
      key: 'messages',
      label: 'Messages',
      icon: '💬',
      to: '/messages',
      active: pathname === '/messages',
      badge: unread,
    },
    {
      key: 'profile',
      label: isAuthenticated ? 'Profile' : 'Log in',
      icon: '👤',
      to: isAuthenticated ? '/profile' : '/login',
      active: pathname === '/profile',
    },
  ];

  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Main"
    >
      <ul className="grid grid-cols-8">
        {items.map((item) => (
          <li key={item.key}>
            <Link
              to={item.to}
              aria-current={item.active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-0.5 h-16 text-[9px] sm:text-[10px] tracking-tight font-medium transition ${
                item.active ? 'text-rose-500' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              <span className={`text-lg sm:text-xl leading-none ${item.active ? '' : 'opacity-80'}`} aria-hidden="true">
                {item.icon}
              </span>
              <span className="whitespace-nowrap max-w-full overflow-hidden">{item.label}</span>
              {item.badge > 0 && (
                <span className="absolute top-1.5 right-1/2 translate-x-4 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}