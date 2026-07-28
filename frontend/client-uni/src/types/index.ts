export type CourseStatus = '报名中' | '名额紧张' | '已结束'

export interface Course {
  id: string
  title: string
  subtitle: string
  category: string
  image: string
  date: string
  location: string
  instructor: string
  price: number
  seatsLeft: number
  capacity: number
  status: CourseStatus
  nature: string
  description: string
  descriptionRichText: string
}

export interface Participant {
  name: string
  phone: string
  company: string
  role: string
  companySize: string
}

export interface Order {
  id: string
  courseId: string
  participantCount: number
  amount: number
  status: '待支付' | '待审核' | '已支付'
  payment: string
  createdAt: string
}
