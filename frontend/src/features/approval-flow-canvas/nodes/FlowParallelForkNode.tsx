import { memo } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useApprovalFlowCanvasUi } from '../ApprovalFlowCanvasUiContext'

export type FlowParallelForkData = {
  title?: string
}

function FlowParallelForkNodeInner({ id, data, selected }: NodeProps) {
  const ui = useApprovalFlowCanvasUi()
  const d = data as FlowParallelForkData
  const label = d.title?.trim() || '并行分叉'

  return (
    <div className={`afcNode afcNodeFork ${selected ? 'afcNodeSelected' : ''}`}>
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
      <div className="afcNodeForkDiamond" aria-hidden />
      <div className="afcNodeForkLabel">{label}</div>
      <Handle type="source" position={Position.Right} className="afcHandle" />
    </div>
  )
}

export const FlowParallelForkNode = memo(FlowParallelForkNodeInner)
