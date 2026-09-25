import {
  Activity, BarChart3, Bell, BellRing, Building2, Calendar, CalendarClock, CheckSquare,
  ClipboardList, Cpu, Download, Eye, FileSignature, FileText, Gavel, KeyRound, Layers,
  LayoutDashboard, LockKeyhole, Monitor, ScrollText, Settings, ShieldCheck, Users,
} from 'lucide-react';
import type { PortalNavItem } from '../components/layout/PortalShell';
import { workspaceConfigs } from '../components/workspaces/workspaceConfig';

export type CanonicalRole =
  | 'SUPER_ADMIN' | 'SYSTEM_ADMIN' | 'COMPLIANCE_MANAGER' | 'DATA_PROTECTION_OFFICER'
  | 'LEGAL_COUNSEL' | 'RECORDS_OFFICER' | 'DEPARTMENT_HEAD' | 'SECURITY_OFFICER'
  | 'INFOSEC_OFFICER' | 'FACILITIES_MANAGER' | 'FACILITIES_OFFICER' | 'COMPLIANCE_OFFICER'
  | 'LEGAL_OFFICER' | 'CONTRACT_OFFICER' | 'EMPLOYEE';

export type RolePresentation = {
  role: CanonicalRole;
  dashboardPath: string;
  portalLabel: string;
  roleLabel: string;
  searchPlaceholder: string;
  navigation: PortalNavItem[];
  profilePath?: string;
  settingsPath?: string;
  showSystemStatus?: boolean;
};

const exact = true;

