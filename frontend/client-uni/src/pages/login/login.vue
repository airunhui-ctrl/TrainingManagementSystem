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
        <input v-model="username" class="field-input" placeholder="请输入账号" />
      </view>
      <view class="field password-field">
        <input v-model="password" class="field-input" :password="!showPassword" placeholder="请输入密码" />
        <text class="password-toggle" @tap="showPassword = !showPassword">{{ showPassword ? '隐藏' : '显示' }}</text>
      </view>

      <button class="primary-btn" :loading="loading" @tap="login">登录</button>
      <view class="form-links"><text @tap="goRegister">立即注册</text><text @tap="goForgotPassword">忘记密码</text></view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../../common/api'
import { useAuthStore } from '../../stores/auth'

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)

const login = async () => {
  if (!username.value.trim() || !password.value) {
    uni.showToast({ title: '请输入账号和密码', icon: 'none' })
    return
  }
  loading.value = true
  try {
    const result = await api.login(username.value.trim(), password.value)
    useAuthStore().setTokens(result.accessToken, result.refreshToken, result.user.username)
    uni.switchTab({ url: '/pages/index/index' })
  } catch {
    uni.showToast({ title: '账号或密码错误', icon: 'none' })
  } finally {
    loading.value = false
  }
}
const goRegister = () => uni.navigateTo({ url: '/pages/register-account/register-account' })
const goForgotPassword = () => uni.navigateTo({ url: '/pages/forgot-password/forgot-password' })
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
.form-links { display: flex; justify-content: space-between; margin-top: 28rpx; padding: 0 8rpx; color: #52627a; font-size: 22rpx; }
.form-links text:last-child { color: #2c67c7; }
</style>
