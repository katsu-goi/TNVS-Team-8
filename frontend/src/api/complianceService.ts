import { apiClient } from './client';

export const complianceService = {
  async getDashboardSummary() {
    const { data } = await apiClient.get('/compliance/dashboard/summary');
    return data?.data ?? {};
  },
  async getDocuments(status?: string) {
    const { data } = await apiClient.get('/compliance/documents', { params: status ? { status } : {} });
    return data?.data ?? [];
  },
  async getContracts(status?: string) {
    const { data } = await apiClient.get('/compliance/contracts', { params: status ? { status } : {} });
    return data?.data ?? [];
  },
  async getRetentionPolicies() {
    const { data } = await apiClient.get('/compliance/retention-policies');
    return data?.data ?? [];
  },
  async getAuditLogs() {
    const { data } = await apiClient.get('/compliance/audit-logs');
    return data?.data ?? [];
  },

  // --- Document actions ---
  async approveDocument(id: string) {
    const { data } = await apiClient.post(`/compliance/documents/${id}/approve`);
    return data?.data;
  },
  async archiveDocument(id: string) {
    const { data } = await apiClient.post(`/compliance/documents/${id}/archive`);
    return data?.data;
  },
  async requestDisposal(id: string, reason: string) {
    const { data } = await apiClient.post(`/compliance/documents/${id}/disposal`, { reason });
    return data?.data;
  },

  // --- Retention policy management ---
  async createRetentionPolicy(body: Record<string, unknown>) {
    const { data } = await apiClient.post('/compliance/retention-policies', body);
    return data?.data;
  },
  async updateRetentionPolicy(id: string, body: Record<string, unknown>) {
    const { data } = await apiClient.put(`/compliance/retention-policies/${id}`, body);
    return data?.data;
  },
  async toggleRetentionPolicy(id: string) {
    const { data } = await apiClient.post(`/compliance/retention-policies/${id}/toggle`);
    return data?.data;
  },

  // --- Disposal approvals ---
  async getDisposals(status?: string) {
    const { data } = await apiClient.get('/compliance/disposals', { params: status ? { status } : {} });
    return data?.data ?? [];
  },
  async approveDisposal(id: string, notes?: string) {
    const { data } = await apiClient.post(`/compliance/disposals/${id}/approve`, { notes });
    return data?.data;
  },
  async rejectDisposal(id: string, notes?: string) {
    const { data } = await apiClient.post(`/compliance/disposals/${id}/reject`, { notes });
    return data?.data;
  },

  // --- Compliance alerts ---
  async getAlerts() {
    const { data } = await apiClient.get('/compliance/alerts');
    return data?.data ?? [];
  },
  async acknowledgeAlert(id: string) {
    const { data } = await apiClient.post(`/compliance/alerts/${id}/acknowledge`);
    return data?.data;
  },
  async dismissAlert(id: string) {
    const { data } = await apiClient.post(`/compliance/alerts/${id}/dismiss`);
    return data?.data;
  },
};
