import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  refreshToken: vi.fn(),
  getCurrentUser: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../api/authService', () => mocks);
vi.mock('../../lib/supabase', () => ({ setSupabaseRealtimeAuth: vi.fn() }));

import { useAuthStore } from '../../stores/authStore';
import {
  LAST_ACTIVITY_STORAGE_KEY,
  SESSION_END_REASON_STORAGE_KEY,
  SESSION_SIGNAL_STORAGE_KEY,
  writeLastActivityAt,
} from '../../session/sessionState';
import { SessionIdleManager } from './SessionIdleManager';

const baseUser = {
  id: 'user-1',
  email: 'employee@example.com',
  assignedRoles: ['EMPLOYEE'],
  roles: ['EMPLOYEE'],
  permissions: [],
};

function authenticate(roles = ['EMPLOYEE']) {
  localStorage.setItem('accessToken', 'access-token');
  localStorage.setItem('refreshToken', 'refresh-token');
  writeLastActivityAt(Date.now());
  useAuthStore.setState({
    user: { ...baseUser, assignedRoles: roles, roles },
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    sessionStatus: 'ready',
    sessionError: null,
  });
}

function renderManager({
  idleThresholdMs = 5_000,
  warningDurationMs = 60_000,
  tickMs = 50,
}: {
  idleThresholdMs?: number;
  warningDurationMs?: number;
  tickMs?: number;
} = {}) {
  return render(
    <MemoryRouter initialEntries={['/portal']}>
      <SessionIdleManager
        idleThresholdMs={idleThresholdMs}
        warningDurationMs={warningDurationMs}
        activityThrottleMs={0}
        tickMs={tickMs}
      >
        <Routes>
          <Route path="/portal" element={<button type="button">Portal action</button>} />
          <Route path="/login" element={<div>Login destination</div>} />
        </Routes>
      </SessionIdleManager>
    </MemoryRouter>,
  );
}

async function advance(milliseconds: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(milliseconds); });
}

