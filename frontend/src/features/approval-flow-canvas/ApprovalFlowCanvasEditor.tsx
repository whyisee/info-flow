import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  addEdge,
  MarkerType,
  type OnSelectionChangeParams,
  type Node,
  type ReactFlowInstance,
  type Connection,
  type IsValidConnection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { message } from 'antd'
import type { ApproverOption } from '../../types'
import type { ApprovalStepDraft } from './types'
import { defaultLinearStepDraft } from './types'
import {
  countApprovalNodes,
  GW_HANDLE_FORK_OUT,
  GW_HANDLE_JOIN_IN,
  GW_HANDLE_MAIN_IN,
  GW_HANDLE_MAIN_OUT,
  isDeletableWorkflowNode,
  laneToNodeData,
  layoutFromSteps,
  stepsFromGraph,
} from './graphLayout'
import { FlowStartNode } from './nodes/FlowStartNode'
import { FlowEndNode } from './nodes/FlowEndNode'
import { FlowApprovalNode, type FlowApprovalData } from './nodes/FlowApprovalNode'
import { FlowParallelNode } from './nodes/FlowParallelNode'
import type { FlowParallelData } from './nodes/FlowParallelNode'
import { FlowParallelForkNode } from './nodes/FlowParallelForkNode'
import { FlowParallelJoinNode } from './nodes/FlowParallelJoinNode'
import { FlowParallelGatewayNode } from './nodes/FlowParallelGatewayNode'
import { ApprovalFlowInspector } from './ApprovalFlowInspector'
import { ApprovalFlowNodePalette } from './ApprovalFlowNodePalette'
import type { PaletteDragPayload } from './ApprovalFlowNodePalette'
import { ApprovalFlowCanvasUiProvider } from './ApprovalFlowCanvasUiContext'
import './ApprovalFlowCanvasEditor.css'

const nodeTypes = {
  flowStart: FlowStartNode,
  flowApproval: FlowApprovalNode,
  flowParallel: FlowParallelNode,
  flowParallelGateway: FlowParallelGatewayNode,
  flowParallelFork: FlowParallelForkNode,
  flowParallelJoin: FlowParallelJoinNode,
  flowEnd: FlowEndNode,
}

export type ApprovalFlowCanvasHandle = {
  getSteps: () => ApprovalStepDraft[]
}

type BodyProps = {
  defaultSteps: ApprovalStepDraft[]
  approverOptions: ApproverOption[]
}

function countsTowardWorkflowCap(n: Node): boolean {
  return (
    n.type === 'flowApproval' ||
    n.type === 'flowParallelGateway' ||
    n.type === 'flowParallelFork' ||
    n.type === 'flowParallelJoin' ||
    n.type === 'flowParallel'
  )
}

function newNodeId(prefix: string): string {
  const u = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())
  return `${prefix}-${u}`
}

