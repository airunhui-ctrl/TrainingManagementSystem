<template>
  <view class="detail-page">
    <view class="detail-topbar"><text class="back" @tap="back">‹</text><text class="detail-topbar-title">{{ topbarTitle }}</text><text class="menu">▦</text></view>
    <view v-if="loading" class="page-state">正在加载课程…</view>
    <view v-else-if="course" class="detail-content">
      <view class="hero-wrap"><image class="hero-image" :src="course.image" mode="aspectFill" /><view class="hero-gradient" /><view class="hero-category">{{ course.category }}</view></view>
      <view class="summary">
        <text class="course-title">{{ course.title }}</text>
        <text class="course-subtitle">{{ course.subtitle }}</text>
        <view class="summary-time"><text class="time-dot">●</text><text>{{ course.date }}</text></view>
        <view class="summary-grid">
          <view class="summary-item"><text class="item-icon">⌖</text><view><text class="item-label">培训地点</text><text class="item-value">{{ course.location }}</text></view></view>
          <view class="summary-item"><text class="item-icon">♙</text><view><text class="item-label">报名人数</text><text class="item-value">已报名 {{ course.enrolled }} 人</text></view></view>
          <view class="summary-item"><text class="item-icon">¥</text><view><text class="item-label">课程费用</text><text class="item-value price-value">¥{{ course.price.toLocaleString() }}/人</text></view></view>
        </view>
      </view>
      <view class="intro-card">
        <view class="intro-heading-row"><text class="intro-title">课程简介</text><text class="intro-badge">富文本内容</text></view>
        <view :class="['intro-rich-wrap', { collapsed: shouldCollapseIntro && !introExpanded }]">
          <view class="intro-rich">
            <template v-for="(block, index) in introBlocks" :key="`${block.type}-${index}`">
              <text v-if="block.type === 'heading'" class="intro-block-heading">{{ block.text }}</text>
              <text v-else-if="block.type === 'paragraph'" class="intro-block-paragraph">{{ block.text }}</text>
              <view v-else-if="block.type === 'callout'" class="intro-callout"><text class="intro-callout-label">课程亮点</text><text class="intro-callout-text">{{ block.text }}</text></view>
              <image v-else-if="block.type === 'image'" class="intro-block-image" :src="block.src" mode="aspectFill" />
              <view v-else-if="block.type === 'list'" class="intro-block-list">
                <view v-for="(item, itemIndex) in block.items" :key="itemIndex" class="intro-list-item"><text class="intro-list-dot">{{ String(itemIndex + 1).padStart(2, '0') }}</text><text class="intro-list-text">{{ item }}</text></view>
              </view>
              <rich-text v-else-if="block.type === 'rich'" class="intro-rich-html" :nodes="block.html" />
            </template>
          </view>
          <view v-if="shouldCollapseIntro && !introExpanded" class="intro-fade"><text class="intro-fade-text">下方还有详细课程内容</text></view>
        </view>
        <view v-if="shouldCollapseIntro" class="intro-toggle" @tap="toggleIntro"><text>{{ introExpanded ? '收起课程简介' : '展开完整简介' }}</text><text class="intro-toggle-icon">{{ introExpanded ? '⌃' : '⌄' }}</text></view>
      </view>
      <view v-if="course.seatsLeft" class="bottom-cta"><view><text class="cta-label">课程费用</text><text class="cta-price">¥{{ course.price.toLocaleString() }}<text> / 人</text></text></view><button class="register-btn" @tap="register">我要报名</button></view>
      <view v-else class="bottom-cta ended"><text>本期课程已结束，关注后续活动</text></view>
    </view>
    <view v-else class="page-state">课程不存在或已下架</view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import bannerImage from '../../assets/courses/banner-training.svg'
import talentImage from '../../assets/courses/course-talent.svg'
import managementImage from '../../assets/courses/course-management.svg'
import leanImage from '../../assets/courses/course-lean.svg'
import { api, type ApiCourse } from '../../common/api'
import { tokenStorage } from '../../common/auth'

type DisplayCourse = ApiCourse & { image: string; descriptionRichText?: string }
type IntroBlock =
  | { type: 'heading' | 'paragraph' | 'callout'; text: string }
  | { type: 'image'; src: string }
  | { type: 'list'; items: string[] }
  | { type: 'rich'; html: string }
