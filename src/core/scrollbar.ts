/**
 * 滚动条自动隐藏模块
 * 实现滚动时显示，停止 2 秒后自动隐藏的效果
 * 支持鼠标悬停保持显示
 */

// 隐藏延迟时间（毫秒）
const HIDE_DELAY = 2000

// 全局定时器（所有容器共用一个定时器）
let hideTimer: number | null = null

// RAF 节流标志
let rafPending = false

// 鼠标悬停状态标志
let isHoveringScrollbar = false

// 需要监听的滚动容器选择器
const SCROLL_CONTAINER_SELECTORS = [
  '.preview',              // 预览区
  '#editor',               // 编辑器
  '.library',              // 文件库侧栏
  '.theme-panel',          // 主题选择面板
  '.upl-body',             // 上传配置面板
  '.ext-body',             // 扩展管理面板
  'body',                  // 全局滚动
]

// WYSIWYG 编辑区域选择器（用于鼠标移动检测）
const WYSIWYG_AREA_SELECTORS = [
  '#md-wysiwyg-root',
  '.ProseMirror',
  '.milkdown',
]

/**
 * 显示滚动条
 */
function showScrollbar(): void {
  try {
    document.body.setAttribute('data-scrollbar-visible', 'true')
  } catch (err) {
    console.warn('[Scrollbar] 显示滚动条失败', err)
  }
}

/**
 * 隐藏滚动条（仅在未悬停时执行）
 */
function hideScrollbar(): void {
  try {
    // 如果鼠标正在悬停滚动条，不隐藏
    if (isHoveringScrollbar) {
      return
    }
    document.body.setAttribute('data-scrollbar-visible', 'false')
  } catch (err) {
    console.warn('[Scrollbar] 隐藏滚动条失败', err)
  }
}

/**
 * 滚动事件处理函数（使用 RAF 节流）
 */
function handleScroll(): void {
  if (rafPending) return

  rafPending = true
  requestAnimationFrame(() => {
    rafPending = false

    // 立即显示滚动条
    showScrollbar()

    // 清除现有定时器
    if (hideTimer !== null) {
      clearTimeout(hideTimer)
      hideTimer = null
    }

    // 设置新定时器：2 秒后隐藏
    hideTimer = window.setTimeout(() => {
      hideScrollbar()
      hideTimer = null
    }, HIDE_DELAY)
  })
}

/**
 * 已绑定监听器的元素集合（避免重复绑定）
 */
const boundElements = new WeakSet<Element>()

/**
 * 为指定容器添加滚动监听
 */
function addScrollListener(element: Element): void {
  try {
    // 避免重复绑定
    if (boundElements.has(element)) {
      return
    }

    element.addEventListener('scroll', handleScroll, { passive: true })
    boundElements.add(element)
  } catch (err) {
    console.warn('[Scrollbar] 添加滚动监听失败', element, err)
  }
}

/**
 * 批量绑定滚动监听器
 */
function bindScrollListeners(): void {
  SCROLL_CONTAINER_SELECTORS.forEach(selector => {
    try {
      const elements = document.querySelectorAll(selector)
      elements.forEach(el => addScrollListener(el))
    } catch (err) {
      console.warn(`[Scrollbar] 绑定选择器 ${selector} 失败`, err)
    }
  })
}

/**
 * 检测鼠标是否在滚动条区域
 * WebKit 滚动条宽度：8px（全局）/12px（预览）/4px（侧栏）
 */
function isMouseOverScrollbar(event: MouseEvent, target: Element): boolean {
  try {
    const rect = target.getBoundingClientRect()
    const scrollbarWidth = 15 // 保守估计滚动条宽度（考虑最大 12px + 边距）

    // 垂直滚动条检测（右侧）
    const isOverVerticalScrollbar = event.clientX >= rect.right - scrollbarWidth

    // 水平滚动条检测（底部）
    const isOverHorizontalScrollbar = event.clientY >= rect.bottom - scrollbarWidth

    return isOverVerticalScrollbar || isOverHorizontalScrollbar
  } catch (err) {
    return false
  }
}

/**
 * 鼠标移动事件处理（检测是否在 WYSIWYG 编辑区域或滚动条上）
 */
