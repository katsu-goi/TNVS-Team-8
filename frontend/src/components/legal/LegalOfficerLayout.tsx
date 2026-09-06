import React from 'react';
import { BellRing, FileSignature, FileText, Gavel, LayoutDashboard, Settings, User } from 'lucide-react';
import { PortalShell, type PortalNavItem } from '../layout/PortalShell';

const navItems: PortalNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/legal', icon: LayoutDashboard, exact: true },
  { id: 'requests', label: 'Request Review', path: '/legal/requests-review', icon: FileSignature },
  { id: 'contracts', label: 'Contracts', path: '/legal/contracts', icon: FileSignature },
  { id: 'cases', label: 'Legal Cases', path: '/legal/cases', icon: Gavel },
  { id: 'notices', label: 'Legal Notices', path: '/legal/notices', icon: BellRing },
  { id: 'documents', label: 'Legal Documents', path: '/legal/documents', icon: FileText },
  { id: 'profile', label: 'Profile', path: '/legal/profile', icon: User },
  { id: 'settings', label: 'Settings', path: '/legal/settings', icon: Settings },
];

export const LegalOfficerLayout: React.FC = () => (
  <PortalShell portalLabel="Legal Administration" roleLabel="Legal Officer" searchPlaceholder="Search legal cases, notices, or documents..." navItems={navItems} profilePath="/legal/profile" settingsPath="/legal/settings" />
);
