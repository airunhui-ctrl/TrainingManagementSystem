import { api } from './api'

type BindResult = { bound: boolean; alreadyBound: boolean }

let pending: Promise<BindResult> | null = null

const isWeixinMiniProgram = () => {
  try { return String((uni.getSystemInfoSync() as any).uniPlatform || '').toLowerCase() === 'mp-weixin' } catch { return false }
}

export async function bindWechatOpenIdSilently(): Promise<BindResult> {
  if (!isWeixinMiniProgram()) return { bound: true, alreadyBound: true }
  if (pending) return pending
  pending = (async () => {
    const loginResult = await new Promise<{ code?: string }>((resolve, reject) => {
      uni.login({ provider: 'weixin', success: resolve, fail: reject })
    })
    const code = String(loginResult.code || '')
    if (!code) throw new Error('未获取到微信登录凭证，请重试')
    return api.bindWechatOpenId(code)
  })()
  try {
    return await pending
  } finally {
    pending = null
  }
}