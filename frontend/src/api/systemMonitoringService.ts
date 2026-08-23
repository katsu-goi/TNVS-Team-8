import { apiClient } from './client';
import type { SubsystemHealthSnapshot } from '../types/systemMonitoring';

export const systemMonitoringService = {
  async loadSubsystemHealth(): Promise<SubsystemHealthSnapshot | null> {
    try {
      // SystemMonitoringController maps `/v1/admin/system-monitoring` and the axios client
      // contributes `/api/v1`, so the leading `monitoring/` segment made this a 404 on
      // every poll. The catch below turned that into `null`, which the page renders as
      // "no data" - so the route looked empty rather than broken.
      const res = await apiClient.get('/admin/system-monitoring/subsystems');
      return res.data?.data ?? null;
    } catch (err) {
      console.warn('Failed to load subsystem health:', err);
      return null;
    }
  },
};