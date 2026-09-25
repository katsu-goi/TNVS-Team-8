import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AnalyticsPageHeader,
} from './AnalyticsPrimitives';
import { ANALYTICS_RANGE_OPTIONS, buildAnalyticsQuery, printAnalyticsReport, validateAnalyticsRange } from './analyticsUtils';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('analytics UI primitives', () => {
  it('offers every supported server date preset and builds the matching query', () => {
    expect(ANALYTICS_RANGE_OPTIONS.map((option) => option.value)).toEqual([
      'today', 'last_7_days', 'last_30_days', 'this_month', 'previous_month', 'custom',
    ]);
    expect(buildAnalyticsQuery('last_7_days', '', '')).toEqual({ preset: 'last_7_days' });
    expect(buildAnalyticsQuery('custom', '2026-09-01', '2026-09-25')).toEqual({ preset: 'custom', from: '2026-09-01', to: '2026-09-25' });
  });

  it('rejects incomplete, reversed, and over-limit custom ranges', () => {
    expect(validateAnalyticsRange('custom', '', '')).toMatch(/both/i);
    expect(validateAnalyticsRange('custom', '2026-09-25', '2026-09-01')).toMatch(/on or before/i);
    expect(validateAnalyticsRange('custom', '2025-01-01', '2026-09-25')).toMatch(/366/i);
    expect(validateAnalyticsRange('custom', '2026-09-01', '2026-09-25')).toBeNull();
    expect(validateAnalyticsRange('today', '', '')).toBeNull();
  });

  it('renders the shared dark page header and preserves analytics actions', () => {
    const onRangeChange = vi.fn();
    const onRefresh = vi.fn();
    const onExportCsv = vi.fn();
    const onExportPdf = vi.fn();
    render(<AnalyticsPageHeader title="Hub Performance Analytics" subtitle="Authorized facility data" range="last_30_days" customFrom="" customTo="" validationError={null} loading={false} exportingCsv={false} onRangeChange={onRangeChange} onCustomFromChange={() => undefined} onCustomToChange={() => undefined} onRefresh={onRefresh} onExportCsv={onExportCsv} onExportPdf={onExportPdf} />);

    expect(screen.getByTestId('portal-page-header')).toHaveClass('dashboard-hero');
    fireEvent.change(screen.getByLabelText('Analytics date range'), { target: { value: 'last_7_days' } });
    fireEvent.click(screen.getByRole('button', { name: 'Refresh analytics' }));
    fireEvent.click(screen.getByRole('button', { name: 'PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(onRangeChange).toHaveBeenCalledWith('last_7_days');
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onExportPdf).toHaveBeenCalledOnce();
    expect(onExportCsv).toHaveBeenCalledOnce();
  });

  it('uses structured browser printing for the PDF report', () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    const original = document.title;
    printAnalyticsReport('System Operational Analytics');
    expect(document.title).toBe('System Operational Analytics - Hirna Portal');
    expect(print).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event('afterprint'));
    expect(document.title).toBe(original);
  });
});
