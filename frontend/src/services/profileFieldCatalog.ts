import request from "./request";

export type ProfileFieldCatalogRow = {
  id: number;
  field_key: string;
  data_type: string;
  default_label: string;
  placeholder: string | null;
  help_text: string | null;
  module_code: string;
  dict_type_code: string | null;
  validation_json: Record<string, unknown> | null;
  sort_order: number;
  enabled: boolean;
  storage_hint: string | null;
};

export type ProfileFieldCatalogCreatePayload = {
  field_key: string;
  data_type: string;
  default_label: string;
  placeholder?: string | null;
  help_text?: string | null;
  module_code: string;
  dict_type_code?: string | null;
  validation_json?: Record<string, unknown> | null;
  sort_order?: number;
  enabled?: boolean;
  storage_hint?: string | null;
};

export type ProfileFieldCatalogUpdatePayload = Partial<
  Omit<ProfileFieldCatalogCreatePayload, "field_key">
>;

export const listEnabledProfileFieldCatalog = () =>
  request.get<unknown, ProfileFieldCatalogRow[]>("/profile-field-catalog/enabled");

export const listProfileFieldCatalogAdmin = (params?: {
  module_code?: string;
  q?: string;
  /** 不传=全部；true=仅启用；false=仅停用 */
  enabled?: boolean;
}) =>
  request.get<unknown, ProfileFieldCatalogRow[]>("/profile-field-catalog", {
    params,
  });

export const createProfileFieldCatalog = (payload: ProfileFieldCatalogCreatePayload) =>
  request.post<unknown, ProfileFieldCatalogRow>("/profile-field-catalog", payload);

export const updateProfileFieldCatalog = (
  id: number,
  payload: ProfileFieldCatalogUpdatePayload,
) => request.put<unknown, ProfileFieldCatalogRow>(`/profile-field-catalog/${id}`, payload);
