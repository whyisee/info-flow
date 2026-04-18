import request from "./request";

export type SurveyResponseOut = {
  id: number;
  template_id: number;
  version_id: number;
  version: number;
  answers: Record<string, unknown>;
  submitted_at: string;
};

export type PublicVersion = {
  template_id: number;
  name: string;
  description?: string | null;
  version: number;
  schema: Record<string, unknown>;
  fields: Record<string, unknown>;
  version_id: number;
  version_fields: Record<string, unknown>;
};

export const getPublicVersion = (templateId: number, version: number) =>
  request.get<unknown, PublicVersion>(
    `/survey/public/version/${templateId}/${version}`
  );

export const submitSurveyResponse = (
  templateId: number,
  versionId: number,
  version: number,
  answers: Record<string, unknown>
) =>
  request.post<unknown, SurveyResponseOut>("/survey/responses", {
    template_id: templateId,
    version_id: versionId,
    version,
    answers,
  });

export const listSurveyResponses = (templateId: number) =>
  request.get<unknown, SurveyResponseOut[]>(
    `/survey/templates/${templateId}/responses`
  );

export type UploadSurveyFileResponse = {
  file_path: string;
  file_name: string;
  file_size: number;
  field_name: string;
};

export const uploadSurveyFile = async (
  templateId: number,
  version: number,
  fieldName: string,
  file: File
): Promise<UploadSurveyFileResponse> => {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`/survey/attachments/upload?template_id=${templateId}&version=${version}&field_name=${encodeURIComponent(fieldName)}`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) throw new Error(`上传失败: ${res.status}`);
  return res.json() as Promise<UploadSurveyFileResponse>;
};
