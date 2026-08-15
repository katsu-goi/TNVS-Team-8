import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './components/auth/LoginPage';
import { HRAssistancePage } from './components/auth/HRAssistancePage';
import { SysAdminDashboard } from './components/sysadmin/SysAdminDashboard';
import {
  IntegrationsPage,
  AiServicesPage,
  SecurityCenterPage,
  AuditLogsPage,
  BackupPage,
  SettingsPage,
  NotificationsPage,
  AnalyticsPage,
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
  AnalyticsPage as FacilitiesAnalyticsPage,
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
import { LegalOfficerLayout } from './components/legal/LegalOfficerLayout';
import { LegalOfficerDashboard } from './components/legal/LegalOfficerDashboard';
import { RequestReviewPage } from './components/requests/RequestReviewPage';
import {
  LoContractsPage,
  LoLegalCasesPage,
  LoLegalNoticesPage,
  LoDocumentsPage,
  LoRetentionPage,
  LoAuditLogsPage,
  LoProfilePage,
  LoSettingsPage,
} from './components/legal/LegalOfficerPages';
import { ProcurementOfficerLayout } from './components/procurement/ProcurementOfficerLayout';
import { ProcurementOfficerDashboard } from './components/procurement/ProcurementOfficerDashboard';
import {
  PoContractsPage,
  PoVendorsPage,
  PoNoticesPage,
  PoDocumentsPage,
  PoLegalCasesPage,
  PoAuditLogsPage,
  PoProfilePage,
  PoSettingsPage,
} from './components/procurement/ProcurementOfficerPages';
import { EmployeeLayout } from './components/employee/EmployeeLayout';
import { EmployeeDashboard } from './components/employee/EmployeeDashboard';
import {
  EmpReservationsPage,
  EmpVisitorsPage,
  EmpDocumentsPage,
  EmpRequestsPage,
  EmpNotificationsPage,
  EmpProfilePage,
  EmpSettingsPage,
} from './components/employee/EmployeePages';
import { useAuthStore, getDashboardPath, isSuperAdmin } from './stores/authStore';

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
  // Fail-closed: both a bearer token AND a rehydrated user session are required.
  // A token without a user (or vice-versa) means a corrupt/partial session, so we
  // never render the authenticated layout from half a session.
  if (!accessToken || !user || !Object.keys(user).length) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

/**
 * Guards system-administrator surfaces (`/`, `/admin/*`, `/security*`).
 * Requires the SUPER_ADMIN role (the only system-administrator role the
 * backend defines); any other role is redirected to its own dashboard.
 */
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
  if (!isSuperAdmin(user)) {
    const destination = getDashboardPath(user);
    return <Navigate to={destination === '/' ? '/login' : destination} replace />;
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

const LegalOfficerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  const roles = user?.roles ? user.roles.map(r => r.toUpperCase()) : [];
  if (!roles.includes('LEGAL_OFFICER') && !roles.includes('ROLE_LEGAL_OFFICER')) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const ContractOfficerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  const roles = user?.roles ? user.roles.map(r => r.toUpperCase()) : [];
  if (!roles.includes('CONTRACT_OFFICER') && !roles.includes('ROLE_CONTRACT_OFFICER')) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const EmployeeRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  const roles = user?.roles ? user.roles.map(r => r.toUpperCase()) : [];
  if (!roles.includes('EMPLOYEE') && !roles.includes('ROLE_EMPLOYEE')) return <Navigate to="/" replace />;
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/hr-assistance" element={<HRAssistancePage />} />
        <Route element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }>
          <Route index element={<AdminRoute><SysAdminDashboard /></AdminRoute>} />

          {/* System Administrator modules only */}
          <Route path="admin/integrations" element={<AdminRoute><IntegrationsPage /></AdminRoute>} />
          <Route path="admin/ai-services" element={<AdminRoute><AiServicesPage /></AdminRoute>} />
          <Route path="admin/backup" element={<AdminRoute><BackupPage /></AdminRoute>} />
          <Route path="admin/settings" element={<AdminRoute><SettingsPage /></AdminRoute>} />
          <Route path="admin/notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
          <Route path="admin/analytics" element={<AdminRoute><AnalyticsPage /></AdminRoute>} />
          {/* Legacy path preserved for bookmarks/links to the renamed Analytics page */}
          <Route path="admin/reports" element={<AdminRoute><Navigate to="/admin/analytics" replace /></AdminRoute>} />
          <Route path="admin/system-health" element={<AdminRoute><SystemHealthPage /></AdminRoute>} />
          <Route path="admin/sessions" element={<AdminRoute><SessionsPage /></AdminRoute>} />

          {/* Security Center */}
          <Route path="security" element={
            <AdminRoute>
              <ErrorBoundary fallback={<div className="text-rose-400">Security Center failed to load.</div>}>
                <SecurityCenterPage />
              </ErrorBoundary>
            </AdminRoute>
          } />
          <Route path="security/audit-logs" element={<AdminRoute><AuditLogsPage /></AdminRoute>} />
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
          <Route path="facilities/analytics" element={<FacilitiesAnalyticsPage />} />
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

        {/* Legal Officer routes */}
        <Route element={
          <LegalOfficerRoute>
            <LegalOfficerLayout />
          </LegalOfficerRoute>
        }>
          <Route path="legal" element={<LegalOfficerDashboard />} />
          <Route path="legal/requests-review" element={<RequestReviewPage />} />
          <Route path="legal/contracts" element={<LoContractsPage />} />
          <Route path="legal/cases" element={<LoLegalCasesPage />} />
          <Route path="legal/notices" element={<LoLegalNoticesPage />} />
          <Route path="legal/documents" element={<LoDocumentsPage />} />
          <Route path="legal/retention-policies" element={<LoRetentionPage />} />
          <Route path="legal/audit-logs" element={<LoAuditLogsPage />} />
          <Route path="legal/profile" element={<LoProfilePage />} />
          <Route path="legal/settings" element={<LoSettingsPage />} />
        </Route>

        {/* Contract Officer routes */}
        <Route element={
          <ContractOfficerRoute>
            <ProcurementOfficerLayout />
          </ContractOfficerRoute>
        }>
          <Route path="procurement" element={<ProcurementOfficerDashboard />} />
          <Route path="procurement/requests-review" element={<RequestReviewPage />} />
          <Route path="procurement/contracts" element={<PoContractsPage />} />
          <Route path="procurement/vendors" element={<PoVendorsPage />} />
          <Route path="procurement/notices" element={<PoNoticesPage />} />
          <Route path="procurement/documents" element={<PoDocumentsPage />} />
          <Route path="procurement/legal-cases" element={<PoLegalCasesPage />} />
          <Route path="procurement/audit-logs" element={<PoAuditLogsPage />} />
          <Route path="procurement/profile" element={<PoProfilePage />} />
          <Route path="procurement/settings" element={<PoSettingsPage />} />
        </Route>

        {/* Employee routes */}
        <Route element={
          <EmployeeRoute>
            <EmployeeLayout />
          </EmployeeRoute>
        }>
          <Route path="employee" element={<EmployeeDashboard />} />
          <Route path="employee/reservations" element={<EmpReservationsPage />} />
          <Route path="employee/visitors" element={<EmpVisitorsPage />} />
          <Route path="employee/documents" element={<EmpDocumentsPage />} />
          <Route path="employee/requests" element={<EmpRequestsPage />} />
          <Route path="employee/notifications" element={<EmpNotificationsPage />} />
          <Route path="employee/profile" element={<EmpProfilePage />} />
          <Route path="employee/settings" element={<EmpSettingsPage />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
