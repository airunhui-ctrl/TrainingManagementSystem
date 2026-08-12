<script setup lang="ts">
import { onLaunch } from '@dcloudio/uni-app'
import { onMounted } from 'vue'
import { useAuthStore } from './stores/auth'
import {
  CLIENT_CONFIRM_CONTENT_LAYER,
  CLIENT_CONFIRM_MASK_LAYER,
  CLIENT_CONFIRM_ROOT_LAYER,
  CLIENT_SYSTEM_MODAL_CONTENT_LAYER,
  CLIENT_SYSTEM_MODAL_MASK_LAYER,
  CLIENT_SYSTEM_MODAL_ROOT_LAYER,
} from './common/modal-layer'

let systemModalObserver: MutationObserver | null = null
let systemModalNormalizeQueued = false

const setImportantStyle = (element: HTMLElement, property: string, value: string) => {
  if (element.style.getPropertyValue(property) === value && element.style.getPropertyPriority(property) === 'important') return
  element.style.setProperty(property, value, 'important')
}

const setAttributeIfChanged = (element: Element, name: string, value: string) => {
  if (element.getAttribute(name) === value) return
  element.setAttribute(name, value)
}

const isSystemModalHost = (host: Element) => host.matches('[data-type="systemDialog"], uni-page[data-type="systemDialog"], uni-modal')

const isSystemModalMaskNode = (node: Element) => {
  const className = typeof node.className === 'string' ? node.className : ''
  return /mask|backdrop/i.test(className) || node.getAttribute('data-type') === 'mask'
}

const isSystemModalContentNode = (node: Element) => {
  if (isSystemModalMaskNode(node)) return false
  const className = typeof node.className === 'string' ? node.className : ''
  const classTokens = className.split(/\s+/).filter(Boolean)
  return node.getAttribute('role') === 'dialog'
    || node.getAttribute('aria-modal') === 'true'
    || classTokens.some((token) => /^(?:uni-modal|uni-modal__container|uni-modal__content|uni-modal-container|uni-modal-content|uni-modal-dialog|uni-modal_dialog__container|uni-modal_dialog__content|modal-dialog|modal-container|modal-content|dialog-container|dialog-content)$/i.test(token))
}

const applySystemModalLayer = (host: HTMLElement) => {
  // Mark the framework-owned host so browser diagnostics can distinguish it
  // from page-owned business dialogs.  The marker is intentionally inert and
  // is not used to control visibility.
  setAttributeIfChanged(host, 'data-client-system-modal-layer', 'root')
  setImportantStyle(host, 'position', 'fixed')
  setImportantStyle(host, 'inset', '0')
  setImportantStyle(host, 'width', '100vw')
  setImportantStyle(host, 'height', '100vh')
  setImportantStyle(host, 'z-index', String(CLIENT_SYSTEM_MODAL_ROOT_LAYER))
  setImportantStyle(host, 'isolation', 'isolate')
  setImportantStyle(host, 'pointer-events', 'auto')

  host.querySelectorAll<HTMLElement>('.uni-mask, .uni-modal-mask, .uni-modal__mask, [class*="mask"], [class*="backdrop"]')
    .forEach((mask) => {
      setAttributeIfChanged(mask, 'data-client-system-modal-layer', 'mask')
      setImportantStyle(mask, 'z-index', String(CLIENT_SYSTEM_MODAL_MASK_LAYER))
    })
  host.querySelectorAll<HTMLElement>('.uni-modal, .uni-modal__container, .uni-modal__content, .uni-modal-container, .uni-modal-content, .uni-modal-dialog, .modal-container, .modal-content, [role="dialog"], [aria-modal="true"]')
    .forEach((dialog) => {
      if (!isSystemModalContentNode(dialog)) return
      setAttributeIfChanged(dialog, 'data-client-system-modal-layer', 'content')
      setImportantStyle(dialog, 'position', 'fixed')
      setImportantStyle(dialog, 'top', '50%')
      setImportantStyle(dialog, 'left', '50%')
      setImportantStyle(dialog, 'transform', 'translate(-50%, -50%)')
      setImportantStyle(dialog, 'z-index', String(CLIENT_SYSTEM_MODAL_CONTENT_LAYER))
      setImportantStyle(dialog, 'pointer-events', 'auto')
    })
}

/**
 * A few uni-h5 builds render the system confirmation directly under the
 * toast host with class names instead of the `uni-modal` custom element.
 * Those nodes do not match the nested selectors below, so normalize them by
 * role/class while keeping toast nodes untouched.
 */
