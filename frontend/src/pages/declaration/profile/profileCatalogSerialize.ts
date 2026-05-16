import type { UploadFile } from "antd/es/upload/interface";
import dayjs, { type Dayjs } from "dayjs";

import type { ProfileFieldCatalogRow } from "../../../services/profileFieldCatalog";
import { getProfileFileUrlFromUploadFile } from "../../../services/profileFile";

import { debugProfileForm } from "./profileFormDebug";

function persistPdfFileList(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return v
    .map((item) => {
      const f = item as UploadFile;
      if (f.status === "removed") return null;
      const url = getProfileFileUrlFromUploadFile(f);
      if (url) {
        return { uid: f.uid, name: f.name, status: "done" as const, url };
      }
      if (f.uid != null && f.name != null) {
        return { uid: f.uid, name: f.name, status: f.status ?? "done" };
      }
      return null;
    })
    .filter(Boolean);
}

function persistIdPhotoList(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return v
    .map((item) => {
      const f = item as UploadFile;
      if (f.status === "removed") return null;
      const url = getProfileFileUrlFromUploadFile(f);
      if (!url) return null;
      return { uid: f.uid, name: f.name, status: "done" as const, url };
    })
    .filter(Boolean);
}

function formatOneDate(v: unknown): string | unknown {
  if (v == null || typeof v === "string") return v;
  const d = v as Dayjs | Date;
  if (dayjs.isDayjs(d)) return d.format("YYYY-MM-DD");
  if (d instanceof Date) return dayjs(d).format("YYYY-MM-DD");
  return v;
}

/** 资料里字典字段仅存：标量 string / number；或 { value: string|number }；多选为非空数组（元素同上）。 */
export function normalizeCatalogDictValue(
  raw: unknown,
  multi: boolean,
): string | string[] | undefined {
  if (raw == null || raw === "") return undefined;
  const scalar = (x: unknown): string | undefined => {
    if (typeof x === "string" || typeof x === "number" || typeof x === "bigint")
      return String(x);
    if (x !== null && typeof x === "object" && "value" in x) {
      const v = (x as { value: unknown }).value;
      if (typeof v === "string" || typeof v === "number") return String(v);
    }
    return undefined;
  };
  if (!multi) return scalar(raw);
  if (!Array.isArray(raw)) {
    const one = scalar(raw);
    return one !== undefined ? [one] : undefined;
  }
  const parts = raw.flatMap((x) => {
    const o = scalar(x);
    return o !== undefined ? [o] : [];
  });
  return parts.length ? parts : undefined;
}

/** 按目录做日期 / 附件序列化（在原有 serializeProfileForApi 合并结果上进一步处理） */
export function applyCatalogSerialize(
  values: Record<string, unknown>,
  catalog: ProfileFieldCatalogRow[],
): Record<string, unknown> {
  const out = { ...values };
  for (const row of catalog) {
    const k = row.field_key;
    if (!(k in out)) continue;
    if (row.data_type === "select" || row.data_type === "multi_select") {
      const normalized = normalizeCatalogDictValue(
        out[k],
        row.data_type === "multi_select",
      );
      if (normalized !== undefined) out[k] = normalized;
      else delete out[k];
    } else if (row.data_type === "date") {
      out[k] = formatOneDate(out[k]);
    } else if (row.data_type === "upload") {
      out[k] = persistPdfFileList(out[k]);
    } else if (row.data_type === "image") {
      out[k] = persistIdPhotoList(out[k]);
    }
  }
  return out;
}

export function applyCatalogNormalize(
  values: Record<string, unknown>,
  catalog: ProfileFieldCatalogRow[],
): Record<string, unknown> {
  const out = { ...values };
  for (const row of catalog) {
    const k = row.field_key;
    if (
      !(k in out) ||
      (row.data_type !== "select" && row.data_type !== "multi_select")
    )
      continue;
    const normalized = normalizeCatalogDictValue(
      out[k],
      row.data_type === "multi_select",
    );
    if (normalized !== undefined) out[k] = normalized;
    else {
      debugProfileForm(`applyCatalogNormalize:drop dict field key=${k}`, {
        dict_type_code: row.dict_type_code,
        data_type: row.data_type,
        raw: out[k],
      });
      delete out[k];
    }
  }
  for (const row of catalog) {
    const k = row.field_key;
    if (row.data_type !== "date") continue;
    const raw = out[k];
    if (typeof raw === "string" && raw.trim()) {
      out[k] = dayjs(raw);
    }
  }
  const photos = out.id_photo;
  if (Array.isArray(photos)) {
    out.id_photo = photos.map((p) => {
      const x = p as Record<string, unknown>;
      if (typeof x.url === "string" && x.url) {
        return { ...x, status: x.status ?? "done" };
      }
      return x;
    });
  }
  return out;
}
