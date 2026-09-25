import React, { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useAuthStore, getDashboardPath, isActorSuperAdmin, isActorSystemAdmin, hasAssignedRole } from './stores/authStore';
import { OversightBanner } from './components/oversight';
import { workspaceConfigs } from './components/workspaces/workspaceConfig';
import type { WorkspaceConfig } from './components/workspaces/workspaceConfig';
import { isTeam8Email } from './utils/team8Access';
import { Button, EmptyState } from './components/ui/SharedUI';
import { PortalInitializationError, SessionBootstrapPlaceholder } from './components/ui/PortalLoadingOverlay';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './components/auth/LoginPage';
import { SessionIdleManager } from './components/auth/SessionIdleManager';
import { HRAssistancePage } from './components/auth/HRAssistancePage';
import { FacilitiesManagerLayout } from './components/facilities/FacilitiesManagerLayout';
import { FacilitiesOfficerLayout } from './components/facilities-officer/FacilitiesOfficerLayout';
import { LegalOfficerLayout } from './components/legal/LegalOfficerLayout';
import { ProcurementOfficerLayout } from './components/procurement/ProcurementOfficerLayout';
import { EmployeeLayout } from './components/employee/EmployeeLayout';
import { RoleWorkspaceLayout } from './components/workspaces/RoleWorkspaceLayout';

const lazyNamed = (loader: () => Promise<any>, exportName: string) =>
  lazy(() => loader().then((module) => ({ default: module[exportName] }))) as React.LazyExoticComponent<React.ComponentType<any>>;

const SysAdminDashboard = lazyNamed(() => import('./components/sysadmin/SysAdminDashboard'), 'SysAdminDashboard');
const IntegrationsPage = lazyNamed(() => import('./components/sysadmin/AdminPages'), 'IntegrationsPage');
const AiServicesPage = lazyNamed(() => import('./components/sysadmin/AdminPages'), 'AiServicesPage');
const SecurityCenterPage = lazyNamed(() => import('./components/sysadmin/AdminPages'), 'SecurityCenterPage');
const AuditLogsPage = lazyNamed(() => import('./components/sysadmin/AdminPages'), 'AuditLogsPage');
const BackupPage = lazyNamed(() => import('./components/sysadmin/AdminPages'), 'BackupPage');
const SettingsPage = lazyNamed(() => import('./components/sysadmin/AdminPages'), 'SettingsPage');
const NotificationsPage = lazyNamed(() => import('./components/sysadmin/AdminPages'), 'NotificationsPage');
const SystemHealthPage = lazyNamed(() => import('./components/sysadmin/AdminPages'), 'SystemHealthPage');
const SessionsPage = lazyNamed(() => import('./components/sysadmin/AdminPages'), 'SessionsPage');
const AnalyticsPage = lazyNamed(() => import('./components/sysadmin/AnalyticsDashboard'), 'AnalyticsPage');
const RbacAdminPage = lazyNamed(() => import('./components/sysadmin/RbacAdminPage'), 'RbacAdminPage');
const FacilitiesDashboard = lazyNamed(() => import('./components/facilities/FacilitiesDashboard'), 'FacilitiesDashboard');
const ReservationsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'ReservationsPage');
const ApprovalPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'ApprovalPage');
const FacilityManagementPage = lazyNamed(() => import('./components/facilities/FacilityManagement'), 'FacilityManagement');
const CalendarPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'CalendarPage');
const AssetsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'AssetsPage');
const FacilitiesReportsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'ReportsPage');
const FacilitiesAnalyticsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'AnalyticsPage');
const FacilitiesNotificationsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'FacilitiesNotificationsPage');
const FacilitiesOfficerDashboard = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerDashboard'), 'FacilitiesOfficerDashboard');
const FoReservationsPage = lazyNamed(() => import('./components/facilities-officer/FoReservationsPage'), 'FoReservationsPage');
const FoVisitorManagementPage = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerPages'), 'FoVisitorManagementPage');
const FoQrCheckInPage = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerPages'), 'QrCheckInPage');
const FoDocumentsPage = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerPages'), 'FoDocumentsPage');
const FoNotificationsPage = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerPages'), 'FoNotificationsPage');
const LegalOfficerDashboard = lazyNamed(() => import('./components/legal/LegalOfficerDashboard'), 'LegalOfficerDashboard');
const RequestReviewPage = lazyNamed(() => import('./components/requests/RequestReviewPage'), 'RequestReviewPage');
const LoContractsPage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoContractsPage');
const LoLegalCasesPage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoLegalCasesPage');
const LoLegalNoticesPage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoLegalNoticesPage');
const LoDocumentsPage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoDocumentsPage');
const ProcurementOfficerDashboard = lazyNamed(() => import('./components/procurement/ProcurementOfficerDashboard'), 'ProcurementOfficerDashboard');
const PoContractsPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoContractsPage');
const PoVendorsPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoVendorsPage');
const PoNoticesPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoNoticesPage');
const PoDocumentsPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoDocumentsPage');
const PoLegalCasesPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoLegalCasesPage');
const PoAuditLogsPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoAuditLogsPage');
const EmployeeDashboard = lazyNamed(() => import('./components/employee/EmployeeDashboard'), 'EmployeeDashboard');
const EmpReservationsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpReservationsPage');
const EmpVisitorsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpVisitorsPage');
const EmpDocumentsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpDocumentsPage');
const EmpRequestsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpRequestsPage');
const EmpNotificationsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpNotificationsPage');
const EmpProfilePage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpProfilePage');
const RoleWorkspacePage = lazyNamed(() => import('./components/workspaces/RoleWorkspacePage'), 'RoleWorkspacePage');
const AccountLockoutsPage = lazyNamed(() => import('./components/sysadmin/AccountLockoutsPage'), 'AccountLockoutsPage');
const Team8LoginPage = lazyNamed(() => import('./components/reservation-portal/Team8LoginPage'), 'Team8LoginPage');
const ReservationPortalPage = lazyNamed(() => import('./components/reservation-portal/ReservationPortalPage'), 'ReservationPortalPage');
const ReservationPassPage = lazyNamed(() => import('./components/reservation-portal/ReservationPassPage'), 'ReservationPassPage');

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

