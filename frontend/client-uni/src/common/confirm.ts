import {
  CLIENT_CONFIRM_CONTENT_LAYER,
  CLIENT_CONFIRM_MASK_LAYER,
  CLIENT_CONFIRM_ROOT_LAYER,
} from './modal-layer'

export { CLIENT_CONFIRM_CONTENT_LAYER, CLIENT_CONFIRM_MASK_LAYER, CLIENT_CONFIRM_ROOT_LAYER } from './modal-layer'

export interface ClientConfirmOptions {
  title: string
  content: string
  confirmText?: string
  cancelText?: string
  variant?: 'default' | 'danger'
}

interface ActiveConfirm {
  root: HTMLElement
  resolve: (value: boolean) => void
  onKeydown: (event: KeyboardEvent) => void
}

let activeConfirm: ActiveConfirm | null = null

// Mount directly under <html>, outside <body>, #app and every page-owned
// business modal.  uni-h5 page roots can create their own stacking contexts;
// a body child may still be painted below one of those contexts even with a
// larger z-index.  An html-level fixed portal escapes that nesting entirely.
const getConfirmHost = () => document.documentElement

const enforceConfirmLayer = (root: HTMLElement) => {
  // Keep the portal outside #app and page-owned dialogs, and always move it
  // to the last html child so a framework portal inserted later cannot paint
  // above the confirmation.
  const host = getConfirmHost()
  if (root.parentElement !== host || host.lastElementChild !== root) host.appendChild(root)
  root.style.setProperty('position', 'fixed', 'important')
  root.style.setProperty('inset', '0', 'important')
  root.style.setProperty('top', '0', 'important')
  root.style.setProperty('right', '0', 'important')
  root.style.setProperty('bottom', '0', 'important')
  root.style.setProperty('left', '0', 'important')
  root.style.setProperty('width', '100vw', 'important')
  root.style.setProperty('height', '100vh', 'important')
  root.style.setProperty('z-index', String(CLIENT_CONFIRM_ROOT_LAYER), 'important')
  root.style.setProperty('isolation', 'isolate', 'important')
  root.querySelectorAll<HTMLElement>('.client-confirm-mask, [data-client-confirm-layer="mask"]')
    .forEach((mask) => mask.style.setProperty('z-index', String(CLIENT_CONFIRM_MASK_LAYER), 'important'))
  root.querySelectorAll<HTMLElement>('.client-confirm-dialog, [data-client-confirm-layer="content"]')
    .forEach((dialog) => dialog.style.setProperty('z-index', String(CLIENT_CONFIRM_CONTENT_LAYER), 'important'))
}

const closeActiveConfirm = (confirmed: boolean) => {
  if (!activeConfirm) return
  const current = activeConfirm
  activeConfirm = null
  document.removeEventListener('keydown', current.onKeydown)
  // The confirmation is an html-mounted fixed-layer portal (not a page-owned
  // modal), so removing the root releases the overlay synchronously.
  current.root.remove()
  current.resolve(confirmed)
}

const showNativeConfirm = (options: ClientConfirmOptions) => new Promise<boolean>((resolve) => {
  uni.showModal({
    title: options.title,
    content: options.content,
    confirmText: options.confirmText,
    cancelText: options.cancelText,
    success: (result) => resolve(Boolean(result.confirm)),
    fail: () => resolve(false),
  })
})

/**
 * On H5, render confirmations from one html-mounted fixed-layer portal.
 * Avoid relying on HTMLDialogElement's Top Layer: several uni-h5/WebView
 * combinations place the framework dialog in a separate stacking context and
 * can paint it below a page-owned account/security or payment dialog.
 * Other platforms keep the native uni.showModal implementation.
 */
