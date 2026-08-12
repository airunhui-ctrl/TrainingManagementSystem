import { callWithAsyncErrorHandling } from '@vue/runtime-core'
import { pauseTracking, resetTracking } from '@vue/reactivity'

// uni-app 的小程序构建产物会从 'vue' 导入 isInSSRComponentSetup 和 injectHook，
// 但官方 Vue 未导出这两个内部 API；小程序端 SSR 恒为 false，这里补等价实现。
export * from '@vue/runtime-dom'
export const isInSSRComponentSetup = false

function injectHook(type: any, hook: any, target: any = null, prepend = false) {
  if (target) {
    const hooks = target[type] || (target[type] = [])
    const wrappedHook = hook.__weh || (hook.__weh = (...args: any[]) => {
      pauseTracking()
      try {
        return callWithAsyncErrorHandling(hook, target, type, args)
      } finally {
        resetTracking()
      }
    })
    if (prepend) {
      hooks.unshift(wrappedHook)
    } else {
      hooks.push(wrappedHook)
    }
    return wrappedHook
  }
  return undefined
}
export { injectHook }

const compile = () => {
  if (process.env.NODE_ENV !== 'production') {
    console.warn('Runtime compilation is not supported in this build of Vue.')
  }
}
export { compile }
