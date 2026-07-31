<template>
  <view class="home-page">
    <view class="topbar">
      <view class="topbar-brand"><text class="brand-mark">六边形</text><text class="brand-name">培训</text></view>
      <text class="topbar-title">活动 · 培训</text>
      <view class="topbar-actions"><text class="action-icon">⌕</text><text class="action-grid">□</text></view>
    </view>

    <swiper v-if="bannerSlides.length" class="banner-swiper" circular autoplay :interval="4600" :duration="500" indicator-dots indicator-color="rgba(255,255,255,.45)" indicator-active-color="#FFD21F">
      <swiper-item v-for="slide in bannerSlides" :key="slide.id">
        <view class="banner-slide" @touchstart="handleBannerTouchStart" @touchmove="handleBannerTouchMove" @touchend="handleBannerTouchEnd" @tap="handleBannerTap(slide.courseId)">
          <image class="banner-image" :src="slide.image" mode="aspectFill" />
          <view class="banner-shade" />
          <view class="banner-copy">
            <text class="banner-kicker">{{ slide.kicker }}</text>
            <text class="banner-title">{{ slide.title }}</text>
            <text class="banner-subtitle">{{ slide.subtitle }}</text>
          <button class="banner-btn" @tap.stop="handleBannerTap(slide.courseId)">立即学习 <text>→</text></button>
          </view>
        </view>
      </swiper-item>
    </swiper>

    <view class="search-box"><text>⌕</text><input v-model="keyword" placeholder="搜索课程名称或关键词" confirm-type="search" /></view>

    <view class="section-head">
      <view><text class="section-title">平台活动</text><text class="section-caption">为组织成长准备一堂好课</text></view>
      <text class="section-more" @tap="showMore">更多活动</text>
    </view>
    <scroll-view scroll-x class="chips" :show-scrollbar="false">
      <view v-for="item in categories" :key="item" :class="['chip', { active: category === item }]" @tap="category = item">{{ item }}</view>
    </scroll-view>

    <view class="course-list">
      <view v-if="loading" class="empty-state">正在加载课程…</view>
      <view v-else-if="!visibleCourses.length" class="empty-state">暂无符合条件的课程</view>
      <view v-for="course in visibleCourses" :key="course.id" class="course-card" @tap="openDetail(course.id)">
        <image class="course-image" :src="course.image" mode="aspectFill" />
        <view class="course-info">
          <view class="course-status"><text :class="['status-dot', course.seatsLeft ? 'on' : 'off']" />{{ course.status }}<text class="course-instructor">{{ course.instructor }}</text></view>
          <text class="course-title">{{ course.title }}</text>
          <view class="course-meta"><text class="meta-item">◷ {{ shortDate(course.date) }}</text><text class="meta-item">👥 {{ course.enrolled }}人已报名</text></view>
          <view class="course-footer"><view><text class="nature">公益培训</text><text class="course-price">¥{{ course.price.toLocaleString() }}<text class="price-unit"> 起</text></text></view><button class="detail-btn" @tap.stop="openDetail(course.id)">{{ course.seatsLeft ? '查看详情' : '已结束' }}</button></view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import bannerImage from '../../assets/courses/banner-training.svg'
import talentImage from '../../assets/courses/course-talent.svg'
import managementImage from '../../assets/courses/course-management.svg'
import leanImage from '../../assets/courses/course-lean.svg'
import { api, apiAssetUrl, type ApiCourse } from '../../common/api'

type DisplayCourse = ApiCourse & { image: string }

const category = ref('全部')
const keyword = ref('')
const courses = ref<DisplayCourse[]>([])
const bannerIds = ref<string[]>([])
const loading = ref(false)
const bannerTouchStartX = ref(0)
const bannerTouchStartY = ref(0)
const bannerSuppressTapUntil = ref(0)

const imageByCourseId: Record<string, string> = {
  'course-1': talentImage,
  'course-2': managementImage,
  'course-3': leanImage,
}

const categories = computed(() => ['全部', ...new Set(courses.value.map((course) => course.category))])
const visibleCourses = computed(() => courses.value.filter((course) => (category.value === '全部' || course.category === category.value) && (!keyword.value.trim() || `${course.title}${course.subtitle}${course.category}`.includes(keyword.value.trim()))))
const bannerSlides = computed(() => {
  const candidates = (bannerIds.value.length ? bannerIds.value : courses.value.map((course) => course.id))
    .map((id) => courses.value.find((course) => course.id === id))
    .filter((course): course is DisplayCourse => Boolean(course))
  return candidates.map((course, index) => ({
    id: `banner-${course.id}`,
    courseId: course.id,
    image: apiAssetUrl(course.image) || bannerImage,
    kicker: `${course.category} · 名师公开课`,
    title: course.title,
    subtitle: course.subtitle,
  }))
})

