<template>
  <view class="page">
    <view class="profile">
      <view class="avatar">{{ profile.avatarText || profile.name?.slice(0, 1) || '六' }}</view>
      <view class="profile-copy">
        <text class="name">{{ profile.name || '微信用户' }}</text>
        <text class="account">账号：{{ profile.username }}</text>
        <text class="company">{{ profile.company || '完善企业资料，获得更精准服务' }}</text>
      </view>
      <view class="stats">
        <view><text>{{ profile.points }}</text><small>我的积分</small></view>
        <view><text>{{ invoiceCount }}</text><small>开票申请</small></view>
      </view>
    </view>

    <view v-if="loadError" class="load-error">
      <text class="error-title">个人信息加载失败</text>
      <text class="error-hint">{{ loadError }}</text>
      <button class="retry-button" @tap="load">重新加载</button>
    </view>

    <view class="card menu">
      <view class="menu-row" @tap="openProfile"><view><text class="menu-title">个人资料</text><text class="menu-hint">姓名、联系方式、性别、企业信息</text></view><text class="arrow">›</text></view>
      <view class="menu-row" @tap="openSecurity"><view><text class="menu-title">账号与安全</text><text class="menu-hint">登录账号和密码</text></view><text class="arrow">›</text></view>
      <view class="menu-row" @tap="openMessages"><view><text class="menu-title">我的消息<text v-if="messageUnreadCount" class="unread-badge">{{ messageUnreadCount }}</text></text><text class="menu-hint">查看课程提醒和服务通知</text></view><text class="arrow">›</text></view>
      <view class="menu-row" @tap="openStudents"><view><text class="menu-title">我的学员</text><text class="menu-hint">维护本人或代报名学员档案</text></view><text class="arrow">›</text></view>
      <view class="menu-row" @tap="showPoints"><view><text class="menu-title">我的积分</text><text class="menu-hint">查看当前积分和运营奖励说明</text></view><text class="arrow">›</text></view>
      <view class="menu-row" @tap="showFeedback"><view><text class="menu-title">问题反馈</text><text class="menu-hint">告诉我们你的使用建议</text></view><text class="arrow">›</text></view>
    </view>

    <view class="logout-section"><button class="logout-btn" type="button" @tap="logout">退出登录</button></view>

    <view v-if="profileModalOpen" class="modal-mask" @tap.self="closeProfile">
      <view class="modal-card">
        <view class="modal-head"><view><text class="modal-title">个人资料</text><text class="modal-subtitle">完善资料后便于报名、通知和企业服务</text></view><text class="close" :class="{ 'action-disabled': Boolean(mineOperationKey) }" @tap="closeProfile">×</text></view>
        <view class="form-row"><text>姓名</text><input v-model="profileForm.name" placeholder="请输入姓名" /></view>
        <view class="form-row"><text>联系方式</text><input v-model="profileForm.phone" type="number" maxlength="11" placeholder="请输入手机号" /></view>
        <view class="form-row"><text>性别</text><picker mode="selector" :range="genderOptions" :value="genderOptions.indexOf(profileForm.gender) < 0 ? 0 : genderOptions.indexOf(profileForm.gender)" @change="profileForm.gender = genderOptions[Number($event.detail.value)]"><view class="picker-value">{{ profileForm.gender || '请选择' }}<text>⌄</text></view></picker></view>
        <view class="form-row"><text>企业</text><input v-model="profileForm.company" placeholder="请输入企业名称" /></view>
        <view class="form-row"><text>邮箱</text><input v-model="profileForm.email" type="text" placeholder="请输入邮箱（可选）" /></view>
        <button class="primary-btn" :loading="savingProfile || mineOperationKey === 'profile-save'" :disabled="Boolean(mineOperationKey)" @tap="saveProfile">保存资料</button>
      </view>
    </view>

    <view v-if="securityModalOpen" class="modal-mask" @tap.self="closeSecurity">
      <view class="modal-card">
        <view class="modal-head"><view><text class="modal-title">账号与安全</text><text class="modal-subtitle">账号：{{ profile.username }}</text></view><text class="close" :class="{ 'action-disabled': Boolean(mineOperationKey) }" @tap="closeSecurity">×</text></view>
        <view class="security-tip"><text>登录方式</text><text class="bound">账号密码登录</text></view>
        <view class="security-tip"><text>最近登录</text><text>{{ profile.lastLoginAt ? formatDate(profile.lastLoginAt) : '暂无记录' }}</text></view>
        <view class="form-row"><text>新密码</text><input v-model="passwordForm.password" password maxlength="32" placeholder="至少 6 位" /></view>
        <view class="form-row"><text>确认密码</text><input v-model="passwordForm.confirm" password maxlength="32" placeholder="再次输入新密码" /></view>
        <button class="primary-btn" :loading="savingPassword || mineOperationKey === 'password-save'" :disabled="Boolean(mineOperationKey)" @tap="savePassword">保存新密码</button>
      </view>
    </view>

  </view>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../common/api'
