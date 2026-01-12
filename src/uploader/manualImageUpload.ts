// 右键单张图片上传到图床（S3/R2 或 ImgLa）
// 设计原则：
// - 只做一件事：从当前右键命中的图片读取本地文件 -> 上传到图床 -> 生成 Markdown 并复制到剪贴板
// - 不改动文档内容，避免破坏用户现有引用（Never break userspace）
// - 允许在关闭“自动图床”的情况下，仍然手动上传当前图片

import { readFile } from '@tauri-apps/plugin-fs'
import { Store } from '@tauri-apps/plugin-store'
import type { ContextMenuContext } from '../ui/contextMenus'
import type { AnyUploaderConfig } from './types'
import { uploadImageToCloud } from './upload'
import { transcodeToWebpIfNeeded } from '../utils/image'
import { NotificationManager } from '../core/uiNotifications'
import { parseUploaderConfigForManagement } from './storeConfig'

let _store: Store | null = null

async function getStore(): Promise<Store | null> {
  if (_store) return _store
  try {
    _store = await Store.load('flymd-settings.json')
    return _store
  } catch {
    return null
  }
}

async function getManualUploaderConfig(): Promise<AnyUploaderConfig | null> {
  try {
    const store = await getStore()
    if (!store) return null
    const up = await store.get('uploader')
    const cfg = parseUploaderConfigForManagement(up as any, { enabledOnly: false })
    if (!cfg) return null
    // 手动上传不受 enabled 开关限制，这里强制视为启用
    return { ...cfg, enabled: true }
  } catch {
    return null
  }
}

function normalizeRawSrc(raw: string): string {
  let s = String(raw || '').trim()
  if (!s) return ''
  // 去掉 Markdown 尖括号 <...>
  if (s.startsWith('<') && s.endsWith('>')) s = s.slice(1, -1)
  try {
    s = decodeURIComponent(s)
  } catch {}
  return s
}

