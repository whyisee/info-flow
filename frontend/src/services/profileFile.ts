import type { UploadFile } from "antd/es/upload/interface";

import request from "./request";

export type ProfileFileUploadResult = {
  url: string;
};

/** 上传至服务端 uploads/profile/{userId}/，返回相对 /api 的路径，如 uploads/profile-file/1/xxx.png */
export function uploadProfileImage(file: File): Promise<ProfileFileUploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  return request.post("users/me/profile-files", fd);
}

/** PDF（证件/证明）：同一接口，后端按后缀校验 */
export function uploadProfilePdf(file: File): Promise<ProfileFileUploadResult> {
  const fd = new FormData();
  fd.append("file", file);
  return request.post("users/me/profile-files", fd);
}

/**
 * Ant Design Upload 在 customRequest 成功后将接口体放在 file.response，未必写入 file.url。
 * 持久化与校验需同时读 url 与 response.url。
 */
export function getProfileFileUrlFromUploadFile(f?: UploadFile): string | undefined {
  if (!f || f.status === "removed") return undefined;
  if (typeof f.url === "string" && f.url.length > 0) return f.url;
  const r = f.response as { url?: string } | undefined;
  if (r && typeof r.url === "string" && r.url.length > 0) return r.url;
  return undefined;
}
