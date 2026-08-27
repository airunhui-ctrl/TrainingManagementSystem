<template>
  <view class="page">
    <view class="card form-card">
      <text class="title">找回密码</text>
      <text class="desc">输入注册手机号，验证码将发送到该手机号</text>
            <view class="field"><input v-model="phone" class="field-input" type="number" maxlength="11" placeholder="请输入注册手机号" /></view>
      <view class="code-row"><input v-model="code" class="field-input" type="number" maxlength="6" placeholder="请输入短信验证码" /><button class="code-btn" :disabled="countdown > 0 || requesting" :loading="requesting" @tap="requestCode">{{ countdown > 0 ? `${countdown}s 后重试` : requesting ? '发送中…' : '获取验证码' }}</button></view>
      <view v-if="devCode" class="dev-code">内部测试验证码：{{ devCode }}</view>
      <view class="field password-field">
        <input v-model="newPassword" class="field-input" :password="!showNewPassword" maxlength="64" placeholder="请输入新密码（至少8位，含字母、数字、符号）" />
        <text class="password-toggle" @tap="showNewPassword = !showNewPassword">{{ showNewPassword ? '隐藏' : '显示' }}</text>
      </view>
      <view class="field password-field">
        <input v-model="confirmPassword" class="field-input" :password="!showConfirmPassword" maxlength="64" placeholder="请再次输入新密码" />
        <text class="password-toggle" @tap="showConfirmPassword = !showConfirmPassword">{{ showConfirmPassword ? '隐藏' : '显示' }}</text>
      </view>
      <button class="primary-btn" :loading="loading" @tap="submit">重置密码</button>
      <text class="back-link" @tap="backToLogin">返回登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShareAppMessage, onUnload } from '@dcloudio/uni-app'
import { api } from '../../common/api'

const phone = ref('')
const challengeId = ref('')
const code = ref('')
const devCode = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const showNewPassword = ref(false)
const showConfirmPassword = ref(false)
const countdown = ref(0)
const requesting = ref(false)
const loading = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
let navigateBackTimer: ReturnType<typeof setTimeout> | null = null

const requestCode = async () => {
    if (!/^1\d{10}$/.test(phone.value.trim())) return uni.showToast({ title: '请输入正确的注册手机号', icon: 'none' })
  requesting.value = true
  try {
    const result = await api.requestPasswordReset(phone.value.trim())
    challengeId.value = result.challengeId
    devCode.value = result.devCode || ''
    countdown.value = 60
    if (timer) clearInterval(timer)
    timer = setInterval(() => { countdown.value -= 1; if (countdown.value <= 0 && timer) { clearInterval(timer); timer = undefined } }, 1000)
    uni.showToast({ title: result.devCode ? '验证码已生成（内部测试）' : '验证码已发送', icon: 'none' })
  } catch (error: any) { uni.showToast({ title: error?.message || '验证码获取失败', icon: 'none' }) } finally { requesting.value = false }
}
const submit = async () => {
  if (!challengeId.value) return uni.showToast({ title: '请先获取验证码', icon: 'none' })
  if (!/^\d{6}$/.test(code.value)) return uni.showToast({ title: '请输入6位验证码', icon: 'none' })
  if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/.test(newPassword.value)) return uni.showToast({ title: '密码至少 8 位，且需包含字母、数字和符号', icon: 'none' })
  if (newPassword.value !== confirmPassword.value) return uni.showToast({ title: '两次输入的密码不一致', icon: 'none' })
  loading.value = true
  try { await api.confirmPasswordReset({ challengeId: challengeId.value, code: code.value, newPassword: newPassword.value, confirmPassword: confirmPassword.value }); uni.showToast({ title: '密码已重置', icon: 'none' }); navigateBackTimer = setTimeout(() => uni.navigateBack(), 400) }
  catch (error: any) { uni.showToast({ title: error?.message || '密码重置失败', icon: 'none' }) } finally { loading.value = false }
}
const backToLogin = () => uni.navigateBack()
onUnload(() => {
  if (timer) clearInterval(timer)
  timer = undefined
  if (navigateBackTimer) clearTimeout(navigateBackTimer)
  navigateBackTimer = null
})
onShareAppMessage(() => ({ title: '找回密码', path: '/pages/forgot-password/forgot-password' }))
</script>

<style scoped lang="scss">
.page { box-sizing: border-box; min-height: 100vh; padding: 70rpx 40rpx; background: #f7f8fa; }.form-card { box-sizing: border-box; width: 100%; max-width: 720rpx; margin: 0 auto; padding: 48rpx 42rpx; border-radius: 28rpx; background: #fff; box-shadow: 0 14rpx 48rpx rgba(27, 45, 75, .08); }
.title { display: block; color: #111827; font-size: 42rpx; font-weight: 900; text-align: center; }.desc { display: block; margin: 14rpx 0 34rpx; color: $muted; font-size: 21rpx; line-height: 1.6; text-align: center; }.field { position: relative; margin-top: 18rpx; }.field-input { box-sizing: border-box; width: 100%; height: 82rpx; padding: 0 26rpx; border: 1rpx solid #dfe3e8; border-radius: 999rpx; color: #1f2937; background: #fafbfc; font-size: 24rpx; }
.code-row { display: flex; align-items: center; gap: 14rpx; margin-top: 18rpx; }.code-row .field-input { flex: 1; min-width: 0; }
.code-btn { flex: 0 0 210rpx; height: 82rpx; margin: 0; padding: 0 12rpx; border: 1rpx solid #dfe3e8; border-radius: 999rpx; color: #27354b; background: #fff; font-size: 21rpx; line-height: 80rpx; }.code-btn::after { border: 0; }.code-btn[disabled] { color: #9aa6b6; background: #f2f4f7; }
.password-field .field-input { padding-right: 100rpx; }.password-toggle { position: absolute; top: 0; right: 26rpx; height: 82rpx; color: #697386; font-size: 20rpx; line-height: 82rpx; }.dev-code { margin-top: 14rpx; padding: 16rpx; border-radius: 12rpx; color: #795400; background: #fff7d6; font-size: 21rpx; text-align: center; }
.primary-btn { width: 100%; height: 82rpx; margin-top: 30rpx; border: 0; border-radius: 999rpx; color: #fff; background: #111318; font-size: 26rpx; line-height: 82rpx; font-weight: 800; }.primary-btn::after { border: 0; }.back-link { display: block; margin-top: 28rpx; color: #52627a; font-size: 22rpx; text-align: center; }
</style>