const normalizeDirectSystemModalNode = (node: HTMLElement) => {
  const isMask = isSystemModalMaskNode(node)
  const isDialog = isSystemModalContentNode(node)
  if (isMask) {
    setAttributeIfChanged(node, 'data-client-system-modal-layer', 'mask')
    setImportantStyle(node, 'position', 'fixed')
    setImportantStyle(node, 'inset', '0')
    setImportantStyle(node, 'width', '100vw')
    setImportantStyle(node, 'height', '100vh')
    setImportantStyle(node, 'z-index', String(CLIENT_SYSTEM_MODAL_MASK_LAYER))
    setImportantStyle(node, 'pointer-events', 'auto')
    return
  }
  if (isDialog) {
    setAttributeIfChanged(node, 'data-client-system-modal-layer', 'content')
    setImportantStyle(node, 'position', 'fixed')
    setImportantStyle(node, 'top', '50%')
    setImportantStyle(node, 'left', '50%')
    setImportantStyle(node, 'transform', 'translate(-50%, -50%)')
    setImportantStyle(node, 'z-index', String(CLIENT_SYSTEM_MODAL_CONTENT_LAYER))
    setImportantStyle(node, 'pointer-events', 'auto')
  }
}

/**
 * uni-h5 may create the #u-a-m root and its uni-modal child in separate
 * render ticks.  Normalize the complete host chain, not just the first node
 * observed, so a late framework style/class update cannot put the confirmation
 * behind a page-owned modal.
 */
