import { apiClient } from './client';
import type { SubsystemHealthSnapshot } from '../types/systemMonitoring';

export const systemMonitoringService = {
  async loadSubsystemHealth(): Promise<SubsystemHealthSnapshot | null> {
    try {
      const res = await apiClient.get('/admin/system-monitoring/subsystems');
      return res.data?.data ?? null;
    } catch (err) {
      console.warn('Failed to load subsystem health:', err);
      return null;
    }
  },
};