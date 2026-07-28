import { apiClient } from './client';

export const facilitiesService = {
  async getDashboardKpi() {
    const { data } = await apiClient.get('/facilities-manager/dashboard/kpi');
    return data?.data ?? {};
  },
  async getReservations(params?: Record<string, any>) {
    const { data } = await apiClient.get('/facilities-manager/reservations', { params });
    return data?.data ?? { overview: {}, reservations: [] };
  },
  async approveReservation(id: string) {
    const { data } = await apiClient.post(`/facilities-manager/reservations/${id}/approve`);
    return data?.data;
  },
  async rejectReservation(id: string, reason?: string) {
    const { data } = await apiClient.post(`/facilities-manager/reservations/${id}/reject`, { reason });
    return data?.data;
  },
  async getRoomSummary() {
    const { data } = await apiClient.get('/facilities-manager/rooms/summary');
    return data?.data ?? {};
  },
  async getAllRooms() {
    const { data } = await apiClient.get('/facilities-manager/rooms');
    return data?.data ?? [];
  },
  async getAssetOverview() {
    const { data } = await apiClient.get('/facilities-manager/assets');
    return data?.data ?? {};
  },
  async listAssets() {
    const { data } = await apiClient.get('/facilities-manager/assets/list');
    return data?.data ?? [];
  },
  async getCalendar(year?: number, month?: number) {
    const { data } = await apiClient.get('/facilities-manager/calendar', { params: { year, month } });
    return data?.data ?? [];
  },
  async getAnalytics() {
    const { data } = await apiClient.get('/facilities-manager/analytics');
    return data?.data ?? {};
  },
  async getReports(type?: string, startDate?: string, endDate?: string) {
    const { data } = await apiClient.get('/facilities-manager/reports', { params: { type, startDate, endDate } });
    return data?.data ?? {};
  },
};
