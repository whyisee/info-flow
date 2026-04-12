import request from "./request";

export type DeclarationConfigRecord = {
  id: number;
  project_id: number;
  version: number;
  label: string | null;
  status: "draft" | "published" | "archived";
  config: Record<string, unknown>;
  created_by?: number | null;
  created_at: string;
  updated_at?: string | null;
};

export const getActiveDeclarationConfig = (projectId: number) =>
  request.get<unknown, DeclarationConfigRecord | null>(
    `/projects/${projectId}/declaration-config/active`,
  );

export const listDeclarationConfigs = (projectId: number) =>
  request.get<unknown, DeclarationConfigRecord[]>(
    `/projects/${projectId}/declaration-config`,
  );

export const getDeclarationConfig = (projectId: number, configId: number) =>
  request.get<unknown, DeclarationConfigRecord>(
    `/projects/${projectId}/declaration-config/${configId}`,
  );

export const createDeclarationConfig = (
  projectId: number,
  data: { label?: string; config?: Record<string, unknown> },
) =>
  request.post<unknown, DeclarationConfigRecord>(
    `/projects/${projectId}/declaration-config`,
    data,
  );

export const updateDeclarationConfig = (
  projectId: number,
  configId: number,
  data: { label?: string; config?: Record<string, unknown> },
) =>
  request.put<unknown, DeclarationConfigRecord>(
    `/projects/${projectId}/declaration-config/${configId}`,
    data,
  );

export const publishDeclarationConfig = (projectId: number, configId: number) =>
  request.post<unknown, DeclarationConfigRecord>(
    `/projects/${projectId}/declaration-config/${configId}/publish`,
  );
