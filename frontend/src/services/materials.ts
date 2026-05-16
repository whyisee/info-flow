import type { Material } from '../types'
import request from './request'

export type MaterialValidationIssue = {
  moduleKey?: string | null
  sectionKey?: string | null
  fieldKey?: string | null
  rowKey?: string | null
  attachmentKey?: string | null
  level: 'error' | 'warning'
  issueType: string
  message: string
  resolved: boolean
}

export type MaterialValidationResult = {
  valid: boolean
  completion: number
  errors: MaterialValidationIssue[]
  warnings: MaterialValidationIssue[]
}

export type MaterialEditContext = {
  material: Material
  project: Record<string, unknown>
  config: Record<string, unknown> | null
  configVersion: number | null
  draft: Record<string, unknown>
  validation: MaterialValidationResult
  lastSavedAt?: string | null
}

export type MaterialReturnComment = {
  id: number
  approveRecordId: number
  materialId: number
  approverId: number
  approverName?: string | null
  action: 'return' | 'reject'
  comment?: string | null
  moduleKey?: string | null
  sectionKey?: string | null
  fieldKey?: string | null
  rowKey?: string | null
  attachmentKey?: string | null
  resolved: boolean
  createdAt?: string | null
}

export type MaterialListQuery = {
  keyword?: string
  project_id?: number
  status_filter?: number | 'all' | 'in' | 'done'
}

const cleanParams = (query?: MaterialListQuery) => {
  if (!query) return undefined
  const out: Record<string, unknown> = {}
  if (query.keyword?.trim()) out.keyword = query.keyword.trim()
  if (query.project_id != null) out.project_id = query.project_id
  if (query.status_filter != null && query.status_filter !== 'all') {
    out.status_filter = query.status_filter
  }
  return out
}

export const getMaterials = (query?: MaterialListQuery) =>
  request.get<unknown, Material[]>('/materials/', { params: cleanParams(query) })

export const getMaterial = (id: number) =>
  request.get<unknown, Material>(`/materials/${id}`)

export const createMaterial = (data: { project_id: number; content?: Record<string, unknown> }) =>
  request.post<unknown, Material>('/materials/', data)

export const updateMaterial = (id: number, data: { content: Record<string, unknown> }) =>
  request.put<unknown, Material>(`/materials/${id}`, data)

export const getMaterialEditContext = (id: number) =>
  request.get<unknown, MaterialEditContext>(`/materials/${id}/edit-context`)

export const saveMaterialDraft = (
  id: number,
  data: { data: Record<string, unknown>; clientRevision?: number | string; saveType?: string },
) =>
  request.put<unknown, { materialId: number; serverRevision: number; savedAt: string }>(
    `/materials/${id}/draft`,
    data,
  )

export const validateMaterial = (
  id: number,
  data: { data?: Record<string, unknown>; scope?: string },
) =>
  request.post<unknown, MaterialValidationResult>(`/materials/${id}/validate`, data)

export const listMaterialReturnComments = (id: number) =>
  request.get<unknown, MaterialReturnComment[]>(`/materials/${id}/return-comments`)

export const resolveMaterialReturnComment = (
  id: number,
  approveRecordId: number,
  resolved: boolean,
) =>
  request.put<unknown, MaterialReturnComment>(
    `/materials/${id}/return-comments/${approveRecordId}/resolved`,
    { resolved },
  )

export const submitMaterial = (id: number) =>
  request.post<unknown, Material>(`/materials/${id}/submit`)

export const cancelMaterial = (id: number) =>
  request.post<unknown, Material>(`/materials/${id}/cancel`)

export const deleteMaterial = (id: number) =>
  request.delete<unknown, void>(`/materials/${id}`)

export const previewMaterialMergedPdf = (id: number) =>
  request.get<unknown, Blob>(`/materials/${id}/preview-pdf`, { responseType: 'blob' })
