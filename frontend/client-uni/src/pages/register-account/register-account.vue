<template>
  <view class="page">
    <view class="card form-card">
      <text class="title">注册账号</text>
      <text class="desc">使用手机号短信验证码注册，注册后可管理多个学员并追踪报名履历</text>
      <view class="field"><input v-model="form.phone" class="field-input" type="number" maxlength="11" placeholder="请输入手机号" /></view>
      <view class="code-row"><input v-model="form.code" class="field-input" type="number" maxlength="6" placeholder="请输入短信验证码" /><button class="code-btn" :disabled="countdown > 0 || sendingCode" @tap="requestCode">{{ countdown > 0 ? `${countdown}s 后重试` : sendingCode ? '发送中…' : '获取验证码' }}</button></view>
      <view class="field"><input v-model="form.password" class="field-input" password maxlength="64" placeholder="请输入密码（至少8位，含字母、数字、符号）" /></view>
      <view class="field"><input v-model="form.confirmPassword" class="field-input" password maxlength="64" placeholder="请再次输入密码" /></view>
            <view class="field"><input v-model="form.username" class="field-input" maxlength="64" placeholder="请输入用户名（必填）" /></view>
      <view class="agreement-row">
        <view :class="['agreement-check', { checked: agreementAccepted }]" @tap="agreementAccepted = !agreementAccepted">
          <text v-if="agreementAccepted">✓</text>
        </view>
        <view class="agreement-text">
          <text>我已认真阅读、理解并同意</text>
          <text class="agreement-link" @tap.stop="openAgreement">《用户协议》</text>
          <text class="agreement-link" @tap.stop="openAgreement">《隐私政策》</text>
        </view>
      </view>
      <button class="primary-btn" :loading="loading" @tap="submit">注册并登录</button>
      <text class="back-link" @tap="backToLogin">已有账号，返回登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onUnmounted, reactive, ref } from 'vue'
import { onShareAppMessage } from '@dcloudio/uni-app'
import { api } from '../../common/api'
import { AGREEMENT_VERSION } from '../../common/agreement'
import { redirectAfterLogin } from '../../common/invoice-notice'
import { bindWechatOpenIdSilently } from '../../common/wechat-bind'
import { useAuthStore } from '../../stores/auth'

const form = reactive({ phone: '', code: '', password: '', confirmPassword: '', username: '' })
const loading = ref(false)
const sendingCode = ref(false)
const countdown = ref(0)
const agreementAccepted = ref(false)
const challengeId = ref('')
let countdownTimer: ReturnType<typeof setInterval> | null = null
let redirectTimer: ReturnType<typeof setTimeout> | null = null
const onAgreementAccepted = () => { agreementAccepted.value = true }
uni.$on('agreement:accepted', onAgreementAccepted)

const requestCode = async () => {
  const phone = form.phone.trim()
  if (!/^1\d{10}$/.test(phone)) return uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
  if (sendingCode.value || countdown.value > 0) return
  sendingCode.value = true
  try {
    const result = await api.requestPhoneRegistrationCode(phone)
    if (result.phoneRegistered) return uni.showToast({ title: result.message || '该手机号已被注册，请直接登录', icon: 'none' })
    challengeId.value = result.challengeId
    countdown.value = 60
    if (countdownTimer) clearInterval(countdownTimer)
    countdownTimer = setInterval(() => { countdown.value -= 1; if (countdown.value <= 0 && countdownTimer) { clearInterval(countdownTimer); countdownTimer = null } }, 1000)
    uni.showToast({ title: result.devCode ? `开发验证码：${result.devCode}` : '验证码已发送', icon: 'none', duration: 3000 })
  } catch (error: any) { uni.showToast({ title: error?.message || '验证码发送失败', icon: 'none' }) } finally { sendingCode.value = false }
}

