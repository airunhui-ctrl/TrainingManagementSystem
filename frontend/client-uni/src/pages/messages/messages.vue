<template>
  <view class="page">
    <view class="messages-topbar" :style="{ height: nav.totalHeight + 'px', paddingTop: nav.statusBarHeight + 'px', paddingRight: (nav.capsuleRight + nav.capsuleWidth + 8) + 'px' }"><text class="topbar-back" @tap="backToPrevious">‹</text><text class="topbar-title">我的消息</text><text class="topbar-side"></text></view>
    <view class="page-head">
      <view>
        <text class="title">我的消息</text>
        <text class="hint">课程提醒、报名进度和服务通知</text>
      </view>
      <text class="refresh" @tap="load">刷新</text>
    </view>

    <view v-if="loading && !messages.length" class="state-card">正在加载消息…</view>
    <view v-else-if="loadError && !messages.length" class="state-card error-state">
      <text class="state-title">消息加载失败</text>
      <text class="state-hint">{{ loadError }}</text>
      <button class="state-retry" @tap="load">重新加载</button>
    </view>
    <view v-if="loadError && messages.length" class="state-card error-state inline-error">
      <text class="state-hint">刷新失败：{{ loadError }}</text>
      <button class="state-retry" @tap="load">重新加载</button>
    </view>
    <view v-if="!loadError && !messages.length" class="state-card">
      <text class="empty-icon">✓</text>
      <text class="empty-title">暂时没有消息</text>
      <text class="empty-hint">新的课程和服务通知会显示在这里</text>
    </view>
    <view v-if="messages.length" class="message-list">
      <view v-for="item in messages" :key="item.id" class="message-card" :class="{ unread: !item.readAt }" @tap="openMessage(item)">
        <view class="message-head">
          <view class="message-title-wrap"><text v-if="!item.readAt" class="unread-dot"></text><text class="message-title">{{ item.title }}</text></view>
          <text class="message-date">{{ formatDate(item.createdAt) }}</text>
        </view>
        <text class="message-preview">{{ item.content }}</text>
        <view class="message-foot"><text>{{ item.channel || '站内消息' }}</text><text>{{ item.readAt ? '已读' : '未读' }} ›</text></view>
      </view>
    </view>

    <view v-if="detail" class="modal-mask" @tap.self="detail = null">
      <view class="modal-card" @tap.stop>
        <view class="modal-head"><view><text class="modal-title">{{ detail.title }}</text><text class="modal-subtitle">{{ formatDate(detail.createdAt) }}</text></view><text class="close" @tap="detail = null">×</text></view>
        <text class="detail-content">{{ detail.content }}</text>
        <button class="primary-btn" @tap="detail = null">知道了</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShareAppMessage, onShow } from '@dcloudio/uni-app'
import { api } from '../../common/api'
import { useNavLayout } from '../../common/nav-layout'

type Message = { id: string; title: string; content: string; channel: string; createdAt: string; readAt?: string | null }
const messages = ref<Message[]>([])
const nav = useNavLayout()
const loading = ref(false)
const loadError = ref('')
const detail = ref<Message | null>(null)
const backToPrevious = () => uni.navigateBack()

const load = async () => {
  loading.value = true
  loadError.value = ''
  try { messages.value = (await api.listMessages()).items || [] } catch (error: any) {
    loadError.value = error?.message || '网络异常，请检查网络后重试'
    uni.showToast({ title: '消息加载失败，请点击重试', icon: 'none' })
  } finally { loading.value = false }
}
const openMessage = async (item: Message) => {
  detail.value = item
  if (item.readAt) return
  try { const result = await api.markMessageRead(item.id); item.readAt = result.readAt } catch (error: any) {
    uni.showToast({ title: error?.message || '消息标记已读失败，请稍后重试', icon: 'none' })
  }
}
const formatDate = (value: string) => String(value || '').replace('T', ' ').slice(0, 16)
onShow(load)
onShareAppMessage(() => ({ title: '我的消息', path: '/pages/messages/messages' }))
</script>

