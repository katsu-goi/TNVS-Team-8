import { apiClient } from './client';

export const legalService = {
  async getDashboardSummary() {
    const { data } = await apiClient.get('/legal/dashboard/summary');
    return data?.data ?? {};
  },

  // --- Contracts ---
  async getContracts(status?: string) {
    const { data } = await apiClient.get('/legal/contracts', { params: status ? { status } : {} });
    return data?.data ?? [];
  },
  async getContract(id: string) {
    const { data } = await apiClient.get(`/legal/contracts/${id}`);
    return data?.data;
  },
  async createContract(body: Record<string, unknown>) {
    const { data } = await apiClient.post('/legal/contracts', body);
    return data?.data;
  },
  async updateContract(id: string, body: Record<string, unknown>) {
    const { data } = await apiClient.put(`/legal/contracts/${id}`, body);
    return data?.data;
  },
  async submitContractReview(id: string) {
    const { data } = await apiClient.post(`/legal/contracts/${id}/submit-review`);
    return data?.data;
  },
  async approveContract(id: string) {
    const { data } = await apiClient.post(`/legal/contracts/${id}/approve`);
    return data?.data;
  },
  async activateContract(id: string) {
    const { data } = await apiClient.post(`/legal/contracts/${id}/activate`);
    return data?.data;
  },
  async renewContract(id: string, body?: Record<string, unknown>) {
    const { data } = await apiClient.post(`/legal/contracts/${id}/renew`, body ?? {});
    return data?.data;
  },
  async terminateContract(id: string) {
    const { data } = await apiClient.post(`/legal/contracts/${id}/terminate`);
    return data?.data;
  },

  // --- Clauses ---
  async addClause(contractId: string, body: Record<string, unknown>) {
    const { data } = await apiClient.post(`/legal/contracts/${contractId}/clauses`, body);
    return data?.data;
  },
  async updateClause(clauseId: string, body: Record<string, unknown>) {
    const { data } = await apiClient.put(`/legal/clauses/${clauseId}`, body);
    return data?.data;
  },
  async deleteClause(clauseId: string) {
    const { data } = await apiClient.delete(`/legal/clauses/${clauseId}`);
    return data?.data;
  },

  // --- Legal cases ---
  async getCases(status?: string) {
    const { data } = await apiClient.get('/legal/cases', { params: status ? { status } : {} });
    return data?.data ?? [];
  },
  async getCase(id: string) {
    const { data } = await apiClient.get(`/legal/cases/${id}`);
    return data?.data;
  },
  async createCase(body: Record<string, unknown>) {
    const { data } = await apiClient.post('/legal/cases', body);
    return data?.data;
  },
  async updateCase(id: string, body: Record<string, unknown>) {
    const { data } = await apiClient.put(`/legal/cases/${id}`, body);
    return data?.data;
  },
  async changeCaseStatus(id: string, status: string, notes?: string) {
    const { data } = await apiClient.post(`/legal/cases/${id}/status`, { status, notes });
    return data?.data;
  },

  // --- Documents ---
  async getDocuments(status?: string) {
    const { data } = await apiClient.get('/legal/documents', { params: status ? { status } : {} });
    return data?.data ?? [];
  },
  async approveDocument(id: string) {
    const { data } = await apiClient.post(`/legal/documents/${id}/approve`);
    return data?.data;
  },

  // --- Retention policies (read-only) ---
  async getRetentionPolicies() {
    const { data } = await apiClient.get('/legal/retention-policies');
    return data?.data ?? [];
  },

  // --- Legal notices ---
  async getNotices() {
    const { data } = await apiClient.get('/legal/notices');
    return data?.data ?? [];
  },
  async acknowledgeNotice(id: string) {
    const { data } = await apiClient.post(`/legal/notices/${id}/acknowledge`);
    return data?.data;
  },
  async dismissNotice(id: string) {
    const { data } = await apiClient.post(`/legal/notices/${id}/dismiss`);
    return data?.data;
  },

  // --- Audit logs (read-only) ---
  async getAuditLogs() {
    const { data } = await apiClient.get('/legal/audit-logs');
    return data?.data ?? [];
  },
};
