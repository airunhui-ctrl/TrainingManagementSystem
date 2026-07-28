<template>
  <view class="page">
    <view class="profile">
      <view class="avatar">{{ profile.avatarText || '六' }}</view>
      <view>
        <text class="name">{{ profile.name }}</text>
      </view>
      <view class="stats">
        <view><text>{{ profile.points }}</text><small>我的积分</small></view>
        <view><text>{{ invoiceCount }}</text><small>开票申请</small></view>
      </view>
    </view>

    <view class="card menu">
      <view v-for="item in items" :key="item" class="menu-row" @tap="action(item)">
        <text>{{ item }}</text>
        <text>›</text>
      </view>
    </view>

    <view class="logout-section">
      <button class="logout-btn" type="button" @tap="logout">退出登录</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../common/api'
import { useAuthStore } from '../../stores/auth'

const profile = reactive({ name: '培训用户', username: 'demo', company: '', avatarText: '六', points: 0, registeredAt: '' })
const invoiceCount = ref(0)
const items = ['个人资料', '账号与安全', '我的积分', '问题反馈']

const load = async () => {
  try {
    Object.assign(profile, await api.profile())
    invoiceCount.value = (await api.listInvoices()).items.length
  } catch {
    // 未登录时由请求层负责跳转登录页
  }
}

const logout = () => useAuthStore().logout()
const action = (item: string) => {
  if (item === '账号与安全') return api.changePassword().then(() => uni.showToast({ title: '密码已重置为演示密码 123456', icon: 'none' }))
  if (item === '问题反馈') return uni.showModal({ title: '问题反馈', editable: true, placeholderText: '请输入您的建议', success: async result => { if (result.confirm && result.content) { await api.submitFeedback(result.content); uni.showToast({ title: '反馈已提交', icon: 'none' }) } } })
  if (item === '个人资料') return uni.showModal({ title: '修改姓名', editable: true, placeholderText: profile.name, success: async result => { if (result.confirm && result.content) { await api.updateProfile({ name: result.content }); load() } } })
  uni.showModal({ title: '我的积分', content: `当前积分：${profile.points}\nMock 规则：完成支付后由运营人员调整积分。`, showCancel: false })
}

onShow(load)
</script>

<style scoped lang="scss">
.page { padding: 40rpx 32rpx 56rpx; }
.profile { padding: 34rpx; color: #fff; border-radius: 28rpx; background: linear-gradient(130deg, #234DBB, #2F80ED); box-shadow: 0 18rpx 50rpx rgba(20,43,74,.18); }
.avatar { display: inline-grid; place-items: center; width: 108rpx; height: 108rpx; border-radius: 50%; color: $navy; background: $yellow; font-size: 38rpx; font-weight: 900; }
.name { display: block; margin-top: -90rpx; margin-left: 132rpx; font-size: 32rpx; font-weight: 900; }
.stats { display: grid; grid-template-columns: 1fr 1fr; margin-top: 58rpx; padding-top: 22rpx; border-top: 1rpx solid rgba(255,255,255,.24); }.stats view+view { padding-left: 28rpx; border-left: 1rpx solid rgba(255,255,255,.24); }.stats text, .stats small { display: block; }.stats text { font-size: 40rpx; font-weight: 900; }.stats small { font-size: 20rpx; opacity: .78; }
.menu { overflow: hidden; margin-top: 24rpx; }.menu-row { display: flex; justify-content: space-between; padding: 30rpx; border-bottom: 1rpx solid #E8EDF4; font-size: 26rpx; }.menu-row:last-child { border-bottom: 0; }.menu-row text:last-child { color: #ACB7C5; font-size: 36rpx; line-height: 1; }
.logout-section { display: flex; justify-content: center; margin-top: 28rpx; }.logout-btn { box-sizing: border-box; width: 320rpx; height: 76rpx; line-height: 76rpx; margin: 0; padding: 0 28rpx; border: 1rpx solid #F4C7C7; border-radius: 999rpx; color: #D95757; background: #FFF8F8; font-size: 26rpx; font-weight: 700; box-shadow: 0 6rpx 16rpx rgba(217,87,87,.05); }.logout-btn::after { border: 0; }
</style>
