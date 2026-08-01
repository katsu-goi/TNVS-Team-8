import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './components/auth/LoginPage';
import { SysAdminDashboard } from './components/sysadmin/SysAdminDashboard';
import {
  IntegrationsPage,
  AiServicesPage,
  SecurityCenterPage,
  AuditLogsPage,
  BackupPage,
  SettingsPage,
  NotificationsPage,
  ReportsPage,
  SystemHealthPage,
  SessionsPage,
} from './components/sysadmin/AdminPages';
import { FacilitiesManagerLayout } from './components/facilities/FacilitiesManagerLayout';
import { FacilitiesDashboard } from './components/facilities/FacilitiesDashboard';
import {
  ReservationsPage,
  ApprovalPage,
  RoomsPage,
  CalendarPage,
  AssetsPage,
  ReportsPage as FacilitiesReportsPage,
  AnalyticsPage,
  FacilitiesNotificationsPage,
  ProfilePage,
  FacilitiesSettingsPage,
} from './components/facilities/FacilitiesPages';
import { FacilitiesOfficerLayout } from './components/facilities-officer/FacilitiesOfficerLayout';
import { FacilitiesOfficerDashboard } from './components/facilities-officer/FacilitiesOfficerDashboard';
import { FoReservationsPage } from './components/facilities-officer/FoReservationsPage';
import {
  FoVisitorManagementPage,
  FoDocumentsPage,
  FoNotificationsPage,
  FoProfilePage,
  FoSettingsPage,
} from './components/facilities-officer/FacilitiesOfficerPages';
import { ComplianceOfficerLayout } from './components/compliance/ComplianceOfficerLayout';
import { ComplianceOfficerDashboard } from './components/compliance/ComplianceOfficerDashboard';
import {
  CoDocumentsPage,
  CoContractsPage,
  CoRetentionPoliciesPage,
  CoDisposalApprovalsPage,
  CoComplianceAlertsPage,
  CoAuditLogsPage,
  CoProfilePage,
  CoSettingsPage,
} from './components/compliance/ComplianceOfficerPages';
import { useAuthStore } from './stores/authStore';

class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center space-y-3">
          <div className="text-rose-400 text-lg font-bold">Component Error</div>
          <p className="text-slate-400 text-sm">{this.state.error}</p>
          <button onClick={() => this.setState({ hasError: false, error: '' })}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold">Retry</button>
        </div>
      );
    }
    return this.props.children;
  }
}

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  if (user?.roles && !user.roles.includes('FACILITIES_MANAGER')) {
    return <>{children}</>;
  }
  return <>{children}</>;
};

const FacilitiesRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  const roles = user?.roles ? user.roles.map(r => r.toUpperCase()) : [];
  if (!roles.includes('FACILITIES_MANAGER') && !roles.includes('ROLE_FACILITIES_MANAGER')) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const FacilitiesOfficerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  const roles = user?.roles ? user.roles.map(r => r.toUpperCase()) : [];
  if (!roles.includes('FACILITIES_OFFICER') && !roles.includes('ROLE_FACILITIES_OFFICER')) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const ComplianceOfficerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  const roles = user?.roles ? user.roles.map(r => r.toUpperCase()) : [];
  if (!roles.includes('COMPLIANCE_OFFICER') && !roles.includes('ROLE_COMPLIANCE_OFFICER')) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route index element={<SysAdminDashboard />} />

          {/* System Administrator modules only */}
          <Route path="admin/integrations" element={<IntegrationsPage />} />
          <Route path="admin/ai-services" element={<AiServicesPage />} />
          <Route path="admin/backup" element={<BackupPage />} />
          <Route path="admin/settings" element={<SettingsPage />} />
          <Route path="admin/notifications" element={<NotificationsPage />} />
          <Route path="admin/reports" element={<ReportsPage />} />
          <Route path="admin/system-health" element={<SystemHealthPage />} />
          <Route path="admin/sessions" element={<SessionsPage />} />

          {/* Security Center */}
          <Route path="security" element={
            <ErrorBoundary fallback={<div className="text-rose-400">Security Center failed to load.</div>}>
              <SecurityCenterPage />
            </ErrorBoundary>
          } />
          <Route path="security/audit-logs" element={<AuditLogsPage />} />
        </Route>

        {/* Facilities Manager routes */}
        <Route element={
          <FacilitiesRoute>
            <FacilitiesManagerLayout />
          </FacilitiesRoute>
        }>
          <Route path="facilities" element={<FacilitiesDashboard />} />
          <Route path="facilities/reservations" element={<ReservationsPage />} />
          <Route path="facilities/approval" element={<ApprovalPage />} />
          <Route path="facilities/rooms" element={<RoomsPage />} />
          <Route path="facilities/calendar" element={<CalendarPage />} />
          <Route path="facilities/assets" element={<AssetsPage />} />
          <Route path="facilities/reports" element={<FacilitiesReportsPage />} />
          <Route path="facilities/analytics" element={<AnalyticsPage />} />
          <Route path="facilities/notifications" element={<FacilitiesNotificationsPage />} />
          <Route path="facilities/profile" element={<ProfilePage />} />
          <Route path="facilities/settings" element={<FacilitiesSettingsPage />} />
        </Route>

        {/* Facilities Officer routes */}
        <Route element={
          <FacilitiesOfficerRoute>
            <FacilitiesOfficerLayout />
          </FacilitiesOfficerRoute>
        }>
          <Route path="facilities-officer" element={<FacilitiesOfficerDashboard />} />
          <Route path="facilities-officer/reservations" element={<FoReservationsPage />} />
          <Route path="facilities-officer/visitors" element={<FoVisitorManagementPage />} />
          <Route path="facilities-officer/documents" element={<FoDocumentsPage />} />
          <Route path="facilities-officer/notifications" element={<FoNotificationsPage />} />
          <Route path="facilities-officer/profile" element={<FoProfilePage />} />
          <Route path="facilities-officer/settings" element={<FoSettingsPage />} />
        </Route>

        {/* Compliance Officer routes */}
        <Route element={
          <ComplianceOfficerRoute>
            <ComplianceOfficerLayout />
          </ComplianceOfficerRoute>
        }>
          <Route path="compliance" element={<ComplianceOfficerDashboard />} />
          <Route path="compliance/documents" element={<CoDocumentsPage />} />
          <Route path="compliance/contracts" element={<CoContractsPage />} />
          <Route path="compliance/alerts" element={<CoComplianceAlertsPage />} />
          <Route path="compliance/retention-policies" element={<CoRetentionPoliciesPage />} />
          <Route path="compliance/disposals" element={<CoDisposalApprovalsPage />} />
          <Route path="compliance/audit-logs" element={<CoAuditLogsPage />} />
          <Route path="compliance/profile" element={<CoProfilePage />} />
          <Route path="compliance/settings" element={<CoSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
