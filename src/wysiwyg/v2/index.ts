// 所见模式 V2：基于 Milkdown 的真实所见编辑视图
// 暴露 enable/disable 与 setMarkdown/getMarkdown 能力，供主流程挂接

import 'katex/dist/katex.min.css'
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx, editorViewCtx, commandsCtx } from '@milkdown/core'
import { convertFileSrc } from '@tauri-apps/api/core'
import { readFile } from '@tauri-apps/plugin-fs'
// 用于外部（main.ts）在所见模式下插入 Markdown（文件拖放时复用普通模式逻辑）
import { replaceAll, getMarkdown } from '@milkdown/utils'
import { commonmark } from '@milkdown/preset-commonmark'
import { gfm } from '@milkdown/preset-gfm'
import { automd } from '@milkdown/plugin-automd'
import { listener, listenerCtx } from '@milkdown/plugin-listener'
import { upload, uploadConfig } from '@milkdown/plugin-upload'
import { uploader } from './plugins/paste'
import { remarkMathPlugin, katexOptionsCtx, mathInlineSchema, mathBlockSchema, mathInlineInputRule } from '@milkdown/plugin-math'
// 注：保留 automd 插件以提供编辑功能，通过 CSS 隐藏其 UI 组件
// 引入富文本所见视图的必要样式（避免工具条/布局错乱导致不可编辑/不可滚动）
// 注：不直接导入 @milkdown/crepe/style.css，避免 Vite 对未导出的样式路径解析失败。

let _editor: Editor | null = null
let _root: HTMLElement | null = null
let _onChange: ((md: string) => void) | null = null
let _suppressInitialUpdate = false
let _lastMd = ''
let _imgObserver: MutationObserver | null = null
let _overlayTimer: number | null = null
let _overlayHost: HTMLDivElement | null = null
let _activeMermaidPre: HTMLElement | null = null
// 记录上一次激活的 mermaid 源代码块，避免切换时残留/闪烁
let _lastMermaidPre: HTMLElement | null = null
// 鼠标与光标分别记录，避免事件互相“顶掉”导致不渲染
// 优先级：光标所在（selection）优先于鼠标悬停（mouse）
let _activeMermaidPreBySelection: HTMLElement | null = null
let _activeMermaidPreByMouse: HTMLElement | null = null

