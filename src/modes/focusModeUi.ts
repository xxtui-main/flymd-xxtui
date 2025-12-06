// 专注模式 UI 集成：标题栏显示/隐藏、模式事件处理与侧栏背景同步
// 只依赖从 main.ts 注入的最小状态/行为，避免再次形成巨石入口

type Mode = 'edit' | 'preview'

// 专注模式事件处理所需依赖
export type FocusModeEventsDeps = {
  // 专注模式状态
  isFocusModeEnabled: () => boolean
  setFocusModeFlag: (enabled: boolean) => void

  // 编辑模式状态
  getMode: () => Mode
  setMode: (m: Mode) => void
  getWysiwyg: () => boolean

  // 所见模式开关
  setWysiwygEnabled: (enabled: boolean) => Promise<void>

  // 便签模式：避免与自动模式切换冲突
  getStickyNoteMode: () => boolean

  // 预览面板引用（用于在源码/阅读模式之间切换时隐藏/显示）
  getPreviewElement: () => HTMLDivElement | null

  // UI 同步
  syncToggleButton: () => void
  notifyModeChange: () => void

  // 侧栏背景刷新
  updateFocusSidebarBg: () => void
}

// 专注模式下侧栏背景所需依赖
export type FocusSidebarBgDeps = {
  isFocusModeEnabled: () => boolean
  getMode: () => Mode
  getWysiwyg: () => boolean
}

// 初始化专注模式相关的事件监听（标题栏 hover 区 + 主题面板事件）
export function initFocusModeEventsImpl(deps: FocusModeEventsDeps): void {
  const triggerZone = document.getElementById('focus-trigger-zone')
  const titlebar = document.querySelector('.titlebar') as HTMLElement | null
  if (!triggerZone || !titlebar) return

  let focusTitlebarShowTimer: number | null = null
  let focusTitlebarHideTimer: number | null = null

  // 鼠标进入顶部触发区域：延迟显示 titlebar
  triggerZone.addEventListener('mouseenter', () => {
    if (!deps.isFocusModeEnabled()) return
    if (focusTitlebarHideTimer) { clearTimeout(focusTitlebarHideTimer); focusTitlebarHideTimer = null }
    if (focusTitlebarShowTimer) return
    focusTitlebarShowTimer = window.setTimeout(() => {
      focusTitlebarShowTimer = null
      if (deps.isFocusModeEnabled()) titlebar.classList.add('show')
    }, 150)
  })

  // 鼠标进入 titlebar：保持显示
  titlebar.addEventListener('mouseenter', () => {
    if (!deps.isFocusModeEnabled()) return
    if (focusTitlebarHideTimer) { clearTimeout(focusTitlebarHideTimer); focusTitlebarHideTimer = null }
    if (focusTitlebarShowTimer) { clearTimeout(focusTitlebarShowTimer); focusTitlebarShowTimer = null }
    titlebar.classList.add('show')
  })

  // 鼠标离开 titlebar：延迟隐藏
  titlebar.addEventListener('mouseleave', () => {
    if (!deps.isFocusModeEnabled()) return
    if (focusTitlebarShowTimer) { clearTimeout(focusTitlebarShowTimer); focusTitlebarShowTimer = null }
    if (focusTitlebarHideTimer) { clearTimeout(focusTitlebarHideTimer); focusTitlebarHideTimer = null }
    focusTitlebarHideTimer = window.setTimeout(() => {
      focusTitlebarHideTimer = null
      if (deps.isFocusModeEnabled() && !titlebar.matches(':hover')) titlebar.classList.remove('show')
    }, 300)
  })

  // 窗口大小变化时（最大化/还原）：检查并隐藏 titlebar
  window.addEventListener('resize', () => {
    if (!deps.isFocusModeEnabled()) return
    // 清除所有计时器
    if (focusTitlebarShowTimer) { clearTimeout(focusTitlebarShowTimer); focusTitlebarShowTimer = null }
    if (focusTitlebarHideTimer) { clearTimeout(focusTitlebarHideTimer); focusTitlebarHideTimer = null }
    // 延迟检查，等待窗口状态稳定
    focusTitlebarHideTimer = window.setTimeout(() => {
      focusTitlebarHideTimer = null
      if (deps.isFocusModeEnabled() && !titlebar.matches(':hover') && !triggerZone.matches(':hover')) {
        titlebar.classList.remove('show')
      }
    }, 200)
  })

  // 监听来自主题面板开关的专注模式切换事件
  window.addEventListener('flymd:focus:toggle', async (ev: Event) => {
    const detail = (ev as CustomEvent).detail || {}
    const enabled = !!detail.enabled
    deps.setFocusModeFlag(enabled)
    // 如果退出专注模式，确保 titlebar 可见
    if (!deps.isFocusModeEnabled()) {
      titlebar.classList.remove('show')
    }
    // 更新侧栏背景色
    deps.updateFocusSidebarBg()
  })

  // 所见模式默认开关：主题面板勾选后，立即同步当前模式并持久化
  window.addEventListener('flymd:wysiwyg:default', async (ev: Event) => {
    try {
      const detail = (ev as CustomEvent).detail || {}
      const enabled = !!detail.enabled
      // 便签模式下不自动切换所见模式，避免与简化界面冲突
      if (deps.getStickyNoteMode()) return
      if (enabled !== deps.getWysiwyg()) {
        await deps.setWysiwygEnabled(enabled)
      }
    } catch {}
  })

  // 源码模式默认开关：主题面板勾选后，立即切换当前模式
  window.addEventListener('flymd:sourcemode:default', async (ev: Event) => {
    try {
      const detail = (ev as CustomEvent).detail || {}
      const enabled = !!detail.enabled

      // 便签模式下不自动切换
      if (deps.getStickyNoteMode()) return

      if (enabled) {
        // 启用源码模式：切换到 edit 模式，关闭所见模式
        if (deps.getWysiwyg()) {
          await deps.setWysiwygEnabled(false)
        }
        if (deps.getMode() !== 'edit') {
          deps.setMode('edit')
          const preview = deps.getPreviewElement()
          // 刷新 UI
          try { preview?.classList.add('hidden') } catch {}
          try { deps.syncToggleButton() } catch {}
          try { deps.notifyModeChange() } catch {}
        }
      }
      // 如果禁用源码模式，不做任何操作（保持当前模式）
    } catch {}
  })
}

