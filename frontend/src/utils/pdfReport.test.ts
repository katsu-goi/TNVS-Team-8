import { describe, expect, it } from 'vitest';
import type { AnalyticsData, User } from '../types';
import { facilitiesAnalyticsPdfReport, systemAnalyticsPdfReport } from '../components/analytics/analyticsPdfReports';
import { reservationsPdfReport } from '../components/facilities-officer/reservationPdfReport';
import { buildPdfDocument, createPdfBlob, normalizePdfText, safePdfFileName, type PdfReportDefinition } from './pdfReport';

const user: User = {
  id: 'user-1',
  email: 'manager@example.test',
  fullName: 'Hirna Manager',
  assignedRoles: ['FACILITIES_MANAGER'],
};

const baseReport: PdfReportDefinition = {
  fileName: 'Hirna Sample Report.pdf',
  title: 'Sample Operational Report',
  reportType: 'Quality Verification Report',
  generatedAt: '2026-09-25T13:45:00Z',
  generatedBy: 'Hirna Manager',
  generatedByRole: 'Facilities Manager',
  periodLabel: 'Sep 1, 2026 - Sep 25, 2026',
  scopeLabel: 'Authorized test scope',
  summary: Array.from({ length: 8 }, (_, index) => ({ label: `Metric ${index + 1}`, value: index * 10 })),
  charts: [{
    title: 'Reservation Trend',
    kind: 'line',
    data: Array.from({ length: 12 }, (_, index) => ({ label: `Sep ${index + 1}`, value: index + 1 })),
  }],
  tables: [{
    title: 'Detailed Records',
    columns: [{ label: 'Record', weight: 2 }, { label: 'Status' }, { label: 'Value', align: 'right' }],
    rows: Array.from({ length: 55 }, (_, index) => [`Reservation ${index + 1}`, index % 2 ? 'APPROVED' : 'PENDING', index]),
  }],
};

const analytics: AnalyticsData = {
  scope: 'FACILITIES_MANAGER',
  timezone: 'Asia/Manila',
  generatedAt: '2026-09-25T13:45:00Z',
  period: { from: '2026-09-01T00:00:00+08:00', toExclusive: '2026-09-26T00:00:00+08:00' },
  filter: { preset: 'custom', semantics: 'from-inclusive/to-exclusive' },
  facilities: {
    submitted: 12,
    managerApproved: 8,
    rejected: 1,
    cancelled: 2,
    completed: 5,
    occupiedMinutes: 720,
    availableOperatingMinutes: 960,
    utilizationPercent: 75,
    maintenanceRestrictions: 1,
    dailySubmitted: [{ date: '2026-09-01', value: 3 }],
    frequentlyUsedFacilities: [{ facility: 'Head Office', reservations: 12, occupiedMinutes: 720 }],
  },
  operational: {
    failedEvents: 2,
    failedEventsTrend: { current: 2, previous: 1, kind: 'UP', percent: 100 },
    activeSessions: 4,
    automation: { successfulRuns: 10, failedRuns: 1, lastRunAt: '2026-09-25T13:00:00Z' },
    notificationDeliveryFailures: 0,
    realtimeMarkers: 3,
    blockedIps: 1,
    activeSecurityAlerts: 2,
    unreadNotifications: 5,
  },
  systemHealth: {
    checkedAt: '2026-09-25T13:40:00Z',
    overallStatus: 'LIVE',
    checks: [{ name: 'Edge Function API', status: 'LIVE', latencyMs: 24, detail: 'Authenticated handler responding' }],
  },
};

describe('structured PDF report generation', () => {
  it('creates a real application/pdf file with multiple report pages', () => {
    const document = buildPdfDocument(baseReport);
    const bytes = new Uint8Array(document.output('arraybuffer'));
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toMatch(/^%PDF-/);
    expect(document.getNumberOfPages()).toBeGreaterThan(1);
    const blob = createPdfBlob(baseReport);
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(2_000);
  });

  it('normalizes unsafe typography and produces stable PDF filenames', () => {
    expect(normalizePdfText('Sep 1–25 · “Report”')).toBe('Sep 1-25 | "Report"');
    expect(safePdfFileName('Hirna Facility Report 2026/09.pdf')).toBe('hirna-facility-report-2026-09.pdf');
  });

  it('builds the facilities analytics document from authorized response data', () => {
    const report = facilitiesAnalyticsPdfReport('Hub Performance Analytics', analytics, user);
    expect(report.fileName).toBe('hirna-facilities-analytics-2026-09-01-to-2026-09-25.pdf');
    expect(report.summary?.find((metric) => metric.label === 'Total reservations')?.value).toBe(12);
    expect(report.tables?.[0].rows[0]).toContain('Head Office');
  });

  it('builds the restricted system report without employee-business rows', () => {
    const report = systemAnalyticsPdfReport(analytics, { ...user, assignedRoles: ['SYSTEM_ADMIN'] });
    expect(report.classification).toBe('RESTRICTED');
    expect(report.generatedByRole).toBe('System Administrator');
    expect(report.tables?.[0].rows[0]).toContain('Edge Function API');
  });

  it('builds a reservation operations report from the current officer collection', () => {
    const report = reservationsPdfReport([{
      reservationId: 'RES-001', title: 'Operations Review', facilityName: 'Room 201', requesterName: 'Maria Dela Cruz',
      reservationDate: '2026-09-25', startTime: '13:00', endTime: '14:00', status: 'APPROVED', expectedAttendees: 8, priorityLevel: 'MEDIUM',
    }], { ...user, assignedRoles: ['FACILITIES_OFFICER'] }, '2026-09-25T13:45:00Z');
    expect(report.fileName).toBe('hirna-reservations-report-2026-09.pdf');
    expect(report.summary?.find((metric) => metric.label === 'Total reservations')?.value).toBe(1);
    expect(report.tables?.[0].rows[0]).toContain('RES-001');
  });
});
