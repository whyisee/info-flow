import { memo } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'

function FlowStartNodeInner({ selected }: NodeProps) {
  return (
    <div className={`afcNode afcNodeStart ${selected ? 'afcNodeSelected' : ''}`}>
      <span className="afcNodeStartLabel">开始</span>
      <Handle type="source" position={Position.Right} className="afcHandle" />
    </div>
  )
}

export const FlowStartNode = memo(FlowStartNodeInner)
