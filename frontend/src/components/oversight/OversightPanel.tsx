import React, { useEffect, useMemo, useState } from 'react';
import { Eye, Loader2, ShieldCheck } from 'lucide-react';
import {
  listOversightTargets,
  OversightMode,
  OversightTarget,
  startOversightSession,
} from '../../api/oversightService';
import { extractErrorMessage } from '../../api/client';
import { getAssignedRoles, getDashboardPath, useAuthStore } from '../../stores/authStore';

export const OversightPanel: React.FC = () => {
  const actor = useAuthStore((state) => state.user);
  const mode: OversightMode = getAssignedRoles(actor).includes('COMPLIANCE_MANAGER') ? 'SHADOW' : 'IMPERSONATION';
  const [targets, setTargets] = useState<OversightTarget[]>([]);
  const [justification, setJustification] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOversightTargets()
      .then((items) => {
        setTargets(items);
      })
      .catch((err) => setError(extractErrorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const groupedTargets = useMemo(() => {
    const groups = new Map<string, OversightTarget[]>();
    for (const target of targets) {
      const department = target.department?.trim() || 'Other Departments';
      groups.set(department, [...(groups.get(department) || []), target]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [targets]);

  const start = async (targetUserId: string) => {
    if (justification.trim().length < 10 || starting) return;
    setStarting(true);
    setError(null);
    try {
      const session = await startOversightSession({
        targetUserId,
        mode,
        justification: justification.trim(),
        durationMinutes,
      });
      window.location.assign(getDashboardPath(session.targetUser));
    } catch (err) {
      setError(extractErrorMessage(err));
      setStarting(false);
    }
  };

  return (
    <div className="glass-panel p-5">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-2"><Eye className="h-5 w-5 text-amber-700" /></div>
        <div>
          <h2 className="text-base font-bold text-slate-900">{mode === 'IMPERSONATION' ? 'User Oversight' : 'Subordinate Shadow Mode'}</h2>
          <p className="text-xs text-slate-500">Short-lived, read-only, and immutably audited.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Loading eligible accounts...</div>
      ) : (
        <>
          <div className="mb-5 grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <label className="text-xs font-semibold text-slate-600">
              Audit justification
              <input value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Required audit justification" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-semibold text-slate-600">
              Session duration
              <select value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value={5}>5 min</option><option value={15}>15 min</option><option value={30}>30 min</option>
              </select>
            </label>
          </div>
          <div className="space-y-5">
            {groupedTargets.map(([department, departmentTargets]) => (
              <section key={department}>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">{department}</h3>
                  <span className="text-[10px] font-mono text-slate-400">{departmentTargets.length} account{departmentTargets.length === 1 ? '' : 's'}</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {departmentTargets.map((item) => (
                    <article key={item.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-600">{(item.fullName || item.email).charAt(0).toUpperCase()}</div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">{item.fullName || item.email}</p>
                          <p className="truncate text-xs text-slate-500">{item.email}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {(item.assignedRoles?.length ? item.assignedRoles : item.roles).map((role) => <span key={role} className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{role.replace(/_/g, ' ')}</span>)}
                            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${item.isOnline ? 'text-emerald-600' : 'text-slate-400'}`}><span className={`h-1.5 w-1.5 rounded-full ${item.isOnline ? 'animate-pulse bg-emerald-500' : 'bg-slate-300'}`} />{item.isOnline ? 'Online' : 'Offline'}</span>
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 min-h-8 text-[11px] text-slate-500">{item.lastActiveOperation || 'No recent operation recorded.'}{item.lastActiveOperationAt ? ` · ${new Date(item.lastActiveOperationAt).toLocaleString()}` : ''}</p>
                      <button onClick={() => start(item.id)} disabled={justification.trim().length < 10 || starting} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D02F34] px-3 py-2 text-xs font-bold text-white hover:bg-[#A9252A] disabled:cursor-not-allowed disabled:opacity-50">
                        {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}{mode === 'IMPERSONATION' ? 'Impersonate Session' : 'Audit Workspace'}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            ))}
            {!groupedTargets.length && <p className="py-6 text-center text-sm text-slate-500">No eligible accounts are available.</p>}
          </div>
        </>
      )}
      {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
    </div>
  );
};
