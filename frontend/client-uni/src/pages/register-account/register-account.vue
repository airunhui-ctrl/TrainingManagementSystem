<template>
  <view class="page">
    <view class="card form-card">
      <text class="title">注册账号</text>
      <text class="desc">注册后可管理多个学员并追踪报名履历</text>
      <view class="field"><input v-model="form.username" class="field-input" maxlength="64" placeholder="请输入账号（3-64位）" /></view>
      <view class="field"><input v-model="form.password" class="field-input" password maxlength="64" placeholder="请输入密码（至少8位）" /></view>
      <view class="field"><input v-model="form.confirmPassword" class="field-input" password maxlength="64" placeholder="请再次输入密码" /></view>
      <view class="field"><input v-model="form.name" class="field-input" maxlength="80" placeholder="姓名（可选）" /></view>
      <view class="field"><input v-model="form.phone" class="field-input" type="number" maxlength="11" placeholder="手机号（可选）" /></view>
      <view class="field"><input v-model="form.email" class="field-input" maxlength="120" placeholder="邮箱（可选）" /></view>
      <button class="primary-btn" :loading="loading" @tap="submit">注册并登录</button>
      <text class="back-link" @tap="backToLogin">已有账号，返回登录</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { api } from '../../common/api'
import { useAuthStore } from '../../stores/auth'

const form = reactive({ username: '', password: '', confirmPassword: '', name: '', phone: '', email: '' })
const loading = ref(false)

const submit = async () => {
  const username = form.username.trim()
  if (!username || !form.password || !form.confirmPassword) return uni.showToast({ title: '请填写账号和密码', icon: 'none' })
  if (form.password.length < 8) return uni.showToast({ title: '密码至少 8 位', icon: 'none' })
  if (form.password !== form.confirmPassword) return uni.showToast({ title: '两次输入的密码不一致', icon: 'none' })
  if (form.phone && !/^1\d{10}$/.test(form.phone.trim())) return uni.showToast({ title: '手机号格式不正确', icon: 'none' })
  loading.value = true
  try {
    const result = await api.register({ username, password: form.password, confirmPassword: form.confirmPassword, ...(form.name.trim() ? { name: form.name.trim() } : {}), ...(form.phone.trim() ? { phone: form.phone.trim() } : {}), ...(form.email.trim() ? { email: form.email.trim() } : {}) })
    useAuthStore().setTokens(result.accessToken, result.refreshToken, result.user.username)
    uni.showToast({ title: '注册成功', icon: 'none' })
    setTimeout(() => uni.switchTab({ url: '/pages/index/index' }), 250)
  } catch (error: any) {
    uni.showToast({ title: error?.message || '注册失败', icon: 'none' })
  } finally { loading.value = false }
}
const backToLogin = () => uni.navigateBack()
</script>

<style scoped lang="scss">
.page { box-sizing: border-box; min-height: 100vh; padding: 70rpx 40rpx; background: #f7f8fa; }
.form-card { box-sizing: border-box; width: 100%; max-width: 720rpx; margin: 0 auto; padding: 48rpx 42rpx; border-radius: 28rpx; background: #fff; box-shadow: 0 14rpx 48rpx rgba(27, 45, 75, .08); }
.title { display: block; color: #111827; font-size: 42rpx; font-weight: 900; text-align: center; }.desc { display: block; margin: 14rpx 0 34rpx; color: $muted; font-size: 21rpx; line-height: 1.6; text-align: center; }
.field { margin-top: 18rpx; }.field-input { box-sizing: border-box; width: 100%; height: 82rpx; padding: 0 26rpx; border: 1rpx solid #dfe3e8; border-radius: 999rpx; color: #1f2937; background: #fafbfc; font-size: 24rpx; }
.primary-btn { width: 100%; height: 82rpx; margin-top: 30rpx; border: 0; border-radius: 999rpx; color: #fff; background: #111318; font-size: 26rpx; line-height: 82rpx; font-weight: 800; }.primary-btn::after { border: 0; }
.back-link { display: block; margin-top: 28rpx; color: #52627a; font-size: 22rpx; text-align: center; }
</style>