function toLocalAbsFromSrc(src: string): string | null {
  try {
    if (!src) return null
    let s = String(src).trim()
    // 去掉 Markdown 尖括号 <...>
    if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1)
    // 尽量解码一次
    try { s = decodeURIComponent(s) } catch {}
    // data/blob/asset/http 跳过
    if (/^(data:|blob:|asset:|https?:)/i.test(s)) return null
    // file:// 解析
    if (/^file:/i.test(s)) {
      try {
        const u = new URL(s)
        let p = u.pathname || ''
        if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1)
        p = decodeURIComponent(p)
        if (/^[a-zA-Z]:\//.test(p)) p = p.replace(/\//g, '\\')
        return p
      } catch { /* fallthrough */ }
    }
    // Windows 盘符或 UNC
    if (/^[a-zA-Z]:[\\/]/.test(s)) return s.replace(/\//g, '\\')
    if (/^\\\\/.test(s)) return s.replace(/\//g, '\\')
    // 绝对路径（类 Unix）
    if (/^\//.test(s)) return s
    return null
  } catch { return null }
}

function fromFileUri(u: string): string | null {
  try {
    if (!/^file:/i.test(u)) return null
    const url = new URL(u)
    const host = url.hostname || ''
    let p = url.pathname || ''
    if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1)
    p = decodeURIComponent(p)
    if (host) {
      // UNC: file://server/share/path -> \\server\share\path
      const pathPart = p.replace(/^\//, '').replace(/\//g, '\\')
      return '\\' + '\\' + host + (pathPart ? '\\' + pathPart : '')
    }
    if (/^[a-zA-Z]:\//.test(p)) p = p.replace(/\//g, '\\')
    return p
  } catch { return null }
}
function isTauriRuntime(): boolean {
  try { return typeof (window as any).__TAURI__ !== 'undefined' } catch { return false }
}

function rewriteLocalImagesToAsset() {
  try {
    const host0 = _root as HTMLElement | null
    const host = (host0?.querySelector('.ProseMirror') as HTMLElement | null) || host0
    if (!host) return

    const toDataUrl = async (abs: string): Promise<string | null> => {
      try {
        const bytes = await readFile(abs as any)
        const mime = (() => {
          const m = (abs || '').toLowerCase().match(/\.([a-z0-9]+)$/)
          switch (m?.[1]) {
            case 'jpg':
            case 'jpeg': return 'image/jpeg'
            case 'png': return 'image/png'
            case 'gif': return 'image/gif'
            case 'webp': return 'image/webp'
            case 'bmp': return 'image/bmp'
            case 'avif': return 'image/avif'
            case 'ico': return 'image/x-icon'
            case 'svg': return 'image/svg+xml'
            default: return 'application/octet-stream'
          }
        })()
        const blob = new Blob([bytes], { type: mime })
        return await new Promise<string>((resolve, reject) => {
          try {
            const fr = new FileReader()
            fr.onerror = () => reject(fr.error || new Error('读取图片失败'))
            fr.onload = () => resolve(String(fr.result || ''))
            fr.readAsDataURL(blob)
          } catch (e) { reject(e as any) }
        })
      } catch { return null }
    }

    const convertOne = (imgEl: HTMLImageElement) => {
      try {
        const raw = imgEl.getAttribute('src') || ''
        const abs = toLocalAbsFromSrc(raw)
        if (!abs) return
        void (async () => {
          const dataUrl = await toDataUrl(abs)
          if (dataUrl) {
            if (imgEl.src !== dataUrl) imgEl.src = dataUrl
          }
        })()
      } catch {}
    }

    host.querySelectorAll('img[src]').forEach((img) => { try { convertOne(img as HTMLImageElement) } catch {} })

    if (_imgObserver) { try { _imgObserver.disconnect() } catch {} }
    _imgObserver = new MutationObserver((list) => {
      try {
        for (const m of list) {
          if (m.type === 'attributes' && (m.target as any)?.tagName === 'IMG') {
            const el = m.target as HTMLImageElement
            if (!m.attributeName || m.attributeName.toLowerCase() === 'src') convertOne(el)
          } else if (m.type === 'childList') {
            m.addedNodes.forEach((n) => {
              try {
                if ((n as any)?.nodeType === 1) {
                  const el = n as Element
                  if (el.tagName === 'IMG') { convertOne(el as any) }
                  el.querySelectorAll?.('img[src]')?.forEach((img) => { try { convertOne(img as HTMLImageElement) } catch {} })
                }
              } catch {}
            })
          }
        }
      } catch {}
    })
    _imgObserver.observe(host, { subtree: true, attributes: true, attributeFilter: ['src'], childList: true })
  } catch {}
}function cleanupEditorOnly() {
  try { if (_imgObserver) { _imgObserver.disconnect(); _imgObserver = null } } catch {}
  if (_editor) {
    try { _editor.destroy() } catch {}
    _editor = null
  }
}

export async function enableWysiwygV2(root: HTMLElement, initialMd: string, onChange: (md: string) => void) {
  // 规范化内容：空内容也是合法的（新文档或空文档）
  const content = (initialMd || '').toString()
  console.log('[WYSIWYG V2] enableWysiwygV2 called, content length:', content.length)

  // 仅销毁旧编辑器与观察器，保留外层传入的 root（避免被移除导致空白）
  cleanupEditorOnly()
  _root = root
  _onChange = onChange
  _suppressInitialUpdate = true
  _lastMd = content

  const editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, root)
      ctx.set(defaultValueCtx, _lastMd)
      // 配置编辑器视图选项，确保可编辑
      ctx.set(editorViewOptionsCtx, { editable: () => true })
      // 配置上传：接入现有图床上传逻辑，同时允许从 HTML 粘贴的文件触发上传
      try {
        ctx.update(uploadConfig.key, (prev) => ({
          ...prev,
          uploader,
          enableHtmlFileUploader: true,
        }))
      } catch {}
    })
    .use(commonmark)
    .use(gfm)
    .use(remarkMathPlugin).use(katexOptionsCtx).use(mathInlineSchema).use(mathBlockSchema).use(mathInlineInputRule)
    .use(automd)
    .use(listener)
    .use(upload)
    .create()

  try { rewriteLocalImagesToAsset() } catch {}

  try { rewriteLocalImagesToAsset() } catch {}
  // 初次渲染后聚焦
  try {
    const view = (editor as any).ctx.get(editorViewCtx)
    requestAnimationFrame(() => { try { view?.focus() } catch {} })
  } catch {}
  // 初次渲染后重写本地图片为 asset: url（仅影响 DOM，不改 Markdown）
  try { setTimeout(() => { try { rewriteLocalImagesToAsset() } catch {} }, 0) } catch {}
  // 首次挂载后运行一次增强渲染（Mermaid 块）
  try { setTimeout(() => { try { scheduleMermaidRender() } catch {} }, 60) } catch {}
  try { window.addEventListener('resize', () => { try { scheduleMermaidRender() } catch {} }) } catch {}
  // 成功创建后清理占位文案（仅移除纯文本节点，不影响编辑器 DOM）
  try {
    if (_root && _root.firstChild && (_root.firstChild as any).nodeType === 3) {
      _root.removeChild(_root.firstChild)
    }
  } catch {}
  // 兜底：确保编辑区可见且占满容器
  try {
    const pm = _root?.querySelector('.ProseMirror') as HTMLElement | null
    if (pm) {
      pm.style.display = 'block'
      pm.style.minHeight = '100%'
      pm.style.width = '100%'
      // 滚动时刷新覆盖渲染（重定位 Mermaid 预览块）
      try { pm.addEventListener('scroll', () => { try { scheduleMermaidRender() } catch {} }) } catch {}
      // 鼠标/光标触发 Mermaid 渲染（非实时）
      try { pm.addEventListener('mousemove', (ev) => { try { onPmMouseMove(ev as any) } catch {} }, true) } catch {}
      try { document.addEventListener('selectionchange', () => { try { onPmSelectionChange() } catch {} }, true) } catch {} 
      // 双击 KaTeX / Mermaid 进入源码模式
      try { pm.addEventListener('dblclick', (ev) => {
  const t = ev.target as HTMLElement | null;
  const hit = t?.closest?.("div[data-type='math_block']") || t?.closest?.("span[data-type='math_inline']");
  if (hit) { ev.stopPropagation(); try { enterLatexSourceEdit(hit as HTMLElement) } catch {} }
}, true) } catch {} 
    }
    const host = _root?.firstElementChild as HTMLElement | null
    if (host) {
      host.style.display = host.style.display || 'block'
      host.style.minHeight = host.style.minHeight || '100%'
      host.style.width = host.style.width || '100%'
    }
  } catch {}
  // 监听内容更新并回写给外层（用于保存与切回源码视图）
  try {
    const ctx = (editor as any).ctx
    const lm = ctx.get(listenerCtx)
    try {
      lm.docChanged((_ctx) => {
        if (_suppressInitialUpdate) return
        scheduleMermaidRender()
        try { scheduleMathBlockReparse() } catch {}
      })
    } catch {}
    lm.markdownUpdated((_ctx, markdown) => {
      if (_suppressInitialUpdate) return
      // 统一 Windows/UNC/含空格路径的图片写法：在 Markdown 中为目标包上尖括号 <...>
      const md2 = (() => {
        try {
          return String(markdown).replace(/!\[[^\]]*\]\(([^)]+)\)/g, (m, g1) => {
            const s = String(g1 || '').trim()
            // 已经是 <...> 的不处理
            if (s.startsWith('<') && s.endsWith('>')) return m
            const dec = (() => { try { return decodeURIComponent(s) } catch { return s } })()
            const localFromFile = fromFileUri(dec)
            if (localFromFile) return m.replace(s, `<${localFromFile}>`)
            const looksLocal = /^(?:file:|[a-zA-Z]:[\\/]|\\\\|\/)/.test(dec)
            const hasSpaceOrSlash = /[\s()\\]/.test(dec)
            if (looksLocal && hasSpaceOrSlash) {
              return m.replace(s, `<${dec}>`)
            }
            return m
          })
        } catch { return markdown }
      })()
      _lastMd = md2
      try { _onChange?.(md2) } catch {}
      try { setTimeout(() => { try { rewriteLocalImagesToAsset() } catch {} }, 0) } catch {}
      // Markdown 更新时，也刷新 Mermaid 渲染
      scheduleMermaidRender()
    })
  } catch {}
  _suppressInitialUpdate = false
  _editor = editor
}

