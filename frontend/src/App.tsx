import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard';
import { FacilitiesLayout } from './components/facilities/FacilitiesLayout';
import { ReservationGovernance } from './components/facilities/ReservationGovernance';
import { RoomManagement } from './components/facilities/RoomManagement';
import { MaintenanceControl } from './components/facilities/MaintenanceControl';
import { EquipmentInventory } from './components/facilities/EquipmentInventory';
import { EnterpriseCalendar } from './components/facilities/EnterpriseCalendar';
import { AnalyticsReports } from './components/facilities/AnalyticsReports';

import { VisitorView } from './components/visitor/VisitorView';
import { SecurityClearance } from './components/visitor/SecurityClearance';
import { VisitorApprovalQueue } from './components/visitor/VisitorApprovalQueue';
import { VisitorLogs } from './components/visitor/VisitorLogs';

import { DocumentsView } from './components/documents/DocumentsView';
import { AiClassification } from './components/documents/AiClassification';
import { OcrProcessing } from './components/documents/OcrProcessing';
import { DocumentsArchive } from './components/documents/DocumentsArchive';

import { LegalView } from './components/legal/LegalView';
import { Hearings } from './components/legal/Hearings';
import { LegalCompliance } from './components/legal/LegalCompliance';
import { Evidence } from './components/legal/Evidence';

import { ContractsView } from './components/contracts/ContractsView';
import { RiskAnalysis } from './components/contracts/RiskAnalysis';
import { Renewals } from './components/contracts/Renewals';
import { Obligations } from './components/contracts/Obligations';

import { SecurityCenterView } from './components/security/SecurityCenterView';
import { RbacPage } from './components/security/RbacPage';
import { SecurityEvents } from './components/security/SecurityEvents';
import { SystemMonitoring } from './components/security/SystemMonitoring';

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

export const App: React.FC = () => {
 return (
 <BrowserRouter>
 <Routes>
 <Route element={<AppLayout />}>
 <Route index element={<ExecutiveDashboard />} />

 <Route path="facilities" element={<FacilitiesLayout />}>
 <Route index element={<Navigate to="reservations" replace />} />
 <Route path="reservations" element={<ReservationGovernance />} />
 <Route path="rooms" element={<RoomManagement />} />
 <Route path="maintenance" element={<MaintenanceControl />} />
 <Route path="equipment" element={<EquipmentInventory />} />
 <Route path="calendar" element={<EnterpriseCalendar />} />
 <Route path="analytics" element={<AnalyticsReports />} />
 </Route>

 <Route path="visitors" element={<VisitorView />} />
 <Route path="visitors/clearance" element={<SecurityClearance />} />
 <Route path="visitors/approval" element={<VisitorApprovalQueue />} />
 <Route path="visitors/logs" element={<VisitorLogs />} />

 <Route path="documents" element={<DocumentsView />} />
 <Route path="documents/ai-classification" element={<AiClassification />} />
 <Route path="documents/ocr" element={<OcrProcessing />} />
 <Route path="documents/archive" element={<DocumentsArchive />} />

 <Route path="legal" element={<LegalView />} />
 <Route path="legal/hearings" element={<Hearings />} />
 <Route path="legal/compliance" element={<LegalCompliance />} />
 <Route path="legal/evidence" element={<Evidence />} />

 <Route path="contracts" element={<ContractsView />} />
 <Route path="contracts/risk-analysis" element={<RiskAnalysis />} />
 <Route path="contracts/renewals" element={<Renewals />} />
 <Route path="contracts/obligations" element={<Obligations />} />

 <Route path="security" element={
 <ErrorBoundary fallback={<div className="text-rose-400">Security Center failed to load.</div>}>
 <SecurityCenterView />
 </ErrorBoundary>
 } />
 <Route path="security/rbac" element={<RbacPage />} />
 <Route path="security/events" element={<SecurityEvents />} />
 <Route path="security/monitoring" element={<SystemMonitoring />} />
 </Route>
 </Routes>
 </BrowserRouter>
 );
};
