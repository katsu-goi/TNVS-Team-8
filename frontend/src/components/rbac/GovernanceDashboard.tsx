import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, GitBranch, KeyRound, ShieldAlert, UsersRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { extractErrorMessage } from '../../api/client';
import { rbacService, RbacDashboardProfile } from '../../api/rbacService';
import { hasRole, useAuthStore } from '../../stores/authStore';
import { OversightPanel } from '../oversight';

const profiles: Record<string, { title: string; subtitle: string; focus: string[] }> = {
  compliance: {
    title: 'Compliance Manager Dashboard',
    subtitle: 'Management oversight, compliance coordination, and controlled approval visibility.',
    focus: ['Compliance program oversight', 'Officer workload coordination', 'Management approvals and exceptions'],
  },
  privacy: {
    title: 'Data Protection Dashboard',
    subtitle: 'Privacy oversight, data-subject risk, and compliance assurance.',
    focus: ['Privacy impact reviews', 'Data handling controls', 'Compliance exceptions'],
  },
  counsel: {
    title: 'Legal Counsel Dashboard',
    subtitle: 'Legal review, advice, and controlled access to legal operations.',
    focus: ['Legal request review', 'Contract advice', 'Case and notice oversight'],
  },
  records: {
    title: 'Records Governance Dashboard',
    subtitle: 'Retention, defensible disposal, and records custody controls.',
    focus: ['Retention schedules', 'Disposal approvals', 'Records audit evidence'],
  },
  department: {
    title: 'Department Head Dashboard',
    subtitle: 'Department-level requests, approvals, and employee services.',
    focus: ['Department requests', 'Operational approvals', 'Employee activity'],
  },
  security: {
    title: 'Security Operations Dashboard',
    subtitle: 'Operational security monitoring separated from privacy oversight.',
    focus: ['Security events', 'Operational incidents', 'Physical access risk'],
  },
  infosec: {
    title: 'Information Security Dashboard',
    subtitle: 'Information-security governance, controls, and technology risk.',
    focus: ['Security control health', 'Technology risk', 'Information-security incidents'],
  },
};

const roleDashboardKeys = [
  { role: 'COMPLIANCE_MANAGER', dashboardKey: 'compliance' },
  { role: 'DATA_PROTECTION_OFFICER', dashboardKey: 'privacy' },
  { role: 'RECORDS_OFFICER', dashboardKey: 'records' },
  { role: 'LEGAL_COUNSEL', dashboardKey: 'counsel' },
  { role: 'DEPARTMENT_HEAD', dashboardKey: 'department' },
  { role: 'SECURITY_OFFICER', dashboardKey: 'security' },
  { role: 'INFOSEC_OFFICER', dashboardKey: 'infosec' },
];

const dashboardAliases: Record<string, string> = {
  compliance_manager: 'compliance',
  'compliance-manager': 'compliance',
  data_protection: 'privacy',
  legal_counsel: 'counsel',
  records_governance: 'records',
  department_head: 'department',
  security_operations: 'security',
  information_security: 'infosec',
};

const normalizeRole = (role: string) => role.toUpperCase().replace(/^ROLE_/, '');

export const GovernanceDashboard: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [profile, setProfile] = useState<RbacDashboardProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    rbacService.getDashboard().then(setProfile).catch((reason) => setError(extractErrorMessage(reason)));
  }, []);

  const effectiveRoles = (profile?.effectiveRoles || user?.roles || []).map(normalizeRole);
  const roleDashboardKey = roleDashboardKeys.find(({ role }) => effectiveRoles.includes(role))?.dashboardKey;
  const requestedDashboardKey = profile?.dashboardKey || user?.dashboardKey || '';
  const dashboardKey = roleDashboardKey || dashboardAliases[requestedDashboardKey] || requestedDashboardKey || 'department';
  const content = profiles[dashboardKey] || profiles.department;
  const portalLinks = useMemo(() => {
    const roles = new Set((profile?.effectiveRoles || user?.roles || []).map(normalizeRole));
    const permissions = new Set((profile?.permissions || user?.permissions || []).map((permission) => permission.toUpperCase()));
    return [
      { label: 'Open Compliance Workspace', path: '/compliance', role: 'COMPLIANCE_OFFICER' },
      { label: 'Open Legal Workspace', path: '/legal', role: 'LEGAL_OFFICER' },
      { label: 'Open Employee Services', path: '/employee', role: 'EMPLOYEE' },
    ].filter((link) => roles.has(link.role)).concat(
      permissions.has('SECURITY_MONITOR')
        ? [{ label: 'Open Security Monitoring', path: '/governance/security', role: 'SECURITY_MONITOR' }]
        : [],
    );
  }, [profile, user]);

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
        <ShieldAlert className="mx-auto h-9 w-9 text-rose-500" />
        <h2 className="mt-3 font-bold text-slate-900">Dashboard profile could not be loaded</h2>
        <p className="mt-1 text-sm text-slate-600">{error}</p>
      </div>
    );
  }

  if (!profile) return <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />;

  const stats = [
    { label: 'Assigned Roles', value: profile.assignedRoles.length, icon: UsersRound },
    { label: 'Effective Roles', value: profile.effectiveRoles.length, icon: GitBranch },
    { label: 'Permissions', value: profile.permissions.length, icon: KeyRound },
    { label: 'Active SoD Rules', value: profile.activeConstraints.length, icon: ShieldAlert },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#D02F34]">{dashboardKey}</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">{content.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-500">{content.subtitle}</p>
      </section>

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <Icon className="h-5 w-5 text-[#D02F34]" />
              <p className="mt-4 text-2xl font-bold text-slate-900">{stat.value}</p>
              <p className="text-xs font-medium text-slate-500">{stat.label}</p>
            </div>
          );
        })}
      </section>

      {hasRole(user, 'COMPLIANCE_MANAGER') && <OversightPanel />}

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold text-slate-900">Role Focus</h2>
          <div className="mt-4 space-y-3">
            {content.focus.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {item}
              </div>
            ))}
          </div>
          {portalLinks.length > 0 && (
            <div className="mt-5 space-y-2">
              {portalLinks.map((link) => (
                <button key={link.path} onClick={() => navigate(link.path)}
                  className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 hover:border-[#D02F34] hover:text-[#D02F34]">
                  {link.label}<ArrowRight className="h-4 w-4" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold text-slate-900">Separation of Duties</h2>
          <p className="mt-1 text-xs text-slate-500">These constraints prevent conflicting roles from being assigned together.</p>
          <div className="mt-4 space-y-3">
            {profile.activeConstraints.length === 0 ? (
              <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-700">No active constraints affect this role.</p>
            ) : profile.activeConstraints.map((constraint) => (
              <div key={constraint.code} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-bold text-amber-900">{constraint.code}</p>
                <p className="mt-1 text-sm text-amber-800">{constraint.firstRole} ↔ {constraint.secondRole}</p>
                <p className="mt-1 text-xs text-amber-700">{constraint.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};
