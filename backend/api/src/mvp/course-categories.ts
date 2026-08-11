export interface CourseCategoryOption {
  code: string
  label: string
}

export const COURSE_CATEGORY_DICTIONARY: CourseCategoryOption[] = [
  { code: '01', label: '综合管理' },
  { code: '02', label: '人才管理' },
  { code: '03', label: '经营管理' },
  { code: '04', label: '组织效能' },
  { code: '05', label: '绩效管理' },
  { code: '06', label: '组织发展' },
  { code: '07', label: '数字化学习' },
]

const byCode = new Map(COURSE_CATEGORY_DICTIONARY.map((item) => [item.code, item]))
const byLabel = new Map(COURSE_CATEGORY_DICTIONARY.map((item) => [item.label, item.code]))

export const courseCategoryLabel = (value: unknown) => {
  const raw = String(value || '').trim()
  return byCode.get(raw)?.label || raw
}

export const normalizeCourseCategory = (value: unknown) => {
  const raw = String(value || '').trim()
  if (byCode.has(raw)) return raw
  return byLabel.get(raw) || null
}
