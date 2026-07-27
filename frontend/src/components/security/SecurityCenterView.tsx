import React, { useState, useEffect, useCallback, Component } from 'react';
import { 
 ShieldAlert, ShieldCheck, Users, Ban, RefreshCw, Activity, Search, 
 Filter, Download, LogOut, AlertTriangle, Globe, Laptop, Loader2
} from 'lucide-react';
import { SecurityLog, BlockedIp, ActiveSession, SecurityAlert, SecurityMetrics } from '../../types/security';
import { securityService } from '../../api/securityService';
import { extractErrorMessage } from '../../api/client';
import { IpThreatMap } from './IpThreatMap';

// ─── Error Boundary for sub-components (e.g. Leaflet map) ─────────────────
class MapErrorBoundary extends Component<
 { children: React.ReactNode },
 { hasError: boolean; errorMsg: string }
> {
 constructor(props: any) {
 super(props);
 this.state = { hasError: false, errorMsg: '' };
 }
 static getDerivedStateFromError(error: Error) {
 return { hasError: true, errorMsg: error?.message || 'Map failed to load' };
 }
 render() {
 if (this.state.hasError) {
 return (
 <div className="flex flex-col items-center justify-center min-h-[500px] space-y-3 text-slate-500">
 <Globe className="w-8 h-8 text-emerald-600/40" />
 <p className="text-sm font-medium text-slate-400">Geographic Threat Map unavailable</p>
 <p className="text-xs text-slate-600">{this.state.errorMsg}</p>
 <button
 onClick={() => this.setState({ hasError: false, errorMsg: '' })}
 className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-slate-200 text-emerald-600 text-xs font-semibold hover:bg-emerald-100 transition-colors"
 >
 Retry
 </button>
 </div>
 );
 }
 return this.props.children;
 }
}

