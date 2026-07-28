import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = path.resolve(path.dirname(path.dirname(fileURLToPath(import.meta.url))), '..')
const staticRoot = path.join(projectRoot, 'mvp', 'static-demo')
const required = [
  'frontend/client-uni/src/App.vue',
  'frontend/client-uni/src/pages/index/index.vue',
  'frontend/client-uni/src/pages/register/register.vue',
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
const clientApi = await fs.readFile(path.join(projectRoot, 'frontend/client-uni/src/common/api.ts'), 'utf8')
const serverGuard = await fs.readFile(path.join(projectRoot, 'backend/api/src/auth/jwt.guard.ts'), 'utf8')
const mvpController = await fs.readFile(path.join(projectRoot, 'backend/api/src/mvp/mvp.controller.ts'), 'utf8')
const staticFiles = await Promise.all(['index.html', 'app.js', 'styles.css'].map((file) => fs.access(path.join(staticRoot, file)).then(() => true)))
const checks = {
  requiredFiles: required.length + 3,
  staticFilesPresent: staticFiles.every(Boolean),
  clientHasBearerInjection: clientApi.includes('Authorization: `Bearer ${accessToken}`'),
  serverHasJwtVerify: serverGuard.includes('this.jwt.verify<') || serverGuard.includes('this.jwt.verify('),
  apiHasMvpRoutes: ["'courses'", "'orders/quote'", "'invoices'", "'admin/dashboard'"].every((route) => mvpController.includes(route)),
  staticHasRegistration: staticApp.includes('submit-register'),
  staticHasAdminMode: staticApp.includes('平台管理端')
}
if (Object.values(checks).some((value) => value === false)) throw new Error(JSON.stringify(checks))
console.log(JSON.stringify(checks, null, 2))
