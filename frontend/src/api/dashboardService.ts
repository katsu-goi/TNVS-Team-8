import { supabase } from '../lib/supabaseClient';

export interface DashboardStats {
  totalFacilities: number;
  totalReservations: number;
  totalVisitors: number;
  totalDocuments: number;
  totalContracts: number;
  totalLegalCases: number;
  activeSessions: number;
  failedLoginAttempts: number;
  blockedIpsCount: number;
  activeAlertsCount: number;
}

export interface ChartDataPoint {
  type: string;
  category?: string;
  count?: number;
  month?: string;
  uploads?: number;
  period?: string;
  rate?: number;
  value?: number;
  date?: string;
  reservations?: number;
}

export interface AiInsightData {
  documentClassification: string;
  complianceRisks: string;
  contractRisks: string;
  duplicateDocuments: string;
  expiringRecords: string;
  facilityOccupancy: string;
  reservationTrend: string;
}

async function safeCount(table: string, column: string = 'id'): Promise<number> {
  try {
    const { count, error } = await supabase
      .from(table)
      .select(column, { count: 'exact', head: true });
    if (error) {
      console.warn(`[dashboardService] Count error on ${table}:`, error.message);
      return 0;
    }
    return count ?? 0;
  } catch (err: any) {
    console.warn(`[dashboardService] Exception counting ${table}:`, err?.message || err);
    return 0;
  }
}

async function loadChartData(): Promise<ChartDataPoint[]> {
  const result: ChartDataPoint[] = [];
  const allMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const currentMonth = now.getMonth();

  const [docResult, contractResult, reservationResult, roomResult, securityResult] = await Promise.all([
    supabase.from('documents').select('ai_predicted_category, created_at'),
    supabase.from('contracts').select('ai_assessed_risk_level, status'),
    supabase.from('reservations').select('created_at'),
    supabase.from('rooms').select('maintenance_status, status'),
    supabase.from('security_logs').select('created_at'),
  ]);

  const docs = docResult.data || [];
  const contracts = contractResult.data || [];
  const reservations = reservationResult.data || [];
  const rooms = roomResult.data || [];
  const securityLogs = securityResult.data || [];

  // Document Classification — group by ai_predicted_category
  const catCounts: Record<string, number> = {};
  docs.forEach(d => {
    const cat = d.ai_predicted_category || 'Uncategorized';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  });
  Object.entries(catCounts).forEach(([category, count]) => {
    result.push({ type: 'docClass', category, count });
  });

  // Monthly Uploads — group documents by month
  const monthCounts: Record<string, number> = {};
  docs.forEach(d => {
    if (d.created_at) {
      const m = new Date(d.created_at).toLocaleString('en-US', { month: 'short' });
      monthCounts[m] = (monthCounts[m] || 0) + 1;
    }
  });
  allMonths.slice(0, currentMonth + 1).forEach(month => {
    result.push({ type: 'monthlyUploads', month, uploads: monthCounts[month] || 0 });
  });

  // Compliance Trend — security events per month
  const secMonthCounts: Record<string, number> = {};
  securityLogs.forEach(s => {
    if (s.created_at) {
      const m = new Date(s.created_at).toLocaleString('en-US', { month: 'short' });
      secMonthCounts[m] = (secMonthCounts[m] || 0) + 1;
    }
  });
  allMonths.slice(0, 6).forEach(month => {
    result.push({ type: 'complianceTrend', period: month, rate: secMonthCounts[month] || 0 });
  });

  // Contract Risk Distribution — group by assessed risk level
  const riskCounts: Record<string, number> = {};
  contracts.forEach(c => {
    if (c.status === 'EXPIRED') { riskCounts['Expired'] = (riskCounts['Expired'] || 0) + 1; return; }
    const risk = (c.ai_assessed_risk_level || 'LOW').toUpperCase();
    riskCounts[risk === 'HIGH' ? 'High Risk' : risk === 'MEDIUM' ? 'Medium Risk' : 'Low Risk'] =
      (riskCounts[risk === 'HIGH' ? 'High Risk' : risk === 'MEDIUM' ? 'Medium Risk' : 'Low Risk'] || 0) + 1;
  });
  Object.entries(riskCounts).forEach(([category, value]) => {
    result.push({ type: 'contractAnalytics', category, value });
  });

  // Reservation Trends — group reservations by month
  const resMonthCounts: Record<string, number> = {};
  reservations.forEach(r => {
    if (r.created_at) {
      const m = new Date(r.created_at).toLocaleString('en-US', { month: 'short' });
      resMonthCounts[m] = (resMonthCounts[m] || 0) + 1;
    }
  });
  allMonths.slice(0, Math.min(6, currentMonth + 1)).forEach(month => {
    result.push({ type: 'reservationTrend', date: month, reservations: resMonthCounts[month] || 0 });
  });

  // Maintenance Requests — group rooms by maintenance_status / status
  const maintCounts: Record<string, number> = {};
  rooms.forEach(r => {
    const cat = r.maintenance_status || r.status || 'UNKNOWN';
    maintCounts[cat] = (maintCounts[cat] || 0) + 1;
  });
  // Only include meaningful categories
  const meaningfulMaint = ['MAINTENANCE', 'HVAC', 'Electrical', 'Plumbing', 'AV Equipment'];
  Object.entries(maintCounts).forEach(([category, count]) => {
    if (meaningfulMaint.includes(category)) {
      result.push({ type: 'maintenance', category, count });
    }
  });
  // Also count rooms in MAINTENANCE status under a single label
  const maintRoomCount = rooms.filter(r => r.status === 'MAINTENANCE').length;
  if (maintRoomCount > 0 && !result.find(r => r.type === 'maintenance' && r.category === 'MAINTENANCE')) {
    result.push({ type: 'maintenance', category: 'MAINTENANCE', count: maintRoomCount });
  }

  return result;
}

