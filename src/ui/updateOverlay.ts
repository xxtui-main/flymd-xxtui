// 更新对话框 UI 模块
// 从 main.ts 拆分：负责 update-overlay 的 DOM 构建与交互（检查更新细节展示等）

import { openPath } from '@tauri-apps/plugin-opener'
import type { CheckUpdateResp, UpdateAssetInfo, UpdateExtra } from '../core/updateTypes'
import { openInBrowser, upMsg } from '../core/updateUtils'

// 创建或获取更新对话框容器
export function ensureUpdateOverlay(): HTMLDivElement {
  const id = 'update-overlay'
  let ov = document.getElementById(id) as HTMLDivElement | null
  if (ov) return ov
  const div = document.createElement('div')
  div.id = id
  div.className = 'link-overlay hidden'
  div.innerHTML = `
    <div class="link-dialog" role="dialog" aria-modal="true" aria-labelledby="update-title">
      <div class="link-header">
        <div id="update-title">检查更新</div>
        <button id="update-close" class="about-close" title="关闭">×</button>
      </div>
      <div class="link-body" id="update-body"></div>
      <div class="link-actions" id="update-actions"></div>
    </div>
  `
  const container = document.querySelector('.container') as HTMLDivElement | null
  if (container) container.appendChild(div)
  const btn = div.querySelector('#update-close') as HTMLButtonElement | null
  if (btn) btn.addEventListener('click', () => div.classList.add('hidden'))
  return div
}

// Linux 更新弹窗：展示下载链接/发布页
export async function showUpdateOverlayLinux(resp: CheckUpdateResp): Promise<void> {
  const ov = ensureUpdateOverlay()
  const body = ov.querySelector('#update-body') as HTMLDivElement
  const act = ov.querySelector('#update-actions') as HTMLDivElement
  try {
    const extra = await loadUpdateExtra().catch(() => null)
    body.innerHTML = await renderUpdateDetailsHTML(resp, extra)
  } catch {
    body.innerHTML = `
      <div style="margin-bottom:8px;">发现新版本：<b>v${resp.latest}</b>（当前：v${resp.current}）</div>
      <div style="white-space:pre-wrap;max-height:240px;overflow:auto;border:1px solid var(--fg-muted);padding:8px;border-radius:6px;">${(resp.notes||'').replace(/</g,'&lt;')}</div>
    `
  }
  act.innerHTML = ''
  const mkBtn = (label: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', onClick)
    act.appendChild(b)
    return b
  }
  if (resp.assetLinuxAppimage) {
    mkBtn('下载 AppImage（直连）', () => { void openInBrowser(resp.assetLinuxAppimage!.directUrl) })
    mkBtn('下载 AppImage（代理）', () => { void openInBrowser('https://gh-proxy.com/' + resp.assetLinuxAppimage!.directUrl) })
  }
  if (resp.assetLinuxDeb) {
    mkBtn('下载 DEB（直连）', () => { void openInBrowser(resp.assetLinuxDeb!.directUrl) })
    mkBtn('下载 DEB（代理）', () => { void openInBrowser('https://gh-proxy.com/' + resp.assetLinuxDeb!.directUrl) })
  }
  mkBtn('前往发布页', () => { void openInBrowser(resp.htmlUrl) })
  mkBtn('关闭', () => ov.classList.add('hidden'))
  ov.classList.remove('hidden')
}

// 已下载安装包后的提示窗口
export function showUpdateDownloadedOverlay(savePath: string, resp: CheckUpdateResp): void {
  const ov = ensureUpdateOverlay()
  const body = ov.querySelector('#update-body') as HTMLDivElement
  const act = ov.querySelector('#update-actions') as HTMLDivElement
  const esc = (s: string) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  body.innerHTML = `
    <div style="margin-bottom:8px;">已下载新版本 <b>v${resp.latest}</b>（当前 v${resp.current}）</div>
    <div>保存位置：<code>${esc(savePath)}</code></div>
  `
  act.innerHTML = ''
  const mkBtn = (label: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', onClick)
    act.appendChild(b)
    return b
  }
  const dir = savePath.replace(/[\/\\][^\/\\]+$/, '')
  mkBtn('直接运行安装包', () => { void openPath(savePath) })
  mkBtn('打开所在文件夹', () => { if (dir) void openPath(dir) })
  mkBtn('前往发布页', () => { void openInBrowser(resp.htmlUrl) })
  mkBtn('关闭', () => ov.classList.add('hidden'))
  ov.classList.remove('hidden')
}