<style scoped lang="scss">
.page { min-height: 100vh; padding: 40rpx 32rpx 56rpx; background: #f6f8fc; }
.messages-topbar { position: sticky; top: 0; z-index: 30; display: flex; align-items: center; justify-content: space-between; box-sizing: border-box; height: calc(92rpx + var(--status-bar-height)); margin: -40rpx -32rpx 24rpx; padding: var(--status-bar-height) 32rpx 0; color: #243956; background: rgba(255, 255, 255, .82); backdrop-filter: blur(18px); box-shadow: 0 4rpx 16rpx rgba(21, 70, 158, .08); }.messages-topbar .topbar-back { width: 100rpx; margin-top: -36rpx; color: #243956; font-size: 56rpx; line-height: 1; font-weight: 300; }.messages-topbar .topbar-title { position: absolute; left: 0; right: 0; top: calc(var(--status-bar-height) + 12rpx); bottom: -12rpx; display: flex; align-items: center; justify-content: center; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #243956; font-size: 30rpx; font-weight: 800; pointer-events: none; }.messages-topbar .topbar-side { width: 100rpx; }
.page-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24rpx; }.title, .hint { display: block; }.title { color: $navy; font-size: 38rpx; font-weight: 900; }.hint { margin-top: 8rpx; color: $muted; font-size: 21rpx; }.refresh { padding: 8rpx 0 8rpx 24rpx; color: $blue; font-size: 23rpx; font-weight: 800; }
.message-list { display: grid; gap: 18rpx; }.message-card, .state-card { border-radius: 22rpx; background: #fff; box-shadow: 0 12rpx 30rpx rgba(20,43,74,.06); }.message-card { padding: 26rpx 28rpx; border: 1rpx solid transparent; }.message-card.unread { border-color: #dbe8ff; }.message-head, .message-foot { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; }.message-title-wrap { display: flex; align-items: center; min-width: 0; }.unread-dot { width: 12rpx; height: 12rpx; margin-right: 12rpx; border-radius: 50%; background: #2f80ed; }.message-title { overflow: hidden; color: $navy; font-size: 27rpx; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }.message-date, .message-foot { color: $muted; font-size: 19rpx; }.message-preview { display: -webkit-box; margin-top: 16rpx; overflow: hidden; color: #53657e; font-size: 22rpx; line-height: 1.6; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }.message-foot { margin-top: 20rpx; }.message-foot text:last-child { color: $blue; font-weight: 700; }
.state-card { display: flex; flex-direction: column; align-items: center; padding: 90rpx 30rpx; text-align: center; }.state-title { color: $navy; font-size: 28rpx; font-weight: 900; }.state-hint { margin-top: 10rpx; color: $muted; line-height: 1.5; }.state-retry { width: 220rpx; height: 64rpx; margin-top: 22rpx; border: 0; border-radius: 999rpx; color: #17366d; background: $yellow; font-size: 22rpx; line-height: 64rpx; font-weight: 800; }.state-retry::after { border: 0; }.inline-error { margin-bottom: 18rpx; padding: 22rpx 28rpx; }.inline-error .state-retry { margin-top: 14rpx; }.empty-icon { display: grid; place-items: center; width: 80rpx; height: 80rpx; border-radius: 50%; color: #fff; background: #6bc49a; font-size: 42rpx; font-weight: 900; }.empty-title { margin-top: 24rpx; color: $navy; font-size: 28rpx; font-weight: 900; }.empty-hint { margin-top: 10rpx; color: $muted; font-size: 21rpx; }
.modal-mask { position: fixed; inset: 0; z-index: 1000; z-index: var(--client-business-modal-layer, 1000); display: flex; align-items: flex-end; justify-content: center; background: rgba(12,31,65,.48); }.modal-card { box-sizing: border-box; width: 100%; max-height: 88vh; overflow-y: auto; padding: 30rpx 28rpx calc(30rpx + env(safe-area-inset-bottom)); border-radius: 28rpx 28rpx 0 0; background: #fff; }.modal-head { display: flex; align-items: flex-start; justify-content: space-between; }.modal-title, .modal-subtitle { display: block; }.modal-title { max-width: 600rpx; color: $navy; font-size: 32rpx; font-weight: 900; }.modal-subtitle { margin-top: 8rpx; color: $muted; font-size: 20rpx; }.close { color: #8391a3; font-size: 44rpx; line-height: 1; }.detail-content { display: block; margin-top: 28rpx; color: #334a68; font-size: 25rpx; line-height: 1.8; white-space: pre-wrap; }.primary-btn { width: 100%; height: 82rpx; margin-top: 30rpx; border: 0; border-radius: 999rpx; color: #17366d; background: $yellow; font-size: 25rpx; line-height: 82rpx; font-weight: 900; }.primary-btn::after { border: 0; }
.modal-mask { z-index: var(--client-business-modal-layer, 1000) !important; }
@media (min-width: 700px) { .modal-mask { align-items: center; padding: 30rpx; }.modal-card { width: 680rpx; border-radius: 28rpx; } }
.modal-card { max-height: calc(100vh - 64rpx); padding-bottom: calc(36rpx + env(safe-area-inset-bottom)); }
</style>
