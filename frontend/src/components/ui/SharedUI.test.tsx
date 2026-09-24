import { useRef, useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardHero } from './DashboardPrimitives';
import { ConfirmDialog, PasswordField } from './SharedUI';

afterEach(cleanup);

describe('shared UI primitives', () => {
  it('uses the shared portal hero for consistent headings and actions', () => {
    const { container } = render(<DashboardHero title="Role portal" subtitle="Role-specific summary" actions={<button>Refresh</button>} />);
    expect(container.querySelector('.dashboard-hero')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Role portal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('keeps passwords concealed unless the user explicitly reveals them', () => {
    render(<PasswordField label="New password" value="Secure-Passphrase-42!" readOnly />);
    const field = screen.getByLabelText('New password');
    expect(field).toHaveAttribute('type', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(field).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();
  });

  it('portals confirmation dialogs into a centered viewport overlay with an accessible description', () => {
    render(<ConfirmDialog open title="Confirm logout" description="End this session?" onClose={() => undefined} onConfirm={() => undefined} />);

    const overlay = screen.getByTestId('modal-overlay');
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay).toHaveClass('fixed', 'inset-0', 'items-center', 'justify-center', 'z-[100]');
    const dialog = screen.getByRole('dialog', { name: 'Confirm logout', description: 'End this session?' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
  });

  it('traps focus, closes on Escape or Cancel, restores trigger focus, and locks body scrolling', async () => {
    const onConfirm = vi.fn();
    const Harness = () => {
      const [open, setOpen] = useState(false);
      const triggerRef = useRef<HTMLButtonElement>(null);
      return <>
        <button ref={triggerRef} onClick={() => setOpen(true)}>Account menu</button>
        <ConfirmDialog open={open} title="Confirm logout" description="End this session?" returnFocusRef={triggerRef} onClose={() => setOpen(false)} onConfirm={onConfirm} />
      </>;
    };

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    fireEvent.click(trigger);
    expect(document.body.style.overflow).toBe('hidden');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus());

    const confirm = screen.getByRole('button', { name: 'Confirm' });
    confirm.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(confirm).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body.style.overflow).toBe('');
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