export async function disableWysiwygV2() {  try {
    if (_editor) {
      try { const mdNow = await (_editor as any).action(getMarkdown()) ; _lastMd = mdNow; _onChange?.(mdNow) } catch {}
    }
  } catch {}
  try { if (_imgObserver) { _imgObserver.disconnect(); _imgObserver = null } } catch {}
  try { if (_overlayHost && _overlayHost.parentElement) { _overlayHost.parentElement.removeChild(_overlayHost); _overlayHost = null } } catch {}
  if (_editor) {
    try { await _editor.destroy() } catch {}
    _editor = null
  }
  try {
    // 隐藏并移除根节点，避免覆盖层残留拦截点击
    const host = document.getElementById('md-wysiwyg-root') as HTMLElement | null
    if (host) {
      try { host.style.display = 'none' } catch {}
      try { host.innerHTML = '' } catch {}
      try { host.parentElement?.removeChild(host) } catch {}
    }
  } catch {}
  _root = null
  _onChange = null
}

export function isWysiwygV2Enabled(): boolean { return !!_editor }

// 供外部调用：将整个文档替换为指定 Markdown（简易接口）
export async function wysiwygV2ReplaceAll(markdown: string) {
  if (!_editor) return
  try { await _editor.action(replaceAll(markdown)) } catch {}
}

