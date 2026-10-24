import React, { useEffect, useRef } from 'react';
import { AlertCircle, CheckCircle2, Clock3, Info, ShieldX, X } from 'lucide-react';
import type { QrResultFeedback } from './qrScannerFeedback';

const presentation = {
  SUCCESS: { Icon: CheckCircle2, icon: 'bg-emerald-100 text-emerald-700', button: 'bg-emerald-700 hover:bg-emerald-800' },
  NOT_YET_VALID: { Icon: Clock3, icon: 'bg-amber-100 text-amber-700', button: 'bg-amber-700 hover:bg-amber-800' },
  EXPIRED: { Icon: Clock3, icon: 'bg-rose-100 text-rose-700', button: 'bg-rose-700 hover:bg-rose-800' },
  INVALID: { Icon: AlertCircle, icon: 'bg-rose-100 text-rose-700', button: 'bg-rose-700 hover:bg-rose-800' },
  ACCESS_DENIED: { Icon: ShieldX, icon: 'bg-rose-100 text-rose-700', button: 'bg-rose-700 hover:bg-rose-800' },
  ALREADY_PROCESSED: { Icon: Info, icon: 'bg-blue-100 text-blue-700', button: 'bg-blue-700 hover:bg-blue-800' },
  UNAVAILABLE: { Icon: AlertCircle, icon: 'bg-amber-100 text-amber-700', button: 'bg-amber-700 hover:bg-amber-800' },
} as const;

export const QrScannerResultModal: React.FC<{
  feedback: QrResultFeedback;
  onScanAgain: () => void;
}> = ({ feedback, onScanAgain }) => {
  const actionRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    actionRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onScanAgain();
      } else if (event.key === 'Tab') {
        const focusable = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [onScanAgain]);

  const { Icon, icon, button } = presentation[feedback.kind];
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" role="presentation">
      <section
        ref={modalRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="qr-result-title"
        aria-describedby="qr-result-message"
        className="relative w-full max-w-md rounded-3xl border border-white/70 bg-white p-6 text-center shadow-2xl motion-safe:animate-[qr-result-enter_180ms_ease-out] sm:p-8"
      >
        <button type="button" onClick={onScanAgain} aria-label="Close result and scan again" className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-red-700">
          <X className="h-5 w-5" />
        </button>
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${icon}`}><Icon className="h-9 w-9" aria-hidden="true" /></div>
        <h2 id="qr-result-title" className="mt-5 text-xl font-extrabold text-slate-950">{feedback.title}</h2>
        <p id="qr-result-message" className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-600">{feedback.message}</p>
        <button ref={actionRef} type="button" onClick={onScanAgain} className={`mt-7 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-bold text-white shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 ${button}`}>
          Scan Again
        </button>
      </section>
    </div>
  );
};
