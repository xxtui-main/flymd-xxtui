// 粘贴/拖拽图片与本地保存/图床入口逻辑
// 从 main.ts 拆分，保留行为不变，通过依赖注入与宿主交互

import { transcodeToWebpIfNeeded } from '../utils/image'
import type { AnyUploaderConfig } from '../uploader/types'
import { getUploaderProviderFromRaw } from '../uploader/storeConfig'

export type ImagePasteDeps = {
  // 文本编辑与预览
  getEditorValue(): string
  setEditorValue(v: string): void
  insertAtCursor(text: string): void
  markDirtyAndRefresh(): void

  // 路径与文件系统
  getCurrentFilePath(): string | null
  ensureDir(dir: string): Promise<void>
  writeBinaryFile(path: string, bytes: Uint8Array): Promise<void>
  exists(path: string): Promise<boolean>

  // 运行环境
  isTauriRuntime(): boolean

  // 偏好与配置
  getAlwaysSaveLocalImages(): Promise<boolean>
  getUploaderConfig(): Promise<AnyUploaderConfig | null>
  getTranscodePrefs(): Promise<{
    saveLocalAsWebp: boolean
    webpQuality: number
  }>

  // 默认粘贴目录
  getDefaultPasteDir(): Promise<string | null>
  // 用户图片目录（作为未保存文档的兜底目录）
  getUserPicturesDir(): Promise<string | null>
}

// 供所见 V2 调用：将粘贴/拖拽的图片保存到本地，并返回可写入 Markdown 的路径
export async function saveImageToLocalAndGetPathCore(
  deps: ImagePasteDeps,
  file: File,
  fname: string,
): Promise<string | null> {
  console.log('[saveImageToLocal] 被调用, fname:', fname, 'file.size:', file.size)
  try {
    const alwaysLocal = await deps.getAlwaysSaveLocalImages()
    const upCfg = await deps.getUploaderConfig()
    console.log('[saveImageToLocal] alwaysLocal:', alwaysLocal, 'upCfg:', upCfg)

    const uploaderEnabled = !!(upCfg && upCfg.enabled)
    const shouldSaveLocal = !uploaderEnabled || alwaysLocal
    console.log(
      '[saveImageToLocal] uploaderEnabled:',
      uploaderEnabled,
      'shouldSaveLocal:',
      shouldSaveLocal,
    )

    if (!shouldSaveLocal) {
      console.log('[saveImageToLocal] 不需要保存到本地，返回 null')
      return null
    }

    const { saveLocalAsWebp, webpQuality } = await deps.getTranscodePrefs()
    let blobForSave: Blob = file
    let nameForSave: string = fname
    try {
      if (saveLocalAsWebp) {
        const r = await transcodeToWebpIfNeeded(file, fname, webpQuality, {
          skipAnimated: true,
        })
        blobForSave = r.blob
        nameForSave = r.fileName
      }
    } catch {}

    const guessExt = (): string => {
      try {
        const byName = (nameForSave || '')
          .toLowerCase()
          .match(/\.([a-z0-9]+)$/)?.[1]
        if (byName) return byName
        const t = (blobForSave.type || '').toLowerCase()
        if (t.includes('webp')) return 'webp'
        if (t.includes('png')) return 'png'
        if (t.includes('jpeg')) return 'jpg'
        if (t.includes('jpg')) return 'jpg'
        if (t.includes('gif')) return 'gif'
        if (t.includes('bmp')) return 'bmp'
        if (t.includes('avif')) return 'avif'
        if (t.includes('svg')) return 'svg'
        return 'png'
      } catch {
        return 'png'
      }
    }
    const two = (n: number) => (n < 10 ? '0' + n : '' + n)
    const makeName = () => {
      const d = new Date()
      const ts = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(
        d.getDate(),
      )}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
      const rand = Math.random().toString(36).slice(2, 6)
      return `pasted-${ts}-${rand}.${guessExt()}`
    }
    const ensureUniquePath = async (dir: string): Promise<string> => {
      const sep = dir.includes('\\') ? '\\' : '/'
      for (let i = 0; i < 50; i++) {
        const name = makeName()
        const full = dir.replace(/[\\/]+$/, '') + sep + name
        try {
          if (!(await deps.exists(full))) return full
        } catch {}
      }
      const d = Date.now()
      return (
        dir.replace(/[\\/]+$/, '') +
        (dir.includes('\\') ? '\\' : '/') +
        `pasted-${d}.png`
      )
    }

    const writeTo = async (targetDir: string): Promise<string> => {
      try {
        await deps.ensureDir(targetDir)
      } catch {}
      const dst = await ensureUniquePath(targetDir)
      const buf = new Uint8Array(await blobForSave.arrayBuffer())
      await deps.writeBinaryFile(dst, buf)
      return dst
    }

    if (deps.isTauriRuntime() && deps.getCurrentFilePath()) {
      const base = deps.getCurrentFilePath()!.replace(/[\\/][^\\/]*$/, '')
      const sep = base.includes('\\') ? '\\' : '/'
      const imgDir = base + sep + 'images'
      console.log('[saveImageToLocal] 使用文档同目录 images 文件夹:', imgDir)
      const result = await writeTo(imgDir)
      console.log('[saveImageToLocal] 保存成功:', result)
      return result
    }
    if (deps.isTauriRuntime() && !deps.getCurrentFilePath()) {
      const baseDir = await deps.getDefaultPasteDir()
      console.log('[saveImageToLocal] 使用默认粘贴目录:', baseDir)
      if (baseDir) {
        const base2 = baseDir.replace(/[\\/]+$/, '')
        const result = await writeTo(base2)
        console.log('[saveImageToLocal] 保存成功:', result)
        return result
      }

      // 若用户未配置默认粘贴目录，则回退到系统图片目录（与源码模式保持一致）
      const picDir = await deps.getUserPicturesDir()
      console.log('[saveImageToLocal] 默认粘贴目录为空，尝试用户图片目录:', picDir)
      if (picDir) {
        const base2 = picDir.replace(/[\\/]+$/, '')
        const result = await writeTo(base2)
        console.log('[saveImageToLocal] 使用用户图片目录保存成功:', result)
        return result
      }
    }
    console.log('[saveImageToLocal] 没有合适的保存路径，返回 null')
    return null
  } catch (e) {
    console.error('[saveImageToLocal] 异常:', e)
    return null
  }
}

