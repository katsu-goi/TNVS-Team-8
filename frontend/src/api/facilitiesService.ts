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
  async getInventoryAlerts() {
    const { data } = await apiClient.get('/facilities-manager/inventory-alerts');
    return data?.data ?? [];
  },
  async initiateInventoryReorder(payload: { inventoryAssetId: string; requestedQuantity: number; supplierName?: string }) {
    const { data } = await apiClient.post('/facilities-manager/inventory-alerts/reorder', payload);
    return data?.data;
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
  async createRoom(payload: Record<string, any>) {
    const { data } = await apiClient.post('/facilities-manager/rooms', payload);
    return data?.data;
  },
  async updateRoom(id: string, payload: Record<string, any>) {
    const { data } = await apiClient.put(`/facilities-manager/rooms/${id}`, payload);
    return data?.data;
  },
  async scheduleMaintenance(id: string, payload: Record<string, any>) {
    const { data } = await apiClient.post(`/facilities-manager/rooms/${id}/maintenance`, payload);
    return data?.data;
  },
  async getMaintenanceSchedules() {
    const { data } = await apiClient.get('/facilities-manager/maintenance');
    return data?.data ?? [];
  },
  async searchAvailableRooms(payload: Record<string, any>) {
    const { data } = await apiClient.post('/facilities-officer/rooms/available', payload);
    return data?.data ?? { summary: {}, rooms: [] };
  },
  async getRoomFilterOptions() {
    const { data } = await apiClient.get('/facilities-officer/rooms/filters');
    return data?.data ?? {};
  },
  async getMyReservations() {
    const { data } = await apiClient.get('/facilities-officer/reservations');
    return data?.data ?? [];
  },
  async createReservation(payload: Record<string, any>) {
    const { data } = await apiClient.post('/facilities-officer/reservations', payload);
    return data?.data;
  },
  async cancelReservation(id: string) {
    const { data } = await apiClient.post(`/facilities-officer/reservations/${id}/cancel`);
    return data?.data;
  },
  async getFacilities() {
    const { data } = await apiClient.get('/facilities');
    return data?.data ?? [];
  },
  async createFacility(payload: Record<string, any>) {
    const { data } = await apiClient.post('/facilities', payload);
    return data?.data;
  },
  async aiSuggestRooms(payload: Record<string, any>) {
    const { data } = await apiClient.post('/facilities-officer/ai/suggest', payload);
    return data?.data ?? { suggestions: [] };
  },
  async aiDraftReservation(payload: Record<string, any>) {
    const { data } = await apiClient.post('/facilities-officer/ai/draft', payload);
    return data?.data ?? {};
  },
  async aiValidateReservation(payload: Record<string, any>) {
    const { data } = await apiClient.post('/facilities-officer/ai/validate', payload);
    return data?.data ?? { valid: true, warnings: [], alternatives: [] };
  },
  async routeFacilityDocument(payload: { documentId: string; documentCategory: string; permitNumber?: string; expiresOn?: string }) {
    const { data } = await apiClient.post('/facilities-officer/facility-documents/route', payload);
    return data?.data;
  },
  async aiSuggestApproval(id: string) {
    const { data } = await apiClient.post(`/facilities-manager/reservations/${id}/ai/approval-suggest`);
    return data?.data ?? {};
  },
};
