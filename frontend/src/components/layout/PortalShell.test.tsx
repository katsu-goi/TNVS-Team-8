import React, { lazy } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BarChart3, LayoutDashboard } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../hooks/useUserHeartbeat', () => ({ useUserHeartbeat: vi.fn() }));
vi.mock('../../stores/realtimeSyncStore', () => ({
  useRealtimeSyncStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    connected: true,
    connectSync: vi.fn(),
    disconnectSync: vi.fn(),
  }),
}));
vi.mock('../ui/NotificationBell', () => ({ NotificationBell: () => <div>Notifications control</div> }));
vi.mock('../ui/UserProfileMenu', () => ({ UserProfileMenu: () => <div>Profile control</div> }));
vi.mock('lottie-react', () => ({
  default: () => <div data-testid="lottie-animation" />,
}));

import { PortalShell } from './PortalShell';

describe('PortalShell route loading', () => {
  afterEach(cleanup);

  it('retains the current page under a viewport overlay until the destination is ready', async () => {
    let resolveRoute: (() => void) | undefined;
    const LazyDestination = lazy(() => new Promise<{ default: React.ComponentType }>((resolve) => {
      resolveRoute = () => resolve({ default: () => <h2>Destination content</h2> });
    }));

    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            element={(
              <PortalShell
                portalLabel="Test Portal"
                roleLabel="Test Role"
                searchPlaceholder="Search"
                navItems={[
                  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, exact: true },
                  { id: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: BarChart3, exact: true },
                ]}
              />
            )}
          >
            <Route path="/dashboard" element={<h2>Current dashboard</h2>} />
            <Route path="/admin/analytics" element={<LazyDestination />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: 'Test Portal navigation' })).toBeInTheDocument();
    expect(screen.getByText('Notifications control')).toBeInTheDocument();
    expect(screen.getByText('Profile control')).toBeInTheDocument();
    expect(screen.getByText('Current dashboard')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Analytics/ }));

    expect(screen.getByText('Current dashboard')).toBeInTheDocument();
    expect(screen.getByText('Loading operational analytics...')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveClass('fixed', 'inset-0', 'z-[110]');
    expect(screen.getByRole('status')).toHaveAttribute('data-visible', 'false');
    expect(screen.getByRole('navigation', { name: 'Test Portal navigation' })).toBeInTheDocument();
    expect(document.body).toHaveStyle({ overflow: 'hidden' });

    await act(async () => { resolveRoute?.(); });

    expect(await screen.findByText('Destination content')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Current dashboard')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(document.body.style.overflow).toBe('');
    expect(screen.getByRole('navigation', { name: 'Test Portal navigation' })).toBeInTheDocument();
  });

  it('does not start global loading when the active destination is clicked again', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            element={(
              <PortalShell
                portalLabel="Test Portal"
                roleLabel="Test Role"
                searchPlaceholder="Search"
                navItems={[{ id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, exact: true }]}
              />
            )}
          >
            <Route path="/dashboard" element={<h2>Current dashboard</h2>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Dashboard/ }));

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByText('Current dashboard')).toBeInTheDocument();
  });

  it('expands a nested group without loading and loads when its child destination is selected', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <Routes>
          <Route
            element={(
              <PortalShell
                portalLabel="Test Portal"
                roleLabel="Test Role"
                searchPlaceholder="Search"
                navItems={[
                  { id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, exact: true },
                  {
                    id: 'security', label: 'Security Center', path: '/security', icon: LayoutDashboard, exact: true, children: [
                      { id: 'audit', label: 'Audit Logs', path: '/security/audit-logs', icon: LayoutDashboard, exact: true },
                    ],
                  },
                ]}
              />
            )}
          >
            <Route path="/dashboard" element={<h2>Current dashboard</h2>} />
            <Route path="/security/audit-logs" element={<h2>Audit destination</h2>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByLabelText('Expand Security Center'));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Audit Logs/ }));
    expect(screen.getByText('Loading audit logs...')).toBeInTheDocument();
    expect(await screen.findByText('Audit destination')).toBeInTheDocument();
  });
});