const normalizeSystemModalLayers = () => {
  if (typeof document === 'undefined' || !document.body || !document.documentElement) return

  // The important C-end confirmations use an html-level portal. uni-h5 can
  // append framework portals after the confirmation (or temporarily move a
  // child into #u-a-t), so keep the confirmation root as the last html child
  // and re-apply the three explicit layers whenever the mutation observer
  // runs. This is the final guard for the account/security password dialog and
  // every other important confirmation opened from a page-owned modal.
  const confirmRoot = document.querySelector<HTMLElement>('.client-confirm-root, [data-client-confirm-layer="root"]')
  if (confirmRoot) {
    // Always keep the active confirmation portal above any framework host
    // appended after it. This is especially important when changing a
    // password from the account/security dialog on H5.
    if (confirmRoot.parentElement !== document.documentElement || document.documentElement.lastElementChild !== confirmRoot) document.documentElement.appendChild(confirmRoot)
    setImportantStyle(confirmRoot, 'position', 'fixed')
    setImportantStyle(confirmRoot, 'inset', '0')
    setImportantStyle(confirmRoot, 'top', '0')
    setImportantStyle(confirmRoot, 'left', '0')
    setImportantStyle(confirmRoot, 'width', '100vw')
    setImportantStyle(confirmRoot, 'height', '100vh')
    setImportantStyle(confirmRoot, 'z-index', String(CLIENT_CONFIRM_ROOT_LAYER))
    setImportantStyle(confirmRoot, 'isolation', 'isolate')
    setImportantStyle(confirmRoot, 'pointer-events', 'auto')
    confirmRoot.querySelectorAll<HTMLElement>('.client-confirm-mask, [data-client-confirm-layer="mask"]')
      .forEach((mask) => {
        setImportantStyle(mask, 'position', 'absolute')
        setImportantStyle(mask, 'inset', '0')
        setImportantStyle(mask, 'z-index', String(CLIENT_CONFIRM_MASK_LAYER))
        setImportantStyle(mask, 'pointer-events', 'auto')
      })
    confirmRoot.querySelectorAll<HTMLElement>('.client-confirm-dialog, [data-client-confirm-layer="content"]')
      .forEach((dialog) => {
        setImportantStyle(dialog, 'position', 'absolute')
        setImportantStyle(dialog, 'top', '50%')
        setImportantStyle(dialog, 'left', '50%')
        setImportantStyle(dialog, 'transform', 'translate(-50%, -50%)')
        setImportantStyle(dialog, 'z-index', String(CLIENT_CONFIRM_CONTENT_LAYER))
        setImportantStyle(dialog, 'pointer-events', 'auto')
      })
  }

  const root = document.getElementById('u-a-m')
  if (root && root.parentElement !== document.body) document.body.appendChild(root)

  // uni-h5 3.x may reuse the toast portal (#u-a-t) for showModal.  A child
  // z-index cannot escape the portal's stacking context when that portal is
  // still nested below #app/uni-app, which makes the confirmation appear
  // underneath the page-owned password/profile dialog. Promote the portal
  // itself only while it contains a system dialog, and keep the normal toast
  // layer unchanged otherwise.
  const toastRoot = document.getElementById('u-a-t')
  const toastHasSystemModal = Boolean(toastRoot?.querySelector([
    'uni-modal',
    '[data-type="systemDialog"]',
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[class*="modal"]',
    '[class*="dialog"]',
    '[class*="mask"]',
    '[class*="backdrop"]',
  ].join(',')))
  if (toastRoot) {
    if (toastHasSystemModal && toastRoot.parentElement !== document.body) document.body.appendChild(toastRoot)
    setAttributeIfChanged(toastRoot, 'data-client-system-modal-active', toastHasSystemModal ? 'true' : 'false')
    setImportantStyle(toastRoot, 'z-index', String(toastHasSystemModal ? CLIENT_SYSTEM_MODAL_ROOT_LAYER : 2000))
    setImportantStyle(toastRoot, 'isolation', 'isolate')
    // The portal itself must not block page clicks when it only contains a
    // toast. System-dialog descendants receive pointer-events:auto below.
    setImportantStyle(toastRoot, 'pointer-events', 'none')
  }

  // Some uni-h5 versions reuse the toast portal (#u-a-t) for showModal.
  // Keep the framework-owned child in its Vue mount root. Moving the
  // `uni-modal` element itself out of #u-a-m/#u-a-t can make Vue put it back
  // on the next render tick, which is the source of the intermittent
  // "confirmation below the business dialog" regression. We only promote
  // a system-dialog page root when it is genuinely nested below #app.
  const toastModalHosts = Array.from(document.querySelectorAll<HTMLElement>([
    '#u-a-t uni-modal',
    '#u-a-t [data-type="systemDialog"]',
    '#u-a-t uni-page[data-type="systemDialog"]',
  ].join(',')))
  toastModalHosts.forEach((host) => {
    if (isSystemModalHost(host)) applySystemModalLayer(host)
  })

  // Compatibility path for builds that mount the visible mask/dialog as
  // direct classed children of #u-a-t rather than under <uni-modal>.
  document.querySelectorAll<HTMLElement>([
    '#u-a-m > .uni-mask',
    '#u-a-m > .uni-modal',
    '#u-a-m > uni-modal > .uni-mask',
    '#u-a-m > uni-modal > .uni-modal',
    '#u-a-t > .uni-mask',
    '#u-a-t > .uni-modal',
    '#u-a-t > uni-modal > .uni-mask',
    '#u-a-t > uni-modal > .uni-modal',
    '[data-type="systemDialog"] .uni-mask',
    '[data-type="systemDialog"] .uni-modal',
    '[data-type="systemDialog"] [role="dialog"]',
    '[data-type="systemDialog"] [aria-modal="true"]',
  ].join(',')).forEach(normalizeDirectSystemModalNode)

  const hosts = Array.from(document.querySelectorAll<HTMLElement>([
    '#u-a-m',
    '#u-a-m > uni-modal',
    'body > uni-modal',
    '#u-a-t uni-modal',
    '[data-type="systemDialog"]',
    'uni-page[data-type="systemDialog"]',
    'uni-page[data-type="systemDialog"] > uni-page-wrapper',
    'uni-page[data-type="systemDialog"] > uni-page-wrapper > uni-page-body',
  ].join(',')))

  hosts.forEach((host) => {
    // uni-h5 3.x can mount a system-dialog page below #app/uni-app. A fixed
    // child cannot escape that ancestor's stacking context, even with a
    // larger z-index, so move only the framework-owned *root page* to body.
    // Do not move a `uni-modal` child: it is owned by the Vue app mounted at
    // #u-a-m/#u-a-t and must remain in that tree for stable rendering.
    if (host !== document.body && host.parentElement !== document.body && host.matches('[data-type="systemDialog"], uni-page[data-type="systemDialog"]')) {
      document.body.appendChild(host)
    }
    applySystemModalLayer(host)
  })

  // Older uni-h5 builds may render the visible confirmation as a classed
  // descendant of the portal without a `uni-modal` wrapper. Apply the same
  // contract to those descendants as a final compatibility path.
  document.querySelectorAll<HTMLElement>([
    '[data-type="systemDialog"] .uni-mask',
    '[data-type="systemDialog"] .uni-modal',
    '[data-type="systemDialog"] .uni-modal__container',
    '[data-type="systemDialog"] .uni-modal-dialog',
    '[data-type="systemDialog"] [role="dialog"]',
    '[data-type="systemDialog"] [aria-modal="true"]',
    '#u-a-m .uni-mask',
    '#u-a-m .uni-modal',
    '#u-a-m .uni-modal__container',
    '#u-a-m .uni-modal__content',
    '#u-a-m .uni-modal-container',
    '#u-a-m .uni-modal-content',
    '#u-a-m .uni-modal-dialog',
    '#u-a-m .modal-container',
    '#u-a-m .modal-content',
    '#u-a-m [role="dialog"]',
    '#u-a-m [aria-modal="true"]',
    '#u-a-t .uni-mask',
    '#u-a-t .uni-modal',
    '#u-a-t .uni-modal__container',
    '#u-a-t .uni-modal__content',
    '#u-a-t .uni-modal-container',
    '#u-a-t .uni-modal-content',
    '#u-a-t .uni-modal-dialog',
    '#u-a-t .modal-container',
    '#u-a-t .modal-content',
    '#u-a-t [role="dialog"]',
    '#u-a-t [aria-modal="true"]',
  ].join(','))
    .forEach((node) => {
      if (isSystemModalMaskNode(node)) {
        setAttributeIfChanged(node, 'data-client-system-modal-layer', 'mask')
        setImportantStyle(node, 'position', 'fixed')
        setImportantStyle(node, 'inset', '0')
        setImportantStyle(node, 'width', '100vw')
        setImportantStyle(node, 'height', '100vh')
        setImportantStyle(node, 'z-index', String(CLIENT_SYSTEM_MODAL_MASK_LAYER))
        setImportantStyle(node, 'pointer-events', 'auto')
      } else if (isSystemModalContentNode(node)) {
        setAttributeIfChanged(node, 'data-client-system-modal-layer', 'content')
        setImportantStyle(node, 'position', 'fixed')
        setImportantStyle(node, 'top', '50%')
        setImportantStyle(node, 'left', '50%')
        setImportantStyle(node, 'transform', 'translate(-50%, -50%)')
        setImportantStyle(node, 'z-index', String(CLIENT_SYSTEM_MODAL_CONTENT_LAYER))
        setImportantStyle(node, 'pointer-events', 'auto')
      }
    })
}

