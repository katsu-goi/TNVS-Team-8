import React, { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore, getDashboardPath, isActorSuperAdmin, isActorSystemAdmin, hasAssignedRole } from './stores/authStore';
import { OversightBanner } from './components/oversight';
import { workspaceConfigs } from './components/workspaces/workspaceConfig';
import type { WorkspaceConfig } from './components/workspaces/workspaceConfig';
import { useParams } from 'react-router-dom';

const lazyNamed = (loader: () => Promise<any>, exportName: string) =>
  lazy(() => loader().then((module) => ({ default: module[exportName] }))) as React.LazyExoticComponent<React.ComponentType<any>>;

const AppLayout = lazyNamed(() => import('./components/layout/AppLayout'), 'AppLayout');
const LoginPage = lazyNamed(() => import('./components/auth/LoginPage'), 'LoginPage');
const HRAssistancePage = lazyNamed(() => import('./components/auth/HRAssistancePage'), 'HRAssistancePage');
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
const FacilitiesManagerLayout = lazyNamed(() => import('./components/facilities/FacilitiesManagerLayout'), 'FacilitiesManagerLayout');
const FacilitiesDashboard = lazyNamed(() => import('./components/facilities/FacilitiesDashboard'), 'FacilitiesDashboard');
const ReservationsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'ReservationsPage');
const ApprovalPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'ApprovalPage');
const RoomsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'RoomsPage');
const CalendarPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'CalendarPage');
const AssetsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'AssetsPage');
const FacilitiesReportsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'ReportsPage');
const FacilitiesAnalyticsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'AnalyticsPage');
const FacilitiesNotificationsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'FacilitiesNotificationsPage');
const ProfilePage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'ProfilePage');
const FacilitiesSettingsPage = lazyNamed(() => import('./components/facilities/FacilitiesPages'), 'FacilitiesSettingsPage');
const FacilitiesOfficerLayout = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerLayout'), 'FacilitiesOfficerLayout');
const FacilitiesOfficerDashboard = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerDashboard'), 'FacilitiesOfficerDashboard');
const FoReservationsPage = lazyNamed(() => import('./components/facilities-officer/FoReservationsPage'), 'FoReservationsPage');
const FoVisitorManagementPage = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerPages'), 'FoVisitorManagementPage');
const FoDocumentsPage = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerPages'), 'FoDocumentsPage');
const FoNotificationsPage = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerPages'), 'FoNotificationsPage');
const FoProfilePage = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerPages'), 'FoProfilePage');
const FoSettingsPage = lazyNamed(() => import('./components/facilities-officer/FacilitiesOfficerPages'), 'FoSettingsPage');
const LegalOfficerLayout = lazyNamed(() => import('./components/legal/LegalOfficerLayout'), 'LegalOfficerLayout');
const LegalOfficerDashboard = lazyNamed(() => import('./components/legal/LegalOfficerDashboard'), 'LegalOfficerDashboard');
const RequestReviewPage = lazyNamed(() => import('./components/requests/RequestReviewPage'), 'RequestReviewPage');
const LoContractsPage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoContractsPage');
const LoLegalCasesPage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoLegalCasesPage');
const LoLegalNoticesPage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoLegalNoticesPage');
const LoDocumentsPage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoDocumentsPage');
const LoProfilePage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoProfilePage');
const LoSettingsPage = lazyNamed(() => import('./components/legal/LegalOfficerPages'), 'LoSettingsPage');
const ProcurementOfficerLayout = lazyNamed(() => import('./components/procurement/ProcurementOfficerLayout'), 'ProcurementOfficerLayout');
const ProcurementOfficerDashboard = lazyNamed(() => import('./components/procurement/ProcurementOfficerDashboard'), 'ProcurementOfficerDashboard');
const PoContractsPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoContractsPage');
const PoVendorsPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoVendorsPage');
const PoNoticesPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoNoticesPage');
const PoDocumentsPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoDocumentsPage');
const PoLegalCasesPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoLegalCasesPage');
const PoAuditLogsPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoAuditLogsPage');
const PoProfilePage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoProfilePage');
const PoSettingsPage = lazyNamed(() => import('./components/procurement/ProcurementOfficerPages'), 'PoSettingsPage');
const EmployeeLayout = lazyNamed(() => import('./components/employee/EmployeeLayout'), 'EmployeeLayout');
const EmployeeDashboard = lazyNamed(() => import('./components/employee/EmployeeDashboard'), 'EmployeeDashboard');
const EmpReservationsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpReservationsPage');
const EmpVisitorsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpVisitorsPage');
const EmpDocumentsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpDocumentsPage');
const EmpRequestsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpRequestsPage');
const EmpNotificationsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpNotificationsPage');
const EmpProfilePage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpProfilePage');
const EmpSettingsPage = lazyNamed(() => import('./components/employee/EmployeePages'), 'EmpSettingsPage');
const RoleWorkspaceLayout = lazyNamed(() => import('./components/workspaces/RoleWorkspaceLayout'), 'RoleWorkspaceLayout');
const RoleWorkspacePage = lazyNamed(() => import('./components/workspaces/RoleWorkspacePage'), 'RoleWorkspacePage');
const AccountLockoutsPage = lazyNamed(() => import('./components/sysadmin/AccountLockoutsPage'), 'AccountLockoutsPage');

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

const WorkspaceSectionRoute: React.FC<{ config: WorkspaceConfig }> = ({ config }) => {
  const { section = 'dashboard' } = useParams();
  const validSection = config.nav.some((item) => item.section === section) ? section : 'dashboard';
  return <RoleWorkspacePage config={config} section={validSection} />;
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

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <OversightBanner />
      <Suspense fallback={<div className="min-h-screen bg-slate-50 p-8 text-sm text-slate-500">Loading workspace...</div>}>
        <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/hr-assistance" element={<HRAssistancePage />} />
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
          <Route path="admin/notifications" element={<SystemAdminRoute><NotificationsPage /></SystemAdminRoute>} />
          <Route path="admin/system-health" element={<SystemAdminRoute><SystemHealthPage /></SystemAdminRoute>} />
           <Route path="admin/sessions" element={<SystemAdminRoute><SessionsPage /></SystemAdminRoute>} />
           <Route path="admin/account-lockouts" element={<SystemAdminRoute><AccountLockoutsPage /></SystemAdminRoute>} />

          {/* Super Administrator business, RBAC, and security oversight */}
          <Route path="admin/analytics" element={<SuperAdminRoute><AnalyticsPage /></SuperAdminRoute>} />
          {/* Legacy path preserved for bookmarks/links to the renamed Analytics page */}
          <Route path="admin/reports" element={<SuperAdminRoute><Navigate to="/admin/analytics" replace /></SuperAdminRoute>} />
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
      </Suspense>
    </BrowserRouter>
  );
};
