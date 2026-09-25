import type React from 'react';

export type DataTableSortDirection = 'asc' | 'desc';

export type DataTableSort = {
  columnId: string;
  direction: DataTableSortDirection;
};

export type DataTableColumn<T> = {
  id: string;
  header: string;
  accessor?: (row: T) => React.ReactNode;
  cell?: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number | Date | null | undefined;
  searchableValue?: (row: T) => unknown;
  sortable?: boolean;
  optional?: boolean;
  defaultVisible?: boolean;
  align?: 'left' | 'center' | 'right';
  className?: string;
  headerClassName?: string;
  mobileLabel?: string;
};

export type DataTableActiveFilter = {
  id: string;
  label: string;
  value: string;
  onRemove?: () => void;
};

export type DataTablePaginationState = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
};

export type DataTableRowAction<T> = {
  id: string;
  label: string;
  onSelect: (row: T) => unknown | Promise<unknown>;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean | 'true' | 'false' }>;
  destructive?: boolean;
  disabled?: boolean;
  hidden?: boolean;
};
