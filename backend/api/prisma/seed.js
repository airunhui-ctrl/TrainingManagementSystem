const { PrismaClient } = require('@prisma/client')
const { randomBytes, scryptSync } = require('node:crypto')
const { dirname, isAbsolute, resolve } = require('node:path')
const { mkdirSync } = require('node:fs')

const configuredUrl = String(process.env.DATABASE_URL || '').trim()
if (/^(postgres(ql)?|mysql):\/\//i.test(configuredUrl)) {
  throw new Error('SQLite seed 不能处理 PostgreSQL/MySQL；请使用 PostgreSQL 专用迁移和导入流程')
}
const raw = process.env.DATABASE_FILE || process.env.DATABASE_URL || './data/training.db'
const value = raw.replace(/^file:/, '')
const filePath = isAbsolute(value) ? value : resolve(process.cwd(), value)
mkdirSync(dirname(filePath), { recursive: true })
const db = new PrismaClient({ datasources: { db: { url: `file:${filePath.replace(/\\/g, '/')}` } } })
const hash = (password) => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}` }

const courses = [
  { id:'course-1', title:'人才选拔与结构化面试实战公开课', subtitle:'把好人才入口，提升面试判断力', category:'02', date:'2026-08-06 09:00 - 08-08 17:00', location:'厦门市中小企业公共服务平台', instructor:'林老师', price:1980, capacity:60, enrolled:48, status:'报名中', description:'围绕人才选拔、结构化面试和面试评价，帮助企业建立可复用的人才识别方法。' },
  { id:'course-2', title:'企业经营管理领军人才训练营', subtitle:'从经营视角看组织与人才', category:'03', date:'2026-08-20 09:00 - 08-21 17:00', location:'厦门软件园二期 B 区', instructor:'陈老师', price:2980, capacity:30, enrolled:28, status:'名额紧张', description:'聚焦经营目标拆解、团队协同与管理者成长，形成可落地的经营动作。' },
  { id:'course-3', title:'企业精益突破之道实战公开课', subtitle:'从流程优化到组织效率提升', category:'04', date:'2026-06-25 09:00 - 06-26 17:00', location:'厦门市中小企业服务中心', instructor:'周老师', price:1680, capacity:50, enrolled:50, status:'已结束', description:'以真实业务场景为案例，拆解流程改善、岗位协同和持续改进的方法。' },
  { id:'course-4', title:'数据驱动的绩效管理实战', subtitle:'让目标、过程和结果真正对齐', category:'05', date:'2026-09-10 09:00 - 09-11 17:00', location:'厦门国际会议中心 3F', instructor:'许老师', price:2280, capacity:45, enrolled:21, status:'报名中', description:'从指标设计、过程辅导到绩效复盘，建立可持续的绩效管理闭环。' },
  { id:'course-5', title:'高效团队沟通与协作工作坊', subtitle:'减少内耗，提升跨团队协同效率', category:'06', date:'2026-09-24 09:00 - 09-24 17:00', location:'厦门软件园创新会议室', instructor:'黄老师', price:1280, capacity:36, enrolled:16, status:'报名中', description:'通过情景演练和团队共创，掌握高效沟通、冲突处理与协作机制。' },
  { id:'course-6', title:'AI 赋能培训管理实战营', subtitle:'用智能工具提升培训运营效率', category:'07', date:'2026-10-15 09:00 - 10-16 17:00', location:'线上直播 + 厦门分会场', instructor:'吴老师', price:2680, capacity:40, enrolled:12, status:'报名中', description:'围绕课程运营、内容生产和数据分析，探索 AI 在培训管理中的落地应用。' },
]
const templates = {
  'course-1': [{ key:'name',label:'姓名',type:'text',required:true },{ key:'phone',label:'手机号',type:'phone',required:true },{ key:'company',label:'公司名称',type:'text',required:true },{ key:'role',label:'职务',type:'text',required:false }],
  'course-2': [{ key:'name',label:'姓名',type:'text',required:true },{ key:'phone',label:'手机号',type:'phone',required:true },{ key:'company',label:'公司名称',type:'text',required:true },{ key:'companySize',label:'企业规模',type:'select',required:true,options:['50人以下','50-200人','200人以上'] }],
  'course-3': [{ key:'name',label:'姓名',type:'text',required:true },{ key:'phone',label:'手机号',type:'phone',required:true },{ key:'company',label:'公司名称',type:'text',required:true }],
  'course-4': [{ key:'name',label:'姓名',type:'text',required:true },{ key:'phone',label:'手机号',type:'phone',required:true },{ key:'role',label:'职务',type:'text',required:false },{ key:'needs',label:'培训诉求',type:'checkbox',required:false,options:['指标设计','绩效辅导','复盘改进'] }],
  'course-5': [{ key:'name',label:'姓名',type:'text',required:true },{ key:'phone',label:'手机号',type:'phone',required:true },{ key:'department',label:'部门',type:'select',required:true,options:['人力资源','业务部门','职能部门'] }],
  'course-6': [{ key:'name',label:'姓名',type:'text',required:true },{ key:'phone',label:'手机号',type:'phone',required:true },{ key:'company',label:'公司名称',type:'text',required:true },{ key:'role',label:'职务',type:'text',required:false }],
}

async function main() {
  const isTest = process.env.NODE_ENV === 'test'
  const passwordHash = hash('123456')
  const users = [
    { id:'u-demo',username:'demo',role:'user',name:'培训用户',company:'厦门六边形人才科技有限公司',avatarText:'六',points:128 },
    { id:'u-admin',username:'admin',role:'admin',name:'系统管理员',company:'六边形培训',avatarText:'管',points:0 },
    { id:'u-operator',username:'operator',role:'operator',name:'运营管理员',company:'六边形培训',avatarText:'运',points:0 },
    ...(isTest ? [
      { id:'u-demo-01',username:'demo01',role:'user',name:'陈晓雯',company:'厦门智汇科技有限公司',avatarText:'陈',points:36 },
      { id:'u-demo-02',username:'demo02',role:'user',name:'林志远',company:'福建远见管理咨询有限公司',avatarText:'林',points:52 },
    ] : [
      { id:'u-demo-01',username:'demo01',role:'user',name:'陈晓雯',company:'厦门智汇科技有限公司',avatarText:'陈',points:36 },
      { id:'u-demo-02',username:'demo02',role:'user',name:'林志远',company:'福建远见管理咨询有限公司',avatarText:'林',points:52 },
      { id:'u-demo-03',username:'demo03',role:'user',name:'黄思敏',company:'厦门海辰新能源科技有限公司',avatarText:'黄',points:18 },
      { id:'u-demo-04',username:'demo04',role:'user',name:'周启明',company:'漳州新航工业有限公司',avatarText:'周',points:74 },
      { id:'u-demo-05',username:'demo05',role:'user',name:'许安然',company:'泉州创想教育科技有限公司',avatarText:'许',points:24 },
      { id:'u-demo-06',username:'demo06',role:'user',name:'吴天成',company:'福州云栖数字科技有限公司',avatarText:'吴',points:91 },
    ]),
  ]
  for (const user of users) await db.user.upsert({ where:{ username:user.username }, create:{ ...user,usernameNormalized:user.username.toLowerCase(),passwordHash,enabled:true }, update:{ passwordHash,role:user.role,name:user.name,company:user.company,avatarText:user.avatarText,enabled:true,usernameNormalized:user.username.toLowerCase() } })
  for (const course of courses) await db.course.upsert({ where:{ id:course.id }, create:course, update:{} })
  const templateDefinitions = [
    { id:'tpl-basic', name:'通用基础报名模板', sourceCourseId:'course-1', courseIds:['course-1','course-3','course-5','course-6'] },
    { id:'tpl-business', name:'经营管理报名模板', sourceCourseId:'course-2', courseIds:['course-2'] },
    { id:'tpl-performance', name:'绩效管理报名模板', sourceCourseId:'course-4', courseIds:['course-4'] },
  ].filter(item => !isTest || ['tpl-basic','tpl-business'].includes(item.id))
  await db.registrationTemplate.deleteMany({ where:{ id:{ in:['tpl-course-1','tpl-course-2','tpl-course-3','tpl-course-4','tpl-course-5','tpl-course-6'] } } })
  for (const template of templateDefinitions) await db.registrationTemplate.upsert({ where:{ id:template.id }, create:{ id:template.id,name:template.name,payload:JSON.stringify(templates[template.sourceCourseId]) }, update:{ name:template.name,payload:JSON.stringify(templates[template.sourceCourseId]) } })
  for (const template of templateDefinitions) for (const courseId of template.courseIds) await db.course.updateMany({ where:{ id:courseId }, data:{ registrationTemplateId:template.id } })
  for (const rule of [
    { id:'rule-2',minPeople:2,discountRate:0.9 },{ id:'rule-3',minPeople:3,discountRate:0.8 },
    ...(isTest ? [] : [
      { id:'rule-4',minPeople:5,discountRate:0.75 },{ id:'rule-5',minPeople:8,discountRate:0.7 },
      { id:'rule-6',minPeople:10,discountRate:0.65 },{ id:'rule-7',minPeople:15,discountRate:0.6 },
    ]),
  ]) await db.discountRule.upsert({ where:{ id:rule.id }, create:{ ...rule,enabled:true }, update:{} })
  for (const item of [
    { id:'banner-1',title:'人才选拔实战公开课',courseId:'course-1',sort:1,enabled:true,startsAt:'2026-07-01',endsAt:'2026-12-31' },
    { id:'banner-2',title:'经营管理领军人才训练营',courseId:'course-2',sort:2,enabled:true,startsAt:'2026-07-01',endsAt:'2026-12-31' },
    { id:'banner-3',title:'精益突破实战公开课',courseId:'course-3',sort:3,enabled:true,startsAt:'2026-07-01',endsAt:'2026-12-31' },
    { id:'banner-4',title:'数据驱动绩效管理',courseId:'course-4',sort:4,enabled:true,startsAt:'2026-07-01',endsAt:'2026-12-31' },
    { id:'banner-5',title:'高效团队沟通工作坊',courseId:'course-5',sort:5,enabled:true,startsAt:'2026-07-01',endsAt:'2026-12-31' },
    { id:'banner-6',title:'AI 赋能培训管理实战营',courseId:'course-6',sort:6,enabled:false,startsAt:'2026-07-01',endsAt:'2026-12-31' },
  ].filter(item => !isTest || item.id === 'banner-1' || item.id === 'banner-2')) await db.banner.upsert({ where:{ id:item.id }, create:{ id:item.id,payload:JSON.stringify(item),enabled:item.enabled,sort:item.sort }, update:{ payload:JSON.stringify(item),enabled:item.enabled,sort:item.sort } })
  const payment = { accountName:'厦门六边形人才科技有限公司',bankName:'招商银行厦门分行',accountNo:'6225 8888 2026 0000',qrCodeText:'MOCK-PAYMENT-QR',onlineWechatEnabled:true,onlineAlipayEnabled:true }
  await db.paymentSetting.upsert({ where:{ id:'default' }, create:{ id:'default',payload:JSON.stringify(payment) }, update:{} })
  for (const item of [
    { id:'msg-1',title:'报名成功通知',channel:'站内信',sentCount:12 },{ id:'msg-2',title:'支付审核提醒',channel:'站内信',sentCount:8 },
    { id:'msg-3',title:'课程开课提醒',channel:'短信（预留）',sentCount:26 },{ id:'msg-4',title:'开票处理完成',channel:'站内信',sentCount:5 },
    { id:'msg-5',title:'反馈处理结果',channel:'邮件（预留）',sentCount:9 },{ id:'msg-6',title:'积分到账通知',channel:'站内信',sentCount:14 },
  ]) await db.message.upsert({ where:{ id:item.id }, create:{ id:item.id,payload:JSON.stringify(item),enabled:true }, update:{ payload:JSON.stringify(item),enabled:true } })
  for (const item of [
    { key:'supportPhone',value:'400-000-0000',description:'客服热线' },{ key:'invoiceDays',value:'7',description:'开票处理时效' },
    { key:'serviceEmail',value:'service@hexagon.training',description:'服务邮箱' },{ key:'orderExpireMinutes',value:'30',description:'待支付订单过期时间（分钟）' },
    { key:'previewRetentionDays',value:'90',description:'课程浏览记录保留天数' },{ key:'maxUploadSizeMb',value:'10',description:'支付凭证最大上传大小（MB）' },
  ]) await db.systemConfig.upsert({ where:{ key:item.key }, create:item, update:{ value:item.value,description:item.description } })
  if (!isTest) {
  const demoPreviews = [
    { courseId:'course-1', viewedAt:'2026-07-24T07:15:11.000Z' },
    { courseId:'course-2', viewedAt:'2026-07-24T07:14:58.000Z' },
    { courseId:'course-3', viewedAt:'2026-07-24T07:14:42.000Z' },
    { courseId:'course-4', viewedAt:'2026-07-24T07:14:21.000Z' },
    { courseId:'course-5', viewedAt:'2026-07-24T07:13:56.000Z' },
    { courseId:'course-6', viewedAt:'2026-07-24T07:13:30.000Z' },
  ]
  for (const [index, item] of demoPreviews.entries()) await db.preview.upsert({ where:{ userId_courseId:{ userId:'u-demo', courseId:item.courseId } }, create:{ id:`PV-DEMO-${index + 1}`, userId:'u-demo', courseId:item.courseId, viewedAt:new Date(item.viewedAt) }, update:{ viewedAt:new Date(item.viewedAt) } })
  const demoOrders = [
    { id:'ORDER-DEMO-001',userId:'u-demo',courseId:'course-1',status:'已支付',paymentMethod:'online',paymentChannel:'wechat',amount:1980,createdAt:'2026-07-18T09:10:00.000Z' },
    { id:'ORDER-DEMO-002',userId:'u-demo-01',courseId:'course-2',status:'待审核',paymentMethod:'offline',paymentChannel:null,amount:2980,createdAt:'2026-07-19T10:20:00.000Z' },
    { id:'ORDER-DEMO-003',userId:'u-demo-02',courseId:'course-4',status:'已支付',paymentMethod:'online',paymentChannel:'alipay',amount:2280,createdAt:'2026-07-20T03:25:00.000Z' },
    { id:'ORDER-DEMO-004',userId:'u-demo-03',courseId:'course-5',status:'待支付',paymentMethod:'online',paymentChannel:'wechat',amount:1280,createdAt:'2026-07-21T06:40:00.000Z' },
    { id:'ORDER-DEMO-005',userId:'u-demo-04',courseId:'course-3',status:'已支付',paymentMethod:'offline',paymentChannel:null,amount:1680,createdAt:'2026-07-22T08:00:00.000Z' },
    { id:'ORDER-DEMO-006',userId:'u-demo-05',courseId:'course-6',status:'已取消',paymentMethod:'online',paymentChannel:'wechat',amount:2680,createdAt:'2026-07-23T02:30:00.000Z' },
    { id:'ORDER-DEMO-007',userId:'u-demo-06',courseId:'course-1',status:'已支付',paymentMethod:'online',paymentChannel:'alipay',amount:1980,createdAt:'2026-07-24T04:15:00.000Z' },
    { id:'ORDER-DEMO-008',userId:'u-demo-01',courseId:'course-5',status:'待支付',paymentMethod:'online',paymentChannel:'wechat',amount:1280,createdAt:'2026-07-25T07:50:00.000Z' },
  ]
  for (const [index, item] of demoOrders.entries()) {
    const participant = { name:`演示学员${index + 1}`, phone:`13900000${String(index + 11).padStart(3, '0')}`, company:`演示企业${index + 1}`, role:index % 2 ? '部门负责人' : '培训经理' }
    await db.order.upsert({ where:{ id:item.id }, create:{ id:item.id,userId:item.userId,courseId:item.courseId,participantCount:1,participants:JSON.stringify([participant]),originalAmount:item.amount,discount:0,amount:item.amount,status:item.status,paymentMethod:item.paymentMethod,paymentChannel:item.paymentChannel,createdAt:new Date(item.createdAt) }, update:{ userId:item.userId,courseId:item.courseId,status:item.status,paymentMethod:item.paymentMethod,paymentChannel:item.paymentChannel,amount:item.amount,participants:JSON.stringify([participant]),createdAt:new Date(item.createdAt) } })
  }
  for (const item of [
    { id:'PROOF-DEMO-001',orderId:'ORDER-DEMO-002',originalName:'企业转账回单-002.png',storedName:'demo-proof-002.png',mimeType:'image/png',size:245760,path:'payment-proofs/demo-proof-002.png',status:'pending',remark:'待财务核验' },
    { id:'PROOF-DEMO-002',orderId:'ORDER-DEMO-005',originalName:'线下支付凭证-005.jpg',storedName:'demo-proof-005.jpg',mimeType:'image/jpeg',size:318400,path:'payment-proofs/demo-proof-005.jpg',status:'approved',remark:'已核验到账' },
  ]) await db.paymentProof.upsert({ where:{ id:item.id }, create:{ ...item,createdAt:new Date('2026-07-22T08:30:00.000Z'),reviewedAt:item.status === 'approved' ? new Date('2026-07-22T10:00:00.000Z') : null }, update:{ status:item.status,remark:item.remark,reviewedAt:item.status === 'approved' ? new Date('2026-07-22T10:00:00.000Z') : null } })
  const demoInvoices = [
    { id:'INV-DEMO-001', title:'厦门六边形人才科技有限公司', taxNo:'91350200DEMO001', email:'finance@example.com', invoiceNo:'XM20260724001', orderIds:['ORDER-DEMO-001'], status:'已开票', createdAt:'2026-07-18T09:20:00.000Z', processedAt:'2026-07-19T03:10:00.000Z' },
    { id:'INV-DEMO-002', title:'演示企业（待处理）', taxNo:'91350200DEMO002', email:'billing@example.com', invoiceNo:'', orderIds:['ORDER-DEMO-002','ORDER-DEMO-003'], status:'待处理', createdAt:'2026-07-22T06:45:00.000Z', processedAt:null },
    { id:'INV-DEMO-003', title:'培训合作单位', taxNo:'91350200DEMO003', email:'accounting@example.com', invoiceNo:'', orderIds:['ORDER-DEMO-004'], status:'已驳回', createdAt:'2026-07-20T02:15:00.000Z', processedAt:'2026-07-21T01:00:00.000Z' },
    { id:'INV-DEMO-004', title:'厦门智汇科技有限公司', taxNo:'91350200DEMO004', email:'finance01@example.com', invoiceNo:'XM20260724004', orderIds:['ORDER-DEMO-003'], status:'已开票', createdAt:'2026-07-23T02:20:00.000Z', processedAt:'2026-07-24T01:15:00.000Z' },
    { id:'INV-DEMO-005', title:'海辰新能源科技有限公司', taxNo:'91350200DEMO005', email:'finance02@example.com', invoiceNo:'', orderIds:['ORDER-DEMO-005'], status:'待处理', createdAt:'2026-07-24T05:40:00.000Z', processedAt:null },
    { id:'INV-DEMO-006', title:'远见管理咨询有限公司', taxNo:'91350200DEMO006', email:'billing02@example.com', invoiceNo:'', orderIds:['ORDER-DEMO-007'], status:'待处理', createdAt:'2026-07-25T08:00:00.000Z', processedAt:null },
  ]
  for (const item of demoInvoices) await db.invoice.upsert({ where:{ id:item.id }, create:{ id:item.id, userId:'u-demo', orderIds:JSON.stringify(item.orderIds), payload:JSON.stringify({ title:item.title, taxNo:item.taxNo, email:item.email, invoiceNo:item.invoiceNo, orderIds:item.orderIds }), status:item.status, createdAt:new Date(item.createdAt), processedAt:item.processedAt ? new Date(item.processedAt) : null }, update:{ userId:'u-demo', orderIds:JSON.stringify(item.orderIds), payload:JSON.stringify({ title:item.title, taxNo:item.taxNo, email:item.email, invoiceNo:item.invoiceNo, orderIds:item.orderIds }), status:item.status, createdAt:new Date(item.createdAt), processedAt:item.processedAt ? new Date(item.processedAt) : null } })
  const demoFeedbacks = [
    { id:'FB-DEMO-009',userId:'u-demo-02',category:'课程内容',content:'希望课程详情能增加课后资料下载入口，便于复习。',status:'待处理' },
    { id:'FB-DEMO-010',userId:'u-demo-03',category:'页面体验',content:'建议在移动端报名页面增加保存草稿提示。',status:'已处理',reply:'感谢建议，已记录到移动端体验优化清单。' },
    { id:'FB-DEMO-011',userId:'u-demo-04',category:'支付问题',content:'线上支付完成后希望能立即看到订单状态变化。',status:'待处理' },
    { id:'FB-DEMO-012',userId:'u-demo-05',category:'发票服务',content:'申请开票时希望支持更多常用抬头信息。',status:'已处理',reply:'已补充抬头信息校验和历史记录展示需求。' },
    { id:'FB-DEMO-001',userId:'u-demo',category:'课程内容',content:'希望增加更多面试案例拆解。',status:'待处理' },
    { id:'FB-DEMO-002',userId:'u-demo-01',category:'报名流程',content:'多人报名时希望支持批量导入。',status:'已处理',reply:'感谢建议，批量导入已列入后续规划。' },
    { id:'FB-DEMO-003',userId:'u-demo-02',category:'支付问题',content:'线下支付凭证审核大约需要多久？',status:'待处理' },
    { id:'FB-DEMO-004',userId:'u-demo-03',category:'课程安排',content:'建议增加周末班次。',status:'已处理',reply:'已记录您的课程时间建议。' },
    { id:'FB-DEMO-005',userId:'u-demo-04',category:'页面体验',content:'课程详情页图片加载速度可以再优化。',status:'待处理' },
    { id:'FB-DEMO-006',userId:'u-demo-05',category:'发票服务',content:'希望支持电子发票下载。',status:'待处理' },
    { id:'FB-DEMO-007',userId:'u-demo-06',category:'积分规则',content:'建议展示积分获得和扣减明细。',status:'已处理',reply:'积分明细已在个人中心开放查询。' },
    { id:'FB-DEMO-008',userId:'u-demo-01',category:'其他',content:'整体使用体验不错，建议增加课程收藏。',status:'待处理' },
  ]
  for (const [index, item] of demoFeedbacks.entries()) await db.feedback.upsert({ where:{ id:item.id }, create:{ id:item.id,userId:item.userId,payload:JSON.stringify({ category:item.category,content:item.content,reply:item.reply || '' }),status:item.status,createdAt:new Date(`2026-07-${String(18 + index).padStart(2, '0')}T05:00:00.000Z`),repliedAt:item.status === '已处理' ? new Date(`2026-07-${String(19 + index).padStart(2, '0')}T05:00:00.000Z`) : null }, update:{ payload:JSON.stringify({ category:item.category,content:item.content,reply:item.reply || '' }),status:item.status,repliedAt:item.status === '已处理' ? new Date(`2026-07-${String(19 + index).padStart(2, '0')}T05:00:00.000Z`) : null } })
  for (const [index, userId] of ['u-demo','u-demo-01','u-demo-02','u-demo-03','u-demo-04','u-demo-05','u-demo-06'].entries()) await db.pointLedger.upsert({ where:{ id:`LEDGER-DEMO-${index + 1}` }, create:{ id:`LEDGER-DEMO-${index + 1}`,userId,points:(index + 1) * 10,reason:index % 2 ? '完成课程反馈' : '报名课程奖励',createdAt:new Date(`2026-07-${String(18 + index).padStart(2, '0')}T06:00:00.000Z`) }, update:{ points:(index + 1) * 10,reason:index % 2 ? '完成课程反馈' : '报名课程奖励' } })
  for (const [index, item] of [
    ['Banner维护','补充演示 Banner 数据'],['课程维护','更新课程基础信息'],['报名模板维护','完善 course-3 报名字段'],['订单审核','审核线下支付凭证'],['开票处理','处理演示开票申请'],['反馈处理','回复课程内容反馈'],['用户维护','启用演示用户'],['积分调整','发放课程参与积分'],['系统配置','更新服务邮箱'],['消息维护','发布开课提醒'],
  ].entries()) await db.auditLog.upsert({ where:{ id:`AUDIT-DEMO-${index + 1}` }, create:{ id:`AUDIT-DEMO-${index + 1}`,actor:index % 3 === 0 ? 'admin' : 'operator',action:item[0],detail:item[1],createdAt:new Date(`2026-07-${String(16 + index).padStart(2, '0')}T07:00:00.000Z`) }, update:{ actor:index % 3 === 0 ? 'admin' : 'operator',action:item[0],detail:item[1] } })
  }
  console.log(`SQLite seed complete: ${filePath}`)
}

main().finally(() => db.$disconnect())
