// 自动保存模块（与 main.ts 解耦）
// 负责：
// - 自动保存定时器调度
// - 状态持久化（Tauri Store）
// - 右下角通知提示

import type { Store } from '@tauri-apps/plugin-store'
import { NotificationManager } from './uiNotifications'
import { t } from '../i18n'

const AUTO_SAVE_INTERVAL_MS = 60_000

// 依赖通过注入提供，避免直接耦合到 main.ts
export interface AutoSaveDeps {
  // 是否有未保存更改
  getDirty(): boolean
  // 当前文件路径（未保存为 null）
  getCurrentFilePath(): string | null
  // 执行一次保存（复用现有保存逻辑）
  saveFile: () => Promise<void>
  // 当前环境是否具备实际写文件能力（Tauri 桌面）
  canWriteFile: () => boolean
  // 获取配置存储（可能尚未初始化）
  getStore: () => Store | null
}

export interface AutoSaveHandles {
  // 当前是否启用自动保存
  isEnabled(): boolean
  // 显式设置启用状态
  setEnabled(next: boolean): void
  // 开关切换
  toggle(): void
  // 从 Store 中恢复状态（需在 initStore 之后调用）
  loadFromStore(): Promise<void>
}

export function initAutoSave(deps: AutoSaveDeps): AutoSaveHandles {
  let enabled = false
  let timer: number | null = null
  let busy = false

  function exposeToWindow() {
    try { ;(window as any).flymdAutoSaveEnabled = enabled } catch {}
  }

  function updateTimer() {
    try {
      if (!enabled) {
        if (timer != null) {
          window.clearInterval(timer)
          timer = null
        }
        return
      }
      if (timer != null) return
      timer = window.setInterval(() => { void tick() }, AUTO_SAVE_INTERVAL_MS)
    } catch {}
  }

  async function tick(): Promise<void> {
    if (!enabled) return
    if (busy) return
    if (!deps.getDirty()) return
    if (!deps.getCurrentFilePath()) return
    if (!deps.canWriteFile()) return
    busy = true
    try {
      await deps.saveFile()
    } catch (e) {
      console.error('[AutoSave] 自动保存失败:', e)
    } finally {
      busy = false
    }
  }

  async function persist(next: boolean): Promise<void> {
    try {
      const store = deps.getStore()
      if (!store) return
      await store.set('autoSave', { enabled: next })
      await store.save()
    } catch {}
  }

  async function loadFromStore(): Promise<void> {
    try {
      const store = deps.getStore()
      if (!store) return
      const raw = (await store.get('autoSave')) as any
      if (raw && typeof raw.enabled === 'boolean') {
        enabled = !!raw.enabled
        exposeToWindow()
        updateTimer()
      }
    } catch {}
  }

  function notifyEnabledOnce(prev: boolean, next: boolean) {
    if (!next || prev === next) return
    try {
      const msg = t('autosave.enabled' as any) || '自动保存已开启'
      NotificationManager.show('plugin-success', msg, 2000)
    } catch {}
  }

  function setEnabled(next: boolean): void {
    const prev = enabled
    enabled = next
    exposeToWindow()
    updateTimer()
    void persist(next)
    notifyEnabledOnce(prev, next)
  }

  function toggle(): void {
    setEnabled(!enabled)
  }

  function isEnabled(): boolean {
    return enabled
  }

  // 初始同步一次全局标记（默认为关闭）
  exposeToWindow()

  return {
    isEnabled,
    setEnabled,
    toggle,
    loadFromStore,
  }
}

