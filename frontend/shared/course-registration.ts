export const COURSE_REGISTRATION_OPEN_STATUSES = new Set(['报名中', '名额紧张'])

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

export const getCourseRegistrationState = (
  course?: Partial<Pick<ApiCourseLike, 'status' | 'date' | 'registrationStartAt' | 'registrationEndAt' | 'registrationDeadline' | 'seatsLeft' | 'registrationOpen'>> | null,
  now = Date.now(),
): CourseRegistrationState => {
  const rawStatus = String(course?.status || '')
  if (!COURSE_REGISTRATION_OPEN_STATUSES.has(rawStatus)) {
    const terminalReason = rawStatus === '已结束' || rawStatus === '已下架' ? null : '课程未开放报名'
    return { isOpen: false, displayStatus: rawStatus || '暂不可报名', reason: terminalReason }
  }

  const startAt = parseCourseTime(course?.registrationStartAt)
  const endAt = parseCourseTime(course?.registrationEndAt ?? course?.registrationDeadline)
  const sessionEndAt = parseCourseSessionEnd(course?.date)
  const seatsAvailable = Number(course?.seatsLeft ?? 0) > 0
  const notStarted = startAt !== null && startAt > now
  const ended = endAt !== null && endAt <= now
  const sessionEnded = sessionEndAt !== null && sessionEndAt <= now

  if (sessionEnded) return { isOpen: false, displayStatus: '已结束', reason: '课程已结束' }
  if (notStarted) return { isOpen: false, displayStatus: '等待开始报名', reason: '等待开始报名' }
  if (ended) return { isOpen: false, displayStatus: '报名截止', reason: '报名截止' }
  if (!seatsAvailable) return { isOpen: false, displayStatus: '名额已满', reason: '名额已满' }
  return { isOpen: true, displayStatus: rawStatus, reason: null }
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
  date?: string
  registrationStartAt?: string | null
  registrationEndAt?: string | null
  registrationDeadline?: string | null
  seatsLeft?: number
  registrationOpen?: boolean
  price?: number
  specialPrice?: number | null
  specialPriceEndsAt?: string | null
}
