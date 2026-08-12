import { ref } from 'vue'

export interface NavLayout {
  statusBarHeight: number
  navHeight: number
  capsuleWidth: number
  capsuleRight: number
  totalHeight: number
}

/**
 * 读取微信状态栏高度和右上角原生菜单胶囊（...）的位置，
 * 让自定义吸顶导航的高度、右侧留白与微信原生控件对齐。
 * H5 没有胶囊时回退到 92rpx 的设计高度。
 */
export const useNavLayout = () => {
  const layout = ref<NavLayout>({ statusBarHeight: 0, navHeight: 46, capsuleWidth: 0, capsuleRight: 0, totalHeight: 46 })
  try {
    const system = uni.getSystemInfoSync()
    const statusBarHeight = Number(system.statusBarHeight || 0)
    let capsule: { top?: number; height?: number; width?: number; right?: number } | null = null
    try {
      capsule = (uni as any).getMenuButtonBoundingClientRect
        ? (uni as any).getMenuButtonBoundingClientRect()
        : null
    } catch {
      capsule = null
    }
    if (capsule && Number(capsule.height || 0) > 0) {
      const top = Number(capsule.top || 0)
      const height = Number(capsule.height || 32)
      const navHeight = Math.max(44, (top - statusBarHeight) * 2 + height + 16)
      const windowWidth = Number(system.windowWidth || 375)
      const capsuleRight = Math.max(0, windowWidth - Number(capsule.right || windowWidth))
      layout.value = {
        statusBarHeight,
        navHeight,
        capsuleWidth: Number(capsule.width || 87),
        capsuleRight,
        totalHeight: statusBarHeight + navHeight,
      }
    } else {
      layout.value = {
        statusBarHeight,
        navHeight: 46,
        capsuleWidth: 0,
        capsuleRight: 0,
        totalHeight: statusBarHeight + 46,
      }
    }
  } catch {
    // 保持默认值
  }
  return layout
}
