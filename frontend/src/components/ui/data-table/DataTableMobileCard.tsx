import React from 'react';

export const DataTableMobileCard: React.FC<{
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  fields?: Array<{ label: string; value: React.ReactNode }>;
  actions?: React.ReactNode;
  onClick?: () => void;
}> = ({ title, subtitle, badge, fields = [], actions, onClick }) => {
  const interactive = Boolean(onClick);
  return <article onClick={onClick} onKeyDown={(event) => { if (interactive && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onClick?.(); } }} tabIndex={interactive ? 0 : undefined} className={`rounded-xl border border-[var(--hirna-border)] bg-white p-4 shadow-sm ${interactive ? 'cursor-pointer transition hover:border-red-200 hover:bg-[var(--hirna-surface-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500' : ''}`}>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-sm font-bold text-slate-900">{title || 'Not provided'}</h3>{subtitle && <div className="mt-1 text-xs text-slate-500">{subtitle}</div>}</div>{badge}</div>
    {fields.length > 0 && <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">{fields.map((field) => <div key={field.label} className="min-w-0"><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{field.label}</dt><dd className="mt-1 break-words text-xs text-slate-700">{field.value ?? '—'}</dd></div>)}</dl>}
    {actions && <div className="mt-4 flex justify-end border-t border-slate-100 pt-3">{actions}</div>}
  </article>;
};