const submit = async () => {
  const phone = form.phone.trim()
    if (!/^1\d{10}$/.test(phone) || !form.code.trim() || !form.password || !form.confirmPassword || !form.username.trim()) return uni.showToast({ title: '请填写手机号、验证码、密码和用户名', icon: 'none' })
  if (!/^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,64}$/.test(form.password)) return uni.showToast({ title: '密码至少 8 位，且需包含字母、数字和符号', icon: 'none' })
  if (form.password !== form.confirmPassword) return uni.showToast({ title: '两次输入的密码不一致', icon: 'none' })
    if (!/^[A-Za-z0-9_.@+-]{3,64}$/.test(form.username.trim())) return uni.showToast({ title: '用户名需 3-64 位，可用字母、数字和 _ . @ + -', icon: 'none' })
  if (!agreementAccepted.value) return uni.showToast({ title: '请先阅读并勾选用户协议和隐私政策', icon: 'none' })
  loading.value = true
  try {
    if (!challengeId.value) return uni.showToast({ title: '请先获取短信验证码', icon: 'none' })
        const result = await api.registerByPhoneSms({ challengeId: challengeId.value, phone, code: form.code.trim(), password: form.password, confirmPassword: form.confirmPassword, username: form.username.trim(), agreementVersion: AGREEMENT_VERSION })
    useAuthStore().setTokens(result.accessToken, result.refreshToken, result.user.username)
    try { await bindWechatOpenIdSilently() } catch (error: any) { uni.showToast({ title: error?.message || '微信支付身份绑定失败', icon: 'none' }) }
    uni.showToast({ title: '注册成功', icon: 'none' })
    redirectTimer = setTimeout(() => void redirectAfterLogin(), 250)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '注册失败', icon: 'none' })
  } finally { loading.value = false }
}
const openAgreement = () => uni.navigateTo({ url: '/pages/agreement/agreement?source=register' })
const backToLogin = () => uni.navigateBack()
onUnmounted(() => {
  if (countdownTimer) clearInterval(countdownTimer)
  countdownTimer = null
  if (redirectTimer) clearTimeout(redirectTimer)
  redirectTimer = null
  uni.$off('agreement:accepted', onAgreementAccepted)
})
onShareAppMessage(() => ({ title: '注册账号', path: '/pages/register-account/register-account' }))
</script>

<style scoped lang="scss">
.page { box-sizing: border-box; min-height: 100vh; padding: 70rpx 40rpx; background: #f7f8fa; }
.form-card { box-sizing: border-box; width: 100%; max-width: 720rpx; margin: 0 auto; padding: 48rpx 42rpx; border-radius: 28rpx; background: #fff; box-shadow: 0 14rpx 48rpx rgba(27, 45, 75, .08); }
.title { display: block; color: #111827; font-size: 42rpx; font-weight: 900; text-align: center; }.desc { display: block; margin: 14rpx 0 34rpx; color: $muted; font-size: 21rpx; line-height: 1.6; text-align: center; }
.field { margin-top: 18rpx; }.field-input { box-sizing: border-box; width: 100%; height: 82rpx; padding: 0 26rpx; border: 1rpx solid #dfe3e8; border-radius: 999rpx; color: #1f2937; background: #fafbfc; font-size: 24rpx; }
.code-row { display: flex; align-items: center; gap: 14rpx; margin-top: 18rpx; }.code-row .field-input { flex: 1; min-width: 0; }.code-btn { flex: 0 0 210rpx; height: 82rpx; margin: 0; padding: 0 12rpx; border: 1rpx solid #dfe3e8; border-radius: 999rpx; color: #27354b; background: #fff; font-size: 21rpx; line-height: 80rpx; }.code-btn::after { border: 0; }.code-btn[disabled] { color: #9aa6b6; background: #f2f4f7; }
.primary-btn { width: 100%; height: 82rpx; margin-top: 30rpx; border: 0; border-radius: 999rpx; color: #fff; background: #111318; font-size: 26rpx; line-height: 82rpx; font-weight: 800; }.primary-btn::after { border: 0; }
.agreement-row { display: flex; align-items: flex-start; gap: 12rpx; margin-top: 28rpx; padding: 0 4rpx; text-align: left; }
.agreement-check { display: grid; place-items: center; flex: 0 0 34rpx; width: 34rpx; height: 34rpx; margin-top: 2rpx; border: 2rpx solid #c8d0da; border-radius: 50%; color: #fff; background: #fff; font-size: 20rpx; font-weight: 900; line-height: 1; }
.agreement-check.checked { border-color: #111318; background: #111318; }
.agreement-text { flex: 1; color: #52627a; font-size: 20rpx; line-height: 1.6; }
.agreement-link { color: #2c67c7; }
.back-link { display: block; margin-top: 28rpx; color: #52627a; font-size: 22rpx; text-align: center; }
</style>
