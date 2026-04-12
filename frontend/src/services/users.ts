import type { User } from '../types'
import request from './request'

export type UserListQuery = {
  keyword?: string
  role?: string
  dept_id?: number | null
  /** 不传表示不限 */
  is_superuser?: boolean
  /** active | deleted | all，对应后端 user_status */
  user_status?: 'active' | 'deleted' | 'all'
}

export type UserCreatePayload = {
  username: string
  password: string
  name: string
  role: string
  roles?: string[]
  dept_id?: number | null
  is_superuser?: boolean
  phone?: string | null
  email?: string | null
}

export type UserUpdatePayload = {
  name?: string
  role?: string
  roles?: string[]
  dept_id?: number | null
  password?: string
  is_superuser?: boolean
  phone?: string | null
  email?: string | null
  status?: 'active' | 'deleted'
}

export type BulkUserResult = {
  created: number
  failed: { username: string; detail: string }[]
}

function cleanParams(q?: UserListQuery): Record<string, string | number | boolean> {
  if (!q) return {}
  const out: Record<string, string | number | boolean> = {}
  if (q.keyword != null && q.keyword !== '') out.keyword = q.keyword
  if (q.role != null && q.role !== '') out.role = q.role
  if (q.dept_id != null && q.dept_id !== undefined && !Number.isNaN(Number(q.dept_id))) {
    out.dept_id = Number(q.dept_id)
  }
  if (typeof q.is_superuser === 'boolean') out.is_superuser = q.is_superuser
  if (q.user_status != null) {
    out.user_status = q.user_status
  }
  return out
}

export const listUsers = (query?: UserListQuery) =>
  request.get<unknown, User[]>('/users/', { params: cleanParams(query) })

export const createUser = (data: UserCreatePayload) =>
  request.post<unknown, User>('/users/', data)

export const updateUser = (id: number, data: UserUpdatePayload) =>
  request.put<unknown, User>(`/users/${id}`, data)

export const bulkCreateUsers = (items: UserCreatePayload[]) =>
  request.post<unknown, BulkUserResult>('/users/bulk', { items })
