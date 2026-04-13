import { memo } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useApprovalFlowCanvasUi } from '../ApprovalFlowCanvasUiContext'
import type { AssigneeSource, VoteMode } from '../types'

export type FlowApprovalData = {
  title: string
  vote_mode: VoteMode
  assignee_source: AssigneeSource
  assignee_user_ids: number[]
  dept_id: number | null
}

function sourceShort(src: AssigneeSource): string {
  switch (src) {
    case 'explicit_users':
      return '指定人'
    case 'applicant_dept_admins':
      return '申报人部门管理员'
    case 'dept_admins':
      return '指定部门管理员'
    case 'role_school_admin':
      return '校级管理员'
    case 'role_expert':
      return '专家'
    default:
      return src
  }
}

function FlowApprovalNodeInner({ id, data, selected }: NodeProps) {
  const ui = useApprovalFlowCanvasUi()
  const d = data as FlowApprovalData
  const title = d.title?.trim() || '未命名环节'
  const src = d.assignee_source ?? 'explicit_users'
  const vm = d.vote_mode === 'any_one' ? '或签' : '会签'
  const n = d.assignee_user_ids?.length ?? 0
  let meta: string
  if (src === 'explicit_users') {
    meta = n > 0 ? `${n} 人 · ${vm}` : `未选人 · ${vm}（发布后走角色）`
  } else if (src === 'dept_admins') {
    meta = `部门 ${d.dept_id ?? '?'} · ${vm}`
  } else {
    meta = `${sourceShort(src)} · ${vm}`
  }

  return (
    <div className={`afcNode afcNodeApproval ${selected ? 'afcNodeSelected' : ''}`}>
      {ui ? (
        <button
          type="button"
          className="afcNodeDeleteBtn"
          aria-label="删除该节点"
          title="删除"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation()
            ui.deleteNodeById(id)
          }}
        >
          <CloseOutlined />
        </button>
      ) : null}
      <Handle type="target" position={Position.Left} className="afcHandle" />
      <div className="afcNodeApprovalInner">
        <div className="afcNodeApprovalTitle">{title}</div>
        <div className="afcNodeApprovalMeta">{meta}</div>
      </div>
      <Handle type="source" position={Position.Right} className="afcHandle" />
    </div>
  )
}

export const FlowApprovalNode = memo(FlowApprovalNodeInner)