// 更新专注模式下侧栏背景色：跟随编辑区背景色和网格设置
export function updateFocusSidebarBgImpl(deps: FocusSidebarBgDeps): void {
  const library = document.querySelector('.library') as HTMLElement | null
  if (!library) return

  // 如果不是专注模式，移除自定义背景色和网格，使用默认
  if (!deps.isFocusModeEnabled()) {
    library.style.removeProperty('background-color')
    library.style.removeProperty('background-image')
    library.style.removeProperty('background-size')
    library.style.removeProperty('background-position')
    const header = library.querySelector('.lib-header') as HTMLElement | null
    if (header) {
      header.style.removeProperty('background-color')
      header.style.removeProperty('background-image')
      header.style.removeProperty('background-size')
      header.style.removeProperty('background-position')
    }
    return
  }

  // 专注模式下，获取编辑区的实际背景色
  let bgColor = '#ffffff' // 默认白色
  let hasGrid = false

  // 检查容器是否有网格背景
  const container = document.querySelector('.container') as HTMLElement | null
  if (container) {
    hasGrid = container.classList.contains('edit-grid-bg')

    // 根据当前模式获取对应的背景色
    const computedStyle = window.getComputedStyle(container)

    // 优先获取容器的背景色
    const containerBg = computedStyle.backgroundColor
    if (containerBg && containerBg !== 'transparent' && containerBg !== 'rgba(0, 0, 0, 0)') {
      bgColor = containerBg
    }
  }

  // 如果容器背景色无效，尝试从编辑器获取
  const editor = document.querySelector('.editor') as HTMLElement | null
  if (editor && bgColor === '#ffffff') {
    const computedStyle = window.getComputedStyle(editor)
    const editorBg = computedStyle.backgroundColor
    // 如果获取到有效的背景色（不是透明），使用它
    if (editorBg && editorBg !== 'transparent' && editorBg !== 'rgba(0, 0, 0, 0)') {
      bgColor = editorBg
    }
  }

  const header = library.querySelector('.lib-header') as HTMLElement | null

  // 应用背景色到库侧栏
  if (hasGrid && deps.getMode() === 'edit' && !deps.getWysiwyg()) {
    // 只在源码模式（非所见）下应用网格背景
    library.style.backgroundColor = bgColor
    library.style.backgroundImage = 'linear-gradient(rgba(127,127,127,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(127,127,127,0.08) 1px, transparent 1px)'
    library.style.backgroundSize = '20px 20px'
    library.style.backgroundPosition = '-1px -1px'

    if (header) {
      header.style.backgroundColor = 'transparent'
      header.style.backgroundImage = 'none'
      header.style.backgroundSize = 'unset'
      header.style.backgroundPosition = 'unset'
    }
  } else {
    // 没有网格或不是源码模式，只应用纯色背景
    library.style.backgroundColor = bgColor
    library.style.removeProperty('background-image')
    library.style.removeProperty('background-size')
    library.style.removeProperty('background-position')

    if (header) {
      header.style.backgroundColor = bgColor
      header.style.removeProperty('background-image')
      header.style.removeProperty('background-size')
      header.style.removeProperty('background-position')
    }
  }
}
