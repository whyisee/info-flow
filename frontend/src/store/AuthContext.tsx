import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { message } from 'antd'
import type { User } from '../types'
import * as authService from '../services/auth'
import { ACTIVE_ROLE_STORAGE_KEY } from '../services/request'

interface AuthContextType {
  user: User | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>(null!)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)

  const refreshUser = useCallback(async () => {
    const t = localStorage.getItem('token')
    if (!t) return
    const u = await authService.getCurrentUser()
    setUser(u)
  }, [])

  useEffect(() => {
    if (token) {
      authService
        .getCurrentUser()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token')
          localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY)
          setToken(null)
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [token])

  const login = async (username: string, password: string) => {
    const res = await authService.login({ username, password })
    localStorage.setItem('token', res.access_token)
    setToken(res.access_token)
    localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY)
    setUser(res.user)
    message.success('登录成功')
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem(ACTIVE_ROLE_STORAGE_KEY)
    setToken(null)
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
