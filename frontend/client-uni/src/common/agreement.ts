import { api } from './api'
import { tokenStorage } from './auth'

export const AGREEMENT_VERSION = '2026-08-17-v1'

export async function ensureAgreement(redirect = ''): Promise<boolean> {
  if (!tokenStorage.getAccessToken()) return true
  try {
    const profile = await api.profile()
    if (!profile.agreementRequired) return true
  } catch {
    return true
  }
  const query = redirect ? `?redirect=${encodeURIComponent(redirect)}` : ''
  uni.navigateTo({ url: `/pages/agreement/agreement${query}` })
  return false
}