import { showClientConfirm } from '../../common/confirm'
import { useAuthStore } from '../../stores/auth'

type Profile = { name: string; username: string; company: string; phone: string; gender: string; email: string; avatarText: string; points: number; registeredAt: string; lastLoginAt?: string | null }
const profile = reactive<Profile>({ name: '培训用户', username: 'demo', company: '', phone: '', gender: '', email: '', avatarText: '六', points: 0, registeredAt: '', lastLoginAt: null })
const invoiceCount = ref(0)
const messageUnreadCount = ref(0)
const loadError = ref('')
const profileModalOpen = ref(false)
const securityModalOpen = ref(false)
const savingProfile = ref(false)
const savingPassword = ref(false)
const mineOperationKey = ref('')
const feedbackSubmitting = ref(false)
const genderOptions = ['未设置', '男', '女', '其他']
const profileForm = reactive({ name: '', phone: '', gender: '', company: '', email: '' })
const passwordForm = reactive({ password: '', confirm: '' })

const load = async () => {
  loadError.value = ''
  try {
    Object.assign(profile, await api.profile())
    const [invoices, messages] = await Promise.all([api.listInvoices(), api.listMessages()])
    invoiceCount.value = invoices.items.length
    messageUnreadCount.value = messages.unreadCount || 0
  } catch (error: any) {
    loadError.value = error?.message || '网络异常，请检查网络后重试'
    uni.showToast({ title: '个人信息加载失败，请点击重试', icon: 'none' })
  }
}
const beginMineOperation = (key: string) => {
  if (mineOperationKey.value) {
    uni.showToast({ title: '另一个账号操作正在处理中，请稍候', icon: 'none' })
    return false
  }
  mineOperationKey.value = key
  return true
}
const endMineOperation = (key: string) => {
  if (mineOperationKey.value === key) mineOperationKey.value = ''
}
const openProfile = () => { if (mineOperationKey.value) return; Object.assign(profileForm, { name: profile.name || '', phone: profile.phone || '', gender: profile.gender || '未设置', company: profile.company || '', email: profile.email || '' }); profileModalOpen.value = true }
const closeProfile = () => { if (!mineOperationKey.value) profileModalOpen.value = false }
const openSecurity = () => { if (mineOperationKey.value) return; passwordForm.password = ''; passwordForm.confirm = ''; securityModalOpen.value = true }
const openStudents = () => uni.navigateTo({ url: '/pages/students/students' })
const openMessages = () => uni.navigateTo({ url: '/pages/messages/messages' })
const closeSecurity = () => { if (!mineOperationKey.value) securityModalOpen.value = false }
const confirmAction = (title: string, content: string) => showClientConfirm({ title, content })
const saveProfile = async () => {
  if (!profileForm.name.trim()) return uni.showToast({ title: '请输入姓名', icon: 'none' })
  if (profileForm.phone && !/^1\d{10}$/.test(profileForm.phone.trim())) return uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
  const operationKey = 'profile-save'
  if (!beginMineOperation(operationKey)) return
  try {
    if (!await confirmAction('确认保存资料', '保存后将更新个人资料，确定继续吗？')) return
    savingProfile.value = true
    await api.updateProfile({ ...profileForm, gender: profileForm.gender === '未设置' ? '' : profileForm.gender, avatarText: profileForm.name.slice(0, 2) }); await load(); profileModalOpen.value = false; uni.showToast({ title: '资料已保存', icon: 'none' })
  } catch (error: any) { uni.showToast({ title: error?.message || '资料保存失败', icon: 'none' }) } finally { savingProfile.value = false; endMineOperation(operationKey) }
}
const savePassword = async () => {
  if (passwordForm.password.length < 6) return uni.showToast({ title: '密码至少 6 位', icon: 'none' })
  if (passwordForm.password !== passwordForm.confirm) return uni.showToast({ title: '两次输入的密码不一致', icon: 'none' })
  const operationKey = 'password-save'
  if (!beginMineOperation(operationKey)) return
  try {
    if (!await confirmAction('确认修改密码', '修改后当前登录状态会失效，需要重新登录，确定继续吗？')) return
    savingPassword.value = true
    await api.changePassword(passwordForm.password); passwordForm.password = ''; passwordForm.confirm = ''; securityModalOpen.value = false; uni.showToast({ title: '密码已更新，请重新登录', icon: 'none' })
  } catch (error: any) { uni.showToast({ title: error?.message || '密码更新失败', icon: 'none' }) } finally { savingPassword.value = false; endMineOperation(operationKey) }
}
const formatDate = (value: string) => String(value || '').replace('T', ' ').slice(0, 16)
const showPoints = () => uni.showModal({ title: '我的积分', content: `当前积分：${profile.points}\n积分由课程参与、反馈和运营活动产生。`, showCancel: false })
const showFeedback = async () => {
  const operationKey = 'feedback'
  if (!beginMineOperation(operationKey)) return
  try {
    const result = await new Promise<UniApp.ShowModalRes>((resolve) => uni.showModal({ title: '问题反馈', editable: true, placeholderText: '请输入您的建议', success: resolve, fail: () => resolve({ confirm: false, cancel: true, content: '' }) }))
    const content = String(result.content || '').trim()
    if (!result.confirm || !content) return
    if (content.length > 5000) return uni.showToast({ title: '反馈内容不能超过 5000 字', icon: 'none' })
    if (!await confirmAction('确认提交反馈', '提交后将进入管理端处理，确定继续吗？')) return
    feedbackSubmitting.value = true
    try {
      await api.submitFeedback(content)
      uni.showToast({ title: '反馈已提交', icon: 'none' })
    } catch (error: any) {
      uni.showToast({ title: error?.message || '反馈提交失败，请稍后重试', icon: 'none' })
    } finally {
      feedbackSubmitting.value = false
    }
  } finally {
    endMineOperation(operationKey)
  }
}
const logout = async () => {
  if (await showClientConfirm({
    title: '确定要退出吗？',
    content: '退出后需要重新登录才能继续使用当前账号。',
    confirmText: '退出登录',
    cancelText: '继续使用',
    variant: 'danger',
  })) useAuthStore().logout()
}
onShow(load)
</script>

