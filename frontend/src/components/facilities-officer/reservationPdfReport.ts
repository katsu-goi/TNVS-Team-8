import type { User } from '../../types';
import type { PdfReportDefinition } from '../../utils/pdfReport';

export type ReservationPdfRow = {
  reservationId: string;
  title: string;
  facilityName: string;
  requesterName: string;
  reservationDate: string;
  startTime: string;
  endTime: string;
  status: string;
  expectedAttendees: number;
  priorityLevel: string;
};

function actorName(user: User | null): string {
  return user?.fullName || [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'Authenticated facilities officer';
}

function displayDate(value: string): string {
  const date = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(date.getTime())) return value || 'Not provided';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
  }).format(date);
}

export function reservationsPdfReport(rows: ReservationPdfRow[], user: User | null, generatedAt = new Date().toISOString()): PdfReportDefinition {
  const dates = rows.map((row) => row.reservationDate).filter(Boolean).sort();
  const firstDate = dates[0] ?? generatedAt.slice(0, 10);
  const lastDate = dates[dates.length - 1] ?? firstDate;
  const firstMonth = firstDate.slice(0, 7);
  const lastMonth = lastDate.slice(0, 7);
  const filePeriod = firstMonth === lastMonth ? firstMonth : `${firstDate}-to-${lastDate}`;
  const statusCounts = new Map<string, number>();
  const facilityCounts = new Map<string, number>();
  rows.forEach((row) => {
    statusCounts.set(row.status, (statusCounts.get(row.status) ?? 0) + 1);
    facilityCounts.set(row.facilityName || 'Not assigned', (facilityCounts.get(row.facilityName || 'Not assigned') ?? 0) + 1);
  });
  const count = (status: string) => statusCounts.get(status) ?? 0;
  const approved = count('APPROVED') + count('CONFIRMED') + count('COMPLETED');
  const pending = count('PENDING') + count('PENDING_MANAGER_APPROVAL') + count('ESCALATED');

  return {
    fileName: `hirna-reservations-report-${filePeriod}.pdf`,
    title: 'Facilities Reservation Report',
    reportType: 'Reservation Operations Report',
    generatedAt,
    generatedBy: actorName(user),
    generatedByRole: 'Facilities Officer',
    periodLabel: `${displayDate(firstDate)} - ${displayDate(lastDate)}`,
    scopeLabel: 'Facilities Officer authorized reservation collection',
    classification: 'INTERNAL',
    summary: [
      { label: 'Total reservations', value: rows.length },
      { label: 'Approved / completed', value: approved },
      { label: 'Pending review', value: pending },
      { label: 'Rejected', value: count('REJECTED') },
      { label: 'Cancelled', value: count('CANCELLED') },
      { label: 'Expected attendees', value: rows.reduce((sum, row) => sum + (Number.isFinite(row.expectedAttendees) ? row.expectedAttendees : 0), 0) },
    ],
    charts: [
      {
        title: 'Reservation Status Distribution',
        description: 'Workflow status totals in the currently authorized reservation collection.',
        kind: 'bar',
        data: [...statusCounts.entries()].map(([label, value]) => ({ label: label.replaceAll('_', ' '), value })),
        color: [168, 18, 29],
      },
      {
        title: 'Reservations by Facility',
        description: 'Reservation volume by room, space, or facility.',
        kind: 'bar',
        data: [...facilityCounts.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value })),
        color: [226, 75, 91],
      },
    ],
    tables: [{
      title: 'Detailed Reservation Records',
      description: 'Live authorized reservation records available to the current Facilities Officer.',
      columns: [
        { label: 'Reservation', weight: 1.2 },
        { label: 'Title / Requester', weight: 2.2 },
        { label: 'Facility', weight: 1.5 },
        { label: 'Schedule', weight: 1.4 },
        { label: 'Status', weight: 1.1 },
        { label: 'Attendees', align: 'right' },
      ],
      rows: rows.map((row) => [
        row.reservationId,
        `${row.title} | ${row.requesterName}`,
        row.facilityName,
        `${displayDate(row.reservationDate)} ${row.startTime || '-'}-${row.endTime || '-'}`,
        row.status.replaceAll('_', ' '),
        row.expectedAttendees,
      ]),
    }],
    notes: [
      'This report uses the same server-authorized reservation collection displayed to the current Facilities Officer.',
      'No organization-wide reservation fetch or browser-only authorization filter is performed.',
      'All dates and times are presented in Asia/Manila.',
    ],
  };
}
