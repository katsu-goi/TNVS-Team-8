import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable } from './DataTable';
import { DataTableRowActions } from './DataTableRowActions';
import { DataTableStatusBadge } from './DataTableStatusBadge';
import type { DataTableColumn } from './types';

type Row = { id: string; name: string; status: string; count: number };
const rows: Row[] = [
  { id: '1', name: 'Bravo record', status: 'PENDING', count: 2 },
  { id: '2', name: 'Alpha record', status: 'APPROVED', count: 10 },
  { id: '3', name: 'Charlie record', status: 'REJECTED', count: 4 },
];
const columns: DataTableColumn<Row>[] = [
  { id: 'name', header: 'Name', accessor: (row) => row.name, sortable: true, sortValue: (row) => row.name },
  { id: 'status', header: 'Status', cell: (row) => <DataTableStatusBadge value={row.status} />, searchableValue: (row) => row.status },
  { id: 'count', header: 'Count', accessor: (row) => row.count, sortable: true, sortValue: (row) => row.count, align: 'right', optional: true },
];

afterEach(cleanup);

describe('DataTable', () => {
  it('renders semantic desktop rows and responsive mobile cards', () => {
    const { container } = render(<DataTable data={rows} columns={columns} rowKey={(row) => row.id} searchableText={(row) => `${row.name} ${row.status}`} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getAllByText('Bravo record')).toHaveLength(2);
    expect(container.querySelector('.md\\:hidden article')).toBeInTheDocument();
    expect(screen.getAllByText('PENDING').length).toBeGreaterThan(0);
  });

  it('renders loading, empty, filtered-empty, and safe error states', async () => {
    const { rerender } = render(<DataTable data={[]} columns={columns} rowKey={(row) => row.id} loading searchableText={(row) => row.name} />);
    expect(screen.getByRole('status', { name: 'Loading records...' })).toBeInTheDocument();
    rerender(<DataTable data={[]} columns={columns} rowKey={(row) => row.id} emptyTitle="No facilities configured" searchableText={(row) => row.name} />);
    expect(screen.getByText('No facilities configured')).toBeInTheDocument();
    rerender(<DataTable data={rows} columns={columns} rowKey={(row) => row.id} searchableText={(row) => row.name} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'missing' } });
    await waitFor(() => expect(screen.getByText('No records match your filters')).toBeInTheDocument(), { timeout: 1000 });
    rerender(<DataTable data={[]} columns={columns} rowKey={(row) => row.id} error="Unable to load facilities." onRetry={() => undefined} searchableText={(row) => row.name} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load facilities.');
  });

  it('debounces search and supports sortable headings', async () => {
    render(<DataTable data={rows} columns={columns} rowKey={(row) => row.id} searchableText={(row) => `${row.name} ${row.status}`} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Alpha' } });
    expect(screen.getAllByText('Bravo record').length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText('Bravo record')).not.toBeInTheDocument(), { timeout: 1000 });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(screen.getAllByText('Bravo record').length).toBeGreaterThan(0), { timeout: 1000 });
    fireEvent.click(screen.getByRole('button', { name: 'Sort Name ascending' }));
    const cells = screen.getAllByRole('row')[1].querySelectorAll('td');
    expect(cells[0]).toHaveTextContent('Alpha record');
  });

  it('supports filters, shared pagination, and column visibility', () => {
    const filter = vi.fn();
    render(<DataTable data={rows} columns={columns} rowKey={(row) => row.id} initialPageSize={10} searchableText={(row) => row.name} filters={<button onClick={filter}>Status filter</button>} activeFilters={[{ id: 'status', label: 'Status', value: 'Approved' }]} onClearFilters={filter} />);
    fireEvent.click(screen.getByRole('button', { name: 'Status filter' }));
    expect(filter).toHaveBeenCalled();
    expect(screen.getByLabelText('Rows per page')).toHaveValue('10');
    fireEvent.click(screen.getByRole('button', { name: 'Columns' }));
    const item = screen.getByRole('menuitemcheckbox', { name: 'Count' });
    expect(item).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(item);
    expect(screen.queryByRole('columnheader', { name: /Count/ })).not.toBeInTheDocument();
  });

  it('provides keyboard-accessible row actions', () => {
    const view = vi.fn();
    render(<DataTable data={[rows[0]]} columns={columns} rowKey={(row) => row.id} rowActions={(row) => <DataTableRowActions row={row} actions={[{ id: 'view', label: 'View record', onSelect: view }, { id: 'delete', label: 'Archive record', destructive: true, onSelect: view }]} />} />);
    const trigger = screen.getAllByRole('button', { name: 'Open row actions' })[0];
    fireEvent.click(trigger);
    const menuItem = screen.getByRole('menuitem', { name: 'View record' });
    menuItem.focus();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'Archive record' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
