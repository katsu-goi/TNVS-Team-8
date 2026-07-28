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
  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }
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
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
};
