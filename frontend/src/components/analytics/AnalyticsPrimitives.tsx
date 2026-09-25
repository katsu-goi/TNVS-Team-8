import React from 'react';
import { Download, FileText, Loader2, RefreshCw } from 'lucide-react';
import { DashboardHero, DashboardMetricCard } from '../ui/DashboardPrimitives';
import { ANALYTICS_RANGE_OPTIONS, formatManilaDate, formatManilaDateTime, formatManilaInclusiveEnd, type AnalyticsRangeKey } from './analyticsUtils';

type HeaderProps = {
  title: string;
  subtitle: string;
  range: AnalyticsRangeKey;
  customFrom: string;
  customTo: string;
  validationError: string | null;
  loading: boolean;
  exportingCsv: boolean;
  onRangeChange: (value: AnalyticsRangeKey) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  onRefresh: () => void;
  onExportCsv: () => void;
  onExportPdf: () => void;
};

export const AnalyticsPageHeader: React.FC<HeaderProps> = ({
  title, subtitle, range, customFrom, customTo, validationError, loading, exportingCsv,
  onRangeChange, onCustomFromChange, onCustomToChange, onRefresh, onExportCsv, onExportPdf,
}) => {
  const disabled = Boolean(validationError);
  return (
    <>
      <DashboardHero eyebrow="Analytics & Reporting" title={title} subtitle={subtitle} actions={
        <div className="flex max-w-full flex-wrap items-end justify-end gap-2 print:hidden">
          <label className="text-[11px] font-semibold text-slate-200">
            <span className="sr-only">Date range</span>
            <select aria-label="Analytics date range" value={range} onChange={(event) => onRangeChange(event.target.value as AnalyticsRangeKey)} className="portal-header-field min-h-10 rounded-xl px-3 py-2 text-xs font-semibold">
              {ANALYTICS_RANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {range === 'custom' && <>
            <label className="text-[11px] font-semibold text-slate-200">Start <input aria-label="Start date" type="date" value={customFrom} onChange={(event) => onCustomFromChange(event.target.value)} className="portal-header-field ml-1 min-h-10 rounded-xl px-2 py-1.5 text-xs" /></label>
            <label className="text-[11px] font-semibold text-slate-200">End <input aria-label="End date" type="date" min={customFrom || undefined} value={customTo} onChange={(event) => onCustomToChange(event.target.value)} className="portal-header-field ml-1 min-h-10 rounded-xl px-2 py-1.5 text-xs" /></label>
          </>}
          <button type="button" onClick={onRefresh} disabled={disabled || loading} className="portal-header-action min-h-10 rounded-xl p-2.5" aria-label="Refresh analytics"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button type="button" onClick={onExportPdf} disabled={disabled} className="portal-header-action inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold"><FileText className="h-4 w-4" />PDF</button>
          <button type="button" onClick={onExportCsv} disabled={disabled || exportingCsv} className="portal-header-primary inline-flex min-h-10 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold">{exportingCsv ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}CSV</button>
        </div>
      } />
      {validationError && <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700">{validationError}</p>}
    </>
  );
};

export const AnalyticsMetricCard = DashboardMetricCard;

export const AnalyticsChartCard: React.FC<{ title: string; description: string; children: React.ReactNode; footer?: React.ReactNode }> = ({ title, description, children, footer }) => (
  <section className="analytics-chart-card card-stat p-5">
    <header className="mb-4"><h2 className="font-heading text-base font-bold text-slate-950">{title}</h2><p className="mt-1 text-xs text-slate-500">{description}</p></header>
    {children}
    {footer && <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500">{footer}</div>}
  </section>
);

export const AnalyticsPrintMeta: React.FC<{ title: string; role: string; from: string; toExclusive: string; generatedAt: string }> = ({ title, role, from, toExclusive, generatedAt }) => (
  <section className="analytics-print-meta" aria-hidden="true">
    <div><strong>HIRNA PORTAL</strong><span>TNVS Facilities & Administrative Management System</span></div>
    <h1>{title}</h1>
    <dl><div><dt>Role / module</dt><dd>{role}</dd></div><div><dt>Selected period</dt><dd>{formatManilaDate(from)} – {formatManilaInclusiveEnd(toExclusive)}</dd></div><div><dt>Generated</dt><dd>{formatManilaDateTime(generatedAt)} · Asia/Manila</dd></div></dl>
  </section>
);
