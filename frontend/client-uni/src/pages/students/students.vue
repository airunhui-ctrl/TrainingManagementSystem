<template>
  <view class="students-page">
    <view class="students-topbar">
      <text class="back" @tap="goBack">‹</text>
      <text class="topbar-title">我的学员</text>
      <text class="topbar-add" @tap="openCreate">＋</text>
    </view>

    <view class="page-intro">
      <text class="intro-title">学员档案</text>
      <text class="intro-hint">可维护本人或代报名学员，报名时可直接选择并回填资料</text>
    </view>

    <view class="section-heading"><text>当前学员</text></view>
    <view v-if="currentStudent" class="current-card card">
      <view class="student-row-main">
        <view class="student-avatar current-avatar">{{ initialOf(currentStudent.name) }}</view>
        <view class="student-copy">
          <text class="student-name">{{ currentStudent.name }}<text class="current-tag">当前</text></text>
          <text class="student-meta">{{ studentMeta(currentStudent) }}</text>
        </view>
      </view>
      <view class="row-actions">
        <text @tap="openEdit(currentStudent)">编辑</text>
        <text v-if="!currentStudent.isDefault" @tap="makeDefault(currentStudent.id)">设为默认</text>
      </view>
    </view>
    <view v-else class="current-empty card">
      <text class="empty-title">暂无当前学员</text>
      <text class="empty-hint">没有匹配到当前账号的学员信息，可新增一个学员档案</text>
      <button class="small-primary" @tap="openCreate">＋ 新增学员</button>
    </view>

    <view class="section-heading other-heading"><text>其他学员</text><text class="count">{{ otherStudents.length }} 人</text></view>
    <view v-if="groupedStudents.length" class="group-list">
      <view v-for="group in groupedStudents" :key="group.key" class="student-group">
        <view class="group-label">{{ group.key }}</view>
        <view v-for="student in group.items" :key="student.id" class="student-card card">
          <view class="student-row-main">
            <view class="student-avatar">{{ initialOf(student.name) }}</view>
            <view class="student-copy">
              <text class="student-name">{{ student.name }}</text>
              <text class="student-meta">{{ studentMeta(student) }}</text>
            </view>
          </view>
          <view class="row-actions">
            <text @tap="openEdit(student)">编辑</text>
            <text v-if="!student.isDefault" @tap="makeDefault(student.id)">设为默认</text>
            <text class="danger" @tap="removeStudent(student.id)">解除</text>
          </view>
        </view>
      </view>
    </view>
    <view v-else class="other-empty card">暂无其他学员</view>

    <button class="add-button" @tap="openCreate">＋ 添加学员</button>

    <view v-if="studentModalOpen" class="modal-mask" @tap.self="closeModal">
      <view class="modal-card">
        <view class="modal-head">
          <view><text class="modal-title">{{ editingStudentId ? '编辑学员' : '新增学员' }}</text><text class="modal-subtitle">资料会保存为独立学员档案，可用于后续报名</text></view>
          <text class="close" @tap="closeModal">×</text>
        </view>
        <view class="form-row"><text>姓名</text><input v-model="studentForm.name" placeholder="请输入学员姓名" /></view>
        <view class="form-row"><text>手机号</text><input v-model="studentForm.phone" type="number" maxlength="11" placeholder="请输入手机号" /></view>
        <view class="form-row"><text>企业</text><input v-model="studentForm.company" placeholder="请输入企业名称（可选）" /></view>
        <view class="form-row"><text>部门</text><input v-model="studentForm.department" placeholder="请输入部门（可选）" /></view>
        <view class="form-row"><text>职务</text><input v-model="studentForm.position" placeholder="请输入职务（可选）" /></view>
        <view class="form-row"><text>邮箱</text><input v-model="studentForm.email" placeholder="请输入邮箱（可选）" /></view>
        <view class="student-check"><checkbox :checked="studentForm.isDefault" @tap="studentForm.isDefault = !studentForm.isDefault" color="#2F80ED" />报名时优先使用该学员</view>
        <button class="primary-btn" :loading="savingStudent" @tap="saveStudent">保存学员</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { api } from '../../common/api'

