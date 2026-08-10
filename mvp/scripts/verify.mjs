import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '..')
const staticRoot = path.join(projectRoot, 'mvp', 'static-demo')
const required = [
  'frontend/client-uni/src/App.vue',
  'frontend/client-uni/src/pages/index/index.vue',
  'frontend/client-uni/src/pages/register/register.vue',
  'frontend/client-uni/src/pages/business/business.vue',
  'frontend/client-uni/src/common/api.ts',
  'frontend/client-uni/src/common/auth.ts',
  'frontend/admin-react/src/App.tsx',
  'frontend/admin-react/src/api.ts',
  'backend/api/src/auth/auth.service.ts',
  'backend/api/src/auth/jwt.guard.ts',
  'backend/api/src/mvp/mvp.controller.ts',
  'backend/api/src/mvp/mvp.service.ts'
]

for (const file of required) await fs.access(path.join(projectRoot, file))
const staticApp = await fs.readFile(path.join(staticRoot, 'app.js'), 'utf8')
const clientApp = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/App.vue'), 'utf8')
const clientConfirm = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/common/confirm.ts'), 'utf8')
const clientModalLayer = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/common/modal-layer.ts'), 'utf8')
const adminApp = await fs.readFile(path.join(projectRoot, 'frontend/admin-react/src/App.tsx'), 'utf8')
const adminStyles = await fs.readFile(path.join(projectRoot, 'frontend/admin-react/src/styles.css'), 'utf8')
const clientApi = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/common/api.ts'), 'utf8')
const clientBusiness = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/pages/business/business.vue'), 'utf8')
const clientDetail = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/pages/detail/detail.vue'), 'utf8')
const clientMessages = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/pages/messages/messages.vue'), 'utf8')
const clientMine = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/pages/mine/mine.vue'), 'utf8')
const clientStudents = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/pages/students/students.vue'), 'utf8')
const clientErrorPages = await Promise.all([
  'frontend/client-uni/src/pages/index/index.vue',
  'frontend/client-uni/src/pages/detail/detail.vue',
  'frontend/client-uni/src/pages/business/business.vue',
  'frontend/client-uni/src/pages/messages/messages.vue',
  'frontend/client-uni/src/pages/students/students.vue',
  'frontend/client-uni/src/pages/register/register.vue',
  'frontend/client-uni/src/pages/mine/mine.vue'
].map((file) => fs.readFile(path.join(projectRoot, file), 'utf8')))
const clientModalPages = await Promise.all([
  'frontend/client-uni/src/pages/business/business.vue',
  'frontend/client-uni/src/pages/messages/messages.vue',
  'frontend/client-uni/src/pages/mine/mine.vue',
  'frontend/client-uni/src/pages/register/register.vue',
  'frontend/client-uni/src/pages/students/students.vue'
].map((file) => fs.readFile(path.join(projectRoot, file), 'utf8')))
const clientConfirmationPages = await Promise.all([
  'frontend/client-uni/src/pages/business/business.vue',
  'frontend/client-uni/src/pages/mine/mine.vue',
  'frontend/client-uni/src/pages/register/register.vue',
  'frontend/client-uni/src/pages/students/students.vue'
].map((file) => fs.readFile(path.join(projectRoot, file), 'utf8')))
const serverGuard = await fs.readFile(path.join(projectRoot, 'backend/api/src/auth/jwt.guard.ts'), 'utf8')
const mvpController = await fs.readFile(path.join(projectRoot, 'backend/api/src/mvp/mvp.controller.ts'), 'utf8')
const compose = await fs.readFile(path.join(projectRoot, 'docker-compose.yml'), 'utf8')
const releaseSmoke = await fs.readFile(path.join(projectRoot, 'Docs/runtime/verify-compose-release.sh'), 'utf8')
const staticFiles = await Promise.all(['index.html', 'app.js', 'styles.css'].map((file) => fs.access(path.join(staticRoot, file)).then(() => true)))
const clientModalMaskBEMBlock = clientApp.match(/html body > #u-a-m > uni-modal > \.uni-modal__mask,[\s\S]*?pointer-events: auto !important;/)?.[0] || ''
const checks = {
  requiredFiles: required.length + 3,
  staticFilesPresent: staticFiles.every(Boolean),
  clientHasBearerInjection: clientApi.includes('Authorization: `Bearer ${accessToken}`'),
  serverHasJwtVerify: serverGuard.includes('this.jwt.verify<') || serverGuard.includes('this.jwt.verify('),
  apiHasMvpRoutes: ["'courses'", "'orders/quote'", "'invoices'", "'admin/dashboard'"].every((route) => mvpController.includes(route)),
  apiHealthAndComposeProbe: mvpController.includes("@Get('health')") && mvpController.includes('ServiceUnavailableException') && compose.includes("http://127.0.0.1:3100/api/health") && releaseSmoke.includes("http://127.0.0.1:3100/api/health"),
  staticHasRegistration: staticApp.includes('submit-register'),
  staticHasAdminMode: staticApp.includes('平台管理端'),
  clientModalLayersAreOrdered: clientApp.includes('--client-business-modal-layer: 90') && clientApp.includes('--client-toast-layer: 2000') && clientApp.includes('--client-system-modal-root-layer: 2147483000') && clientApp.includes('--client-system-modal-layer: 2147483000') && clientApp.includes('--client-system-modal-mask-layer: 2147483001') && clientApp.includes('--client-system-modal-content-layer: 2147483002') && clientApp.includes('--client-system-modal-dialog-layer: 2147483002') && clientApp.includes('isSystemModalMaskNode') && clientApp.includes('isSystemModalContentNode') && clientApp.includes('enforceSystemModalLayer') && clientApp.includes('installSystemModalLayerGuard') && clientApp.includes('onMounted(installSystemModalLayerGuard)') && clientApp.includes('MutationObserver') && clientApp.includes('normalizeDirectSystemModalNode') && clientApp.includes('#u-a-m') && (clientApp.includes('document.body.appendChild(host)') || clientApp.includes('document.body.appendChild(root)')) && clientApp.includes('#u-a-t') && clientApp.includes("data-type='systemDialog'") && clientApp.includes("#u-a-t > uni-modal") && clientApp.includes("#u-a-t > .uni-modal") && clientApp.includes("html body #u-a-t [role='dialog']") && clientApp.includes("data-client-system-modal-layer='content'") && clientApp.includes('uni-modal > .uni-mask') && clientApp.includes('uni-modal > .uni-modal') && clientApp.includes('uni-modal__mask') && clientApp.includes('uni-modal__container') && clientApp.includes('uni-page[data-type=\'systemDialog\'] > uni-page-wrapper') && clientApp.includes('uni-modal-dialog') && clientApp.includes("html body #u-a-m > uni-modal") && clientApp.includes("html body #u-a-m > uni-modal,\nhtml body #u-a-m > [data-type='systemDialog']") && clientApp.includes("[class*='uni-modal-dialog']:not([class*='mask'])") && clientApp.includes('position: fixed !important') && clientApp.includes('transform: translate(-50%, -50%) !important') && clientApp.includes('pointer-events: none !important') && !clientApp.includes("html body #u-a-m > * {\n  position: fixed !important;") && !clientApp.includes("classTokens.some((token) => /modal|dialog/i.test(token))"),
  clientModalBEMMaskAndContentAreSeparated: clientModalMaskBEMBlock.length > 0 && !clientModalMaskBEMBlock.includes('.uni-modal__container') && clientApp.includes("html body > #u-a-m > uni-modal > .uni-modal__container") && clientApp.includes('z-index: var(--client-system-modal-mask-layer)') && clientApp.includes('z-index: var(--client-system-modal-content-layer)'),
  clientModalContentVariantsAreCovered: ['uni-modal__content', 'uni-modal-content', 'modal-content', 'dialog-content'].every((token) => clientApp.includes(token)) && clientApp.includes('CLIENT_SYSTEM_MODAL_CONTENT_LAYER') && clientApp.includes('isSystemModalContentNode'),
  clientConfirmationPagesUseSharedConfirm: clientConfirmationPages.every((source) => source.includes('showClientConfirm')) && clientConfirm.includes('getConfirmHost') && clientConfirm.includes('getConfirmHost().append(root)') && clientConfirm.includes('CLIENT_CONFIRM_ROOT_LAYER') && clientConfirm.includes('CLIENT_CONFIRM_MASK_LAYER') && clientConfirm.includes('CLIENT_CONFIRM_CONTENT_LAYER'),
  clientModalLayerConstantsAreShared: clientModalLayer.includes('CLIENT_SYSTEM_MODAL_ROOT_LAYER = 2147483000') && clientModalLayer.includes('CLIENT_SYSTEM_MODAL_MASK_LAYER = 2147483001') && clientModalLayer.includes('CLIENT_SYSTEM_MODAL_CONTENT_LAYER = 2147483002') && clientModalLayer.includes('CLIENT_CONFIRM_ROOT_LAYER = 2147483645') && clientModalLayer.includes('CLIENT_CONFIRM_MASK_LAYER = 2147483646') && clientModalLayer.includes('CLIENT_CONFIRM_CONTENT_LAYER = 2147483647') && clientConfirm.includes("from './modal-layer'") && clientApp.includes("from './common/modal-layer'"),
  clientConfirmInlineLayersAreImportant: [
    "root.style.setProperty('z-index', String(CLIENT_CONFIRM_ROOT_LAYER), 'important')",
    "mask.style.setProperty('z-index', String(CLIENT_CONFIRM_MASK_LAYER), 'important')",
    "dialog.style.setProperty('z-index', String(CLIENT_CONFIRM_CONTENT_LAYER), 'important')",
  ].every((token) => clientConfirm.includes(token)) && clientConfirm.includes('const enforceConfirmLayer') && clientConfirm.includes('window.requestAnimationFrame') && clientConfirm.includes('window.setTimeout(() => { if (activeConfirm?.root === root) enforceConfirmLayer(root) }, 32)'),
  clientConfirmUsesFixedHtmlPortal: clientConfirm.includes("const root = document.createElement('div')") && clientConfirm.includes('const getConfirmHost = () => document.documentElement') && clientConfirm.includes('getConfirmHost().append(root)') && clientApp.includes('document.documentElement.appendChild(confirmRoot)') && clientConfirm.includes("root.style.setProperty('top', '0', 'important')") && clientConfirm.includes("root.style.setProperty('left', '0', 'important')") && !clientConfirm.includes('root.showModal?.()') && !clientApp.includes('dialog.client-confirm-root::backdrop'),
  clientConfirmLayersAreOrdered: clientApp.includes("data-client-confirm-layer='root'") && clientApp.includes("data-client-confirm-layer='mask'") && clientApp.includes("data-client-confirm-layer='content'") && clientApp.includes('--client-confirm-root-layer: 2147483645') && clientApp.includes('--client-confirm-mask-layer: 2147483646') && clientApp.includes('--client-confirm-content-layer: 2147483647') && clientApp.includes('z-index: 2147483645 !important') && clientApp.includes('z-index: 2147483647 !important') && 2147483645 > 2147483002,
  clientConfirmHasNoLegacyLayers: ![clientApp, clientConfirm, clientModalLayer].some((source) => /214748360[0-2]/.test(source)),
  clientSystemModalLayerIsAboveBusinessModal: clientApp.includes('applySystemModalLayer') && clientApp.includes('setImportantStyle(host, \'z-index\', String(CLIENT_SYSTEM_MODAL_ROOT_LAYER))') && clientApp.includes('normalizeSystemModalLayers') && clientApp.includes('attributeFilter: [\'class\', \'style\', \'data-type\']') && clientApp.includes('window.setTimeout(normalizeSystemModalLayers, 32)') && 2147483000 > 90,
  clientBusinessModalLayersAreConsistent: clientModalPages.every((source) => /z-index:\s*90/.test(source) && source.includes('var(--client-business-modal-layer, 90)')),
  clientPasswordConfirmUsesSharedTopLayer: clientMine.includes("import { showClientConfirm } from '../../common/confirm'") && clientMine.includes("confirmAction('确认修改密码'") && clientConfirm.includes("const getConfirmHost = () => document.documentElement") && clientConfirm.includes("root.style.setProperty('right', '0', 'important')") && clientConfirm.includes("root.style.setProperty('bottom', '0', 'important')") && clientApp.includes('.modal-mask {') && clientApp.includes('isolation: isolate !important'),
  clientToastPortalModalLayersAreCovered: clientApp.includes('const isSystemModalHost') && clientApp.includes('const toastModalHosts') && (clientApp.includes("'#u-a-t > uni-modal'") || clientApp.includes("'#u-a-t uni-modal'")) && clientApp.includes('document.body.appendChild(host)'),
  clientToastPortalPromotesActiveConfirmations: clientApp.includes('const toastHasSystemModal') && clientApp.includes('data-client-system-modal-active') && clientApp.includes('toastRoot.parentElement !== document.body') && clientApp.includes('CLIENT_SYSTEM_MODAL_ROOT_LAYER : 2000'),
  adminConfirmLayersAreAboveModals: adminStyles.includes('--admin-modal-layer: 1000') && adminStyles.includes('--admin-confirm-layer: 2147483646') && adminStyles.includes('--admin-confirm-content-layer: 2147483647') && adminStyles.includes('z-index: var(--admin-confirm-layer) !important') && adminStyles.includes('z-index: var(--admin-confirm-content-layer) !important') && 2147483646 > 1000,
  clientBusinessHasWriteLocks: ['invoiceSubmitting', 'invoiceConfirming', 'cancellingOrderId', 'cancelConfirming', 'payingOrderKey', 'proofConfirming'].every((token) => clientBusiness.includes(token)) && clientBusiness.includes('finally { invoiceSubmitting.value = false }') && clientBusiness.includes(':disabled="Boolean(cancellingOrderId || cancelConfirming)"') && clientBusiness.includes('if (uploading.value || proofConfirming.value) return'),
  clientStudentsHaveSynchronousWriteLock: clientStudents.includes("const studentOperationKey = ref('')") && clientStudents.includes('const beginStudentOperation = (key: string)') && clientStudents.includes('const endStudentOperation = (key: string)') && clientStudents.includes("const operationKey = 'save'") && clientStudents.includes('if (!beginStudentOperation(operationKey)) return') && clientStudents.includes('finally { savingStudent.value = false; endStudentOperation(operationKey) }') && clientStudents.includes('const operationKey = `default:${id}`') && clientStudents.includes('const operationKey = `remove:${id}`') && clientStudents.includes(':disabled="Boolean(studentOperationKey)"') && clientStudents.includes("studentOperationKey === 'save'") && clientStudents.includes('action-disabled'),
  clientMineHasPreConfirmationWriteLocks: clientMine.includes("const mineOperationKey = ref('')") && clientMine.includes('const beginMineOperation = (key: string)') && clientMine.includes('const endMineOperation = (key: string)') && clientMine.includes("const operationKey = 'profile-save'") && clientMine.includes("const operationKey = 'password-save'") && clientMine.includes("const operationKey = 'feedback'") && clientMine.includes('finally { savingProfile.value = false; endMineOperation(operationKey) }') && clientMine.includes('finally { savingPassword.value = false; endMineOperation(operationKey) }') && clientMine.includes(':disabled="Boolean(mineOperationKey)"') && clientMine.includes('action-disabled'),
  clientFeedbackHasFailureGuard: clientMine.includes('feedbackSubmitting') && clientMine.includes("confirmAction('确认提交反馈'") && clientMine.includes('反馈提交失败，请稍后重试') && clientMine.includes('feedbackSubmitting.value = false'),
  clientBusinessHasP1StateGates: clientBusiness.includes("invoices.value.filter((invoice) => invoice.status !== '已驳回')") && clientBusiness.includes("order.status === '待支付'") && clientBusiness.includes('支付凭证审核中，暂不能重复提交。') && clientBusiness.includes('待选择支付方式'),
  clientInvoiceClosesAfterSuccess: clientBusiness.includes('await api.createInvoice(') && clientBusiness.includes('invoiceDialogOpen.value = false'),
  clientErrorStatesHaveRetry: clientErrorPages.every((source) => source.includes('loadError') && source.includes('重新加载')) && clientErrorPages.some((source) => source.includes('quoteError')) && clientErrorPages.some((source) => source.includes('paymentInfoError')) && clientBusiness.includes('loadError.value = error?.message') && !clientBusiness.includes('orders.value = [];'),
  clientRefreshPreservesLoadedData: clientMessages.includes('loadError && !messages.length') && clientMessages.includes('loadError && messages.length') && clientMessages.includes('view v-if="messages.length" class="message-list"') && clientDetail.includes('loadError && !course') && clientDetail.includes('loadError && course') && clientDetail.includes('view v-if="course" class="detail-content"') && !clientDetail.includes('course.value = null'),
  clientDetailHasRefreshControl: clientDetail.includes('class="detail-refresh"') && clientDetail.includes('@tap="retryLoad"') && clientDetail.includes('if (!loading.value) void loadCourse(currentCourseId.value)'),
  clientBusinessHasRefreshControl: clientBusiness.includes('class="refresh-link"') && clientBusiness.includes('@tap="loadAll"') && clientBusiness.includes("const loadInFlight = ref(false)") && clientBusiness.includes('if (loadInFlight.value) return') && clientBusiness.includes('loadInFlight.value = false'),
  clientStudentsHasRefreshControl: clientStudents.includes('class="refresh-link"') && clientStudents.includes('@tap="load"') && clientStudents.includes("const loadInFlight = ref(false)") && clientStudents.includes('if (loadInFlight.value) return') && clientStudents.includes('loadInFlight.value = false'),
  adminListHasLoadingErrorRetry: ['listLoading', 'listError', 'requestLoad', "role={kind === 'loading' ? 'status' : 'alert'}", '重新加载', 'ListState'].every((token) => adminApp.includes(token)) && adminStyles.includes('.list-state') && adminStyles.includes('.error-state'),
  adminAvoidsDuplicateInvoiceReload: !adminApp.includes("runOperation(`invoice-file:${item.id}`, () => apiUpload") || !adminApp.includes(".then(() => load(1, queryKeyword))"),
  adminSeparatesWriteAndRefreshErrors: adminApp.includes('操作已完成，但列表刷新失败，请点击“重新加载”') && adminApp.includes('try {\n        await load(1, queryKeyword, statusFilter)')
}
if (Object.values(checks).some((value) => value === false)) throw new Error(JSON.stringify(checks))
console.log(JSON.stringify(checks, null, 2))
