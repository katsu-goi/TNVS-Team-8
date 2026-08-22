import { apiClient } from './client';

/**
 * Three functions here — `terminateContract`, `deleteClause` and `deleteObligation`
 * — no longer do what their names say. Each route runs through
 * `GovernedActionGateway.raise` (CONTRACT_TERMINATE, LEGAL_CLAUSE_DELETE,
 * OBLIGATION_DELETE) and mutates nothing: the 200 they answer with carries a
 * pending-approval DTO (`pendingApproval: true`, `approvalRequestId`,
 * `requiredApprovals`, ...), and the contract, clause or obligation is still there
 * when the promise resolves. A caller must not read that 200 as "done" — no
 * removing the row from local state, no "Contract terminated" toast. The executor
 * runs later, once the approvals are recorded.
 *
 * `reason` is required rather than optional on purpose. The gate refuses any request
 * without a justification of at least ten trimmed characters, so a call that omits
 * it can only fail with a 422; a mandatory parameter turns that into a compile error
 * at the next call site instead. None of the three has a call site yet, which is the
 * only reason this could be tightened without a migration.
 *
 * On the two DELETEs the reason goes in the query string rather than a body. The
 * handlers accept both, but a DELETE body is stripped by some proxies and a query
 * parameter always arrives — a reason lost in transit reproduces exactly the 422
 * this change exists to prevent.
 */
export const procurementService = {
  // Dashboard
  getDashboardSummary: () => apiClient.get('/procurement/dashboard/summary'),

  // Contracts
  getContracts: (params?: { status?: string; vendorId?: string }) =>
    apiClient.get('/procurement/contracts', { params }),
  getContract: (id: string) => apiClient.get(`/procurement/contracts/${id}`),
  createContract: (data: any) => apiClient.post('/procurement/contracts', data),
  updateContract: (id: string, data: any) => apiClient.put(`/procurement/contracts/${id}`, data),
  submitContractReview: (id: string) => apiClient.post(`/procurement/contracts/${id}/submit-review`),
  approveContract: (id: string) => apiClient.post(`/procurement/contracts/${id}/approve`),
  activateContract: (id: string) => apiClient.post(`/procurement/contracts/${id}/activate`),
  renewContract: (id: string, data?: any) => apiClient.post(`/procurement/contracts/${id}/renew`, data),
  terminateContract: (id: string, reason: string) =>
    apiClient.post(`/procurement/contracts/${id}/terminate`, { reason }),

  // Clauses
  addClause: (contractId: string, data: any) =>
    apiClient.post(`/procurement/contracts/${contractId}/clauses`, data),
  updateClause: (id: string, data: any) => apiClient.put(`/procurement/clauses/${id}`, data),
  deleteClause: (id: string, reason: string) =>
    apiClient.delete(`/procurement/clauses/${id}?reason=${encodeURIComponent(reason)}`),

  // Vendors
  getVendors: (params?: { status?: string }) => apiClient.get('/procurement/vendors', { params }),
  getVendor: (id: string) => apiClient.get(`/procurement/vendors/${id}`),
  createVendor: (data: any) => apiClient.post('/procurement/vendors', data),
  updateVendor: (id: string, data: any) => apiClient.put(`/procurement/vendors/${id}`, data),
  changeVendorStatus: (id: string, status: string) =>
    apiClient.post(`/procurement/vendors/${id}/status`, { status }),
  recordVendorPerformance: (id: string, data: any) =>
    apiClient.post(`/procurement/vendors/${id}/performance`, data),

  // Vendor Obligations
  addObligation: (vendorId: string, data: any) =>
    apiClient.post(`/procurement/vendors/${vendorId}/obligations`, data),
  updateObligation: (id: string, data: any) => apiClient.put(`/procurement/obligations/${id}`, data),
  changeObligationStatus: (id: string, status: string) =>
    apiClient.post(`/procurement/obligations/${id}/status`, { status }),
  deleteObligation: (id: string, reason: string) =>
    apiClient.delete(`/procurement/obligations/${id}?reason=${encodeURIComponent(reason)}`),

  // Documents
  getDocuments: (params?: { status?: string }) => apiClient.get('/procurement/documents', { params }),
  approveDocument: (id: string) => apiClient.post(`/procurement/documents/${id}/approve`),

  // Legal Cases (read-only)
  getLegalCases: () => apiClient.get('/procurement/legal-cases'),

  // Notices
  getNotices: () => apiClient.get('/procurement/notices'),
  acknowledgeNotice: (id: string) => apiClient.post(`/procurement/notices/${id}/acknowledge`),
  dismissNotice: (id: string) => apiClient.post(`/procurement/notices/${id}/dismiss`),

  // Audit
  getAuditLogs: () => apiClient.get('/procurement/audit-logs'),
};
