/** 与后端草稿 flow.steps 项一致（单轨 approval / 并行 parallel） */

export type AssigneeSource =
  | 'explicit_users'
  | 'applicant_dept_admins'
  | 'dept_admins'
  | 'role_school_admin'
  | 'role_expert'

export type VoteMode = 'cosign' | 'any_one'

export type ApprovalLaneDraft = {
  title: string
  vote_mode: VoteMode
  assignee_source: AssigneeSource
  assignee_user_ids: number[]
  dept_id: number | null
}

export type ApprovalStepLinearDraft = ApprovalLaneDraft & {
  kind?: 'approval'
}

export type ApprovalStepParallelDraft = {
  kind: 'parallel'
  title: string
  lanes: ApprovalLaneDraft[]
}

export type ApprovalStepDraft = ApprovalStepLinearDraft | ApprovalStepParallelDraft

export function defaultLaneDraft(title = '子轨'): ApprovalLaneDraft {
  return {
    title,
    vote_mode: 'cosign',
    assignee_source: 'explicit_users',
    assignee_user_ids: [],
    dept_id: null,
  }
}

export function defaultLinearStepDraft(i: number): ApprovalStepLinearDraft {
  return {
    kind: 'approval',
    title: `环节${i}`,
    vote_mode: 'cosign',
    assignee_source: 'explicit_users',
    assignee_user_ids: [],
    dept_id: null,
  }
}

export function defaultParallelStepDraft(): ApprovalStepParallelDraft {
  return {
    kind: 'parallel',
    title: '并行网关',
    lanes: [defaultLaneDraft('子轨 A'), defaultLaneDraft('子轨 B')],
  }
}

const SOURCES: AssigneeSource[] = [
  'explicit_users',
  'applicant_dept_admins',
  'dept_admins',
  'role_school_admin',
  'role_expert',
]

export function coerceLaneFromApi(raw: unknown): ApprovalLaneDraft {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const src = o.assignee_source
  const assignee_source: AssigneeSource = SOURCES.includes(src as AssigneeSource)
    ? (src as AssigneeSource)
    : 'explicit_users'
  const uids = o.assignee_user_ids
  const assignee_user_ids = Array.isArray(uids)
    ? uids.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0)
    : []
  const did = o.dept_id
  const dept_id =
    did != null && did !== '' && Number.isFinite(Number(did)) ? Number(did) : null
  return {
    title: String(o.title ?? ''),
    vote_mode: o.vote_mode === 'any_one' ? 'any_one' : 'cosign',
    assignee_source,
    assignee_user_ids,
    dept_id,
  }
}

/** 将接口返回的 flow.steps 转为画布草稿（含旧格式仅有 title + assignee_user_ids） */
export function normalizeApiStepsToDraft(steps: unknown[] | undefined): ApprovalStepDraft[] {
  if (!steps?.length) return [defaultLinearStepDraft(1)]
  const out: ApprovalStepDraft[] = []
  for (const item of steps) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (o.kind === 'parallel' && Array.isArray(o.lanes)) {
      let lanes = (o.lanes as unknown[]).map((ln) => coerceLaneFromApi(ln))
      if (lanes.length < 2) lanes = defaultParallelStepDraft().lanes
      if (lanes.length > 4) lanes = lanes.slice(0, 4)
      out.push({
        kind: 'parallel',
        title: String(o.title ?? '并行网关'),
        lanes,
      })
    } else {
      out.push({ kind: 'approval', ...coerceLaneFromApi(o) })
    }
  }
  return out.length ? out : [defaultLinearStepDraft(1)]
}