const scheduleSystemModalNormalize = () => {
  if (systemModalNormalizeQueued) return
  systemModalNormalizeQueued = true
  const run = () => {
    systemModalNormalizeQueued = false
    normalizeSystemModalLayers()
  }
  if (typeof window !== 'undefined') window.requestAnimationFrame(run)
  else run()
}

/**
 * uni.showModal is mounted after the page has rendered.  In some uni-h5
 * versions the generated host/classes differ slightly, so keep a small
 * runtime guard in addition to the global CSS contract below.  This only
 * touches the framework-owned confirmation host and never changes display or
 * visibility, which remain controlled by uni-app.
 */
const enforceSystemModalLayer = () => {
  normalizeSystemModalLayers()
}

/**
 * Install the runtime guard after the document body exists as well as during
 * uni-app launch.  H5 can invoke onLaunch before the first page has mounted;
 * without this second entry point a dynamically-created showModal host would
 * only receive the CSS fallback and miss the runtime layer correction.
 */
const installSystemModalLayerGuard = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  const install = () => {
    if (!document.body) {
      window.requestAnimationFrame(install)
      return
    }
    enforceSystemModalLayer()
    if (systemModalObserver) return
    systemModalObserver = new MutationObserver(() => {
      // Apply synchronously after uni-h5 inserts the host. This closes the
      // short window in which the framework's default z-index can paint below
      // a page-owned business dialog; the scheduled pass remains as a second
      // guard for framework styles written on the next render tick.
      normalizeSystemModalLayers()
      scheduleSystemModalNormalize()
    })
    // Observe class/style changes as well as inserted nodes. uni-h5 creates
    // the host first and applies its default z-index on a later render tick.
    systemModalObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-type'],
    })
    // The modal root and its children are mounted in separate ticks. Reapply
    // after both ticks so the confirmation always remains above page modals.
    window.requestAnimationFrame(normalizeSystemModalLayers)
    window.setTimeout(normalizeSystemModalLayers, 0)
    window.setTimeout(normalizeSystemModalLayers, 32)
    window.setTimeout(normalizeSystemModalLayers, 128)
  }
  install()
}

onLaunch(() => {
  const auth = useAuthStore()
  auth.restore()
  installSystemModalLayerGuard()
})

onMounted(installSystemModalLayerGuard)
</script>

<style lang="scss">
@import './uni.scss';

/* #ifdef H5 */
// Layer contract: page < business modal < system confirmation dialog.
// uni.showModal is mounted outside the page component, so these rules must be global.
:root {
  --client-page-layer: 20;
  --client-business-modal-layer: 1000;
  --client-toast-layer: 2000;
  // Keep the native confirmation layer above every page-owned modal. The
  // values are intentionally explicit because uni-h5 mounts showModal in a
  // dynamically-created body child rather than inside the page component.
  --client-system-modal-root-layer: 2147483000;
  --client-system-modal-layer: 2147483000;
  --client-system-modal-mask-layer: 2147483001;
  --client-system-modal-content-layer: 2147483002;
  --client-system-modal-dialog-layer: 2147483002;
  --client-confirm-root-layer: 2147483645;
  --client-confirm-mask-layer: 2147483646;
  --client-confirm-content-layer: 2147483647;
}

