import type { Edge, Node } from '@xyflow/react'
import { MarkerType } from '@xyflow/react'
import type { FlowApprovalData } from './nodes/FlowApprovalNode'
import type { ApprovalLaneDraft, ApprovalStepDraft, ApprovalStepParallelDraft, VoteMode } from './types'
import { defaultLinearStepDraft, defaultParallelStepDraft } from './types'

export const START_ID = 'flow-start'
export const END_ID = 'flow-end'
export const COL_W = 280
export const ROW_Y = 140
export const STAGE_LEFT = 48

/** 并行网关节点（单节点分叉+汇合）连线用 handle id */
export const GW_HANDLE_MAIN_IN = 'gw-main-in'
export const GW_HANDLE_FORK_OUT = 'gw-fork-out'
export const GW_HANDLE_JOIN_IN = 'gw-join-in'
export const GW_HANDLE_MAIN_OUT = 'gw-main-out'

const BRANCH_DX = 200
const LANE_DY = 88

function isParallelStep(s: ApprovalStepDraft): s is ApprovalStepParallelDraft {
  return (s as { kind?: string }).kind === 'parallel'
}

function makeEdge(
  source: string,
  target: string,
  idx: number,
  handles?: { sourceHandle?: string | null; targetHandle?: string | null },
): Edge {
  const e: Edge = {
    id: `e-${source}-${target}-${idx}`,
    source,
    target,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, width: 18, height: 18 },
    style: { stroke: 'var(--afc-edge, #94a3b8)', strokeWidth: 2 },
  }
  if (handles?.sourceHandle) e.sourceHandle = handles.sourceHandle
  if (handles?.targetHandle) e.targetHandle = handles.targetHandle
  return e
}

export function laneToNodeData(lane: ApprovalLaneDraft): FlowApprovalData {
  return {
    title: lane.title,
    vote_mode: lane.vote_mode,
    assignee_source: lane.assignee_source,
    assignee_user_ids: [...lane.assignee_user_ids],
    dept_id: lane.dept_id,
  }
}

function approvalDataToLane(d: FlowApprovalData): ApprovalLaneDraft {
  return {
    title: String(d.title ?? ''),
    vote_mode: d.vote_mode === 'any_one' ? 'any_one' : 'cosign',
    assignee_source: d.assignee_source ?? 'explicit_users',
    assignee_user_ids: Array.isArray(d.assignee_user_ids) ? [...d.assignee_user_ids] : [],
    dept_id: d.dept_id ?? null,
  }
}

function linearFromApprovalNode(n: Node): ApprovalStepDraft {
  const d = n.data as FlowApprovalData
  const vm: VoteMode = d.vote_mode === 'any_one' ? 'any_one' : 'cosign'
  return {
    kind: 'approval',
    title: String(d.title ?? ''),
    vote_mode: vm,
    assignee_source: (d.assignee_source as ApprovalLaneDraft['assignee_source']) ?? 'explicit_users',
    assignee_user_ids: Array.isArray(d.assignee_user_ids) ? [...d.assignee_user_ids] : [],
    dept_id: typeof d.dept_id === 'number' ? d.dept_id : null,
  }
}

function buildAdjacency(edges: Edge[]) {
  const out = new Map<string, string[]>()
  const inn = new Map<string, string[]>()
  for (const e of edges) {
    if (!out.has(e.source)) out.set(e.source, [])
    out.get(e.source)!.push(e.target)
    if (!inn.has(e.target)) inn.set(e.target, [])
    inn.get(e.target)!.push(e.source)
  }
  return { out, inn }
}

function soleOutgoing(out: Map<string, string[]>, from: string): string | undefined {
  const xs = out.get(from)
  if (!xs || xs.length === 0) return undefined
  if (xs.length === 1) return xs[0]
  return [...xs].sort()[0]
}