const course = ref<DisplayCourse | null>(null)
const loading = ref(true)
const introExpanded = ref(false)
const imageByCourseId: Record<string, string> = { 'course-1': talentImage, 'course-2': managementImage, 'course-3': leanImage }
const introBlocksByCourseId: Record<string, IntroBlock[]> = {
  'course-1': [
    { type: 'heading', text: '课程背景' },
    { type: 'paragraph', text: '企业招聘环境正在发生变化，面试官不仅要看经验，更要判断候选人与岗位、团队和组织文化的匹配度。本课程围绕结构化面试流程，把评价标准、提问方法和证据记录串成一套可以复用的操作方法。' },
    { type: 'image', src: talentImage },
    { type: 'callout', text: '用一套可复制的面试方法，把经验判断沉淀为稳定、可复盘的选人标准。' },
    { type: 'heading', text: '你将学到' },
    { type: 'list', items: ['建立结构化面试流程与评价标准', '设计高质量行为面试问题', '识别关键岗位的胜任力证据', '用统一量表提升面试决策的一致性'] },
    { type: 'heading', text: '适合人群' },
    { type: 'paragraph', text: '适合企业负责人、人力资源管理者、招聘负责人及需要参与面试的业务主管。课程将结合真实招聘场景进行演练，帮助团队把经验判断沉淀为稳定的方法。' },
  ],
  'course-2': [
    { type: 'heading', text: '课程背景' },
    { type: 'paragraph', text: '经营管理不只是一套报表动作，更是把目标、资源和团队节奏放到同一张地图上。本训练营从经营视角出发，帮助管理者把年度目标拆到部门协同和个人行动中。' },
    { type: 'image', src: managementImage },
    { type: 'heading', text: '课程内容' },
    { type: 'paragraph', text: '从目标共识、经营分析、组织协同到复盘改进，结合真实企业案例完成一套经营管理行动地图。' },
    { type: 'list', items: ['经营目标与关键结果拆解', '跨部门协同机制设计', '管理者经营复盘方法', '团队关键指标看板搭建'] },
  ],
  'course-3': [
    { type: 'heading', text: '课程背景' },
    { type: 'paragraph', text: '组织效能提升不是简单加快速度，而是让流程、岗位和决策之间形成更顺畅的协作。本课程用真实业务场景拆解流程改善方法。' },
    { type: 'image', src: leanImage },
    { type: 'heading', text: '实战模块' },
    { type: 'paragraph', text: '通过流程地图、问题树和改善看板，定位影响效率的关键节点，形成可持续的优化机制。' },
    { type: 'list', items: ['流程地图与问题定位', '岗位协同与节点责任', '改善看板与复盘机制'] },
  ],
}

const topbarTitle = computed(() => course.value?.title || '课程详情')
const introBlocks = computed<IntroBlock[]>(() => {
  if (!course.value) return []
  if (course.value.descriptionRichText) return [{ type: 'rich', html: course.value.descriptionRichText }]
  return introBlocksByCourseId[course.value.id] || [
    { type: 'heading', text: '课程简介' },
    { type: 'paragraph', text: course.value.description },
  ]
})
const shouldCollapseIntro = computed(() => introBlocks.value.length > 3 || Boolean(course.value?.descriptionRichText && course.value.descriptionRichText.length > 520))