export const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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

const AdminPortalRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!isActorSuperAdmin(user) && !isActorSystemAdmin(user)) {
    const destination = getDashboardPath(user);
    return <Navigate to={destination === '/' ? '/login' : destination} replace />;
  }
  return <>{children}</>;
};

const SuperAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!isActorSuperAdmin(user)) return <Navigate to={getDashboardPath(user)} replace />;
  return <>{children}</>;
};

const SystemAdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!isActorSystemAdmin(user)) return <Navigate to={getDashboardPath(user)} replace />;
  return <>{children}</>;
};

const DashboardRedirect: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const destination = getDashboardPath(user);
  return <Navigate to={destination === '/' ? '/login' : destination} replace />;
};

const AssignedRoleRoute: React.FC<{ role: string; children: React.ReactNode }> = ({ role, children }) => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!hasAssignedRole(user, role)) return <Navigate to={getDashboardPath(user)} replace />;
  return <>{children}</>;
};

export const WorkspaceSectionRoute: React.FC<{ config: WorkspaceConfig }> = ({ config }) => {
  const { section = 'dashboard' } = useParams();
  const navigate = useNavigate();
  const validSection = config.nav.some((item) => item.section === section);
  if (!validSection) {
    return (
      <EmptyState
        title="Workspace page not found"
        description={`The “${section}” section is not available in ${config.portalLabel}. Check the address or return to the dashboard.`}
        action={<Button variant="primary" onClick={() => navigate(`/${config.slug}/dashboard`, { replace: true })}>Go to dashboard</Button>}
      />
    );
  }
  return <RoleWorkspacePage config={config} section={section} />;
};

export const SessionBootstrap: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const status = useAuthStore((state) => state.sessionStatus);
  const error = useAuthStore((state) => state.sessionError);
  const bootstrapSession = useAuthStore((state) => state.bootstrapSession);
  const retryBootstrap = useAuthStore((state) => state.retryBootstrap);
  useEffect(() => { void bootstrapSession(); }, [bootstrapSession]);
  if (status === 'loading') {
    return <SessionBootstrapPlaceholder />;
  }
  if (status === 'error') {
    return (
      <PortalInitializationError
        message={error || undefined}
        onRetry={() => { void retryBootstrap(); }}
      />
    );
  }
  return <>{children}</>;
};

const FacilitiesRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!hasAssignedRole(user, 'FACILITIES_MANAGER')) return <Navigate to={getDashboardPath(user)} replace />;
  return <>{children}</>;
};

const FacilitiesOfficerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!hasAssignedRole(user, 'FACILITIES_OFFICER')) return <Navigate to={getDashboardPath(user)} replace />;
  return <>{children}</>;
};

const LegalOfficerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!hasAssignedRole(user, 'LEGAL_OFFICER')) return <Navigate to={getDashboardPath(user)} replace />;
  return <>{children}</>;
};

const ContractOfficerRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!hasAssignedRole(user, 'CONTRACT_OFFICER')) return <Navigate to={getDashboardPath(user)} replace />;
  return <>{children}</>;
};

const EmployeeRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((s) => s.accessToken);
  const user = useAuthStore((s) => s.user);
  if (!accessToken) return <Navigate to="/login" replace />;
  if (!hasAssignedRole(user, 'EMPLOYEE')) return <Navigate to={getDashboardPath(user)} replace />;
  return <>{children}</>;
};