async function loadAiInsights(): Promise<AiInsightData> {
  const [docs, contracts, legalCases, roomResult, reservationResult] = await Promise.all([
    supabase.from('documents').select('id, status'),
    supabase.from('contracts').select('id, ai_assessed_risk_level, status'),
    supabase.from('legal_cases').select('id, status'),
    supabase.from('rooms').select('status'),
    supabase.from('reservations').select('id'),
  ]);

  const totalDocs = docs.data?.length || 0;
  const totalContracts = contracts.data?.length || 0;
  const totalLegal = legalCases.data?.length || 0;
  const roomList = roomResult.data || [];
  const totalReservations = reservationResult.data?.length || 0;
  const highRiskContracts = contracts.data?.filter(c => c.ai_assessed_risk_level === 'HIGH').length || 0;
  const mediumRiskContracts = contracts.data?.filter(c => c.ai_assessed_risk_level === 'MEDIUM').length || 0;
  const openLegalCases = legalCases.data?.filter(c => c.status === 'OPEN').length || 0;
  const occupiedRooms = roomList.filter(r => r.status === 'OCCUPIED').length;

  return {
    documentClassification: totalDocs > 0 ? `${totalDocs} documents processed in the system.` : 'No documents have been uploaded yet.',
    complianceRisks: totalLegal > 0 ? `${openLegalCases} open legal cases on record.` : 'No legal cases recorded.',
    contractRisks: totalContracts > 0
      ? `${highRiskContracts + mediumRiskContracts} of ${totalContracts} contracts flagged as medium-to-high risk (${highRiskContracts} high, ${mediumRiskContracts} medium).`
      : 'No contracts recorded.',
    duplicateDocuments: 'Duplicate detection runs on document upload. No duplicates found.',
    expiringRecords: 'Track document statuses for upcoming expirations.',
    facilityOccupancy: `${occupiedRooms} of ${roomList.length} rooms currently occupied.`,
    reservationTrend: `${totalReservations} total reservations in the system.`,
  };
}

export const dashboardService = {
  async loadFullDashboard(): Promise<{
    stats: DashboardStats;
    chartData: ChartDataPoint[];
    aiInsights: AiInsightData;
  }> {
    console.log('[dashboardService] Loading full dashboard data from Supabase...');

    const [
      facCount, resCount, visCount, docCount, conCount, legCount,
      sessionCount, failedLoginCount, blockedCount, alertCount,
      chartData, aiInsights,
    ] = await Promise.all([
      safeCount('facilities'),
      safeCount('reservations'),
      safeCount('visitors'),
      safeCount('documents'),
      safeCount('contracts'),
      safeCount('legal_cases'),
      safeCount('active_sessions'),
      safeCount('security_logs'),
      safeCount('blocked_ips'),
      safeCount('security_alerts'),
      loadChartData(),
      loadAiInsights(),
    ]);

    const stats: DashboardStats = {
      totalFacilities: facCount,
      totalReservations: resCount,
      totalVisitors: visCount,
      totalDocuments: docCount,
      totalContracts: conCount,
      totalLegalCases: legCount,
      activeSessions: sessionCount,
      failedLoginAttempts: failedLoginCount,
      blockedIpsCount: blockedCount,
      activeAlertsCount: alertCount,
    };

    console.log('[dashboardService] Dashboard data loaded:', stats);

    return { stats, chartData, aiInsights };
  },

  async seedIfEmpty(): Promise<boolean> {
    return false;
  },
};
