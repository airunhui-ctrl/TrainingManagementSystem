<template>
  <view class="page">
    <view class="card form-card">
      <text class="title">找回密码</text>
      <text class="desc">可使用账号、手机号或邮箱申请验证码</text>
      <view class="field"><input v-model="identifier" class="field-input" maxlength="120" placeholder="请输入账号 / 手机号 / 邮箱" /></view>
      <button class="code-btn" :disabled="countdown > 0 || requesting" :loading="requesting" @tap="requestCode">{{ countdown > 0 ? `${countdown}s 后重新获取` : '获取验证码' }}</button>
      <view v-if="devCode" class="dev-code">内部测试验证码：{{ devCode }}</view>
      <view class="field"><input v-model="code" class="field-input" type="number" maxlength="6" placeholder="请输入6位验证码" /></view>
      <view class="field"><input v-model="newPassword" class="field-input" password maxlength="64" placeholder="请输入新密码（至少8位）" /></view>
      <view class="field"><input v-model="confirmPassword" class="field-input" password maxlength="64" placeholder="请再次输入新密码" /></view>
      <button class="primary-btn" :loading="loading" @tap="submit">重置密码</button>
      <text class="back-link" @tap="backToLogin">返回登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShareAppMessage, onUnload } from '@dcloudio/uni-app'
import { api } from '../../common/api'

const identifier = ref('')
const challengeId = ref('')
const code = ref('')
const devCode = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const countdown = ref(0)
const requesting = ref(false)
const loading = ref(false)
let timer: ReturnType<typeof setInterval> | undefined
let navigateBackTimer: ReturnType<typeof setTimeout> | null = null

const requestCode = async () => {
  if (!identifier.value.trim()) return uni.showToast({ title: '请输入账号、手机号或邮箱', icon: 'none' })
  requesting.value = true
  try {
    const result = await api.requestPasswordReset(identifier.value.trim())
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
  if (newPassword.value.length < 8) return uni.showToast({ title: '密码至少 8 位', icon: 'none' })
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
.title { display: block; color: #111827; font-size: 42rpx; font-weight: 900; text-align: center; }.desc { display: block; margin: 14rpx 0 34rpx; color: $muted; font-size: 21rpx; line-height: 1.6; text-align: center; }.field { margin-top: 18rpx; }.field-input { box-sizing: border-box; width: 100%; height: 82rpx; padding: 0 26rpx; border: 1rpx solid #dfe3e8; border-radius: 999rpx; color: #1f2937; background: #fafbfc; font-size: 24rpx; }
.code-btn { width: 100%; height: 76rpx; margin-top: 20rpx; border: 1rpx solid #d6deeb; border-radius: 999rpx; color: #2c67c7; background: #f6f9ff; font-size: 23rpx; line-height: 76rpx; }.code-btn::after { border: 0; }.dev-code { margin-top: 14rpx; padding: 16rpx; border-radius: 12rpx; color: #795400; background: #fff7d6; font-size: 21rpx; text-align: center; }
.primary-btn { width: 100%; height: 82rpx; margin-top: 30rpx; border: 0; border-radius: 999rpx; color: #fff; background: #111318; font-size: 26rpx; line-height: 82rpx; font-weight: 800; }.primary-btn::after { border: 0; }.back-link { display: block; margin-top: 28rpx; color: #52627a; font-size: 22rpx; text-align: center; }
</style>
