import { apiClient } from './client';

/**
 * Role-agnostic notification API. Backed by the shared backend controller at
 * `/v1/notifications`, which every authenticated role can reach (the path falls
 * through Spring Security to `authenticated()`). Read/unread state is real and
 * scoped to the current user on the server.
 */
export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  severity?: string | null;
  relatedEntityType?: string | null;
  relatedEntityId?: string | null;
  createdAt: string;
}

export const notificationService = {
  async getNotifications(): Promise<AppNotification[]> {
    const { data } = await apiClient.get('/notifications');
    return data?.data ?? [];
  },
  async getUnreadCount(): Promise<number> {
    const { data } = await apiClient.get('/notifications/unread-count');
    return data?.data ?? 0;
  },
  async markNotificationRead(id: string) {
    const { data } = await apiClient.post(`/notifications/${id}/read`);
    return data?.data;
  },
  async markAllNotificationsRead() {
    const { data } = await apiClient.post('/notifications/read-all');
    return data?.data;
  },
  async dismissNotification(id: string) {
    const { data } = await apiClient.post(`/notifications/${id}/dismiss`);
    return data?.data;
  },
  async getAdminNotifications(): Promise<AppNotification[]> {
    const { data } = await apiClient.get('/admin/notifications');
    return data?.data ?? [];
  },
  async getAdminUnreadCount(): Promise<number> {
    const { data } = await apiClient.get('/admin/notifications/unread-count');
    return data?.data ?? 0;
  },
  async markAdminNotificationRead(id: string) {
    const { data } = await apiClient.put(`/admin/notifications/${id}/read`);
    return data?.data;
  },
};
