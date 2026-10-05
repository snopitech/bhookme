import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import InlineLoginPopup from './InlineLoginPopup';
import PostLoginPrompt from './PostLoginPrompt';
import DateRangePicker from './DateRangePicker';
import { getPendingAction, clearPendingAction } from '../utils/pendingAction';

const API_BASE_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL}/api`
  : 'http://localhost:8080/api';

const money = (value) => `$${Number(value).toFixed(2)}`;

export default function CarReserveCard({ car }) {
  const { token, user, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [quote, setQuote] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState('');
  const [reserving, setReserving] = useState(false);

  // Blocked date ranges for this car. Shape:
  //   [{ startDate: "2026-10-12", endDate: "2026-10-15" }, ...]
  // DateRangePicker accepts these key names too, no reshaping needed.
  const [blockedRanges, setBlockedRanges] = useState([]);

  const [showLoginPopup, setShowLoginPopup] = useState(false);
  const [pendingReserve, setPendingReserve] = useState(false);
  const [showPostLoginPrompt, setShowPostLoginPrompt] = useState(false);

  const isOwnListing = isAuthenticated && user && user.id === car.hostId;

  // Fetch blocked dates once on mount / when car changes.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE_URL}/cars/${car.id}/blocked-dates`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setBlockedRanges(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setBlockedRanges([]);
      });
    return () => {
      cancelled = true;
    };
  }, [car.id]);

  useEffect(() => {
    setQuote(null);
    setError('');
    if (!startDate || !endDate) return;

    let cancelled = false;
    setQuoting(true);

    const params = new URLSearchParams({ carId: car.id, startDate, endDate });

    fetch(`${API_BASE_URL}/car-bookings/quote?${params}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) {
          setQuote(data);
          setQuoting(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not get a price right now.');
          setQuoting(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, car.id]);

  // Picker hands us (start, end); may be called with empty end mid-selection.
  const handleRangeChange = (start, end) => {
    setStartDate(start);
    setEndDate(end);
  };

  const performReserve = async () => {
    setError('');
    setReserving(true);

    try {
      const res = await fetch(`${API_BASE_URL}/car-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          carId: car.id,
          startDate,
          endDate,
        }),
      });

      if (res.status === 401 || res.status === 403) {
        setError('Your session expired. Please log in again.');
        return;
      }

      const data = await res.json();
      if (res.ok) {
        navigate('/tenant-dashboard');
      } else {
        setError(data.message || 'Could not complete your reservation.');
      }
    } catch (err) {
      setError('Could not reach the server. Is the backend running?');
    } finally {
      setReserving(false);
    }
  };

  const handleReserve = () => {
    if (!isAuthenticated) {
      setPendingReserve(true);
      setShowLoginPopup(true);
      return;
    }
    performReserve();
  };

  useEffect(() => {
    if (user && pendingReserve) {
      setPendingReserve(false);
      setShowLoginPopup(false);
      performReserve();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    console.log('[CarReserve] user email:', user?.email || '(none)', '| pendingAction:', getPendingAction());
    if (user && getPendingAction() === 'car-reserve') {
      setShowPostLoginPrompt(true);
    }
  }, [user]);

  const canReserve = quote && quote.available && !reserving && !isOwnListing;

  return (
    <div className="sticky top-24 border border-gray-300 rounded-xl shadow-md p-6">
      <p className="text-xl font-semibold mb-4">
        ${Number(car.dailyRate).toFixed(0)}{' '}
        <span className="text-base font-normal text-gray-500">day</span>
      </p>

      <div className="mb-3">
        <DateRangePicker
          checkIn={startDate}
          checkOut={endDate}
          onChange={handleRangeChange}
          blockedRanges={blockedRanges}
        />
      </div>

      {isOwnListing && (
        <p className="text-sm text-gray-500 mb-3">This is your car listing, so it can't be rented from your own account.</p>
      )}

      {quoting && <p className="text-sm text-gray-500 mb-3">Checking price...</p>}

      {quote && !quote.available && (
        <p className="text-sm text-red-600 mb-3">{quote.message}</p>
      )}

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <button
        onClick={handleReserve}
        disabled={!canReserve && isAuthenticated}
        className="w-full bg-rose-500 hover:bg-rose-600 text-white font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {reserving ? 'Reserving...' : 'Reserve'}
      </button>
      <p className="text-center text-sm text-gray-500 mt-3">You won't be charged yet</p>

      {showLoginPopup && (
        <div className="mt-3">
          <InlineLoginPopup
            open={showLoginPopup}
            onOpenChange={setShowLoginPopup}
            onLoginSuccess={() => setShowLoginPopup(false)}
            pendingAction="car-reserve"
          />
        </div>
      )}

      {showPostLoginPrompt && (
        <PostLoginPrompt
          actionLabel="Reserve"
          onConfirm={() => {
            setShowPostLoginPrompt(false);
            clearPendingAction();
            performReserve();
          }}
          onDismiss={() => {
            setShowPostLoginPrompt(false);
            clearPendingAction();
          }}
        />
      )}

      {quote && quote.available && (
        <div className="mt-4 pt-4 border-t border-gray-200 text-sm space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">
              {money(quote.dailyRate)} x {quote.totalDays} day{quote.totalDays !== 1 ? 's' : ''}
            </span>
            <span>{money(quote.totalPrice)}</span>
          </div>
          <div className="flex justify-between font-semibold pt-2 border-t border-gray-200">
            <span>Total</span>
            <span>{money(quote.totalPrice)}</span>
          </div>
        </div>
      )}
    </div>
  );
}