const toDisplayCourse = (course: ApiCourse): DisplayCourse => ({ ...course, image: apiAssetUrl(course.image) || imageByCourseId[course.id] || bannerImage })
const shortDate = (date: string) => date.split(' ')[0].replace(/^\d{4}-/, '')
const openDetail = (id: string) => uni.navigateTo({ url: `/pages/detail/detail?id=${id}` })
const handleBannerTouchStart = (event: any) => {
  const touch = event.touches?.[0]
  bannerTouchStartX.value = Number(touch?.clientX ?? touch?.pageX ?? 0)
  bannerTouchStartY.value = Number(touch?.clientY ?? touch?.pageY ?? 0)
}
const handleBannerTouchMove = (event: any) => {
  const touch = event.touches?.[0]
  const currentX = Number(touch?.clientX ?? touch?.pageX ?? 0)
  const currentY = Number(touch?.clientY ?? touch?.pageY ?? 0)
  if (Math.abs(currentX - bannerTouchStartX.value) > 12 || Math.abs(currentY - bannerTouchStartY.value) > 12) bannerSuppressTapUntil.value = Date.now() + 360
}
const handleBannerTouchEnd = (event: any) => {
  const touch = event.changedTouches?.[0] || event.touches?.[0]
  const endX = Number(touch?.clientX ?? touch?.pageX ?? 0)
  const endY = Number(touch?.clientY ?? touch?.pageY ?? 0)
  if (Math.abs(endX - bannerTouchStartX.value) > 12 || Math.abs(endY - bannerTouchStartY.value) > 12) bannerSuppressTapUntil.value = Date.now() + 360
}
const handleBannerTap = (id: string) => {
  if (Date.now() < bannerSuppressTapUntil.value) return
  openDetail(id)
}
const showMore = () => uni.showToast({ title: '已展示全部可报名课程', icon: 'none' })

const loadHome = async () => {
  loading.value = true
  try {
    const [courseResult, bannerResult] = await Promise.all([api.listCourses(), api.listBanners()])
    courses.value = courseResult.items.map(toDisplayCourse)
    bannerIds.value = bannerResult.items.map((banner) => banner.courseId)
    if (!categories.value.includes(category.value)) category.value = '全部'
  } catch {
    uni.showToast({ title: '课程加载失败，请稍后重试', icon: 'none' })
  } finally {
    loading.value = false
  }
}

onShow(loadHome)
</script>

