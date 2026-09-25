import type { AnalyticsQuery } from '../../api/analyticsService';

export type AnalyticsRangeKey = NonNullable<AnalyticsQuery['preset']>;

export const ANALYTICS_RANGE_OPTIONS: Array<{ value: AnalyticsRangeKey; label: string }> = [
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'previous_month', label: 'Previous Month' },
  { value: 'custom', label: 'Custom Range' },
];

export function buildAnalyticsQuery(range: AnalyticsRangeKey, from: string, to: string): AnalyticsQuery {
  return range === 'custom' ? { preset: range, from: from || undefined, to: to || undefined } : { preset: range };
}

export function validateAnalyticsRange(range: AnalyticsRangeKey, from: string, to: string): string | null {
  if (range !== 'custom') return null;
  if (!from || !to) return 'Choose both a start date and an end date.';
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Enter valid dates.';
  if (start > end) return 'Start date must be on or before end date.';
  const days = Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return days > 366 ? 'Custom ranges may not exceed 366 days.' : null;
}

export function formatManilaDateTime(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date(value));
}

export function formatManilaDate(value: string): string {
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric',
  }).format(new Date(value));
}

export function formatManilaInclusiveEnd(toExclusive: string): string {
  const end = new Date(toExclusive);
  return formatManilaDate(new Date(end.getTime() - 1).toISOString());
}
