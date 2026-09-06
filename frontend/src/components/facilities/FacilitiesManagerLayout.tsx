import React from 'react';
import { BarChart3, Bell, Building2, Calendar, CheckSquare, ClipboardList, LayoutDashboard, Settings, User } from 'lucide-react';
import { PortalShell, type PortalNavItem } from '../layout/PortalShell';

const navItems: PortalNavItem[] = [
  { id: 'dashboard', label: 'Dashboard', path: '/facilities', icon: LayoutDashboard, exact: true },
  { id: 'reservations', label: 'TNVS Hub Reservations', path: '/facilities/reservations', icon: Calendar },
  { id: 'approval', label: 'Hub Capacity Allocation', path: '/facilities/approval', icon: CheckSquare },
  { id: 'rooms', label: 'Room Management', path: '/facilities/rooms', icon: Building2 },
  { id: 'calendar', label: 'Facility Calendar', path: '/facilities/calendar', icon: Calendar },
  { id: 'assets', label: 'Merchandise & Supply Logistics', path: '/facilities/assets', icon: ClipboardList },
  { id: 'reports', label: 'Peak Hub Reports', path: '/facilities/reports', icon: BarChart3 },
  { id: 'analytics', label: 'Hub Performance Analytics', path: '/facilities/analytics', icon: BarChart3 },
  { id: 'notifications', label: 'Notifications', path: '/facilities/notifications', icon: Bell },
  { id: 'profile', label: 'Profile', path: '/facilities/profile', icon: User },
  { id: 'settings', label: 'Settings', path: '/facilities/settings', icon: Settings },
];

export const FacilitiesManagerLayout: React.FC = () => (
  <PortalShell portalLabel="Facilities Management" roleLabel="Facilities Manager" searchPlaceholder="Search facilities, rooms, or reservations..." navItems={navItems} profilePath="/facilities/profile" settingsPath="/facilities/settings" />
);
