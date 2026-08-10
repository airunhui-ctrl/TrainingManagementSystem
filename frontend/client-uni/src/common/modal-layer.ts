/**
 * Shared overlay layers for the H5 client.
 *
 * Keep the business dialog below the framework confirmation dialog.  The
 * aliases are intentionally exported for the confirmation helper so every
 * important confirmation uses the same numeric contract as App.vue.
 */
// Page-owned business dialogs intentionally stay below uni-h5's native
// showModal fallback (which is 999 in some releases).  This also keeps a
// stale/cached H5 bundle from putting a confirmation underneath the dialog
// that opened it.
export const CLIENT_BUSINESS_MODAL_LAYER = 90
export const CLIENT_TOAST_LAYER = 2000
export const CLIENT_SYSTEM_MODAL_ROOT_LAYER = 2147483000
export const CLIENT_SYSTEM_MODAL_MASK_LAYER = 2147483001
export const CLIENT_SYSTEM_MODAL_CONTENT_LAYER = 2147483002
export const CLIENT_SYSTEM_MODAL_DIALOG_LAYER = CLIENT_SYSTEM_MODAL_CONTENT_LAYER

// Client confirmations use an html-mounted fixed layer on H5. Keep the root,
// mask and content in a strict ascending contract so a framework modal
// appended later cannot paint above a confirmation opened from a page-owned
// modal (for example, the account/security password dialog).
export const CLIENT_CONFIRM_ROOT_LAYER = 2147483645
export const CLIENT_CONFIRM_MASK_LAYER = 2147483646
export const CLIENT_CONFIRM_CONTENT_LAYER = 2147483647
