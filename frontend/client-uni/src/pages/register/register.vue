<template>
  <view class="page">
    <view v-for="(participant,index) in participants" :key="index" class="card form-card">
      <view class="form-head"><text>报名人员 {{ index + 1 }}</text><text v-if="index" class="remove" @tap="remove(index)">删除</text></view>
      <view v-for="field in fields" :key="field.key" class="field"><text class="label">{{field.label}}<text v-if="field.required" class="required"> *</text></text>
        <picker v-if="field.type==='select'" mode="selector" :range="field.options || []" @change="participant[field.key]=(field.options || [])[Number($event.detail.value)]"><view class="picker">{{participant[field.key] || '请选择'}}⌄</view></picker>
        <radio-group v-else-if="field.type==='radio'" class="option-group" @change="participant[field.key]=$event.detail.value"><label v-for="option in field.options || []" :key="option" class="option"><radio :value="option" :checked="participant[field.key]===option" color="#2F80ED" />{{option}}</label></radio-group>
        <checkbox-group v-else-if="field.type==='checkbox'" class="option-group" @change="participant[field.key]=$event.detail.value.join(',')"><label v-for="option in field.options || []" :key="option" class="option"><checkbox :value="option" :checked="participant[field.key]?.split(',').includes(option)" color="#2F80ED" />{{option}}</label></checkbox-group>
        <input v-else v-model="participant[field.key]" :type="field.type==='phone'?'number':'text'" :maxlength="field.type==='phone' ? 11 : undefined" :placeholder="`请输入${field.label}`" />
      </view>
    </view>
    <view class="add card" @tap="add">＋ 添加报名人员</view>
    <view class="card total-card"><view><text class="muted">{{participants.length}} 人报名</text><text class="discount">优惠 ¥{{quote.discount || 0}}</text></view><view><text class="muted">应付金额</text><text class="total">¥{{quote.amount || 0}}</text></view></view>
    <button class="primary-btn submit" :loading="loading" @tap="submit">确认报名并生成账单</button>

    <view v-if="paymentModalOpen" class="modal-mask" @tap.self="closePaymentModal">
      <view class="payment-modal">
        <view class="modal-head"><view><text class="modal-title">账单已生成</text><text class="modal-subtitle">订单号：{{ paymentOrder.id }}</text></view><text class="modal-close" @tap="closePaymentModal">×</text></view>
        <view class="bill-total"><text>本单应付金额</text><text class="bill-amount">¥{{ formatAmount(paymentOrder.amount) }}</text></view>
        <text class="payment-title">请选择支付方式</text>
        <view class="payment-options">
          <view v-for="option in paymentOptions" :key="option.key" :class="['payment-option', { active: selectedPaymentMethod === option.key }]" @tap="selectPaymentMethod(option.key)"><text class="payment-option-icon">{{ option.icon }}</text><view><text class="payment-option-name">{{ option.label }}</text><text class="payment-option-hint">{{ option.hint }}</text></view><text class="payment-option-check">{{ selectedPaymentMethod === option.key ? '✓' : '›' }}</text></view>
        </view>
        <view v-if="nativePaymentLoading" class="native-loading">正在打开{{ selectedPaymentMethod === 'wechat' ? '微信' : '支付宝' }}支付...</view>
        <view v-else-if="(selectedPaymentMethod === 'wechat' || selectedPaymentMethod === 'alipay') && showQrFallback" class="qr-panel">
          <text class="qr-title">{{ selectedPaymentMethod === 'wechat' ? '微信支付二维码' : '支付宝支付二维码' }}</text>
          <view class="qr-box"><view class="qr-grid"><view v-for="cell in qrCells" :key="cell.index" :class="['qr-cell', { dark: cell.dark }]" /></view></view>
          <text class="qr-tip">请使用{{ selectedPaymentMethod === 'wechat' ? '微信' : '支付宝' }}扫码支付</text>
          <text class="qr-amount">支付金额 ¥{{ formatAmount(paymentOrder.amount) }}</text>
          <button class="pay-confirm" :loading="paying" @tap="confirmOnlinePayment">我已完成支付</button>
        </view>
        <view v-else-if="selectedPaymentMethod === 'offline'" class="offline-panel">
          <view class="offline-title-row"><text class="qr-title">线下对公转账</text><view class="offline-title-actions"><text class="offline-amount">¥{{ formatAmount(paymentOrder.amount) }}</text><button class="copy-offline-button" @tap="copyOfflineTransfer">复制全部</button></view></view>
          <view class="transfer-list"><view class="transfer-row"><text>收款户名</text><text>{{ paymentInfo.accountName || '待配置' }}</text></view><view class="transfer-row"><text>开户银行</text><text>{{ paymentInfo.bankName || '待配置' }}</text></view><view class="transfer-row"><text>银行账号</text><text>{{ paymentInfo.accountNo || '待配置' }}</text></view><view v-if="paymentInfo.qrCodeText" class="transfer-row"><text>收款备注</text><text>{{ paymentInfo.qrCodeText }}</text></view></view>
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
import { onLoad } from '@dcloudio/uni-app'
import { api } from '../../common/api'
import { requestNativePayment } from '../../common/payment'
type Field={key:string;label:string;type:'text'|'phone'|'select'|'radio'|'checkbox';required:boolean;options?:string[]}
const courseId=ref('course-1'), fields=ref<Field[]>([]), loading=ref(false), quote=reactive({amount:0,discount:0})
type PaymentMethod = 'wechat' | 'alipay' | 'offline'
type PaymentOrder = { id: string; amount: number; originalAmount: number; discount: number; participantCount: number; status: string }
type PaymentInfo = { accountName?: string; bankName?: string; accountNo?: string; qrCodeText?: string }
const paymentModalOpen=ref(false), paying=ref(false), nativePaymentLoading=ref(false), showQrFallback=ref(false), selectedPaymentMethod=ref<PaymentMethod | ''>(''), paymentOrder=reactive<PaymentOrder>({id:'',amount:0,originalAmount:0,discount:0,participantCount:0,status:'待支付'}), paymentInfo=reactive<PaymentInfo>({})
const paymentOptions=[{key:'wechat' as const,label:'微信支付',hint:'优先打开微信支付',icon:'微'},{key:'alipay' as const,label:'支付宝支付',hint:'优先打开支付宝支付',icon:'支'},{key:'offline' as const,label:'线下对公转账',hint:'转账后上传凭证审核',icon:'公'}]
const blank=()=>Object.fromEntries(fields.value.map(field=>[field.key,''])) as Record<string,string>
const participants=reactive<Record<string,string>[]>([])
const load=async()=>{const result=await api.getRegistrationTemplate(courseId.value);fields.value=result.fields as Field[];participants.splice(0,participants.length,blank());refreshQuote()}
const refreshQuote=async()=>{if(!participants.length)return;try{const result=await api.quoteOrder(courseId.value,participants.length);quote.amount=result.amount;quote.discount=result.discount}catch{}}
const add=()=>{participants.push(blank());refreshQuote()};const remove=(index:number)=>{participants.splice(index,1);refreshQuote()}
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
const qrCells=computed(()=>{const seed=`${paymentOrder.id}|${selectedPaymentMethod.value}|${formatAmount(paymentOrder.amount)}|${paymentInfo.qrCodeText || ''}`;const cells:Array<{index:number;dark:boolean}>=[];const size=21;const finder=(x:number,y:number)=>x<7&&y<7||x>=14&&y<7||x<7&&y>=14;for(let y=0;y<size;y++)for(let x=0;x<size;x++){let dark=false;if(finder(x,y)){const ox=x<7?x:x>=14?x-14:x;const oy=y<7?y:y>=14?y-14:y;dark=ox===0||oy===0||ox===6||oy===6||(ox>=2&&ox<=4&&oy>=2&&oy<=4)}else{const code=seed.charCodeAt((x*7+y*13)%Math.max(seed.length,1));dark=((code+x*17+y*31+x*y)%7)<3}cells.push({index:y*size+x,dark})}return cells})
const openPaymentModal=async(order:PaymentOrder)=>{Object.assign(paymentOrder,order);selectedPaymentMethod.value='';showQrFallback.value=false;nativePaymentLoading.value=false;paymentModalOpen.value=true;try{Object.assign(paymentInfo,await api.paymentInfo())}catch{}}
const closePaymentModal=()=>{if(paying.value||nativePaymentLoading.value)return;paymentModalOpen.value=false;showQrFallback.value=false}
const selectPaymentMethod=async(method:PaymentMethod)=>{
  selectedPaymentMethod.value=method
  showQrFallback.value=false
  if(method==='offline')return
  nativePaymentLoading.value=true
  try{
    const intent=await api.createPaymentIntent(paymentOrder.id,method)
    const result=await requestNativePayment(intent)
    if(result==='success'){
      await api.payOrder(paymentOrder.id,'online','',method)
      uni.showToast({title:'支付成功',icon:'none'})
      paymentModalOpen.value=false
      setTimeout(()=>uni.switchTab({url:'/pages/business/business'}),450)
    }
    else showQrFallback.value=true
  }catch(error:any){showQrFallback.value=true;uni.showToast({title:error?.message||'暂无法打开支付应用，可使用二维码支付',icon:'none'})}
  finally{nativePaymentLoading.value=false}
}
const copyOfflineTransfer=()=>{const text=['订单号：'+paymentOrder.id,'支付金额：¥'+formatAmount(paymentOrder.amount),'收款户名：'+(paymentInfo.accountName||''),'开户银行：'+(paymentInfo.bankName||''),'银行账号：'+(paymentInfo.accountNo||''),paymentInfo.qrCodeText?'收款备注：'+paymentInfo.qrCodeText:''].filter(Boolean).join('\n');uni.setClipboardData({data:text,success:()=>uni.showToast({title:'转账信息已复制',icon:'none'})})}
const goToBusiness=()=>{closePaymentModal();uni.switchTab({url:'/pages/business/business'})}
const confirmOnlinePayment=async()=>{if(!selectedPaymentMethod.value||selectedPaymentMethod.value==='offline'||paying.value)return;paying.value=true;try{await api.payOrder(paymentOrder.id,'online','',selectedPaymentMethod.value);uni.showToast({title:'支付成功',icon:'none'});paymentModalOpen.value=false;setTimeout(()=>uni.switchTab({url:'/pages/business/business'}),450)}catch(error:any){uni.showToast({title:error?.message||'支付失败，请重试',icon:'none'})}finally{paying.value=false}}
const submit=async()=>{if(!validateParticipants())return;loading.value=true;try{const order=await api.createOrder(courseId.value,participants);await openPaymentModal(order);uni.showToast({title:'账单已生成，请选择支付方式',icon:'none'})}catch(error:any){uni.showToast({title:error?.message||'提交失败，请先登录',icon:'none'})}finally{loading.value=false}}
watch(()=>participants.length,refreshQuote);onLoad(query=>{if(query?.id)courseId.value=String(query.id);load()})
</script>

