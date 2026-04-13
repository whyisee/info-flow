import type { AssigneeSource } from './types'

export const ASSIGNEE_SOURCE_OPTIONS: { value: AssigneeSource; label: string }[] = [
  { value: 'explicit_users', label: '指定人员' },
  { value: 'applicant_dept_admins', label: '申报人所在部门的部门管理员' },
  { value: 'dept_admins', label: '指定部门的部门管理员' },
  { value: 'role_school_admin', label: '校级管理员角色（全部）' },
  { value: 'role_expert', label: '专家角色（全部）' },
]

export const VOTE_MODE_OPTIONS: { value: 'cosign' | 'any_one'; label: string }[] = [
  { value: 'cosign', label: '会签（须全员通过）' },
  { value: 'any_one', label: '或签（任一人通过即可）' },
]
