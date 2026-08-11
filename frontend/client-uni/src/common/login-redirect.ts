const LOGIN_RETURN_KEY = 'client-login-return'
const TAB_PAGES = new Set(['/pages/index/index', '/pages/business/business', '/pages/mine/mine'])

export const setLoginReturn = (path: string) => {
  uni.setStorageSync(LOGIN_RETURN_KEY, path)
}

export const consumeLoginReturn = () => {
  const target = String(uni.getStorageSync(LOGIN_RETURN_KEY) || '').trim()
  if (target) uni.removeStorageSync(LOGIN_RETURN_KEY)
  return target
}

export const goLogin = (returnPath?: string) => {
  if (returnPath) setLoginReturn(returnPath)
  uni.navigateTo({ url: '/pages/login/login' })
}

export const navigateAfterLogin = (fallback: () => void) => {
  const target = consumeLoginReturn()
  if (!target) return fallback()
  if (TAB_PAGES.has(target)) uni.switchTab({ url: target })
  else uni.reLaunch({ url: target })
}
