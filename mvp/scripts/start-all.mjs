import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '..')
const shell = process.env.ComSpec || 'cmd.exe'

function start(command, args, cwd = root, env = {}) {
  const child = spawn(command, args, {
    cwd,
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    env: { ...process.env, ...env },
  })
  child.unref()
  return child.pid
}

const processes = [
  { name: 'static-demo', pid: start(process.execPath, ['mvp/scripts/serve.mjs'], root, { PORT: '4173' }), url: 'http://127.0.0.1:4173' },
  { name: 'api', pid: start(shell, ['/d', '/s', '/c', 'pnpm.cmd --dir backend/api start:dev'], root, { PORT: '3000' }), url: 'http://127.0.0.1:3000/api' },
  { name: 'client-uni', pid: start(shell, ['/d', '/s', '/c', 'pnpm.cmd --dir frontend/client-uni dev:h5'], root), url: 'http://127.0.0.1:5173' },
  { name: 'admin-react', pid: start(shell, ['/d', '/s', '/c', 'pnpm.cmd --dir frontend/admin-react dev'], root), url: 'http://127.0.0.1:5174' },
]

console.log(JSON.stringify({ startedAt: new Date().toISOString(), processes }, null, 2))
