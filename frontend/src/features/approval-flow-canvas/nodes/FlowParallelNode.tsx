import { memo } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useApprovalFlowCanvasUi } from '../ApprovalFlowCanvasUiContext'
import type { ApprovalLaneDraft } from '../types'

export type FlowParallelData = {
  title: string
  lanes: ApprovalLaneDraft[]
}

function FlowParallelNodeInner({ id, data, selected }: NodeProps) {
  const ui = useApprovalFlowCanvasUi()
  const d = data as FlowParallelData
  const title = d.title?.trim() || '并行网关'
  const lanes = Array.isArray(d.lanes) ? d.lanes : []
  const n = lanes.length

  return (
    <div className={`afcNode afcNodeParallel ${selected ? 'afcNodeSelected' : ''}`}>
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
      <div className="afcNodeParallelInner">
        <div className="afcNodeParallelBadge">并行</div>
        <div className="afcNodeParallelTitle">{title}</div>
        <div className="afcNodeParallelMeta">{n} 条子轨同时审批</div>
      </div>
      <Handle type="source" position={Position.Right} className="afcHandle" />
    </div>
  )
}

export const FlowParallelNode = memo(FlowParallelNodeInner)
