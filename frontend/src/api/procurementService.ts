import { apiClient } from './client';

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
  terminateContract: (id: string) => apiClient.post(`/procurement/contracts/${id}/terminate`),

  // Clauses
  addClause: (contractId: string, data: any) =>
    apiClient.post(`/procurement/contracts/${contractId}/clauses`, data),
  updateClause: (id: string, data: any) => apiClient.put(`/procurement/clauses/${id}`, data),
  deleteClause: (id: string) => apiClient.delete(`/procurement/clauses/${id}`),

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
  deleteObligation: (id: string) => apiClient.delete(`/procurement/obligations/${id}`),

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