<style scoped lang="scss">
.page{min-height:100vh;padding:28rpx 28rpx 48rpx}.form-card{box-sizing:border-box;padding:28rpx;margin-bottom:22rpx}.form-head{display:flex;justify-content:space-between;margin-bottom:18rpx;font-size:31rpx;font-weight:900}.remove{color:$danger;font-size:22rpx}.field{min-width:0;margin-top:20rpx}.label{display:block;margin-bottom:10rpx;color:#64748B;font-size:22rpx}.required{color:$danger}.field input,.picker{box-sizing:border-box;display:block;width:100%;max-width:100%;height:82rpx;line-height:82rpx;padding:0 24rpx;border:1rpx solid #DCE4EE;border-radius:14rpx;background:#FBFCFE;color:$navy;font-size:24rpx}.picker{display:flex;justify-content:space-between}.option-group{display:flex;flex-wrap:wrap;gap:14rpx}.option{display:flex;align-items:center;gap:6rpx;padding:14rpx 16rpx;border:1rpx solid #DCE4EE;border-radius:12rpx;color:$navy;font-size:22rpx}.add{box-sizing:border-box;width:100%;margin-bottom:22rpx;padding:26rpx;border:1rpx dashed #A9C6EC;color:$blue;background:#F5F9FF;text-align:center;font-weight:800}.total-card{box-sizing:border-box;display:flex;justify-content:space-between;width:100%;padding:28rpx;margin-bottom:22rpx}.muted,.discount,.total{display:block}.muted{color:$muted;font-size:21rpx}.discount{margin-top:8rpx;color:#C97900;font-size:23rpx}.total{margin-top:8rpx;font-size:42rpx;font-weight:900}.submit{box-sizing:border-box;width:100%;height:84rpx;line-height:84rpx}
.modal-mask{position:fixed;inset:0;z-index:90;display:flex;align-items:flex-end;justify-content:center;background:rgba(12,31,65,.48)}
.payment-modal{box-sizing:border-box;width:100%;max-height:90vh;overflow-y:auto;padding:30rpx 28rpx calc(28rpx + env(safe-area-inset-bottom));border-radius:28rpx 28rpx 0 0;background:#fff}
.modal-head{display:flex;align-items:flex-start;justify-content:space-between}.modal-title{display:block;color:$navy;font-size:34rpx;font-weight:900}.modal-subtitle{display:block;margin-top:8rpx;color:$muted;font-size:20rpx}.modal-close{color:#8391a3;font-size:44rpx;line-height:1}.bill-total{display:flex;align-items:center;justify-content:space-between;margin-top:24rpx;padding:22rpx;border-radius:16rpx;background:#f7f9fc;color:$muted;font-size:22rpx}.bill-amount{color:#e97520;font-size:42rpx;font-weight:900}.payment-title{display:block;margin-top:28rpx;color:$navy;font-size:25rpx;font-weight:800}.payment-options{display:flex;flex-direction:column;gap:12rpx;margin-top:14rpx}.payment-option{display:flex;align-items:center;gap:16rpx;padding:18rpx;border:1rpx solid #e3e9f1;border-radius:16rpx;background:#fff}.payment-option.active{border-color:#2f80ed;background:#f2f7ff}.payment-option-icon{display:flex;align-items:center;justify-content:center;width:54rpx;height:54rpx;border-radius:16rpx;color:#fff;background:#2f80ed;font-size:20rpx;font-weight:900}.payment-option:nth-child(2) .payment-option-icon{background:#18a86a}.payment-option:nth-child(3) .payment-option-icon{background:#e99428}.payment-option-name,.payment-option-hint{display:block}.payment-option-name{color:$navy;font-size:24rpx;font-weight:800}.payment-option-hint{margin-top:5rpx;color:$muted;font-size:19rpx}.payment-option-check{margin-left:auto;color:$blue;font-size:34rpx}.qr-panel,.offline-panel{margin-top:22rpx;padding:22rpx;border-radius:18rpx;background:#f8fbff;text-align:center}.qr-title{display:block;color:$navy;font-size:24rpx;font-weight:800}.qr-box{display:flex;align-items:center;justify-content:center;margin:18rpx auto 12rpx}.qr-grid{display:grid;grid-template-columns:repeat(21,1fr);width:330rpx;height:330rpx;padding:12rpx;border:10rpx solid #fff;background:#fff;box-shadow:0 4rpx 16rpx rgba(20,43,74,.12)}.qr-cell{background:#fff}.qr-cell.dark{background:#101923}.qr-tip,.qr-amount,.offline-tip{display:block;color:$muted;font-size:20rpx}.qr-amount{margin-top:8rpx;color:#e97520;font-size:26rpx;font-weight:900}.pay-confirm,.later-button{box-sizing:border-box;width:100%;height:76rpx;margin-top:20rpx;border:0;border-radius:999rpx;color:#17366d;background:$yellow;font-size:24rpx;line-height:76rpx;font-weight:900}.offline-title-row{display:flex;align-items:center;justify-content:space-between}.offline-amount{color:#e97520;font-size:28rpx;font-weight:900}.transfer-list{margin-top:16rpx;padding:0 18rpx;border-radius:14rpx;background:#fff;text-align:left}.transfer-row{display:flex;justify-content:space-between;gap:20rpx;padding:16rpx 0;border-bottom:1rpx solid #edf1f5;color:$muted;font-size:20rpx}.transfer-row:last-child{border-bottom:0}.transfer-row text:last-child{max-width:65%;color:$navy;text-align:right;word-break:break-all}.offline-tip{margin-top:16rpx;line-height:1.5;text-align:left}.later-button{margin-top:22rpx;color:$navy;background:#eef3f8}
@media (min-width:700px){.modal-mask{align-items:center;padding:30rpx}.payment-modal{width:680rpx;border-radius:28rpx}}
.native-loading{margin-top:22rpx;padding:42rpx 20rpx;border-radius:18rpx;color:$blue;background:#f2f7ff;text-align:center;font-size:23rpx}.offline-title-actions{display:flex;align-items:center;gap:12rpx}.copy-offline-button{height:52rpx;margin:0;padding:0 16rpx;border:1rpx solid #b9d7ff;border-radius:999rpx;color:$blue;background:#f4f9ff;font-size:19rpx;line-height:52rpx}
</style>
