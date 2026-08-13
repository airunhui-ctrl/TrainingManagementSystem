/**
 * 一次性管理员初始化脚本（PostgreSQL）
 *
 * 在 API 容器内运行，使用与后端 prisma.service.ts 同款的 scrypt hashPassword 格式。
 * 通过环境变量传入密码，不写入命令行历史、不落盘。
 *
 * 用法（在服务器项目目录下）：
 *   1. 临时在 .env.docker 追加 BOOTSTRAP_ADMIN_PASSWORD=<你的强密码>
 *   2. docker compose --env-file .env.docker up -d api   （使环境变量生效）
 *   3. docker compose --env-file .env.docker exec -T api node prisma/bootstrap-admin.cjs
 *   4. 成功后从 .env.docker 删除 BOOTSTRAP_ADMIN_PASSWORD，再次重启 api
 *
 * 环境变量：
 *   BOOTSTRAP_ADMIN_USERNAME  管理员用户名（默认 admin）
 *   BOOTSTRAP_ADMIN_PASSWORD  管理员密码（必填，至少 8 位）
 *   BOOTSTRAP_ADMIN_NAME      显示名称（默认 系统管理员）
 */

'use strict'

const { scryptSync, randomBytes } = require('node:crypto')
const { PrismaClient } = require('@prisma/client')

// 与 prisma.service.ts 的 hashPassword 完全一致
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`
}

async function main() {
  const username = String(process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin').trim().toLowerCase()
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || '').trim()
  const displayName = String(process.env.BOOTSTRAP_ADMIN_NAME || '系统管理员').trim()

  if (!password) {
    console.error('[bootstrap] 缺少 BOOTSTRAP_ADMIN_PASSWORD 环境变量')
    console.error('[bootstrap] 请在 .env.docker 中临时设置后重启 api 容器再执行')
    process.exit(1)
  }
  if (password.length < 8) {
    console.error('[bootstrap] BOOTSTRAP_ADMIN_PASSWORD 至少 8 位')
    process.exit(1)
  }

  const db = new PrismaClient()
  try {
    // 幂等检查：如果已有启用的 admin/operator，提示并退出
    const existingAdminCount = await db.user.count({
      where: { role: { in: ['admin', 'operator'] }, enabled: true },
    })
    if (existingAdminCount > 0) {
      console.log(`[bootstrap] 数据库已有 ${existingAdminCount} 个启用的管理员账号，跳过初始化`)
      console.log('[bootstrap] 如需创建新管理员，请在管理端「用户与运营」中操作')
      return
    }

    // 检查用户名是否已被占用
    const existing = await db.user.findUnique({ where: { username } })
    if (existing) {
      if (existing.role === 'admin' || existing.role === 'operator') {
        console.log(`[bootstrap] 用户 ${username} 已是管理员（当前 enabled=${existing.enabled}），已启用并重置密码`)
        await db.user.update({
          where: { id: existing.id },
          data: {
            passwordHash: hashPassword(password),
            role: 'admin',
            enabled: true,
            sessionVersion: { increment: 1 },
          },
        })
      } else {
        console.error(`[bootstrap] 用户名 ${username} 已存在且角色为 ${existing.role}，不能直接提升为管理员`)
        console.error('[bootstrap] 请使用其他用户名，或先在数据库中处理该用户')
        process.exit(1)
      }
    } else {
      const id = `u-admin-${Date.now()}-${randomBytes(4).toString('hex')}`
      await db.user.create({
        data: {
          id,
          username,
          passwordHash: hashPassword(password),
          role: 'admin',
          name: displayName,
          avatarText: displayName.slice(0, 2),
          enabled: true,
        },
      })
      console.log(`[bootstrap] 管理员账号创建成功: ${username}`)
    }

    // 写入审计日志
    await db.auditLog.create({
      data: {
        id: `LOG-${Date.now()}-${randomBytes(4).toString('hex')}`,
        actor: 'bootstrap',
        action: '管理员初始化',
        detail: `通过 bootstrap-admin.cjs 初始化管理员 ${username}`,
      },
    })

    console.log('[bootstrap] 审计日志已写入')
    console.log('')
    console.log('[bootstrap] 安全提醒：')
    console.log('[bootstrap]   1. 请立即从 .env.docker 中删除 BOOTSTRAP_ADMIN_PASSWORD')
    console.log('[bootstrap]   2. 重启 api 容器使变更生效')
    console.log('[bootstrap]   3. 首次登录后请在「账号与安全」中修改密码')
    console.log('[bootstrap]   4. 确认能正常登录后，此脚本无需再次执行')
  } finally {
    await db.$disconnect()
  }
}

main().catch((error) => {
  console.error('[bootstrap] 初始化失败:', error?.message || error)
  process.exit(1)
})