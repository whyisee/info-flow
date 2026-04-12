import type { Material } from '../types'
import request from './request'

export const getMaterials = () =>
  request.get<unknown, Material[]>('/materials/')

export const getMaterial = (id: number) =>
  request.get<unknown, Material>(`/materials/${id}`)

export const createMaterial = (data: { project_id: number; content?: Record<string, unknown> }) =>
  request.post<unknown, Material>('/materials/', data)

export const updateMaterial = (id: number, data: { content: Record<string, unknown> }) =>
  request.put<unknown, Material>(`/materials/${id}`, data)

export const submitMaterial = (id: number) =>
  request.post<unknown, Material>(`/materials/${id}/submit`)
