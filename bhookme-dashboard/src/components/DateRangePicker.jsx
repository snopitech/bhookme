import React, { useMemo, useState } from 'react';

// ============================================================
// DATE RANGE PICKER
// ------------------------------------------------------------
// Airbnb-style single-month calendar. Click once to set the start,
// click again to set the end. Blocked dates (from a paid+confirmed
// booking) render with a diagonal strike-through and are unclickable.
//
// Props:
//   checkIn / checkOut  - "YYYY-MM-DD" or "" for each
//   onChange(start, end) - called when the user finishes a selection
//   blockedRanges       - [{ start, end }, ...] each "YYYY-MM-DD".
//                         The check-in day is blocked; the check-out
//                         day is selectable (it's when the guest
//                         leaves), matching Airbnb's convention.
//   minDate             - "YYYY-MM-DD" (defaults to today) - nothing
//                         before it is clickable.
//   monthOffset         - default 0 (shows current month). Internal
//                         state ignores this and manages its own view.
// ============================================================

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---- date helpers (all operate on "YYYY-MM-DD" strings) ----------

function pad(n) {
  return String(n).padStart(2, '0');
}

function toDateString(y, m, d) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function todayString() {
  const now = new Date();
  return toDateString(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ---- main component ---------------------------------------------

export default function DateRangePicker({
  checkIn,
  checkOut,
  onChange,
  blockedRanges = [],
  minDate,
}) {
  const today = todayString();
  const min = minDate || today;

  // Which month is showing. Start on the month of the current selection,
  // or the current month if nothing is selected.
  const [viewDate, setViewDate] = useState(() => {
    const anchor = checkIn ? parseDate(checkIn) : new Date();
    return new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  });

  // If the user has clicked one date and is waiting to click the second.
  const [pendingStart, setPendingStart] = useState(null);

  // ---- build the grid for the current view month ----------------

  const grid = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday

    const cells = [];
    // leading blanks
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    // day cells
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(toDateString(year, month, d));
    }
    return cells;
  }, [viewDate]);

  // ---- blocked-date lookup --------------------------------------
  // A range ["2026-10-12", "2026-10-15"] means nights of the 12th,
  // 13th and 14th. The 15th is checkout day, still selectable.
  // So block all days >= start and < end.

  const isBlocked = (dateStr) => {
    for (const r of blockedRanges) {
      const start = r.start || r.checkIn || r.startDate;
      const end = r.end || r.checkOut || r.endDate;
      if (!start || !end) continue;
      if (dateStr >= start && dateStr < end) return true;
    }
    return false;
  };

  // ---- click handling -------------------------------------------

  const handleDayClick = (dateStr) => {
    if (dateStr < min) return;         // before today
    if (isBlocked(dateStr)) return;    // inside a blocked range

    // First click: start a new range.
    if (!pendingStart) {
      setPendingStart(dateStr);
      onChange(dateStr, '');
      return;
    }

    // Second click: decide if this is a valid end.
    if (dateStr <= pendingStart) {
      // Treat as a new start rather than an invalid end.
      setPendingStart(dateStr);
      onChange(dateStr, '');
      return;
    }

    // Reject any blocked date in the middle of the chosen range.
    let cursor = pendingStart;
    while (cursor < dateStr) {
      if (isBlocked(cursor)) {
        // Invalid range - restart from this new date instead.
        setPendingStart(dateStr);
        onChange(dateStr, '');
        return;
      }
      cursor = nextDay(cursor);
    }

    onChange(pendingStart, dateStr);
    setPendingStart(null);
  };

  function nextDay(dateStr) {
    const d = parseDate(dateStr);
    d.setDate(d.getDate() + 1);
    return toDateString(d.getFullYear(), d.getMonth(), d.getDate());
  }

  // ---- range highlighting for the current view ------------------

  const inRange = (dateStr) => {
    const start = pendingStart || checkIn;
    const end = pendingStart ? pendingStart : checkOut;
    if (!start || !end) return false;
    return dateStr >= start && dateStr <= end;
  };

  const isStart = (dateStr) => dateStr === (pendingStart || checkIn);
  const isEnd = (dateStr) => !pendingStart && dateStr === checkOut;

  // ---- month navigation -----------------------------------------

  const canGoPrev = useMemo(() => {
    const currentMonth = new Date();
    const earliest = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    return viewDate > earliest;
  }, [viewDate]);

  const goPrev = () => {
    if (!canGoPrev) return;
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  };

  const goNext = () => {
    setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  };

  return (
    <div className="border border-gray-300 rounded-lg overflow-hidden">
      {/* Month header + nav */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <button
          type="button"
          onClick={goPrev}
          disabled={!canGoPrev}
          className="w-8 h-8 rounded-full hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent flex items-center justify-center"
          aria-label="Previous month"
        >
          ‹
        </button>
        <p className="text-sm font-semibold">
          {MONTH_NAMES[viewDate.getMonth()]} {viewDate.getFullYear()}
        </p>
        <button
          type="button"
          onClick={goNext}
          className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 text-xs text-gray-500 bg-gray-50">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2 text-center font-medium">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 text-sm">
        {grid.map((dateStr, idx) => {
          if (!dateStr) return <div key={`blank-${idx}`} />;

          const dayNum = Number(dateStr.split('-')[2]);
          const disabled = dateStr < min;
          const blocked = isBlocked(dateStr);
          const range = inRange(dateStr);
          const start = isStart(dateStr);
          const end = isEnd(dateStr);

          const baseClass =
            'relative aspect-square flex items-center justify-center transition';
          const rangeClass = range && !start && !end ? 'bg-rose-50' : '';
          const endpointClass =
            start || end ? 'bg-rose-500 text-white font-semibold rounded-full' : '';
          const disabledClass = disabled || blocked ? 'text-gray-300' : '';
          const clickableClass =
            !disabled && !blocked ? 'cursor-pointer hover:bg-rose-100 rounded-full' : 'cursor-not-allowed';

          return (
            <button
              key={dateStr}
              type="button"
              disabled={disabled || blocked}
              onClick={() => handleDayClick(dateStr)}
              className={`${baseClass} ${rangeClass} ${endpointClass} ${disabledClass} ${clickableClass}`}
              aria-label={`${dateStr}${blocked ? ' (unavailable)' : ''}`}
            >
              <span className="relative">
                {dayNum}
                {blocked && (
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-1/2 w-[130%] h-[1px] bg-gray-400"
                    style={{ transform: 'translate(-50%, -50%) rotate(-45deg)' }}
                  />
                )}
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-3 text-xs text-gray-500 border-t border-gray-200">
        <span className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-full bg-rose-500" /> Selected
        </span>
        <span className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-[1px] bg-gray-400"
            style={{ transform: 'rotate(-45deg)' }}
          />{' '}
          Booked
        </span>
      </div>
    </div>
  );
}