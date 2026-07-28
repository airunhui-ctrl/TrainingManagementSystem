const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const courses = [
  {
    id: "course-1",
    title: "人才选拔与结构化面试实战公开课",
    subtitle: "把好人才入口，提升面试判断力",
    category: "人才管理",
    date: "2026-08-06 09:00—08-08 17:00",
    location: "厦门市中小企业公共服务平台东侧培训室",
    instructor: "林老师",
    price: 1980,
    originalPrice: 2280,
    seatsLeft: 12,
    capacity: 60,
    status: "报名中",
    cover: "",
    description: "围绕人才选拔、结构化面试和面试评价，帮助企业建立可复用的人才识别方法。"
  },
  {
    id: "course-2",
    title: "企业经营管理领军人才训练营",
    subtitle: "从经营视角看组织与人才",
    category: "经营管理",
    date: "2026-08-20 09:00—08-21 17:00",
    location: "厦门软件园二期 B 区",
    instructor: "陈老师",
    price: 2980,
    originalPrice: 3280,
    seatsLeft: 2,
    capacity: 30,
    status: "名额紧张",
    cover: "alt",
    description: "聚焦经营目标拆解、团队协同与管理者成长，形成可落地的经营动作。"
  },
  {
    id: "course-3",
    title: "企业精益突破之道实战公开课",
    subtitle: "从流程优化到组织效率提升",
    category: "组织效能",
    date: "2026-06-25 09:00—06-26 17:00",
    location: "厦门市中小企业服务中心",
    instructor: "周老师",
    price: 1680,
    originalPrice: 1980,
    seatsLeft: 0,
    capacity: 50,
    status: "已结束",
    cover: "green",
    description: "以真实业务场景为案例，拆解流程改善、岗位协同和持续改进的方法。"
  }
];

const templateFields = [
  { key: "name", label: "真实姓名", placeholder: "请输入姓名", type: "text", required: true },
  { key: "phone", label: "手机号码", placeholder: "请输入手机号", type: "tel", required: true },
  { key: "company", label: "企业名称", placeholder: "请输入企业名称", type: "text", required: true },
  { key: "role", label: "职务", placeholder: "请输入职务", type: "text", required: false },
  { key: "companySize", label: "企业规模", placeholder: "请选择企业规模", type: "select", options: ["1-49人", "50-199人", "200-499人", "500人以上"], required: true }
];

const state = {
  mode: "client",
  route: "home",
  selectedNav: "home",
  selectedCourseId: "course-1",
  selectedCategory: "全部",
  selectedPay: "wechat",
  modal: null,
  toast: "",
  participants: [{ name: "", phone: "", company: "", role: "", companySize: "" }],
  orders: [
    { id: "HX-20260722001", courseId: "course-2", participantCount: 2, amount: 5364, status: "待支付", payment: "待支付", createdAt: "2026-07-22 10:20" },
    { id: "HX-20260721008", courseId: "course-1", participantCount: 1, amount: 1980, status: "已支付", payment: "微信支付", createdAt: "2026-07-21 14:08" }
  ],
  invoices: [{ id: "INV-202607-002", title: "厦门六边形人才科技有限公司", amount: 1980, status: "待开票", createdAt: "2026-07-21" }],
  adminSection: "dashboard"
};

const formatMoney = (value) => `¥${Number(value).toLocaleString("zh-CN")}`;
const selectedCourse = () => courses.find((course) => course.id === state.selectedCourseId) || courses[0];
const discountRate = (count) => count >= 3 ? 0.8 : count >= 2 ? 0.9 : 1;
const calculateTotal = () => {
  const course = selectedCourse();
  const subtotal = course.price * state.participants.length;
  return { subtotal, rate: discountRate(state.participants.length), total: Math.round(subtotal * discountRate(state.participants.length)), saved: subtotal - Math.round(subtotal * discountRate(state.participants.length)) };
};
const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function courseCard(course) {
  const soldOut = course.seatsLeft === 0;
  return `<article class="course-card">
    <div class="course-cover ${course.cover}">
      <span class="cover-label">${escapeHtml(course.category)}</span>
      ${course.status === "名额紧张" ? `<span class="course-status">名额紧张</span>` : ""}
      <div class="cover-title">${escapeHtml(course.title)}</div>
    </div>
    <div class="course-body">
      <h3>${escapeHtml(course.title)}</h3>
      <p class="course-subtitle">${escapeHtml(course.subtitle)}</p>
      <div class="meta-row"><span class="meta-item">◷ ${escapeHtml(course.date.split("—")[0])}</span><span class="meta-item">⌖ ${escapeHtml(course.location)}</span><span class="meta-item">👤 ${course.capacity - course.seatsLeft}人已报名</span></div>
      <div class="course-footer"><div class="price">${formatMoney(course.price)} <small>起</small></div><button class="primary-btn" data-action="detail" data-id="${course.id}" ${soldOut ? "disabled" : ""}>${soldOut ? "已结束" : "查看详情"}</button></div>
    </div>
  </article>`;
}

