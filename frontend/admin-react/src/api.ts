import { authStorage } from './auth'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3100/api'
let refreshing: Promise<string> | null = null

async function refreshAccessToken() {
  const refreshToken = authStorage.getRefresh()
  if (!refreshToken) throw new Error('没有可用的刷新令牌')
  if (!refreshing) refreshing = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken }),
  }).then(async response => {
    if (!response.ok) throw new Error('登录已过期')
    const result = await response.json() as { accessToken: string; refreshToken: string }
    authStorage.setTokens(result.accessToken, result.refreshToken)
    return result.accessToken
  }).finally(() => { refreshing = null })
  return refreshing
}

export async function apiFetch<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
  const token = authStorage.get()
  const headers = new Headers(init.headers)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers })
  if (response.status === 401 && !retried && authStorage.getRefresh()) {
    try { await refreshAccessToken(); return apiFetch<T>(path, init, true) } catch { /* clear below */ }
  }
  if (response.status === 401) { authStorage.clear(); window.location.assign('/login') }
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { message?: string } | null
    throw new Error(payload?.message || `请求失败：${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function adminLogin(username: string, password: string) {
  const response = await fetch(`${API_BASE_URL}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
  if (!response.ok) throw new Error('账号或密码错误')
  return response.json() as Promise<{ accessToken: string; refreshToken: string; user: { username: string; role: string } }>
}

export interface AdminCourse { id: string; title: string; category: string; price: number; capacity: number; enrolled: number; seatsLeft: number; status: string }
