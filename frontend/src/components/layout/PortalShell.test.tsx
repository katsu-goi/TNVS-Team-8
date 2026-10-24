import React, { lazy } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
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

  it('keeps all privacy destinations reachable and disclosure headers do not navigate', () => {
    render(<MemoryRouter initialEntries={['/dashboard']}><PortalShell portalLabel="Super Administration" roleLabel="Super Admin" searchPlaceholder="Search" navItems={[{id:'privacy',label:'Privacy',path:'/workspace/privacy/dashboard',icon:LayoutDashboard,disclosureOnly:true,children:Array.from({length:12},(_,index)=>({id:`privacy-${index}`,label:`Privacy module ${index}`,path:`/workspace/privacy/${index}`,icon:LayoutDashboard}))}]}><h2>Current page</h2></PortalShell></MemoryRouter>);
    expect(screen.queryByRole('button',{name:'Privacy module 11'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/^Privacy.*Expand/}));
    expect(screen.getByRole('button',{name:'Privacy module 11'})).toBeVisible();
    expect(screen.getByText('Current page')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:/^Privacy.*Collapse/}));
    expect(screen.queryByRole('button',{name:'Privacy module 11'})).not.toBeInTheDocument();
  });

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

  it('focuses the destination record after same-page notification navigation settles', async () => {
    const recordId = '1b8a9977-9874-4ea6-a79b-1b71c2a7b5ef';
    Element.prototype.scrollIntoView = vi.fn();
    const Records = () => {
      const navigate = useNavigate();
      return <><button onClick={() => navigate(`/records?focus=${recordId}`)}>Open record notification</button><div data-notification-entity-id={recordId}>Target record</div></>;
    };

    render(
      <MemoryRouter initialEntries={['/records']}>
        <Routes>
          <Route element={<PortalShell portalLabel="Test Portal" roleLabel="Test Role" searchPlaceholder="Search" navItems={[{ id: 'records', label: 'Records', path: '/records', icon: LayoutDashboard }]} />}>
            <Route path="/records" element={<Records />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open record notification' }));

    await waitFor(() => {
      const destination = Array.from(document.querySelectorAll<HTMLElement>('[data-portal-route-key]'))
        .find((slot) => slot.dataset.portalRouteKey === `/records?focus=${recordId}` && slot.getAttribute('aria-hidden') !== 'true');
      expect(destination?.querySelector(`[data-notification-entity-id="${recordId}"]`)).toHaveClass('notification-focus-target');
    });
  });
});

describe('PortalShell usable navigation', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  const renderPortal = (path = '/employee/reservations') => render(
    <MemoryRouter initialEntries={[path]}><Routes><Route element={<PortalShell portalLabel="Super Administration" roleLabel="Super Admin" searchPlaceholder="Search records" navItems={[
      { id: 'employee', label: 'Employee', path: '/employee', icon: LayoutDashboard, disclosureOnly: true, children: [
        { id: 'employee-home', label: 'Dashboard', path: '/employee', icon: LayoutDashboard, exact: true },
        { id: 'book', label: 'Facilities Reservation', path: '/employee/reservations', icon: LayoutDashboard },
      ] },
      { id: 'manager', label: 'Facilities Manager', path: '/facilities', icon: LayoutDashboard, disclosureOnly: true, children: [
        { id: 'manager-home', label: 'Dashboard', path: '/facilities', icon: LayoutDashboard, exact: true },
        { id: 'approve', label: 'Hub Capacity Allocation', path: '/facilities/approval', icon: LayoutDashboard },
      ] },
    ]} />}>
      <Route path="/employee/reservations" element={<h2>Room requests</h2>} />
      <Route path="/employee" element={<h2>Employee home</h2>} />
      <Route path="/facilities" element={<h2>Manager home</h2>} />
      <Route path="/facilities/approval" element={<h2>Approval queue</h2>} />
    </Route></Routes></MemoryRouter>,
  );

  it('finds tasks within permitted destinations, includes role context and navigates to the result', async () => {
    renderPortal();
    const search = screen.getByRole('searchbox', { name: 'Find a page' });
    fireEvent.change(search, { target: { value: 'approve booking' } });
    const result = screen.getByRole('button', { name: /Hub Capacity Allocation.*Facilities Manager/ });
    expect(screen.queryByRole('button', { name: /Facilities Reservation.*Employee/ })).not.toBeInTheDocument();
    fireEvent.click(result);
    expect(await screen.findByText('Approval queue')).toBeInTheDocument();
    expect(search).toHaveValue('');
  });

  it('distinguishes duplicate labels and restores navigation after clearing an unsuccessful search', () => {
    renderPortal();
    const search = screen.getByRole('searchbox', { name: 'Find a page' });
    fireEvent.change(search, { target: { value: 'dashboard' } });
    expect(screen.getByRole('button', { name: /Dashboard.*Employee/ })).toBeVisible();
    expect(screen.getByRole('button', { name: /Dashboard.*Facilities Manager/ })).toBeVisible();
    fireEvent.change(search, { target: { value: 'no such page' } });
    expect(screen.getByText(/No pages match/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Clear page search' }));
    expect(search).toHaveFocus();
    expect(screen.getByRole('button', { name: /^Employee.*Collapse/ })).toBeVisible();
  });

  it('explains the current room workflow in an optional accessible dialog and restores focus', async () => {
    renderPortal();
    const help = screen.getByRole('button', { name: 'Help with this page' });
    help.focus();
    fireEvent.click(help);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Facilities Officer.*reviews/)).toBeInTheDocument();
    expect(within(dialog).getByText(/Facilities Manager.*approves/)).toBeInTheDocument();
    expect(within(dialog).getByText(/confirmed/i)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(help).toHaveFocus();
  });

  it('keeps hidden mobile navigation inert, contains focus while open and restores focus on Escape', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    renderPortal();
    const aside = document.querySelector('aside')!;
    expect(aside).toHaveAttribute('inert');
    const open = screen.getByRole('button', { name: 'Open navigation' });
    open.focus();
    fireEvent.click(open);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Close navigation' })).toHaveFocus());
    expect(aside).not.toHaveAttribute('inert');
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('button', { name: /^Facilities Manager.*Expand/ })).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(open).toHaveFocus());
    expect(aside).toHaveAttribute('inert');
  });

  it('offers a keyboard skip link to the displayed content', () => {
    renderPortal();
    expect(screen.getByRole('link', { name: 'Skip to page content' })).toHaveAttribute('href', '#portal-content');
    expect(document.getElementById('portal-content')).toHaveAttribute('tabindex', '-1');
  });

  it('clears a mobile search on Escape, then closes the menu on a second Escape', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    renderPortal();
    const trigger = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(trigger);
    const search = screen.getByRole('searchbox', { name: 'Find a page' });
    search.focus();
    fireEvent.change(search, { target: { value: 'room' } });
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(search).toHaveValue('');
    expect(document.querySelector('aside')).not.toHaveAttribute('inert');
    fireEvent.keyDown(search, { key: 'Escape' });
    await waitFor(() => expect(document.querySelector('aside')).toHaveAttribute('inert'));
    expect(trigger).toHaveFocus();
  });
});
