import request from "./request";

export type NotificationMessage = {
  id: number;
  user_id?: number;
  type: string;
  title: string;
  content?: string | null;
  target_url?: string | null;
  targetUrl?: string | null;
  read_at?: string | null;
  readAt?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
};

export const listNotifications = (unread?: boolean) =>
  request.get<unknown, NotificationMessage[]>("/notifications", {
    params: unread ? { unread: true } : undefined,
  });

export const markNotificationRead = (id: number) =>
  request.put<unknown, NotificationMessage>(`/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  request.put<unknown, { updated: number }>("/notifications/read-all");
