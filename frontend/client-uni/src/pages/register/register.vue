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
  </view>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { api } from '../../common/api'
type Field={key:string;label:string;type:'text'|'phone'|'select'|'radio'|'checkbox';required:boolean;options?:string[]}
const courseId=ref('course-1'), fields=ref<Field[]>([]), loading=ref(false), quote=reactive({amount:0,discount:0})
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
const submit=async()=>{if(!validateParticipants())return;loading.value=true;try{await api.createOrder(courseId.value,participants);uni.showToast({title:'账单已生成，请完成支付',icon:'none'});setTimeout(()=>uni.switchTab({url:'/pages/business/business'}),500)}catch(error:any){uni.showToast({title:error?.message||'提交失败，请先登录',icon:'none'})}finally{loading.value=false}}
watch(()=>participants.length,refreshQuote);onLoad(query=>{if(query?.id)courseId.value=String(query.id);load()})
</script>

<style scoped lang="scss">
.page{min-height:100vh;padding:28rpx 28rpx 48rpx}.form-card{box-sizing:border-box;padding:28rpx;margin-bottom:22rpx}.form-head{display:flex;justify-content:space-between;margin-bottom:18rpx;font-size:31rpx;font-weight:900}.remove{color:$danger;font-size:22rpx}.field{min-width:0;margin-top:20rpx}.label{display:block;margin-bottom:10rpx;color:#64748B;font-size:22rpx}.required{color:$danger}.field input,.picker{box-sizing:border-box;display:block;width:100%;max-width:100%;height:82rpx;line-height:82rpx;padding:0 24rpx;border:1rpx solid #DCE4EE;border-radius:14rpx;background:#FBFCFE;color:$navy;font-size:24rpx}.picker{display:flex;justify-content:space-between}.option-group{display:flex;flex-wrap:wrap;gap:14rpx}.option{display:flex;align-items:center;gap:6rpx;padding:14rpx 16rpx;border:1rpx solid #DCE4EE;border-radius:12rpx;color:$navy;font-size:22rpx}.add{box-sizing:border-box;width:100%;margin-bottom:22rpx;padding:26rpx;border:1rpx dashed #A9C6EC;color:$blue;background:#F5F9FF;text-align:center;font-weight:800}.total-card{box-sizing:border-box;display:flex;justify-content:space-between;width:100%;padding:28rpx;margin-bottom:22rpx}.muted,.discount,.total{display:block}.muted{color:$muted;font-size:21rpx}.discount{margin-top:8rpx;color:#C97900;font-size:23rpx}.total{margin-top:8rpx;font-size:42rpx;font-weight:900}.submit{box-sizing:border-box;width:100%;height:84rpx;line-height:84rpx}
</style>