const Team8PortalRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  if (!accessToken || !user) return <Navigate to="/reservation-portal/login" replace />;
  if (!isTeam8Email(user.email)) return <Navigate to="/reservation-portal/login?error=domain" replace />;
  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <SessionBootstrap>
        <SessionIdleManager>
          <OversightBanner />
          <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/hr-assistance" element={<HRAssistancePage />} />
        <Route path="/reservation-portal/login" element={<Suspense fallback={<SessionBootstrapPlaceholder />}><Team8LoginPage /></Suspense>} />
        <Route path="/reservation-portal/pass" element={<Suspense fallback={<SessionBootstrapPlaceholder />}><ReservationPassPage /></Suspense>} />
        <Route path="/guest-pass/:token" element={<Suspense fallback={<SessionBootstrapPlaceholder />}><ReservationPassPage /></Suspense>} />
        <Route path="/reservation-portal" element={<Team8PortalRoute><Suspense fallback={<SessionBootstrapPlaceholder />}><ReservationPortalPage /></Suspense></Team8PortalRoute>} />
        <Route element={
          <ProtectedRoute>
            <AdminPortalRoute>
              <AppLayout />
            </AdminPortalRoute>
          </ProtectedRoute>
        }>
          <Route index element={<DashboardRedirect />} />
          <Route path="super-admin" element={<SuperAdminRoute><SysAdminDashboard /></SuperAdminRoute>} />
          <Route path="system-admin" element={<SystemAdminRoute><SysAdminDashboard /></SystemAdminRoute>} />

          {/* System Administrator infrastructure modules */}
          <Route path="admin/integrations" element={<SystemAdminRoute><IntegrationsPage /></SystemAdminRoute>} />
          <Route path="admin/ai-services" element={<SystemAdminRoute><AiServicesPage /></SystemAdminRoute>} />
          <Route path="admin/backup" element={<SystemAdminRoute><BackupPage /></SystemAdminRoute>} />
          <Route path="admin/settings" element={<SystemAdminRoute><SettingsPage /></SystemAdminRoute>} />
          <Route path="admin/notifications" element={<AdminPortalRoute><NotificationsPage /></AdminPortalRoute>} />
          <Route path="admin/system-health" element={<SystemAdminRoute><SystemHealthPage /></SystemAdminRoute>} />
           <Route path="admin/sessions" element={<SystemAdminRoute><SessionsPage /></SystemAdminRoute>} />
           <Route path="admin/account-lockouts" element={<SystemAdminRoute><AccountLockoutsPage /></SystemAdminRoute>} />

          {/* Super Administrator business, RBAC, and security oversight */}
          <Route path="admin/analytics" element={<AdminPortalRoute><AnalyticsPage /></AdminPortalRoute>} />
          {/* Legacy path preserved for bookmarks/links to the renamed Analytics page */}
          <Route path="admin/reports" element={<AdminPortalRoute><Navigate to="/admin/analytics" replace /></AdminPortalRoute>} />
          <Route path="admin/rbac" element={<SuperAdminRoute><RbacAdminPage /></SuperAdminRoute>} />

          {/* Security Center */}
          <Route path="security" element={
            <SuperAdminRoute>
              <ErrorBoundary fallback={<div className="text-rose-400">Security Center failed to load.</div>}>
                <SecurityCenterPage />
              </ErrorBoundary>
            </SuperAdminRoute>
          } />
          <Route path="security/audit-logs" element={<SuperAdminRoute><AuditLogsPage /></SuperAdminRoute>} />
        </Route>

        {workspaceConfigs.map((config) => (
          <Route
            key={config.role}
            element={
              <AssignedRoleRoute role={config.role}>
                <RoleWorkspaceLayout config={config} />
              </AssignedRoleRoute>
            }
          >
            <Route path={config.slug} element={<Navigate to={`/${config.slug}/dashboard`} replace />} />
            <Route path={`${config.slug}/:section`} element={<WorkspaceSectionRoute config={config} />} />
          </Route>
        ))}

        {/* Facilities Manager routes */}
        <Route element={
          <FacilitiesRoute>
            <FacilitiesManagerLayout />
          </FacilitiesRoute>
        }>
          <Route path="facilities" element={<FacilitiesDashboard />} />
          <Route path="facilities/reservations" element={<ReservationsPage />} />
          <Route path="facilities/approval" element={<ApprovalPage />} />
          <Route path="facilities/rooms" element={<FacilityManagementPage />} />
          <Route path="facilities/calendar" element={<CalendarPage />} />
          <Route path="facilities/assets" element={<AssetsPage />} />
          <Route path="facilities/reports" element={<FacilitiesReportsPage />} />
          <Route path="facilities/analytics" element={<FacilitiesAnalyticsPage />} />
          <Route path="facilities/notifications" element={<FacilitiesNotificationsPage />} />
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
          <Route path="facilities-officer/qr-check-in" element={<FoQrCheckInPage />} />
          <Route path="facilities-officer/documents" element={<FoDocumentsPage />} />
          <Route path="facilities-officer/notifications" element={<FoNotificationsPage />} />
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
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </SessionIdleManager>
      </SessionBootstrap>
    </BrowserRouter>
  );
};
