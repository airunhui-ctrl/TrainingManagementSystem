export const PASSWORD_POLICY_MESSAGE = '密码至少 8 位，且需包含字母、数字和符号'

export function isValidPassword(password: unknown): boolean {
  return typeof password === 'string' && /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/.test(password)
}
