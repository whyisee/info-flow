import request from "./request";

export type UserModuleConfigDTO = {
  id: number;
  user_id: number;
  module: string;
  config: Record<string, unknown>;
  ext_json?: Record<string, unknown> | null;
  status: string;
  remark?: string | null;
  created_at: string;
  updated_at?: string | null;
};

export function listMyModuleConfigs(): Promise<UserModuleConfigDTO[]> {
  return request.get("/users/me/module-configs");
}

export function getMyModuleConfig(module: string): Promise<UserModuleConfigDTO> {
  return request.get(`/users/me/module-configs/${encodeURIComponent(module)}`);
}

export function putMyModuleConfig(
  module: string,
  body: { config: Record<string, unknown>; ext_json?: Record<string, unknown> | null },
): Promise<UserModuleConfigDTO> {
  return request.put(`/users/me/module-configs/${encodeURIComponent(module)}`, body);
}