type Profile = { name?: string; phone?: string; company?: string; email?: string }
type Student = { id: string; name: string; phone?: string | null; gender?: string | null; email?: string | null; company?: string | null; department?: string | null; position?: string | null; relationType?: string; isDefault?: boolean }
type StudentGroup = { key: string; items: Student[] }

const profile = ref<Profile>({})
const students = ref<Student[]>([])
const loading = ref(false)
const studentModalOpen = ref(false)
const savingStudent = ref(false)
const editingStudentId = ref('')
const studentForm = reactive({ name: '', phone: '', company: '', department: '', position: '', email: '', isDefault: false })

const normalize = (value?: string | null) => String(value || '').trim().toLowerCase()
const normalizePhone = (value?: string | null) => String(value || '').replace(/\D/g, '')

const currentStudent = computed<Student | null>(() => {
  const list = students.value
  if (!list.length) return null
  const explicitDefault = list.find((student) => student.isDefault)
  if (explicitDefault) return explicitDefault
  const currentPhone = normalizePhone(profile.value.phone)
  if (currentPhone) {
    const matchedPhone = list.find((student) => normalizePhone(student.phone) === currentPhone)
    if (matchedPhone) return matchedPhone
  }
  const currentName = normalize(profile.value.name)
  if (currentName) {
    const matchedName = list.find((student) => normalize(student.name) === currentName)
    if (matchedName) return matchedName
  }
  const currentCompany = normalize(profile.value.company)
  if (currentCompany) return list.find((student) => normalize(student.company) === currentCompany) || null
  return null
})

const otherStudents = computed(() => {
  const currentId = currentStudent.value?.id
  return students.value.filter((student) => student.id !== currentId).sort((left, right) => {
    const initialCompare = initialOf(left.name).localeCompare(initialOf(right.name))
    return initialCompare || left.name.localeCompare(right.name, 'zh-Hans-u-co-pinyin')
  })
})

// 使用中文拼音排序器判定首字母；拉丁字母直接归一化，数字和无法识别字符归入 #。
const PINYIN_REPRESENTATIVES: Array<[string, string]> = [['A', '阿'], ['B', '八'], ['C', '擦'], ['D', '搭'], ['E', '蛾'], ['F', '发'], ['G', '嘎'], ['H', '哈'], ['J', '鸡'], ['K', '喀'], ['L', '拉'], ['M', '妈'], ['N', '拿'], ['O', '哦'], ['P', '趴'], ['Q', '七'], ['R', '然'], ['S', '撒'], ['T', '他'], ['W', '挖'], ['X', '西'], ['Y', '呀'], ['Z', '咋']]
const pinyinCollator = typeof Intl !== 'undefined' ? new Intl.Collator('zh-Hans-u-co-pinyin', { sensitivity: 'base' }) : null
const initialOf = (name?: string | null) => {
  const first = String(name || '').trim().charAt(0)
  if (!first) return '#'
  if (/^[a-z]$/i.test(first)) return first.toUpperCase()
  if (/^\d$/.test(first)) return '#'
  if (pinyinCollator) {
    let index = 0
    for (; index < PINYIN_REPRESENTATIVES.length - 1 && pinyinCollator.compare(first, PINYIN_REPRESENTATIVES[index + 1][1]) >= 0; index += 1) {}
    if (pinyinCollator.compare(first, PINYIN_REPRESENTATIVES[index][1]) >= 0) return PINYIN_REPRESENTATIVES[index][0]
  }
  return '#'
}

const groupedStudents = computed<StudentGroup[]>(() => {
  const groups = new Map<string, Student[]>()
  for (const student of otherStudents.value) {
    const key = initialOf(student.name)
    const group = groups.get(key) || []
    group.push(student)
    groups.set(key, group)
  }
  return [...groups.entries()].sort(([left], [right]) => left === '#' ? 1 : right === '#' ? -1 : left.localeCompare(right)).map(([key, items]) => ({ key, items }))
})

