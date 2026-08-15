import { apiClient } from './client';

export interface ReviewableRequest {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  status: string;
  decisionNotes?: string | null;
  requesterId?: string | null;
  requesterName?: string | null;
  createdAt: string;
  updatedAt?: string | null;
}

export const requestReviewService = {
  async getForReview(): Promise<ReviewableRequest[]> {
    const { data } = await apiClient.get('/requests-review');
    return data?.data ?? [];
  },
  async approve(id: string): Promise<ReviewableRequest> {
    const { data } = await apiClient.post(`/requests-review/${id}/approve`);
    return data?.data;
  },
  async reject(id: string, reason?: string): Promise<ReviewableRequest> {
    const { data } = await apiClient.post(`/requests-review/${id}/reject`, { reason: reason || null });
    return data?.data;
  },
  async complete(id: string): Promise<ReviewableRequest> {
    const { data } = await apiClient.post(`/requests-review/${id}/complete`);
    return data?.data;
  },
};