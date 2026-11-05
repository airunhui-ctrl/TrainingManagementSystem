export const COURSE_REGISTRATION_OPEN_STATUSES = new Set(['报名中', '名额紧张'])
const COURSE_PUBLISH_STATUSES = new Set(['待发布', '已发布', '已下架'])
const LEGACY_PUBLISHED_COURSE_STATUSES = new Set(['报名中', '名额紧张', '已结束'])

export type CourseRegistrationState = {
  isOpen: boolean
  displayStatus: string
  reason: string | null
}

export type CourseSpecialPriceState = {
  active: boolean
  price: number
  regularPrice: number
  endsAt: string | null
}

// 管理端保存的是北京时间墙钟时间。这里与后端保持同一解释规则，
// 避免 UTC 服务器或海外浏览器把同一时间解释成不同的报名窗口。
export const parseCourseTime = (value?: string | null): number | null => {
  const raw = String(value || '').trim()
  if (!raw) return null
  let normalized = raw.includes('T') ? raw : raw.replace(' ', 'T')
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) normalized = `${normalized}T00:00:00`
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2}|[+-]\d{4})$/.test(normalized)
  const parsed = Date.parse(hasTimezone ? normalized : `${normalized}+08:00`)
  return Number.isFinite(parsed) ? parsed : null
}

export const parseCourseSessionEnd = (value?: string | null): number | null => {
  const raw = String(value || '').trim()
  const matches = raw.match(/\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/g) || []
  return matches.length >= 2 ? parseCourseTime(matches[matches.length - 1]) : null
}

export const getCoursePublishStatus = (course?: Partial<Pick<ApiCourseLike, 'status' | 'publishStatus'>> | null) => {
  const rawStatus = String(course?.publishStatus || course?.status || '').trim()
  if (COURSE_PUBLISH_STATUSES.has(rawStatus)) return rawStatus
  if (LEGACY_PUBLISHED_COURSE_STATUSES.has(rawStatus)) return '已发布'
  return rawStatus || '待发布'
}

export const getCourseRegistrationState = (
  course?: Partial<Pick<ApiCourseLike, 'status' | 'publishStatus' | 'date' | 'registrationStartAt' | 'registrationEndAt' | 'registrationDeadline' | 'capacity' | 'seatsLeft' | 'registrationOpen'>> | null,
  now = Date.now(),
): CourseRegistrationState => {
  const publishStatus = getCoursePublishStatus(course)
  if (publishStatus !== '已发布') {
    return { isOpen: false, displayStatus: publishStatus, reason: publishStatus === '待发布' ? '课程待发布' : '课程已下架' }
  }

  const startAt = parseCourseTime(course?.registrationStartAt)
  const endAt = parseCourseTime(course?.registrationEndAt ?? course?.registrationDeadline)
  const sessionEndAt = parseCourseSessionEnd(course?.date)
  const seatsAvailable = Number(course?.seatsLeft ?? 0) > 0
  const seatsLeft = Number(course?.seatsLeft ?? 0)
  const capacity = Number(course?.capacity ?? 0)
  const tightThreshold = Math.max(1, Math.ceil(capacity * 0.2))
  const notStarted = startAt !== null && startAt > now
  const ended = endAt !== null && endAt <= now
  const sessionEnded = sessionEndAt !== null && sessionEndAt <= now

  if (sessionEnded) return { isOpen: false, displayStatus: '已结束', reason: '课程已结束' }
  if (notStarted) return { isOpen: false, displayStatus: '等待开始报名', reason: '等待开始报名' }
  if (ended) return { isOpen: false, displayStatus: '报名截止', reason: '报名截止' }
  if (!seatsAvailable) return { isOpen: false, displayStatus: '名额已满', reason: '名额已满' }
  return { isOpen: true, displayStatus: seatsLeft <= tightThreshold ? '名额紧张' : '报名中', reason: null }
}

export const getCourseSpecialPriceState = (
  course?: Partial<Pick<ApiCourseLike, 'price' | 'specialPrice' | 'specialPriceEndsAt'>> | null,
  now = Date.now(),
): CourseSpecialPriceState => {
  const regularPrice = Number(course?.price ?? 0)
  const specialPrice = course?.specialPrice == null ? null : Number(course.specialPrice)
  const endsAt = course?.specialPriceEndsAt ? String(course.specialPriceEndsAt) : null
  const endsAtTime = parseCourseTime(endsAt)
  const active = specialPrice !== null && Number.isFinite(specialPrice) && specialPrice < regularPrice && (endsAtTime === null || endsAtTime > now)
  return {
    active,
    price: active ? specialPrice : regularPrice,
    regularPrice,
    endsAt,
  }
}

export const getCourseDisplayStatus = (course?: Parameters<typeof getCourseRegistrationState>[0], now = Date.now()) =>
  getCourseRegistrationState(course, now).displayStatus

export const isCourseRegistrationOpen = (course?: Parameters<typeof getCourseRegistrationState>[0], now = Date.now()) =>
  getCourseRegistrationState(course, now).isOpen

type ApiCourseLike = {
  status?: string
  publishStatus?: string
  date?: string
  registrationStartAt?: string | null
  registrationEndAt?: string | null
  registrationDeadline?: string | null
  seatsLeft?: number
  capacity?: number
  registrationOpen?: boolean
  price?: number
  specialPrice?: number | null
  specialPriceEndsAt?: string | null
}