// =============== 自动渲染覆盖层：Mermaid 代码块 ===============
// 全局渲染节流定时器
let _renderThrottleTimer: number | null = null
// 记录已渲染的 Mermaid 图表，避免重复渲染导致闪烁
const _renderedMermaid = new WeakMap<HTMLElement, string>()

function scheduleMermaidRender() {
  try { if (_renderThrottleTimer != null) { clearTimeout(_renderThrottleTimer); _renderThrottleTimer = null } } catch {}
  // 使用节流：300ms 内多次调用只执行一次
  _renderThrottleTimer = window.setTimeout(() => { try { renderMermaidNow() } catch {} }, 300)
}

function getHost(): HTMLElement | null {
  try {
    const host0 = _root as HTMLElement | null
    return (host0?.querySelector('.ProseMirror') as HTMLElement | null) || host0
  } catch { return null }
}

function ensureOverlayHost(): HTMLDivElement | null {
  try {
    const root = _root
    if (!root) return null
    if (_overlayHost && _overlayHost.parentElement) return _overlayHost
    const ov = document.createElement('div')
    ov.className = 'overlay-host'
    ov.style.position = 'absolute'
    ov.style.inset = '0'
    ov.style.zIndex = '5'
    ov.style.pointerEvents = 'none'
    root.appendChild(ov)
    _overlayHost = ov
    return ov
  } catch { return null }
}

async function renderMermaidInto(el: HTMLDivElement, code: string) {
  try {
    const mod: any = await import('mermaid')
    const mermaid = mod?.default || mod
    // 所见模式：静默 mermaid 内部错误与日志，避免在输入中提示干扰
    try { (mermaid as any).parseError = () => {} } catch {}
    try { if ((mermaid as any).mermaidAPI) (mermaid as any).mermaidAPI.parseError = () => {} } catch {}
    try { mermaid.initialize?.({ startOnLoad: false, securityLevel: 'loose', theme: 'default', logLevel: 'fatal' as any }) } catch {}
    const id = 'mmd-' + Math.random().toString(36).slice(2)
    const { svg } = await mermaid.render(id, code || '')
    el.innerHTML = svg
  } catch (e) {
    // 所见模式：隐藏渲染失败提示（保持空内容，不覆盖底下的源码输入）
    try { el.innerHTML = '' } catch {}
  }
}


function onPmMouseMove(ev: MouseEvent) {
  try {
    const t = ev.target as HTMLElement | null
    const pre = t?.closest?.('pre') as HTMLElement | null
    const hit = (() => {
      if (!pre) return null
      const codeEl = pre.querySelector('code') as HTMLElement | null
      const langFromClass = codeEl ? /\\blanguage-([\\w-]+)\\b/.exec(codeEl.className || '')?.[1] : ''
      const langFromAttr = (pre.getAttribute('data-language') || pre.getAttribute('data-lang') || '').toLowerCase()
      const lang = (langFromAttr || langFromClass || '').toLowerCase()
      return lang === 'mermaid' ? pre : null
    })()
    // 鼠标只是辅助手段：仅在没有光标命中的情况下生效
    _activeMermaidPreByMouse = hit
    const next = _activeMermaidPreBySelection || _activeMermaidPreByMouse
    if (next !== _activeMermaidPre) { _activeMermaidPre = next; scheduleMermaidRender() }
  } catch {}
}

