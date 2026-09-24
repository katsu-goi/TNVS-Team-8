import React, { lazy } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
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
vi.mock('@lottiefiles/dotlottie-react', () => ({
  DotLottieReact: () => <div data-testid="lottie-animation" />,
}));

import { PortalShell } from './PortalShell';

describe('PortalShell route loading', () => {
  afterEach(cleanup);

  it('keeps navigation and header mounted while lazy route content loads, then removes the loader', async () => {
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
                navItems={[{ id: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard }]}
              />
            )}
          >
            <Route path="/dashboard" element={<LazyDestination />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: 'Test Portal navigation' })).toBeInTheDocument();
    expect(screen.getByText('Notifications control')).toBeInTheDocument();
    expect(screen.getByText('Profile control')).toBeInTheDocument();
    expect(screen.getByText('Loading page')).toBeInTheDocument();

    await act(async () => { resolveRoute?.(); });

    expect(await screen.findByText('Destination content')).toBeInTheDocument();
    expect(screen.queryByText('Loading page')).not.toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Test Portal navigation' })).toBeInTheDocument();
  });
});
