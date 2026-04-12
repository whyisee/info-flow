import request from './request'

export const getTemplates = () =>
  request.get<unknown, { name: string; size: number }[]>('/templates/')

export const uploadTemplate = (file: File) => {
  const formData = new FormData()
  formData.append('file', file)
  return request.post('/templates/upload', formData)
}

export const deleteTemplate = (filename: string) =>
  request.delete(`/templates/${filename}`)