function resolveLocalPathFromDom(ctx: ContextMenuContext): { absPath: string; fileName: string } | null {
  const el = ctx.targetElement as HTMLElement | null
  const img = el?.closest('img') as HTMLImageElement | null
  if (!img) return null

  // 优先使用预览渲染阶段写入的 data-abs-path（已经是本地绝对路径）
  let abs = (img.getAttribute('data-abs-path') || '').trim()
  if (!abs) {
    // 所见模式或其它来源：尝试基于原始 src 推断本地路径
    const raw =
      img.getAttribute('data-raw-src') ||
      img.getAttribute('data-flymd-src-raw') ||
      img.getAttribute('src') ||
      ''
    let s = normalizeRawSrc(raw)
    if (!s) return null
    // 跳过 data/blob/asset/http(s)
    if (/^(data:|blob:|asset:|https?:)/i.test(s)) return null

    // file:// 形式 -> 本地路径
    if (/^file:/i.test(s)) {
      try {
        const u = new URL(s)
        let p = u.pathname || ''
        if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1)
        p = decodeURIComponent(p)
        if (/^[a-zA-Z]:\//.test(p)) p = p.replace(/\//g, '\\')
        abs = p
      } catch {
        abs = s.replace(/^file:\/\//i, '')
      }
    } else if (/^(?:%5[cC]){2}/.test(s)) {
      // 被编码的 UNC：%5C%5Cserver%5Cshare%5C...
      try {
        const unc = decodeURIComponent(s)
        abs = unc.replace(/\//g, '\\')
      } catch {
        abs = s.replace(/%5[cC]/g, '\\')
      }
    } else if (/^[a-zA-Z]:[\\/]/.test(s) || /^\\\\/.test(s) || /^\//.test(s)) {
      // Windows 盘符 / UNC / Unix 绝对路径
      abs = s
      if (/^[a-zA-Z]:\//.test(abs) || /^\\\\/.test(abs)) {
        abs = abs.replace(/\//g, '\\')
      }
    } else if (ctx.filePath) {
      // 相对路径：相对于当前文档目录解析
      const baseFile = String(ctx.filePath || '')
      const base = baseFile.replace(/[\\/][^\\/]*$/, '')
      const sep = base.includes('\\') ? '\\' : '/'
      const parts = (base + sep + s).split(/[\\/]+/)
      const stack: string[] = []
      for (const p of parts) {
        if (!p || p === '.') continue
        if (p === '..') {
          stack.pop()
          continue
        }
        stack.push(p)
      }
      abs = base.includes('\\') ? stack.join('\\') : '/' + stack.join('/')
    } else {
      return null
    }
  }

  abs = abs.trim()
  if (!abs) return null
  const fileName = abs.split(/[\\/]/).pop() || 'image'
  return { absPath: abs, fileName }
}

function guessMimeFromPath(path: string): string {
  const m = (path || '').toLowerCase().match(/\.([a-z0-9]+)$/)
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

async function copyTextToClipboard(text: string): Promise<boolean> {
  const s = String(text || '')
  if (!s) return false
  let ok = false
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(s)
      ok = true
    }
  } catch {}
  if (!ok) {
    try {
      const ta = document.createElement('textarea')
      ta.value = s
      ta.style.position = 'fixed'
      ta.style.left = '-9999px'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      ok = true
    } catch {}
  }
  return ok
}

export async function uploadImageFromContextMenu(ctx: ContextMenuContext): Promise<void> {
  try {
    const el = ctx.targetElement as HTMLElement | null
    const img = el?.closest('img') as HTMLImageElement | null
    if (!img) {
      NotificationManager.show('plugin-error', '当前右键目标不是图片', 2200)
      return
    }

    const cfg = await getManualUploaderConfig()
    if (!cfg) {
      NotificationManager.show(
        'plugin-error',
        '尚未配置图床：请先在“图床设置”中填写所选图床的必要信息',
        3200,
      )
      return
    }

    const resolved = resolveLocalPathFromDom(ctx)
    if (!resolved) {
      NotificationManager.show('plugin-error', '仅支持上传本地图片（当前图片不是本地文件路径）', 3000)
      return
    }

    const { absPath, fileName } = resolved
    let bytes: Uint8Array
    try {
      bytes = (await readFile(absPath as any)) as any
    } catch (e) {
      console.error('[Uploader] 读取本地图片失败', e)
      NotificationManager.show('plugin-error', '读取本地图片失败，无法上传', 3000)
      return
    }

    let nameForUpload = fileName
    let mime = guessMimeFromPath(absPath)
    let input: Blob | Uint8Array = bytes

    try {
      if (cfg.convertToWebp) {
        const blob = new Blob([bytes], { type: mime })
        const r = await transcodeToWebpIfNeeded(blob, nameForUpload, cfg.webpQuality ?? 0.85, {
          skipAnimated: true,
        })
        input = r.blob
        nameForUpload = r.fileName
        mime = r.type || 'image/webp'
      }
    } catch (e) {
      console.warn('[Uploader] WebP 转码失败，回退为原图上传', e)
      input = bytes
    }

    let publicUrl: string
    try {
      const res = await uploadImageToCloud(input, nameForUpload, mime, cfg)
      publicUrl = res.publicUrl
    } catch (e: any) {
      console.error('[Uploader] 单图上传失败', e)
      const msg = e && typeof e.message === 'string' ? e.message : String(e || '未知错误')
      NotificationManager.show('plugin-error', '图片上传失败：' + msg, 3600)
      return
    }

    const baseName = nameForUpload.replace(/\.[^.]+$/, '') || 'image'
    const markdown = `![${baseName}](${publicUrl})`
    const copied = await copyTextToClipboard(markdown)
    if (copied) {
      NotificationManager.show(
        'plugin-success',
        '图片已上传到图床，Markdown 已复制到剪贴板',
        2600,
      )
    } else {
      NotificationManager.show(
        'plugin-success',
        '图片已上传到图床，Markdown 已生成但复制失败，请手动复制',
        3200,
      )
    }
  } catch (e) {
    console.error('[Uploader] 右键图片上传出现未预期异常', e)
    NotificationManager.show('plugin-error', '图片上传过程中出现异常', 3200)
  }
}

