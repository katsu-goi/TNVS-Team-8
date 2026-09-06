import React from 'react';
import { BellRing, Building2, FileSignature, FileText, Gavel, LayoutDashboard, ScrollText, Settings, User } from 'lucide-react';
import { PortalShell, type PortalNavItem } from '../layout/PortalShell';

const navItems: PortalNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/procurement', icon: LayoutDashboard, exact: true },
  { id: 'requests', label: 'Request Review', path: '/procurement/requests-review', icon: FileSignature },
  { id: 'contracts', label: 'Contracts', path: '/procurement/contracts', icon: FileSignature },
  { id: 'vendors', label: 'Vendors', path: '/procurement/vendors', icon: Building2 },
  { id: 'notices', label: 'Alerts & Notices', path: '/procurement/notices', icon: BellRing },
  { id: 'documents', label: 'Documents', path: '/procurement/documents', icon: FileText },
  { id: 'legal-cases', label: 'Legal Cases', path: '/procurement/legal-cases', icon: Gavel, badge: 'view' },
  { id: 'audit', label: 'Audit Trail', path: '/procurement/audit-logs', icon: ScrollText, badge: 'view' },
  { id: 'profile', label: 'Profile', path: '/procurement/profile', icon: User },
  { id: 'settings', label: 'Settings', path: '/procurement/settings', icon: Settings },
];

export const ProcurementOfficerLayout: React.FC = () => (
  <PortalShell portalLabel="Contract Management" roleLabel="Contract Officer" searchPlaceholder="Search contracts, vendors, or documents..." navItems={navItems} profilePath="/procurement/profile" settingsPath="/procurement/settings" />
);
