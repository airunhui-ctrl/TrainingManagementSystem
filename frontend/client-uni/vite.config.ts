import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import path from 'node:path'

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: process.env.UNI_PLATFORM === 'mp-weixin'
      ? { vue: path.resolve(process.cwd(), 'src/vue-runtime-shim.ts') }
      : undefined,
  },
  server: {
    host: '127.0.0.1',
    port: 5185,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3100',
        changeOrigin: true,
      },
    },
  }
})
