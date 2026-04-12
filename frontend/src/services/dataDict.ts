import request from "./request";

export type DataDictTypeDTO = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_enabled: boolean;
  created_at: string;
  updated_at: string | null;
};

export type DataDictItemDTO = {
  id: number;
  type_id: number;
  value: string;
  label: string;
  parent_id: number | null;
  sort_order: number;
  extra_json: Record<string, unknown> | null;
  is_enabled: boolean;
  created_at: string;
  updated_at: string | null;
};

export function listDictTypes(params?: { include_disabled?: boolean }) {
  return request.get("/system/dict/types", { params }) as Promise<DataDictTypeDTO[]>;
}

export function getDictType(typeCode: string) {
  return request.get(
    `/system/dict/types/${encodeURIComponent(typeCode)}`,
  ) as Promise<DataDictTypeDTO>;
}

export function createDictType(body: {
  code: string;
  name: string;
  description?: string | null;
  sort_order?: number;
  is_enabled?: boolean;
}) {
  return request.post("/system/dict/types", body) as Promise<DataDictTypeDTO>;
}

export function updateDictType(
  typeCode: string,
  body: {
    name?: string;
    description?: string | null;
    sort_order?: number;
    is_enabled?: boolean;
  },
) {
  return request.patch(
    `/system/dict/types/${encodeURIComponent(typeCode)}`,
    body,
  ) as Promise<DataDictTypeDTO>;
}

export function deleteDictType(typeCode: string) {
  return request.delete(`/system/dict/types/${encodeURIComponent(typeCode)}`) as Promise<void>;
}

export function listDictItems(
  typeCode: string,
  params?: { parent_id?: number | null; include_disabled?: boolean },
) {
  return request.get(`/system/dict/types/${encodeURIComponent(typeCode)}/items`, {
    params,
  }) as Promise<DataDictItemDTO[]>;
}

export function createDictItem(
  typeCode: string,
  body: {
    value: string;
    label: string;
    parent_id?: number | null;
    sort_order?: number;
    extra_json?: Record<string, unknown> | null;
    is_enabled?: boolean;
  },
) {
  return request.post(
    `/system/dict/types/${encodeURIComponent(typeCode)}/items`,
    body,
  ) as Promise<DataDictItemDTO>;
}

export type DataDictItemBulkRowPayload = {
  value: string;
  label: string;
  sort_order?: number;
  is_enabled?: boolean;
  extra_json?: Record<string, unknown> | null;
  parent_value?: string | null;
};

export type DataDictItemBulkResultDTO = {
  created: number;
  failed: { value: string; detail: string }[];
};

export function bulkCreateDictItems(typeCode: string, body: { items: DataDictItemBulkRowPayload[] }) {
  return request.post(
    `/system/dict/types/${encodeURIComponent(typeCode)}/items/bulk`,
    body,
  ) as Promise<DataDictItemBulkResultDTO>;
}

export function updateDictItem(
  itemId: number,
  body: {
    value?: string;
    label?: string;
    parent_id?: number | null;
    sort_order?: number;
    extra_json?: Record<string, unknown> | null;
    is_enabled?: boolean;
  },
) {
  return request.patch(`/system/dict/items/${itemId}`, body) as Promise<DataDictItemDTO>;
}

export function deleteDictItem(itemId: number) {
  return request.delete(`/system/dict/items/${itemId}`) as Promise<void>;
}