// 安装失败提示窗口：提示“自动安装失败，请手动安装”，提供“打开下载目录”与“发布页”
export function showInstallFailedOverlay(savePath: string, resp: CheckUpdateResp): void {
  const ov = ensureUpdateOverlay()
  const body = ov.querySelector('#update-body') as HTMLDivElement
  const act = ov.querySelector('#update-actions') as HTMLDivElement
  const esc = (s: string) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  const dir = savePath.replace(/[\\/][^\\/]+$/, '')
  body.innerHTML = `
    <div style="margin-bottom:8px;color:var(--warn-color, #d33);">自动安装失败，请手动安装</div>
    <div>保存位置：<code>${esc(savePath)}</code></div>
  `
  act.innerHTML = ''
  const mkBtn = (label: string, onClick: () => void) => {
    const b = document.createElement('button')
    b.textContent = label
    b.addEventListener('click', onClick)
    act.appendChild(b)
    return b
  }
  mkBtn('打开下载目录', () => { if (dir) void openPath(dir) })
  mkBtn('前往发布页', () => { void openInBrowser(resp.htmlUrl) })
  mkBtn('关闭', () => ov.classList.add('hidden'))
  ov.classList.remove('hidden')
}

// 读取可选的额外信息（不存在则返回 null）
export async function loadUpdateExtra(): Promise<UpdateExtra | null> {
  try {
    const url = '/update-extra.json?ts=' + Date.now()
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const raw = await res.json()
    const out: UpdateExtra = {}
    if (raw && typeof raw.html === 'string') out.html = String(raw.html)
    if (raw && Array.isArray(raw.links)) {
      out.links = []
      for (const it of raw.links) {
        const text = (it && typeof it.text === 'string') ? String(it.text) : ''
        const href = (it && typeof it.href === 'string') ? String(it.href) : ''
        if (!text || !href) continue
        // 仅允许 http/https 链接，其他协议忽略
        if (!/^https?:\/\//i.test(href)) continue
        out.links.push({ text, href })
      }
      if (out.links.length === 0) delete (out as any).links
    }
    if (!out.html && !out.links) return null
    return out
  } catch { return null }
}

// 渲染更新详情（含版本与 notes），使用 markdown-it + DOMPurify 做安全渲染；支持注入 extra
export async function renderUpdateDetailsHTML(
  resp: CheckUpdateResp,
  extra?: UpdateExtra | null,
): Promise<string> {
  // 渲染器与 DOMPurify 的初始化留在宿主中处理，通过全局函数访问
  const g: any = window as any
  if (typeof g.__flymdRenderUpdateDetailsHTML === 'function') {
    return g.__flymdRenderUpdateDetailsHTML(resp, extra)
  }
  // 兜底：退回到简单的文本替换
  const esc = (s: string) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  const notes = esc(resp.notes || '').replace(/\n/g,'<br>')
  const head = `<div class="update-title">发现新版本 <b>v${resp.latest}</b>（当前 v${resp.current}）</div>`
  const box = `<div class="update-notes" style="max-height:260px;overflow:auto;border:1px solid var(--fg-muted);padding:8px;border-radius:6px;">${notes}</div>`
  let extraHtml = ''
  if (extra && extra.html) {
    extraHtml += `<div class="update-extra" style="margin-top:8px;">${extra.html}</div>`
  }
  if (extra && extra.links && extra.links.length) {
    const items = extra.links.map(it => {
      const txt = (it.text || '').replace(/</g,'&lt;').replace(/&/g,'&amp;')
      const href = it.href
      return `<li><a href="${href}" target="_blank" rel="noopener noreferrer">${txt}</a></li>`
    }).join('')
    extraHtml += `<ul class="update-links" style="margin-top:8px;padding-left:18px;">${items}</ul>`
  }
  return head + box + extraHtml
}