const studentMeta = (student: Student) => [student.phone || '未填写手机号', student.company || '未填写企业', student.relationType || '本人/代报名'].join(' · ')
const resetForm = () => { Object.assign(studentForm, { name: '', phone: '', company: '', department: '', position: '', email: '', isDefault: false }); editingStudentId.value = '' }
const openCreate = () => { resetForm(); studentModalOpen.value = true }
const openEdit = (student: Student) => { editingStudentId.value = student.id; Object.assign(studentForm, { name: student.name || '', phone: student.phone || '', company: student.company || '', department: student.department || '', position: student.position || '', email: student.email || '', isDefault: Boolean(student.isDefault) }); studentModalOpen.value = true }
const closeModal = () => { if (!savingStudent.value) studentModalOpen.value = false }
const load = async () => {
  loading.value = true
  try { const [profileResult, studentResult] = await Promise.all([api.profile(), api.listStudents()]); profile.value = profileResult; students.value = studentResult.items as Student[] } catch { /* 请求层负责跳转登录 */ } finally { loading.value = false }
}
const saveStudent = async () => {
  if (!studentForm.name.trim()) return uni.showToast({ title: '请输入学员姓名', icon: 'none' })
  if (studentForm.phone && !/^1\d{10}$/.test(studentForm.phone.trim())) return uni.showToast({ title: '请输入正确的手机号', icon: 'none' })
  savingStudent.value = true
  try {
    if (editingStudentId.value) await api.updateStudent(editingStudentId.value, { ...studentForm })
    else await api.createStudent({ ...studentForm, relationType: '本人/代报名' })
    await load(); studentModalOpen.value = false; uni.showToast({ title: '学员已保存', icon: 'none' })
  } catch (error: any) { uni.showToast({ title: error?.message || '学员保存失败', icon: 'none' }) } finally { savingStudent.value = false }
}
const makeDefault = async (id: string) => { try { await api.setDefaultStudent(id); await load(); uni.showToast({ title: '默认学员已更新', icon: 'none' }) } catch (error: any) { uni.showToast({ title: error?.message || '设置失败', icon: 'none' }) } }
const removeStudent = (id: string) => uni.showModal({ title: '解除学员关系', content: '解除后仍保留历史报名记录，确定继续吗？', success: async (result) => { if (!result.confirm) return; try { await api.removeStudent(id); await load(); uni.showToast({ title: '已解除关系', icon: 'none' }) } catch (error: any) { uni.showToast({ title: error?.message || '解除失败', icon: 'none' }) } } })
const goBack = () => uni.navigateBack({ delta: 1 })
onShow(load)
</script>