// All page-owned dialogs stay below uni.showModal.
.modal-mask {
  position: fixed !important;
  inset: 0 !important;
  z-index: 1000 !important;
  z-index: var(--client-business-modal-layer) !important;
  isolation: isolate !important;
}

// uni-app H5 mounts showModal under #u-a-m. Keep the host outside every
// page-owned stacking context. Do not set display here; uni-app controls
// visibility itself.
html body > uni-modal,
html body uni-modal,
html body > #u-a-m,
html body #u-a-m,
html body > #u-a-m > uni-modal,
html body #u-a-m > uni-modal,
html body #u-a-t > uni-modal,
html body #u-a-t uni-modal,
html body #u-a-t > [data-type='systemDialog'],
html body #u-a-t > uni-page[data-type='systemDialog'],
html body #u-a-t [data-type='systemDialog'],
html body #u-a-t uni-page[data-type='systemDialog'],
html body [data-type='systemDialog'],
html body uni-page[data-type='systemDialog'],
html body uni-page[data-type='systemDialog'] > uni-page-wrapper,
html body uni-page[data-type='systemDialog'] > uni-page-wrapper > uni-page-body {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483000 !important;
  z-index: var(--client-system-modal-root-layer) !important;
  isolation: isolate !important;
  pointer-events: auto !important;
}

// A few uni-h5 releases render the confirmation page wrapper one level
// deeper than the selectors above.  Promote only framework page wrappers;
// never apply this rule to every descendant, otherwise the title/body/button
// nodes would each become fixed and the confirmation would collapse.
html body [data-type='systemDialog'] > uni-page-wrapper,
html body uni-page[data-type='systemDialog'] > uni-page-wrapper,
html body uni-page[data-type='systemDialog'] > uni-page-wrapper > uni-page-body {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483000 !important;
  z-index: var(--client-system-modal-root-layer) !important;
  pointer-events: auto !important;
}

// Explicitly cover direct uni-modal children, which may have their own default z-index.
html body #u-a-m > uni-modal,
html body > #u-a-m > uni-modal,
html body > uni-modal,
html body uni-modal,
html body #u-a-t > uni-modal,
html body #u-a-t uni-modal {
  z-index: 2147483000 !important;
  z-index: var(--client-system-modal-root-layer) !important;
}

// Some uni-h5 releases render the mask/content as direct children of the
// custom element and use the BEM `uni-modal__*` class names. Keep those
// nodes in the same top-level stacking context as the legacy `.uni-mask` /
// `.uni-modal` nodes.
html body > #u-a-m > uni-modal > .uni-modal__mask,
html body #u-a-m > uni-modal > .uni-modal__mask,
html body #u-a-t > uni-modal > .uni-modal__mask,
html body #u-a-t uni-modal .uni-modal__mask,
html body > #u-a-m > uni-modal > [class*='uni-modal__'][class*='mask'],
html body #u-a-m > uni-modal > [class*='uni-modal__'][class*='mask'],
html body #u-a-t > uni-modal > [class*='uni-modal__'][class*='mask'],
html body #u-a-t uni-modal [class*='uni-modal__'][class*='mask'] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483001 !important;
  z-index: var(--client-system-modal-mask-layer) !important;
  pointer-events: auto !important;
}

// Some uni-app versions put the visible modal wrapper directly under #u-a-m
// without an extra framework page. Promote only the known modal host nodes;
// do not style arbitrary children because that would move modal text and
// buttons out of their normal layout.
html body #u-a-m > uni-modal,
html body #u-a-m > [data-type='systemDialog'] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483000 !important;
  z-index: var(--client-system-modal-root-layer) !important;
}

// Masks must cover the business dialog and remain clickable.
html body [data-client-system-modal-layer='mask'] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483001 !important;
  z-index: var(--client-system-modal-mask-layer) !important;
  pointer-events: auto !important;
}

html body [data-client-system-modal-layer='content'] {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  z-index: 2147483002 !important;
  z-index: var(--client-system-modal-content-layer) !important;
  pointer-events: auto !important;
}

