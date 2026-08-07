import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ChevronUp, ChevronDown } from 'lucide-react';

interface TimePickerProps {
  value: string;                     // "HH:mm" (24-hour)
  onChange: (time: string) => void;
  minTime?: string;                  // "HH:mm"; times <= this are disabled
  required?: boolean;
  placeholder?: string;
  className?: string;
  align?: 'left' | 'right';          // which edge the popover anchors to (default 'left')
}

const MINUTE_STEP = 5;

interface TimeParts {
  hour12: number;   // 1..12
  minute: number;   // 0..59
  period: 'AM' | 'PM';
}

/** Parse "HH:mm" (24-hour) into 12-hour display parts. */
function parse24(s: string | undefined | null): TimeParts | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  const period: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return { hour12, minute: min, period };
}

/** Convert 12-hour display parts back to "HH:mm" (24-hour). */
function to24(p: TimeParts): string {
  let h = p.hour12 % 12;            // 12 -> 0
  if (p.period === 'PM') h += 12;   // 0..11 -> 12..23
  return `${String(h).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

/** Round a minute value down to the nearest step. */
function roundMinuteToStep(min: number): number {
  return Math.round(min / MINUTE_STEP) * MINUTE_STEP % 60;
}

/** Format "HH:mm" for the trigger display, e.g. "9:00 AM". */
function formatDisplay(s: string): string {
  const p = parse24(s);
  if (!p) return '';
  return `${p.hour12}:${String(p.minute).padStart(2, '0')} ${p.period}`;
}

/** Minutes since midnight for comparisons. */
function toMinutes(s: string | undefined | null): number | null {
  const p = parse24(s ?? '');
  if (!p) return null;
  let h = p.hour12 % 12;
  if (p.period === 'PM') h += 12;
  return h * 60 + p.minute;
}

export const TimePicker: React.FC<TimePickerProps> = ({
  value,
  onChange,
  minTime,
  required,
  placeholder = 'Select a time',
  className = '',
  align = 'left',
}) => {
  const [open, setOpen] = useState(false);

  // Working draft while the popover is open; committed on "Done" / value click.
  const parsed = parse24(value);
  const [draft, setDraft] = useState<TimeParts>(
    parsed ?? { hour12: 9, minute: 0, period: 'AM' }
  );

  const containerRef = useRef<HTMLDivElement>(null);

  // Sync draft with external value whenever the popover (re)opens or value changes.
  useEffect(() => {
    const p = parse24(value);
    if (p) setDraft(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open]);

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

  const minMinutes = useMemo(() => toMinutes(minTime), [minTime]);

  /** Is a candidate draft disabled by minTime? */
  const isDraftDisabled = (p: TimeParts): boolean => {
    if (minMinutes === null) return false;
    return (toMinutes(to24(p)) ?? 0) <= minMinutes;
  };

  const displayText = formatDisplay(value);

  const stepHour = (delta: number) =>
    setDraft(d => {
      let h = d.hour12 + delta;
      if (h > 12) h = 1;
      if (h < 1) h = 12;
      return { ...d, hour12: h };
    });

  const stepMinute = (delta: number) =>
    setDraft(d => {
      let m = d.minute + delta * MINUTE_STEP;
      if (m >= 60) m = 0;
      if (m < 0) m = 60 - MINUTE_STEP;
      return { ...d, minute: m };
    });

  const togglePeriod = () =>
    setDraft(d => ({ ...d, period: d.period === 'AM' ? 'PM' : 'AM' }));

  const commit = (p: TimeParts) => {
    onChange(to24(p));
    setOpen(false);
  };

  const setNow = () => {
    const now = new Date();
    const min = roundMinuteToStep(now.getMinutes());
    const period: 'AM' | 'PM' = now.getHours() >= 12 ? 'PM' : 'AM';
    const hour12 = now.getHours() % 12 === 0 ? 12 : now.getHours() % 12;
    const next: TimeParts = { hour12, minute: min, period };
    setDraft(next);
    if (!isDraftDisabled(next)) commit(next);
  };

  const invalid = isDraftDisabled(draft);

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
        <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
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
          className={`absolute z-50 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Column headers */}
          <div className="grid grid-cols-3 gap-2 mb-1">
            {['Hour', 'Minute', 'AM / PM'].map(h => (
              <div key={h} className="text-center text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                {h}
              </div>
            ))}
          </div>

          {/* Stepper columns */}
          <div className="grid grid-cols-3 gap-2">
            <StepperColumn
              onUp={() => stepHour(1)}
              onDown={() => stepHour(-1)}
              value={String(draft.hour12).padStart(2, '0')}
              label="Hour"
            />
            <StepperColumn
              onUp={() => stepMinute(1)}
              onDown={() => stepMinute(-1)}
              value={String(draft.minute).padStart(2, '0')}
              label="Minute"
            />
            <StepperColumn
              onUp={togglePeriod}
              onDown={togglePeriod}
              value={draft.period}
              label="AM / PM"
            />
          </div>

          {invalid && (
            <p className="text-[10px] text-rose-500 text-center mt-2">
              Must be after {formatDisplay(minTime!)}
            </p>
          )}

          {/* Quick actions */}
          <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false); }}
              className="text-xs font-medium text-slate-400 hover:text-slate-600 transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={setNow}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              Now
            </button>
          </div>

          {/* Done */}
          <button
            type="button"
            disabled={invalid}
            onClick={() => commit(draft)}
            className="w-full mt-2 rounded-xl bg-brand-500 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
};

interface StepperColumnProps {
  value: string;
  label: string;
  onUp: () => void;
  onDown: () => void;
}

const StepperColumn: React.FC<StepperColumnProps> = ({ value, label, onUp, onDown }) => {
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) onUp();
    else onDown();
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') { e.preventDefault(); onUp(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); onDown(); }
  };

  return (
    <div className="flex flex-col items-center gap-1" onWheel={onWheel}>
      <button
        type="button"
        onClick={onUp}
        className="w-full flex justify-center py-1 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
        aria-label={`Increase ${label}`}
      >
        <ChevronUp className="w-4 h-4" />
      </button>
      <div
        tabIndex={0}
        onKeyDown={onKey}
        className="w-full text-center py-2 rounded-xl bg-slate-50 ring-1 ring-slate-200 text-base font-semibold text-slate-800 tabular-nums focus:ring-brand-500 focus:outline-none"
        aria-label={label}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={onDown}
        className="w-full flex justify-center py-1 rounded-lg text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
        aria-label={`Decrease ${label}`}
      >
        <ChevronDown className="w-4 h-4" />
      </button>
    </div>
  );
};
