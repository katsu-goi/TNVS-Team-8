import React, { useEffect, useMemo, useState } from 'react';
import type { DataTableActiveFilter, DataTableColumn, DataTablePaginationState, DataTableSort } from './types';
import { DataTableColumnHeader } from './DataTableColumnHeader';
import { DataTableMobileCard } from './DataTableMobileCard';
import { DataTablePagination } from './DataTablePagination';
import { DataTableEmptyState, DataTableErrorState, DataTableSkeleton } from './DataTableStates';
import { DataTableToolbar } from './DataTableToolbar';

const useDebouncedValue = <T,>(value: T, delay = 350) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = window.setTimeout(() => setDebounced(value), delay); return () => window.clearTimeout(timer); }, [value, delay]);
  return debounced;
};

const textOf = (value: React.ReactNode): string => {
  if (value === null || value === undefined || value === false) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(textOf).join(' ');
  return '';
};

const sortPrimitive = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return String(value ?? '').toLocaleLowerCase();
};

export function DataTable<T>({
  data,
  columns,
  rowKey,
  caption = 'Records',
  loading = false,
  error,
  onRetry,
  searchPlaceholder,
  searchableText,
  searchValue,
  onSearchChange,
  filters,
  filterRow,
  activeFilters = [],
  onClearFilters,
  actions,
  onRefresh,
  sort,
  onSortChange,
  pagination,
  pageSizeOptions = [10, 25, 50, 100],
  initialPageSize = 25,
  paginationEnabled = true,
  emptyTitle,
  emptyDescription,
  filteredEmptyTitle,
  renderMobileCard,
  onRowClick,
  rowActions,
  stickyHeader = true,
  className = '',
}: {
  data: T[];
  columns: DataTableColumn<T>[];
  rowKey: (row: T) => React.Key;
  caption?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  searchPlaceholder?: string;
  searchableText?: (row: T) => string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: React.ReactNode;
  filterRow?: (row: T) => boolean;
  activeFilters?: DataTableActiveFilter[];
  onClearFilters?: () => void;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
  pagination?: DataTablePaginationState;
  pageSizeOptions?: number[];
  initialPageSize?: number;
  paginationEnabled?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  filteredEmptyTitle?: string;
  renderMobileCard?: (row: T) => React.ReactNode;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => React.ReactNode;
  stickyHeader?: boolean;
  className?: string;
}) {
  const [internalSearch, setInternalSearch] = useState('');
  const rawSearch = searchValue ?? internalSearch;
  const setSearch = onSearchChange ?? setInternalSearch;
  const debouncedSearch = useDebouncedValue(rawSearch.trim().toLocaleLowerCase());
  const [internalSort, setInternalSort] = useState<DataTableSort | null>(null);
  const activeSort = sort === undefined ? internalSort : sort;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [visibleColumns, setVisibleColumns] = useState(() => new Set(columns.filter((column) => column.defaultVisible !== false).map((column) => column.id)));

  useEffect(() => { setVisibleColumns((current) => { const next = new Set<string>(); columns.forEach((column) => { if (!column.optional || current.has(column.id) || (column.defaultVisible !== false && !current.size)) next.add(column.id); }); return next; }); }, [columns]);
  useEffect(() => { if (!pagination) setPage(1); }, [debouncedSearch, filterRow, activeFilters.length, pagination]);

  const visible = useMemo(() => columns.filter((column) => visibleColumns.has(column.id)), [columns, visibleColumns]);
  const filtered = useMemo(() => {
    let rows = filterRow ? data.filter(filterRow) : [...data];
    if (debouncedSearch && !onSearchChange) rows = rows.filter((row) => {
      const haystack = searchableText
        ? searchableText(row)
        : columns.map((column) => column.searchableValue?.(row) ?? textOf(column.cell?.(row) ?? column.accessor?.(row))).join(' ');
      return haystack.toLocaleLowerCase().includes(debouncedSearch);
    });
    if (activeSort && !onSortChange) {
      const column = columns.find((candidate) => candidate.id === activeSort.columnId);
      if (column) rows.sort((left, right) => {
        const a = sortPrimitive(column.sortValue?.(left) ?? column.searchableValue?.(left) ?? column.accessor?.(left));
        const b = sortPrimitive(column.sortValue?.(right) ?? column.searchableValue?.(right) ?? column.accessor?.(right));
        const result = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
        return activeSort.direction === 'asc' ? result : -result;
      });
    }
    return rows;
  }, [data, filterRow, debouncedSearch, onSearchChange, searchableText, columns, activeSort, onSortChange]);

  const clientTotal = filtered.length;
  const currentPage = pagination?.page ?? page;
  const currentPageSize = pagination?.pageSize ?? pageSize;
  const total = pagination?.total ?? clientTotal;
  const pageRows = useMemo(() => pagination || !paginationEnabled ? filtered : filtered.slice((currentPage - 1) * currentPageSize, currentPage * currentPageSize), [filtered, pagination, paginationEnabled, currentPage, currentPageSize]);
  const hasFilters = Boolean(rawSearch.trim() || activeFilters.length || filterRow);
  const handleSort = (columnId: string) => {
    const next: DataTableSort = activeSort?.columnId === columnId && activeSort.direction === 'asc' ? { columnId, direction: 'desc' } : { columnId, direction: 'asc' };
    if (onSortChange) onSortChange(next); else setInternalSort(next);
  };
  const clearAll = () => { setSearch(''); onClearFilters?.(); };
  const changePageSize = (size: number) => { if (pagination?.onPageSizeChange) pagination.onPageSizeChange(size); else { setPageSize(size); setPage(1); } };
  const changePage = pagination?.onPageChange ?? setPage;

  return <section className={`relative overflow-hidden rounded-card border border-[var(--hirna-border)] bg-white shadow-card ${className}`} aria-busy={loading}>
    <DataTableToolbar columns={columns} visibleColumns={visibleColumns} onToggleColumn={(id) => setVisibleColumns((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; })} searchValue={searchableText || onSearchChange ? rawSearch : undefined} onSearchChange={searchableText || onSearchChange ? setSearch : undefined} searchPlaceholder={searchPlaceholder} filters={filters} activeFilters={activeFilters} onClearFilters={onClearFilters ? clearAll : undefined} actions={actions} onRefresh={onRefresh} refreshing={loading && data.length > 0} />
    {loading && data.length > 0 && <div role="status" aria-label="Refreshing records" className="absolute inset-x-0 top-0 z-40 h-1 overflow-hidden bg-red-100"><div className="h-full w-1/3 animate-pulse rounded-full bg-brand-500" /></div>}
    {error && !data.length ? <DataTableErrorState message={error} onRetry={onRetry} /> : loading && !data.length ? <DataTableSkeleton columns={Math.min(visible.length + (rowActions ? 1 : 0), 6)} /> : !pageRows.length ? <DataTableEmptyState title={hasFilters ? filteredEmptyTitle : emptyTitle} description={hasFilters ? undefined : emptyDescription} filtered={hasFilters} onClearFilters={hasFilters ? clearAll : undefined} /> : <>
      <div className="hidden max-w-full overflow-x-auto md:block">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className={stickyHeader ? 'sticky top-0 z-10 bg-[var(--hirna-section)] shadow-[0_1px_0_var(--hirna-border)]' : 'bg-[var(--hirna-section)]'}><tr>{visible.map((column) => <th key={column.id} scope="col" className={`whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-600 ${column.headerClassName ?? ''}`}><DataTableColumnHeader id={column.id} label={column.header} sortable={column.sortable} sort={activeSort} onSort={handleSort} align={column.align} /></th>)}{rowActions && <th scope="col" className="sticky right-0 z-20 w-14 bg-[var(--hirna-section)] px-4 py-3 text-right text-xs font-bold uppercase tracking-wide text-slate-600"><span className="sr-only">Actions</span></th>}</tr></thead>
          <tbody className="divide-y divide-[var(--hirna-border)]">{pageRows.map((row) => { const interactive = Boolean(onRowClick); return <tr key={rowKey(row)} onClick={() => onRowClick?.(row)} onKeyDown={(event) => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onRowClick?.(row); } }} tabIndex={interactive ? 0 : undefined} className={`${interactive ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500' : ''} transition-colors hover:bg-[var(--hirna-surface-hover)]`}>{visible.map((column) => <td key={column.id} className={`max-w-sm px-4 py-3.5 align-middle text-slate-700 ${column.align === 'right' ? 'text-right tabular-nums' : column.align === 'center' ? 'text-center' : 'text-left'} ${column.className ?? ''}`}>{column.cell?.(row) ?? column.accessor?.(row) ?? '—'}</td>)}{rowActions && <td className="sticky right-0 z-[5] bg-white px-3 py-2 text-right group-hover:bg-[var(--hirna-surface-hover)]">{rowActions(row)}</td>}</tr>; })}</tbody>
        </table>
      </div>
      <div className="space-y-3 bg-slate-50/60 p-3 md:hidden">{pageRows.map((row) => <React.Fragment key={rowKey(row)}>{renderMobileCard ? renderMobileCard(row) : <DataTableMobileCard title={visible[0]?.cell?.(row) ?? visible[0]?.accessor?.(row) ?? 'Record'} fields={visible.slice(1, 5).map((column) => ({ label: column.mobileLabel ?? column.header, value: column.cell?.(row) ?? column.accessor?.(row) ?? '—' }))} actions={rowActions?.(row)} onClick={onRowClick ? () => onRowClick(row) : undefined} />}</React.Fragment>)}</div>
    </>}
    {!error && !loading && pageRows.length > 0 && paginationEnabled && <DataTablePagination page={currentPage} pageSize={currentPageSize} total={total} onPageChange={changePage} onPageSizeChange={pagination?.onPageSizeChange || !pagination ? changePageSize : undefined} pageSizeOptions={pageSizeOptions} />}
  </section>;
}
