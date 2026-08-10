<template>
  <view class="page">
    <view class="card form-card">
      <text class="title">注册账号</text>
      <text class="desc">使用手机号短信验证码注册，注册后可管理多个学员并追踪报名履历</text>
      <view class="field"><input v-model="form.phone" class="field-input" type="number" maxlength="11" placeholder="请输入手机号" /></view>
      <view class="code-row"><input v-model="form.code" class="field-input" type="number" maxlength="6" placeholder="请输入短信验证码" /><button class="code-btn" :disabled="countdown > 0 || sendingCode" @tap="requestCode">{{ countdown > 0 ? `${countdown}s 后重试` : sendingCode ? '发送中…' : '获取验证码' }}</button></view>
      <view class="field"><input v-model="form.password" class="field-input" password maxlength="64" placeholder="请输入密码（至少8位）" /></view>
      <view class="field"><input v-model="form.confirmPassword" class="field-input" password maxlength="64" placeholder="请再次输入密码" /></view>
      <view class="field"><input v-model="form.name" class="field-input" maxlength="80" placeholder="姓名（可选）" /></view>
      <button class="primary-btn" :loading="loading" @tap="submit">注册并登录</button>
      <text class="back-link" @tap="backToLogin">已有账号，返回登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { api } from '../../common/api'
import { useAuthStore } from '../../stores/auth'

const form = reactive({ phone: '', code: '', password: '', confirmPassword: '', name: '' })
const loading = ref(false)
const sendingCode = ref(false)
const countdown = ref(0)
const challengeId = ref('')
let countdownTimer: ReturnType<typeof setInterval> | null = null

const requestCode = async () => {
  const phone = form.phone.trim()
  if (!/^1\d{10}$/.test(phone)) return uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
  if (sendingCode.value || countdown.value > 0) return
  sendingCode.value = true
  try {
    const result = await api.requestPhoneRegistrationCode(phone)
    challengeId.value = result.challengeId
    countdown.value = 60
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = setInterval(() => { countdown.value -= 1; if (countdown.value <= 0 && countdownTimer) { clearInterval(countdownTimer); countdownTimer = null } }, 1000)
    uni.showToast({ title: result.devCode ? `开发验证码：${result.devCode}` : '验证码已发送', icon: 'none', duration: 3000 })
  } catch (error: any) { uni.showToast({ title: error?.message || '验证码发送失败', icon: 'none' }) } finally { sendingCode.value = false }
}

const submit = async () => {
  const phone = form.phone.trim()
  if (!/^1\d{10}$/.test(phone) || !form.code.trim() || !form.password || !form.confirmPassword) return uni.showToast({ title: '请填写手机号、验证码和密码', icon: 'none' })
  if (form.password.length < 8) return uni.showToast({ title: '密码至少 8 位', icon: 'none' })
  if (form.password !== form.confirmPassword) return uni.showToast({ title: '两次输入的密码不一致', icon: 'none' })
  loading.value = true
  try {
    if (!challengeId.value) return uni.showToast({ title: '请先获取短信验证码', icon: 'none' })
    const result = await api.registerByPhoneSms({ challengeId: challengeId.value, phone, code: form.code.trim(), password: form.password, confirmPassword: form.confirmPassword, ...(form.name.trim() ? { name: form.name.trim() } : {}) })
    useAuthStore().setTokens(result.accessToken, result.refreshToken, result.user.username)
    uni.showToast({ title: '注册成功', icon: 'none' })
    setTimeout(() => uni.switchTab({ url: '/pages/index/index' }), 250)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '注册失败', icon: 'none' })
  } finally { loading.value = false }
}
const backToLogin = () => uni.navigateBack()
onUnmounted(() => { if (countdownTimer) clearInterval(countdownTimer) })
</script>

<style scoped lang="scss">
.page { box-sizing: border-box; min-height: 100vh; padding: 70rpx 40rpx; background: #f7f8fa; }
.form-card { box-sizing: border-box; width: 100%; max-width: 720rpx; margin: 0 auto; padding: 48rpx 42rpx; border-radius: 28rpx; background: #fff; box-shadow: 0 14rpx 48rpx rgba(27, 45, 75, .08); }
.title { display: block; color: #111827; font-size: 42rpx; font-weight: 900; text-align: center; }.desc { display: block; margin: 14rpx 0 34rpx; color: $muted; font-size: 21rpx; line-height: 1.6; text-align: center; }
.field { margin-top: 18rpx; }.field-input { box-sizing: border-box; width: 100%; height: 82rpx; padding: 0 26rpx; border: 1rpx solid #dfe3e8; border-radius: 999rpx; color: #1f2937; background: #fafbfc; font-size: 24rpx; }
.code-row { display: flex; align-items: center; gap: 14rpx; margin-top: 18rpx; }.code-row .field-input { flex: 1; min-width: 0; }.code-btn { flex: 0 0 210rpx; height: 82rpx; margin: 0; padding: 0 12rpx; border: 1rpx solid #dfe3e8; border-radius: 999rpx; color: #27354b; background: #fff; font-size: 21rpx; line-height: 80rpx; }.code-btn::after { border: 0; }.code-btn[disabled] { color: #9aa6b6; background: #f2f4f7; }
.primary-btn { width: 100%; height: 82rpx; margin-top: 30rpx; border: 0; border-radius: 999rpx; color: #fff; background: #111318; font-size: 26rpx; line-height: 82rpx; font-weight: 800; }.primary-btn::after { border: 0; }
.back-link { display: block; margin-top: 28rpx; color: #52627a; font-size: 22rpx; text-align: center; }
</style>