export const SecurityCenterView: React.FC = () => {
 const [activeTab, setActiveTab] = useState<'overview' | 'logs' | 'sessions' | 'ips' | 'alerts'>('overview');
 
 // Real-time state
 const [metrics, setMetrics] = useState<SecurityMetrics | null>(null);
 const [logs, setLogs] = useState<SecurityLog[]>([]);
 const [sessions, setSessions] = useState<ActiveSession[]>([]);
 const [blockedIps, setBlockedIps] = useState<BlockedIp[]>([]);
 const [alerts, setAlerts] = useState<SecurityAlert[]>([]);

 // Logs filters / pagination
 const [searchTerm, setSearchTerm] = useState('');
 const [filterRisk, setFilterRisk] = useState<string>('ALL');
 const [filterModule, setFilterModule] = useState<string>('ALL');
 const [currentPage, setCurrentPage] = useState(0);
 const [totalPages, setTotalPages] = useState(1);
 const [totalElements, setTotalElements] = useState(0);

 // Global UI states
 const [globalLoading, setGlobalLoading] = useState(false);
 const [globalError, setGlobalError] = useState<string | null>(null);

 // Row action loaders
 const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

 // IP Block Form State
 const [newIp, setNewIp] = useState('');
 const [newReason, setNewReason] = useState('');
 const [blockModalOpen, setBlockModalOpen] = useState(false);
 const [blockModalLoading, setBlockModalLoading] = useState(false);

 // Dynamic Live Gateway Feed (polls fast for fresh entries)
 const [feed, setFeed] = useState<Array<{ time: string; msg: string; type: string }>>([]);

 const loadAllSecurityTelemetry = useCallback(async () => {
 setGlobalLoading(true);
 setGlobalError(null);
 try {
 const [m, s, b, a, logPage] = await Promise.all([
 securityService.getMetrics(),
 securityService.getSessions(),
 securityService.getBlockedIps(),
 securityService.getAlerts(),
 securityService.getLogs({ page: 0, size: 8 })
 ]);

 // Map metrics safely to our local layout
 setMetrics({
 activeSessions: m.activeSessions,
 failedLoginAttempts: m.failedLoginAttempts,
 blockedIpsCount: m.blockedIpsCount,
 activeAlertsCount: m.activeAlertsCount,
 ddosBlockedRequests: m.ddosBlockedRequests,
 suspiciousActivitiesCount: m.suspiciousActivitiesCount,
 totalUsersOnline: m.activeSessions, // derived count
 apiRequestsCount: m.ddosBlockedRequests * 10 // safe representation
 });

 setSessions(s as any);
 setBlockedIps(b as any);
 setAlerts(a as any);
 setLogs(logPage.content as any);

 // Populate live feed with actual fresh logs
 if (logPage.content.length > 0) {
 setFeed(logPage.content.slice(0, 5).map(l => ({
 time: new Date(l.timestamp).toLocaleTimeString(),
 msg: `${l.action} in ${l.module} from ${l.ipAddress} [${l.status}]`,
 type: l.riskLevel === 'CRITICAL' || l.riskLevel === 'HIGH' ? 'warning' : 'info'
 })));
 }
 } catch (err) {
 setGlobalError(extractErrorMessage(err));
 } finally {
 setGlobalLoading(false);
 }
 }, []);

 useEffect(() => {
 loadAllSecurityTelemetry();
 }, [loadAllSecurityTelemetry]);

 // Load logs on page/filter change
 const loadFilteredLogs = useCallback(async () => {
 try {
 const riskParam = filterRisk === 'ALL' ? undefined : filterRisk;
 const modParam = filterModule === 'ALL' ? undefined : filterModule;
 const ipParam = searchTerm.trim() ? searchTerm.trim() : undefined;

 const pageRes = await securityService.getLogs({
 page: currentPage,
 size: 15,
 riskLevel: riskParam,
 module: modParam,
 ipAddress: ipParam
 });

 setLogs(pageRes.content as any);
 setTotalPages(pageRes.totalPages);
 setTotalElements(pageRes.totalElements);
 } catch (err) {
 setGlobalError(extractErrorMessage(err));
 }
 }, [currentPage, filterRisk, filterModule, searchTerm]);

 useEffect(() => {
 if (activeTab === 'logs') {
 loadFilteredLogs();
 }
 }, [activeTab, loadFilteredLogs]);

 // Actions
 const handleManualBlock = async (e: React.FormEvent) => {
 e.preventDefault();
 if (!newIp || blockModalLoading) return;
 setBlockModalLoading(true);
 setGlobalError(null);
 try {
 await securityService.blockIp(newIp, newReason || 'Manual Administrator ban');
 setNewIp('');
 setNewReason('');
 setBlockModalOpen(false);
 await loadAllSecurityTelemetry();
 } catch (err) {
 setGlobalError(extractErrorMessage(err));
 } finally {
 setBlockModalLoading(false);
 }
 };

 const handleRevokeSession = async (sessionId: string) => {
 if (actionLoadingId === sessionId) return;
 setActionLoadingId(sessionId);
 setGlobalError(null);
 try {
 await securityService.revokeSession(sessionId);
 await loadAllSecurityTelemetry();
 } catch (err) {
 setGlobalError(extractErrorMessage(err));
 } finally {
 setActionLoadingId(null);
 }
 };

 const handleUnblockIp = async (ipAddress: string) => {
 if (actionLoadingId === ipAddress) return;
 setActionLoadingId(ipAddress);
 setGlobalError(null);
 try {
 await securityService.unblockIp(ipAddress);
 await loadAllSecurityTelemetry();
 } catch (err) {
 setGlobalError(extractErrorMessage(err));
 } finally {
 setActionLoadingId(null);
 }
 };

 const handleResolveAlert = async (alertId: string) => {
 if (actionLoadingId === alertId) return;
 setActionLoadingId(alertId);
 setGlobalError(null);
 try {
 await securityService.resolveAlert(alertId, 'admin');
 await loadAllSecurityTelemetry();
 } catch (err) {
 setGlobalError(extractErrorMessage(err));
 } finally {
 setActionLoadingId(null);
 }
 };

 const exportLogsToCSV = () => {
 const headers = 'Timestamp,Action,Module,User,IP Address,Risk Level,Status,Raw Details\n';
 const csvContent = logs.map(l => 
 `"${l.timestamp}","${l.action}","${l.module}","${l.fullName || 'N/A'}","${l.ipAddress}","${l.riskLevel}","${l.status}","${l.reason || 'N/A'}"`
 ).join('\n');
 
 const blob = new Blob([headers + csvContent], { type: 'text/csv;charset=utf-8;' });
 const url = URL.createObjectURL(blob);
 const link = document.createElement('a');
 link.href = url;
 link.download = `Facilities_Security_Logs_${new Date().toISOString().substring(0, 10)}.csv`;
 link.click();
 URL.revokeObjectURL(url);
 };

 return (
 <div className="space-y-6">
 {/* Header Banner */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
 <div>
 <div className="flex items-center space-x-2">
 <span className="flex items-center space-x-1 py-1 px-2.5 rounded-full bg-rose-500/10 text-rose-400 text-xs font-semibold border border-slate-200">
 <ShieldAlert className="w-3.5 h-3.5 animate-pulse" />
 <span>OWASP Top 10 Admin Shield Active</span>
 </span>
 </div>
 <h2 className="text-2xl font-heading font-bold text-white mt-1.5">Security Command & Auditing Center</h2>
 <p className="text-slate-400 text-sm mt-0.5">Real-time DDoS mitigation, request rate limits, dynamic IP blocking, and system access audits.</p>
 </div>

 <div className="flex items-center space-x-2 text-xs">
 <button 
 onClick={() => setBlockModalOpen(true)}
 className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white font-semibold text-xs border border-slate-200 hover:border-transparent transition-all flex items-center space-x-1.5 shadow-lg shadow-rose-500/5"
 >
 <Ban className="w-3.5 h-3.5" />
 <span>Blacklist IP</span>
 </button>

 <button 
 onClick={loadAllSecurityTelemetry}
 disabled={globalLoading}
 className="p-2.5 rounded-xl bg-slate-900 border border-slate-200 text-slate-400 hover:text-white transition-all disabled:opacity-50"
 >
 <RefreshCw className={`w-4 h-4 ${globalLoading ? 'animate-spin' : ''}`} />
 </button>
 </div>
 </div>

 {globalError && (
 <div className="p-4 rounded-xl bg-rose-500/10 border border-slate-200 text-rose-400 text-sm flex items-center space-x-2">
 <AlertTriangle className="w-4 h-4 flex-shrink-0" />
 <span>{globalError}</span>
 </div>
 )}

 {/* Tabs Row */}
 <div className="flex items-center space-x-1.5 p-1 rounded-xl bg-slate-900 border border-slate-200 w-fit flex-wrap gap-1">
 {[
 { key: 'overview', icon: Activity, label: 'Dashboard' },
 { key: 'logs', icon: Filter, label: `Audit Logs (${totalElements || logs.length})` },
 { key: 'sessions', icon: Users, label: `Sessions (${sessions.length})` },
 { key: 'ips', icon: Ban, label: `IP Blacklist (${blockedIps.length})` },
 { key: 'alerts', icon: ShieldAlert, label: `Alerts (${alerts.length})` }
 ].map((tab) => {
 const Icon = tab.icon;
 return (
 <button 
 key={tab.key}
 onClick={() => setActiveTab(tab.key as any)} 
 className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center space-x-1.5 ${activeTab === tab.key ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/10' : 'text-slate-400 hover:text-white'}`}
 >
 <Icon className="w-3.5 h-3.5" />
 <span>{tab.label}</span>
 </button>
 );
 })}
 </div>

 {/* Dashboard Overview */}
 {activeTab === 'overview' && (
 <div className="space-y-6">
 {/* Key Metrics Grid */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
 {[
 { label: 'Users Online', icon: Users, val: metrics?.totalUsersOnline ?? 0, color: 'text-emerald-600' },
 { label: 'Failed Logins', icon: AlertTriangle, val: metrics?.failedLoginAttempts ?? 0, color: 'text-rose-455' },
 { label: 'Blocked Hosts', icon: Ban, val: metrics?.blockedIpsCount ?? 0, color: 'text-rose-400 font-mono' },
 { label: 'DDoS Mitigations', icon: Globe, val: metrics?.ddosBlockedRequests ?? 0, color: 'text-emerald-600 font-mono' }
 ].map(card => {
 const Icon = card.icon;
 return (
 <div key={card.label} className="glass-card p-4 flex flex-col justify-between">
 <span className="text-xs font-medium text-slate-400 flex items-center space-x-1">
 <Icon className={`w-3.5 h-3.5 ${card.color}`} />
 <span>{card.label}</span>
 </span>
 <div className="flex items-baseline space-x-2 mt-2">
 <span className="text-2xl font-bold text-white">
 {globalLoading ? <Loader2 className="w-4 h-4 animate-spin inline text-emerald-600" /> : card.val}
 </span>
 </div>
 </div>
 );
 })}
 </div>

 {/* Map + Feed */}
 <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
 <div className="lg:col-span-2 glass-panel p-6 space-y-4">
 <div className="flex items-center justify-between border-b border-slate-200 pb-3">
 <div>
 <h3 className="font-heading font-bold text-lg text-white">Geographic IP Threat Vector Map</h3>
 <p className="text-xs text-slate-400 mt-0.5">Real-time geographical tracking of failed logins, port scans, and SQLi attempts.</p>
 </div>
 <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-slate-200 text-[10px] font-mono">LIVE SECURE</span>
 </div>
 
 {/* Embed the Leaflet threat map */}
 <div className="min-h-[500px] relative overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
 <MapErrorBoundary>
 <IpThreatMap />
 </MapErrorBoundary>
 </div>
 </div>

 {/* Gateway Feeds */}
 <div className="glass-panel p-6 space-y-4">
 <h3 className="font-heading font-bold text-lg text-white border-b border-slate-200 pb-3">Real-time Gateway Logs</h3>
 {globalLoading ? (
 <div className="flex justify-center items-center py-6 text-slate-400 text-xs gap-1.5"><Loader2 className="w-4 h-4 animate-spin text-emerald-600" /><span>Polling logs…</span></div>
 ) : feed.length === 0 ? (
 <div className="text-center py-10 text-slate-500 text-xs">No activity logged.</div>
 ) : (
 <div className="space-y-3">
 {feed.map((f, i) => (
 <div key={i} className="p-3.5 rounded-xl bg-slate-950 border border-slate-200 space-y-1">
 <div className="flex justify-between items-center text-[10px]">
 <span className="text-slate-500 font-mono">{f.time}</span>
 <span className={`px-2 py-0.5 rounded font-mono ${f.type === 'warning' ? 'bg-emerald-50 text-emerald-600 border border-slate-200' : 'bg-emerald-50 text-emerald-600 border border-slate-200'}`}>
 {f.type.toUpperCase()}
 </span>
 </div>
 <p className="text-[11px] text-slate-400 leading-snug font-mono break-all">{f.msg}</p>
 </div>
 ))}
 </div>
 )}
 </div>
 </div>
 </div>
 )}

 {/* Audit Logs tab */}
 {activeTab === 'logs' && (
 <div className="space-y-4">
 <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-slate-900/60 p-4 rounded-xl border border-slate-200">
 <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-card px-3 py-2">
 <Search className="w-4 h-4 text-slate-400" />
 <input 
 type="text" 
 placeholder="Search IP address…" 
 value={searchTerm}
 onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(0); }}
 className="bg-transparent text-xs text-white placeholder-slate-500 w-full focus:outline-none" 
 />
 </div>
 
 <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-card px-3 py-2">
 <span className="text-slate-500 text-xs">Risk:</span>
 <select 
 value={filterRisk} 
 onChange={(e) => { setFilterRisk(e.target.value); setCurrentPage(0); }} 
 className="bg-transparent text-xs text-white focus:outline-none w-full cursor-pointer"
 >
 <option value="ALL">ALL LEVELS</option>
 <option value="LOW">LOW</option>
 <option value="MEDIUM">MEDIUM</option>
 <option value="HIGH">HIGH</option>
 <option value="CRITICAL">CRITICAL</option>
 </select>
 </div>

 <div className="flex items-center space-x-2 bg-white border border-slate-200 rounded-card px-3 py-2">
 <span className="text-slate-500 text-xs">Module:</span>
 <select 
 value={filterModule}
 onChange={(e) => { setFilterModule(e.target.value); setCurrentPage(0); }}
 className="bg-transparent text-xs text-white focus:outline-none w-full cursor-pointer"
 >
 <option value="ALL">ALL MODULES</option>
 <option value="AUTHENTICATION">AUTHENTICATION</option>
 <option value="VISITOR_MANAGEMENT">VISITOR PASS</option>
 <option value="DOCUMENTS">DOCUMENTS</option>
 <option value="FACILITIES">FACILITIES</option>
 <option value="ADMIN_OPERATIONS">ADMIN SHIELD</option>
 </select>
 </div>

 <button 
 onClick={exportLogsToCSV}
 className="rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-xs py-2 flex items-center justify-center space-x-1.5 transition-all shadow-md shadow-emerald-600/10"
 >
 <Download className="w-3.5 h-3.5" />
 <span>Export CSV</span>
 </button>
 </div>

 {/* Audit Logs Table */}
 <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-950">
 <div className="overflow-x-auto">
 <table className="w-full text-left">
 <thead>
 <tr className="bg-slate-900 border-b border-slate-200 text-slate-400 text-xs">
 <th className="p-4 font-semibold">Timestamp</th>
 <th className="p-4 font-semibold">Action</th>
 <th className="p-4 font-semibold">Module</th>
 <th className="p-4 font-semibold">IP Address</th>
 <th className="p-4 font-semibold">Operator</th>
 <th className="p-4 font-semibold">Risk Level</th>
 <th className="p-4 font-semibold">Status / Details</th>
 </tr>
 </thead>
 <tbody className="text-xs">
 {logs.length > 0 ? (
 logs.map(l => (
 <tr key={l.id} className="hover:bg-slate-900/30 text-slate-400">
 <td className="p-4 font-mono text-[10px] text-slate-400">{new Date(l.timestamp).toLocaleString()}</td>
 <td className="p-4"><span className="font-mono bg-slate-800 text-xs text-emerald-600 px-2 py-0.5 rounded border border-slate-200">{l.action}</span></td>
 <td className="p-4 text-slate-400">{l.module}</td>
 <td className="p-4 font-mono">{l.ipAddress}</td>
 <td className="p-4">
 {l.fullName ? (
 <div>
 <div className="font-semibold text-white">{l.fullName}</div>
 <div className="text-[10px] text-slate-500 font-mono">{l.role}</div>
 </div>
 ) : <span className="text-slate-500">Anonymous</span>}
 </td>
 <td className="p-4">
  {l.riskLevel === 'LOW' && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-slate-200">LOW</span>}
  {l.riskLevel === 'MEDIUM' && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-slate-200">MEDIUM</span>}
  {l.riskLevel === 'HIGH' && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-slate-200">HIGH</span>}
  {l.riskLevel === 'CRITICAL' && <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-slate-200 animate-pulse">CRITICAL</span>}
 </td>
 <td className="p-4 text-slate-400 font-mono max-w-xs truncate">{l.status === 'SUCCESS' ? '✔ SUCCESS' : `✖ ${l.reason || 'FAILED'}`}</td>
 </tr>
 ))
 ) : <tr><td colSpan={7} className="text-center p-8 text-slate-500">No logs found matching filters.</td></tr>}
 </tbody>
 </table>
 </div>
 </div>

 {/* Pagination */}
 {totalPages > 1 && (
 <div className="flex justify-between items-center text-xs text-slate-400 pt-2 font-semibold">
 <span>Showing Page {currentPage + 1} of {totalPages} ({totalElements} entries)</span>
 <div className="flex space-x-2">
 <button disabled={currentPage <= 0} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-200 hover:text-white disabled:opacity-50">Previous</button>
 <button disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-200 hover:text-white disabled:opacity-50">Next</button>
 </div>
 </div>
 )}
 </div>
 )}

 {/* Active Sessions */}
 {activeTab === 'sessions' && (
 <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-950">
 <div className="overflow-x-auto">
 <table className="w-full text-left text-xs">
 <thead>
 <tr className="bg-slate-900 border-b border-slate-200 text-slate-400 font-semibold">
 <th className="p-4">User</th>
 <th className="p-4">Browser & OS</th>
 <th className="p-4">IP Address</th>
 <th className="p-4">Login Time</th>
 <th className="p-4 text-right">Action</th>
 </tr>
 </thead>
 <tbody className="text-slate-400">
 {sessions.length === 0 ? (
 <tr><td colSpan={5} className="text-center p-8 text-slate-500">No active login sessions monitored.</td></tr>
 ) : sessions.map(s => (
 <tr key={s.id} className="hover:bg-slate-900/30">
 <td className="p-4 flex items-center space-x-2">
 <div className="w-8 h-8 rounded-full bg-emerald-50 border border-slate-200 flex items-center justify-center font-bold text-emerald-600">{s.username?.[0]?.toUpperCase() || 'U'}</div>
 <div>
 <div className="font-semibold text-white">{s.fullName || s.username}</div>
 <div className="text-[10px] text-slate-500 font-mono">{s.role}</div>
 </div>
 </td>
 <td className="p-4 font-mono text-slate-400"><div className="flex items-center space-x-1.5"><Laptop className="w-3.5 h-3.5 text-emerald-600" /><span>{s.browser || 'Chrome'} on {s.deviceName || 'Windows'}</span></div></td>
 <td className="p-4 font-mono">{s.ipAddress || '—'} {s.country ? `(${s.country})` : ''}</td>
 <td className="p-4 text-slate-400 font-mono">{new Date(s.loginTime).toLocaleString()}</td>
 <td className="p-4 text-right">
 <button 
 disabled={actionLoadingId === s.id} 
 onClick={() => {
 if (confirm(`Revoke session for ${s.fullName || s.username}?`)) {
 handleRevokeSession(s.id);
 }
 }} 
 className="px-2.5 py-1 rounded bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white border border-slate-200 hover:border-transparent transition-all flex items-center space-x-1 ml-auto"
 >
 {actionLoadingId === s.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <LogOut className="w-3 h-3" />}
 <span>Force Revoke</span>
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Blocked IPs Tab */}
 {activeTab === 'ips' && (
 <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-950 text-xs">
 <div className="overflow-x-auto">
 <table className="w-full text-left">
 <thead>
 <tr className="bg-slate-900 border-b border-slate-200 text-slate-400 font-semibold">
 <th className="p-4">IP Address</th>
 <th className="p-4">Reason</th>
 <th className="p-4">Blocked At</th>
 <th className="p-4">Blocked By</th>
 <th className="p-4 text-right">Action</th>
 </tr>
 </thead>
 <tbody className="text-slate-400">
 {blockedIps.length === 0 ? (
 <tr><td colSpan={5} className="text-center p-8 text-slate-500">No host IP bans currently active.</td></tr>
 ) : blockedIps.map(b => (
 <tr key={b.id} className="hover:bg-slate-900/30">
 <td className="p-4 font-mono font-bold text-rose-455">{b.ipAddress}</td>
 <td className="p-4 text-slate-300 max-w-sm truncate">{b.reason}</td>
 <td className="p-4 text-slate-400 font-mono">{new Date(b.blockedAt).toLocaleString()}</td>
 <td className="p-4 text-slate-500 font-mono">{b.blockedBy || 'System'}</td>
 <td className="p-4 text-right">
 <button 
 disabled={actionLoadingId === b.ipAddress} 
 onClick={() => handleUnblockIp(b.ipAddress)} 
 className="px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-600 text-emerald-600 hover:text-white border border-slate-200 hover:border-transparent transition-all flex items-center space-x-1 ml-auto"
 >
 {actionLoadingId === b.ipAddress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
 <span>Restore host IP</span>
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Threat Incident Alerts */}
 {activeTab === 'alerts' && (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 {alerts.length === 0 ? (
 <div className="text-center p-12 text-slate-500 text-sm glass-panel w-full col-span-2">No security incident alerts generated.</div>
 ) : alerts.map(a => (
 <div 
 key={a.id} 
 className={`glass-card p-5 border relative overflow-hidden transition-all ${
 a.status === 'RESOLVED' ? 'border-slate-200 bg-slate-950/40 opacity-70' : 
 a.severity === 'CRITICAL' ? 'border-slate-200 bg-rose-500/5' : 'border-slate-200 bg-amber-500/5'
 }`}
 >
 <div className="flex items-start space-x-3.5">
 <div className={`p-2.5 rounded-xl border ${
 a.status === 'RESOLVED' ? 'bg-slate-900 border-slate-200 text-slate-500' :
 a.severity === 'CRITICAL' ? 'bg-rose-500/15 border-slate-200 text-rose-400' : 'bg-amber-500/15 border-slate-200 text-emerald-600'
 }`}>
 <ShieldAlert className="w-5 h-5" />
 </div>

 <div className="space-y-2 w-full">
 <div className="flex justify-between items-start">
 <div>
 <h4 className="font-heading font-bold text-white text-base leading-tight">{a.title}</h4>
 <div className="flex items-center space-x-2 mt-1">
 <span className="text-[10px] text-slate-500 font-mono">Type: {a.alertType}</span>
 <span className="text-[10px] text-slate-500 font-mono">Target IP: {a.targetIp}</span>
 </div>
 </div>
 <span className="px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 bg-slate-950 text-slate-400">{a.status}</span>
 </div>

 <p className="text-xs text-slate-400 leading-relaxed font-sans mt-2">{a.description}</p>

 <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
 {a.status !== 'RESOLVED' ? (
 <button 
 disabled={actionLoadingId === String(a.id)}
 onClick={() => handleResolveAlert(String(a.id))}
 className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-xs transition-all shadow-md shadow-emerald-600/10 flex items-center space-x-1"
 >
 {actionLoadingId === String(a.id) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
 <span>Resolve alert</span>
 </button>
 ) : (
 <span className="text-[10px] text-slate-500 italic">Resolved: {a.resolvedBy}</span>
 )}
 </div>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}

 {/* Blacklist Modal */}
 {blockModalOpen && (
 <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
 <div className="glass-panel w-full max-w-md p-6 space-y-6 border-slate-200">
 <div className="flex items-center justify-between border-b border-slate-200 pb-4">
 <h3 className="font-heading font-bold text-lg text-white flex items-center space-x-2">
 <Ban className="w-5 h-5 text-rose-400" />
 <span>Blacklist Host IP</span>
 </h3>
 <button onClick={() => setBlockModalOpen(false)} className="text-slate-400 hover:text-white">✕</button>
 </div>

 <form onSubmit={handleManualBlock} className="space-y-4">
 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Target IPv4/IPv6 Address *</label>
 <input 
 required 
 type="text" 
 value={newIp}
 onChange={(e) => setNewIp(e.target.value)}
 placeholder="e.g. 203.0.113.88" 
 className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-sm text-white focus:border-rose-500 focus:outline-none" 
 />
 </div>

 <div>
 <label className="text-xs font-semibold text-slate-300 block mb-1">Reason for Blacklist *</label>
 <textarea 
 required
 rows={3}
 value={newReason}
 onChange={(e) => setNewReason(e.target.value)}
 placeholder="e.g. Volumetric HTTP scanning, SQL injection attempts logged." 
 className="w-full bg-white border border-slate-200 rounded-card px-3 py-2 text-xs text-white focus:border-rose-500 focus:outline-none resize-none" 
 />
 </div>

 <div className="pt-4 flex justify-end space-x-3 text-xs font-semibold">
 <button type="button" onClick={() => setBlockModalOpen(false)} className="px-4 py-2 rounded-xl text-slate-400 hover:text-white">Cancel</button>
 <button type="submit" disabled={blockModalLoading} className="px-4 py-2 rounded-xl bg-rose-500 text-white hover:bg-rose-450 transition-all shadow-lg shadow-rose-500/10 flex items-center space-x-1.5">
 {blockModalLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
 <span>Block Origin Host</span>
 </button>
 </div>
 </form>
 </div>
 </div>
 )}
 </div>
 );
};