describe('SessionIdleManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-25T08:00:00.000Z'));
    localStorage.clear();
    sessionStorage.clear();
    useAuthStore.setState({
      user: null,
      accessToken: null,
      refreshToken: null,
      sessionStatus: 'ready',
      sessionError: null,
    });
    mocks.refreshToken.mockReset();
    mocks.getCurrentUser.mockReset();
    mocks.logout.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = '';
    vi.useRealTimers();
  });

  it('shows the blocking warning at exactly five minutes with a 60-second countdown', async () => {
    authenticate();
    renderManager({ idleThresholdMs: 300_000 });

    await advance(299_999);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await advance(1);

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByText('00:60')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stay Signed In' })).toHaveFocus();
    expect(document.body).toHaveStyle({ overflow: 'hidden' });
  });

  it.each([
    ['keyboard input', () => fireEvent.keyDown(window, { key: 'a' })],
    ['pointer input', () => fireEvent.pointerDown(window)],
    ['click or route interaction', () => fireEvent.click(screen.getByRole('button', { name: 'Portal action' }))],
    ['touch input', () => fireEvent.touchStart(window)],
    ['scroll input', () => fireEvent.scroll(window)],
  ])('treats %s as meaningful activity', async (_label, interact) => {
    authenticate();
    renderManager();
    await advance(4_000);
    interact();
    await advance(4_999);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await advance(1);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('does not let background time, polling, or realtime traffic reset idleness', async () => {
    authenticate();
    renderManager();

    await advance(5_000);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('requires explicit confirmation after the warning and ignores other activity', async () => {
    authenticate();
    renderManager({ warningDurationMs: 1_000 });
    await advance(5_000);

    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.pointerDown(window);
    fireEvent.scroll(window);
    await advance(1_000);

    expect(mocks.logout).toHaveBeenCalledWith('INACTIVITY');
    expect(screen.getByText('Login destination')).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_END_REASON_STORAGE_KEY)).toBe('inactivity');
  });

  it('refreshes and revalidates the real server session before continuing', async () => {
    authenticate();
    mocks.refreshToken.mockResolvedValue({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      user: baseUser,
    });
    mocks.getCurrentUser.mockResolvedValue({ ...baseUser });
    renderManager();
    await advance(5_000);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay Signed In' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.refreshToken).toHaveBeenCalledWith('refresh-token');
    expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
    expect(useAuthStore.getState()).toMatchObject({
      user: expect.objectContaining({ id: 'user-1' }),
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByText('Portal action')).toBeInTheDocument();
  });

  it('lets one continuation request win safely at one second remaining', async () => {
    authenticate();
    let resolveRefresh: (value: unknown) => void = () => undefined;
    mocks.refreshToken.mockReturnValue(new Promise((resolve) => { resolveRefresh = resolve; }));
    mocks.getCurrentUser.mockResolvedValue({ ...baseUser });
    renderManager({ warningDurationMs: 1_000 });
    await advance(5_999);

    const stayButton = screen.getByRole('button', { name: 'Stay Signed In' });
    fireEvent.click(stayButton);
    fireEvent.click(stayButton);
    expect(screen.getByRole('button', { name: 'Continuing session…' })).toBeDisabled();
    expect(mocks.refreshToken).toHaveBeenCalledTimes(1);

    await advance(10);
    expect(mocks.logout).not.toHaveBeenCalled();

    await act(async () => {
      resolveRefresh({ accessToken: 'new-access-token', refreshToken: 'new-refresh-token', user: baseUser });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('rejects a revoked or password-invalidated session instead of continuing', async () => {
    authenticate();
    mocks.refreshToken.mockRejectedValue({ response: { status: 401 } });
    renderManager();
    await advance(5_000);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay Signed In' }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText('Login destination')).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(sessionStorage.getItem(SESSION_END_REASON_STORAGE_KEY)).toBe('expired');
  });

  it('keeps the warning open on a network failure and does not grant more time', async () => {
    authenticate();
    mocks.refreshToken.mockRejectedValue(new Error('network unavailable'));
    renderManager({ warningDurationMs: 60_000 });
    await advance(5_000);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Stay Signed In' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Unable to verify your session');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('uses the same secure logout flow for the Log Out button', async () => {
    authenticate();
    renderManager();
    await advance(5_000);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Log Out' }));
      await Promise.resolve();
    });

    expect(mocks.logout).toHaveBeenCalledWith('MANUAL');
    expect(screen.getByText('Login destination')).toBeInTheDocument();
    expect(sessionStorage.getItem(SESSION_END_REASON_STORAGE_KEY)).toBeNull();
  });

  it('cannot bypass an already-expired idle deadline by refreshing the page', async () => {
    authenticate();
    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now() - 6_001));
    renderManager({ idleThresholdMs: 5_000, warningDurationMs: 1_000 });
    await act(async () => { await Promise.resolve(); });

    expect(mocks.logout).toHaveBeenCalledWith('INACTIVITY');
    expect(screen.getByText('Login destination')).toBeInTheDocument();
  });

  it('recalculates deadlines when a hidden tab becomes visible', async () => {
    authenticate();
    renderManager({ idleThresholdMs: 5_000, warningDurationMs: 1_000, tickMs: 60_000 });
    vi.setSystemTime(new Date(Date.now() + 6_001));

    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await Promise.resolve(); });

    expect(mocks.logout).toHaveBeenCalledWith('INACTIVITY');
    expect(screen.getByText('Login destination')).toBeInTheDocument();
  });

  it('synchronizes activity, warning, continuation, and logout across tabs', async () => {
    authenticate();
    renderManager();
    await advance(4_000);

    const remoteActivityAt = Date.now();
    window.dispatchEvent(new StorageEvent('storage', {
      key: LAST_ACTIVITY_STORAGE_KEY,
      newValue: String(remoteActivityAt),
    }));
    await advance(4_999);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    const warningSignal = JSON.stringify({ type: 'warning', at: Date.now(), source: 'other-tab' });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_SIGNAL_STORAGE_KEY, newValue: warningSignal })));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    const continuingSignal = JSON.stringify({ type: 'continuing', at: Date.now(), source: 'other-tab' });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_SIGNAL_STORAGE_KEY, newValue: continuingSignal })));
    expect(screen.getByRole('button', { name: 'Continuing session…' })).toBeDisabled();

    localStorage.setItem('accessToken', 'continued-access');
    localStorage.setItem('refreshToken', 'continued-refresh');
    const continueSignal = JSON.stringify({ type: 'continued', at: Date.now(), source: 'other-tab' });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_SIGNAL_STORAGE_KEY, newValue: continueSignal })));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBe('continued-access');

    const logoutSignal = JSON.stringify({ type: 'logout', at: Date.now(), source: 'other-tab', reason: 'manual' });
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: SESSION_SIGNAL_STORAGE_KEY, newValue: logoutSignal })));
    expect(screen.getByText('Login destination')).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('traps focus, blocks Escape dismissal, and keeps screen-reader updates paced', async () => {
    authenticate();
    renderManager();
    await advance(5_000);

    const stay = screen.getByRole('button', { name: 'Stay Signed In' });
    const logout = screen.getByRole('button', { name: 'Log Out' });
    expect(stay).toHaveFocus();
    logout.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(stay).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('60 seconds remaining');
  });

  it('is disabled on the login page when no authenticated session exists', async () => {
    renderManager({ idleThresholdMs: 1, warningDurationMs: 1 });
    await advance(10_000);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(mocks.logout).not.toHaveBeenCalled();
  });

  it('covers every canonical role and multi-role users through the shared authenticated wrapper', async () => {
    const roles = [
      'SUPER_ADMIN', 'SYSTEM_ADMIN', 'COMPLIANCE_MANAGER', 'DATA_PROTECTION_OFFICER',
      'LEGAL_COUNSEL', 'RECORDS_OFFICER', 'DEPARTMENT_HEAD', 'SECURITY_OFFICER',
      'INFOSEC_OFFICER', 'FACILITIES_MANAGER', 'FACILITIES_OFFICER', 'COMPLIANCE_OFFICER',
      'LEGAL_OFFICER', 'CONTRACT_OFFICER', 'EMPLOYEE',
    ];

    for (const role of roles) {
      authenticate([role]);
      const view = renderManager({ idleThresholdMs: 1, warningDurationMs: 1_000, tickMs: 1 });
      await advance(1);
      expect(screen.getByRole('alertdialog')).toBeInTheDocument();
      view.unmount();
      document.body.style.overflow = '';
    }

    authenticate(['EMPLOYEE', 'LEGAL_OFFICER']);
    renderManager({ idleThresholdMs: 1, warningDurationMs: 1_000, tickMs: 1 });
    await advance(1);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
