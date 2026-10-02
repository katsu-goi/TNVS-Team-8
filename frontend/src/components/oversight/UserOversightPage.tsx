import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock3, Eye, Search, ShieldCheck, UserCheck, UserRound, Users,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  getCurrentOversightSession,
  getOversightSummary,
  listOversightTargets,
  OversightSession,
  OversightSummary,
  OversightTarget,
  startOversightSession,
} from '../../api/oversightService';
import { extractErrorMessage } from '../../api/client';
import { getDashboardPath } from '../../stores/authStore';
import {
  Button, Card, EmptyState, ErrorState, LoadingState, Modal, PageHeader, SelectField,
  StatusBadge, TextAreaField,
} from '../ui/SharedUI';
import { formatRoleLabel } from '../ui/UserProfileMenu';

type DurationValue = '5' | '10' | '15' | 'manual';
type StatusFilter = 'ALL' | 'ONLINE' | 'OFFLINE';

const EMPTY_SUMMARY: OversightSummary = {
  totalUsers: 0,
  activeUsers: 0,
  offlineUsers: 0,
  activeOversightSessions: 0,
};

function rolesFor(target: OversightTarget): string[] {
  return target.assignedRoles?.length ? target.assignedRoles : target.roles;
}

function primaryRole(target: OversightTarget): string {
  return rolesFor(target)[0] || 'EMPLOYEE';
}

function displayName(target: OversightTarget): string {
  return target.fullName?.trim() || [target.firstName, target.lastName].filter(Boolean).join(' ') || target.email;
}

function formatActivity(value?: string | null): string {
  if (!value) return 'No recent activity recorded';
  return new Intl.DateTimeFormat('en-PH', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila',
  }).format(new Date(value));
}