<style scoped lang="scss">
.home-page { min-height: 100vh; padding-bottom: 64rpx; background: #f6f8fb; }
.topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; justify-content: space-between; height: 92rpx; padding: 0 30rpx; color: #fff; background: linear-gradient(108deg, #55cfe9 0%, #2f80ed 52%, #234dbb 100%); box-shadow: 0 4rpx 16rpx rgba(21, 70, 158, .2); }
.topbar-brand { display: flex; align-items: baseline; min-width: 150rpx; }.brand-mark { font-size: 31rpx; font-weight: 900; letter-spacing: 2rpx; }.brand-name { margin-left: 4rpx; font-size: 22rpx; opacity: .92; }.topbar-title { font-size: 31rpx; font-weight: 800; letter-spacing: 2rpx; }.topbar-actions { display: flex; align-items: center; justify-content: flex-end; gap: 22rpx; min-width: 150rpx; }.action-icon { font-size: 48rpx; line-height: 1; font-weight: 300; }.action-grid { display: block; width: 38rpx; height: 38rpx; border: 3rpx solid #fff; border-radius: 8rpx; color: transparent; background: linear-gradient(90deg, transparent 44%, #fff 44%, #fff 56%, transparent 56%), linear-gradient(0deg, transparent 44%, #fff 44%, #fff 56%, transparent 56%); }
.banner-swiper, .banner-slide { width: 100%; height: 390rpx; }.banner-slide { position: relative; overflow: hidden; }.banner-image { position: absolute; inset: 0; width: 100%; height: 100%; }.banner-shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(14, 44, 142, .74) 0%, rgba(20, 80, 194, .24) 58%, rgba(20, 80, 194, 0) 100%); }.banner-copy { position: absolute; left: 42rpx; top: 62rpx; right: 38rpx; color: #fff; }.banner-kicker, .banner-title, .banner-subtitle { display: block; }.banner-kicker { font-size: 22rpx; opacity: .88; letter-spacing: 1rpx; }.banner-title { margin-top: 22rpx; font-size: 40rpx; line-height: 1.2; font-weight: 900; letter-spacing: 1rpx; }.banner-subtitle { margin-top: 8rpx; font-size: 27rpx; font-weight: 800; color: #ffdf3d; }.banner-btn { margin: 24rpx 0 0; padding: 0 28rpx; width: 224rpx; height: 66rpx; line-height: 66rpx; border: 0; border-radius: 999rpx; color: #1742a5; background: #fff; font-size: 24rpx; font-weight: 800; }.banner-btn::after { border: 0; }.banner-btn text { margin-left: 6rpx; color: #1550ca; font-size: 30rpx; }
.search-box { display:flex; align-items:center; gap:14rpx; margin:44rpx 28rpx 0; padding:0 24rpx; height:76rpx; border-radius:18rpx; color:#92a0b2; background:#fff; box-shadow:0 6rpx 18rpx rgba(32,62,113,.06); font-size:28rpx; }.search-box input { flex:1; height:76rpx; color:#243956; font-size:24rpx; }.section-head { display: flex; align-items: center; justify-content: space-between; margin:42rpx 20rpx 0; padding: 34rpx 32rpx 20rpx; border-radius:24rpx 24rpx 0 0; background: #fff; }.section-title { display: block; font-size: 38rpx; font-weight: 900; letter-spacing: 1rpx; }.section-caption { display: block; margin-top: 8rpx; color: #8a98aa; font-size: 21rpx; }.section-more { color: #e58419; font-size: 25rpx; }
.chips { box-sizing: border-box; width: calc(100% - 40rpx); margin:0 20rpx; padding: 0 32rpx 30rpx; white-space: nowrap; border-radius:0 0 24rpx 24rpx; background: #fff; }.chip { display: inline-block; margin-right: 16rpx; padding: 16rpx 28rpx; border-radius: 999rpx; color: #7d8da5; background: #f0f3f7; font-size: 23rpx; }.chip.active { color: #163a84; background: #ffd21f; font-weight: 800; }
.course-list { padding: 46rpx 24rpx 0; }.empty-state { padding: 80rpx 32rpx; color: #8492a7; text-align: center; font-size: 25rpx; }.course-card { overflow: hidden; margin-bottom: 40rpx; border-radius: 20rpx; background: #fff; box-shadow: 0 8rpx 28rpx rgba(32, 62, 113, .1); }.course-image { display: block; width: 100%; height: 360rpx; background: #dcecff; }.course-info { padding: 26rpx 24rpx 24rpx; }.course-status { display: flex; align-items: center; color: #718096; font-size: 22rpx; }.status-dot { display: inline-block; width: 13rpx; height: 13rpx; margin-right: 10rpx; border-radius: 50%; background: #2ebd7f; }.status-dot.off { background: #a8b2c0; }.course-instructor { margin-left: auto; color: #8492a7; }.course-title { display: block; margin-top: 16rpx; color: #142b4a; font-size: 31rpx; line-height: 1.35; font-weight: 900; }.course-meta { display: flex; flex-wrap: wrap; gap: 10rpx 22rpx; margin-top: 18rpx; color: #7a899c; font-size: 21rpx; }.course-footer { display: flex; align-items: flex-end; justify-content: space-between; margin-top: 26rpx; padding-top: 20rpx; border-top: 1rpx solid #edf0f4; }.nature { display: block; width: fit-content; margin-bottom: 6rpx; padding: 4rpx 13rpx; border-radius: 7rpx; color: #f0781b; background: #fff2e5; font-size: 19rpx; }.course-price { color: #f0781b; font-size: 37rpx; font-weight: 900; }.price-unit { color: #8795a7; font-size: 20rpx; font-weight: 400; }.detail-btn { margin: 0; padding: 0 25rpx; height: 66rpx; line-height: 66rpx; border: 1rpx solid #2f80ed; border-radius: 999rpx; color: #2f80ed; background: #fff; font-size: 23rpx; }.detail-btn::after { border: 0; }
</style>
