import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserOversightPage } from './UserOversightPage';

const mocks = vi.hoisted(() => ({
  listTargets: vi.fn(),
  getSummary: vi.fn(),
  getCurrent: vi.fn(),
  start: vi.fn(),
}));

vi.mock('../../api/oversightService', () => ({
  listOversightTargets: mocks.listTargets,
  getOversightSummary: mocks.getSummary,
  getCurrentOversightSession: mocks.getCurrent,
  startOversightSession: mocks.start,
}));

vi.mock('../../stores/authStore', () => ({
  getDashboardPath: () => '/department/dashboard',
}));

const onlineTarget = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'dept.head@hirna.inc',
  fullName: 'Department Head',
  firstName: 'Department',
  lastName: 'Head',
  department: 'Administration',
  roles: ['DEPARTMENT_HEAD'],
  assignedRoles: ['DEPARTMENT_HEAD'],
  permissions: ['DOCUMENT_UPDATE'],
  isOnline: true,
  lastActiveAt: '2026-09-26T05:38:00+08:00',
};

const offlineTarget = {
  ...onlineTarget,
  id: '22222222-2222-4222-8222-222222222222',
  email: 'records@hirna.inc',
  fullName: 'Records Officer',
  firstName: 'Records',
  lastName: 'Officer',
  department: 'Data Protection',
  roles: ['RECORDS_OFFICER'],
  assignedRoles: ['RECORDS_OFFICER'],
  isOnline: false,
  lastActiveAt: null,
};

function sessionFor(target = onlineTarget, manual = false) {
  return {
    id: '33333333-3333-4333-8333-333333333333',
    mode: 'IMPERSONATION',
    actorRole: 'SUPER_ADMIN',
    readOnly: false,
    access: 'FULL_ACCESS',
    status: 'ACTIVE',
    justification: 'Investigating document workflow issue',
    actorUserId: '44444444-4444-4444-8444-444444444444',
    targetUser: target,
    startedAt: '2026-10-02T01:00:00Z',
    expiresAt: manual ? null : '2026-10-02T01:15:00Z',
    durationMinutes: manual ? null : 15,
    manualTerminationRequired: manual,
  };
}

describe('Super Admin User Oversight page', () => {
  beforeEach(() => {
    mocks.listTargets.mockReset().mockResolvedValue([onlineTarget, offlineTarget]);
    mocks.getSummary.mockReset().mockResolvedValue({
      totalUsers: 2, activeUsers: 1, offlineUsers: 1, activeOversightSessions: 0,
    });
    mocks.getCurrent.mockReset().mockResolvedValue(null);
    mocks.start.mockReset().mockResolvedValue(sessionFor());
  });
  afterEach(cleanup);

  it('renders backend summary data and keeps offline accounts separately eligible', async () => {
    render(<MemoryRouter><UserOversightPage /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'Department Head' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Records Officer' })).toBeInTheDocument();
    expect(screen.getByText('2', { selector: 'p.text-2xl' })).toBeInTheDocument();
    expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Oversight Eligible')).toHaveLength(2);
  });

  it('shows justification validation only after interaction and filters users', async () => {
    render(<MemoryRouter><UserOversightPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Department Head' });
    expect(screen.queryByText('Enter at least 10 characters.')).not.toBeInTheDocument();
    const justification = screen.getByRole('textbox', { name: /Audit Justification/ });
    fireEvent.change(justification, { target: { value: 'short' } });
    fireEvent.blur(justification);
    expect(screen.getByText('Enter at least 10 characters.')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Search users by name/), { target: { value: 'records' } });
    expect(screen.queryByRole('heading', { name: 'Department Head' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Records Officer' })).toBeInTheDocument();
  });

  it.each([
    ['5', 5, false, '5 minutes'],
    ['10', 10, false, '10 minutes'],
    ['15', 15, false, '15 minutes'],
    ['manual', null, true, 'Until Manually Ended'],
  ] as const)('confirms and starts the %s duration option', async (value, minutes, manual, durationLabel) => {
    mocks.start.mockResolvedValueOnce(sessionFor(onlineTarget, manual));
    render(<MemoryRouter><UserOversightPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Department Head' });
    fireEvent.change(screen.getByRole('textbox', { name: /Audit Justification/ }), {
      target: { value: 'Investigating document workflow issue' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Session Duration' }), { target: { value } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Start Oversight Session' })[0]);

    const dialog = screen.getByRole('dialog', { name: 'Start Oversight Session?' });
    expect(within(dialog).getByText('Full Access')).toBeInTheDocument();
    expect(within(dialog).getByText(durationLabel)).toBeInTheDocument();
    expect(within(dialog).getByText('Investigating document workflow issue')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start Oversight Session' }));
    await waitFor(() => expect(mocks.start).toHaveBeenCalledWith({
      targetUserId: onlineTarget.id,
      mode: 'IMPERSONATION',
      justification: 'Investigating document workflow issue',
      durationMinutes: minutes,
      manualTermination: manual,
    }));
  });

  it('prevents nested oversight when a session is already active', async () => {
    mocks.getCurrent.mockResolvedValue(sessionFor());
    render(<MemoryRouter><UserOversightPage /></MemoryRouter>);
    expect(await screen.findByText(/An oversight session is already active/)).toBeInTheDocument();
    for (const button of screen.getAllByRole('button', { name: 'Start Oversight Session' })) {
      expect(button).toBeDisabled();
    }
    expect(mocks.start).not.toHaveBeenCalled();
  });
});
