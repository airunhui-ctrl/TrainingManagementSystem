import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Type } from 'class-transformer'
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator'
import { AdminGuard } from '../auth/admin.guard'
import { JwtGuard } from '../auth/jwt.guard'
import { MvpService } from './mvp.service'

class QuoteDto { @IsString() courseId!: string; @IsInt() @Min(1) participantCount!: number }
class ParticipantDto { @IsObject() data!: Record<string, string>; @IsOptional() @IsString() studentId?: string }
class CreateOrderDto { @IsString() courseId!: string; @IsArray() @ValidateNested({ each: true }) @Type(() => ParticipantDto) participants!: ParticipantDto[]; @IsOptional() @IsIn(['online', 'offline']) paymentMethod?: 'online' | 'offline' }
class PayDto { @IsIn(['online', 'offline']) method!: 'online' | 'offline'; @IsOptional() @IsString() proof?: string; @IsOptional() @IsIn(['wechat', 'alipay']) channel?: 'wechat' | 'alipay' }
class PaymentIntentDto { @IsIn(['wechat', 'alipay']) channel!: 'wechat' | 'alipay' }
class InvoiceDto { @IsString() title!: string; @IsString() taxNo!: string; @IsString() email!: string; @IsOptional() @IsString() remark?: string; @IsArray() @IsString({ each: true }) orderIds!: string[] }

@Controller()
export class MvpController {
  constructor(private readonly mvp: MvpService) {}

  @Get('courses') courses(@Query('keyword') keyword?: string, @Query('category') category?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.mvp.listCoursesPage(keyword, category, Number(page || 1), Number(pageSize || 20), status) }
  @Get('courses/:id') course(@Param('id') id: string) { return this.mvp.getCourse(id) }
  @Get('courses/:id/registration-template') template(@Param('id') id: string) { return this.mvp.getTemplate(id) }
  @Post('orders/quote') quote(@Body() dto: QuoteDto) { return this.mvp.quote(dto.courseId, dto.participantCount) }
  @Get('banners') async banners() { return { items: (await this.mvp.listBanners()).filter((item) => item.enabled) } }
  @Get('payment-settings/public') publicPaymentSettings() { return this.mvp.getPublicPaymentSettings() }
  @Get('media/course-images/:name') async courseImage(@Param('name') name: string) { const result = await this.mvp.readCourseImage(name); return new StreamableFile(result.buffer, { type: result.mimeType }) }

