import React, { useMemo } from 'react';

type TimeSelectProps = {
  id: string;
  label: string;
  value: string;
  selectedDate: string;
  now: Date;
  dayStart: number;
  dayEnd: number;
  onChange: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
};

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-700 focus:ring-2 focus:ring-red-700/10 disabled:cursor-not-allowed disabled:bg-slate-50';

function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const displayHour = hours % 12 || 12;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `${displayHour}:${String(minutes % 60).padStart(2, '0')} ${suffix}`;
}

function timeValue(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export const TimeSelect: React.FC<TimeSelectProps> = ({ id, label, value, selectedDate, now, dayStart, dayEnd, onChange, disabled = false, hasError = false }) => {
  const today = dateKey(now);
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  const options = useMemo(() => {
    const firstOption = dayStart * 60;
    const lastOption = dayEnd * 60;
    return Array.from({ length: ((lastOption - firstOption) / 30) + 1 }, (_, index) => {
      const minutes = firstOption + (index * 30);
      const isPast = selectedDate < today || (selectedDate === today && minutes <= currentMinutes);
      return { value: timeValue(minutes), label: timeLabel(minutes), isPast };
    });
  }, [currentMinutes, dayEnd, dayStart, selectedDate, today]);

  return (
    <label className="block" htmlFor={id}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} className={hasError ? `${inputClass} border-rose-300` : inputClass}>
        <option value="">Select a time</option>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.isPast}>
            {option.label}{option.isPast ? ' - unavailable' : ''}
          </option>
        ))}
      </select>
    </label>
  );
};

export default TimeSelect;