const loadCourse = async (id: string) => {
  loading.value = true
  try {
    const result = await api.getCourse(id)
    introExpanded.value = false
    course.value = { ...result, image: imageByCourseId[result.id] || bannerImage }
    if (tokenStorage.getAccessToken()) void api.recordPreview(result.id).catch(() => undefined)
  } catch {
    course.value = null
    uni.showToast({ title: '课程加载失败，请返回重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}

onLoad((query) => { loadCourse(String(query?.id || 'course-1')) })
const back = () => uni.navigateBack()
const toggleIntro = () => { if (shouldCollapseIntro.value) introExpanded.value = !introExpanded.value }
const register = () => { if (course.value) uni.navigateTo({ url: `/pages/register/register?id=${course.value.id}` }) }
</script>

<style scoped lang="scss">
.detail-page { min-height: 100vh; padding-bottom: 190rpx; background: #f5f7fa; }.detail-topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; height: 92rpx; padding: 0 30rpx; color: #fff; background: linear-gradient(108deg, #55cfe9 0%, #2f80ed 52%, #234dbb 100%); box-shadow: 0 4rpx 16rpx rgba(21, 70, 158, .2); }.back { width: 120rpx; font-size: 64rpx; line-height: 1; font-weight: 200; }.menu { width: 120rpx; text-align: right; font-size: 34rpx; }.detail-topbar-title { flex: 1; min-width: 0; overflow: hidden; text-align: center; text-overflow: ellipsis; white-space: nowrap; font-size: 30rpx; font-weight: 800; letter-spacing: 0; }.page-state { padding: 180rpx 40rpx; color: #8492a7; text-align: center; font-size: 26rpx; }
.hero-wrap { position: relative; width: 100%; height: 430rpx; overflow: hidden; }.hero-image { display: block; width: 100%; height: 100%; }.hero-gradient { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(12, 31, 92, .62), rgba(12, 31, 92, 0) 58%); }.hero-category { position: absolute; left: 32rpx; bottom: 28rpx; padding: 8rpx 18rpx; border: 1rpx solid rgba(255,255,255,.6); border-radius: 999rpx; color: #fff; background: rgba(16, 54, 145, .35); font-size: 21rpx; }
.summary { padding: 28rpx 32rpx 30rpx; background: #fff; }.course-title { display: block; color: #172e51; font-size: 37rpx; line-height: 1.35; font-weight: 900; }.course-subtitle { display: block; margin-top: 9rpx; color: #76879c; font-size: 23rpx; }.summary-time { display: flex; align-items: center; gap: 10rpx; margin-top: 24rpx; padding-bottom: 22rpx; border-bottom: 1rpx solid #edf0f4; color: #2e3e52; font-size: 23rpx; }.time-dot { color: #2f80ed; font-size: 22rpx; }.summary-grid { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 16rpx; padding-top: 22rpx; }.summary-item { display: flex; gap: 10rpx; min-width: 0; }.item-icon { flex: 0 0 auto; width: 40rpx; height: 40rpx; line-height: 40rpx; border-radius: 12rpx; color: #2f80ed; background: #eaf3ff; text-align: center; font-size: 23rpx; }.item-label, .item-value { display: block; }.item-label { color: #8996a8; font-size: 18rpx; }.item-value { margin-top: 8rpx; overflow: hidden; color: #3d4d61; font-size: 21rpx; line-height: 1.35; text-overflow: ellipsis; }.price-value { color: #ed781d; }
.bottom-cta { position: fixed; right: 0; bottom: 0; left: 0; z-index: 30; display: flex; align-items: center; justify-content: space-between; gap: 24rpx; min-height: 112rpx; padding: 16rpx 28rpx calc(16rpx + env(safe-area-inset-bottom)); border-top: 1rpx solid #e6ebf2; background: rgba(255, 255, 255, .97); box-shadow: 0 -8rpx 28rpx rgba(20, 43, 74, .12); backdrop-filter: blur(12px); }
.cta-label { display: block; color: #8996a8; font-size: 20rpx; line-height: 1.3; }
.cta-price { display: block; margin-top: 4rpx; color: #ed781d; font-size: 36rpx; line-height: 1.15; font-weight: 900; }
.cta-price > text { color: #8996a8; font-size: 20rpx; font-weight: 400; }
.register-btn { flex: 0 0 auto; width: 260rpx; height: 76rpx; margin: 0; padding: 0 28rpx; border: 0; border-radius: 999rpx; color: #163a84; background: #ffd21f; box-shadow: 0 8rpx 18rpx rgba(224, 164, 0, .2); font-size: 27rpx; line-height: 76rpx; font-weight: 900; }
.register-btn::after { border: 0; }
.bottom-cta.ended { justify-content: center; color: #8996a8; font-size: 23rpx; }
@media (max-width: 520px) { .bottom-cta { gap: 14rpx; padding-right: 22rpx; padding-left: 22rpx; }.register-btn { width: 224rpx; font-size: 25rpx; } }
.intro-card { box-sizing: border-box; width: 100%; margin: 22rpx 0 0; padding: 28rpx 26rpx 24rpx; border: 1rpx solid #edf1f6; border-radius: 24rpx; background: #fff; box-shadow: 0 10rpx 28rpx rgba(41, 74, 120, .06); }
.intro-heading-row { display: flex; align-items: center; justify-content: space-between; gap: 16rpx; margin-bottom: 22rpx; }
.intro-title { color: #172e51; font-size: 31rpx; line-height: 1.3; font-weight: 900; }
.intro-badge { flex: 0 0 auto; padding: 6rpx 14rpx; border-radius: 999rpx; color: #2f80ed; background: #edf5ff; font-size: 19rpx; line-height: 1.3; }
.intro-rich-wrap { position: relative; overflow: hidden; transition: max-height .25s ease; }
.intro-rich-wrap.collapsed { max-height: 620rpx; }
.intro-rich { color: #52647a; font-size: 25rpx; line-height: 1.8; }
.intro-block-heading { display: block; margin: 24rpx 0 10rpx; color: #1b355b; font-size: 28rpx; line-height: 1.4; font-weight: 800; }
.intro-block-heading:first-child { margin-top: 0; }
.intro-block-paragraph { display: block; margin: 0 0 18rpx; color: #52647a; font-size: 25rpx; line-height: 1.85; }
.intro-block-image { display: block; width: 100%; height: 300rpx; margin: 20rpx 0 24rpx; border-radius: 18rpx; background: #edf2f7; object-fit: cover; }
.intro-callout { display: flex; flex-direction: column; gap: 8rpx; margin: 22rpx 0; padding: 20rpx 22rpx; border-left: 6rpx solid #2f80ed; border-radius: 12rpx; background: #f3f8ff; }
.intro-callout-label { color: #2f80ed; font-size: 21rpx; font-weight: 800; }
.intro-callout-text { color: #405b78; font-size: 24rpx; line-height: 1.75; }
.intro-block-list { margin: 4rpx 0 22rpx; }
.intro-list-item { display: flex; align-items: flex-start; gap: 14rpx; margin: 12rpx 0; }
.intro-list-dot { flex: 0 0 auto; width: 38rpx; height: 38rpx; border-radius: 12rpx; color: #2f80ed; background: #edf5ff; text-align: center; font-size: 19rpx; line-height: 38rpx; font-weight: 800; }
.intro-list-text { flex: 1; color: #52647a; font-size: 24rpx; line-height: 1.7; }
.intro-rich-html { display: block; color: #52647a; font-size: 25rpx; line-height: 1.8; }
.intro-rich-html :deep(h1), .intro-rich-html :deep(h2), .intro-rich-html :deep(h3) { margin: 18rpx 0 12rpx; color: #172e51; font-weight: 900; }
.intro-rich-html :deep(p), .intro-rich-html :deep(div) { margin: 0 0 18rpx; color: #52647a; line-height: 1.85; }
.intro-rich-html :deep(img) { display: block; width: 100%; max-width: 100%; height: auto; max-height: 420rpx; margin: 20rpx 0; border-radius: 18rpx; object-fit: cover; }
.intro-rich-html :deep(ul), .intro-rich-html :deep(ol) { margin: 10rpx 0 20rpx; padding-left: 36rpx; }
.intro-rich-html :deep(li) { margin: 8rpx 0; line-height: 1.7; }
.intro-fade { position: absolute; right: 0; bottom: 0; left: 0; display: flex; align-items: flex-end; justify-content: center; height: 180rpx; padding-bottom: 18rpx; background: linear-gradient(180deg, rgba(255,255,255,0), #fff 72%); pointer-events: none; }
.intro-fade-text { color: #8a9bb0; font-size: 21rpx; }
.intro-toggle { display: flex; align-items: center; justify-content: center; gap: 10rpx; margin-top: 12rpx; padding-top: 18rpx; border-top: 1rpx solid #edf1f6; color: #2f80ed; font-size: 24rpx; font-weight: 700; }
.intro-toggle-icon { font-size: 30rpx; line-height: 1; }
@media (min-width: 700px) {
  .intro-rich-wrap.collapsed { max-height: 460px; }
  .intro-block-image { height: 260px; }
  .intro-card { max-width: none; margin-right: 0; margin-left: 0; }
}
</style>
