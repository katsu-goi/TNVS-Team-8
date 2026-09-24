import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DashboardHero } from './DashboardPrimitives';
import { PasswordField } from './SharedUI';

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
});
