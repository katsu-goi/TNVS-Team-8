import { apiClient } from './client';

export type WorkspaceMetric = {
  label: string;
  value: number | string;
  suffix?: string;
  tone?: 'success' | 'warning' | 'danger' | 'info';
};

export type WorkspacePayload = {
  workspace: string;
  section: string;
  generatedAt: string;
  metrics: WorkspaceMetric[];
  rows: Record<string, any>[];
  alerts: Record<string, any>[];
};

const dataOf = <T>(response: { data?: { data?: T } }): T => response.data?.data as T;

export const governanceService = {
  async getWorkspace(workspace: string, section: string): Promise<WorkspacePayload> {
    return dataOf<WorkspacePayload>(await apiClient.get(`/governance/workspace/${workspace}/${section}`));
  },

  async submitLegalContract(id: string): Promise<void> {
    await apiClient.post(`/governance/legal/contracts/${id}/submit`);
  },

  async decideLegalContract(id: string, statusAction: 'COUNSEL_APPROVED' | 'REJECTED_REVISION', counselComments?: string): Promise<void> {
    await apiClient.post(`/governance/legal/contracts/${id}/counsel-action`, { statusAction, counselComments });
  },

  async decideManagerSignoff(id: string, approve: boolean, comments?: string): Promise<void> {
    await apiClient.post(`/governance/management/signoffs/${id}/decision`, { approve, comments });
  },

  async decideDepartmentApproval(id: string, decision: 'APPROVED' | 'RETURNED' | 'REJECTED', comments?: string): Promise<void> {
    await apiClient.post(`/governance/department/approvals/${id}/decision`, { decision, comments });
  },

  async revealPrivacyLog(id: string, justification: string): Promise<Record<string, any>> {
    return dataOf<Record<string, any>>(await apiClient.post(`/governance/privacy/logs/${id}/reveal`, { justification }));
  },

  async decideCctvExport(id: string, approve: boolean, justification: string): Promise<void> {
    await apiClient.post(`/governance/privacy/cctv/${id}/decision`, { approve, justification });
  },

  async runRetention(): Promise<{ deleted: number; anonymized: number }> {
    return dataOf<{ deleted: number; anonymized: number }>(await apiClient.post('/governance/privacy/retention/run'));
  },

  async decideCctvCustody(id: string, approve: boolean): Promise<void> {
    await apiClient.post(`/governance/records/cctv/${id}/decision`, { approve });
  },

  async vaultArchive(id: string): Promise<void> {
    await apiClient.post(`/governance/records/archives/${id}/vault`);
  },
};
