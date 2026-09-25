import React, { useEffect, useRef, useState } from 'react';
import { Check, Columns3, RefreshCw, X } from 'lucide-react';
import type { DataTableActiveFilter, DataTableColumn } from './types';
import { DataTableSearch } from './DataTableSearch';

export function DataTableToolbar<T>({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  filters,
  activeFilters = [],
  onClearFilters,
  actions,
  columns,
  visibleColumns,
  onToggleColumn,
  onRefresh,
  refreshing = false,
}: {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  activeFilters?: DataTableActiveFilter[];
  onClearFilters?: () => void;
  actions?: React.ReactNode;
  columns: DataTableColumn<T>[];
  visibleColumns: Set<string>;
  onToggleColumn: (id: string) => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);
  const optionalColumns = columns.filter((column) => column.optional);
  useEffect(() => {
    if (!columnsOpen) return;
    const close = (event: MouseEvent) => { if (!columnsRef.current?.contains(event.target as Node)) setColumnsOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setColumnsOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape); };
  }, [columnsOpen]);

  return (
    <div className="border-b border-[var(--hirna-border)] bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {onSearchChange && <DataTableSearch value={searchValue ?? ''} onChange={onSearchChange} placeholder={searchPlaceholder} />}
          {filters}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onRefresh && <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex min-h-10 items-center gap-2 rounded-control border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Refresh</button>}
          {optionalColumns.length > 0 && <div className="relative" ref={columnsRef}>
            <button type="button" onClick={() => setColumnsOpen((open) => !open)} aria-haspopup="menu" aria-expanded={columnsOpen} className="inline-flex min-h-10 items-center gap-2 rounded-control border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><Columns3 className="h-4 w-4" aria-hidden="true" />Columns</button>
            {columnsOpen && <div role="menu" aria-label="Column visibility" className="absolute right-0 z-30 mt-2 min-w-52 rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
              {optionalColumns.map((column) => <button key={column.id} type="button" role="menuitemcheckbox" aria-checked={visibleColumns.has(column.id)} onClick={() => onToggleColumn(column.id)} className="flex w-full items-center justify-between gap-4 rounded-lg px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><span>{column.header}</span>{visibleColumns.has(column.id) && <Check className="h-4 w-4 text-brand-500" aria-hidden="true" />}</button>)}
            </div>}
          </div>}
          {actions}
        </div>
      </div>
      {activeFilters.length > 0 && <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Active filters">
        <span className="text-xs font-semibold text-slate-500">Active filters:</span>
        {activeFilters.map((filter) => <span key={filter.id} className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-800">{filter.label}: {filter.value}{filter.onRemove && <button type="button" onClick={filter.onRemove} aria-label={`Remove ${filter.label} filter`} className="rounded-full p-0.5 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"><X className="h-3 w-3" aria-hidden="true" /></button>}</span>)}
        {onClearFilters && <button type="button" onClick={onClearFilters} className="rounded-md px-2 py-1 text-xs font-bold text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Clear all</button>}
      </div>}
    </div>
  );
}
