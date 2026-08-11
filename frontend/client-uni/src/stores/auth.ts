import { defineStore } from 'pinia'
import { tokenStorage } from '../common/auth'

export const useAuthStore = defineStore('auth', {
  state: () => ({ accessToken: '', userName: '' }),
  getters: { isLoggedIn: (state) => Boolean(state.accessToken) },
  actions: {
    restore() { this.accessToken = tokenStorage.getAccessToken() || '' },
    setTokens(accessToken: string, refreshToken: string, userName: string) {
      this.accessToken = accessToken
      this.userName = userName
      tokenStorage.setTokens(accessToken, refreshToken)
    },
    logout() { this.accessToken = ''; this.userName = ''; tokenStorage.clear(); uni.switchTab({ url: '/pages/index/index' }) }
  }
})
