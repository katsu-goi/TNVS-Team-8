import React from 'react';
import { Bell, CalendarClock, FileSignature, FileText, LayoutDashboard, Settings, User, Users } from 'lucide-react';
import { PortalShell, type PortalNavItem } from '../layout/PortalShell';

const navItems: PortalNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/employee', icon: LayoutDashboard, exact: true },
  { id: 'reservations', label: 'Facilities Reservation', path: '/employee/reservations', icon: CalendarClock },
  { id: 'visitors', label: 'Visitor Management', path: '/employee/visitors', icon: Users },
  { id: 'documents', label: 'Documents', path: '/employee/documents', icon: FileText },
  { id: 'requests', label: 'Requests', path: '/employee/requests', icon: FileSignature },
  { id: 'notifications', label: 'Notifications', path: '/employee/notifications', icon: Bell },
  { id: 'profile', label: 'Profile', path: '/employee/profile', icon: User },
  { id: 'settings', label: 'Settings', path: '/employee/settings', icon: Settings },
];

export const EmployeeLayout: React.FC = () => (
  <PortalShell portalLabel="Employee Services" roleLabel="Employee" searchPlaceholder="Search your reservations, visitors, or requests..." navItems={navItems} profilePath="/employee/profile" settingsPath="/employee/settings" />
);
