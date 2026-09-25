import React from 'react';
import { AlertCircle, Inbox, Loader2, SearchX } from 'lucide-react';

export const DataTableSkeleton: React.FC<{ rows?: number; columns?: number; label?: string }> = ({ rows = 6, columns = 5, label = 'Loading records...' }) => (
  <div role="status" aria-label={label} className="p-4">
    <span className="sr-only">{label}</span>
    <div className="space-y-3">{Array.from({ length: rows }, (_, row) => <div key={row} className="grid animate-pulse gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>{Array.from({ length: columns }, (_, column) => <div key={column} className="h-8 rounded-lg bg-slate-100" />)}</div>)}</div>
  </div>
);

export const DataTableEmptyState: React.FC<{ title?: string; description?: string; filtered?: boolean; onClearFilters?: () => void }> = ({ title, description, filtered = false, onClearFilters }) => {
  const Icon = filtered ? SearchX : Inbox;
  return <div className="flex min-h-56 flex-col items-center justify-center px-6 py-10 text-center"><Icon className="h-9 w-9 text-slate-300" aria-hidden="true" /><h3 className="mt-3 text-sm font-bold text-slate-900">{title ?? (filtered ? 'No records match your filters' : 'No records available')}</h3><p className="mt-1 max-w-md text-sm text-slate-500">{description ?? (filtered ? 'Try changing your search or filters.' : 'Records will appear here when they become available.')}</p>{filtered && onClearFilters && <button type="button" onClick={onClearFilters} className="mt-4 rounded-control border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">Clear filters</button>}</div>;
};

export const DataTableErrorState: React.FC<{ title?: string; message?: string; onRetry?: () => void }> = ({ title = 'Unable to load records', message = 'Please try again. If the problem continues, contact your administrator.', onRetry }) => (
  <div role="alert" className="flex min-h-56 flex-col items-center justify-center bg-rose-50/60 px-6 py-10 text-center"><AlertCircle className="h-9 w-9 text-rose-500" aria-hidden="true" /><h3 className="mt-3 text-sm font-bold text-rose-900">{title}</h3><p className="mt-1 max-w-md text-sm text-rose-700">{message}</p>{onRetry && <button type="button" onClick={onRetry} className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-control bg-rose-600 px-4 py-2 text-sm font-bold text-white hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"><Loader2 className="h-4 w-4" aria-hidden="true" />Retry</button>}</div>
);
