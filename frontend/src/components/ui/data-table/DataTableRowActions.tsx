import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import type { DataTableRowAction } from './types';

export function DataTableRowActions<T>({ row, actions, label = 'Open row actions' }: { row: T; actions: DataTableRowAction<T>[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const visible = actions.filter((action) => !action.hidden);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!containerRef.current?.contains(event.target as Node)) setOpen(false); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const items = Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
        if (!items.length) return;
        event.preventDefault();
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'ArrowDown' ? (current + 1) % items.length : (current <= 0 ? items.length - 1 : current - 1);
        items[next].focus();
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', keydown);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', keydown); };
  }, [open]);
  if (!visible.length) return null;
  return <div ref={containerRef} className="relative inline-flex" onClick={(event) => event.stopPropagation()}>
    <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></button>
    {open && <div role="menu" className="absolute right-0 top-10 z-40 min-w-44 rounded-xl border border-slate-200 bg-white p-1.5 text-left shadow-xl">
      {visible.map((action) => { const Icon = action.icon; return <button key={action.id} type="button" role="menuitem" disabled={action.disabled} onClick={() => { setOpen(false); void action.onSelect(row); }} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-45 ${action.destructive ? 'mt-1 border-t border-slate-100 text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-50'}`}>{Icon && <Icon className="h-4 w-4" aria-hidden="true" />}{action.label}</button>; })}
    </div>}
  </div>;
}
