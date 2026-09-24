import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Eye, EyeOff, Inbox, Loader2, X } from 'lucide-react';
import { DashboardHero } from './DashboardPrimitives';

const join = (...values: Array<string | undefined | false>) => values.filter(Boolean).join(' ');

export const PageContainer: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={join('space-y-6', className)} {...props} />
);

export const PageHeader: React.FC<{
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}> = ({ title, description, eyebrow, actions }) => (
  <DashboardHero title={title} subtitle={description || ''} eyebrow={eyebrow} actions={actions} />
);

export const Card: React.FC<React.HTMLAttributes<HTMLElement>> = ({ className, ...props }) => (
  <section className={join('rounded-card border border-[var(--hirna-border)] bg-[var(--hirna-surface)] shadow-card', className)} {...props} />
);

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'success' | 'ghost';
const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-700 focus:ring-brand-500/25',
  secondary: 'border border-[var(--hirna-border)] bg-white text-slate-700 hover:bg-[var(--hirna-surface-hover)] focus:ring-brand-500/20',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500/25',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500/25',
  ghost: 'text-slate-600 hover:bg-[var(--hirna-surface-hover)] focus:ring-brand-500/20',
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; busy?: boolean }> = ({
  className,
  variant = 'secondary',
  busy = false,
  disabled,
  children,
  ...props
}) => (
  <button
    type="button"
    className={join('inline-flex min-h-10 items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-55', buttonVariants[variant], className)}
    disabled={disabled || busy}
    {...props}
  >
    {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
    {children}
  </button>
);

type FieldShellProps = { label: string; required?: boolean; error?: string; hint?: string; descriptorId: string; children: React.ReactNode };
const FieldShell: React.FC<FieldShellProps> = ({ label, required, error, hint, descriptorId, children }) => (
  <label className="block space-y-1.5 text-sm font-semibold text-slate-700">
    <span>{label}{required && <span className="ml-1 text-rose-600" aria-hidden="true">*</span>}</span>
    {children}
    {error ? <span id={descriptorId} className="block text-xs font-medium text-rose-600">{error}</span> : hint ? <span id={descriptorId} className="block text-xs font-normal text-slate-500">{hint}</span> : null}
  </label>
);

const fieldClass = 'min-h-11 w-full rounded-control border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export const FormField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }> = ({ label, error, hint, required, className, ...props }) => {
  const descriptorId = useId();
  return <FieldShell label={label} required={required} error={error} hint={hint} descriptorId={descriptorId}>
    <input required={required} aria-invalid={Boolean(error)} aria-describedby={error || hint ? descriptorId : undefined} className={join(fieldClass, className)} {...props} />
  </FieldShell>;
};

export const PasswordField: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string }> = ({ label, error, hint, required, className, ...props }) => {
  const descriptorId = useId();
  const [visible, setVisible] = useState(false);
  return <FieldShell label={label} required={required} error={error} hint={hint} descriptorId={descriptorId}>
    <span className="relative block">
      <input
        required={required}
        type={visible ? 'text' : 'password'}
        aria-invalid={Boolean(error)}
        aria-describedby={error || hint ? descriptorId : undefined}
        className={join(fieldClass, 'pr-11', className)}
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-control text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500/25 disabled:text-slate-500"
        aria-label={visible ? 'Hide password' : 'Show password'}
        disabled={props.disabled}
      >
        {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
      </button>
    </span>
  </FieldShell>;
};

export const SelectField: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string }> = ({ label, error, hint, required, className, children, ...props }) => {
  const descriptorId = useId();
  return <FieldShell label={label} required={required} error={error} hint={hint} descriptorId={descriptorId}>
    <select required={required} aria-invalid={Boolean(error)} aria-describedby={error || hint ? descriptorId : undefined} className={join(fieldClass, className)} {...props}>{children}</select>
  </FieldShell>;
};

export const TextAreaField: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string }> = ({ label, error, hint, required, className, ...props }) => {
  const descriptorId = useId();
  return <FieldShell label={label} required={required} error={error} hint={hint} descriptorId={descriptorId}>
    <textarea required={required} aria-invalid={Boolean(error)} aria-describedby={error || hint ? descriptorId : undefined} className={join(fieldClass, 'min-h-28 resize-y', className)} {...props} />
  </FieldShell>;
};

export const ResponsiveTableContainer: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ className, ...props }) => (
  <div className={join('w-full overflow-x-auto rounded-card border border-[var(--hirna-border)] bg-white', className)} {...props} />
);

export const LoadingState: React.FC<{ label?: string; className?: string }> = ({ label = 'Loading...', className }) => (
  <div role="status" className={join('flex min-h-40 items-center justify-center gap-2 rounded-card border border-[var(--hirna-border)] bg-white p-8 text-sm text-slate-500', className)}>
    <Loader2 className="h-5 w-5 animate-spin text-brand-500" aria-hidden="true" />{label}
  </div>
);