<style scoped lang="scss">
.students-page { min-height: 100vh; padding: 0 28rpx 56rpx; background: #f4f7fb; }
.students-topbar { display: flex; align-items: center; justify-content: space-between; height: 112rpx; margin: 0 -28rpx; padding: 0 28rpx; color: #fff; background: linear-gradient(135deg, #2f80ed, #2370d3); }
.topbar-title { font-size: 34rpx; font-weight: 900; }.back, .topbar-add { width: 56rpx; color: #fff; font-size: 58rpx; line-height: 1; }.back { font-family: Arial, sans-serif; }.topbar-add { font-size: 44rpx; text-align: right; }
.page-intro { padding: 28rpx 0 20rpx; }.intro-title { display: block; color: $navy; font-size: 30rpx; font-weight: 900; }.intro-hint { display: block; margin-top: 8rpx; color: $muted; font-size: 20rpx; line-height: 1.5; }
.section-heading { display: flex; align-items: center; justify-content: space-between; padding: 18rpx 4rpx 12rpx; color: $navy; font-size: 26rpx; font-weight: 900; }.other-heading { margin-top: 14rpx; }.count { color: $muted; font-size: 20rpx; font-weight: 400; }
.card { border-radius: 18rpx; background: #fff; box-shadow: 0 8rpx 24rpx rgba(20,43,74,.06); }.current-card, .student-card { padding: 24rpx; }.student-card { display: flex; align-items: center; justify-content: space-between; gap: 18rpx; margin-bottom: 14rpx; }.student-row-main { display: flex; align-items: center; min-width: 0; }.student-avatar { display: grid; place-items: center; flex: 0 0 auto; width: 72rpx; height: 72rpx; margin-right: 16rpx; border-radius: 50%; color: $navy; background: #e8f1ff; font-size: 26rpx; font-weight: 900; }.current-avatar { color: #fff; background: #2f80ed; }.student-copy { min-width: 0; }.student-name { display: block; overflow: hidden; color: $navy; font-size: 26rpx; font-weight: 900; text-overflow: ellipsis; white-space: nowrap; }.student-meta { display: block; max-width: 470rpx; margin-top: 8rpx; overflow: hidden; color: $muted; font-size: 19rpx; text-overflow: ellipsis; white-space: nowrap; }.current-tag { display: inline-block; margin-left: 10rpx; padding: 3rpx 10rpx; border-radius: 999rpx; color: #177b51; background: #eaf9f1; font-size: 17rpx; font-weight: 700; }.row-actions { display: flex; flex: 0 0 auto; flex-wrap: wrap; justify-content: flex-end; gap: 12rpx; color: $blue; font-size: 19rpx; }.row-actions .danger { color: #d95757; }.group-label { padding: 12rpx 10rpx 8rpx; color: $muted; font-size: 22rpx; font-weight: 900; }.current-empty, .other-empty { padding: 30rpx 24rpx; text-align: center; }.empty-title { display: block; color: $navy; font-size: 25rpx; font-weight: 800; }.empty-hint { display: block; margin-top: 8rpx; color: $muted; font-size: 20rpx; line-height: 1.5; }.small-primary { width: 230rpx; height: 62rpx; margin: 20rpx auto 0; border: 0; border-radius: 999rpx; color: #17366d; background: $yellow; font-size: 21rpx; line-height: 62rpx; font-weight: 800; }.add-button { width: calc(100% - 80rpx); height: 78rpx; margin: 28rpx auto 0; border: 0; border-radius: 999rpx; color: #17366d; background: $yellow; font-size: 24rpx; line-height: 78rpx; font-weight: 900; }.add-button::after, .small-primary::after, .primary-btn::after { border: 0; }
.modal-mask { position: fixed; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; padding: 30rpx; background: rgba(12,31,65,.48); }.modal-card { box-sizing: border-box; width: 100%; max-width: 680rpx; max-height: 92vh; overflow-y: auto; padding: 30rpx 28rpx calc(30rpx + env(safe-area-inset-bottom)); border-radius: 28rpx; background: #fff; }.modal-head { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 18rpx; }.modal-title { display: block; color: $navy; font-size: 32rpx; font-weight: 900; }.modal-subtitle { display: block; margin-top: 8rpx; color: $muted; font-size: 19rpx; }.close { color: #8391a3; font-size: 44rpx; line-height: 1; }.form-row { margin-top: 18rpx; }.form-row > text { display: block; margin-bottom: 10rpx; color: $muted; font-size: 21rpx; }.form-row input { box-sizing: border-box; width: 100%; height: 74rpx; padding: 0 20rpx; border: 1rpx solid #dce4ee; border-radius: 14rpx; color: $navy; background: #fbfcfe; font-size: 23rpx; }.student-check { display: flex; align-items: center; gap: 8rpx; margin-top: 20rpx; color: $muted; font-size: 20rpx; }.primary-btn { width: 100%; height: 80rpx; margin-top: 26rpx; border: 0; border-radius: 999rpx; color: #17366d; background: $yellow; font-size: 24rpx; line-height: 80rpx; font-weight: 900; }
</style>
