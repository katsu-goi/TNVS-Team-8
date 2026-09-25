import type { PortalNavItem } from './PortalShell';

export const normalizePortalPath = (path: string) => path.split(/[?#]/, 1)[0].replace(/\/$/, '') || '/';

export const shouldStartPortalNavigation = (currentPath: string, destinationPath: string) => (
  normalizePortalPath(currentPath) !== normalizePortalPath(destinationPath)
);

export const getPortalDestinations = (items: PortalNavItem[]): PortalNavItem[] => (
  items.flatMap((item) => [item, ...(item.children ?? [])])
);

export const getPortalLoadingMessage = (label?: string): string => {
  const normalized = label?.trim().toLowerCase();
  if (!normalized) return 'Loading content...';
  if (normalized === 'analytics') return 'Loading operational analytics...';
  if (normalized === 'rbac administration') return 'Loading RBAC administration...';
  return `Loading ${normalized}...`;
};
