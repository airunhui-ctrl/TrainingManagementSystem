<template>
  <view class="page">
    <view class="logo">六</view>
    <text class="title">欢迎来到六边形培训</text>
    <text class="desc">登录后即可报名、支付、开票和管理个人学习记录</text>
    <view class="card form">
      <text class="field-label">演示账号</text>
      <input v-model="username" placeholder="demo / admin / operator" />
      <text class="field-label">密码</text>
      <input v-model="password" password placeholder="请输入密码" />
      <button class="primary-btn" :loading="loading" @tap="login">登录</button>
      <button class="wechat-btn" :loading="wechatLoading" @tap="wechatLogin">微信一键登录 / 注册</button>
      <view class="quick"><text @tap="fill('demo')">C端用户</text><text @tap="fill('operator')">运营人员</text><text @tap="fill('admin')">管理员</text></view>
    </view>
    <text class="hint">MVP 演示密码统一为 123456</text>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { api } from '../../common/api'
import { useAuthStore } from '../../stores/auth'

const username = ref('demo')
const password = ref('123456')
const loading = ref(false)
const wechatLoading = ref(false)
const fill = (value: string) => { username.value = value; password.value = '123456' }
const login = async () => {
  if (!username.value || !password.value) return uni.showToast({ title: '请输入账号和密码', icon: 'none' })
  loading.value = true
  try {
    const result = await api.login(username.value, password.value)
    useAuthStore().setTokens(result.accessToken, result.refreshToken, result.user.username)
    uni.switchTab({ url: '/pages/index/index' })
  } catch { uni.showToast({ title: '账号或密码错误', icon: 'none' }) } finally { loading.value = false }
}
const getDeviceId = () => {
  const key = 'wechat-device-id'
  let value = String(uni.getStorageSync(key) || '')
  if (!value) { value = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; uni.setStorageSync(key, value) }
  return value
}
const finishWechatLogin = async (code: string) => {
  const profile: Record<string, any> = { deviceId: getDeviceId() }
  const userProfile = (uni as any).getUserProfile
  if (typeof userProfile === 'function') await new Promise<void>(resolve => userProfile({ desc: '用于完善培训报名资料', success: (response: any) => { Object.assign(profile, response?.userInfo || {}); resolve() }, fail: () => resolve() }))
  const tokens = await api.wechatLogin(code, profile)
  useAuthStore().setTokens(tokens.accessToken, tokens.refreshToken, tokens.user.username)
  uni.showToast({ title: '微信登录成功', icon: 'none' })
  setTimeout(() => uni.switchTab({ url: '/pages/index/index' }), 350)
}
const wechatLogin = () => {
  if (wechatLoading.value) return
  wechatLoading.value = true
  uni.login({ provider: 'weixin', success: async result => {
    try { await finishWechatLogin(String(result.code || '')) } catch (error: any) { uni.showToast({ title: error?.message || '微信登录失败，请稍后重试', icon: 'none' }) } finally { wechatLoading.value = false }
  }, fail: async () => {
    // H5 本地开发没有微信容器时，使用稳定设备标识联调后端 mock 适配接口；生产构建不走此分支。
    if (!import.meta.env.DEV) { wechatLoading.value = false; uni.showToast({ title: '当前环境暂不支持微信登录，请使用微信客户端', icon: 'none' }); return }
    try { await finishWechatLogin('') } catch (error: any) { uni.showToast({ title: error?.message || '微信登录失败，请稍后重试', icon: 'none' }) } finally { wechatLoading.value = false }
  }})
}
</script>

<style scoped lang="scss">
.page{min-height:100vh;padding:150rpx 50rpx 0;text-align:center}.logo{display:grid;place-items:center;width:128rpx;height:128rpx;margin:0 auto 28rpx;border-radius:40rpx;color:$navy;background:$yellow;font-size:52rpx;font-weight:900}.title{display:block;font-size:42rpx;font-weight:900}.desc{display:block;margin:12rpx 20rpx;color:$muted;font-size:23rpx;line-height:1.6}.form{padding:34rpx;margin-top:50rpx;text-align:left}.field-label{display:block;margin:12rpx 0;color:$muted;font-size:22rpx}.form input{height:82rpx;padding:0 24rpx;margin-bottom:12rpx;border:1rpx solid #DCE4EE;border-radius:14rpx;text-align:left}.primary-btn{width:100%;height:84rpx;line-height:84rpx;margin-top:20rpx}.wechat-btn{width:100%;height:78rpx;line-height:78rpx;margin-top:16rpx;border:1rpx solid #b7dfc8;border-radius:999rpx;color:#178a4f;background:#f1fff6;font-size:24rpx;font-weight:800}.wechat-btn::after{border:0}.quick{display:flex;justify-content:space-between;margin-top:26rpx;color:$blue;font-size:22rpx}.hint{display:block;margin-top:24rpx;color:$muted;font-size:20rpx}
</style>