<style scoped lang="scss">
.page { padding: 40rpx 32rpx calc(140rpx + env(safe-area-inset-bottom)); }
.load-error { display: flex; flex-direction: column; align-items: center; margin-top: 18rpx; padding: 24rpx; border-radius: 18rpx; color: $muted; background: #fff7ed; text-align: center; }.error-title { color: #9a5a16; font-size: 24rpx; font-weight: 800; }.error-hint { margin-top: 8rpx; line-height: 1.5; }.retry-button { width: 210rpx; height: 60rpx; margin-top: 14rpx; border: 0; border-radius: 999rpx; color: #17366d; background: $yellow; font-size: 21rpx; line-height: 60rpx; font-weight: 800; }.retry-button::after { border: 0; }
.profile { position: relative; padding: 34rpx; color: #fff; border-radius: 28rpx; background: linear-gradient(130deg, #234DBB, #2F80ED); box-shadow: 0 18rpx 50rpx rgba(20,43,74,.18); }
.avatar { display: inline-grid; place-items: center; width: 108rpx; height: 108rpx; border-radius: 50%; color: $navy; background: $yellow; font-size: 38rpx; font-weight: 900; }
.profile-copy { display: inline-flex; flex-direction: column; vertical-align: top; margin: 8rpx 0 0 24rpx; max-width: calc(100% - 160rpx); }.name { font-size: 32rpx; font-weight: 900; }.account, .company { margin-top: 8rpx; color: rgba(255,255,255,.78); font-size: 20rpx; }.company { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.stats { display: grid; grid-template-columns: 1fr 1fr; margin-top: 30rpx; padding-top: 22rpx; border-top: 1rpx solid rgba(255,255,255,.24); }.stats view+view { padding-left: 28rpx; border-left: 1rpx solid rgba(255,255,255,.24); }.stats text, .stats small { display: block; }.stats text { font-size: 40rpx; font-weight: 900; }.stats small { font-size: 20rpx; opacity: .78; }
.menu { overflow: hidden; margin-top: 24rpx; }.menu-row { display: flex; align-items: center; justify-content: space-between; padding: 28rpx 30rpx; border-bottom: 1rpx solid #E8EDF4; }.menu-row:last-child { border-bottom: 0; }.menu-title, .menu-hint { display: block; }.menu-title { color: $navy; font-size: 27rpx; font-weight: 800; }.menu-hint { margin-top: 8rpx; color: $muted; font-size: 20rpx; }.arrow { color: #ACB7C5; font-size: 36rpx; line-height: 1; }
.unread-badge { display: inline-block; min-width: 30rpx; margin-left: 10rpx; padding: 2rpx 8rpx; border-radius: 999rpx; color: #fff; background: #2f80ed; font-size: 17rpx; line-height: 26rpx; text-align: center; vertical-align: 3rpx; }
.students-card { margin-top: 24rpx; padding: 28rpx 30rpx; }.section-head { display: flex; align-items: center; justify-content: space-between; }.section-title, .section-hint { display: block; }.section-title { color: $navy; font-size: 27rpx; font-weight: 800; }.section-hint { margin-top: 8rpx; color: $muted; font-size: 20rpx; }.add-student { color: $blue; font-size: 22rpx; font-weight: 800; }.student-list { margin-top: 16rpx; }.student-row { display: flex; align-items: center; justify-content: space-between; gap: 12rpx; padding: 20rpx 0; border-top: 1rpx solid #edf1f5; }.student-main { display: flex; align-items: center; min-width: 0; }.student-avatar { display: grid; place-items: center; flex: 0 0 auto; width: 64rpx; height: 64rpx; margin-right: 14rpx; border-radius: 50%; color: $navy; background: #e8f1ff; font-size: 24rpx; font-weight: 900; }.student-name { display: block; color: $navy; font-size: 24rpx; font-weight: 800; }.student-meta { display: block; max-width: 330rpx; margin-top: 6rpx; overflow: hidden; color: $muted; font-size: 19rpx; text-overflow: ellipsis; white-space: nowrap; }.default-tag { display: inline-block; margin-left: 8rpx; padding: 2rpx 8rpx; border-radius: 999rpx; color: #2a6fce; background: #eaf3ff; font-size: 17rpx; font-weight: 700; }.student-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 10rpx; color: $blue; font-size: 19rpx; }.student-actions .danger { color: #d95757; }.students-empty { margin-top: 18rpx; padding: 22rpx; border-radius: 12rpx; color: $muted; background: #f8fafc; text-align: center; font-size: 20rpx; }.student-check { display: flex; align-items: center; gap: 8rpx; margin-top: 20rpx; color: $muted; font-size: 21rpx; }
.logout-section { display: flex; justify-content: center; margin-top: 28rpx; }.logout-btn { box-sizing: border-box; width: 320rpx; height: 76rpx; line-height: 76rpx; margin: 0; padding: 0 28rpx; border: 1rpx solid #F4C7C7; border-radius: 999rpx; color: #D95757; background: #FFF8F8; font-size: 26rpx; font-weight: 700; }.logout-btn::after { border: 0; }
.modal-mask { position: fixed; inset: 0; z-index: 1000; z-index: var(--client-business-modal-layer, 1000); display: flex; align-items: flex-end; justify-content: center; background: rgba(12,31,65,.48); }.modal-card { box-sizing: border-box; width: 100%; max-height: calc(100vh - 64rpx); overflow-y: auto; padding: 30rpx 28rpx calc(36rpx + env(safe-area-inset-bottom)); border-radius: 28rpx 28rpx 0 0; background: #fff; }.modal-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18rpx; }.modal-title { display: block; color: $navy; font-size: 34rpx; font-weight: 900; }.modal-subtitle { display: block; margin-top: 8rpx; color: $muted; font-size: 20rpx; }.close { color: #8391a3; font-size: 44rpx; line-height: 1; }.form-row { margin-top: 18rpx; }.form-row > text { display: block; margin-bottom: 10rpx; color: $muted; font-size: 22rpx; }.form-row input, .picker-value { box-sizing: border-box; width: 100%; height: 78rpx; padding: 0 22rpx; border: 1rpx solid #dce4ee; border-radius: 14rpx; color: $navy; background: #fbfcfe; font-size: 24rpx; line-height: 78rpx; }.picker-value { display: flex; justify-content: space-between; }.primary-btn { width: 100%; height: 82rpx; margin-top: 26rpx; border: 0; border-radius: 999rpx; color: #17366d; background: $yellow; font-size: 25rpx; line-height: 82rpx; font-weight: 900; }.primary-btn::after { border: 0; }.security-tip { display: flex; justify-content: space-between; padding: 20rpx 0; border-bottom: 1rpx solid #edf1f5; color: $muted; font-size: 21rpx; }.security-tip .bound { color: #2aa66f; font-weight: 800; }
.modal-mask { z-index: var(--client-business-modal-layer, 1000) !important; }
.action-disabled { opacity: .45; pointer-events: none; }
@media (min-width: 700px) { .modal-mask { align-items: center; padding: 30rpx; }.modal-card { width: 680rpx; border-radius: 28rpx; } }
</style>