function renderClient() {
  const content = state.route === "home" ? renderHome() : state.route === "detail" ? renderDetail() : state.route === "register" ? renderRegister() : state.route === "payment" ? renderPayment() : state.route === "business" ? renderBusiness() : renderMine();
  return `<div class="mobile-stage"><div class="phone">
    <header class="mobile-topbar"><div class="brand">六边形培训</div><div class="top-actions"><button class="icon-btn" data-action="toast" data-message="搜索功能已预留">⌕</button><button class="icon-btn" data-action="toast" data-message="更多菜单已预留">☰</button></div></header>
    <main class="mobile-content">${content}</main>
    ${["home", "business", "mine"].includes(state.route) ? `<nav class="bottom-nav"><button class="nav-item ${state.route === "home" ? "active" : ""}" data-action="nav" data-route="home"><strong>⌂</strong><span>课程</span></button><button class="nav-item ${state.route === "business" ? "active" : ""}" data-action="nav" data-route="business"><strong>▣</strong><span>业务</span></button><button class="nav-item ${state.route === "mine" ? "active" : ""}" data-action="nav" data-route="mine"><strong>◎</strong><span>我的</span></button></nav>` : ""}
    ${state.modal ? renderModal() : ""}
  </div></div>`;
}

function renderHome() {
  const categories = ["全部", ...new Set(courses.map((course) => course.category))];
  const visible = state.selectedCategory === "全部" ? courses : courses.filter((course) => course.category === state.selectedCategory);
  return `<section class="hero"><div class="hero-copy"><p class="hero-kicker">厦门六边形人才科技有限公司</p><h1>让每一次学习<br/>都靠近组织成长</h1><p>活动 · 培训 · 人才发展</p></div><button class="hero-cta" data-action="toast" data-message="更多活动即将上线">立即学习 →</button></section>
    <div class="section-head"><h2>平台课程</h2><button class="text-button" data-action="toast" data-message="课程已全部展示">更多课程</button></div>
    <div class="chips">${categories.map((category) => `<button class="chip ${state.selectedCategory === category ? "active" : ""}" data-action="category" data-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`).join("")}</div>
    <section class="course-list">${visible.map(courseCard).join("")}</section>`;
}

function renderDetail() {
  const course = selectedCourse();
  return `<div class="back-row"><button data-action="nav" data-route="home">←</button><strong>课程详情</strong></div>
    <div class="detail-hero"><h1>${escapeHtml(course.title)}</h1></div>
    <section class="detail-content"><h2>${escapeHtml(course.title)}</h2><p class="detail-description">${escapeHtml(course.description)}</p>
      <div class="detail-grid"><div class="detail-row"><div class="detail-icon">◷</div><p><small>培训时间</small>${escapeHtml(course.date)}</p></div><div class="detail-row"><div class="detail-icon">⌖</div><p><small>培训地点</small>${escapeHtml(course.location)}</p></div><div class="detail-row"><div class="detail-icon">👤</div><p><small>报名情况</small>已报名 ${course.capacity - course.seatsLeft} 人，剩余 ${course.seatsLeft} 个名额</p></div><div class="detail-row"><div class="detail-icon">¥</div><p><small>课程费用</small>${formatMoney(course.price)} / 人 · 2人报名 9折，3人报名 8折</p></div></div>
      <div class="form-card"><h3>课程亮点</h3><p class="detail-description">用案例、练习和行动计划，把课程内容转化为团队下一步可执行的动作。</p></div>
    </section><div class="sticky-cta"><div class="sum"><span>费用</span><b>${formatMoney(course.price)}</b></div><button class="primary-btn" data-action="register" ${course.seatsLeft === 0 ? "disabled" : ""}>${course.seatsLeft === 0 ? "报名已结束" : "我要报名"}</button></div>`;
}

