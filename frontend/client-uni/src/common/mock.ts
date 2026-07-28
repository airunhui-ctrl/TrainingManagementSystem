import type { Course, Order } from '../types'
import talentImage from '../assets/courses/course-talent.svg'
import managementImage from '../assets/courses/course-management.svg'
import leanImage from '../assets/courses/course-lean.svg'

export const courses: Course[] = [
  {
    id: 'course-1', title: '人才选拔与结构化面试实战公开课', subtitle: '把好人才入口，提升面试判断力', category: '人才管理', image: talentImage,
    date: '2026-08-06 09:00—08-08 17:00', location: '厦门市中小企业公共服务平台东侧培训室', instructor: '林老师', price: 1980, seatsLeft: 12, capacity: 60, status: '报名中', nature: '公益',
    description: '围绕人才选拔、结构化面试和面试评价，帮助企业建立可复用的人才识别方法。',
    descriptionRichText: `<h3>课程背景</h3><p>企业招聘环境正在发生变化，面试官不仅要看经验，更要判断候选人与岗位、团队和组织文化的匹配度。</p><img src="${talentImage}" alt="人才选拔课程场景" /><h3>你将学到</h3><ul><li>建立结构化面试流程与评价标准</li><li>设计高质量行为面试问题</li><li>识别关键岗位的胜任力证据</li><li>用统一量表提升面试决策的一致性</li></ul><h3>适合人群</h3><p>企业负责人、人力资源管理者、招聘负责人及需要参与面试的业务主管。</p>`
  },
  {
    id: 'course-2', title: '企业经营管理领军人才训练营', subtitle: '从经营视角看组织与人才', category: '经营管理', image: managementImage,
    date: '2026-08-20 09:00—08-21 17:00', location: '厦门软件园二期 B 区', instructor: '陈老师', price: 2980, seatsLeft: 2, capacity: 30, status: '名额紧张', nature: '公益',
    description: '聚焦经营目标拆解、团队协同与管理者成长，形成可落地的经营动作。',
    descriptionRichText: `<h3>课程背景</h3><p>面对不确定的市场环境，管理者需要把战略目标转化为团队可执行的经营动作。</p><img src="${managementImage}" alt="经营管理课程场景" /><h3>课程内容</h3><p>从目标共识、经营分析、组织协同到复盘改进，结合真实企业案例完成一套经营管理行动地图。</p><ul><li>经营目标与关键结果拆解</li><li>跨部门协同机制设计</li><li>管理者的经营复盘方法</li></ul>`
  },
  {
    id: 'course-3', title: '企业精益突破之道实战公开课', subtitle: '从流程优化到组织效率提升', category: '组织效能', image: leanImage,
    date: '2026-06-25 09:00—06-26 17:00', location: '厦门市中小企业服务中心', instructor: '周老师', price: 1680, seatsLeft: 0, capacity: 50, status: '已结束', nature: '公益',
    description: '以真实业务场景为案例，拆解流程改善、岗位协同和持续改进的方法。',
    descriptionRichText: `<h3>课程背景</h3><p>组织效能提升不是简单加快速度，而是让流程、岗位和决策之间形成更顺畅的协作。</p><img src="${leanImage}" alt="组织效能课程场景" /><h3>实战模块</h3><p>通过流程地图、问题树和改善看板，定位影响效率的关键节点，形成可持续的优化机制。</p>`
  }
]

export const demoOrders: Order[] = [
  { id: 'HX-20260722001', courseId: 'course-2', participantCount: 2, amount: 5364, status: '待支付', payment: '待支付', createdAt: '2026-07-22 10:20' },
  { id: 'HX-20260721008', courseId: 'course-1', participantCount: 1, amount: 1980, status: '已支付', payment: '微信支付', createdAt: '2026-07-21 14:08' }
]