// 切换图床总开关（菜单入口）
export async function toggleUploaderEnabledFromMenuCore(
  deps: {
    getStore(): Promise<any | null> | any | null
    pluginNotice(msg: string, level: 'ok' | 'err', ms?: number): void
  },
  uploaderEnabledSnapshot: boolean,
): Promise<boolean> {
  try {
    const store = await deps.getStore()
    if (!store) {
      deps.pluginNotice('设置尚未初始化，暂无法切换图床开关', 'err', 2200)
      return uploaderEnabledSnapshot
    }
    const raw = ((await store.get('uploader')) as any) || {}
    const current = !!raw.enabled
    if (!current) {
      const provider = getUploaderProviderFromRaw(raw)
      if (provider === 'imgla') {
        const token = String(raw.imglaToken ?? raw.token ?? '').trim()
        if (!token) {
          deps.pluginNotice('请先在“图床设置”中填写 ImgLa 令牌', 'err', 2600)
          return current
        }
      } else {
        if (!raw.accessKeyId || !raw.secretAccessKey || !raw.bucket) {
          deps.pluginNotice('请先在“图床设置”中填写 AccessKey / Secret / Bucket', 'err', 2600)
          return current
        }
      }
    }
    raw.enabled = !current
    await store.set('uploader', raw)
    await store.save()
    const next = !!raw.enabled
    deps.pluginNotice(
      next ? '图床上传已开启' : '图床上传已关闭',
      'ok',
      1600,
    )
    return next
  } catch (err) {
    console.error('toggle uploader failed', err)
    deps.pluginNotice('切换图床开关失败', 'err', 2000)
    return uploaderEnabledSnapshot
  }
}