function renderRegister() {
  const total = calculateTotal();
  return `<div class="back-row"><button data-action="nav" data-route="detail">←</button><strong>填写报名信息</strong></div><section class="form-page">
      ${state.participants.map((participant, index) => `<div class="form-card"><div class="participant-head"><h3>报名人员 ${index + 1}</h3>${index > 0 ? `<button class="remove-btn" data-action="remove-participant" data-index="${index}">删除</button>` : ""}</div>${templateFields.map((field) => `<div class="field"><label>${field.label}${field.required ? " <em>*</em>" : ""}</label>${field.type === "select" ? `<select data-field="${field.key}" data-index="${index}"><option value="">${field.placeholder}</option>${field.options.map((option) => `<option ${participant[field.key] === option ? "selected" : ""}>${option}</option>`).join("")}</select>` : `<input type="${field.type}" placeholder="${field.placeholder}" value="${escapeHtml(participant[field.key])}" data-field="${field.key}" data-index="${index}" />`}</div>`).join("")}</div>`).join("")}
      <button class="add-participant" data-action="add-participant">＋ 添加报名人员</button>
      <div class="form-card"><h3>费用试算</h3><div class="discount-box"><span>${state.participants.length} 人报名</span><strong>${total.saved ? `已优惠 ${formatMoney(total.saved)}` : "暂未使用优惠"}</strong></div><div class="total-box"><span>应付金额</span><b>${formatMoney(total.total)}</b></div></div>
      <button class="primary-btn full-btn" data-action="submit-register">确认报名并生成账单</button>
    </section>`;
}

function renderPayment() {
  const order = state.orders[0];
  const course = courses.find((item) => item.id === order.courseId) || selectedCourse();
  return `<div class="back-row"><button data-action="nav" data-route="business">←</button><strong>确认支付</strong></div><section class="payment-page"><div class="payment-total"><small>待支付账单 · ${escapeHtml(order.id)}</small><strong>${formatMoney(order.amount)}</strong></div><div class="record-card"><div class="record-top"><h3>${escapeHtml(course.title)}</h3><span class="status warning">待支付</span></div><div class="record-meta"><span>${order.participantCount} 位报名人员</span><span>生成时间 ${order.createdAt}</span></div></div><h3>选择支付方式</h3><div class="pay-option ${state.selectedPay === "wechat" ? "selected" : ""}" data-action="pay-method" data-method="wechat"><div class="pay-icon">微</div><div><strong>微信支付</strong><small>模拟支付，便于 MVP 演示</small></div><div class="radio"></div></div><div class="pay-option alipay ${state.selectedPay === "alipay" ? "selected" : ""}" data-action="pay-method" data-method="alipay"><div class="pay-icon">支</div><div><strong>支付宝</strong><small>模拟支付，便于 MVP 演示</small></div><div class="radio"></div></div><div class="pay-option ${state.selectedPay === "offline" ? "selected" : ""}" data-action="pay-method" data-method="offline"><div class="pay-icon" style="background:#f59e0b">线</div><div><strong>线下支付</strong><small>提交付款截图后由后台审核</small></div><div class="radio"></div></div><button class="primary-btn full-btn" style="margin-top:22px" data-action="pay">${state.selectedPay === "offline" ? "提交线下支付凭证" : "立即模拟支付"}</button></section>`;
}