export const showClientConfirm = (options: ClientConfirmOptions) => {
  if (typeof document === 'undefined' || !document.body) return showNativeConfirm(options)

  return new Promise<boolean>((resolve) => {
    closeActiveConfirm(false)

    // Always use a plain div. It is deliberately mounted as the last body
    // child and promoted by an explicit important z-index. This is more
    // predictable than mixing native dialog Top Layer behavior with uni-h5's
    // own #u-a-m/#u-a-t modal portals.
    const root = document.createElement('div')
    root.className = 'client-confirm-root'
    root.setAttribute('data-client-confirm-layer', 'root')
    root.setAttribute('aria-live', 'assertive')
    root.style.setProperty('position', 'fixed')
    root.style.setProperty('inset', '0')
    root.style.setProperty('top', '0', 'important')
    root.style.setProperty('right', '0', 'important')
    root.style.setProperty('bottom', '0', 'important')
    root.style.setProperty('left', '0', 'important')
    root.style.setProperty('width', '100vw')
    root.style.setProperty('height', '100vh')
    root.style.setProperty('display', 'block', 'important')
    root.style.setProperty('visibility', 'visible', 'important')
    root.style.setProperty('opacity', '1', 'important')
    // Use an important inline layer as the last line of defence.  A few
    // uni-h5 releases add inline z-index values to their modal hosts after
    // the page has rendered; normal inline styles can still lose to those
    // late framework rules when the confirmation is opened from a page modal.
    root.style.setProperty('z-index', String(CLIENT_CONFIRM_ROOT_LAYER), 'important')
    root.style.setProperty('isolation', 'isolate', 'important')
    root.style.setProperty('pointer-events', 'auto', 'important')
    root.setAttribute('aria-modal', 'true')
    root.style.setProperty('margin', '0', 'important')
    root.style.setProperty('padding', '0', 'important')
    root.style.setProperty('border', '0', 'important')
    root.style.setProperty('max-width', 'none', 'important')
    root.style.setProperty('max-height', 'none', 'important')
    root.style.setProperty('background', 'transparent', 'important')
    // Keep the portal as an explicit top-level stacking context.  The H5
    // runtime may create page-owned modal contexts with transforms or filters;
    // these inline rules ensure the confirmation is still painted above them
    // even before the global App.vue stylesheet has finished loading.
    root.style.setProperty('contain', 'layout paint', 'important')

    const mask = document.createElement('div')
    mask.className = 'client-confirm-mask'
    mask.setAttribute('data-client-confirm-layer', 'mask')
    mask.style.setProperty('position', 'absolute')
    mask.style.setProperty('inset', '0')
    mask.style.setProperty('width', '100%')
    mask.style.setProperty('height', '100%')
    mask.style.setProperty('display', 'block', 'important')
    mask.style.setProperty('visibility', 'visible', 'important')
    mask.style.setProperty('z-index', String(CLIENT_CONFIRM_MASK_LAYER), 'important')
    mask.style.setProperty('pointer-events', 'auto', 'important')
    mask.style.setProperty('background', 'rgba(12, 31, 65, .52)', 'important')

    const dialog = document.createElement('div')
    dialog.className = 'client-confirm-dialog'
    dialog.setAttribute('data-client-confirm-layer', 'content')
    dialog.dataset.variant = options.variant || 'default'
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'true')
    dialog.setAttribute('aria-label', options.title)
    dialog.style.setProperty('position', 'absolute')
    dialog.style.setProperty('top', '50%')
    dialog.style.setProperty('left', '50%')
    dialog.style.setProperty('z-index', String(CLIENT_CONFIRM_CONTENT_LAYER), 'important')
    dialog.style.setProperty('pointer-events', 'auto', 'important')
    dialog.style.setProperty('transform', 'translate(-50%, -50%)')
    dialog.style.setProperty('box-sizing', 'border-box', 'important')
    dialog.style.setProperty('width', 'min(88vw, 440px)', 'important')
    dialog.style.setProperty('padding', '28px 26px 22px', 'important')
    dialog.style.setProperty('border', '1px solid rgba(47, 128, 237, .08)', 'important')
    dialog.style.setProperty('border-radius', '24px', 'important')
    dialog.style.setProperty('background', 'linear-gradient(180deg, #fff 0%, #fbfdff 100%)', 'important')
    dialog.style.setProperty('box-shadow', '0 24px 70px rgba(12, 31, 65, .28)', 'important')

    const title = document.createElement('h2')
    title.className = 'client-confirm-title'
    title.textContent = options.title
    title.style.setProperty('margin', '0', 'important')
    title.style.setProperty('color', '#172e51', 'important')
    title.style.setProperty('font-size', '20px', 'important')
    title.style.setProperty('line-height', '1.4', 'important')
    title.style.setProperty('font-weight', '800', 'important')
    title.style.setProperty('text-align', 'center', 'important')

    const badge = document.createElement('div')
    badge.className = 'client-confirm-badge'
    badge.setAttribute('aria-hidden', 'true')
    badge.textContent = options.variant === 'danger' ? '↪' : '?'
    badge.style.setProperty('display', 'grid', 'important')
    badge.style.setProperty('place-items', 'center', 'important')
    badge.style.setProperty('width', '52px', 'important')
    badge.style.setProperty('height', '52px', 'important')
    badge.style.setProperty('margin', '0 auto 14px', 'important')
    badge.style.setProperty('border-radius', '50%', 'important')
    badge.style.setProperty('color', options.variant === 'danger' ? '#d95757' : '#17366d', 'important')
    badge.style.setProperty('background', options.variant === 'danger' ? '#fff0f0' : '#fff4c2', 'important')
    badge.style.setProperty('font-size', '27px', 'important')
    badge.style.setProperty('font-weight', '900', 'important')
    badge.style.setProperty('line-height', '1', 'important')

    const content = document.createElement('p')
    content.className = 'client-confirm-content'
    content.textContent = options.content
    content.style.setProperty('margin', '12px 0 24px', 'important')
    content.style.setProperty('color', '#64748b', 'important')
    content.style.setProperty('font-size', '15px', 'important')
    content.style.setProperty('line-height', '1.55', 'important')
    content.style.setProperty('white-space', 'pre-wrap', 'important')
    content.style.setProperty('text-align', 'center', 'important')

    const actions = document.createElement('div')
    actions.className = 'client-confirm-actions'
    actions.style.setProperty('display', 'flex', 'important')
    actions.style.setProperty('gap', '12px', 'important')

    const styleButton = (button: HTMLButtonElement, background: string, color: string) => {
      button.style.setProperty('box-sizing', 'border-box', 'important')
      button.style.setProperty('flex', '1 1 0', 'important')
      button.style.setProperty('height', '46px', 'important')
      button.style.setProperty('margin', '0', 'important')
      button.style.setProperty('padding', '0 12px', 'important')
      button.style.setProperty('border', '0', 'important')
      button.style.setProperty('border-radius', '999px', 'important')
      button.style.setProperty('color', color, 'important')
      button.style.setProperty('background', background, 'important')
      button.style.setProperty('font-size', '15px', 'important')
      button.style.setProperty('font-weight', '800', 'important')
      button.style.setProperty('line-height', '46px', 'important')
      button.style.setProperty('text-align', 'center', 'important')
      button.style.setProperty('cursor', 'pointer', 'important')
      button.style.setProperty('appearance', 'none', 'important')
    }

    const cancel = document.createElement('button')
    cancel.type = 'button'
    cancel.className = 'client-confirm-button client-confirm-button-cancel'
    cancel.textContent = options.cancelText || '取消'
    styleButton(cancel, '#eef3f8', '#516173')
    cancel.addEventListener('click', () => closeActiveConfirm(false))

    const confirm = document.createElement('button')
    confirm.type = 'button'
    confirm.className = 'client-confirm-button client-confirm-button-confirm'
    confirm.textContent = options.confirmText || '确定'
    styleButton(confirm, options.variant === 'danger' ? '#d95757' : '#ffd21f', options.variant === 'danger' ? '#fff' : '#17366d')
    confirm.addEventListener('click', () => closeActiveConfirm(true))

    actions.append(cancel, confirm)
    dialog.append(badge, title, content, actions)
    root.append(mask, dialog)
    mask.addEventListener('click', () => closeActiveConfirm(false))

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeActiveConfirm(false)
      if (event.key === 'Enter') closeActiveConfirm(true)
    }
    document.addEventListener('keydown', onKeydown)
    activeConfirm = { root, resolve, onKeydown }
    getConfirmHost().append(root)
    // Re-apply after uni-h5 and browser layout ticks.  The first paint can
    // otherwise briefly restore the framework's default modal layer.
    enforceConfirmLayer(root)
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => { if (activeConfirm?.root === root) enforceConfirmLayer(root) })
      window.setTimeout(() => { if (activeConfirm?.root === root) enforceConfirmLayer(root) }, 0)
      window.setTimeout(() => { if (activeConfirm?.root === root) enforceConfirmLayer(root) }, 32)
    }
    confirm.focus()
  })
}