export const EmptyState: React.FC<{ title?: string; description: string; action?: React.ReactNode; className?: string }> = ({ title = 'Nothing here yet', description, action, className }) => (
  <div className={join('flex min-h-40 flex-col items-center justify-center rounded-card border border-dashed border-slate-300 bg-white p-8 text-center', className)}>
    <Inbox className="mb-3 h-8 w-8 text-slate-300" aria-hidden="true" />
    <h3 className="text-sm font-bold text-slate-800">{title}</h3>
    <p className="mt-1 max-w-lg text-sm text-slate-500">{description}</p>
    {action && <div className="mt-4">{action}</div>}
  </div>
);

export const ErrorState: React.FC<{ title?: string; message: string; onRetry?: () => void; className?: string }> = ({ title = 'Unable to load this content', message, onRetry, className }) => (
  <div role="alert" className={join('flex min-h-40 flex-col items-center justify-center rounded-card border border-rose-200 bg-rose-50 p-8 text-center', className)}>
    <AlertCircle className="mb-3 h-8 w-8 text-rose-500" aria-hidden="true" />
    <h3 className="text-sm font-bold text-rose-900">{title}</h3>
    <p className="mt-1 max-w-lg text-sm text-rose-700">{message}</p>
    {onRetry && <Button className="mt-4" variant="danger" onClick={onRetry}>Try again</Button>}
  </div>
);

const statusTones = {
  neutral: 'border-slate-200 bg-slate-100 text-slate-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
};
export const StatusBadge: React.FC<{ children: React.ReactNode; tone?: keyof typeof statusTones; className?: string }> = ({ children, tone = 'neutral', className }) => (
  <span className={join('inline-flex rounded-full border px-2.5 py-1 text-[11px] font-bold', statusTones[tone], className)}>{children}</span>
);

type ModalProps = {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  closeDisabled?: boolean;
};

const modalSizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export const Modal: React.FC<ModalProps> = ({ open, title, description, onClose, children, footer, size = 'md', closeDisabled = false }) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.style.overflow = 'hidden';
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []);
    window.requestAnimationFrame(() => (focusable()[0] || dialogRef.current)?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) { event.preventDefault(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKeyDown); previouslyFocused?.focus(); };
  }, [open, onClose, closeDisabled]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={() => { if (!closeDisabled) onClose(); }}>
      <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} className={join('flex max-h-[min(90vh,56rem)] w-full flex-col overflow-hidden rounded-modal border border-[var(--hirna-border)] bg-white shadow-modal outline-none', modalSizes[size])} onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-[var(--hirna-border)] px-5 py-4 sm:px-6">
          <div className="min-w-0"><h2 id={titleId} className="font-heading text-lg font-bold text-slate-950">{title}</h2>{description && <p id={descriptionId} className="mt-1 text-sm text-slate-500">{description}</p>}</div>
          <button type="button" onClick={onClose} disabled={closeDisabled} aria-label="Close dialog" className="rounded-control p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-40"><X className="h-5 w-5" /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--hirna-border)] bg-[var(--hirna-surface-hover)] px-5 py-4 sm:px-6">{footer}</footer>}
      </div>
    </div>
  );
};

export const ConfirmDialog: React.FC<{
  open: boolean; title: string; description: string; confirmLabel?: string; tone?: 'primary' | 'danger' | 'success'; busy?: boolean; onClose: () => void; onConfirm: () => void | Promise<void>;
}> = ({ open, title, description, confirmLabel = 'Confirm', tone = 'primary', busy = false, onClose, onConfirm }) => (
  <Modal open={open} title={title} onClose={onClose} closeDisabled={busy} size="sm" footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant={tone} busy={busy} onClick={onConfirm}>{confirmLabel}</Button></>}>
    <p className="text-sm leading-6 text-slate-600">{description}</p>
  </Modal>
);

export const ReasonDialog: React.FC<{
  open: boolean; title: string; description?: string; label?: string; placeholder?: string; confirmLabel?: string; tone?: 'primary' | 'danger' | 'success'; required?: boolean; busy?: boolean; onClose: () => void; onConfirm: (reason: string) => void | Promise<void>;
}> = ({ open, title, description, label = 'Reason', placeholder = 'Enter a clear reason', confirmLabel = 'Confirm', tone = 'danger', required = true, busy = false, onClose, onConfirm }) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setReason(''); setError(''); } }, [open]);
  const submit = async () => {
    const value = reason.trim();
    if (required && !value) { setError('A reason is required.'); return; }
    try { await onConfirm(value); }
    catch { setError('The action could not be completed. Review the page error and try again.'); }
  };
  return (
    <Modal open={open} title={title} description={description} onClose={onClose} closeDisabled={busy} size="sm" footer={<><Button onClick={onClose} disabled={busy}>Cancel</Button><Button variant={tone} busy={busy} onClick={submit}>{confirmLabel}</Button></>}>
      <TextAreaField label={label} required={required} value={reason} onChange={(event) => { setReason(event.target.value); if (error) setError(''); }} error={error} placeholder={placeholder} autoFocus />
    </Modal>
  );
};
