import { readFile } from '@tauri-apps/plugin-fs'

function normalizeRawSrc(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return ''
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1)
  try { s = decodeURIComponent(s) } catch {}
  return s
}

function guessMimeFromPath(path: string): string {
  const p = String(path || '').toLowerCase()
  const m = p.match(/\.([a-z0-9]+)$/)
  switch (m?.[1]) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    case 'bmp':
      return 'image/bmp'
    case 'avif':
      return 'image/avif'
    case 'ico':
      return 'image/x-icon'
    case 'svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    try {
      const fr = new FileReader()
      fr.onerror = () => reject(fr.error || new Error('读取 Blob 失败'))
      fr.onload = () => resolve(String(fr.result || ''))
      fr.readAsDataURL(blob)
    } catch (e) {
      reject(e as any)
    }
  })
}

async function fetchAsBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  return await res.blob()
}

function getSelectionRangeInside(root: HTMLElement): Range | null {
  try {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount <= 0) return null
    if (sel.isCollapsed) return null
    const range = sel.getRangeAt(0)
    const ca = range.commonAncestorContainer
    const el = (ca.nodeType === Node.ELEMENT_NODE ? (ca as Element) : (ca.parentElement as Element | null))
    if (!el) return null
    if (!root.contains(el)) return null
    return range
  } catch {
    return null
  }
}

export function hasSelectionInside(root: HTMLElement): boolean {
  return !!getSelectionRangeInside(root)
}

async function embedImgSrcAsDataUrl(img: HTMLImageElement): Promise<boolean> {
  try {
    const srcAttr =
      img.getAttribute('data-raw-src') ||
      img.getAttribute('data-flymd-src-raw') ||
      img.getAttribute('src') ||
      ''
    const rawSrc = normalizeRawSrc(srcAttr)
    const absPath = String(img.getAttribute('data-abs-path') || '').trim()

    // 已经是 data: 就不折腾
    const curSrc = String(img.getAttribute('src') || '').trim()
    if (/^data:/i.test(curSrc)) {
      try { img.removeAttribute('data-abs-path') } catch {}
      try { img.removeAttribute('data-raw-src') } catch {}
      try { img.removeAttribute('data-flymd-src-raw') } catch {}
      return true
    }

    // 优先本地绝对路径：稳定，不吃 CORS
    if (absPath) {
      const bytes = (await readFile(absPath as any)) as any
      const mime = guessMimeFromPath(absPath)
      const dataUrl = await blobToDataUrl(new Blob([bytes], { type: mime }))
      img.setAttribute('src', dataUrl)
      try { img.removeAttribute('data-abs-path') } catch {}
      try { img.removeAttribute('data-raw-src') } catch {}
      try { img.removeAttribute('data-flymd-src-raw') } catch {}
      return true
    }

    // 其次尝试 fetch 当前 src/rawSrc（可能会被 CORS/鉴权拦住）
    const url = normalizeRawSrc(curSrc) || rawSrc
    if (!url) return false
    if (/^(data:)/i.test(url)) return true

    const blob = await fetchAsBlob(url)
    const dataUrl = await blobToDataUrl(blob)
    img.setAttribute('src', dataUrl)
    try { img.removeAttribute('data-abs-path') } catch {}
    try { img.removeAttribute('data-raw-src') } catch {}
    try { img.removeAttribute('data-flymd-src-raw') } catch {}
    return true
  } catch {
    return false
  }
}

export async function copySelectionAsRichHtmlWithEmbeddedImages(
  root: HTMLElement,
): Promise<{ ok: boolean; totalImages: number; embeddedImages: number }> {
  try {
    const range = getSelectionRangeInside(root)
    if (!range) return { ok: false, totalImages: 0, embeddedImages: 0 }

    const sel = window.getSelection()
    const textFallback = String(sel?.toString() || '')

    const frag = range.cloneContents()
    const wrapper = document.createElement('div')
    wrapper.appendChild(frag)

    const images = Array.from(wrapper.querySelectorAll('img')) as HTMLImageElement[]
    let embedded = 0
    for (const img of images) {
      const ok = await embedImgSrcAsDataUrl(img)
      if (ok) embedded++
    }

    const html = wrapper.innerHTML
    const nav = navigator as any
    const ClipboardItemCtor = (window as any).ClipboardItem
    if (nav.clipboard && typeof nav.clipboard.write === 'function' && ClipboardItemCtor && html) {
      const item = new ClipboardItemCtor({
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([textFallback], { type: 'text/plain' }),
      })
      await nav.clipboard.write([item])
      return { ok: true, totalImages: images.length, embeddedImages: embedded }
    }

    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(textFallback)
      return { ok: true, totalImages: images.length, embeddedImages: 0 }
    }
    return { ok: false, totalImages: images.length, embeddedImages: 0 }
  } catch {
    return { ok: false, totalImages: 0, embeddedImages: 0 }
  }
}

export async function copyImageFromDom(img: HTMLImageElement): Promise<boolean> {
  try {
    const absPath = String(img.getAttribute('data-abs-path') || '').trim()
    let blob: Blob | null = null
    let mime = 'image/png'

    if (absPath) {
      const bytes = (await readFile(absPath as any)) as any
      mime = guessMimeFromPath(absPath)
      blob = new Blob([bytes], { type: mime })
    } else {
      const srcAttr =
        img.getAttribute('data-raw-src') ||
        img.getAttribute('data-flymd-src-raw') ||
        img.getAttribute('src') ||
        ''
      const url = normalizeRawSrc(srcAttr) || String(img.src || '')
      if (!url) return false
      blob = await fetchAsBlob(url)
      mime = blob.type || mime
    }

    const nav = navigator as any
    const ClipboardItemCtor = (window as any).ClipboardItem
    if (!nav.clipboard || typeof nav.clipboard.write !== 'function' || !ClipboardItemCtor) return false
    const item = new ClipboardItemCtor({ [mime]: blob })
    await nav.clipboard.write([item])
    return true
  } catch {
    return false
  }
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const s = String(text || '')
  if (!s) return false
  try {
    const nav = navigator as any
    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(s)
      return true
    }
  } catch {}
  try {
    const ta = document.createElement('textarea')
    ta.value = s
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    return true
  } catch {
    return false
  }
}

export function getImageLinkForCopy(img: HTMLImageElement): string {
  const raw =
    img.getAttribute('data-raw-src') ||
    img.getAttribute('data-flymd-src-raw') ||
    img.getAttribute('src') ||
    ''
  return normalizeRawSrc(raw) || String(img.src || '').trim()
}