html body > uni-modal .uni-mask,
html body uni-modal .uni-mask,
html body #u-a-t > uni-modal .uni-mask,
html body #u-a-t uni-modal .uni-mask,
html body > uni-modal .uni-modal-mask,
html body uni-modal .uni-modal-mask,
html body #u-a-t > uni-modal .uni-modal-mask,
html body #u-a-t uni-modal .uni-modal-mask,
html body > uni-modal .uni-modal__mask,
html body uni-modal .uni-modal__mask,
html body #u-a-t > uni-modal .uni-modal__mask,
html body #u-a-t uni-modal .uni-modal__mask,
html body #u-a-m .uni-mask,
html body #u-a-m .uni-modal-mask,
html body #u-a-m .uni-modal__mask,
html body [data-type='systemDialog'] .uni-mask,
html body [data-type='systemDialog'] .uni-modal-mask,
html body [data-type='systemDialog'] .uni-modal__mask,
html body uni-page[data-type='systemDialog'] .uni-mask,
html body uni-page[data-type='systemDialog'] .uni-modal-mask,
html body uni-page[data-type='systemDialog'] .uni-modal__mask,
html body #u-a-m [class*='uni-modal_dialog__mask'],
html body [data-type='systemDialog'] [class*='uni-modal_dialog__mask'],
html body uni-page[data-type='systemDialog'] [class*='uni-modal_dialog__mask'],
html body #u-a-m [class*='uni-modal'][class*='mask'],
html body [data-type='systemDialog'] [class*='uni-modal'][class*='mask'] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483001 !important;
  z-index: var(--client-system-modal-mask-layer) !important;
  pointer-events: auto !important;
}

html body #u-a-m > uni-modal > .uni-mask,
html body > uni-modal > .uni-mask,
html body uni-modal > .uni-mask,
html body #u-a-t > uni-modal > .uni-mask {
  z-index: 2147483001 !important;
  z-index: var(--client-system-modal-mask-layer) !important;
}

// Dialog content is one layer above its mask.
html body > uni-modal > .uni-modal,
html body uni-modal > .uni-modal,
html body #u-a-t > uni-modal > .uni-modal,
html body #u-a-t uni-modal .uni-modal,
html body > uni-modal .uni-modal,
html body uni-modal .uni-modal,
html body #u-a-m .uni-modal,
html body [data-type='systemDialog'] .uni-modal,
html body uni-page[data-type='systemDialog'] .uni-modal,
html body #u-a-m [class*='uni-modal_dialog__container'],
html body [data-type='systemDialog'] [class*='uni-modal_dialog__container'],
html body uni-page[data-type='systemDialog'] [class*='uni-modal_dialog__container'],
html body #u-a-m [class*='uni-modal'][class*='container'],
html body [data-type='systemDialog'] [class*='uni-modal'][class*='container'],
html body #u-a-m [class*='uni-modal-dialog']:not([class*='mask']),
html body [data-type='systemDialog'] [class*='uni-modal-dialog']:not([class*='mask']),
html body > uni-modal [role='dialog'],
html body uni-modal [role='dialog'],
html body #u-a-m [role='dialog'],
html body [data-type='systemDialog'] [role='dialog'] {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  z-index: 2147483002 !important;
  z-index: var(--client-system-modal-dialog-layer) !important;
  pointer-events: auto !important;
}

html body #u-a-m > uni-modal > .uni-modal,
html body > uni-modal > .uni-modal,
html body uni-modal > .uni-modal {
  z-index: 2147483002 !important;
  z-index: var(--client-system-modal-content-layer) !important;
}

html body > #u-a-m > uni-modal > .uni-modal__container,
html body #u-a-m > uni-modal > .uni-modal__container,
html body > #u-a-m > uni-modal > .uni-modal__content,
html body #u-a-m > uni-modal > .uni-modal__content,
html body > #u-a-m > uni-modal > .uni-modal-container,
html body #u-a-m > uni-modal > .uni-modal-container,
html body > #u-a-m > uni-modal > .uni-modal-content,
html body #u-a-m > uni-modal > .uni-modal-content,
html body #u-a-t > uni-modal > .uni-modal__container,
html body #u-a-t uni-modal .uni-modal__container,
html body #u-a-t > uni-modal > .uni-modal__content,
html body #u-a-t uni-modal .uni-modal__content,
html body #u-a-t > uni-modal > .uni-modal-container,
html body #u-a-t uni-modal .uni-modal-container,
html body #u-a-t > uni-modal > .uni-modal-content,
html body #u-a-t uni-modal .uni-modal-content,
html body > uni-modal > .uni-modal__container,
html body > uni-modal > .uni-modal__content,
html body > uni-modal > .uni-modal-container,
html body > uni-modal > .uni-modal-content,
html body > uni-modal > .modal-container,
html body > uni-modal > .modal-content,
html body #u-a-m > .modal-container,
html body #u-a-m > .modal-content,
html body #u-a-t > .modal-container,
html body #u-a-t > .modal-content,
html body > #u-a-m > uni-modal > [class*='uni-modal__'][class*='container'],
html body > #u-a-m > uni-modal > [class*='uni-modal__'][class*='content'],
html body #u-a-t uni-modal [class*='uni-modal'][class*='container'],
html body #u-a-t uni-modal [class*='uni-modal'][class*='content']
{
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  z-index: 2147483002 !important;
  z-index: var(--client-system-modal-content-layer) !important;
  pointer-events: auto !important;
}

