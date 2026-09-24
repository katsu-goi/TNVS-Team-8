import React from 'react';
import { ChevronRight } from 'lucide-react';

type DashboardHeroProps = {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
};

export const DashboardHero: React.FC<DashboardHeroProps> = ({ title, subtitle, actions }) => (
  <section className="dashboard-hero">
    <div className="min-w-0">
      <h1 className="font-heading text-[34px] font-extrabold leading-tight">{title}</h1>
      <p className="mt-1 text-sm">{subtitle}</p>
    </div>
    {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
  </section>
);

type DashboardMetricCardProps = {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
  sub?: string;
  onClick?: () => void;
  pulse?: boolean;
};

export const DashboardMetricCard: React.FC<DashboardMetricCardProps> = ({
  label,
  value,
  icon: Icon,
  color = 'text-slate-400',
  sub,
  onClick,
  pulse,
}) => (
  <button type="button" onClick={onClick} disabled={!onClick} className="card-stat dashboard-metric-card group w-full text-left transition-all disabled:cursor-default">
    <div className="mb-3 flex items-center justify-between gap-3">
      <p className="flex min-w-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 transition-colors group-enabled:group-hover:text-brand-700">
        <span className="truncate">{label}</span>
        {pulse && (
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
        )}
      </p>
      <span className="dashboard-metric-icon shrink-0">
        <Icon className={`h-4 w-4 ${color} transition-transform group-enabled:group-hover:scale-110`} />
      </span>
    </div>
    <div className="flex items-end justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-2xl font-bold text-slate-950">{value}</p>
        {sub && <p className="mt-1 truncate font-mono text-[10px] text-slate-500">{sub}</p>}
      </div>
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />}
    </div>
  </button>
);
