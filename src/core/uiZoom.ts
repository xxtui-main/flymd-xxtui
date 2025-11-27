/**
 * UI 缩放与预览宽度控制模块
 * 从 main.ts 拆分，支持 Ctrl/Cmd + 滚轮缩放和 Shift + 滚轮调整宽度
 */

// ===== UI 缩放（Ctrl/Cmd + 滚轮） =====
const UI_ZOOM_KEY = 'flymd:uiZoom'
const UI_ZOOM_DEFAULT = 1.0
const UI_ZOOM_MIN = 0.6
const UI_ZOOM_MAX = 2.0
const UI_ZOOM_STEP = 0.1

// 阅读/所见宽度（Shift + 滚轮）控制
const PREVIEW_WIDTH_KEY = 'flymd:previewWidth'
const PREVIEW_WIDTH_DEFAULT = 860
const PREVIEW_WIDTH_MIN = 600
const PREVIEW_WIDTH_MAX = 1600
export const PREVIEW_WIDTH_STEP = 40

function clamp(n: number, a: number, b: number): number { return Math.max(a, Math.min(b, n)) }

export function getUiZoom(): number {
  try {
    const v = localStorage.getItem(UI_ZOOM_KEY)
    const n = v ? parseFloat(v) : NaN
    if (Number.isFinite(n) && n >= UI_ZOOM_MIN && n <= UI_ZOOM_MAX) return n
  } catch {}
  return UI_ZOOM_DEFAULT
}
function saveUiZoom(z: number): void { try { localStorage.setItem(UI_ZOOM_KEY, String(z)) } catch {} }

export function getPreviewWidth(): number {
  try {
    const v = localStorage.getItem(PREVIEW_WIDTH_KEY)
    const n = v ? parseFloat(v) : NaN
    if (Number.isFinite(n) && n >= PREVIEW_WIDTH_MIN && n <= PREVIEW_WIDTH_MAX) return n
  } catch {}
  return PREVIEW_WIDTH_DEFAULT
}
function savePreviewWidth(w: number): void { try { localStorage.setItem(PREVIEW_WIDTH_KEY, String(w)) } catch {} }

export function applyPreviewWidth(): void {
  try {
    const w = getPreviewWidth()
    const root = document.documentElement as HTMLElement | null
    if (root) root.style.setProperty('--preview-max-width', String(Math.round(w)) + 'px')
  } catch {}
}

export function setPreviewWidth(next: number): void {
  const w = clamp(Math.round(next), PREVIEW_WIDTH_MIN, PREVIEW_WIDTH_MAX)
  savePreviewWidth(w)
  applyPreviewWidth()
}

export function resetPreviewWidth(): void {
  setPreviewWidth(PREVIEW_WIDTH_DEFAULT)
}

export function applyUiZoom(): void {
  try {
    const scale = getUiZoom()
    // 编辑器字号基准 14px
    try { const ed = document.getElementById('editor') as HTMLTextAreaElement | null; if (ed) ed.style.fontSize = (14 * scale).toFixed(2) + 'px' } catch {}
    // 预览/WYSIWYG 字号基准 16px
    try { const pv = document.getElementById('preview') as HTMLDivElement | null; if (pv) pv.style.fontSize = (16 * scale).toFixed(2) + 'px' } catch {}
    try { const pm = document.querySelector('#md-wysiwyg-root .ProseMirror') as HTMLElement | null; if (pm) pm.style.fontSize = (16 * scale).toFixed(2) + 'px' } catch {}
    // 更新状态栏缩放显示
    try {
      const label = document.getElementById('zoom-label') as HTMLSpanElement | null
      if (label) label.textContent = Math.round(scale * 100) + '%'
    } catch {}
  } catch {}
}

export function setUiZoom(next: number): void {
  const z = clamp(Math.round(next * 100) / 100, UI_ZOOM_MIN, UI_ZOOM_MAX)
  saveUiZoom(z)
  applyUiZoom()
}

export function zoomIn(): void { setUiZoom(getUiZoom() + UI_ZOOM_STEP) }
export function zoomOut(): void { setUiZoom(getUiZoom() - UI_ZOOM_STEP) }
export function zoomReset(): void { setUiZoom(UI_ZOOM_DEFAULT) }
