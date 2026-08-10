export type UserRole = 'admin' | 'operator' | 'user'

export const normalizeUserRole = (role: unknown): UserRole => {
  if (role === 'admin') return 'admin'
  if (role === 'operator') return 'operator'
  return 'user'
}

export const isAdminRole = (role: unknown) => role === 'admin' || role === 'operator'
