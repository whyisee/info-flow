import type { ApproverOption, Project } from '../types'
import request from './request'

export const getProjects = () =>
  request.get<unknown, Project[]>('/projects/')

export const getApproverCandidates = () =>
  request.get<unknown, ApproverOption[]>('/projects/approver-candidates')

export const getProject = (id: number) =>
  request.get<unknown, Project>(`/projects/${id}`)

export const createProject = (data: {
  name: string
  description?: string
  start_time: string
  end_time: string
}) => request.post<unknown, Project>('/projects/', data)

export const updateProject = (
  id: number,
  data: {
    name?: string
    description?: string
    start_time?: string
    end_time?: string
    status?: number
  },
) => request.put<unknown, Project>(`/projects/${id}`, data)

export const deleteProject = (id: number) =>
  request.delete(`/projects/${id}`)
