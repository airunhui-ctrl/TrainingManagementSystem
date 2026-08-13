<template>
  <view :class="['page', { 'payment-modal-open': paymentModalOpen }]">
    <view class="register-topbar" :style="{ height: nav.totalHeight + 'px', paddingTop: nav.statusBarHeight + 'px', paddingRight: (nav.capsuleRight + nav.capsuleWidth + 8) + 'px' }"><text class="topbar-back" @tap="backToRegister">‹</text><text class="topbar-title">填写报名信息</text><text class="topbar-side"></text></view>
    <view class="page-content">
    <view v-if="loadError" class="page-state error-state">
      <text class="state-title">报名模板加载失败</text>
      <text class="state-hint">{{ loadError }}</text>
      <button class="state-retry" @tap="load">重新加载</button>
    </view>
    <template v-else>
    <view v-for="(participant,index) in participants" :key="index" class="card form-card">
      <view class="form-head"><text>报名人员 {{ index + 1 }}</text><text v-if="index" class="remove" @tap="remove(index)">删除</text></view>
      <view v-if="students.length" class="student-source">
        <text class="source-label">报名档案</text>
        <picker mode="selector" :range="studentPickerOptions(index)" :value="selectedStudentIndex(index)" @change="selectStudent(index, Number($event.detail.value))">
          <view class="picker source-picker">{{ participant.studentId ? studentPickerOptions(index)[selectedStudentIndex(index)] : '临时填写本次报名人' }}⌄</view>
        </picker>
      </view>
      <view v-for="field in fields" :key="field.key" class="field"><text class="label">{{field.label}}<text v-if="field.required" class="required"> *</text></text>
        <picker v-if="field.type==='select'" mode="selector" :range="field.options || []" @change="participant[field.key]=(field.options || [])[Number($event.detail.value)]"><view class="picker">{{participant[field.key] || '请选择'}}⌄</view></picker>
        <radio-group v-else-if="field.type==='radio'" class="option-group" @change="participant[field.key]=$event.detail.value"><label v-for="option in field.options || []" :key="option" class="option"><radio :value="option" :checked="participant[field.key]===option" color="#2F80ED" />{{option}}</label></radio-group>
        <checkbox-group v-else-if="field.type==='checkbox'" class="option-group" @change="participant[field.key]=$event.detail.value.join(',')"><label v-for="option in field.options || []" :key="option" class="option"><checkbox :value="option" :checked="participant[field.key]?.split(',').includes(option)" color="#2F80ED" />{{option}}</label></checkbox-group>
        <input v-else v-model="participant[field.key]" :type="field.type==='phone'?'number':'text'" :maxlength="field.type==='phone' ? 11 : 140" :placeholder="`请输入${field.label}`" />
      </view>
    </view>
    <view class="add card" @tap="add">＋ 添加报名人员</view>
    <view class="card total-card"><view><text class="muted">{{participants.length}} 人报名</text><text class="discount">优惠 ¥{{quote.discount || 0}}</text></view><view><text class="muted">应付金额</text><text class="total">¥{{quote.amount || 0}}</text></view></view>
    <view v-if="quoteError" class="quote-error"><text>{{ quoteError }}</text><button class="quote-retry" @tap="refreshQuote">重试</button></view>
    <button class="primary-btn submit" :loading="loading" @tap="submit">确认报名并生成账单</button>
    </template>
    </view>
    <view v-if="paymentModalOpen" class="modal-mask" @tap.self="closePaymentModal">
      <view class="payment-modal" @tap.stop>
        <view class="modal-head"><view><text class="modal-title">账单已生成</text><text class="modal-subtitle">订单号：{{ paymentOrder.id }}</text></view><text class="modal-close" @tap="closePaymentModal">×</text></view>
        <view class="bill-total"><text>本单应付金额</text><text class="bill-amount">¥{{ formatAmount(paymentOrder.amount) }}</text></view>
        <text class="payment-title">请选择支付方式</text>
        <view class="payment-options">
          <view v-for="option in availablePaymentOptions" :key="option.key" :class="['payment-option', { active: selectedPaymentMethod === option.key }]" @tap="selectPaymentMethod(option.key)"><text class="payment-option-icon">{{ option.icon }}</text><view><text class="payment-option-name">{{ option.label }}</text><text class="payment-option-hint">{{ option.hint }}</text></view><text class="payment-option-check">{{ selectedPaymentMethod === option.key ? '✓' : '›' }}</text></view>
        </view>
        <view v-if="nativePaymentLoading" class="native-loading">正在打开{{ selectedPaymentMethod === 'wechat' ? '微信' : '支付宝' }}支付...</view>
        <view v-else-if="(selectedPaymentMethod === 'wechat' || selectedPaymentMethod === 'alipay') && showQrFallback" class="qr-panel">
          <text class="qr-title">{{ paymentMessage || '请在支付应用中完成付款' }}</text>
          <text v-if="paymentCodeUrl" class="payment-code">支付链接已生成，请复制到{{ selectedPaymentMethod === 'wechat' ? '微信' : '支付宝' }}打开</text>
          <button v-if="paymentCodeUrl" class="pay-confirm" @tap="copyPaymentCode">复制支付链接</button>
          <text class="qr-tip">支付完成后点击下方查询订单状态，系统只接受支付平台异步通知。</text>
          <text class="qr-amount">支付金额 ¥{{ formatAmount(paymentOrder.amount) }}</text>
          <button class="pay-confirm" :loading="paying" @tap="confirmOnlinePayment">查询支付状态</button>
        </view>
        <view v-else-if="selectedPaymentMethod === 'offline'" class="offline-panel">
          <view class="offline-title-row"><text class="qr-title">线下对公转账</text><view class="offline-title-actions"><text class="offline-amount">¥{{ formatAmount(paymentOrder.amount) }}</text><button class="copy-offline-button" @tap="copyOfflineTransfer">复制全部</button></view></view>
          <view v-if="paymentInfoError" class="payment-info-error"><text>{{ paymentInfoError }}</text><button class="quote-retry" @tap="retryPaymentInfo">重试</button></view>
          <view class="transfer-list"><view class="transfer-row"><text>收款户名</text><text>{{ paymentInfo.accountName || '待配置' }}</text></view><view class="transfer-row"><text>开户银行</text><text>{{ paymentInfo.bankName || '待配置' }}</text></view><view class="transfer-row"><text>银行账号</text><text>{{ paymentInfo.accountNo || '待配置' }}</text></view><view v-if="paymentInfo.qrCodeText" class="transfer-row"><text>收款备注</text><text>{{ paymentInfo.qrCodeText }}</text></view></view>
          <view v-if="paymentInfo.wechatQrImage || paymentInfo.alipayQrImage" class="personal-qr-grid"><view v-if="paymentInfo.wechatQrImage" class="personal-qr-card"><text>微信收款码</text><image :src="apiAssetUrl(paymentInfo.wechatQrImage)" mode="aspectFit" /></view><view v-if="paymentInfo.alipayQrImage" class="personal-qr-card"><text>支付宝收款码</text><image :src="apiAssetUrl(paymentInfo.alipayQrImage)" mode="aspectFit" /></view></view>
          <text v-if="paymentInfo.wechatQrImage || paymentInfo.alipayQrImage" class="personal-qr-tip">个人收款码仅用于线下转账；付款后请上传凭证，管理端审核通过后订单才会到账。</text>
          <text class="offline-tip">转账完成后，请到“订单-支付记录”上传银行回单，等待审核。</text>
          <button class="pay-confirm" @tap="goToBusiness">去订单页上传凭证</button>
        </view>
        <button v-else class="later-button" @tap="goToBusiness">稍后支付，进入订单页</button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onLoad, onShareAppMessage, onUnload } from '@dcloudio/uni-app'
