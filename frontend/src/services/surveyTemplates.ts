import request from './request'

export type SurveyTemplate = {
  id: number
  name: string
  description?: string | null
  draft_schema: Record<string, unknown>
  draft_fields: Record<string, unknown>
  published_version: number
  created_at: string
  updated_at?: string | null
}

export type SurveyTemplateVersion = {
  id: number
  template_id: number
  version: number
  schema: Record<string, unknown>
  fields: Record<string, unknown>
  created_at: string
}

export const listSurveyTemplates = () =>
  request.get<unknown, SurveyTemplate[]>('/survey/templates')

export const createSurveyTemplate = (payload: { name: string; description?: string }) =>
  request.post<unknown, SurveyTemplate>('/survey/templates', payload)

export const getSurveyTemplate = (templateId: number) =>
  request.get<unknown, SurveyTemplate>(`/survey/templates/${templateId}`)

export const updateSurveyTemplate = (
  templateId: number,
  payload: Partial<Pick<SurveyTemplate, 'name' | 'description' | 'draft_schema' | 'draft_fields'>>,
) => request.put<unknown, SurveyTemplate>(`/survey/templates/${templateId}`, payload)

export const deleteSurveyTemplate = (templateId: number) =>
  request.delete<unknown, void>(`/survey/templates/${templateId}`)

export const publishSurveyTemplate = (templateId: number) =>
  request.post<unknown, SurveyTemplateVersion>(`/survey/templates/${templateId}/publish`)

export const listSurveyTemplateVersions = (templateId: number) =>
  request.get<unknown, SurveyTemplateVersion[]>(`/survey/templates/${templateId}/versions`)

export const getSurveyTemplateVersion = (templateId: number, version: number) =>
  request.get<unknown, SurveyTemplateVersion>(`/survey/templates/${templateId}/versions/${version}`)

