import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AxiosError } from 'axios';
import { fetchAnalytics } from '../../api/analyticsService';
import { securityService } from '../../api/securityService';
import { dashboardErrorMessage, loadDashboardAnalytics } from '../../api/dashboardData';
import { systemAnalyticsPdfReport } from '../analytics/analyticsPdfReports';
import { SysAdminDashboard } from './SysAdminDashboard';
import { AnalyticsPage } from './AnalyticsDashboard';
import type { AnalyticsData } from '../../types';

vi.mock('../../api/analyticsService', () => ({ fetchAnalytics: vi.fn() }));
vi.mock('../../api/securityService', () => ({ securityService: { getMetrics: vi.fn(), getLogs: vi.fn(async () => []) } }));
vi.mock('../../api/adminService', () => ({ loadBackups: vi.fn(async () => []) }));
vi.mock('../../api/notificationService', () => ({ notificationService: { getNotifications: vi.fn(async () => []) } }));
vi.mock('../../stores/authStore', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { assignedRoles: ['SUPER_ADMIN'] } }),
  isActorSuperAdmin: () => true,
}));
vi.mock('../../stores/realtimeSyncStore', () => ({ useRealtimeSyncStore: () => 0 }));
vi.mock('./useLiveActivities', () => ({ useLiveActivities: () => ({ activities: [], onlineCount: 0, peakToday: 0 }) }));
vi.mock('./SubsystemHealthGrid', () => ({ SubsystemHealthGrid: () => null }));
vi.mock('../oversight', () => ({ OversightPanel: () => null }));
vi.mock('../ui/PortalLoadingOverlay', () => ({ PortalLoadingOverlay: () => <p>Loading</p> }));

function enterprise(): AnalyticsData {
  return {
    scope: 'SUPER_ADMIN', timezone: 'Asia/Manila', generatedAt: '2026-09-26T00:00:00Z',
    period: { from: '2026-09-25T16:00:00Z', toExclusive: '2026-09-26T16:00:00Z' },
    filter: { preset: 'today', semantics: 'from-inclusive/to-exclusive' },
    enterprise: { overview: {
      currentState: { activeUsers: 16, facilities: 4, documents: 16, activeContracts: 2, openRequests: 1, openLegalMatters: 3, openComplianceIssues: 3 },
      selectedPeriod: { recordedActivity: 0, auditEvents: 0, visitors: 0, documentsUploaded: 0 },
    } },
  };
}

beforeEach(() => {
  vi.mocked(fetchAnalytics).mockReset().mockResolvedValue(enterprise());
  vi.mocked(securityService.getMetrics).mockReset().mockResolvedValue({
    activeSessions: 3, failedLoginAttempts: 0, blockedIpsCount: 0, activeAlertsCount: 1,
    ddosBlockedRequests: 0, suspiciousActivitiesCount: 0,
  });
});
afterEach(cleanup);

describe('Super Admin dashboard response contract', () => {
  it('renders enterprise data without requiring an operational field', async () => {
    render(<MemoryRouter><SysAdminDashboard /></MemoryRouter>);
    expect(await screen.findByText('Enterprise Analytics')).toBeInTheDocument();
    expect(screen.getByText('Facilities').nextElementSibling).toHaveTextContent('4');
    expect(screen.getByText('Active Accounts').nextElementSibling).toHaveTextContent('16');
    expect(screen.queryByText('Database Connection Error')).not.toBeInTheDocument();
    expect(securityService.getMetrics).toHaveBeenCalledOnce();
  });

  it('renders a valid empty dataset as zero', async () => {
    const response = enterprise();
    const overview = response.enterprise!.overview;
    for (const key of Object.keys(overview.currentState) as Array<keyof typeof overview.currentState>) overview.currentState[key] = 0;
    vi.mocked(fetchAnalytics).mockResolvedValue(response);
    render(<MemoryRouter><SysAdminDashboard /></MemoryRouter>);
    await screen.findByText('Enterprise Analytics');
    expect(screen.getByText('Facilities').nextElementSibling).toHaveTextContent('0');
    expect(screen.getByText('Registered Visitors').nextElementSibling).toHaveTextContent('0');
    expect(screen.queryByText('Dashboard unavailable')).not.toBeInTheDocument();
  });

  it('reports a failed refresh while retaining the last successful values', async () => {
    render(<MemoryRouter><SysAdminDashboard /></MemoryRouter>);
    await screen.findByText('Enterprise Analytics');
    vi.mocked(fetchAnalytics).mockRejectedValue(new AxiosError('Network Error'));
    fireEvent.click(screen.getByTitle('Refresh from database'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server.');
    expect(screen.getByText('Facilities').nextElementSibling).toHaveTextContent('4');
  });

  it('rejects an absent enterprise payload rather than manufacturing zero metrics', async () => {
    vi.mocked(fetchAnalytics).mockResolvedValue({ ...enterprise(), enterprise: undefined });
    await expect(loadDashboardAnalytics(true)).rejects.toThrow('Invalid enterprise');
  });

  it('preserves the System Admin operational contract without requesting security privileges', async () => {
    vi.mocked(fetchAnalytics).mockResolvedValue({ ...enterprise(), scope: 'SYSTEM_ADMIN', enterprise: undefined,
      operational: { activeSessions: 7, failedEvents: 2, blockedIps: 1, activeSecurityAlerts: 3 } as AnalyticsData['operational'],
    });
    const data = await loadDashboardAnalytics(false);
    expect(data.security.activeSessions).toBe(7);
    expect(data.overview).toBeNull();
    expect(securityService.getMetrics).not.toHaveBeenCalled();
  });

  it('exports enterprise PDF metrics instead of operational zero placeholders', () => {
    const report = systemAnalyticsPdfReport(enterprise(), null);
    expect(report.reportType).toBe('ENTERPRISE_ANALYTICS_GOVERNANCE');
    expect(report.summary).toContainEqual({ label: 'Facilities', value: 4, detail: 'Current state' });
  });

  it('renders enterprise analytics on the reporting page without operational placeholders', async () => {
    render(<AnalyticsPage />);
    expect(await screen.findByText('Active Accounts')).toBeInTheDocument();
    expect(screen.queryByLabelText('Operational KPI summary')).not.toBeInTheDocument();
    expect(screen.getByText('Facilities').nextElementSibling).toHaveTextContent('4');
  });

  it.each([
    [401, 'Your session could not be verified.'],
    [403, 'You do not have permission to access this resource.'],
    [500, 'Unable to retrieve dashboard data.'],
  ])('classifies HTTP %s without exposing internal error details', (status, expected) => {
    expect(dashboardErrorMessage({ isAxiosError: true, response: { status, data: { message: 'internal details' } } })).toBe(expected);
  });

  it('shows a query failure and allows retry', async () => {
    vi.mocked(fetchAnalytics).mockRejectedValueOnce(new Error('query details'));
    render(<MemoryRouter><SysAdminDashboard /></MemoryRouter>);
    expect(await screen.findByText('Unable to retrieve dashboard data.')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => expect(screen.getByText('Enterprise Analytics')).toBeInTheDocument());
  });
});
