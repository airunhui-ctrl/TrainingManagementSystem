import http from 'node:http'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'static-demo')
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8' }
const port = Number(process.env.PORT || 4173)
const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent((req.url || '/').split('?')[0])
  const requested = pathname === '/' ? '/index.html' : pathname
  const filePath = path.resolve(root, `.${requested}`)
  if (!filePath.startsWith(root)) { res.writeHead(403); res.end('Forbidden'); return }
  try { const body = await fs.readFile(filePath); res.writeHead(200, { 'Content-Type': mime[path.extname(filePath)] || 'application/octet-stream' }); res.end(body) }
  catch { res.writeHead(404); res.end('Not found') }
})
server.listen(port, '127.0.0.1', () => console.log(`MVP static server listening on http://127.0.0.1:${port}`))
