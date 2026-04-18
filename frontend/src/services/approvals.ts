import type { ApprovalRecord } from '../types'
import request from './request'

export const getPendingApprovals = () =>
  request.get<unknown, ApprovalRecord[]>('/approvals/pending')

/** 审批中心-待我审批：含我的处理状态（0未处理/1通过/2驳回） */
export const getMyApprovalQueue = () =>
  request.get<unknown, ApprovalRecord[]>('/approvals/queue')

export const approve = (materialId: number, comment?: string, lane_index?: number | null) =>
  request.post<unknown, ApprovalRecord>(`/approvals/${materialId}/approve`, {
    comment,
    ...(lane_index != null ? { lane_index } : {}),
  })

export const returnMaterial = (materialId: number, comment?: string, lane_index?: number | null) =>
  request.post<unknown, ApprovalRecord>(`/approvals/${materialId}/return`, {
    comment,
    ...(lane_index != null ? { lane_index } : {}),
  })

export const reject = (materialId: number, comment?: string) =>
  request.post<unknown, ApprovalRecord>(`/approvals/${materialId}/reject`, { comment })

export const getApprovalRecords = (materialId: number) =>
  request.get<unknown, ApprovalRecord[]>(`/approvals/records/${materialId}`)
