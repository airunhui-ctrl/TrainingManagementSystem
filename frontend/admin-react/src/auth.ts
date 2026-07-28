const ACCESS_TOKEN = 'hexagon_admin_access_token'
const REFRESH_TOKEN = 'hexagon_admin_refresh_token'

export const authStorage = {
  get: () => window.localStorage.getItem(ACCESS_TOKEN) || '',
  getRefresh: () => window.localStorage.getItem(REFRESH_TOKEN) || '',
  setTokens: (accessToken: string, refreshToken: string) => {
    window.localStorage.setItem(ACCESS_TOKEN, accessToken)
    window.localStorage.setItem(REFRESH_TOKEN, refreshToken)
  },
  clear: () => {
    window.localStorage.removeItem(ACCESS_TOKEN)
    window.localStorage.removeItem(REFRESH_TOKEN)
  },
}
