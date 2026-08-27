<template>
  <view class="page">
    <view class="head">
      <text class="title">用户协议与隐私政策</text>
      <text class="version">版本：{{ AGREEMENT_VERSION }}</text>
    </view>
    <scroll-view scroll-y class="content">
      <view class="section">
        <text class="section-title">一、服务说明</text>
        <text class="section-text">本平台提供课程报名、订单支付、开票申请和学习记录等服务。使用前请确认您已阅读并理解本协议。</text>
      </view>
      <view class="section">
        <text class="section-title">二、账号与安全</text>
        <text class="section-text">您应妥善保管账号和密码，并对账号下的报名、支付和资料维护行为负责。发现异常登录时应及时修改密码并联系管理员。</text>
      </view>
      <view class="section">
        <text class="section-title">三、个人信息</text>
        <text class="section-text">我们仅在报名、开票、通知和运营统计所必需的范围内收集姓名、手机号、企业信息等资料，并通过受控接口保护敏感字段。</text>
      </view>
      <view class="section">
        <text class="section-title">四、支付与退款</text>
        <text class="section-text">当前版本支持线下转账凭证审核；在线支付、短信通知等功能接入后会通过站内通知和页面提示同步说明。</text>
      </view>
    </scroll-view>
    <view class="actions">
      <button class="cancel" @tap="decline">不同意并退出</button>
      <button class="confirm" :disabled="submitting" @tap="accept">{{ submitting ? '处理中...' : '同意并继续' }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '../../common/api'
import { AGREEMENT_VERSION } from '../../common/agreement'
import { tokenStorage } from '../../common/auth'
import { navigateAfterLogin } from '../../common/login-redirect'
import { redirectAfterLogin } from '../../common/invoice-notice'

const submitting = ref(false)
const redirect = ref('')
const source = ref('')

onLoad((query) => {
  redirect.value = String(query?.redirect || '')
  source.value = String(query?.source || '')
})

const accept = async () => {
  if (submitting.value) return
  if (source.value === 'register') {
    uni.$emit('agreement:accepted')
    uni.switchTab({ url: '/pages/index/index' })
    return
  }
  submitting.value = true
  try {
    await api.acceptAgreement()
    if (redirect.value) uni.redirectTo({ url: redirect.value })
    else navigateAfterLogin(() => void redirectAfterLogin())
  } catch (error: any) {
    uni.showToast({ title: error?.message || '协议确认失败，请重试', icon: 'none' })
  } finally {
    submitting.value = false
  }
}
const decline = () => {
  tokenStorage.clear()
  uni.switchTab({ url: '/pages/index/index' })
}
</script>

<style scoped lang="scss">
.page { display: flex; flex-direction: column; min-height: 100vh; padding: 40rpx 32rpx calc(40rpx + env(safe-area-inset-bottom)); background: #f6f8fb; }
.head { margin-bottom: 24rpx; }.title, .version { display: block; }.title { color: #142b4a; font-size: 38rpx; font-weight: 900; }.version { margin-top: 8rpx; color: #8492a7; font-size: 21rpx; }
.content { flex: 1; min-height: 0; padding: 4rpx; }
.section { margin-bottom: 20rpx; padding: 24rpx; border-radius: 16rpx; background: #fff; }.section-title, .section-text { display: block; }.section-title { color: #142b4a; font-size: 26rpx; font-weight: 800; }.section-text { margin-top: 12rpx; color: #52627a; font-size: 23rpx; line-height: 1.6; }
.actions { display: flex; gap: 20rpx; margin-top: 24rpx; }.actions button { flex: 1; height: 84rpx; border: 0; border-radius: 999rpx; font-size: 26rpx; font-weight: 800; line-height: 84rpx; }.cancel { color: #52627a; background: #eef3f8; }.confirm { color: #17366d; background: #ffd21f; }.confirm::after, .cancel::after { border: 0; }
</style>
