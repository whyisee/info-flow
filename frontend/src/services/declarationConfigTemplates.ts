import request from "./request";

export type DeclarationConfigTemplate = {
  id: number;
  name: string;
  category: string | null;
  description: string | null;
  config: Record<string, unknown>;
  version: number;
  status: "enabled" | "disabled";
  created_by?: number | null;
  created_at: string;
  updated_at?: string | null;
};

export const listDeclarationConfigTemplates = (status?: "enabled" | "disabled") =>
  request.get<unknown, DeclarationConfigTemplate[]>(
    "/declaration-config-templates",
    { params: status ? { status } : undefined },
  );

export const createDeclarationConfigTemplate = (data: {
  name: string;
  category?: string;
  description?: string;
  config: Record<string, unknown>;
}) =>
  request.post<unknown, DeclarationConfigTemplate>(
    "/declaration-config-templates",
    data,
  );

export const getDeclarationConfigTemplate = (templateId: number) =>
  request.get<unknown, DeclarationConfigTemplate>(
    `/declaration-config-templates/${templateId}`,
  );

export const updateDeclarationConfigTemplate = (
  templateId: number,
  data: {
    name?: string;
    category?: string | null;
    description?: string | null;
    config?: Record<string, unknown>;
    status?: "enabled" | "disabled";
  },
) =>
  request.put<unknown, DeclarationConfigTemplate>(
    `/declaration-config-templates/${templateId}`,
    data,
  );