function handleMouseMove(event: MouseEvent): void {
  try {
    const target = event.target as Element
    if (!target) return

    // 检查是否在 WYSIWYG 编辑区域内
    const isInWysiwygArea = WYSIWYG_AREA_SELECTORS.some(selector => {
      try {
        return target.matches(selector) || target.closest(selector)
      } catch {
        return false
      }
    })

    // 如果在 WYSIWYG 区域内，显示滚动条并重置定时器
    if (isInWysiwygArea) {
      showScrollbar()

      // 清除现有定时器
      if (hideTimer !== null) {
        clearTimeout(hideTimer)
        hideTimer = null
      }

      // 设置新定时器：2 秒后隐藏
      hideTimer = window.setTimeout(() => {
        hideScrollbar()
        hideTimer = null
      }, HIDE_DELAY)

      return
    }

    // 检查目标元素是否是其他滚动容器
    const isScrollContainer = SCROLL_CONTAINER_SELECTORS.some(selector => {
      try {
        return target.matches(selector) || target.closest(selector)
      } catch {
        return false
      }
    })

    if (!isScrollContainer) {
      if (isHoveringScrollbar) {
        isHoveringScrollbar = false
        // 鼠标离开滚动条，重启隐藏计时器
        if (hideTimer !== null) {
          clearTimeout(hideTimer)
        }
        hideTimer = window.setTimeout(() => {
          hideScrollbar()
          hideTimer = null
        }, HIDE_DELAY)
      }
      return
    }

    // 获取真实的滚动容器元素
    const scrollContainer = target.matches(SCROLL_CONTAINER_SELECTORS.join(','))
      ? target
      : target.closest(SCROLL_CONTAINER_SELECTORS.join(','))

    if (!scrollContainer) return

    // 检测是否悬停在滚动条上
    const wasHovering = isHoveringScrollbar
    isHoveringScrollbar = isMouseOverScrollbar(event, scrollContainer)

    // 状态变化时处理
    if (isHoveringScrollbar && !wasHovering) {
      // 刚进入滚动条区域
      showScrollbar()
      // 取消隐藏定时器
      if (hideTimer !== null) {
        clearTimeout(hideTimer)
        hideTimer = null
      }
    } else if (!isHoveringScrollbar && wasHovering) {
      // 刚离开滚动条区域
      // 重启隐藏计时器
      if (hideTimer !== null) {
        clearTimeout(hideTimer)
      }
      hideTimer = window.setTimeout(() => {
        hideScrollbar()
        hideTimer = null
      }, HIDE_DELAY)
    }
  } catch (err) {
    console.warn('[Scrollbar] 鼠标移动处理失败', err)
  }
}

/**
 * 监听 DOM 变化，自动绑定新创建的滚动容器
 */
function setupMutationObserver(): void {
  try {
    const observer = new MutationObserver((mutations) => {
      let needsRescan = false

      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const element = node as Element

            // 检查新节点是否匹配滚动容器选择器
            SCROLL_CONTAINER_SELECTORS.forEach(selector => {
              try {
                if (element.matches?.(selector) || element.querySelectorAll?.(selector).length > 0) {
                  needsRescan = true
                }
              } catch {}
            })
          }
        })
      })

      // 延迟扫描，避免频繁触发
      if (needsRescan) {
        setTimeout(() => bindScrollListeners(), 100)
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  } catch (err) {
    console.warn('[Scrollbar] MutationObserver 设置失败', err)
  }
}

/**
 * 定期重新扫描滚动容器（确保动态创建的元素被监听）
 */
function startPeriodicRescan(): void {
  // 初始扫描
  bindScrollListeners()

  // 多次延迟扫描，确保捕捉到异步创建的元素
  const delays = [500, 1000, 2000, 3000]
  delays.forEach(delay => {
    setTimeout(() => bindScrollListeners(), delay)
  })
}

/**
 * 初始化滚动条自动隐藏功能
 * 在 DOM 加载完成后调用
 */
export function initAutoHideScrollbar(): void {
  try {
    // 初始状态：隐藏滚动条
    hideScrollbar()

    // 启动定期重新扫描
    startPeriodicRescan()

    // 监听 DOM 变化，处理动态创建的容器
    setupMutationObserver()

    // 绑定全局鼠标移动监听（检测 WYSIWYG 区域和滚动条悬停）
    document.addEventListener('mousemove', handleMouseMove, { passive: true })
  } catch (err) {
    console.error('[Scrollbar] 初始化失败', err)
    throw err
  }
}

/**
 * 手动触发重新扫描（供外部调用，例如模式切换后）
 */
export function rescanScrollContainers(): void {
  try {
    bindScrollListeners()
  } catch (err) {
    console.warn('[Scrollbar] 重新扫描失败', err)
  }
}

/**
 * 清理资源（用于测试或页面卸载）
 */
export function cleanupAutoHideScrollbar(): void {
  try {
    if (hideTimer !== null) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    document.removeEventListener('mousemove', handleMouseMove)
    showScrollbar() // 恢复显示
    isHoveringScrollbar = false
  } catch (err) {
    console.warn('[Scrollbar] 清理失败', err)
  }
}
