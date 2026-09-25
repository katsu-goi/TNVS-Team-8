import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LogOut, Settings, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { logout as apiLogout } from '../../api/authService';
import { useAuthStore } from '../../stores/authStore';
import { getRolePresentation } from '../../config/roleRegistry';
import { ConfirmDialog } from './SharedUI';

export function formatRoleLabel(role?: string): string {
  if (!role) return 'User';
  const normalized = role.trim().toUpperCase().replace(/^ROLE_/, '');
  const configured = getRolePresentation(normalized);
  if (configured) return configured.roleLabel;
  return normalized
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'User';
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'U';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

type UserProfileMenuProps = {
  profilePath?: string;
  settingsPath?: string;
  roleLabelOverride?: string;
};

export const UserProfileMenu: React.FC<UserProfileMenuProps> = ({ profilePath, settingsPath, roleLabelOverride }) => {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const menuRef = useRef<HTMLDivElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const displayName = useMemo(() => {
    const fullName = user?.fullName?.trim();
    if (fullName) return fullName;
    const composed = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim();
    return composed || user?.email || 'User';
  }, [user]);
  const primaryRole = user?.assignedRoles?.[0] || user?.roles?.[0];
  const roleLabel = roleLabelOverride || formatRoleLabel(primaryRole);
  const initials = initialsFor(displayName);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const confirmLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await apiLogout();
    } finally {
      logout();
      setLoggingOut(false);
      setShowLogoutModal(false);
    }
  };

  return (
    <>
      <div ref={menuRef} className="relative shrink-0">
        <button
          ref={accountTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Account menu for ${displayName}`}
          onClick={() => setOpen((value) => !value)}
          className="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left shadow-sm transition-colors hover:border-[#D02F34]/40 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#D02F34]/25 sm:gap-2.5 sm:px-3"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#D02F34] text-xs font-bold text-white shadow-sm">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : initials}
          </span>
          <span className="hidden min-w-0 max-w-44 sm:block">
            <span className="block truncate text-xs font-semibold text-slate-900">{displayName}</span>
            <span className="block truncate text-[11px] text-slate-500">{roleLabel}</span>
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
            <div className="border-b border-slate-100 px-3 py-2 sm:hidden">
              <p className="truncate text-xs font-semibold text-slate-900">{displayName}</p>
              <p className="truncate text-[11px] text-slate-500">{roleLabel}</p>
            </div>
            {profilePath && (
              <button type="button" role="menuitem" onClick={() => goTo(profilePath)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-[#D02F34]">
                <UserRound className="h-4 w-4" />
                <span>My Profile</span>
              </button>
            )}
            {settingsPath && (
              <button type="button" role="menuitem" onClick={() => goTo(settingsPath)} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 hover:text-[#D02F34]">
                <Settings className="h-4 w-4" />
                <span>Account Settings</span>
              </button>
            )}
            {(profilePath || settingsPath) && <div className="my-1 border-t border-slate-100" />}
            <button
              type="button"
              role="menuitem"
              onClick={() => { setOpen(false); setShowLogoutModal(true); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showLogoutModal}
        title="Confirm logout"
        description="Are you sure you want to end your current Hirna Portal session?"
        confirmLabel="Log out"
        tone="danger"
        busy={loggingOut}
        onClose={() => setShowLogoutModal(false)}
        onConfirm={confirmLogout}
        returnFocusRef={accountTriggerRef}
      />
    </>
  );
};
