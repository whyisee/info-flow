import request from "./request";
import type { Attachment } from "../types";

export const uploadAttachment = (materialId: number, file: File) => {
  const fd = new FormData();
  fd.append("file", file);
  return request.post<unknown, Attachment>(`/attachments/upload?material_id=${materialId}`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

export const listAttachments = (materialId: number) =>
  request.get<unknown, Attachment[]>(`/attachments/?material_id=${materialId}`);

export const deleteAttachment = (attachmentId: number) =>
  request.delete<unknown, void>(`/attachments/${attachmentId}`);

export const attachmentDownloadUrl = (attachmentId: number) =>
  `/api/attachments/${attachmentId}/download`;

