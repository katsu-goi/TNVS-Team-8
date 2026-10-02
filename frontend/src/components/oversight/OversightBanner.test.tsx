import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OversightBanner } from './OversightBanner';
import { OVERSIGHT_SESSION_ID_KEY } from '../../utils/oversightSession';

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  stop: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock('../../api/oversightService', () => ({
  getCurrentOversightSession: mocks.current,
  stopOversightSession: mocks.stop,
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => mocks.navigate,
}));

const targetUser = {
  id: 'target-id', email: 'dept.head@hirna.inc', fullName: 'Department Head',
  roles: ['DEPARTMENT_HEAD'], assignedRoles: ['DEPARTMENT_HEAD'],
};

function activeSession(manual: boolean) {
  return {
    id: 'session-id', mode: 'IMPERSONATION', actorRole: 'SUPER_ADMIN', readOnly: false,
    access: 'FULL_ACCESS', status: 'ACTIVE', justification: 'Investigating workflow issue',
    actorUserId: 'actor-id', targetUser, startedAt: '2026-10-02T01:00:00Z',
    expiresAt: manual ? null : '2026-10-02T01:15:00Z',
    durationMinutes: manual ? null : 15, manualTerminationRequired: manual,
  };
}

describe('persistent oversight banner', () => {
  beforeEach(() => {
    localStorage.setItem(OVERSIGHT_SESSION_ID_KEY, 'session-id');
    mocks.current.mockReset();
    mocks.stop.mockReset().mockResolvedValue(undefined);
    mocks.navigate.mockReset();
  });
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  it('shows full-access target identity and requires manual ending for an infinite session', async () => {
    mocks.current.mockResolvedValue(activeSession(true));
    render(<OversightBanner />);
    expect(await screen.findByText('Super Admin Oversight')).toBeInTheDocument();
    expect(screen.getByText('Full Access')).toBeInTheDocument();
    expect(screen.getByText(/Department Head/)).toHaveTextContent('dept.head@hirna.inc');
    expect(screen.getByText(/Remaining:/)).toHaveTextContent('Until manually ended');

    fireEvent.click(screen.getByRole('button', { name: 'End Oversight Session' }));
    await waitFor(() => expect(mocks.stop).toHaveBeenCalledTimes(1));
    expect(mocks.navigate).toHaveBeenCalledWith('/super-admin/user-oversight', { replace: true });
  });

  it('renders a timed countdown for finite sessions', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-02T01:00:00Z'));
    mocks.current.mockResolvedValue(activeSession(false));
    render(<OversightBanner />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/Remaining:/)).toHaveTextContent('15:00');
  });

  it('returns to oversight with an expiration notice when the server expires the context', async () => {
    mocks.current.mockResolvedValue(activeSession(true));
    render(<OversightBanner />);
    await screen.findByText('Super Admin Oversight');
    window.dispatchEvent(new CustomEvent('oversight:expired'));
    expect(mocks.navigate).toHaveBeenCalledWith('/super-admin/user-oversight?oversight=expired', { replace: true });
  });

  it('returns safely when the target account becomes unavailable', async () => {
    mocks.current.mockResolvedValue(activeSession(true));
    render(<OversightBanner />);
    await screen.findByText('Super Admin Oversight');
    window.dispatchEvent(new CustomEvent('oversight:terminated', {
      detail: { reason: 'target-unavailable' },
    }));
    expect(mocks.navigate).toHaveBeenCalledWith(
      '/super-admin/user-oversight?oversight=target-unavailable',
      { replace: true },
    );
  });
});