function uniqStable(ids: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** 画布上可删除的节点（不含开始/结束） */
export function isDeletableWorkflowNode(n: Node): boolean {
  return (
    n.type === 'flowApproval' ||
    n.type === 'flowParallelGateway' ||
    n.type === 'flowParallelFork' ||
    n.type === 'flowParallelJoin' ||
    n.type === 'flowParallel'
  )
}

export function countApprovalNodes(nodes: Node[]): number {
  return nodes.filter((n) => n.type === 'flowApproval').length
}

function compileForkJoinBlock(
  forkId: string,
  nodesById: Map<string, Node>,
  out: Map<string, string[]>,
): { step: ApprovalStepParallelDraft; joinId: string } | null {
  const branches = out.get(forkId) ?? []
  if (branches.length < 2) return null
  const joinIds = new Set<string>()
  const lanes: ApprovalLaneDraft[] = []
  for (const bid of branches) {
    const bnode = nodesById.get(bid)
    if (!bnode || bnode.type !== 'flowApproval') return null
    const outs = out.get(bid) ?? []
    if (outs.length !== 1) return null
    const j = outs[0]
    const jnode = nodesById.get(j)
    if (!jnode || jnode.type !== 'flowParallelJoin') return null
    joinIds.add(j)
    lanes.push(approvalDataToLane(bnode.data as FlowApprovalData))
  }
  if (joinIds.size !== 1) return null
  const forkNode = nodesById.get(forkId)!
  const title = String((forkNode.data as { title?: string }).title ?? '并行网关')
  return {
    step: { kind: 'parallel', title, lanes: lanes.slice(0, 4) },
    joinId: [...joinIds][0],
  }
}

function compileParallelGatewayBlock(
  gwId: string,
  nodesById: Map<string, Node>,
  edges: Edge[],
): ApprovalStepParallelDraft | null {
  const outgoing = edges.filter((e) => e.source === gwId)
  const explicitFork = uniqStable(
    outgoing.filter((e) => e.sourceHandle === GW_HANDLE_FORK_OUT).map((e) => e.target),
  )
  const heuristicFork = uniqStable(
    outgoing
      .filter(
        (e) =>
          (e.sourceHandle == null || e.sourceHandle === '') &&
          nodesById.get(e.target)?.type === 'flowApproval',
      )
      .map((e) => e.target),
  )
  const forkTargets = explicitFork.length >= 2 ? explicitFork : heuristicFork
  if (forkTargets.length < 2) return null

  const lanes: ApprovalLaneDraft[] = []
  for (const bid of forkTargets) {
    const bnode = nodesById.get(bid)
    if (!bnode || bnode.type !== 'flowApproval') return null
    const apOut = edges.filter((e) => e.source === bid)
    if (apOut.length !== 1) return null
    const back = apOut[0]
    if (back.target !== gwId) return null
    if (
      back.targetHandle != null &&
      back.targetHandle !== '' &&
      back.targetHandle !== GW_HANDLE_JOIN_IN
    ) {
      return null
    }
    lanes.push(approvalDataToLane(bnode.data as FlowApprovalData))
  }
  const gwNode = nodesById.get(gwId)!
  const title = String((gwNode.data as { title?: string }).title ?? '并行网关')
  return { kind: 'parallel', title, lanes: lanes.slice(0, 4) }
}

function mainOutTargetFromGateway(edges: Edge[], gwId: string): string | undefined {
  return edges.find((e) => e.source === gwId && e.sourceHandle === GW_HANDLE_MAIN_OUT)?.target
}

/**
 * 从画布节点与连线还原后端 steps（开始→…→结束 主链；并行分叉+多审批+并行汇合 编译为一条 parallel 步骤）。
 * 若存在未识别的结构，可能提前结束主链解析。
 */
export function stepsFromGraph(nodes: Node[], edges: Edge[]): ApprovalStepDraft[] {
  const nodesById = new Map(nodes.map((n) => [n.id, n]))
  const { out } = buildAdjacency(edges)
  const steps: ApprovalStepDraft[] = []

  const starts = out.get(START_ID) ?? []
  if (starts.length === 0) return steps
  let cur = [...starts].sort()[0]
  let guard = 0
  const maxGuard = 256

  while (cur && cur !== END_ID && guard++ < maxGuard) {
    const n = nodesById.get(cur)
    if (!n) break

    if (n.type === 'flowApproval') {
      steps.push(linearFromApprovalNode(n))
      cur = soleOutgoing(out, cur) ?? END_ID
      continue
    }

    if (n.type === 'flowParallelGateway') {
      const step = compileParallelGatewayBlock(cur, nodesById, edges)
      if (step) steps.push(step)
      cur = mainOutTargetFromGateway(edges, cur) ?? END_ID
      continue
    }

    if (n.type === 'flowParallelFork') {
      const compiled = compileForkJoinBlock(cur, nodesById, out)
      if (compiled) {
        steps.push(compiled.step)
        cur = soleOutgoing(out, compiled.joinId) ?? END_ID
      } else {
        cur = soleOutgoing(out, cur) ?? END_ID
      }
      continue
    }

    if (n.type === 'flowParallelJoin') {
      cur = soleOutgoing(out, cur) ?? END_ID
      continue
    }

    if (n.type === 'flowParallel') {
      const d = n.data as { title?: string; lanes?: ApprovalLaneDraft[] }
      const lanes = Array.isArray(d.lanes) ? d.lanes : defaultParallelStepDraft().lanes
      const normalizedLanes: ApprovalLaneDraft[] =
        lanes.length >= 2
          ? lanes.map((ln) => ({
              title: String(ln.title ?? ''),
              vote_mode: (ln.vote_mode === 'any_one' ? 'any_one' : 'cosign') as VoteMode,
              assignee_source: ln.assignee_source ?? 'explicit_users',
              assignee_user_ids: Array.isArray(ln.assignee_user_ids) ? [...ln.assignee_user_ids] : [],
              dept_id: ln.dept_id ?? null,
            }))
          : defaultParallelStepDraft().lanes
      steps.push({
        kind: 'parallel',
        title: String(d.title ?? '并行网关'),
        lanes: normalizedLanes.slice(0, 4),
      })
      cur = soleOutgoing(out, cur) ?? END_ID
      continue
    }

    cur = soleOutgoing(out, cur) ?? END_ID
  }

  return steps.length > 0 ? steps : [defaultLinearStepDraft(1)]
}

/** 由 steps 生成画布：并行步骤展开为「单节点并行网关 + 各分支审批」+ 显式连线（四端 handle） */
export function layoutFromSteps(steps: ApprovalStepDraft[] | undefined): { nodes: Node[]; edges: Edge[] } {
  const list = steps?.length ? steps : [defaultLinearStepDraft(1)]

  const nodes: Node[] = [
    {
      id: START_ID,
      type: 'flowStart',
      position: { x: STAGE_LEFT, y: ROW_Y },
      data: {},
      draggable: false,
      selectable: true,
    },
  ]
  const edges: Edge[] = []
  let edgeIdx = 0
  let x = STAGE_LEFT + COL_W
  let prevId = START_ID
  let pendingGwMainOut = false

  const pushEdge = (
    a: string,
    b: string,
    h?: { sourceHandle?: string | null; targetHandle?: string | null },
  ) => {
    edges.push(makeEdge(a, b, edgeIdx++, h))
  }

  list.forEach((s, i) => {
    if (isParallelStep(s)) {
      const gwId = `pgw-${i}`
      const lanes = s.lanes.length >= 2 ? s.lanes : defaultParallelStepDraft().lanes
      const laneCount = lanes.length
      const baseY = ROW_Y
      const gwX = x
      const branchX = x + BRANCH_DX + 48

      nodes.push({
        id: gwId,
        type: 'flowParallelGateway',
        position: { x: gwX, y: baseY - 24 },
        data: { title: s.title },
      })
      pushEdge(prevId, gwId, { targetHandle: GW_HANDLE_MAIN_IN })
      prevId = gwId
      pendingGwMainOut = true

      lanes.forEach((lane, li) => {
        const apId = `ap-par-${i}-${li}`
        const yOff = (li - (laneCount - 1) / 2) * LANE_DY
        nodes.push({
          id: apId,
          type: 'flowApproval',
          position: { x: branchX, y: baseY + yOff },
          data: laneToNodeData(lane),
        })
        pushEdge(gwId, apId, { sourceHandle: GW_HANDLE_FORK_OUT })
        pushEdge(apId, gwId, { targetHandle: GW_HANDLE_JOIN_IN })
      })

      x = branchX + COL_W
    } else {
      const id = `ap-${i}`
      nodes.push({
        id,
        type: 'flowApproval',
        position: { x, y: ROW_Y },
        data: laneToNodeData(s),
      })
      const src: { sourceHandle?: string | null } = {}
      if (pendingGwMainOut) {
        src.sourceHandle = GW_HANDLE_MAIN_OUT
        pendingGwMainOut = false
      }
      pushEdge(prevId, id, src)
      prevId = id
      x += COL_W
    }
  })

  nodes.push({
    id: END_ID,
    type: 'flowEnd',
    position: { x, y: ROW_Y },
    data: {},
    draggable: false,
    selectable: true,
  })
  if (pendingGwMainOut) {
    pushEdge(prevId, END_ID, { sourceHandle: GW_HANDLE_MAIN_OUT })
  } else {
    pushEdge(prevId, END_ID)
  }

  return { nodes, edges }
}
