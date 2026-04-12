import type { LoginResponse, User } from '../types'
import request from './request'

export const login = (data: { username: string; password: string }) =>
  request.post<unknown, LoginResponse>('/auth/login', data)

export const register = (data: {
  username: string
  password: string
  name: string
  role?: string
  dept_id?: number | null
}) => request.post<unknown, User>('/auth/register', data)

export const getCurrentUser = () =>
  request.get<unknown, User>('/users/me')