function onPmSelectionChange() {
  try {
    const sel = window.getSelection()
    const n = sel?.focusNode as (Node & { parentElement?: HTMLElement }) | null
    const el = (n && (n as any).nodeType === 1 ? (n as any as HTMLElement) : n?.parentElement) as HTMLElement | null
    const pre = el?.closest?.('pre') as HTMLElement | null
    const codeEl = pre?.querySelector?.('code') as HTMLElement | null
    const langFromClass = codeEl ? /\\blanguage-([\\w-]+)\\b/.exec(codeEl.className || '')?.[1] : ''
    const langFromAttr = pre ? (pre.getAttribute('data-language') || pre.getAttribute('data-lang') || '').toLowerCase() : ''
    const lang = (langFromAttr || langFromClass || '').toLowerCase()
    const hit = (lang === 'mermaid' ? pre : null) as HTMLElement | null
    // 光标优先级最高：直接覆盖选择源，再与鼠标源合并计算
    _activeMermaidPreBySelection = hit
    const next = _activeMermaidPreBySelection || _activeMermaidPreByMouse
    if (next !== _activeMermaidPre) { _activeMermaidPre = next; scheduleMermaidRender() }
  } catch {}
}

// ===== Latex 源码编辑：在 KaTeX 上方叠加一个 textarea 进行就地编辑，保存后仅更新该数学节点 =====

//  闭合后再渲染（不在输入起始处触发）
let _mathReparseTimer: number | null = null
function scheduleMathBlockReparse() {
  try { if (_mathReparseTimer != null) { clearTimeout(_mathReparseTimer); _mathReparseTimer = null } } catch {}
  _mathReparseTimer = window.setTimeout(async () => {
    try {
      const mdNow = await (_editor as any).action(getMarkdown())
      if (/\$\$[\s\S]*?\$\$/m.test(String(mdNow || ''))) {
        await (_editor as any).action(replaceAll(String(mdNow || '')))
      }
    } catch {}
  }, 240)
}
function updateMilkdownMathFromDom(mathEl: HTMLElement, newValue: string) {
  try {
    const view: any = (_editor as any)?.ctx?.get?.(editorViewCtx)
    if (!view || !mathEl) return
    let pos: number | null = null
    try { pos = view.posAtDOM(mathEl, 0) } catch {}
    if (pos == null || typeof pos !== 'number') return
    const state = view.state
    const $pos = state.doc.resolve(pos)
    let from = pos, to = pos
    const isMath = (n: any) => !!n && (n.type?.name === 'math_inline' || n.type?.name === 'math_block')
    if ($pos.nodeAfter && isMath($pos.nodeAfter)) { to = pos + $pos.nodeAfter.nodeSize }
    else if ($pos.nodeBefore && isMath($pos.nodeBefore)) { from = pos - $pos.nodeBefore.nodeSize }
    const schema = state.schema
    const isBlock = (mathEl.dataset?.type === 'math_block' || mathEl.tagName === 'DIV')
    let node: any
    if (isBlock) {
      const t = schema.nodes['math_block']
      node = t?.create?.({ value: String(newValue || '') })
    } else {
      const t = schema.nodes['math_inline']
      const text = schema.text(String(newValue || ''))
      node = t?.create?.({}, text)
    }
    if (!node) return
    const tr = state.tr.replaceRangeWith(from, to, node)
    view.dispatch(tr.scrollIntoView())
  } catch {}
}