import { api, apiAssetUrl } from '../../common/api'
import { showClientConfirm } from '../../common/confirm'
import { useNavLayout } from '../../common/nav-layout'
import { requestNativePayment } from '../../common/payment'
type Field={key:string;label:string;type:'text'|'phone'|'select'|'radio'|'checkbox';required:boolean;options?:string[]}
type StudentOption={id:string;name:string;phone?:string|null;gender?:string|null;email?:string|null;company?:string|null;department?:string|null;position?:string|null;isDefault?:boolean}
const courseId=ref('course-1'), fields=ref<Field[]>([]), loading=ref(false), quote=reactive({amount:0,discount:0})
const nav=useNavLayout()
const loadError=ref(''), quoteError=ref(''), paymentInfoError=ref('')
type PaymentMethod = 'wechat' | 'alipay' | 'offline'
type PaymentOrder = { id: string; amount: number; originalAmount: number; discount: number; participantCount: number; status: string }
type PaymentInfo = { accountName?: string; bankName?: string; accountNo?: string; qrCodeText?: string; wechatQrImage?: string; alipayQrImage?: string; onlineWechatEnabled?: boolean; onlineAlipayEnabled?: boolean }
const paymentModalOpen=ref(false), paying=ref(false), nativePaymentLoading=ref(false), showQrFallback=ref(false), selectedPaymentMethod=ref<PaymentMethod | ''>(''), paymentOrder=reactive<PaymentOrder>({id:'',amount:0,originalAmount:0,discount:0,participantCount:0,status:'待支付'}), paymentInfo=reactive<PaymentInfo>({}), paymentMessage=ref(''), paymentCodeUrl=ref('')
const paymentOptions=[{key:'wechat' as const,label:'微信支付',hint:'优先打开微信支付',icon:'微'},{key:'alipay' as const,label:'支付宝支付',hint:'优先打开支付宝支付',icon:'支'},{key:'offline' as const,label:'线下对公转账',hint:'转账后上传凭证审核',icon:'公'}]
let pageUnloaded=false
let paymentRedirectTimer: ReturnType<typeof setTimeout> | null = null
const availablePaymentOptions = computed(() => paymentOptions.filter((option) => option.key === 'offline' || (option.key === 'wechat' ? paymentInfo.onlineWechatEnabled !== false : paymentInfo.onlineAlipayEnabled !== false)))
const blank=()=>Object.fromEntries(fields.value.map(field=>[field.key,''])) as Record<string,string>
const students=ref<StudentOption[]>([])
const participants=reactive<Array<Record<string,string> & {studentId?:string}>>([])
const studentPickerOptions=(index:number)=>['临时填写本次报名人',...students.value.map((student)=>`${student.name}${student.phone ? `（${student.phone}）` : ''}`)]
const selectedStudentIndex=(index:number)=>{const id=participants[index]?.studentId;const found=students.value.findIndex((student)=>student.id===id);return found < 0 ? 0 : found + 1}
const setMappedStudentFields=(participant:Record<string,string>, student:StudentOption)=>{
  const aliases:Record<string,string[]>={name:['name','realName','姓名'],phone:['phone','mobile','手机号'],gender:['gender','性别'],email:['email','邮箱'],company:['company','企业','企业名称'],department:['department','部门'],position:['position','职务']}
  for(const field of fields.value){const source=Object.entries(aliases).find(([,keys])=>keys.includes(field.key))?.[0];if(source) participant[field.key]=String((student as any)[source] || '')}
}
const selectStudent=(index:number, optionIndex:number)=>{
  const participant=participants[index]; if(!participant)return
  if(optionIndex===0){delete participant.studentId;return}
  const student=students.value[optionIndex-1]; if(!student)return
  participant.studentId=student.id; setMappedStudentFields(participant,student)
}
const load=async()=>{loadError.value='';try{const result=await api.getRegistrationTemplate(courseId.value);fields.value=result.fields as Field[];try{students.value=(await api.listStudents()).items as StudentOption[]}catch(error:any){students.value=[];uni.showToast({title:error?.message||'学员档案加载失败，将使用临时填写',icon:'none'})};participants.splice(0,participants.length,blank());const defaultStudent=students.value.find((student)=>student.isDefault);if(defaultStudent){participants[0].studentId=defaultStudent.id;setMappedStudentFields(participants[0],defaultStudent)}await refreshQuote()}catch(error:any){fields.value=[];participants.splice(0,participants.length);loadError.value=error?.message||'网络异常，请检查网络后重试';uni.showToast({title:'报名模板加载失败，请点击重试',icon:'none'})}}
const refreshQuote=async()=>{if(!participants.length)return;quoteError.value='';try{const result=await api.quoteOrder(courseId.value,participants.length);quote.amount=result.amount;quote.discount=result.discount}catch(error:any){quoteError.value=error?.message||'报价暂时无法获取，请重试'}}
const confirmRegisterAction=async(options:{title:string;content:string})=>{try{return await showClientConfirm(options)}catch{uni.showToast({title:'确认弹窗打开失败，请重试',icon:'none'});return false}}
const add=()=>{participants.push(blank());refreshQuote()};const remove=async(index:number)=>{const result=await confirmRegisterAction({title:'确认删除报名人员',content:'删除后该报名人员的填写内容将丢失，确定继续吗？'});if(!result)return;participants.splice(index,1);refreshQuote()}
const validateParticipants=()=>{
  for(const [index, participant] of participants.entries()){
    const missing=fields.value.find(field=>field.required&&!String(participant[field.key]||'').trim())
    if(missing){uni.showToast({title:`第 ${index+1} 位报名人的${missing.label}不能为空`,icon:'none'});return false}
    const phoneField=fields.value.find(field=>field.type==='phone')
    if(phoneField&&participant[phoneField.key]&&!/^1\d{10}$/.test(String(participant[phoneField.key]).trim())){uni.showToast({title:`第 ${index+1} 位报名人的手机号格式不正确`,icon:'none'});return false}
  }
  return true
}
const formatAmount=(value:number)=>Number(value || 0).toFixed(2)
const loadPaymentInfo=async()=>{paymentInfoError.value='';try{Object.assign(paymentInfo,await api.paymentInfo());return true}catch(error:any){paymentInfoError.value=error?.message||'收款信息加载失败，请重试';return false}}
const retryPaymentInfo=()=>{void loadPaymentInfo()}
const openPaymentModal=async(order:PaymentOrder)=>{Object.assign(paymentOrder,order);selectedPaymentMethod.value='';showQrFallback.value=false;nativePaymentLoading.value=false;paymentMessage.value='';paymentCodeUrl.value='';paymentModalOpen.value=true;await loadPaymentInfo()}
const closePaymentModal=()=>{if(paying.value||nativePaymentLoading.value)return;paymentModalOpen.value=false;showQrFallback.value=false}
const selectPaymentMethod=async(method:PaymentMethod)=>{
  selectedPaymentMethod.value=method
  showQrFallback.value=false
  paymentMessage.value=''
  paymentCodeUrl.value=''
  if(method==='offline')return
  nativePaymentLoading.value=true
  try{
    const intent=await api.createPaymentIntent(paymentOrder.id,method)
    paymentMessage.value=intent.message || ''
    paymentCodeUrl.value=String(intent.payload?.codeUrl || '')
    if(!intent.ready){showQrFallback.value=true;return}
    const result=await requestNativePayment(intent)
    if(result==='success'){
      await confirmOnlinePayment()
    } else if(result==='redirected') {
      paymentModalOpen.value=false
    }
    else showQrFallback.value=true
  }catch(error:any){showQrFallback.value=true;paymentMessage.value=error?.message||'暂无法打开支付应用，请稍后重试';uni.showToast({title:paymentMessage.value,icon:'none'})}
  finally{nativePaymentLoading.value=false}
}
const copyOfflineTransfer=()=>{const text=['订单号：'+paymentOrder.id,'支付金额：¥'+formatAmount(paymentOrder.amount),'收款户名：'+(paymentInfo.accountName||''),'开户银行：'+(paymentInfo.bankName||''),'银行账号：'+(paymentInfo.accountNo||''),paymentInfo.qrCodeText?'收款备注：'+paymentInfo.qrCodeText:''].filter(Boolean).join('\n');uni.setClipboardData({data:text,success:()=>uni.showToast({title:'转账信息已复制',icon:'none'})})}
const copyPaymentCode=()=>{if(paymentCodeUrl.value)uni.setClipboardData({data:paymentCodeUrl.value,success:()=>uni.showToast({title:'支付链接已复制',icon:'none'})})}
const goToBusiness=()=>{closePaymentModal();uni.switchTab({url:'/pages/business/business'})}
const backToRegister=()=>uni.navigateBack()
const confirmOnlinePayment=async()=>{if(!selectedPaymentMethod.value||selectedPaymentMethod.value==='offline'||paying.value)return;paying.value=true;try{for(let attempt=0;attempt<10;attempt+=1){if(pageUnloaded)return;const status=await api.paymentStatus(paymentOrder.id);if(pageUnloaded)return;if(status.paid){uni.showToast({title:'支付成功',icon:'none'});paymentModalOpen.value=false;paymentRedirectTimer=setTimeout(()=>{if(!pageUnloaded)uni.switchTab({url:'/pages/business/business'})},450);return}if(attempt<9)await new Promise((resolve)=>setTimeout(resolve,2000))}if(pageUnloaded)return;uni.showToast({title:'暂未收到支付平台回调，请稍后在订单页刷新',icon:'none'})}catch(error:any){if(!pageUnloaded)uni.showToast({title:error?.message||'支付状态查询失败',icon:'none'})}finally{paying.value=false}}
const submit=async()=>{if(!validateParticipants())return;const confirmed=await confirmRegisterAction({title:'确认报名并生成账单',content:`将为 ${participants.length} 位报名人员生成订单，确定继续吗？`});if(!confirmed)return;loading.value=true;try{const order=await api.createOrder(courseId.value,participants);await openPaymentModal(order);uni.showToast({title:'账单已生成，请选择支付方式',icon:'none'})}catch(error:any){uni.showToast({title:error?.message||'提交失败，请先登录',icon:'none'})}finally{loading.value=false}}
watch(()=>participants.length,refreshQuote);onLoad(query=>{if(query?.id)courseId.value=String(query.id);load()});onUnload(()=>{pageUnloaded=true;if(paymentRedirectTimer)clearTimeout(paymentRedirectTimer);paymentRedirectTimer=null});onShareAppMessage(()=>({title:'填写报名信息',path:`/pages/register/register?id=${courseId.value}`}))
</script>

