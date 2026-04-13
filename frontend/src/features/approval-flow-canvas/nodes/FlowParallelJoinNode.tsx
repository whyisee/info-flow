import { memo } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useApprovalFlowCanvasUi } from '../ApprovalFlowCanvasUiContext'

function FlowParallelJoinNodeInner({ id, selected }: NodeProps) {
  const ui = useApprovalFlowCanvasUi()

  return (
    <div className={`afcNode afcNodeJoin ${selected ? 'afcNodeSelected' : ''}`}>
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
      <div className="afcNodeJoinRings" aria-hidden>
        <span className="afcNodeJoinRingOuter" />
        <span className="afcNodeJoinRingInner" />
      </div>
      <div className="afcNodeJoinLabel">并行汇合</div>
      <Handle type="source" position={Position.Right} className="afcHandle" />
    </div>
  )
}

export const FlowParallelJoinNode = memo(FlowParallelJoinNodeInner)