const explicitRoles: RolePresentation[] = [
  {
    role: 'SUPER_ADMIN', dashboardPath: '/super-admin', portalLabel: 'Super Administration', roleLabel: 'Super Administrator',
    searchPlaceholder: 'Search analytics, RBAC, or security oversight...', showSystemStatus: true,
    navigation: [
      { id: 'dashboard', label: 'Executive Dashboard', path: '/super-admin', icon: LayoutDashboard, exact },
      { id: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: BarChart3, exact },
      { id: 'notifications', label: 'Notifications', path: '/admin/notifications', icon: Bell, exact },
      { id: 'rbac', label: 'RBAC Administration', path: '/admin/rbac', icon: KeyRound, exact },
      { id: 'security', label: 'Security Center', path: '/security', icon: ShieldCheck, exact, children: [
        { id: 'security-audit', label: 'Audit Logs', path: '/security/audit-logs', icon: FileText, exact },
      ] },
    ],
  },
  {
    role: 'SYSTEM_ADMIN', dashboardPath: '/system-admin', portalLabel: 'System Administration', roleLabel: 'System Administrator',
    searchPlaceholder: 'Search logs, settings, or admin pages...', showSystemStatus: true,
    navigation: [
      { id: 'dashboard', label: 'Dashboard', path: '/system-admin', icon: LayoutDashboard, exact },
      { id: 'analytics', label: 'Analytics', path: '/admin/analytics', icon: BarChart3, exact },
      { id: 'integrations', label: 'Integrations', path: '/admin/integrations', icon: Layers, exact },
      { id: 'ai-services', label: 'AI Services', path: '/admin/ai-services', icon: Cpu, exact },
      { id: 'backup', label: 'Backup & DR', path: '/admin/backup', icon: Download, exact },
      { id: 'settings', label: 'System Config', path: '/admin/settings', icon: Settings, exact },
      { id: 'notifications', label: 'Notifications', path: '/admin/notifications', icon: Bell, exact },
      { id: 'system-health', label: 'System Health', path: '/admin/system-health', icon: Monitor, exact },
      { id: 'sessions', label: 'Sessions', path: '/admin/sessions', icon: Activity, exact },
      { id: 'account-lockouts', label: 'Account Lockouts', path: '/admin/account-lockouts', icon: LockKeyhole, exact },
    ],
  },
  {
    role: 'FACILITIES_MANAGER', dashboardPath: '/facilities', portalLabel: 'Facilities Management', roleLabel: 'Facilities Manager',
    searchPlaceholder: 'Search facilities, rooms, or reservations...',
    navigation: [
      { id: 'dashboard', label: 'Dashboard', path: '/facilities', icon: LayoutDashboard, exact },
      { id: 'reservations', label: 'TNVS Hub Reservations', path: '/facilities/reservations', icon: Calendar },
      { id: 'approval', label: 'Hub Capacity Allocation', path: '/facilities/approval', icon: CheckSquare },
      { id: 'rooms', label: 'Facility Management', path: '/facilities/rooms', icon: Building2 },
      { id: 'calendar', label: 'Facility Calendar', path: '/facilities/calendar', icon: Calendar },
      { id: 'assets', label: 'Merchandise & Supply Logistics', path: '/facilities/assets', icon: ClipboardList },
      { id: 'reports', label: 'Peak Hub Reports', path: '/facilities/reports', icon: BarChart3 },
      { id: 'analytics', label: 'Hub Performance Analytics', path: '/facilities/analytics', icon: BarChart3 },
      { id: 'notifications', label: 'Notifications', path: '/facilities/notifications', icon: Bell },
    ],
  },
  {
    role: 'FACILITIES_OFFICER', dashboardPath: '/facilities-officer', portalLabel: 'Facilities Operations', roleLabel: 'Facilities Officer',
    searchPlaceholder: 'Search facilities, reservations, or documents...',
    navigation: [
      { id: 'dashboard', label: 'Dashboard', path: '/facilities-officer', icon: LayoutDashboard, exact },
      { id: 'reservations', label: 'Facilities Reservation & Queue', path: '/facilities-officer/reservations', icon: Calendar },
      { id: 'visitors', label: 'Driver/Visitor Screening', path: '/facilities-officer/visitors', icon: Eye, badge: 'view' },
      { id: 'qr-check-in', label: 'QR Guest Check-in', path: '/facilities-officer/qr-check-in', icon: Eye },
      { id: 'documents', label: 'Facility Documents & Permits', path: '/facilities-officer/documents', icon: FileText },
      { id: 'notifications', label: 'Notifications', path: '/facilities-officer/notifications', icon: Bell },
    ],
  },
  {
    role: 'LEGAL_OFFICER', dashboardPath: '/legal', portalLabel: 'Legal Administration', roleLabel: 'Legal Officer',
    searchPlaceholder: 'Search legal cases, notices, or documents...',
    navigation: [
      { id: 'dashboard', label: 'Dashboard', path: '/legal', icon: LayoutDashboard, exact },
      { id: 'requests', label: 'Request Review', path: '/legal/requests-review', icon: FileSignature },
      { id: 'contracts', label: 'Contracts', path: '/legal/contracts', icon: FileSignature },
      { id: 'cases', label: 'Legal Cases', path: '/legal/cases', icon: Gavel },
      { id: 'notices', label: 'Legal Notices', path: '/legal/notices', icon: BellRing },
      { id: 'documents', label: 'Legal Documents', path: '/legal/documents', icon: FileText },
    ],
  },
  {
    role: 'CONTRACT_OFFICER', dashboardPath: '/procurement', portalLabel: 'Contract Management', roleLabel: 'Contract Officer',
    searchPlaceholder: 'Search contracts, vendors, or documents...',
    navigation: [
      { id: 'dashboard', label: 'Dashboard', path: '/procurement', icon: LayoutDashboard, exact },
      { id: 'requests', label: 'Request Review', path: '/procurement/requests-review', icon: FileSignature },
      { id: 'contracts', label: 'Contracts', path: '/procurement/contracts', icon: FileSignature },
      { id: 'vendors', label: 'Vendors', path: '/procurement/vendors', icon: Building2 },
      { id: 'notices', label: 'Alerts & Notices', path: '/procurement/notices', icon: BellRing },
      { id: 'documents', label: 'Documents', path: '/procurement/documents', icon: FileText },
      { id: 'legal-cases', label: 'Legal Cases', path: '/procurement/legal-cases', icon: Gavel, badge: 'view' },
      { id: 'audit', label: 'Audit Trail', path: '/procurement/audit-logs', icon: ScrollText, badge: 'view' },
    ],
  },
  {
    role: 'EMPLOYEE', dashboardPath: '/employee', portalLabel: 'Employee Services', roleLabel: 'Employee', profilePath: '/employee/profile',
    searchPlaceholder: 'Search your reservations, visitors, or requests...',
    navigation: [
      { id: 'dashboard', label: 'Dashboard', path: '/employee', icon: LayoutDashboard, exact },
      { id: 'reservations', label: 'Facilities Reservation', path: '/employee/reservations', icon: CalendarClock },
      { id: 'visitors', label: 'Visitor Management', path: '/employee/visitors', icon: Users },
      { id: 'documents', label: 'Documents', path: '/employee/documents', icon: FileText },
      { id: 'requests', label: 'Requests', path: '/employee/requests', icon: FileSignature },
      { id: 'notifications', label: 'Notifications', path: '/employee/notifications', icon: Bell },
      { id: 'profile', label: 'Profile', path: '/employee/profile', icon: Users },
    ],
  },
];