html body #u-a-m > * [role='dialog'],
html body #u-a-m > * [aria-modal='true'],
html body #u-a-m > * [class*='modal'][class*='container'],
html body #u-a-m > * [class*='uni-modal-dialog']:not([class*='mask']),
html body #u-a-t [role='dialog'],
html body #u-a-t [aria-modal='true'],
html body #u-a-t [class*='modal']:not([class*='mask']),
html body #u-a-t [class*='dialog']:not([class*='mask']) {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  z-index: 2147483002 !important;
  z-index: var(--client-system-modal-dialog-layer) !important;
  pointer-events: auto !important;
}

// Some uni-h5 builds mount the confirmation mask/content directly below the
// toast host (#u-a-t), without a <uni-modal> wrapper. Keep those direct nodes
// in the same top-level layer as the #u-a-m implementation.
html body #u-a-t > [class*='modal'][class*='mask'],
html body #u-a-t > [class*='dialog'][class*='mask'],
html body #u-a-t > [class*='mask'],
html body #u-a-t [class*='modal'][class*='mask'],
html body #u-a-t [class*='dialog'][class*='mask'],
html body #u-a-t [class*='backdrop'] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483001 !important;
  z-index: var(--client-system-modal-mask-layer) !important;
  pointer-events: auto !important;
}

html body #u-a-t > [role='dialog'],
html body #u-a-t > [aria-modal='true'],
html body #u-a-t > [class*='modal']:not([class*='mask']),
html body #u-a-t > [class*='modal'][class*='container'],
html body #u-a-t > [class*='dialog']:not([class*='mask']),
html body #u-a-t > [class*='container']:not([class*='mask']),
html body #u-a-m > .modal-content,
html body #u-a-m > .dialog-content,
html body #u-a-m > [class*='modal'][class*='content'],
html body #u-a-t > .modal-content,
html body #u-a-t > .dialog-content,
html body #u-a-t > [class*='modal'][class*='content'],
html body [data-type='systemDialog'] .modal-content,
html body [data-type='systemDialog'] .dialog-content,
html body [data-type='systemDialog'] [class*='modal'][class*='content'] {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  z-index: 2147483002 !important;
  z-index: var(--client-system-modal-content-layer) !important;
  pointer-events: auto !important;
}

// uni-h5 3.x uses a system-dialog page rather than #u-a-m for showModal.
// The page/component and its direct wrapper all need the same top-level
// stacking context; otherwise the framework's inline z-index: 999 wins over
// a page-owned modal at z-index: 1000.
html body uni-page[data-type='systemDialog'] > uni-page-wrapper,
html body uni-page[data-type='systemDialog'] > uni-page-wrapper > uni-page-body {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483000 !important;
  z-index: var(--client-system-modal-root-layer) !important;
  pointer-events: auto !important;
}

html body uni-page[data-type='systemDialog'] .uni-modal-mask,
html body uni-page[data-type='systemDialog'] [class*='uni-modal'][class*='mask'] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  z-index: 2147483001 !important;
  z-index: var(--client-system-modal-mask-layer) !important;
  pointer-events: auto !important;
}

html body uni-page[data-type='systemDialog'] .uni-modal-dialog,
html body uni-page[data-type='systemDialog'] [class*='uni-modal-dialog']:not([class*='mask']) {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  z-index: 2147483002 !important;
  z-index: var(--client-system-modal-dialog-layer) !important;
  pointer-events: auto !important;
}

// Other system overlays also stay above business dialogs.
html body > uni-action-sheet,
html body uni-action-sheet,
html body > uni-picker,
html body uni-picker,
html body #u-a-m .uni-actionsheet,
html body #u-a-m .uni-picker-container,
html body [data-type='systemDialog'] .uni-actionsheet,
html body [data-type='systemDialog'] .uni-picker-container,
html body .uni-actionsheet,
html body .uni-picker-container,
html body uni-action-sheet,
html body uni-picker-view,
html body [class*='uni-action-sheet_dialog__mask'],
html body [class*='uni-action-sheet_dialog__container'],
html body [class*='uni-picker'] {
  z-index: 2147483001 !important;
  z-index: var(--client-system-modal-mask-layer) !important;
}

