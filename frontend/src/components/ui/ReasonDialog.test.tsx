import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReasonDialog } from './SharedUI';

describe('ReasonDialog', () => {
  it('keeps the dialog and entered reason open when submission fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Server rejected the action'));
    render(<ReasonDialog open title="Reject item" onClose={vi.fn()} onConfirm={onConfirm} />);

    const field = screen.getByLabelText(/Reason/);
    fireEvent.change(field, { target: { value: 'Missing required evidence' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

    await waitFor(() => expect(screen.getByText(/could not be completed/)).toBeInTheDocument());
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(field).toHaveValue('Missing required evidence');
  });
});
