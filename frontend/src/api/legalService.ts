import { apiClient } from './client';

/**
 * Two functions here — `terminateContract` and `deleteClause` — no longer do what
 * their names say. `POST /legal/contracts/{id}/terminate` and
 * `DELETE /legal/clauses/{id}` both go through `GovernedActionGateway.raise` for
 * CONTRACT_TERMINATE and LEGAL_CLAUSE_DELETE: they raise an approval request and
 * mutate nothing. The 200 they answer with carries a pending-approval DTO
 * (`pendingApproval: true`, `approvalRequestId`, `requiredApprovals`, ...), so the
 * contract is still ACTIVE and the clause is still attached when the promise
 * resolves. A caller that reads 200 as "done" — hides the row, prints "Contract
 * terminated" — is lying to its user, and a reload will contradict it.
 *
 * `reason` is required rather than optional on purpose. The gate refuses any
 * request without a justification of at least ten trimmed characters, so a call
 * that omits it can only ever fail with a 422; making the parameter mandatory moves
 * that failure from runtime to `tsc`. Neither function has a call site yet, which
 * is the only reason this could be tightened without a migration.
 *
 * On the DELETE the reason goes in the query string rather than a body. The handler
 * accepts both, but a DELETE body is stripped by some proxies and a query parameter
 * always arrives — and a reason that silently vanishes in transit reproduces exactly
 * the 422 this change exists to prevent.
 */
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
  async terminateContract(id: string, reason: string) {
    const { data } = await apiClient.post(`/legal/contracts/${id}/terminate`, { reason });
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
  async deleteClause(clauseId: string, reason: string) {
    const { data } = await apiClient.delete(`/legal/clauses/${clauseId}?reason=${encodeURIComponent(reason)}`);
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
