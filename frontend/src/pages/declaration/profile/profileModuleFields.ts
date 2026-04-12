import type { UploadFile } from "antd/es/upload/interface";
import dayjs, { type Dayjs } from "dayjs";

import { getProfileFileUrlFromUploadFile } from "../../../services/profileFile";

/** 与后端 app.core.module_codes 一致 */
export const PROFILE_MODULE = {
  BASIC: "declaration_basic",
  TASK: "declaration_task",
  CONTACT: "declaration_contact",
  SUPERVISOR: "declaration_supervisor",
} as const;

export type ProfileModuleCode =
  (typeof PROFILE_MODULE)[keyof typeof PROFILE_MODULE];

/** 存于 declaration_basic.config，非表单项 */
export const FORM_STATUS_KEY = "form_status" as const;
export type ProfileFormStatus = "draft" | "submitted";

const BASIC_KEYS = new Set([
  FORM_STATUS_KEY,
  "recommend_school",
  "full_name",
  "project_name",
  "gender",
  "nationality",
  "birth_date",
  "id_type_display",
  "id_number",
  "id_pdf",
  "birth_proof_pdf",
  "highest_edu_country",
  "highest_edu_school",
  "highest_edu_level",
  "highest_degree_country",
  "highest_degree_school",
  "highest_degree_level",
  "work_region",
  "work_province",
  "work_unit_detail",
  "unit_attr_display",
  "tech_title",
  "admin_title",
  "office_level",
  "id_photo",
]);

const TASK_KEYS = new Set([
  "task_pos1_a",
  "task_pos1_b",
  "task_pos2_a",
  "task_pos2_b",
  "subject_a1",
  "subject_a2",
  "subject_a3",
  "subject_b1",
  "subject_b2",
  "subject_b3",
  "task_desc",
  "kw_cat",
  "kw1",
  "kw2",
  "kw3",
  "research_major",
  "research_sub",
]);

const CONTACT_KEYS = new Set([
  "mobile",
  "phone_home",
  "phone_office",
  "fax",
  "email",
  "address",
  "postal_code",
]);

const SUPERVISOR_KEYS = new Set([
  "master_sup_1",
  "master_sup_2",
  "master_sup_3",
  "phd_sup_1",
  "phd_sup_2",
  "phd_sup_3",
  "postdoc_sup_1",
  "postdoc_sup_2",
  "postdoc_sup_3",
  "family_rel_1",
  "family_rel_2",
  "family_rel_3",
  "recuse_exp_1",
  "recuse_exp_2",
  "recuse_exp_3",
]);

function moduleForKey(key: string): ProfileModuleCode | undefined {
  if (BASIC_KEYS.has(key)) return PROFILE_MODULE.BASIC;
  if (TASK_KEYS.has(key)) return PROFILE_MODULE.TASK;
  if (CONTACT_KEYS.has(key)) return PROFILE_MODULE.CONTACT;
  if (SUPERVISOR_KEYS.has(key)) return PROFILE_MODULE.SUPERVISOR;
  return undefined;
}

/** 将整表单项拆成四个模块，供分块保存 */
export function splitProfileByModule(
  values: Record<string, unknown>,
): Record<ProfileModuleCode, Record<string, unknown>> {
  const out: Record<ProfileModuleCode, Record<string, unknown>> = {
    [PROFILE_MODULE.BASIC]: {},
    [PROFILE_MODULE.TASK]: {},
    [PROFILE_MODULE.CONTACT]: {},
    [PROFILE_MODULE.SUPERVISOR]: {},
  };
  for (const key of Object.keys(values)) {
    const m = moduleForKey(key);
    if (m) out[m][key] = values[key];
  }
  return out;
}

export type ModuleConfigRow = {
  module: string;
  config: Record<string, unknown>;
};

/** 合并接口返回的多行 config 为表单 initial 对象 */
export function mergeModulesIntoFormValues(
  rows: ModuleConfigRow[],
): Record<string, unknown> {
  const order: ProfileModuleCode[] = [
    PROFILE_MODULE.BASIC,
    PROFILE_MODULE.TASK,
    PROFILE_MODULE.CONTACT,
    PROFILE_MODULE.SUPERVISOR,
  ];
  const byModule = new Map(rows.map((r) => [r.module, r.config]));
  const merged: Record<string, unknown> = {};
  for (const m of order) {
    const c = byModule.get(m);
    if (c && typeof c === "object") Object.assign(merged, c);
  }
  return merged;
}

function simplifyFileList(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return v.map((f: { uid?: string; name?: string; status?: string }) => ({
    uid: f.uid,
    name: f.name,
    status: f.status,
  }));
}

/** 证件照：只存服务端返回的相对路径 url，不存 base64 / 本地 File */
function persistIdPhotoList(v: unknown): unknown {
  if (!Array.isArray(v)) return v;
  return v
    .map((item) => {
      const f = item as UploadFile;
      if (f.status === "removed") return null;
      const url = getProfileFileUrlFromUploadFile(f);
      if (!url) return null;
      return {
        uid: f.uid,
        name: f.name,
        status: "done",
        url,
      };
    })
    .filter(Boolean);
}

/** 保存前：日期、上传列表等转为可 JSON 序列化 */
export function serializeProfileForApi(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...values };
  const bd = out.birth_date;
  if (bd != null && typeof bd !== "string") {
    const d = bd as Dayjs | Date;
    if (dayjs.isDayjs(d)) {
      out.birth_date = d.format("YYYY-MM-DD");
    } else if (d instanceof Date) {
      out.birth_date = dayjs(d).format("YYYY-MM-DD");
    }
  }
  for (const k of ["id_pdf", "birth_proof_pdf"] as const) {
    if (k in out) out[k] = simplifyFileList(out[k]);
  }
  if ("id_photo" in out) {
    out.id_photo = persistIdPhotoList(out.id_photo);
  }
  return out;
}

/** 加载后：日期字符串转 dayjs，供 DatePicker；证件照补全 status 供 Upload 展示 */
export function normalizeLoadedProfile(
  values: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...values };
  const raw = out.birth_date;
  if (typeof raw === "string" && raw.trim()) {
    out.birth_date = dayjs(raw);
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

/** 从合并后的 config 取出状态并去掉，避免写入 Form */
export function stripFormStatusFromValues(values: Record<string, unknown>): {
  rest: Record<string, unknown>;
  status: ProfileFormStatus;
} {
  const rest = { ...values };
  const raw = rest[FORM_STATUS_KEY];
  delete rest[FORM_STATUS_KEY];
  const status: ProfileFormStatus = raw === "submitted" ? "submitted" : "draft";
  return { rest, status };
}