  @UseGuards(JwtGuard)
  @Post('orders') createOrder(@Req() request: any, @Body() dto: CreateOrderDto) { return this.mvp.createOrder(request.user.sub, dto.courseId, dto.participants.map((item) => ({ ...item.data, ...(item.studentId ? { studentId: item.studentId } : {}) })), dto.paymentMethod) }
  @UseGuards(JwtGuard)
  @Get('orders') orders(@Req() request: any, @Query('keyword') keyword?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.mvp.listOrdersPage(request.user.role === 'user' ? request.user.sub : undefined, keyword, Number(page || 1), Number(pageSize || 20)) }
  @UseGuards(JwtGuard)
  @Get('previews') async previews(@Req() request: any) { return { items: await this.mvp.listPreviews(request.user.sub) } }
  @UseGuards(JwtGuard)
  @Get('students') students(@Req() request: any) { return this.mvp.listAccountStudents(request.user.sub) }
  @UseGuards(JwtGuard)
  @Post('students') createStudent(@Req() request: any, @Body() payload: Record<string, any>) { return this.mvp.createAccountStudent(request.user.sub, payload) }
  @UseGuards(JwtGuard)
  @Patch('students/:id') updateStudent(@Req() request: any, @Param('id') id: string, @Body() payload: Record<string, any>) { return this.mvp.updateAccountStudent(request.user.sub, id, payload) }
  @UseGuards(JwtGuard)
  @Post('students/:id/default') defaultStudent(@Req() request: any, @Param('id') id: string) { return this.mvp.setAccountDefaultStudent(request.user.sub, id) }
  @UseGuards(JwtGuard)
  @Delete('students/:id') removeStudent(@Req() request: any, @Param('id') id: string) { return this.mvp.revokeAccountStudent(request.user.sub, id) }
  @UseGuards(JwtGuard)
  @Post('orders/:id/pay') pay(@Req() request: any, @Param('id') id: string, @Body() dto: PayDto) { return this.mvp.payOrder(request.user.sub, id, dto.method, dto.proof, dto.channel) }
  @UseGuards(JwtGuard)
  @Post('orders/:id/payment-intent') paymentIntent(@Req() request: any, @Param('id') id: string, @Body() dto: PaymentIntentDto) { return this.mvp.createPaymentIntent(request.user.sub, id, dto.channel) }
  @UseGuards(JwtGuard)
  @Post('orders/:id/payment-proof')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024) } }))
  paymentProof(@Req() request: any, @Param('id') id: string, @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) { if (!file) throw new BadRequestException('请上传支付凭证文件'); return this.mvp.uploadPaymentProof(request.user.sub, id, file) }
  @UseGuards(JwtGuard)
  @Post('invoices') invoice(@Req() request: any, @Body() dto: InvoiceDto) { return this.mvp.createInvoice(request.user.sub, { title: dto.title, taxNo: dto.taxNo, email: dto.email, remark: dto.remark, orderIds: dto.orderIds }) }
  @UseGuards(JwtGuard)
  @Post('courses/:id/preview') preview(@Req() request: any, @Param('id') id: string) { return this.mvp.recordPreview(request.user.sub, id) }
  @UseGuards(JwtGuard)
  @Get('profile') profile(@Req() request: any) { return this.mvp.getProfile(request.user.sub) }
  @UseGuards(JwtGuard)
  @Patch('profile') updateProfile(@Req() request: any, @Body() payload: Record<string, any>) { return this.mvp.updateProfile(request.user.sub, payload) }
  @UseGuards(JwtGuard)
  @Post('profile/password') changePassword(@Req() request: any, @Body('password') password?: string) { return this.mvp.changePassword(request.user.sub, password || '123456') }
  @UseGuards(JwtGuard)
  @Post('orders/:id/cancel') cancel(@Req() request: any, @Param('id') id: string) { return this.mvp.cancelOrder(request.user.sub, id) }
  @UseGuards(JwtGuard)
  @Get('invoices') async invoices(@Req() request: any) { return { items: await this.mvp.listInvoices(request.user.role === 'user' ? request.user.sub : undefined) } }
  @UseGuards(JwtGuard)
  @Post('feedback') feedback(@Req() request: any, @Body() payload: Record<string, any>) { return this.mvp.submitFeedback(request.user.sub, payload) }

  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/uploads/course-image')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: Number(process.env.MAX_UPLOAD_BYTES || 5 * 1024 * 1024) } }))
  courseImageUpload(@Req() request: any, @UploadedFile() file?: { originalname: string; mimetype: string; size: number; buffer: Buffer }) { if (!file) throw new BadRequestException('请选择课程图片'); return this.mvp.uploadCourseImage(file, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/dashboard') dashboard() { return this.mvp.dashboard() }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/orders') adminOrders(@Query('keyword') keyword?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.mvp.listAdminOrdersPage(keyword, Number(page || 1), Number(pageSize || 20), status) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/banners') async adminBanners() { return { items: await this.mvp.listBanners() } }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/banners') saveBanner(@Req() request: any, @Body() payload: Record<string, any>) { return this.mvp.saveBanner(payload, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Delete('admin/banners/:id') deleteBanner(@Req() request: any, @Param('id') id: string) { return this.mvp.removeBanner(id, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/courses') saveCourse(@Req() request: any, @Body() payload: Record<string, any>) { return this.mvp.saveCourse(payload, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Patch('admin/courses/:id') patchCourse(@Req() request: any, @Param('id') id: string, @Body() payload: Record<string, any>) { return this.mvp.saveCourse({ ...payload, id }, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Delete('admin/courses/:id') deleteCourse(@Req() request: any, @Param('id') id: string) { return this.mvp.removeCourse(id, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/templates') async templates() { return { items: await this.mvp.listTemplates() } }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/templates') saveTemplate(@Req() request: any, @Body() payload: { id?: string; name?: string; fields?: any[] }) { return this.mvp.saveTemplate(payload.id, payload, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Patch('admin/templates/:id') updateTemplate(@Req() request: any, @Param('id') id: string, @Body() payload: { name?: string; fields?: any[] }) { return this.mvp.saveTemplate(id, payload, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/enrollments') async enrollments() { return { items: await this.mvp.listCompatEnrollments() } }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/enrollment-records') enrollmentRecords(@Query('keyword') keyword?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.mvp.listEnrollmentRecords(keyword, status, Number(page || 1), Number(pageSize || 20)) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/enrollment-summary') async enrollmentSummary() { return { items: await this.mvp.listEnrollmentSummary() } }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/student-domain/reconciliation') studentDomainReconciliation() { return this.mvp.reconcileStudentDomain() }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/student-domain/read-mode') studentDomainReadMode() { return this.mvp.getStudentReadMode().then((mode) => ({ mode, rollbackAvailable: true })) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/student-domain/read-mode') setStudentDomainReadMode(@Req() request: any, @Body('mode') mode: 'legacy' | 'new') { return this.mvp.setStudentReadMode(mode, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/student-profiles/match') matchStudentCandidates(@Body() payload: Record<string, any>) { return this.mvp.matchStudentCandidates(payload) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/student-profiles') studentProfiles(@Query('keyword') keyword?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.mvp.listStudentProfilesPage(keyword, status, Number(page || 1), Number(pageSize || 20), false) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/student-profiles/export') studentProfilesExport(@Req() request: any, @Query('keyword') keyword?: string, @Query('status') status?: string, @Query('reveal') reveal?: string) { return this.mvp.exportStudentProfiles(keyword, status, reveal === 'true' && request.user.role === 'admin', request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/student-profiles/:id') studentProfile(@Param('id') id: string) { return this.mvp.getStudentProfile(id, true) }
  @UseGuards(JwtGuard, AdminGuard)
  @Patch('admin/student-profiles/:id') updateStudentProfile(@Req() request: any, @Param('id') id: string, @Body() payload: Record<string, any>) { return this.mvp.updateStudentProfile(id, payload, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/student-profiles/:id/status') setStudentStatus(@Req() request: any, @Param('id') id: string, @Body('status') status: 'active' | 'inactive') { if (!['active', 'inactive'].includes(status)) throw new BadRequestException('学员状态不合法'); return this.mvp.setStudentStatus(id, status, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/student-profiles/:id/relationships') async studentRelationships(@Param('id') id: string) { return { items: await this.mvp.listStudentRelationships(id) } }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/student-profiles/:id/relationships') grantStudentRelationship(@Req() request: any, @Param('id') id: string, @Body() payload: { userId?: string; relationType?: string }) { if (!payload.userId) throw new BadRequestException('userId 不能为空'); return this.mvp.grantStudentRelationship(id, payload.userId, payload.relationType, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Delete('admin/student-profiles/:id/relationships/:userId') revokeStudentRelationship(@Req() request: any, @Param('id') id: string, @Param('userId') userId: string) { return this.mvp.revokeStudentRelationship(id, userId, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/student-profiles/:id/relationships/:userId/default') setDefaultStudentRelationship(@Req() request: any, @Param('id') id: string, @Param('userId') userId: string) { return this.mvp.setDefaultStudentRelationship(id, userId, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/student-profiles/:id/enrollments') async studentEnrollments(@Param('id') id: string) { return { items: await this.mvp.listStudentEnrollments(id) } }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/student-profiles/:id/merge') mergeStudents(@Req() request: any, @Param('id') id: string, @Body('targetId') targetId?: string) { if (!targetId) throw new BadRequestException('targetId 不能为空'); return this.mvp.mergeStudents(id, targetId, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/orders/:id/review') review(@Req() request: any, @Param('id') id: string, @Body() body: { approved?: boolean; remark?: string }) { return this.mvp.reviewOffline(id, Boolean(body.approved), body.remark, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/orders/:id/payment-proof') adminPaymentProof(@Param('id') id: string) { return this.mvp.getPaymentProof(id) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/orders/:id/payment-proof/file') async adminPaymentProofFile(@Param('id') id: string) { const result = await this.mvp.readPaymentProof(id); return new StreamableFile(result.buffer, { type: result.proof.mimeType, disposition: `inline; filename="${encodeURIComponent(result.proof.originalName)}"` }) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/orders/:id/refund') refund(@Req() request: any, @Param('id') id: string) { return this.mvp.refundOrder(id, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/invoices') adminInvoices(@Query('keyword') keyword?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.mvp.listInvoicesPage(undefined, keyword, Number(page || 1), Number(pageSize || 20), status) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/invoices/:id/process') processInvoice(@Req() request: any, @Param('id') id: string, @Body() body: { approved?: boolean; invoiceNo?: string }) { return this.mvp.processInvoice(id, body.approved ? '已开票' : '已驳回', body.invoiceNo, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/students') async adminStudents() { return { items: await this.mvp.listCompatStudents() } }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/users') users(@Query('keyword') keyword?: string, @Query('role') role?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.mvp.listUsersPage(keyword, Number(page || 1), Number(pageSize || 20), role) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/users/:id/enabled') enabled(@Req() request: any, @Param('id') id: string, @Body('enabled') enabled: boolean) { return this.mvp.setUserEnabled(id, enabled, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/users/:id/reset-password') resetPassword(@Req() request: any, @Param('id') id: string) { return this.mvp.resetUserPassword(id, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/payment-settings') paymentSettings() { return this.mvp.getPaymentSettings() }
  @UseGuards(JwtGuard, AdminGuard)
  @Patch('admin/payment-settings') savePaymentSettings(@Req() request: any, @Body() payload: Record<string, any>) { return this.mvp.savePaymentSettings(payload, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/discount-rules') async discountRules() { return { items: await this.mvp.listDiscountRules() } }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/discount-rules') saveDiscountRule(@Req() request: any, @Body() payload: Record<string, any>) { return this.mvp.saveDiscountRule(payload, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/feedbacks') feedbacks(@Query('keyword') keyword?: string, @Query('status') status?: string, @Query('page') page?: string, @Query('pageSize') pageSize?: string) { return this.mvp.listFeedbacksPage(keyword, Number(page || 1), Number(pageSize || 20), status) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/feedbacks/:id/resolve') resolveFeedback(@Req() request: any, @Param('id') id: string, @Body('reply') reply = '已收到，感谢反馈') { return this.mvp.resolveFeedback(id, reply, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/messages') createMessage(@Req() request: any, @Body() payload: Record<string, any>) { return this.mvp.saveMessage(payload, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Patch('admin/messages/:id') updateMessage(@Req() request: any, @Param('id') id: string, @Body() payload: Record<string, any>) { return this.mvp.saveMessage({ ...payload, id }, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Post('admin/points/:userId/adjust') adjustPoints(@Req() request: any, @Param('userId') userId: string, @Body() payload: { points?: number; reason?: string }) { return this.mvp.adjustPoints(userId, Number(payload.points || 0), String(payload.reason || ''), request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Put('admin/configs/:key') saveConfig(@Req() request: any, @Param('key') key: string, @Body() payload: Record<string, any>) { return this.mvp.saveSystemConfig(decodeURIComponent(key), payload, request.user.username) }
  @UseGuards(JwtGuard, AdminGuard)
  @Get('admin/:resource(messages|points|configs|audits)') async adminResource(@Param('resource') resource: string, @Query('action') action?: string) { return { items: await this.mvp.getAdminResource(resource, action), ...(resource === 'audits' ? { actions: await this.mvp.listAuditActions() } : {}) } }
}
