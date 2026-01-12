// 粘贴上传适配：将图片粘贴/拖拽转为文档中的 image 节点
import type { Uploader } from '@milkdown/kit/plugin/upload'
import type { Node as ProseNode, Schema } from '@milkdown/prose/model'
import type { AnyUploaderConfig } from '../../../uploader/types'
import { uploadImageToCloud } from '../../../uploader/upload'
import { transcodeToWebpIfNeeded } from '../../../utils/image'
// 本地保存：在未启用图床或开启“总是保存到本地”时，将粘贴/拖拽的图片写入 images/ 或默认粘贴目录
// 文件保存交给外层（main.ts）以避免在插件侧直接依赖 Tauri 插件

async function getAlwaysLocal(): Promise<boolean> {
  try { const fn = (window as any).flymdAlwaysSaveLocalImages; return typeof fn === 'function' ? !!(await fn()) : false } catch { return false }
}
async function getCurrentPath(): Promise<string | null> {
  try { const fn = (window as any).flymdGetCurrentFilePath; return typeof fn === 'function' ? (await fn()) : null } catch { return null }
}
async function getDefaultPasteDir(): Promise<string | null> {
  try { const fn = (window as any).flymdGetDefaultPasteDir; return typeof fn === 'function' ? (await fn()) : null } catch { return null }
}
function pathJoin(a: string, b: string): string { const sep = a.includes('\\') ? '\\' : '/'; return a.replace(/[\\/]+$/, '') + sep + b.replace(/^[\\/]+/, '') }
function needAngle(url: string): boolean { return /[\s()]/.test(url) || /^[a-zA-Z]:/.test(url) || /\\/.test(url) }
function toFileUri(p: string): string {
  try {
    const s = String(p || '').trim()
    if (!s) return s
    if (/^file:/i.test(s)) return s
    // UNC: \\server\share\path -> file://server/share/path
    if (/^\\\\/.test(s)) {
      const rest = s.replace(/^\\\\/, '')
      const i = rest.indexOf('\\')
      const host = i >= 0 ? rest.substring(0, i) : rest
      const tail = i >= 0 ? rest.substring(i + 1) : ''
      const norm = tail.replace(/\\/g, '/').replace(/^\/+/, '')
      return `file://${host}${norm ? '/' + encodeURI(norm) : ''}`
    }
    // Windows 盘符: C:\\a\\b -> file:///C:/a/b
    if (/^[a-zA-Z]:[\\/]/.test(s)) {
      const norm = s.replace(/\\/g, '/').replace(/^\/+/, '')
      return 'file:///' + encodeURI(norm)
    }
    // Unix 绝对路径: /a/b -> file:///a/b
    if (/^\//.test(s)) return 'file://' + encodeURI(s)
    return s
  } catch { return p }
}

export const uploader: Uploader = async (files, schema) => {
  console.log('[Paste] uploader 被调用, files.length:', files.length)
  const images: File[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files.item(i)
    if (!f) continue
    if (!f.type.includes('image')) continue
    images.push(f)
  }
  console.log('[Paste] 筛选出的图片数量:', images.length)
  const nodes: ProseNode[] = []
  const alwaysLocal = await getAlwaysLocal()
  console.log('[Paste] alwaysLocal:', alwaysLocal)

  for (const img of images) {
    console.log('[Paste] 处理图片:', img.name, 'size:', img.size, 'type:', img.type)
    let localPath: string | null = null
    let cloudUrl: string | null = null

    // 1) 检查图床配置
    const cfgGetter = (typeof window !== 'undefined') ? (window as any).flymdGetUploaderConfig : null
    const upCfg: AnyUploaderConfig | null = typeof cfgGetter === 'function' ? await cfgGetter() : null
    const uploaderEnabled = upCfg && upCfg.enabled
    console.log('[Paste] uploaderEnabled:', uploaderEnabled, 'upCfg:', upCfg)

    // 2) 先尝试保存本地（如果未启用图床，或启用了"总是保存到本地"）
    if (!uploaderEnabled || alwaysLocal) {
      console.log('[Paste] 尝试保存本地...')
      try {
        const saver = (window as any).flymdSaveImageToLocalAndGetPath
        console.log('[Paste] saver 函数存在:', typeof saver === 'function')
        if (typeof saver === 'function') {
          localPath = await saver(img, img.name || 'image')
          console.log('[Paste] 本地保存结果:', localPath)
        }
      } catch (e) {
        console.error('[Paste] 本地保存失败:', e)
      }
    } else {
      console.log('[Paste] 跳过本地保存（图床已启用且未勾选总是保存到本地）')
    }

    // 3) 再尝试上传图床（如果启用了图床）
    if (uploaderEnabled) {
      console.log('[Paste] 尝试上传图床...')
      try {
        let fileForUpload: Blob = img
        let nameForUpload: string = img.name || 'image'
        let typeForUpload: string = img.type || 'application/octet-stream'
        try {
          if ((upCfg as any)?.convertToWebp) {
            const r = await transcodeToWebpIfNeeded(img, nameForUpload, (upCfg as any)?.webpQuality ?? 0.85, { skipAnimated: true })
            fileForUpload = r.blob
            nameForUpload = r.fileName
            typeForUpload = r.type || 'image/webp'
          }
        } catch {}
        const res = await uploadImageToCloud(fileForUpload, nameForUpload, typeForUpload, upCfg)
        cloudUrl = res?.publicUrl || ''
        console.log('[Paste] 图床上传结果:', cloudUrl)
      } catch (e) {
        console.error('[Paste] 图床上传失败:', e)
      }
    } else {
      console.log('[Paste] 跳过图床上传（图床未启用）')
    }

    // 4) 根据结果决定使用哪个URL
    let finalUrl: string | null = null
    if (cloudUrl) {
      // 如果图床上传成功，使用图床URL（即使本地也保存了）
      finalUrl = cloudUrl
      console.log('[Paste] 使用图床URL')
    } else if (localPath) {
      // 如果图床失败或未启用，但本地保存成功，使用本地路径
      finalUrl = toFileUri(localPath)
      console.log('[Paste] 使用本地路径, 转换后的 fileUri:', finalUrl)
    }

    // 5) 创建图片节点
    if (finalUrl) {
      const n = schema.nodes.image.createAndFill({ src: finalUrl, alt: img.name }) as ProseNode
      if (n) {
        console.log('[Paste] 创建图片节点成功, src:', finalUrl)
        nodes.push(n)
        continue
      }
    }

    // 6) 兜底：base64（仅在所有方式都失败时使用）
    console.warn('[Paste] 所有方式都失败，使用 base64 兜底')
    try {
      const dataUrl = await toDataUrl(img)
      const n = schema.nodes.image.createAndFill({ src: dataUrl, alt: img.name }) as ProseNode
      if (n) {
        console.log('[Paste] base64 节点创建成功')
        nodes.push(n)
      }
    } catch (e) {
      console.error('[Paste] base64 兜底失败:', e)
    }
  }
  console.log('[Paste] 返回节点数量:', nodes.length)
  return nodes
}

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const fr = new FileReader()
      fr.onerror = () => reject(fr.error || new Error('read error'))
      fr.onload = () => resolve(String(fr.result || ''))
      fr.readAsDataURL(file)
    } catch (e) { reject(e) }
  })
}


