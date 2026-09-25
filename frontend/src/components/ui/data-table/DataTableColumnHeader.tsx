import React from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import type { DataTableSort } from './types';

export const DataTableColumnHeader: React.FC<{
  id: string;
  label: string;
  sortable?: boolean;
  sort?: DataTableSort | null;
  onSort?: (columnId: string) => void;
  align?: 'left' | 'center' | 'right';
}> = ({ id, label, sortable = false, sort, onSort, align = 'left' }) => {
  const alignment = align === 'right' ? 'justify-end text-right' : align === 'center' ? 'justify-center text-center' : 'justify-start text-left';
  if (!sortable) return <span className={`flex items-center ${alignment}`}>{label}</span>;
  const active = sort?.columnId === id;
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  const next = !active || sort.direction === 'desc' ? 'ascending' : 'descending';
  return (
    <button
      type="button"
      onClick={() => onSort?.(id)}
      className={`inline-flex w-full items-center gap-1.5 rounded-md py-1 text-xs font-bold uppercase tracking-wide text-slate-600 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${alignment}`}
      aria-label={`Sort ${label} ${next}`}
    >
      {label}<Icon className={`h-3.5 w-3.5 ${active ? 'text-brand-500' : 'text-slate-400'}`} aria-hidden="true" />
    </button>
  );
};