const workspaceRoles: RolePresentation[] = workspaceConfigs.map((config) => ({
  role: config.role as CanonicalRole,
  dashboardPath: `/${config.slug}/dashboard`,
  portalLabel: config.portalLabel,
  roleLabel: config.headerLabel,
  searchPlaceholder: `Search ${config.portalLabel.toLowerCase()} records...`,
  navigation: config.nav.map((item) => ({
    id: item.section, label: item.label, path: `/${config.slug}/${item.section}`, icon: item.icon, exact: true, group: item.group,
  })),
  settingsPath: config.nav.some((item) => item.section === 'settings') ? `/${config.slug}/settings` : undefined,
}));

export const roleRegistry = new Map<CanonicalRole, RolePresentation>(
  [...explicitRoles, ...workspaceRoles].map((entry) => [entry.role, entry]),
);

export const normalizeRole = (role: string) => role.trim().toUpperCase().replace(/^ROLE_/, '') as CanonicalRole;
export const getRolePresentation = (role: string) => roleRegistry.get(normalizeRole(role));
export const getDashboardPathForRoles = (roles: string[]) => {
  for (const role of roles.map(normalizeRole)) {
    const entry = roleRegistry.get(role);
    if (entry) return entry.dashboardPath;
  }
  return '/';
};

const notificationDestinations: Partial<Record<CanonicalRole, Record<string, string>>> = {
  SUPER_ADMIN: { security_alert: '/security', incident: '/security', audit: '/security/audit-logs', security_log: '/security/audit-logs' },
  SYSTEM_ADMIN: { notification: '/admin/notifications', system: '/admin/system-health', session: '/admin/sessions' },
  COMPLIANCE_MANAGER: { incident: '/compliance-management/incidents', approval: '/compliance-management/signoffs' },
  DATA_PROTECTION_OFFICER: { incident: '/privacy/breaches', security_alert: '/privacy/breaches', document: '/privacy/governance', retention: '/privacy/retention' },
  LEGAL_COUNSEL: { contract: '/legal-counsel/approvals', approval: '/legal-counsel/approvals' },
  RECORDS_OFFICER: { document: '/records/repositories', retention: '/records/disposal' },
  DEPARTMENT_HEAD: { approval: '/department/approvals', audit: '/department/activity', security_log: '/department/activity' },
  SECURITY_OFFICER: { incident: '/security-operations/incidents', security_alert: '/security-operations/incidents', audit: '/security-operations/reports' },
  INFOSEC_OFFICER: { incident: '/information-security/cyber-incidents', security_alert: '/information-security/cyber-incidents' },
  FACILITIES_MANAGER: { reservation: '/facilities/reservations' },
  FACILITIES_OFFICER: { reservation: '/facilities-officer/reservations', visitor: '/facilities-officer/visitors', document: '/facilities-officer/documents' },
  COMPLIANCE_OFFICER: { contract: '/compliance/contracts', document: '/compliance/documents', retention: '/compliance/retention', audit: '/compliance/audit' },
  LEGAL_OFFICER: { employeerequest: '/legal/requests-review', contract: '/legal/contracts', document: '/legal/documents' },
  CONTRACT_OFFICER: { employeerequest: '/procurement/requests-review', contract: '/procurement/contracts', document: '/procurement/documents' },
  EMPLOYEE: { reservation: '/employee/reservations', visitor: '/employee/visitors', employeerequest: '/employee/requests', document: '/employee/documents' },
};

export function getNotificationDestination(roles: string[], entityType?: unknown): string | null {
  const entity = typeof entityType === 'string'
    ? entityType.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    : '';
  for (const role of roles.map(normalizeRole)) {
    const destinations = notificationDestinations[role];
    const configured = destinations?.[entity] || destinations?.[entity.replace(/_/g, '')];
    if (configured) return configured;
  }
  const dashboard = getDashboardPathForRoles(roles);
  return dashboard === '/' ? null : dashboard;
}
