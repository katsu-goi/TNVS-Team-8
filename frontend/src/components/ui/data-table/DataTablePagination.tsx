import React from 'react';
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react';

const PageButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }> = ({ label, children, ...props }) => (
  <button type="button" aria-label={label} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-45" {...props}>{children}</button>
);

export const DataTablePagination: React.FC<{
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
}> = ({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10, 25, 50, 100] }) => {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pages);
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  if (total <= pageSize && !onPageSizeChange) return null;
  return (
    <div className="flex flex-col gap-3 border-t border-[var(--hirna-border)] bg-slate-50/70 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p aria-live="polite">Showing <strong className="text-slate-800">{start}-{end}</strong> of <strong className="text-slate-800">{total}</strong></p>
      <div className="flex flex-wrap items-center gap-2">
        {onPageSizeChange && <label className="mr-1 flex items-center gap-2 text-xs font-semibold"><span>Rows per page</span><select aria-label="Rows per page" value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))} className="min-h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{pageSizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>}
        <PageButton label="First page" onClick={() => onPageChange(1)} disabled={safePage === 1}><ChevronFirst className="h-4 w-4" aria-hidden="true" /></PageButton>
        <PageButton label="Previous page" onClick={() => onPageChange(safePage - 1)} disabled={safePage === 1}><ChevronLeft className="h-4 w-4" aria-hidden="true" /></PageButton>
        <span className="min-w-24 text-center text-xs font-semibold text-slate-700">Page {safePage} of {pages}</span>
        <PageButton label="Next page" onClick={() => onPageChange(safePage + 1)} disabled={safePage === pages}><ChevronRight className="h-4 w-4" aria-hidden="true" /></PageButton>
        <PageButton label="Last page" onClick={() => onPageChange(pages)} disabled={safePage === pages}><ChevronLast className="h-4 w-4" aria-hidden="true" /></PageButton>
      </div>
    </div>
  );
};