function renderBusiness() {
  const paid = state.orders.filter((order) => order.status === "已支付");
  return `<section class="business-page"><div class="section-head" style="padding-left:0;padding-right:0"><h2>我的业务</h2><button class="text-button" data-action="toast" data-message="开票功能已预留">开票</button></div><div class="tab-row"><button class="tab active">课程记录</button><button class="tab">支付记录</button><button class="tab">开票记录</button></div>${state.orders.map((order) => { const course = courses.find((item) => item.id === order.courseId); return `<div class="record-card"><div class="record-top"><h3>${escapeHtml(course?.title || "培训课程")}</h3><span class="status ${order.status === "已支付" ? "success" : "warning"}">${order.status}</span></div><div class="record-meta"><span>${order.participantCount} 位报名人员</span><span>${formatMoney(order.amount)}</span><span>${order.id}</span></div><div class="record-actions">${order.status === "待支付" ? `<button class="primary-btn" data-action="payment">继续支付</button>` : `<button class="secondary-btn" data-action="toast" data-message="已支付订单可选择开票">申请开票</button>`}</div></div>`; }).join("")}<div class="record-card"><div class="record-top"><h3>开票申请</h3><span class="status">${state.invoices[0]?.status || "暂无"}</span></div><div class="record-meta"><span>${state.invoices[0]?.title || "暂无开票信息"}</span><span>${formatMoney(state.invoices[0]?.amount || 0)}</span></div></div></section>`;
}

function renderMine() {
  return `<section class="mine-page"><div class="profile-card"><div class="profile-head"><div class="avatar">六</div><div><h2>六边形用户</h2><p>厦门六边形人才科技有限公司</p></div></div><div class="profile-stats"><div><b>128</b><span>我的积分</span></div><div><b>2</b><span>已报名课程</span></div></div></div><div class="menu-card"><button class="menu-row" data-action="toast" data-message="个人资料编辑已预留"><span class="menu-icon">◎</span><span>个人信息</span><span>›</span></button><button class="menu-row" data-action="toast" data-message="密码修改已预留"><span class="menu-icon">♢</span><span>账号与安全</span><span>›</span></button><button class="menu-row" data-action="toast" data-message="积分明细已预留"><span class="menu-icon">✦</span><span>我的积分</span><span>›</span></button><button class="menu-row" data-action="toast" data-message="问题反馈已预留"><span class="menu-icon">？</span><span>问题反馈</span><span>›</span></button></div></section>`;
}

function renderModal() {
  return `<div class="modal-backdrop" data-action="close-modal"><div class="sheet" data-stop-propagation="true"><div class="sheet-head"><h2>${state.modal === "login" ? "欢迎来到六边形培训" : "操作确认"}</h2><button class="close-btn" data-action="close-modal">×</button></div>${state.modal === "login" ? `<p class="detail-description">这是 MVP 的登录占位，后续接入微信授权或手机号验证码。</p><div class="field"><label>手机号</label><input placeholder="请输入手机号" /></div><button class="primary-btn full-btn" data-action="login">进入体验</button>` : `<p class="detail-description">该能力已在产品规划中保留接口边界，当前版本使用模拟数据。</p><button class="primary-btn full-btn" data-action="close-modal">知道了</button>`}</div></div>`;
}

function adminNav() {
  const items = [["dashboard", "⌂", "工作台"], ["courses", "▣", "课程管理"], ["templates", "◇", "报名模板"], ["enrollments", "☷", "报名管理"], ["orders", "¥", "订单与支付"], ["invoices", "▤", "开票管理"]];
  return items.map(([key, icon, label]) => `<button class="${state.adminSection === key ? "active" : ""}" data-action="admin-nav" data-section="${key}"><span>${icon}</span>${label}</button>`).join("");
}

function renderAdmin() {
  const titles = { dashboard: "工作台", courses: "课程管理", templates: "报名模板管理", enrollments: "报名管理", orders: "订单与支付", invoices: "开票管理" };
  return `<div class="admin-shell"><aside class="admin-sidebar"><div class="admin-brand"><span class="brand-mark">六</span><span>六边形培训</span></div><nav class="admin-nav">${adminNav()}</nav></aside><main class="admin-main"><header class="admin-header"><div><h1>${titles[state.adminSection]}</h1><p>厦门六边形人才科技有限公司 · 培训运营后台</p></div><div class="admin-profile"><div class="avatar">管</div><span>运营管理员</span></div></header>${state.adminSection === "dashboard" ? renderAdminDashboard() : state.adminSection === "courses" ? renderAdminCourses() : state.adminSection === "templates" ? renderAdminTemplates() : state.adminSection === "enrollments" ? renderAdminEnrollments() : state.adminSection === "orders" ? renderAdminOrders() : renderAdminInvoices()}</main></div>`;
}

