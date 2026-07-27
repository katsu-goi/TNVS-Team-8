import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
 Users, UserCheck, ShieldAlert, FileText, Radio, CheckCircle,
 Clock, Activity, BellRing, TrendingUp, TrendingDown, Calendar, AlertTriangle,
 RefreshCw, AlertCircle, Building2, Scale, BarChart3, Wrench
} from 'lucide-react';
import { useDashboardStore } from '../../stores/dashboardStore';
import { dashboardService } from '../../api/dashboardService';
import type { DashboardStats, ChartDataPoint, AiInsightData } from '../../api/dashboardService';
import LiveNotificationCenter from './LiveNotificationCenter';
import {
 AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
 BarChart, LineChart, CartesianGrid, Bar, Line
} from 'recharts';

export const ExecutiveDashboard: React.FC = () => {
 const navigate = useNavigate();
 const store = useDashboardStore();
 const [localLoading, setLocalLoading] = useState(true);
 const [localError, setLocalError] = useState<string | null>(null);
 const [localStats, setLocalStats] = useState<DashboardStats | null>(null);
 const [localChartData, setLocalChartData] = useState<ChartDataPoint[]>([]);
 const [localAiInsights, setLocalAiInsights] = useState<AiInsightData | null>(null);
 const [retryCount, setRetryCount] = useState(0);

 const loadData = useCallback(async () => {
 setLocalLoading(true);
 setLocalError(null);
 try {
 const { stats, chartData, aiInsights } = await dashboardService.loadFullDashboard();
 setLocalStats(stats);
 setLocalChartData(chartData);
 setLocalAiInsights(aiInsights);
 store.setMetrics(stats as any);
 store.setChartData(chartData);
 store.setAiInsights(aiInsights);
 store.setLoading(false);
 store.setError(null);
 } catch (err: any) {
 const msg = err?.message || 'Failed to load dashboard data';
 console.error('[Dashboard] Load error:', msg);
 setLocalError(msg);
 store.setError(msg);
 } finally {
 setLocalLoading(false);
 }
 }, [retryCount]);

 useEffect(() => {
 loadData();
 }, [loadData]);

 useEffect(() => {
 store.connectWebSocket();
 }, []);

 const metrics = localStats;
 const chartData = localChartData.length > 0 ? localChartData : store.chartData;
 const aiInsights = localAiInsights || store.aiInsights;

 const totalUsers = (metrics?.totalVisitors || 0) + (metrics?.activeSessions || 0);
 const pendingReports = metrics?.totalReservations || 0;
 const resolvedCases = metrics?.totalLegalCases || 0;
 const uploadedFiles = metrics?.totalDocuments || 0;

 if (localLoading) {
 return (
 <div className="space-y-6">
  <div className="glass-panel p-4">
  <div className="animate-pulse flex items-center space-x-4">
  <div className="h-4 w-48 bg-slate-200 rounded"></div>
  <div className="h-4 w-32 bg-slate-200 rounded"></div>
  </div>
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
  {Array.from({ length: 8 }).map((_, i) => (
  <div key={i} className="glass-panel p-5 animate-pulse">
  <div className="h-3 w-24 bg-slate-200 rounded mb-3"></div>
  <div className="h-8 w-16 bg-slate-200 rounded"></div>
  </div>
  ))}
  </div>
  <div className="glass-panel p-6 animate-pulse">
  <div className="h-4 w-40 bg-slate-200 rounded mb-4"></div>
  <div className="space-y-2">
  {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-3 w-full bg-slate-200 rounded"></div>)}
  </div>
  </div>
 </div>
 );
 }

 if (localError && !metrics) {
 return (
 <div className="space-y-6">
 <div className="glass-panel p-6 border-slate-200 text-center space-y-4">
 <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
 <div>
  <h3 className="text-lg font-heading font-bold text-slate-900">Dashboard Connection Error</h3>
 <p className="text-sm text-slate-400 mt-1">{localError}</p>
 </div>
 <button
 onClick={() => setRetryCount(c => c + 1)}
 className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700/90 text-white font-semibold text-xs inline-flex items-center space-x-2"
 >
 <RefreshCw className="w-4 h-4" />
 <span>Retry Loading</span>
 </button>
 </div>
 </div>
 );
 }

 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between glass-panel p-5">
 <div>
 <h1 className="text-[34px] font-extrabold font-heading text-slate-900 leading-tight">Enterprise Command Center</h1>
 <p className="text-slate-500 text-sm mt-1">Real-time Enterprise Resource & Performance Monitoring</p>
 </div>
 <div className="flex items-center space-x-3">
  <div className="flex items-center px-3 py-1.5 bg-emerald-50 rounded-lg border border-emerald-200">
  <Radio className={`w-4 h-4 mr-2 ${store.connected || metrics ? 'text-emerald-600 animate-pulse' : 'text-rose-500'}`} />
  <span className={`text-xs font-mono font-semibold ${store.connected || metrics ? 'text-emerald-600' : 'text-rose-500'}`}>
  {store.connected ? 'LIVE (STOMP)' : metrics ? 'DATA READY' : 'LOADING...'}
  </span>
  </div>
 <LiveNotificationCenter />
 <button
 onClick={() => setRetryCount(c => c + 1)}
  className="p-2 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 transition text-slate-400 hover:text-slate-700"
 title="Refresh Dashboard"
 >
 <RefreshCw className="w-4 h-4" />
 </button>
 </div>
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
 <DashboardCard title="Total Users" value={totalUsers} icon={Users} color="text-emerald-600" bg="bg-blue-500/10" onClick={() => navigate('/visitors')} />
 <DashboardCard title="Active Sessions" value={metrics?.activeSessions || 0} icon={UserCheck} color="text-emerald-600" bg="bg-emerald-50" onClick={() => navigate('/security')} />
 <DashboardCard title="Active Facilities" value={metrics?.totalFacilities || 0} icon={Building2} color="text-emerald-600" bg="bg-emerald-50" onClick={() => navigate('/facilities/reservations')} />
 <DashboardCard title="Blocked IPs" value={metrics?.blockedIpsCount || 0} icon={ShieldAlert} color="text-orange-400" bg="bg-orange-500/10" onClick={() => navigate('/security')} />
 </div>

 <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
 <DashboardCard title="Active Reservations" value={pendingReports} icon={Clock} color="text-emerald-600" bg="bg-emerald-50" onClick={() => navigate('/facilities/reservations')} />
 <DashboardCard title="Legal Cases" value={resolvedCases} icon={Scale} color="text-emerald-600" bg="bg-emerald-50" onClick={() => navigate('/legal')} />
 <DashboardCard title="Total Documents" value={uploadedFiles} icon={FileText} color="text-emerald-600" bg="bg-emerald-50" onClick={() => navigate('/documents')} />
 <DashboardCard title="Open Alerts" value={metrics?.activeAlertsCount || 0} icon={BellRing} color="text-rose-400" bg="bg-rose-500/10" onClick={() => navigate('/security')} />
 </div>

 {aiInsights && (
 <div className="glass-panel p-6">
 <h3 className="text-[22px] font-bold text-slate-900 mb-4 flex items-center">
 <Activity className="w-5 h-5 mr-2 text-emerald-600" /> AI Insights
 </h3>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-500 text-[15px]">
 <div className="space-y-3">
 <div className="flex items-start space-x-2">
 <BarChart3 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
  <p className="text-[15px] leading-relaxed">{aiInsights.documentClassification}</p>
 </div>
 <div className="flex items-start space-x-2">
 <AlertTriangle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
  <p className="text-[15px] leading-relaxed">{aiInsights.complianceRisks}</p>
 </div>
 <div className="flex items-start space-x-2">
 <FileText className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
  <p className="text-[15px] leading-relaxed">{aiInsights.contractRisks}</p>
 </div>
 </div>
 <div className="space-y-3">
 <div className="flex items-start space-x-2">
 <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
  <p className="text-[15px] leading-relaxed">{aiInsights.duplicateDocuments}</p>
 </div>
 <div className="flex items-start space-x-2">
 <Clock className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
  <p className="text-[15px] leading-relaxed">{aiInsights.expiringRecords}</p>
 </div>
 <div className="flex items-start space-x-2">
 <Building2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
  <p className="text-[15px] leading-relaxed">{aiInsights.facilityOccupancy}</p>
 </div>
 </div>
 </div>
 </div>
 )}

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
 <ChartCard title="Document Classification" icon={<TrendingUp className="w-4 h-4 mr-2 text-emerald-600" />}>
 <ResponsiveContainer width="100%" height={250}>
 <BarChart data={chartData.filter(d => d.type === 'docClass')}>
 <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 41, 59, 0.5)" />
 <XAxis dataKey="category" stroke="#64748b" tick={{ fontSize: 11 }} />
 <YAxis stroke="#64748b" />
  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', fontSize: 12, borderRadius: 8, color: '#0F172A' }} />
 <Bar dataKey="count" fill="#00E676" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </ChartCard>

 <ChartCard title="Monthly Uploads" icon={<TrendingDown className="w-4 h-4 mr-2 text-emerald-600" />}>
 <ResponsiveContainer width="100%" height={250}>
 <AreaChart data={chartData.filter(d => d.type === 'monthlyUploads')}>
 <defs>
 <linearGradient id="colorUploads" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#00E676" stopOpacity={0.3} />
 <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
 </linearGradient>
 </defs>
 <XAxis dataKey="month" stroke="#64748b" tick={{ fontSize: 11 }} />
 <YAxis stroke="#64748b" />
  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', fontSize: 12, borderRadius: 8, color: '#0F172A' }} />
 <Area type="monotone" dataKey="uploads" stroke="#00E676" fillOpacity={1} fill="url(#colorUploads)" />
 </AreaChart>
 </ResponsiveContainer>
 </ChartCard>

 <ChartCard title="Compliance Trend" icon={<Calendar className="w-4 h-4 mr-2 text-green-600" />}>
 <ResponsiveContainer width="100%" height={250}>
 <LineChart data={chartData.filter(d => d.type === 'complianceTrend')}>
 <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 41, 59, 0.5)" />
 <XAxis dataKey="period" stroke="#64748b" tick={{ fontSize: 11 }} />
 <YAxis stroke="#64748b" />
  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', fontSize: 12, borderRadius: 8, color: '#0F172A' }} />
 <Line type="monotone" dataKey="rate" stroke="#22C55E" strokeWidth={2} dot={{ fill: '#22C55E' }} />
 </LineChart>
 </ResponsiveContainer>
 </ChartCard>

 <ChartCard title="Contract Risk Distribution" icon={<AlertTriangle className="w-4 h-4 mr-2 text-red-600" />}>
 <ResponsiveContainer width="100%" height={250}>
 <BarChart data={chartData.filter(d => d.type === 'contractAnalytics')}>
 <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 41, 59, 0.5)" />
 <XAxis dataKey="category" stroke="#64748b" tick={{ fontSize: 11 }} />
 <YAxis stroke="#64748b" />
  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', fontSize: 12, borderRadius: 8, color: '#0F172A' }} />
 <Bar dataKey="value" fill="#FB7185" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </ChartCard>

 <ChartCard title="Reservation Trends" icon={<Calendar className="w-4 h-4 mr-2 text-emerald-600" />}>
 <ResponsiveContainer width="100%" height={250}>
 <AreaChart data={chartData.filter(d => d.type === 'reservationTrend')}>
 <defs>
 <linearGradient id="colorRes" x1="0" y1="0" x2="0" y2="1">
 <stop offset="5%" stopColor="#00E676" stopOpacity={0.3} />
 <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
 </linearGradient>
 </defs>
 <XAxis dataKey="date" stroke="#64748b" tick={{ fontSize: 11 }} />
 <YAxis stroke="#64748b" />
  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', fontSize: 12, borderRadius: 8, color: '#0F172A' }} />
 <Area type="monotone" dataKey="reservations" stroke="#00E676" fillOpacity={1} fill="url(#colorRes)" />
 </AreaChart>
 </ResponsiveContainer>
 </ChartCard>

 <ChartCard title="Maintenance Requests" icon={<Wrench className="w-4 h-4 mr-2 text-amber-600" />}>
 <ResponsiveContainer width="100%" height={250}>
 <BarChart data={chartData.filter(d => d.type === 'maintenance')}>
 <CartesianGrid strokeDasharray="3 3" stroke="rgba(30, 41, 59, 0.5)" />
 <XAxis dataKey="category" stroke="#64748b" tick={{ fontSize: 11 }} />
 <YAxis stroke="#64748b" />
  <Tooltip contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', fontSize: 12, borderRadius: 8, color: '#0F172A' }} />
 <Bar dataKey="count" fill="#F59E0B" radius={[4, 4, 0, 0]} />
 </BarChart>
 </ResponsiveContainer>
 </ChartCard>
 </div>

 <div className="glass-panel p-4 flex items-center justify-between text-xs text-slate-400">
 <span className="flex items-center space-x-2">
 <Activity className="w-3.5 h-3.5 text-green-600" />
 <span>Data sourced from Supabase{store.connected ? ' + STOMP WebSocket' : ''}</span>
 </span>
 <button
 onClick={() => setRetryCount(c => c + 1)}
 className="flex items-center space-x-1 text-emerald-600 hover:underline"
 >
 <RefreshCw className="w-3 h-3" />
 <span>Refresh</span>
 </button>
 </div>
 </div>
 );
};

const DashboardCard = ({ title, value, icon: Icon, color, bg, onClick }: any) => {
 return (
 <div
 onClick={onClick}
 className="card-stat p-5 cursor-pointer hover:border-emerald-200 transition-all duration-200 group relative overflow-hidden"
 >
 <div className={`absolute top-0 right-0 w-32 h-32 ${bg} blur-3xl -mr-10 -mt-10 rounded-full opacity-50 group-hover:opacity-100 transition-opacity`}></div>
 <div className="relative z-10 flex justify-between items-start">
 <div>
  <p className="text-slate-400 text-xs font-semibold mb-2 uppercase tracking-[0.08em]">{title}</p>
  <p className="text-[42px] font-bold text-slate-900 mt-1 group-hover:scale-105 transform origin-left transition-transform duration-200 leading-none">{value}</p>
 </div>
  <div className="p-3 rounded-lg bg-slate-100">
 <Icon className={`w-5 h-5 ${color}`} />
 </div>
 </div>
 </div>
 );
};

const ChartCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
 <div className="card-stat p-5">
 <h3 className="text-[22px] font-bold text-slate-900 mb-4 flex items-center">{icon} {title}</h3>
 {children}
 </div>
);
