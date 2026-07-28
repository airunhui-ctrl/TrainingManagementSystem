const ACCESS_TOKEN_KEY = 'hexagon_access_token'
const REFRESH_TOKEN_KEY = 'hexagon_refresh_token'

export const tokenStorage = {
  getAccessToken: () => uni.getStorageSync(ACCESS_TOKEN_KEY) as string,
  getRefreshToken: () => uni.getStorageSync(REFRESH_TOKEN_KEY) as string,
  setTokens: (accessToken: string, refreshToken: string) => {
    uni.setStorageSync(ACCESS_TOKEN_KEY, accessToken)
    uni.setStorageSync(REFRESH_TOKEN_KEY, refreshToken)
  },
  clear: () => {
    uni.removeStorageSync(ACCESS_TOKEN_KEY)
    uni.removeStorageSync(REFRESH_TOKEN_KEY)
  }
}