const CanvasBody = forwardRef<ApprovalFlowCanvasHandle, BodyProps>(
  function CanvasBody({ defaultSteps, approverOptions }, ref) {
    const initial = useMemo(() => layoutFromSteps(defaultSteps), [defaultSteps])
    const [nodes, setNodes, onNodesChange] = useNodesState(initial.nodes)
    const [edges, setEdges, onEdgesChange] = useEdgesState(initial.edges)
    const [selected, setSelected] = useState<Node | null>(null)
    const initFit = useRef(false)
    const rfRef = useRef<ReactFlowInstance | null>(null)
    const edgeKeyRef = useRef(0)

    useImperativeHandle(
      ref,
      () => ({
        getSteps: () => stepsFromGraph(nodes, edges),
      }),
      [nodes, edges],
    )

    const onSelectionChange = useCallback((p: OnSelectionChangeParams) => {
      setSelected(p.nodes[0] ?? null)
    }, [])

    const applyAutoLayout = useCallback(
      (steps: ApprovalStepDraft[]) => {
        const { nodes: n2, edges: e2 } = layoutFromSteps(steps)
        setNodes(n2)
        setEdges(e2)
      },
      [setNodes, setEdges],
    )

    const handleRelayout = useCallback(() => {
      const steps = stepsFromGraph(nodes, edges)
      applyAutoLayout(steps)
      message.success('已按当前连线结构重新排版')
    }, [nodes, edges, applyAutoLayout])

    const handleFitView = useCallback(() => {
      rfRef.current?.fitView({ padding: 0.15, duration: 220 })
    }, [])

    const deleteNodeById = useCallback(
      (nodeId: string) => {
        const target = nodes.find((n) => n.id === nodeId)
        if (!target || !isDeletableWorkflowNode(target)) return
        const nextNodes = nodes.filter((n) => n.id !== nodeId)
        if (countApprovalNodes(nextNodes) < 1) {
          message.warning('至少保留一个审批节点')
          return
        }
        setNodes(nextNodes)
        setEdges((curr) => curr.filter((e) => e.source !== nodeId && e.target !== nodeId))
        setSelected((s) => (s?.id === nodeId ? null : s))
      },
      [nodes, setNodes, setEdges],
    )

    const removeSelectedStep = useCallback(() => {
      if (!selected || !isDeletableWorkflowNode(selected)) return
      deleteNodeById(selected.id)
    }, [selected, deleteNodeById])

    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return
        const t = e.target as HTMLElement
        if (t.closest('input, textarea, [contenteditable=true]')) return
        removeSelectedStep()
      }
      window.addEventListener('keydown', onKey)
      return () => window.removeEventListener('keydown', onKey)
    }, [removeSelectedStep])

    const onUpdateApproval = useCallback(
      (nodeId: string, data: FlowApprovalData) => {
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...data } } : n)))
      },
      [setNodes],
    )

    const onUpdateParallel = useCallback(
      (nodeId: string, data: FlowParallelData) => {
        setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: { ...data } } : n)))
      },
      [setNodes],
    )

    const onUpdateFork = useCallback(
      (nodeId: string, data: { title?: string }) => {
        setNodes((nds) =>
          nds.map((n) => (n.id === nodeId ? { ...n, data: { ...(n.data as object), ...data } } : n)),
        )
      },
      [setNodes],
    )

    const onConnect = useCallback(
      (c: Connection) => {
        if (!c.source || !c.target) return
        const sNode = nodes.find((n) => n.id === c.source)
        const tNode = nodes.find((n) => n.id === c.target)
        let sourceHandle = c.sourceHandle
        let targetHandle = c.targetHandle
        if (sNode?.type === 'flowParallelGateway' && (sourceHandle == null || sourceHandle === '')) {
          sourceHandle = tNode?.type === 'flowApproval' ? GW_HANDLE_FORK_OUT : GW_HANDLE_MAIN_OUT
        }
        if (tNode?.type === 'flowParallelGateway' && (targetHandle == null || targetHandle === '')) {
          targetHandle = sNode?.type === 'flowApproval' ? GW_HANDLE_JOIN_IN : GW_HANDLE_MAIN_IN
        }
        setEdges((eds) =>
          addEdge(
            {
              ...c,
              sourceHandle: sourceHandle ?? undefined,
              targetHandle: targetHandle ?? undefined,
              id: `e-${c.source}-${c.target}-${edgeKeyRef.current++}`,
              animated: true,
              markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
              style: { stroke: 'var(--afc-edge, #94a3b8)', strokeWidth: 2 },
            },
            eds,
          ),
        )
      },
      [setEdges, nodes],
    )

    const isValidConnection = useCallback<IsValidConnection>((c) => {
      if (!c.source || !c.target) return false
      if (c.source === c.target) return false
      return true
    }, [])

    const onDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }, [])

    const onDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault()
        const inst = rfRef.current
        if (!inst) return
        let raw: string
        try {
          raw = e.dataTransfer.getData('application/reactflow')
        } catch {
          return
        }
        if (!raw) return
        let spec: PaletteDragPayload
        try {
          spec = JSON.parse(raw) as PaletteDragPayload
        } catch {
          return
        }
        const allowed = spec.paletteKind === 'approval' || spec.paletteKind === 'parallel_gateway'
        if (!allowed) return

        const currentCount = inst.getNodes().filter((n) => countsTowardWorkflowCap(n)).length
        if (currentCount >= 32) {
          message.warning('最多 32 个环节节点（审批 / 并行网关等）')
          return
        }

        const pos = inst.screenToFlowPosition({ x: e.clientX, y: e.clientY })

        if (spec.paletteKind === 'approval') {
          const draft = defaultLinearStepDraft(currentCount + 1)
          draft.title = '审批节点'
          const id = newNodeId('ap')
          const newNode: Node = {
            id,
            type: 'flowApproval',
            position: { x: pos.x - 100, y: pos.y - 36 },
            data: laneToNodeData(draft),
          }
          setNodes((curr) => [...curr, newNode])
          return
        }

        if (spec.paletteKind === 'parallel_gateway') {
          const id = newNodeId('pgw')
          setNodes((curr) => [
            ...curr,
            {
              id,
              type: 'flowParallelGateway',
              position: { x: pos.x - 70, y: pos.y - 80 },
              data: { title: '并行网关' },
            },
          ])
        }
      },
      [setNodes],
    )

    const onNodeDragStop = useCallback(() => {
      setSelected(null)
    }, [])

    const uiCtxValue = useMemo(() => ({ deleteNodeById }), [deleteNodeById])

    return (
      <ApprovalFlowCanvasUiProvider value={uiCtxValue}>
        <div className="approvalFlowCanvas afcWorkbench">
          <ApprovalFlowNodePalette onRelayout={handleRelayout} onFitView={handleFitView} />
          <div className="afcCanvasWrap">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              isValidConnection={isValidConnection}
              onNodeDragStop={onNodeDragStop}
              onSelectionChange={onSelectionChange}
              onDrop={onDrop}
              onDragOver={onDragOver}
              nodeTypes={nodeTypes}
              onInit={(inst) => {
                rfRef.current = inst
                if (!initFit.current) {
                  initFit.current = true
                  inst.fitView({ padding: 0.15, duration: 200 })
                }
              }}
              nodesDraggable
              nodesConnectable
              elementsSelectable
              panOnScroll
              zoomOnScroll
              minZoom={0.35}
              maxZoom={1.35}
              proOptions={{ hideAttribution: true }}
              className="afcReactFlow"
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
              <Controls className="afcControls" showInteractive={false} />
              <MiniMap
                className="afcMiniMap"
                zoomable
                pannable
                nodeStrokeWidth={2}
                maskColor="rgba(15, 23, 42, 0.06)"
              />
            </ReactFlow>
          </div>
          <aside className="afcInspectorWrap">
            <ApprovalFlowInspector
              node={selected}
              approverOptions={approverOptions}
              onUpdateApproval={onUpdateApproval}
              onUpdateParallel={onUpdateParallel}
              onUpdateFork={onUpdateFork}
            />
          </aside>
        </div>
      </ApprovalFlowCanvasUiProvider>
    )
  },
)

export const ApprovalFlowCanvasEditor = forwardRef<ApprovalFlowCanvasHandle, BodyProps>(
  function ApprovalFlowCanvasEditor(props, ref) {
    return (
      <ReactFlowProvider>
        <CanvasBody ref={ref} {...props} />
      </ReactFlowProvider>
    )
  },
)