function renderAdminDashboard() {
  const pending = state.orders.filter((order) => order.status === "待支付").length;
  return `<section class="kpi-grid"><div class="kpi"><div class="kpi-top"><span>开展课程</span><span class="kpi-icon">▣</span></div><strong>12</strong><small>较上月 +2</small></div><div class="kpi"><div class="kpi-top"><span>报名人数</span><span class="kpi-icon">♧</span></div><strong>286</strong><small>本月 +18%</small></div><div class="kpi"><div class="kpi-top"><span>待支付订单</span><span class="kpi-icon">¥</span></div><strong>${pending + 7}</strong><small>需要跟进</small></div><div class="kpi"><div class="kpi-top"><span>待开票申请</span><span class="kpi-icon">▤</span></div><strong>${state.invoices.filter((invoice) => invoice.status === "待开票").length + 3}</strong><small>财务待处理</small></div></section><section class="panel"><div class="panel-head"><h2>今日待办</h2><button class="secondary-btn" data-action="toast" data-message="待办已全部展示">查看全部</button></div><div class="record-card" style="box-shadow:none;border:1px solid var(--line);"><div class="record-top"><h3>线下支付凭证待审核</h3><span class="status warning">3 条</span></div><div class="record-meta"><span>最近提交：企业经营管理领军人才训练营</span><span>需要财务确认</span></div><div class="record-actions"><button class="primary-btn" data-action="admin-nav" data-section="orders">立即处理</button></div></div><div class="record-card" style="box-shadow:none;border:1px solid var(--line);"><div class="record-top"><h3>开票申请待处理</h3><span class="status">4 条</span></div><div class="record-meta"><span>涉及金额 ${formatMoney(1980 * 4)}</span><span>最近申请：2026-07-21</span></div><div class="record-actions"><button class="secondary-btn" data-action="admin-nav" data-section="invoices">进入开票管理</button></div></div></section><section class="panel"><div class="panel-head"><h2>课程报名概览</h2><button class="text-button" data-action="admin-nav" data-section="courses">管理课程</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>课程</th><th>报名人数</th><th>支付人数</th><th>剩余名额</th><th>状态</th></tr></thead><tbody>${courses.map((course) => `<tr><td>${escapeHtml(course.title)}</td><td>${course.capacity - course.seatsLeft}</td><td>${Math.max(0, course.capacity - course.seatsLeft - 3)}</td><td><div class="mini-progress"><span style="width:${Math.max(0, course.seatsLeft / course.capacity * 100)}%"></span></div></td><td><span class="status ${course.status === "报名中" ? "success" : course.status === "名额紧张" ? "danger" : "warning"}">${course.status}</span></td></tr>`).join("")}</tbody></table></div></section>`;
}

function renderAdminCourses() {
  return `<section class="panel"><div class="panel-head"><div class="toolbar"><input placeholder="搜索课程名称" /><select><option>全部状态</option><option>报名中</option><option>已结束</option></select></div><button class="primary-btn" data-action="toast" data-message="新建课程表单已预留">＋ 新建课程</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>课程名称</th><th>分类</th><th>时间</th><th>价格</th><th>报名/名额</th><th>状态</th><th>操作</th></tr></thead><tbody>${courses.map((course) => `<tr><td><strong>${escapeHtml(course.title)}</strong><br/><small>${escapeHtml(course.subtitle)}</small></td><td>${escapeHtml(course.category)}</td><td>${escapeHtml(course.date.split("—")[0])}</td><td>${formatMoney(course.price)}</td><td>${course.capacity - course.seatsLeft}/${course.capacity}</td><td><span class="status ${course.status === "报名中" ? "success" : course.status === "名额紧张" ? "danger" : "warning"}">${course.status}</span></td><td><button class="text-button" data-action="detail" data-id="${course.id}">查看</button></td></tr>`).join("")}</tbody></table></div></section>`;
}

