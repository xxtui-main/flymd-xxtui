// Ribbon 库切换组件：在 ribbon 顶部显示库图标（简洁风格）
import type { Library } from '../utils/library'

export type RibbonLibraryListOptions = {
  getLibraries: () => Promise<Library[]>
  getActiveLibraryId: () => Promise<string | null>
  setActiveLibraryId: (id: string) => Promise<void>
  onAfterSwitch?: () => Promise<void>
}

export type RibbonLibraryListApi = {
  render: () => Promise<void>
}

export function initRibbonLibraryList(
  container: HTMLElement,
  options: RibbonLibraryListOptions
): RibbonLibraryListApi {

  async function render() {
    try {
      const allLibs = await options.getLibraries()
      const libs = allLibs.filter(lib => lib.sidebarVisible !== false)
      const activeId = await options.getActiveLibraryId()

      container.innerHTML = ''

      // 如果没有库或只有一个库，隐藏容器
      if (libs.length <= 1) {
        container.classList.add('hidden')
        // 同时隐藏分隔线
        const divider = container.nextElementSibling
        if (divider?.classList.contains('ribbon-divider')) {
          divider.classList.add('hidden')
        }
        return
      }

      container.classList.remove('hidden')
      // 显示分隔线
      const divider = container.nextElementSibling
      if (divider?.classList.contains('ribbon-divider')) {
        divider.classList.remove('hidden')
      }

      libs.forEach(lib => {
        const btn = document.createElement('button')
        btn.className = 'ribbon-lib-btn' + (lib.id === activeId ? ' active' : '')
        btn.title = lib.name || lib.id
        btn.textContent = (lib.name || lib.id).charAt(0).toUpperCase()

        btn.addEventListener('click', async () => {
          if (lib.id !== activeId) {
            try {
              await options.setActiveLibraryId(lib.id)
              await options.onAfterSwitch?.()
              await render()
            } catch (e) {
              console.error('[RibbonLibraryList] 切换库失败:', e)
            }
          }
        })

        container.appendChild(btn)
      })
    } catch (e) {
      console.error('[RibbonLibraryList] 渲染失败:', e)
    }
  }

  // 异步初始化渲染
  void render()
  return { render }
}
