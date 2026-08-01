import { apiClient } from './client';

export const employeeService = {
  // --- Dashboard ---
  async getDashboardSummary() {
    const { data } = await apiClient.get('/employee/dashboard/summary');
    return data?.data ?? {};
  },

  // --- Reservations ---
  async getReservations() {
    const { data } = await apiClient.get('/employee/reservations');
    return data?.data ?? [];
  },
  async createReservation(body: Record<string, unknown>) {
    const { data } = await apiClient.post('/employee/reservations', body);
    return data?.data;
  },
  async updateReservation(id: string, body: Record<string, unknown>) {
    const { data } = await apiClient.put(`/employee/reservations/${id}`, body);
    return data?.data;
  },
  async cancelReservation(id: string) {
    const { data } = await apiClient.post(`/employee/reservations/${id}/cancel`);
    return data?.data;
  },
  async getAvailableRooms(body: Record<string, unknown>) {
    const { data } = await apiClient.post('/employee/rooms/available', body);
    return data?.data ?? {};
  },
  async getRoomFilters() {
    const { data } = await apiClient.get('/employee/rooms/filters');
    return data?.data ?? {};
  },

  // --- Visitors ---
  async getVisitors() {
    const { data } = await apiClient.get('/employee/visitors');
    return data?.data ?? [];
  },
  async createVisitor(body: Record<string, unknown>) {
    const { data } = await apiClient.post('/employee/visitors', body);
    return data?.data;
  },
  async updateVisitor(id: string, body: Record<string, unknown>) {
    const { data } = await apiClient.put(`/employee/visitors/${id}`, body);
    return data?.data;
  },

  // --- Documents ---
  async getDocuments() {
    const { data } = await apiClient.get('/employee/documents');
    return data?.data ?? [];
  },
  async createDocument(body: Record<string, unknown>) {
    const { data } = await apiClient.post('/employee/documents', body);
    return data?.data;
  },

  // --- Contract / legal requests ---
  async getRequests() {
    const { data } = await apiClient.get('/employee/requests');
    return data?.data ?? [];
  },
  async createRequest(body: Record<string, unknown>) {
    const { data } = await apiClient.post('/employee/requests', body);
    return data?.data;
  },
  async cancelRequest(id: string) {
    const { data } = await apiClient.post(`/employee/requests/${id}/cancel`);
    return data?.data;
  },

  // --- Notifications ---
  async getNotifications() {
    const { data } = await apiClient.get('/employee/notifications');
    return data?.data ?? [];
  },
  async getUnreadCount() {
    const { data } = await apiClient.get('/employee/notifications/unread-count');
    return data?.data ?? 0;
  },
  async markNotificationRead(id: string) {
    const { data } = await apiClient.post(`/employee/notifications/${id}/read`);
    return data?.data;
  },
  async markAllNotificationsRead() {
    const { data } = await apiClient.post('/employee/notifications/read-all');
    return data?.data;
  },
  async dismissNotification(id: string) {
    const { data } = await apiClient.post(`/employee/notifications/${id}/dismiss`);
    return data?.data;
  },

  // --- Profile ---
  async getProfile() {
    const { data } = await apiClient.get('/employee/profile');
    return data?.data ?? {};
  },
  async updateProfile(body: Record<string, unknown>) {
    const { data } = await apiClient.put('/employee/profile', body);
    return data?.data;
  },
};