function renderAdminTemplates() {
  return `<section class="panel"><div class="panel-head"><h2>报名模板</h2><button class="primary-btn" data-action="toast" data-message="模板编辑器已预留">＋ 新建模板</button></div><div class="course-list" style="padding:0;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));"><div class="record-card"><div class="record-top"><h3>通用企业报名模板</h3><span class="status success">启用中</span></div><div class="record-meta"><span>5 个字段</span><span>已关联 2 门课程</span></div><div class="record-actions"><button class="secondary-btn" data-action="toast" data-message="模板预览已预留">预览</button><button class="primary-btn" data-action="toast" data-message="模板字段编辑已预留">编辑</button></div></div><div class="record-card"><div class="record-top"><h3>管理者训练营模板</h3><span class="status success">启用中</span></div><div class="record-meta"><span>7 个字段</span><span>已关联 1 门课程</span></div><div class="record-actions"><button class="secondary-btn" data-action="toast" data-message="模板预览已预留">预览</button><button class="primary-btn" data-action="toast" data-message="模板字段编辑已预留">编辑</button></div></div></div></section>`;
}

function renderAdminEnrollments() {
  return `<section class="panel"><div class="panel-head"><div class="toolbar"><input placeholder="按课程/姓名/手机号查询" /><select><option>全部支付状态</option><option>已支付</option><option>未支付</option></select></div><button class="secondary-btn" data-action="toast" data-message="报名数据导出已预留">导出数据</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>报名编号</th><th>课程</th><th>报名人</th><th>人数</th><th>金额</th><th>支付状态</th><th>提交时间</th></tr></thead><tbody><tr><td>ENR-20260722001</td><td>企业经营管理领军人才训练营</td><td>艾润辉</td><td>2</td><td>${formatMoney(5364)}</td><td><span class="status warning">待支付</span></td><td>2026-07-22 10:20</td></tr><tr><td>ENR-20260721008</td><td>人才选拔与结构化面试实战公开课</td><td>林晓敏</td><td>1</td><td>${formatMoney(1980)}</td><td><span class="status success">已支付</span></td><td>2026-07-21 14:08</td></tr></tbody></table></div></section>`;
}

function renderAdminOrders() {
  return `<section class="panel"><div class="panel-head"><div class="toolbar"><input placeholder="搜索订单号/用户" /><select><option>全部订单</option><option>待支付</option><option>已支付</option><option>待审核</option></select></div><button class="secondary-btn" data-action="toast" data-message="对账导出已预留">导出对账</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>订单号</th><th>课程</th><th>报名人数</th><th>实付金额</th><th>支付方式</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.orders.map((order) => { const course = courses.find((item) => item.id === order.courseId); return `<tr><td>${order.id}</td><td>${escapeHtml(course?.title || "")}</td><td>${order.participantCount}</td><td>${formatMoney(order.amount)}</td><td>${order.payment}</td><td><span class="status ${order.status === "已支付" ? "success" : "warning"}">${order.status}</span></td><td>${order.status === "待支付" ? `<button class="primary-btn" data-action="review-order" data-id="${order.id}">标记已支付</button>` : `<button class="text-button" data-action="toast" data-message="订单详情已预留">查看详情</button>`}</td></tr>`; }).join("")}</tbody></table></div></section>`;
}

function renderAdminInvoices() {
  return `<section class="panel"><div class="panel-head"><div class="toolbar"><input placeholder="搜索申请编号/抬头" /><select><option>全部状态</option><option>待开票</option><option>已开票</option><option>已驳回</option></select></div><button class="secondary-btn" data-action="toast" data-message="开票记录导出已预留">导出记录</button></div><div class="table-scroll"><table class="data-table"><thead><tr><th>申请编号</th><th>发票抬头</th><th>金额</th><th>提交时间</th><th>状态</th><th>操作</th></tr></thead><tbody>${state.invoices.map((invoice) => `<tr><td>${invoice.id}</td><td>${escapeHtml(invoice.title)}</td><td>${formatMoney(invoice.amount)}</td><td>${invoice.createdAt}</td><td><span class="status ${invoice.status === "已开票" ? "success" : "warning"}">${invoice.status}</span></td><td>${invoice.status === "待开票" ? `<button class="primary-btn" data-action="review-invoice" data-id="${invoice.id}">标记已开票</button>` : `<button class="text-button" data-action="toast" data-message="发票详情已预留">查看详情</button>`}</td></tr>`).join("")}</tbody></table></div></section>`;
}

