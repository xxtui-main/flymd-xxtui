// 更新相关通用工具函数
// 用于在 UI 模块与主逻辑之间复用 openInBrowser / upMsg 等能力

import { openUrl } from '@tauri-apps/plugin-opener'

export async function openInBrowser(url: string): Promise<void> {
  try {
    if (typeof window !== 'undefined' && (window as any).__flymdIsTauri === true) {
      await openUrl(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  } catch {
    try { window.open(url, '_blank', 'noopener,noreferrer') } catch {}
  }
}

export function upMsg(s: string): void {
  try {
    const status = document.getElementById('status') as HTMLDivElement | null
    if (status) status.textContent = s
  } catch {}
  try { console.log('[更新] ' + s) } catch {}
}

