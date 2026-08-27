<template>
  <view class="page">
    <view class="brand">
      <view class="brand-mark">六</view>
      <text class="brand-name">六边形培训管理</text>
    </view>

    <view class="card form-card">
      <text class="title">登录</text>
      <text class="desc">登录后即可报名、支付、开票和管理个人学习记录</text>

      <view class="field">
        <input v-model="username" class="field-input" placeholder="请输入用户名/手机号" />
      </view>
      <view class="field password-field">
        <input v-model="password" class="field-input" :password="!showPassword" placeholder="请输入密码" />
        <text class="password-toggle" @tap="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</text>
      </view>

      <button class="primary-btn" :loading="loading" @tap="login">登录</button>
      <view v-if="isWeixinMp" class="wechat-divider"><text>或</text></view>
      <button v-if="isWeixinMp" class="wechat-btn" :loading="wechatLoading" @tap="wechatLogin">微信一键登录</button>
      <view class="form-links"><text @tap="goRegister">立即注册</text><text @tap="goForgotPassword">忘记密码</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShareAppMessage } from '@dcloudio/uni-app'
import { api } from '../../common/api'
import { ensureAgreement } from '../../common/agreement'
import { redirectAfterLogin } from '../../common/invoice-notice'
import { navigateAfterLogin } from '../../common/login-redirect'
import { useAuthStore } from '../../stores/auth'

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const wechatLoading = ref(false)
const isWeixinMp = ref(false)
try { isWeixinMp.value = String((uni.getSystemInfoSync() as any).uniPlatform || '').toLowerCase() === 'mp-weixin' } catch { /* 非小程序环境保持隐藏 */ }

const login = async () => {
  if (!username.value.trim() || !password.value) {
    uni.showToast({ title: '请输入用户名/手机号和密码', icon: 'none' })
    return
  }
  loading.value = true
  try {
    const result = await api.login(username.value.trim(), password.value)
    useAuthStore().setTokens(result.accessToken, result.refreshToken, result.user.username)
    if (!await ensureAgreement()) return
    navigateAfterLogin(() => void redirectAfterLogin())
  } catch {
    uni.showToast({ title: '账号或密码错误', icon: 'none' })
  } finally {
    loading.value = false
  }
}
const wechatLogin = async () => {
  if (wechatLoading.value) return
  wechatLoading.value = true
  try {
    const loginResult = await new Promise<{ code?: string }>((resolve, reject) => uni.login({ provider: 'weixin', success: resolve, fail: reject }))
    const code = String(loginResult.code || '')
    if (!code) throw new Error('未获取到微信登录凭证，请重试')
    const profile: Record<string, any> = {}
    try {
      const userResult = await new Promise<any>((resolve, reject) => uni.getUserProfile({ desc: '用于完善登录后展示资料', success: resolve, fail: reject }))
      profile.nickName = userResult?.userInfo?.nickName || ''
      profile.avatarUrl = userResult?.userInfo?.avatarUrl || ''
    } catch { /* 用户拒绝头像昵称授权时仍可完成登录 */ }
    const result = await api.wechatLogin(code, profile, 'mini_program')
    useAuthStore().setTokens(result.accessToken, result.refreshToken, result.user.username)
    if (!await ensureAgreement()) return
    navigateAfterLogin(() => void redirectAfterLogin())
  } catch (error: any) {
    uni.showToast({ title: error?.message || '微信登录失败，请重试', icon: 'none' })
  } finally {
    wechatLoading.value = false
  }
}
const goRegister = () => uni.navigateTo({ url: '/pages/register-account/register-account' })
const goForgotPassword = () => uni.navigateTo({ url: '/pages/forgot-password/forgot-password' })
onShareAppMessage(() => ({ title: '六边形培训登录', path: '/pages/login/login' }))
</script>

<style scoped lang="scss">
.page { box-sizing: border-box; min-height: 100vh; padding: 120rpx 40rpx 80rpx; background: #f7f8fa; }
.brand { display: flex; align-items: center; justify-content: center; gap: 14rpx; margin-bottom: 48rpx; }
.brand-mark { display: grid; place-items: center; width: 68rpx; height: 68rpx; border-radius: 20rpx; color: $navy; background: $yellow; font-size: 34rpx; font-weight: 900; }
.brand-name { color: $navy; font-size: 32rpx; font-weight: 900; }
.form-card { box-sizing: border-box; width: 100%; max-width: 720rpx; margin: 0 auto; padding: 54rpx 42rpx 48rpx; border-radius: 28rpx; background: #fff; box-shadow: 0 14rpx 48rpx rgba(27, 45, 75, .08); }
.title { display: block; color: #111827; font-size: 42rpx; font-weight: 900; text-align: center; }
.desc { display: block; margin: 14rpx 0 42rpx; color: $muted; font-size: 21rpx; line-height: 1.6; text-align: center; }
.field { position: relative; margin-top: 20rpx; }
.field-input { box-sizing: border-box; width: 100%; height: 82rpx; padding: 0 26rpx; border: 1rpx solid #dfe3e8; border-radius: 999rpx; color: #1f2937; background: #fafbfc; font-size: 24rpx; }
.field-input:focus { border-color: #1f2937; background: #fff; }
.password-field .field-input { padding-right: 100rpx; }
.password-toggle { position: absolute; top: 0; right: 26rpx; height: 82rpx; color: #697386; font-size: 20rpx; line-height: 82rpx; }
.primary-btn { width: 100%; height: 82rpx; margin-top: 34rpx; border: 0; border-radius: 999rpx; color: #fff; background: #111318; font-size: 26rpx; line-height: 82rpx; font-weight: 800; }
.primary-btn::after { border: 0; }
.wechat-divider { display: flex; align-items: center; gap: 18rpx; margin: 30rpx 0 4rpx; color: #9aa3af; font-size: 20rpx; }
.wechat-divider::before, .wechat-divider::after { content: ''; flex: 1; height: 1rpx; background: #e8ebef; }
.wechat-btn { width: 100%; height: 82rpx; margin-top: 16rpx; border: 0; border-radius: 999rpx; color: #fff; background: #07c160; font-size: 26rpx; line-height: 82rpx; font-weight: 800; }
.wechat-btn::after { border: 0; }
.form-links { display: flex; justify-content: space-between; margin-top: 28rpx; padding: 0 8rpx; color: #52627a; font-size: 22rpx; }
.form-links text:last-child { color: #2c67c7; }
</style>