function render() {
  const root = $("#app");
  root.innerHTML = `<div class="app-shell"><div class="mode-switch"><button class="${state.mode === "client" ? "active" : ""}" data-action="mode" data-mode="client">C端小程序</button><button class="${state.mode === "admin" ? "active" : ""}" data-action="mode" data-mode="admin">平台管理端</button></div>${state.mode === "client" ? renderClient() : renderAdmin()}<div class="toast ${state.toast ? "show" : ""}">${escapeHtml(state.toast)}</div></div>`;
}

function toast(message) {
  state.toast = message;
  render();
  window.clearTimeout(toast.timer);
  toast.timer = window.setTimeout(() => { state.toast = ""; render(); }, 2200);
}

function updateParticipant(index, key, value) {
  state.participants[index][key] = value;
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  if (target.dataset.stopPropagation === "true") event.stopPropagation();
  const action = target.dataset.action;
  if (action === "mode") { state.mode = target.dataset.mode; state.modal = null; render(); }
  if (action === "nav") { state.route = target.dataset.route; state.modal = null; render(); }
  if (action === "category") { state.selectedCategory = target.dataset.category; render(); }
  if (action === "detail") { state.selectedCourseId = target.dataset.id; state.route = "detail"; state.mode = "client"; render(); }
  if (action === "register") { state.route = "register"; state.participants = [{ name: "", phone: "", company: "", role: "", companySize: "" }]; render(); }
  if (action === "add-participant") { state.participants.push({ name: "", phone: "", company: "", role: "", companySize: "" }); render(); }
  if (action === "remove-participant") { state.participants.splice(Number(target.dataset.index), 1); render(); }
  if (action === "submit-register") {
    const required = templateFields.filter((field) => field.required);
    const invalid = state.participants.some((participant) => required.some((field) => !participant[field.key]));
    if (invalid) { toast("请先填写所有必填报名信息"); return; }
    const total = calculateTotal();
    state.orders.unshift({ id: `HX-${Date.now().toString().slice(-8)}`, courseId: state.selectedCourseId, participantCount: state.participants.length, amount: total.total, status: "待支付", payment: "待支付", createdAt: new Date().toLocaleString("zh-CN", { hour12: false }) });
    state.route = "payment"; toast("报名信息已提交，账单已生成");
  }
  if (action === "payment") { state.route = "payment"; render(); }
  if (action === "pay-method") { state.selectedPay = target.dataset.method; render(); }
  if (action === "pay") {
    if (state.selectedPay === "offline") { state.orders[0].status = "待审核"; state.orders[0].payment = "线下支付"; toast("凭证已提交，等待后台审核"); }
    else { state.orders[0].status = "已支付"; state.orders[0].payment = state.selectedPay === "wechat" ? "微信支付" : "支付宝"; toast("模拟支付成功"); }
    state.route = "business"; render();
  }
  if (action === "admin-nav") { state.mode = "admin"; state.adminSection = target.dataset.section; render(); }
  if (action === "review-order") { const order = state.orders.find((item) => item.id === target.dataset.id); if (order) { order.status = "已支付"; order.payment = "线下审核通过"; toast("订单已审核通过"); } render(); }
  if (action === "review-invoice") { const invoice = state.invoices.find((item) => item.id === target.dataset.id); if (invoice) { invoice.status = "已开票"; toast("开票状态已更新"); } render(); }
  if (action === "toast") toast(target.dataset.message || "该功能已预留");
  if (action === "close-modal") { state.modal = null; render(); }
  if (action === "login") { state.modal = null; toast("已进入演示环境"); }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!target.matches("[data-field]")) return;
  updateParticipant(Number(target.dataset.index), target.dataset.field, target.value);
});
document.addEventListener("change", (event) => {
  const target = event.target;
  if (!target.matches("[data-field]")) return;
  updateParticipant(Number(target.dataset.index), target.dataset.field, target.value);
});

render();
