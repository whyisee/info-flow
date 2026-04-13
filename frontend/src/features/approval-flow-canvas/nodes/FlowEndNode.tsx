import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

function FlowEndNodeInner({ selected }: NodeProps) {
  return (
    <div className={`afcNode afcNodeEnd ${selected ? 'afcNodeSelected' : ''}`}>
      <Handle type="target" position={Position.Left} className="afcHandle" />
      <span className="afcNodeEndLabel">结束</span>
    </div>
  )
}

export const FlowEndNode = memo(FlowEndNodeInner)