const SummaryCard: React.FC<{
  label: string; value: number; icon: React.ElementType; tone: string;
}> = ({ label, value, icon: Icon, tone }) => (
  <Card className="flex items-center justify-between p-4">
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-extrabold text-slate-950">{value}</p>
    </div>
    <span className={`rounded-xl p-2.5 ${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
  </Card>
);

export const UserOversightPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [targets, setTargets] = useState<OversightTarget[]>([]);
  const [summary, setSummary] = useState<OversightSummary>(EMPTY_SUMMARY);
  const [currentSession, setCurrentSession] = useState<OversightSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [justification, setJustification] = useState('');
  const [justificationTouched, setJustificationTouched] = useState(false);
  const [duration, setDuration] = useState<DurationValue>('15');
  const [search, setSearch] = useState('');
  const [department, setDepartment] = useState('ALL');
  const [role, setRole] = useState('ALL');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [pendingTarget, setPendingTarget] = useState<OversightTarget | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [loadedTargets, loadedSummary, session] = await Promise.all([
        listOversightTargets(), getOversightSummary(), getCurrentOversightSession(),
      ]);
      setTargets(loadedTargets);
      setSummary(loadedSummary || EMPTY_SUMMARY);
      setCurrentSession(session);
    } catch (reason) {
      setError(extractErrorMessage(reason));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const departments = useMemo(() => [...new Set(targets.map((target) => target.department?.trim() || 'Unassigned'))].sort(), [targets]);
  const roles = useMemo(() => [...new Set(targets.flatMap(rolesFor))].sort(), [targets]);
  const justificationValid = justification.trim().length >= 10;
  const manualTermination = duration === 'manual';

  const groupedTargets = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = targets.filter((target) => {
      const targetDepartment = target.department?.trim() || 'Unassigned';
      const targetRoles = rolesFor(target);
      const matchesSearch = !needle || [
        displayName(target), target.email, targetDepartment, ...targetRoles,
      ].some((value) => value.toLowerCase().includes(needle));
      return matchesSearch
        && (department === 'ALL' || targetDepartment === department)
        && (role === 'ALL' || targetRoles.includes(role))
        && (status === 'ALL' || (status === 'ONLINE' ? target.isOnline : !target.isOnline));
    });
    const groups = new Map<string, OversightTarget[]>();
    for (const target of filtered) {
      const key = target.department?.trim() || 'Unassigned';
      groups.set(key, [...(groups.get(key) || []), target]);
    }
    return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [department, role, search, status, targets]);

  const openConfirmation = (target: OversightTarget) => {
    if (!justificationValid || currentSession) {
      setJustificationTouched(true);
      return;
    }
    setPendingTarget(target);
  };

  const confirmStart = async () => {
    if (!pendingTarget || starting || !justificationValid) return;
    setStarting(true);
    setError('');
    try {
      const session = await startOversightSession({
        targetUserId: pendingTarget.id,
        mode: 'IMPERSONATION',
        justification: justification.trim(),
        durationMinutes: manualTermination ? null : Number(duration),
        manualTermination,
      });
      setPendingTarget(null);
      navigate(getDashboardPath(session.targetUser), { replace: true });
    } catch (reason) {
      setError(extractErrorMessage(reason));
      setStarting(false);
      setPendingTarget(null);
    }
  };

  if (loading) return <LoadingState label="Loading authorized oversight accounts..." />;
  if (error && targets.length === 0) return <ErrorState message={error} onRetry={() => void load()} />;

  const visibleCount = groupedTargets.reduce((count, [, items]) => count + items.length, 0);

  return (
    <div className="mx-auto max-w-[1500px] space-y-6">
      <PageHeader
        eyebrow="Super Administration"
        title="User Oversight"
        description="Securely access user sessions for administrative support, troubleshooting, verification, and system management."
        actions={<StatusBadge tone="warning" className="gap-2"><ShieldCheck className="h-3.5 w-3.5" />All oversight sessions are logged and audited</StatusBadge>}
      />

      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
      {searchParams.get('oversight') === 'expired' && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Oversight session expired. You have been returned to the Super Admin account.</div>}
      {searchParams.get('oversight') === 'target-unavailable' && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">Oversight ended because the target account is no longer available. You have been returned to the Super Admin account.</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Total Users" value={summary.totalUsers} icon={Users} tone="bg-slate-100 text-slate-700" />
        <SummaryCard label="Active Users" value={summary.activeUsers} icon={UserCheck} tone="bg-emerald-50 text-emerald-700" />
        <SummaryCard label="Offline Users" value={summary.offlineUsers} icon={UserRound} tone="bg-slate-100 text-slate-500" />
        <SummaryCard label="Oversight Sessions" value={summary.activeOversightSessions} icon={Eye} tone="bg-amber-50 text-amber-700" />
      </div>

      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex items-start gap-3">
          <span className="rounded-xl bg-brand-50 p-2.5 text-brand-700"><ShieldCheck className="h-5 w-5" /></span>
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-950">Oversight Session Controls</h2>
            <p className="text-sm text-slate-500">Configure the audited access reason and oversight duration before selecting an account.</p>
          </div>
        </div>
        {currentSession && (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            An oversight session is already active for <strong>{displayName(currentSession.targetUser)}</strong>. End it from the persistent oversight banner before starting another.
          </div>
        )}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <TextAreaField
            label="Audit Justification"
            required
            value={justification}
            onChange={(event) => setJustification(event.target.value)}
            onBlur={() => setJustificationTouched(true)}
            placeholder="Enter reason for accessing this user's account (minimum 10 characters)"
            hint="Required for audit and compliance records."
            error={justificationTouched && !justificationValid ? 'Enter at least 10 characters.' : undefined}
            className="min-h-24"
            disabled={Boolean(currentSession)}
          />
          <div>
            <SelectField label="Session Duration" value={duration} onChange={(event) => setDuration(event.target.value as DurationValue)} disabled={Boolean(currentSession)}>
              <option value="5">5 minutes</option>
              <option value="10">10 minutes</option>
              <option value="15">15 minutes</option>
              <option value="manual">Infinite — Until Manually Ended</option>
            </SelectField>
            {manualTermination && (
              <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
                Manual termination required. This session will remain active until you explicitly end the oversight session.
              </p>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="font-heading text-lg font-bold text-slate-950">Users</h2><p className="text-sm text-slate-500">{visibleCount} authorized account{visibleCount === 1 ? '' : 's'} shown</p></div>
          <StatusBadge tone="info">Offline accounts remain eligible</StatusBadge>
        </div>
        <div className="mb-6 grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_repeat(3,minmax(10rem,auto))]">
          <label className="relative block">
            <span className="sr-only">Search users</span><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search users by name, email, role, or department..." className="min-h-11 w-full rounded-control border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15" />
          </label>
          <select aria-label="Filter by department" value={department} onChange={(event) => setDepartment(event.target.value)} className="min-h-11 rounded-control border border-slate-300 bg-white px-3 text-sm"><option value="ALL">All Departments</option>{departments.map((item) => <option key={item}>{item}</option>)}</select>
          <select aria-label="Filter by role" value={role} onChange={(event) => setRole(event.target.value)} className="min-h-11 rounded-control border border-slate-300 bg-white px-3 text-sm"><option value="ALL">All Roles</option>{roles.map((item) => <option key={item} value={item}>{formatRoleLabel(item)}</option>)}</select>
          <select aria-label="Filter by status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="min-h-11 rounded-control border border-slate-300 bg-white px-3 text-sm"><option value="ALL">All Statuses</option><option value="ONLINE">Online</option><option value="OFFLINE">Offline</option></select>
        </div>

        <div className="space-y-7">
          {groupedTargets.map(([group, users]) => (
            <section key={group} aria-labelledby={`oversight-group-${group.replace(/\W+/g, '-').toLowerCase()}`}>
              <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                <h3 id={`oversight-group-${group.replace(/\W+/g, '-').toLowerCase()}`} className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">{group}</h3>
                <span className="text-xs text-slate-400">{users.length} user{users.length === 1 ? '' : 's'}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {users.map((target) => (
                  <article key={target.id} className="flex min-h-[13rem] flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-bold text-brand-700">{displayName(target).charAt(0).toUpperCase()}</span>
                      <div className="min-w-0"><h4 className="truncate text-sm font-bold text-slate-950">{displayName(target)}</h4><p className="truncate text-xs text-slate-500">{target.email}</p></div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1.5">{rolesFor(target).map((item) => <StatusBadge key={item}>{formatRoleLabel(item)}</StatusBadge>)}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                      <span className={target.isOnline ? 'font-semibold text-emerald-700' : 'font-semibold text-slate-500'}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${target.isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />{target.isOnline ? 'Online' : 'Offline'}</span>
                      <span className="text-emerald-700">Oversight Eligible</span>
                    </div>
                    <p className="mt-3 text-xs text-slate-500"><Clock3 className="mr-1 inline h-3.5 w-3.5" />Last active: {formatActivity(target.lastActiveAt || target.lastActiveOperationAt)}</p>
                    <Button variant="primary" className="mt-auto w-full pt-2" disabled={!justificationValid || Boolean(currentSession) || starting} onClick={() => openConfirmation(target)}>
                      <Eye className="h-4 w-4" />Start Oversight Session
                    </Button>
                  </article>
                ))}
              </div>
            </section>
          ))}
          {!groupedTargets.length && <EmptyState title="No matching users" description="Adjust the search or filters to view another authorized account." />}
        </div>
      </Card>

      <Modal
        open={Boolean(pendingTarget)}
        title="Start Oversight Session?"
        description="Review the full-access session details before continuing."
        onClose={() => { if (!starting) setPendingTarget(null); }}
        closeDisabled={starting}
        size="md"
        footer={<><Button disabled={starting} onClick={() => setPendingTarget(null)}>Cancel</Button><Button variant="primary" busy={starting} onClick={() => void confirmStart()}>Start Oversight Session</Button></>}
      >
        {pendingTarget && <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 rounded-xl bg-slate-50 p-4">
            <dt className="font-semibold text-slate-500">Target User</dt><dd className="font-semibold text-slate-900">{displayName(pendingTarget)}<span className="block font-normal text-slate-500">{pendingTarget.email}</span></dd>
            <dt className="font-semibold text-slate-500">Role</dt><dd>{formatRoleLabel(primaryRole(pendingTarget))}</dd>
            <dt className="font-semibold text-slate-500">Access</dt><dd><StatusBadge tone="danger">Full Access</StatusBadge></dd>
            <dt className="font-semibold text-slate-500">Duration</dt><dd>{manualTermination ? 'Until Manually Ended' : `${duration} minutes`}</dd>
            <dt className="font-semibold text-slate-500">Audit Justification</dt><dd className="break-words">{justification.trim()}</dd>
          </dl>
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-800">
            You are about to access this account with full operational permissions. Actions performed during this session will be recorded in the audit log.
          </div>
          {manualTermination && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 font-medium text-amber-800">This session has no automatic oversight timeout and must be ended manually. Normal token expiry and refresh protections remain active; the Super Admin actor remains exempt from the five-minute idle timeout.</div>}
        </div>}
      </Modal>
    </div>
  );
};
