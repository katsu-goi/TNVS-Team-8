import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportAnalyticsCsv, fetchAnalytics } from '../../api/analyticsService';
import { useAuthStore } from '../../stores/authStore';
import type { AnalyticsData } from '../../types';
import { EnterpriseAnalyticsPage } from './EnterpriseAnalyticsDashboard';
import { AnalyticsPage } from './AnalyticsDashboard';

vi.mock('../../api/analyticsService', () => ({ fetchAnalytics: vi.fn(), exportAnalyticsCsv: vi.fn() }));
vi.mock('../../utils/pdfReport', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/pdfReport')>();
  return { ...actual, downloadPdfReport: vi.fn() };
});

const section = {
  currentState: {},
  selectedPeriod: {},
};

const enterpriseResponse: AnalyticsData = {
  scope: 'SUPER_ADMIN',
  timezone: 'Asia/Manila',
  generatedAt: '2026-09-26T04:00:00Z',
  period: { from: '2026-08-28T16:00:00Z', toExclusive: '2026-09-27T16:00:00Z' },
  filter: { preset: 'last_30_days', semantics: 'from-inclusive/to-exclusive' },
  enterprise: {
    overview: {
      currentState: { activeUsers: 42, openRequests: 3, facilities: 5, documents: 18, activeContracts: 4, openLegalMatters: 2, openComplianceIssues: 1 },
      selectedPeriod: { recordedActivity: 91, auditEvents: 50, visitors: 12, documentsUploaded: 7 },
      moduleActivity: [{ module: 'Facilities', count: 9, basis: 'Reservations and maintenance records created' }],
    },
    facilities: { ...section, currentState: { totalFacilities: 5 }, selectedPeriod: { reservations: 9 }, reservationTrend: [], reservationStatusDistribution: {} },
    visitors: { ...section, currentState: { currentlyCheckedIn: 2 }, selectedPeriod: { registeredVisitors: 12, expectedVisitors: 8, checkedInVisitors: 6, completedVisits: 4, cancelledOrRejected: 1 }, visitorTrend: [], statusDistribution: {} },
    documents: { ...section, currentState: { totalDocuments: 18 }, selectedPeriod: { uploadedDocuments: 7 }, uploadTrend: [], classificationDistribution: {} },
    recordsCompliance: { ...section, currentState: { totalManagedRecords: 18 }, selectedPeriod: { complianceItems: 2 }, complianceTrend: [], recordsByStatus: {} },
    legal: { ...section, currentState: { openLegalMatters: 2 }, selectedPeriod: { newLegalMatters: 1 }, statusDistribution: {}, categoryDistribution: {} },
    contracts: { ...section, currentState: { activeContracts: 4 }, selectedPeriod: { newContracts: 1 }, statusDistribution: {}, typeDistribution: {} },
    usersGovernance: { ...section, currentState: { totalUsers: 50, activeUsers: 42 }, selectedPeriod: { auditEvents: 50 }, usersByRole: [], auditByModule: [], actionsByAdministrator: [], auditTrend: [] },
  },
};

describe('Super Administrator enterprise analytics', () => {
  beforeEach(() => {
    vi.mocked(fetchAnalytics).mockResolvedValue(enterpriseResponse);
    vi.mocked(exportAnalyticsCsv).mockResolvedValue();
    act(() => useAuthStore.setState({ user: { id: 'super-1', email: 'super@example.test', fullName: 'Super Admin', assignedRoles: ['SUPER_ADMIN'] } }));
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    act(() => useAuthStore.setState({ user: null }));
  });

  it('renders the enterprise header and all eight accessible tabs from authorized aggregate data', async () => {
    render(<EnterpriseAnalyticsPage />);
    expect(await screen.findByRole('heading', { name: 'Enterprise Analytics & Governance' })).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    for (const label of ['Overview', 'Facilities', 'Visitors', 'Documents', 'Records & Compliance', 'Legal', 'Contracts', 'Users & Governance']) {
      expect(screen.getByRole('tab', { name: label })).toBeInTheDocument();
    }
    fireEvent.click(screen.getByRole('tab', { name: 'Visitors' }));
    expect(screen.getByRole('heading', { name: 'Visitors' })).toBeInTheDocument();
    expect(screen.getByText('Currently Checked In')).toBeInTheDocument();
    expect(screen.getByText('Registered Visitors')).toBeInTheDocument();
  });

  it('refetches the same authorized aggregate when the shared date range changes', async () => {
    render(<EnterpriseAnalyticsPage />);
    await screen.findByRole('heading', { name: 'Enterprise Analytics & Governance' });
    fireEvent.change(screen.getByLabelText('Analytics date range'), { target: { value: 'last_7_days' } });
    await waitFor(() => expect(fetchAnalytics).toHaveBeenLastCalledWith({ preset: 'last_7_days' }));
  });

  it('exports CSV with the active authorized date query', async () => {
    render(<EnterpriseAnalyticsPage />);
    await screen.findByRole('heading', { name: 'Enterprise Analytics & Governance' });
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(exportAnalyticsCsv).toHaveBeenCalledWith({ preset: 'last_30_days' }));
  });

  it('shows a retryable error without substituting mock analytics', async () => {
    vi.mocked(fetchAnalytics).mockRejectedValueOnce(new Error('Authorized aggregate unavailable'));
    render(<EnterpriseAnalyticsPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Authorized aggregate unavailable');
    expect(screen.queryByText('Enterprise Module Activity')).not.toBeInTheDocument();
  });

  it('shows an explicit loading state while the authorized aggregate is pending', () => {
    vi.mocked(fetchAnalytics).mockImplementationOnce(() => new Promise(() => undefined));
    render(<EnterpriseAnalyticsPage />);
    expect(screen.getByText('Loading enterprise analytics...')).toBeInTheDocument();
  });

  it('keeps Super Admin and System Admin analytics experiences separate', async () => {
    const { unmount } = render(<AnalyticsPage />);
    expect(await screen.findByRole('heading', { name: 'Enterprise Analytics & Governance' })).toBeInTheDocument();
    unmount();

    act(() => useAuthStore.setState({ user: { id: 'system-1', email: 'system@example.test', assignedRoles: ['SYSTEM_ADMIN'] } }));
    vi.mocked(fetchAnalytics).mockResolvedValueOnce({
      ...enterpriseResponse,
      scope: 'SYSTEM_ADMIN',
      enterprise: undefined,
      operational: { failedEvents: 0, failedEventsTrend: { current: 0, previous: 0, kind: 'FLAT', percent: 0 }, activeSessions: 1, automation: { successfulRuns: 1, failedRuns: 0, lastRunAt: null }, notificationDeliveryFailures: 0, realtimeMarkers: 0, blockedIps: 0, activeSecurityAlerts: 0, unreadNotifications: 0 },
      systemHealth: { checkedAt: '2026-09-26T04:00:00Z', overallStatus: 'LIVE', checks: [] },
    });
    render(<AnalyticsPage />);
    expect(await screen.findByRole('heading', { name: 'System Operational Analytics' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enterprise Analytics & Governance' })).not.toBeInTheDocument();
  });
});
