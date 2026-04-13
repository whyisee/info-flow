import { memo } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useApprovalFlowCanvasUi } from '../ApprovalFlowCanvasUiContext'
import {
  GW_HANDLE_FORK_OUT,
  GW_HANDLE_JOIN_IN,
  GW_HANDLE_MAIN_IN,
  GW_HANDLE_MAIN_OUT,
} from '../graphLayout'

export type FlowParallelGatewayData = {
  title?: string
}

function FlowParallelGatewayNodeInner({ id, data, selected }: NodeProps) {
  const ui = useApprovalFlowCanvasUi()
  const d = data as FlowParallelGatewayData
  const label = d.title?.trim() || '并行网关'

  return (
    <div className={`afcNode afcNodeParallelGw ${selected ? 'afcNodeSelected' : ''}`}>
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
      <Handle
        id={GW_HANDLE_MAIN_IN}
        type="target"
        position={Position.Left}
        className="afcHandle"
        style={{ top: '12%' }}
      />
      <Handle
        id={GW_HANDLE_FORK_OUT}
        type="source"
        position={Position.Right}
        className="afcHandle"
        style={{ top: '32%' }}
      />
      <div className="afcNodeParallelGwInner">
        <div className="afcNodeParallelGwTitle">{label}</div>
      </div>
      <Handle
        id={GW_HANDLE_JOIN_IN}
        type="target"
        position={Position.Left}
        className="afcHandle"
        style={{ top: '68%' }}
      />
      <Handle
        id={GW_HANDLE_MAIN_OUT}
        type="source"
        position={Position.Right}
        className="afcHandle"
        style={{ top: '88%' }}
      />
    </div>
  )
}

export const FlowParallelGatewayNode = memo(FlowParallelGatewayNodeInner)
