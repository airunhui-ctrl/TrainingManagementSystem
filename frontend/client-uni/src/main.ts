import { createSSRApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'

if (typeof document !== 'undefined') {
  document.addEventListener('wheel', (event) => {
    const target = event.target as HTMLElement | null
    if (target && target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'number') {
      event.preventDefault()
    }
  }, { passive: false })
}

export function createApp() {
  const app = createSSRApp(App)
  app.use(createPinia())
  return { app }
}

