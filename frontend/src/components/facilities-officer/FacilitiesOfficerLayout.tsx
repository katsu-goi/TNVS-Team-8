import React from 'react';
import { Bell, Calendar, Eye, FileText, LayoutDashboard, Settings, User } from 'lucide-react';
import { PortalShell, type PortalNavItem } from '../layout/PortalShell';

const navItems: PortalNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/facilities-officer', icon: LayoutDashboard, exact: true },
  { id: 'reservations', label: 'Hub Queue & Desk Allocation', path: '/facilities-officer/reservations', icon: Calendar },
  { id: 'visitors', label: 'Driver/Visitor Screening', path: '/facilities-officer/visitors', icon: Eye, badge: 'view' },
  { id: 'documents', label: 'Facility Documents & Permits', path: '/facilities-officer/documents', icon: FileText },
  { id: 'notifications', label: 'Notifications', path: '/facilities-officer/notifications', icon: Bell },
  { id: 'profile', label: 'Profile', path: '/facilities-officer/profile', icon: User },
  { id: 'settings', label: 'Settings', path: '/facilities-officer/settings', icon: Settings },
];

export const FacilitiesOfficerLayout: React.FC = () => (
  <PortalShell portalLabel="Facilities Operations" roleLabel="Facilities Officer" searchPlaceholder="Search facilities, reservations, or documents..." navItems={navItems} profilePath="/facilities-officer/profile" settingsPath="/facilities-officer/settings" />
);
