import axios from 'axios'

/** 与后端 X-Active-Role 对应；旧版 key viewAsRole 会自动迁移 */
export const ACTIVE_ROLE_STORAGE_KEY = 'activeRole'
const LEGACY_VIEW_AS_KEY = 'viewAsRole'

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

function readStoredActiveRole(): string | null {
  let v = localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY)
  if (!v) {
    const legacy = localStorage.getItem(LEGACY_VIEW_AS_KEY)
    if (legacy) {
      localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, legacy)
      localStorage.removeItem(LEGACY_VIEW_AS_KEY)
      v = legacy
    }
  }
  return v
}

request.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  const active = readStoredActiveRole()
  if (active) {
    config.headers['X-Active-Role'] = active
  }
  return config
})

request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY)
      localStorage.removeItem(LEGACY_VIEW_AS_KEY)
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default request
