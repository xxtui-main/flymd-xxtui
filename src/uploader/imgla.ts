import { invoke } from '@tauri-apps/api/core'
import type { ImgLaUploaderConfig } from './types'

function isTauriRuntime(): boolean {
  try {
    // @ts-ignore
    return typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__)
  } catch { return false }
}

async function tryPluginHttp(): Promise<{ fetch?: any; Body?: any; ResponseType?: any } | null> {
  try {
    const mod: any = await import('@tauri-apps/plugin-http')
    if (mod && typeof mod.fetch === 'function' && mod.Body) return { fetch: mod.fetch, Body: mod.Body, ResponseType: mod.ResponseType }
    return null
  } catch { return null }
}

function joinApi(baseUrl: string, path: string): string {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '')
  const p = String(path || '').trim().replace(/^\/+/, '')
  return `${base}/${p}`
}

async function recordUploadHistoryIfPossible(
  remoteKey: number,
  pathname: string,
  publicUrl: string,
  cfg: ImgLaUploaderConfig,
  fileName: string,
  contentType: string,
  size: number,
): Promise<void> {
  if (!isTauriRuntime()) return
  try {
    const id = `imgla-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
    const uploadedAt = new Date().toISOString()
    const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : undefined
    await invoke('flymd_record_uploaded_image', {
      record: {
        id,
        bucket: 'imgla',
        key: pathname || String(remoteKey || ''),
        public_url: publicUrl,
        uploaded_at: uploadedAt,
        file_name: fileName,
        content_type: contentType,
        size: safeSize,
        provider: 'imgla',
        remote_key: remoteKey,
        album_id: cfg.albumId ?? undefined,
      },
    } as any)
  } catch (e) {
    console.warn('[Uploader] 记录 ImgLa 上传历史失败', e)
  }
}

export async function uploadImageToImgLa(
  input: Blob | ArrayBuffer | Uint8Array,
  fileName: string,
  contentType: string,
  cfg: ImgLaUploaderConfig,
): Promise<{ key: string; publicUrl: string; remoteKey: number }> {
  const baseUrl = cfg.baseUrl
  const token = cfg.token
  const url = joinApi(baseUrl, '/api/v1/upload')

  // ImgLa/Lsky Pro+：multipart/form-data + Bearer token
  const blob = (() => {
    try {
      if (input instanceof Blob) return input
      if (input instanceof ArrayBuffer) return new Blob([new Uint8Array(input)], { type: contentType || 'application/octet-stream' })
      return new Blob([input], { type: contentType || 'application/octet-stream' })
    } catch {
      return new Blob([], { type: contentType || 'application/octet-stream' })
    }
  })()

  const file = (() => {
    try {
      if (blob instanceof File) return blob
    } catch {}
    try {
      return new File([blob], fileName || 'image', { type: contentType || blob.type || 'application/octet-stream' })
    } catch {
      // Safari/某些环境没有 File 构造器
      return blob as any
    }
  })()

  const form = new FormData()
  form.append('file', file as any)
  form.append('strategy_id', String(cfg.strategyId || 1))
  if (cfg.albumId) form.append('album_id', String(cfg.albumId))
  // permission: 0=公开（与示例一致）；如后续要支持可加 UI
  form.append('permission', '0')

  // 优先使用 Tauri plugin-http（绕开 CORS），否则退回 fetch（网页版通常会被 CORS 拦）
  let text = ''
  if (isTauriRuntime()) {
    const client = await tryPluginHttp()
    if (client && client.fetch) {
      const headers: Record<string, string> = {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      }
      const req: any = { method: 'POST', headers }
      if (client.ResponseType) req.responseType = client.ResponseType.Text
      if (client.Body && typeof client.Body.form === 'function') req.body = client.Body.form(form)
      else req.body = form
      const resp: any = await client.fetch(url, req)
      const status = Number(resp?.status || 0) || 0
      const ok = resp?.ok === true || (status >= 200 && status < 300)
      text = typeof resp?.text === 'function' ? String(await resp.text()) : String(resp?.data || '')
      if (!ok) throw new Error(`ImgLa 上传失败（HTTP ${status || 0}）：${text || 'unknown'}`)
    } else {
      // 某些运行环境下前端无法加载 plugin-http：走后端 reqwest 代理上传，彻底绕开 CORS
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()))
      const resp: any = await invoke('flymd_imgla_upload', {
        req: {
          baseUrl,
          token,
          strategyId: cfg.strategyId || 1,
          albumId: cfg.albumId ?? undefined,
          fileName: fileName || 'image',
          contentType: contentType || blob.type || 'application/octet-stream',
          bytes,
        },
      } as any)
      const publicUrl = String(resp?.public_url || resp?.publicUrl || resp?.public_url || '').trim()
      const pathname = String(resp?.pathname || '').trim()
      const remoteKey = Number(resp?.key || 0) || 0
      if (!publicUrl || !remoteKey) {
        throw new Error('ImgLa 返回数据不完整（缺少 url/key）')
      }
      await recordUploadHistoryIfPossible(
        remoteKey,
        pathname,
        publicUrl,
        cfg,
        fileName,
        contentType || blob.type || 'application/octet-stream',
        (() => {
          try {
            if (typeof (blob as any).size === 'number') return (blob as any).size
          } catch {}
          return 0
        })(),
      )
      return { key: pathname || String(remoteKey), publicUrl, remoteKey }
    }
  } else {
    const resp2 = await fetch(url, { method: 'POST', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, body: form })
    text = await resp2.text()
    if (!resp2.ok) throw new Error(`ImgLa 上传失败（HTTP ${resp2.status}）：${text || 'unknown'}`)
  }

  const data = (() => { try { return JSON.parse(text) } catch { return null } })()
  const out = data && (data.data ?? data?.result ?? data)
  const links = out?.links || out?.data?.links
  const publicUrl = String(links?.url || '').trim()
  const pathname = String(out?.pathname || '').trim()
  const remoteKey = Number(out?.key || 0) || 0
  if (!publicUrl || !remoteKey) {
    throw new Error('ImgLa 返回数据不完整（缺少 url/key）')
  }

  await recordUploadHistoryIfPossible(
    remoteKey,
    pathname,
    publicUrl,
    cfg,
    fileName,
    contentType || blob.type || 'application/octet-stream',
    (() => {
      try {
        if (typeof (blob as any).size === 'number') return (blob as any).size
      } catch {}
      return 0
    })(),
  )

  return { key: pathname || String(remoteKey), publicUrl, remoteKey }
}
