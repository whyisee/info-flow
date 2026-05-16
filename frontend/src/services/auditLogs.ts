import request from "./request";

export type AuditLog = {
  id: number;
  actor_id?: number | null;
  action: string;
  target_type: string;
  target_id?: number | null;
  detail?: Record<string, unknown> | null;
  created_at: string;
};

export const listAuditLogs = (action?: string) =>
  request.get<unknown, AuditLog[]>("/admin/audit-logs", {
    params: action ? { action } : undefined,
  });