<style scoped lang="scss">
.register-topbar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;box-sizing:border-box;height:calc(92rpx + var(--status-bar-height));margin:-28rpx -28rpx 24rpx;padding:var(--status-bar-height) 28rpx 0;color:#243956;background:rgba(255,255,255,.82);backdrop-filter:blur(18px);box-shadow:0 4rpx 16rpx rgba(21,70,158,.08)}.topbar-back{width:100rpx;margin-top:-36rpx;color:#243956;font-size:56rpx;line-height:1;font-weight:300}.register-topbar .topbar-title{position:absolute;left:0;right:0;top:calc(var(--status-bar-height) + 12rpx);bottom:-12rpx;display:flex;align-items:center;justify-content:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#243956;font-size:30rpx;font-weight:800;pointer-events:none}.topbar-side{width:100rpx}
.page-content{visibility:visible;pointer-events:auto}.page.payment-modal-open .page-content{visibility:hidden;pointer-events:none}.page.payment-modal-open > .modal-mask{visibility:visible;pointer-events:auto}
.page{min-height:100vh;padding:28rpx 28rpx 48rpx}.page-state{display:flex;flex-direction:column;align-items:center;box-sizing:border-box;min-height:calc(100vh - 56rpx);padding:180rpx 32rpx;color:$muted;text-align:center}.state-title{color:$navy;font-size:30rpx;font-weight:900}.state-hint{margin-top:12rpx;line-height:1.5}.state-retry,.quote-retry{height:60rpx;margin-top:20rpx;padding:0 24rpx;border:0;border-radius:999rpx;color:#17366d;background:$yellow;font-size:21rpx;line-height:60rpx;font-weight:800}.state-retry{width:220rpx}.state-retry::after,.quote-retry::after{border:0}.quote-error,.payment-info-error{display:flex;align-items:center;justify-content:space-between;gap:16rpx;margin:0 0 18rpx;padding:14rpx 18rpx;border-radius:12rpx;color:#a87318;background:#fff8e7;font-size:20rpx;line-height:1.4}.quote-retry{flex:0 0 auto;margin:0;padding:0 18rpx}.payment-info-error{margin-top:18rpx;text-align:left}
.form-card{box-sizing:border-box;padding:28rpx;margin-bottom:22rpx}.form-head{display:flex;justify-content:space-between;margin-bottom:18rpx;font-size:31rpx;font-weight:900}.remove{color:$danger;font-size:22rpx}.field{min-width:0;margin-top:20rpx}.label{display:block;margin-bottom:10rpx;color:#64748B;font-size:22rpx}.required{color:$danger}.field input,.picker{box-sizing:border-box;display:block;width:100%;max-width:100%;height:82rpx;line-height:82rpx;padding:0 24rpx;border:1rpx solid #DCE4EE;border-radius:14rpx;background:#FBFCFE;color:$navy;font-size:24rpx}.picker{display:flex;justify-content:space-between}.option-group{display:flex;flex-wrap:wrap;gap:10rpx;box-sizing:border-box;width:100%;padding:16rpx 18rpx;border:1rpx solid #DCE4EE;border-radius:14rpx;background:#FBFCFE}.option{display:inline-flex;align-items:center;gap:8rpx;box-sizing:border-box;padding:8rpx 6rpx;color:$navy;font-size:22rpx}.add{box-sizing:border-box;width:100%;margin-bottom:22rpx;padding:26rpx;border:1rpx dashed #A9C6EC;color:$blue;background:#F5F9FF;text-align:center;font-weight:800}.total-card{box-sizing:border-box;display:flex;justify-content:space-between;width:100%;padding:28rpx;margin-bottom:22rpx}.muted,.discount,.total{display:block}.muted{color:$muted;font-size:21rpx}.discount{margin-top:8rpx;color:#C97900;font-size:23rpx}.total{margin-top:8rpx;font-size:42rpx;font-weight:900}.submit{box-sizing:border-box;width:100%;height:84rpx;line-height:84rpx}
.student-source{margin-bottom:18rpx;padding:16rpx;border-radius:14rpx;background:#f5f9ff}.source-label{display:block;margin-bottom:8rpx;color:#64748B;font-size:21rpx}.source-picker{height:70rpx;line-height:70rpx;background:#fff;font-size:22rpx}
.modal-mask{position:fixed;inset:0;z-index:1000;z-index:var(--client-business-modal-layer, 1000);display:flex;align-items:flex-end;justify-content:center;background:rgba(12,31,65,.48)}
.payment-modal{box-sizing:border-box;width:100%;max-height:90vh;overflow-y:auto;padding:30rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));border-radius:28rpx 28rpx 0 0;background:#fff}
.modal-head{display:flex;align-items:flex-start;justify-content:space-between}.modal-title{display:block;color:$navy;font-size:34rpx;font-weight:900}.modal-subtitle{display:block;margin-top:8rpx;color:$muted;font-size:20rpx}.modal-close{color:#8391a3;font-size:44rpx;line-height:1}.bill-total{display:flex;align-items:center;justify-content:space-between;margin-top:24rpx;padding:22rpx;border-radius:16rpx;background:#f7f9fc;color:$muted;font-size:22rpx}.bill-amount{color:#e97520;font-size:42rpx;font-weight:900}.payment-title{display:block;margin-top:28rpx;color:$navy;font-size:25rpx;font-weight:800}.payment-options{display:flex;flex-direction:column;gap:12rpx;margin-top:14rpx}.payment-option{display:flex;align-items:center;gap:16rpx;padding:18rpx;border:1rpx solid #e3e9f1;border-radius:16rpx;background:#fff}.payment-option.active{border-color:#2f80ed;background:#f2f7ff}.payment-option-icon{display:flex;align-items:center;justify-content:center;width:54rpx;height:54rpx;border-radius:16rpx;color:#fff;background:#2f80ed;font-size:20rpx;font-weight:900}.payment-option:nth-child(2) .payment-option-icon{background:#18a86a}.payment-option:nth-child(3) .payment-option-icon{background:#e99428}.payment-option-name,.payment-option-hint{display:block}.payment-option-name{color:$navy;font-size:24rpx;font-weight:800}.payment-option-hint{margin-top:5rpx;color:$muted;font-size:19rpx}.payment-option-check{margin-left:auto;color:$blue;font-size:34rpx}.qr-panel,.offline-panel{margin-top:22rpx;padding:22rpx;border-radius:18rpx;background:#f8fbff;text-align:center}.qr-title{display:block;color:$navy;font-size:24rpx;font-weight:800}.qr-box{display:flex;align-items:center;justify-content:center;margin:18rpx auto 12rpx}.qr-grid{display:grid;grid-template-columns:repeat(21,1fr);width:330rpx;height:330rpx;padding:12rpx;border:10rpx solid #fff;background:#fff;box-shadow:0 4rpx 16rpx rgba(20,43,74,.12)}.qr-cell{background:#fff}.qr-cell.dark{background:#101923}.qr-tip,.qr-amount,.offline-tip{display:block;color:$muted;font-size:20rpx}.qr-amount{margin-top:8rpx;color:#e97520;font-size:26rpx;font-weight:900}.pay-confirm,.later-button{box-sizing:border-box;width:100%;height:76rpx;margin-top:20rpx;border:0;border-radius:999rpx;color:#17366d;background:$yellow;font-size:24rpx;line-height:76rpx;font-weight:900}.offline-title-row{display:flex;align-items:center;justify-content:space-between}.offline-amount{color:#e97520;font-size:28rpx;font-weight:900}.transfer-list{margin-top:16rpx;padding:0 18rpx;border-radius:14rpx;background:#fff;text-align:left}.transfer-row{display:flex;justify-content:space-between;gap:20rpx;padding:16rpx 0;border-bottom:1rpx solid #edf1f5;color:$muted;font-size:20rpx}.transfer-row:last-child{border-bottom:0}.transfer-row text:last-child{max-width:65%;color:$navy;text-align:right;word-break:break-all}.offline-tip{margin-top:16rpx;line-height:1.5;text-align:left}.later-button{margin-top:22rpx;color:$navy;background:#eef3f8}
@media (min-width:700px){.modal-mask{align-items:center;padding:30rpx}.payment-modal{width:680rpx;border-radius:28rpx}}
.modal-mask{z-index:var(--client-business-modal-layer, 1000)!important}
.payment-code{display:block;margin-top:18rpx;padding:16rpx;border-radius:12rpx;color:$navy;background:#fff;word-break:break-all;font-size:19rpx}.qr-tip{margin-top:16rpx;line-height:1.5}
.native-loading{margin-top:22rpx;padding:42rpx 20rpx;border-radius:18rpx;color:$blue;background:#f2f7ff;text-align:center;font-size:23rpx}.offline-title-actions{display:flex;align-items:center;gap:12rpx}.copy-offline-button{height:52rpx;margin:0;padding:0 16rpx;border:1rpx solid #b9d7ff;border-radius:999rpx;color:$blue;background:#f4f9ff;font-size:19rpx;line-height:52rpx}
.personal-qr-grid{display:flex;flex-wrap:wrap;gap:14rpx;margin-top:16rpx}.personal-qr-card{flex:1 1 220rpx;padding:12rpx;border-radius:14rpx;background:#fff;text-align:center}.personal-qr-card text{display:block;color:$navy;font-size:20rpx;font-weight:800}.personal-qr-card image{display:block;width:220rpx;height:220rpx;margin:10rpx auto 0}.personal-qr-tip{display:block;margin-top:14rpx;color:$muted;font-size:19rpx;line-height:1.45;text-align:left}
</style>