function enterLatexSourceEdit(hitEl: HTMLElement) {
  try {
    const mathEl = (hitEl.closest("div[data-type='math_block']") as HTMLElement) || (hitEl.closest("span[data-type='math_inline']") as HTMLElement)
    if (!mathEl) return
    const code = (mathEl.dataset?.value || mathEl.textContent || '').trim()
    const ov = ensureOverlayHost()
    const hostRc = (_root as HTMLElement).getBoundingClientRect()
    const rc = mathEl.getBoundingClientRect()
    const wrap = document.createElement('div')
    wrap.className = 'ov-katex'
    wrap.style.position = 'absolute'
    wrap.style.pointerEvents = 'none'
    wrap.style.left = Math.max(0, rc.left - hostRc.left) + 'px'
    wrap.style.top = Math.max(0, rc.top - hostRc.top) + 'px'
    wrap.style.width = Math.max(10, rc.width) + 'px'
    const inner = document.createElement('div')
    inner.style.pointerEvents = 'auto'
    inner.style.background = 'var(--wysiwyg-bg)'
    inner.style.borderRadius = '4px'
    inner.style.padding = '6px'
    inner.style.boxSizing = 'border-box'
    inner.style.display = 'flex'
    inner.style.alignItems = 'stretch'
    const ta = document.createElement('textarea')
    ta.value = ((mathEl.dataset?.type === 'math_block' || mathEl.tagName === 'DIV') ? ('$$\n' + (code || '') + '\n$$') : ('$' + (code || '') + '$'))
    ta.style.width = '100%'
    ta.style.minHeight = (mathEl.dataset?.type === 'math_block' ? Math.max(40, rc.height) : 32) + 'px'
    ta.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
    ta.style.fontSize = '14px'
    ta.style.lineHeight = '1.4'
    ta.style.resize = 'vertical'
    ta.addEventListener('keydown', (ev) => {
      if ((ev as KeyboardEvent).key === 'Escape') { try { ov?.removeChild(wrap) } catch {}; return }
      if ((ev as KeyboardEvent).key === 'Enter' && ((ev as KeyboardEvent).ctrlKey || (ev as KeyboardEvent).metaKey)) {
        ev.preventDefault()
        let v = ta.value
        v = String(v || '').trim(); const isBlock = (mathEl.dataset?.type === 'math_block' || mathEl.tagName === 'DIV'); if (isBlock) { const m = v.match(/^\s*\$\$\s*[\r\n]?([\s\S]*?)\s*[\r\n]?\$\$\s*$/); if (m) v = m[1] } else { const m = v.match(/^\s*\$([\s\S]*?)\$\s*$/); if (m) v = m[1] }; updateMilkdownMathFromDom(mathEl, v)
        try { ov?.removeChild(wrap) } catch {}
      }
    })
    ta.addEventListener('blur', () => { try { ov?.removeChild(wrap) } catch {} })
    inner.appendChild(ta)
    wrap.appendChild(inner)
    ov?.appendChild(wrap)
    setTimeout(() => { try { ta.focus(); ta.select() } catch {} }, 0)
  } catch {}
}
function renderMermaidNow() {
  const host = getHost()
  const ov = ensureOverlayHost()
  if (!host || !ov) return

  // 如果激活的 mermaid 源码块发生变化，则移除旧的覆盖层，避免残留
  try {
    if (_activeMermaidPre !== _lastMermaidPre) {
      const all = ov.querySelectorAll('.ov-mermaid')
      all.forEach(el => { try { (el as HTMLElement).parentElement?.removeChild(el) } catch {} })
      _lastMermaidPre = _activeMermaidPre
    }
  } catch {}

  // 还原此前被隐藏的源码元素
  try {
    const hiddenElements = host.querySelectorAll('[data-wysiwyg-hidden="true"]')
    hiddenElements.forEach((el) => {
      try {
        (el as HTMLElement).style.color = ''
        (el as HTMLElement).style.userSelect = ''
        (el as HTMLElement).style.minHeight = ''
        el.removeAttribute('data-wysiwyg-hidden')
      } catch {}
    })
  } catch {}

  // 清空之前的覆盖层
// (disabled) 不再强制清空覆盖层，避免闪烁
  const hostRc = (_root as HTMLElement).getBoundingClientRect()

  // Mermaid 覆盖渲染
  try {
    const pres: HTMLElement[] = _activeMermaidPre ? [_activeMermaidPre] : []
    for (const pre of pres) {
      try {
        const codeEl = pre.querySelector('code') as HTMLElement | null
        const langFromClass = codeEl ? /\blanguage-([\w-]+)\b/.exec(codeEl.className || '')?.[1] : ''
        const langFromAttr = (pre.getAttribute('data-language') || pre.getAttribute('data-lang') || '').toLowerCase()
        const lang = (langFromAttr || langFromClass || '').toLowerCase()

        if (lang === 'mermaid') {
          const code = (codeEl?.textContent || '').trim()
          const cached = _renderedMermaid.get(pre)
          if (cached === code) {
            try {
              const rc = pre.getBoundingClientRect()
              const exist = ov.querySelector('.ov-mermaid') as HTMLDivElement | null
              if (exist) {
                exist.style.left = Math.max(0, rc.left - hostRc.left) + 'px'
                exist.style.top = Math.max(0, rc.bottom - hostRc.top + 6) + 'px'
                exist.style.width = Math.max(10, rc.width) + 'px'
              } else {
                const wrap = document.createElement('div')
                wrap.className = 'ov-mermaid'
                wrap.style.position = 'absolute'
                wrap.style.left = Math.max(0, rc.left - hostRc.left) + 'px'
                wrap.style.top = Math.max(0, rc.bottom - hostRc.top + 6) + 'px'
                wrap.style.width = Math.max(10, rc.width) + 'px'
                wrap.style.pointerEvents = 'none'
                wrap.style.cursor = 'text'
                wrap.style.zIndex = '10'
                const inner = document.createElement('div')
                inner.style.pointerEvents = 'none'
                inner.style.background = 'var(--wysiwyg-bg)'
                inner.style.borderRadius = '4px'
                inner.style.padding = '8px'
                inner.style.opacity = '1'
                inner.style.minHeight = '20px'
                inner.style.boxSizing = 'border-box'
                wrap.appendChild(inner)
                ov.appendChild(wrap)
                void (async () => { try { await renderMermaidInto(inner, code) } catch {} })()
              }
            } catch {}
            continue
          }

          _renderedMermaid.set(pre, code)
          const rc = pre.getBoundingClientRect()

          // 生成 Mermaid 覆盖层
          const wrap = document.createElement('div')
          wrap.className = 'ov-mermaid'
          wrap.style.position = 'absolute'
          wrap.style.left = Math.max(0, rc.left - hostRc.left) + 'px'
          wrap.style.top = Math.max(0, rc.bottom - hostRc.top + 6) + 'px'
          wrap.style.width = Math.max(10, rc.width) + 'px'
          wrap.style.pointerEvents = 'none'
          wrap.style.cursor = 'text'
          wrap.style.zIndex = '10'

          const inner = document.createElement('div')
          inner.style.pointerEvents = 'none'
          inner.style.background = 'var(--wysiwyg-bg)'
          inner.style.borderRadius = '4px'
          inner.style.padding = '8px'
          inner.style.opacity = '0'
          inner.style.transition = 'opacity 0.15s ease-in'
          inner.style.minHeight = '20px'
          inner.style.boxSizing = 'border-box'

          // 双击进入局部源码编辑（不切换整页）
          wrap.addEventListener('dblclick', (e) => {
            e.stopPropagation()
            try { wrap.style.display = 'none' } catch {}
            try { pre.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch {}
            try {
              const range = document.createRange()
              const sel = window.getSelection()
              range.selectNodeContents(pre)
              sel?.removeAllRanges()
              sel?.addRange(range)
              if (codeEl) (codeEl as any).focus?.()
            } catch {}
          })

          wrap.appendChild(inner)
          ov.appendChild(wrap)

          // 隐藏源码
// keep source visible: pre.style.color untouched
// keep source selectable
// keep source attributes unchanged

          // 渲染 Mermaid 并立即调整占位高度，避免遮挡后文
          void (async () => {
            await renderMermaidInto(inner, code)
            try {
              const renderedHeight = inner.getBoundingClientRect().height
              const sourceHeight = pre.getBoundingClientRect().height
// keep source minHeight unchanged
            } catch {}
            requestAnimationFrame(() => { try { inner.style.opacity = '1' } catch {} })
          })()
        }
      } catch {}
    }
  } catch {}







}
// =============== 所见模式内编辑快捷：加粗 / 斜体 / 链接 ===============
export async function wysiwygV2ToggleBold() {
  if (!_editor) return
  const { toggleStrongCommand } = await import('@milkdown/preset-commonmark')
  await _editor.action((ctx) => { ctx.get(commandsCtx).call((toggleStrongCommand as any).key) })
}
export async function wysiwygV2ToggleItalic() {
  if (!_editor) return
  const { toggleEmphasisCommand } = await import('@milkdown/preset-commonmark')
  await _editor.action((ctx) => { ctx.get(commandsCtx).call((toggleEmphasisCommand as any).key) })
}
export async function wysiwygV2ApplyLink(href: string, title?: string) {
  if (!_editor) return
  const { toggleLinkCommand, updateLinkCommand } = await import('@milkdown/preset-commonmark')
  await _editor.action((ctx) => {
    const commands = ctx.get(commandsCtx)
    // 优先：尝试对选区插入/切换链接
    if (!commands.call((toggleLinkCommand as any).key, { href, title })) {
      // 其次：若已存在 mark，则尝试在当前 mark 上更新
      commands.call((updateLinkCommand as any).key, { href, title })
    }
  })
}




