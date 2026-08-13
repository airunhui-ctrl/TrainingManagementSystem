import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'
import path from 'node:path'

// mp-weixin 构建把 vue 指向 DCloud 官方小程序运行时。官方运行时导出
// isInSSRComponentSetup / injectHook，可替代此前基于 @vue/runtime-dom 的
// 自定义垫片，并保证 input v-model 等事件走小程序运行时。
const uniMpVueRuntime = path.resolve(
  process.cwd(),
  '../../node_modules/.pnpm/@dcloudio+uni-mp-vue@3.0.0-alpha-5020120260710001/node_modules/@dcloudio/uni-mp-vue/dist/vue.runtime.esm.js',
)

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: process.env.UNI_PLATFORM === 'mp-weixin'
      ? { vue: uniMpVueRuntime }
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
