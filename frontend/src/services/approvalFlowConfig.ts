import request from './request'

export type ApprovalFlowVersionRecord = {
  id: number
  project_id: number
  version: number
  label?: string | null
  status: string
  flow: {
    steps: Record<string, unknown>[]
  } | null
  created_by?: number | null
  created_at: string
  updated_at?: string | null
}

export const listApprovalFlowVersions = (projectId: number) =>
  request.get<unknown, ApprovalFlowVersionRecord[]>(
    `/projects/${projectId}/approval-flow-config`,
  )

export const getApprovalFlowVersion = (projectId: number, configId: number) =>
  request.get<unknown, ApprovalFlowVersionRecord>(
    `/projects/${projectId}/approval-flow-config/${configId}`,
  )

export const createApprovalFlowVersion = (
  projectId: number,
  body: { label?: string; flow?: Record<string, unknown> },
) =>
  request.post<unknown, ApprovalFlowVersionRecord>(
    `/projects/${projectId}/approval-flow-config`,
    body,
  )

export const updateApprovalFlowVersion = (
  projectId: number,
  configId: number,
  body: { label?: string; flow?: Record<string, unknown> },
) =>
  request.put<unknown, ApprovalFlowVersionRecord>(
    `/projects/${projectId}/approval-flow-config/${configId}`,
    body,
  )

export const publishApprovalFlowVersion = (projectId: number, configId: number) =>
  request.post<unknown, ApprovalFlowVersionRecord>(
    `/projects/${projectId}/approval-flow-config/${configId}/publish`,
  )
