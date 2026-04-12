export interface User {
  id: number
  username: string
  name: string
  role: 'teacher' | 'dept_admin' | 'school_admin' | 'expert'
  phone?: string | null
  email?: string | null
  /** active=正常 deleted=逻辑删除 */
  status?: string
  /** 已绑定的预置角色（多身份） */
  roles?: string[]
  /** 后端 RBAC 合并后的权限码列表 */
  permissions?: string[]
  /** 超级管理员 */
  is_superuser?: boolean
  /** 当前请求选择的身份（与 X-Active-Role 一致且合法时由后端回显） */
  active_role?: string | null
  dept_id?: number
}

export interface ApprovalFlowStep {
  title: string
  assignee_user_ids: number[]
}

export interface ApprovalFlowConfig {
  steps: ApprovalFlowStep[]
}

export interface ApprovalFlowStepDisplay {
  title: string
  assignee_user_ids: number[]
  assignee_names: string
}

export interface ApproverOption {
  id: number
  name: string
  username: string
  role: string
}

export interface Project {
  id: number
  name: string
  description?: string
  start_time: string
  end_time: string
  status: number
  created_by?: number
  /** 项目创建时间（ISO） */
  created_at?: string
  /** 可变环节；每环节 assignee_user_ids 为会签（须全员通过） */
  approval_flow?: ApprovalFlowConfig | null
  approval_flow_display?: ApprovalFlowStepDisplay[] | null
}

export interface Material {
  id: number
  user_id: number
  project_id: number
  content: Record<string, unknown>
  status: number
  submitted_at?: string
  /** 申报记录创建时间（ISO） */
  created_at?: string
  /** 提交时从项目复制的审批流 */
  approval_snapshot?: Record<string, unknown> | null
  approval_snapshot_display?: ApprovalFlowStepDisplay[] | null
}

export interface Attachment {
  id: number
  material_id: number
  file_name: string
  file_path: string
  file_size?: number
  file_type?: string
  created_at?: string
}

export interface ApprovalRecord {
  id: number
  material_id: number
  approver_id: number
  status: number
  comment?: string
  created_at?: string
  approver_name?: string
  step_index?: number | null
  /** 待办列表接口附带 */
  approval_step_count?: number
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: User
}
