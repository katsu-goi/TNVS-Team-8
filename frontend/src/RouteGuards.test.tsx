import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { FacilitiesRoute, ProtectedRoute, WorkspaceSectionRoute } from './App';
import { workspaceConfigs } from './components/workspaces/workspaceConfig';
import { useAuthStore } from './stores/authStore';

describe('route guards', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, sessionStatus: 'ready' });
  });

  it('redirects an unauthenticated protected route to login', () => {
    render(
      <MemoryRouter initialEntries={['/protected']}>
        <Routes>
          <Route path="/login" element={<div>Login destination</div>} />
          <Route path="/protected" element={<ProtectedRoute><div>Protected content</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Login destination')).toBeInTheDocument();
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('shows a safe not-found state for an invalid workspace section', () => {
    render(
      <MemoryRouter initialEntries={['/invalid-section']}>
        <Routes>
          <Route path="/:section" element={<WorkspaceSectionRoute config={workspaceConfigs[0]} />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('Workspace page not found')).toBeInTheDocument();
  });

  it('allows an authoritative FACILITIES_MANAGER into the facility workspace', () => {
    useAuthStore.setState({
      accessToken: 'verified-token',
      user: { id: 'manager-1', email: 'manager@example.com', assignedRoles: ['FACILITIES_MANAGER'], roles: ['FACILITIES_MANAGER'], permissions: [] },
    });
    render(<MemoryRouter><FacilitiesRoute><div>Facility workspace</div></FacilitiesRoute></MemoryRouter>);
    expect(screen.getByText('Facility workspace')).toBeInTheDocument();
  });

  it('denies a specialized non-facilities role from the facility workspace', () => {
    useAuthStore.setState({
      accessToken: 'verified-token',
      user: { id: 'employee-1', email: 'employee@example.com', assignedRoles: ['EMPLOYEE'], roles: ['EMPLOYEE'], permissions: [] },
    });
    render(
      <MemoryRouter initialEntries={['/facilities/management/f1']}>
        <Routes>
          <Route path="/facilities/management/:facilityId" element={<FacilitiesRoute><div>Facility workspace</div></FacilitiesRoute>} />
          <Route path="/employee" element={<div>Employee dashboard</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByText('Facility workspace')).not.toBeInTheDocument();
    expect(screen.getByText('Employee dashboard')).toBeInTheDocument();
  });
});
