import React from 'react';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'purple';

const tones: Record<Tone, string> = {
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
  info: 'border-blue-200 bg-blue-50 text-blue-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-rose-200 bg-rose-50 text-rose-800',
  purple: 'border-violet-200 bg-violet-50 text-violet-800',
};

const success = new Set(['ACTIVE', 'AVAILABLE', 'APPROVED', 'COMPLETED', 'CONFIRMED', 'CLEAR', 'HEALTHY', 'ONLINE', 'SUCCESS', 'SENT', 'VAULTED', 'COUNSEL_APPROVED']);
const warning = new Set(['PENDING', 'PENDING_REVIEW', 'IN_REVIEW', 'EXPIRING', 'DUE_SOON', 'MAINTENANCE', 'AWAITING_MANAGER_SIGNOFF', 'PENDING_MANAGER_APPROVAL', 'PENDING_DEPARTMENT_HEAD', 'PENDING_COUNSEL_REVIEW', 'REVIEW_REQUIRED', 'MEDIUM']);
const danger = new Set(['INACTIVE', 'REJECTED', 'FAILED', 'ERROR', 'BLOCKED', 'LOCKED', 'EXPIRED', 'TERMINATED', 'CANCELLED', 'CRITICAL', 'HIGH', 'DENIED', 'OVERDUE']);
const info = new Set(['OPEN', 'IN_PROGRESS', 'CHECKED_IN', 'SCHEDULED', 'NEW', 'LOW', 'INFO']);

export function statusTone(value: unknown): Tone {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (success.has(normalized)) return 'success';
  if (warning.has(normalized)) return 'warning';
  if (danger.has(normalized)) return 'danger';
  if (info.has(normalized)) return 'info';
  if (normalized.includes('PURPLE')) return 'purple';
  return 'neutral';
}

export const formatStatusLabel = (value: unknown) => {
  const text = String(value ?? '').trim();
  if (!text) return 'Not provided';
  return text.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const DataTableStatusBadge: React.FC<{ value: unknown; tone?: Tone; className?: string }> = ({ value, tone, className = '' }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none ${tones[tone ?? statusTone(value)]} ${className}`}>
    <span className="sr-only">Status: </span>{formatStatusLabel(value)}
  </span>
);
