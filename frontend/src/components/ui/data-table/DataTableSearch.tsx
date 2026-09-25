import React from 'react';
import { Search, X } from 'lucide-react';

export const DataTableSearch: React.FC<{
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}> = ({ value, onChange, placeholder = 'Search records...', label = 'Search records' }) => (
  <label className="relative block min-w-0 flex-1 sm:max-w-sm">
    <span className="sr-only">{label}</span>
    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden="true" />
    <input
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      className="min-h-10 w-full rounded-control border border-slate-300 bg-white py-2 pl-9 pr-9 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
    />
    {value && <button type="button" onClick={() => onChange('')} aria-label="Clear search" className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>}
  </label>
);
