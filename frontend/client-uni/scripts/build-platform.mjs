import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const [command, platform] = process.argv.slice(2)
if (!['dev', 'build'].includes(command) || platform !== 'mp-weixin') {
  console.error('Usage: node scripts/build-platform.mjs <dev|build> mp-weixin')
  process.exit(1)
}

// Mini programs cannot resolve /api. Release builds always target the deployed HTTPS API;
// development may still override it for local backend testing.
if (command === 'build') {
  process.env.VITE_API_BASE_URL = 'https://kch5.lbx.fj.cn/api'
} else {
  process.env.VITE_API_BASE_URL ||= 'https://kch5.lbx.fj.cn/api'
}
process.chdir(fileURLToPath(new URL('..', import.meta.url)))

const cli = fileURLToPath(new URL('../node_modules/@dcloudio/vite-plugin-uni/bin/uni.js', import.meta.url))
const args = command === 'build' ? ['build', '-p', platform] : ['-p', platform]
const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env: process.env })
process.exit(result.status ?? 1)