import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value: string;                     // "YYYY-MM-DD"
  onChange: (date: string) => void;
  minDate?: string;                  // "YYYY-MM-DD"; defaults to today (past disabled)
  required?: boolean;
  placeholder?: string;
  className?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Parse "YYYY-MM-DD" as a LOCAL date (avoids UTC off-by-one from new Date(str)). */
function parseYMD(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Format a local Date back to "YYYY-MM-DD". */
function formatYMD(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${da}`;
}

/** Strip time for day-level comparisons. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a: Date | null, b: Date | null): boolean {
  return !!a && !!b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  minDate,
  required,
  placeholder = 'Select a date',
  className = '',
}) => {
  const selected = parseYMD(value);
  const today = startOfDay(new Date());
  const min = minDate !== undefined ? parseYMD(minDate) : today;

  const [open, setOpen] = useState(false);
  // Month currently shown in the grid (first of month).
  const [viewMonth, setViewMonth] = useState<Date>(() => {
    const base = selected ?? today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  const containerRef = useRef<HTMLDivElement>(null);

  // Keep the visible month in sync with the selected value when it changes externally.
  useEffect(() => {
    if (selected) setViewMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Build the 6-row day grid for the visible month (including spill days).
  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
    const gridStart = new Date(firstOfMonth);
    gridStart.setDate(firstOfMonth.getDate() - startWeekday);

    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      return d;
    });
  }, [viewMonth]);

  const displayText = selected
    ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const goMonth = (delta: number) =>
    setViewMonth(v => new Date(v.getFullYear(), v.getMonth() + delta, 1));

  const isDisabled = (d: Date) => (min ? startOfDay(d) < startOfDay(min) : false);

  const pick = (d: Date) => {
    if (isDisabled(d)) return;
    onChange(formatYMD(d));
    setOpen(false);
  };

  const jumpToday = () => {
    setViewMonth(new Date(today.getFullYear(), today.getMonth(), 1));
    if (!isDisabled(today)) {
      onChange(formatYMD(today));
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger — styled to match sibling inputs in the modal */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full mt-1 flex items-center justify-between gap-2 bg-white text-left border border-slate-300 rounded-xl px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none hover:border-slate-400 transition-colors"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className={displayText ? 'text-slate-900' : 'text-slate-400'}>
          {displayText || placeholder}
        </span>
        <CalendarIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      </button>

      {/* Hidden input keeps native "required" validation working inside the form */}
      {required && (
        <input
          tabIndex={-1}
          aria-hidden="true"
          required
          value={value}
          onChange={() => {}}
          className="sr-only absolute h-0 w-0 opacity-0 pointer-events-none"
        />
      )}

      {open && (
        <div
          role="dialog"
          className="absolute z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          {/* Header: month nav */}
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => goMonth(-1)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-semibold text-slate-800">
              {MONTHS[viewMonth.getMonth()]} {viewMonth.getFullYear()}
            </div>
            <button
              type="button"
              onClick={() => goMonth(1)}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Weekday header */}
          <div className="grid grid-cols-7 mb-1">
            {WEEKDAYS.map(w => (
              <div key={w} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400 py-1">
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((d, i) => {
              const inMonth = d.getMonth() === viewMonth.getMonth();
              const disabled = isDisabled(d);
              const isSelected = sameDay(d, selected);
              const isToday = sameDay(d, today);

              let cls = 'h-8 w-full flex items-center justify-center rounded-lg text-xs transition-colors ';
              if (disabled) {
                cls += 'text-slate-300 cursor-not-allowed';
              } else if (isSelected) {
                cls += 'bg-brand-500 text-white font-semibold shadow-sm';
              } else if (isToday) {
                cls += 'ring-1 ring-brand-500 text-brand-700 font-semibold hover:bg-emerald-50';
              } else if (inMonth) {
                cls += 'text-slate-700 hover:bg-emerald-50 hover:text-emerald-700';
              } else {
                cls += 'text-slate-400 hover:bg-emerald-50';
              }

              return (
                <button
                  key={i}
                  type="button"
                  disabled={disabled}
                  onClick={() => pick(d)}
                  className={cls}
                  aria-label={d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                  aria-current={isToday ? 'date' : undefined}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {/* Footer: quick actions */}
          <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={jumpToday}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