// #u-a-t is primarily the Toast host. Keep the host itself above page
// content but below confirmations. If a uni-h5 version places a confirmation
// child here, the child remains in this Vue mount tree and receives the same
// system-modal root/mask/content layers through the runtime normalizer.
html body > #u-a-t,
html body #u-a-t {
  position: fixed !important;
  inset: auto 0 0 !important;
  width: 100vw !important;
  height: auto !important;
  z-index: var(--client-toast-layer) !important;
  isolation: isolate !important;
  pointer-events: none !important;
}

// Important C-end confirmations use an app-level body portal on H5. This
// keeps them above every page-owned dialog, including account/security and
// payment dialogs, regardless of the uni-h5 portal stacking context.
html body .client-confirm-root,
html body [data-client-confirm-layer='root'],
html > .client-confirm-root,
html > [data-client-confirm-layer='root'] {
  position: fixed !important;
  inset: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  display: block !important;
  visibility: visible !important;
  opacity: 1 !important;
  z-index: 2147483645 !important;
  z-index: var(--client-confirm-root-layer) !important;
  isolation: isolate !important;
  pointer-events: auto !important;
}

html body .client-confirm-mask,
html body [data-client-confirm-layer='mask'],
html > .client-confirm-root .client-confirm-mask,
html > [data-client-confirm-layer='root'] [data-client-confirm-layer='mask'] {
  position: absolute !important;
  inset: 0 !important;
  width: 100% !important;
  height: 100% !important;
  display: block !important;
  visibility: visible !important;
  background: rgba(12, 31, 65, .52) !important;
  z-index: 2147483646 !important;
  z-index: var(--client-confirm-mask-layer) !important;
  pointer-events: auto !important;
}

html body .client-confirm-dialog,
html body [data-client-confirm-layer='content'],
html > .client-confirm-root .client-confirm-dialog,
html > [data-client-confirm-layer='root'] [data-client-confirm-layer='content'] {
  position: absolute !important;
  top: 50% !important;
  left: 50% !important;
  box-sizing: border-box !important;
  width: min(88vw, 440px) !important;
  padding: 28px 26px 22px !important;
  border: 1px solid rgba(47, 128, 237, .08) !important;
  border-radius: 24px !important;
  background: linear-gradient(180deg, #fff 0%, #fbfdff 100%) !important;
  box-shadow: 0 24px 70px rgba(12, 31, 65, .28) !important;
  transform: translate(-50%, -50%) !important;
  z-index: 2147483647 !important;
  z-index: var(--client-confirm-content-layer) !important;
  pointer-events: auto !important;
}

html body .client-confirm-badge {
  display: grid !important;
  place-items: center !important;
  width: 52px !important;
  height: 52px !important;
  margin: 0 auto 14px !important;
  border-radius: 50% !important;
  color: #17366d !important;
  background: #fff4c2 !important;
  font-size: 27px !important;
  font-weight: 900 !important;
  line-height: 1 !important;
}

html body [data-client-confirm-layer='content'][data-variant='danger'] .client-confirm-badge {
  color: #d95757 !important;
  background: #fff0f0 !important;
}

html body .client-confirm-title {
  margin: 0 !important;
  color: #172e51 !important;
  font-size: 20px !important;
  line-height: 1.4 !important;
  font-weight: 800 !important;
  text-align: center !important;
}

html body .client-confirm-content {
  margin: 12px 0 24px !important;
  color: #64748b !important;
  font-size: 15px !important;
  line-height: 1.55 !important;
  white-space: pre-wrap !important;
  text-align: center !important;
}

html body .client-confirm-actions {
  display: flex !important;
  gap: 12px !important;
}

html body .client-confirm-button {
  box-sizing: border-box !important;
  flex: 1 1 0 !important;
  height: 46px !important;
  margin: 0 !important;
  padding: 0 12px !important;
  border: 0 !important;
  border-radius: 999px !important;
  font-size: 15px !important;
  line-height: 46px !important;
  font-weight: 800 !important;
  transition: transform .16s ease, filter .16s ease !important;
  text-align: center !important;
  cursor: pointer !important;
}

html body .client-confirm-button::after { display: none !important; }
html body .client-confirm-button-cancel { color: #516173 !important; background: #eef3f8 !important; }
html body .client-confirm-button-confirm { color: #17366d !important; background: #ffd21f !important; }
html body [data-client-confirm-layer='content'][data-variant='danger'] .client-confirm-button-confirm { color: #fff !important; background: #d95757 !important; }
html body .client-confirm-button:hover { filter: brightness(.97) !important; transform: translateY(-1px) !important; }
html body .client-confirm-button:focus-visible { outline: 3px solid rgba(47, 128, 237, .32) !important; outline-offset: 2px !important; }
/* #endif */
</style>
