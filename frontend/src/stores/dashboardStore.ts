import { create } from 'zustand';

export interface SystemStats {
  cpuUsage: number;
  memoryUsage: number;
  totalMemory: number;
  dbConnections: number;
  apiRequests: number;
}

interface DashboardState {
  metrics: any | null;
  systemStats: SystemStats | null;
  chartData: any[];
  aiInsights: any | null;
  loading: boolean;
  error: string | null;
  setMetrics: (metrics: any) => void;
}

/**
 * Local dashboard snapshot state. Live invalidation is provided centrally by
 * useRealtimeSyncStore through Supabase Realtime; this store intentionally has
 * no transport client of its own.
 */
export const useDashboardStore = create<DashboardState>((set) => ({
  metrics: null,
  systemStats: null,
  chartData: [],
  aiInsights: null,
  loading: true,
  error: null,

  setMetrics: (metrics) => set({ metrics }),
}));
