// 库侧栏右键菜单 UI 模块
// 从 main.ts 拆分：负责文件树右键菜单的 DOM 与交互

import { t } from '../i18n'
import type { LibSortMode } from '../core/librarySort'

export type LibraryContextMenuDeps = {
  getCurrentFilePath(): string | null
  isDirty(): boolean
  normalizePath(p: string): string
  getLibraryRoot(): Promise<string | null>
  newFileSafe(dir: string): Promise<string>
  newFolderSafe(dir: string): Promise<void>
  renameFileSafe(path: string, newName: string): Promise<string>
  deleteFileSafe(path: string, toTrash: boolean): Promise<void>
  openFile(path: string): Promise<void>
  ensureTreeInitialized(): Promise<void>
  refreshTree(): Promise<void>
  updateTitle(): void
  confirmNative(msg: string): Promise<boolean>
  exists(path: string): Promise<boolean>
  askOverwrite(msg: string): Promise<boolean>
  moveFileSafe(src: string, dst: string): Promise<void>
  setSort(mode: LibSortMode): Promise<void>
  applySortToTree(mode: LibSortMode): Promise<void>
  clearFolderOrderForParent(path: string): Promise<void>
  onAfterDeleteCurrent(): void
}

let _libCtxKeyHandler: ((e: KeyboardEvent) => void) | null = null

export function initLibraryContextMenu(deps: LibraryContextMenuDeps): void {
  document.addEventListener('contextmenu', (ev) => {
    const target = ev.target as HTMLElement
    const row = target?.closest?.('.lib-node') as HTMLElement | null
    if (!row) return
    const tree = document.getElementById('lib-tree') as HTMLDivElement | null
    if (!tree || !tree.contains(row)) return
    ev.preventDefault()
    const path = (row as any).dataset?.path as string || ''
    const isDir = row.classList.contains('lib-dir')

    let menu = document.getElementById('lib-ctx') as HTMLDivElement | null
    if (!menu) {
      menu = document.createElement('div') as HTMLDivElement
      menu.id = 'lib-ctx'
      menu.style.position = 'absolute'
      menu.style.zIndex = '9999'
      menu.style.background = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#fff'
      menu.style.color = getComputedStyle(document.documentElement).getPropertyValue('--fg') || '#111'
      menu.style.border = '1px solid ' + (getComputedStyle(document.documentElement).getPropertyValue('--border') || '#e5e7eb')
      menu.style.borderRadius = '8px'
      menu.style.boxShadow = '0 8px 24px rgba(0,0,0,0.2)'
      menu.style.minWidth = '160px'
      menu.addEventListener('click', (e2) => e2.stopPropagation())
      document.body.appendChild(menu)
    }

    const mkItem = (txt: string, act: () => void) => {
      const a = document.createElement('div') as HTMLDivElement
      a.textContent = txt
      a.style.padding = '8px 12px'
      a.style.cursor = 'pointer'
      a.addEventListener('mouseenter', () => { a.style.background = 'rgba(127,127,127,0.12)' })
      a.addEventListener('mouseleave', () => { a.style.background = 'transparent' })
      a.addEventListener('click', () => { act(); hide() })
      return a
    }

    const hide = () => {
      if (menu) { menu.style.display = 'none' }
      document.removeEventListener('click', onDoc)
      if (_libCtxKeyHandler) {
        document.removeEventListener('keydown', _libCtxKeyHandler)
        _libCtxKeyHandler = null
      }
    }
    const onDoc = () => hide()
    menu.innerHTML = ''

    // 文件节点专属操作：在新实例中打开 / 生成便签
    if (!isDir) {
      menu.appendChild(mkItem(t('ctx.openNewInstance'), async () => {
        try {
          const win = window as any
          const openFn = win?.flymdOpenInNewInstance as ((p: string) => Promise<void>) | undefined
          if (typeof openFn !== 'function') {
            alert('当前环境不支持新实例打开，请直接从系统中双击该文件。')
            return
          }
          try {
            const cur = deps.getCurrentFilePath() ? deps.normalizePath(deps.getCurrentFilePath() as string) : ''
            const target = deps.normalizePath(path)
            if (cur && cur === target && deps.isDirty()) {
              alert('当前文档有未保存的更改，禁止在新实例中打开。\n请先保存后再尝试。')
              return
            }
          } catch {}
          await openFn(path)
        } catch (e) {
          console.error('[库树] 新实例打开文档失败:', e)
        }
      }))

      menu.appendChild(mkItem(t('ctx.createSticky'), async () => {
        try {
          const win = window as any
          const createFn = win?.flymdCreateStickyNote as ((p: string) => Promise<void>) | undefined
          if (typeof createFn !== 'function') {
            alert('当前环境不支持便签功能。')
            return
          }
          try {
            const cur = deps.getCurrentFilePath() ? deps.normalizePath(deps.getCurrentFilePath() as string) : ''
            const target = deps.normalizePath(path)
            if (cur && cur === target && deps.isDirty()) {
              const saveFn = win?.flymdSaveFile as (() => Promise<void>) | undefined
              if (typeof saveFn === 'function') {
                try {
                  await saveFn()
                } catch (err) {
                  console.error('[库树] 自动保存失败:', err)
                  alert('自动保存失败，无法生成便签。')
                  return
                }
              }
            }
          } catch {}
          await createFn(path)
        } catch (e) {
          console.error('[库树] 生成便签失败:', e)
        }
      }))
    }

    if (isDir) {
      menu.appendChild(mkItem(t('ctx.newFile'), async () => {
        try {
          let p2 = await deps.newFileSafe(path)
          const oldName = p2.split(/[\\/]+/).pop() || ''
          const m = oldName.match(/^(.*?)(\.[^.]+)$/)
          const stem = m ? m[1] : oldName
          const ext = m ? m[2] : '.md'
          const win = window as any
          const renameDialog = win?.flymdOpenRenameDialog as ((stem: string, ext: string) => Promise<string | null>) | undefined
          let newStem = stem
          if (typeof renameDialog === 'function') {
            const v = await renameDialog(stem, ext)
            if (v && v !== stem) newStem = v
          }
          if (newStem && newStem !== stem) {
            const newName = newStem + ext
            p2 = await deps.renameFileSafe(p2, newName)
          }
          await deps.openFile(p2)
        } catch (e) {
          console.error('新建失败', e)
        }
      }))

      menu.appendChild(mkItem(t('ctx.newFolder'), async () => {
        try {
          await deps.newFolderSafe(path)
          await deps.ensureTreeInitialized()
          await deps.refreshTree()
        } catch (e) {
          console.error('新建文件夹失败', e)
        }
      }))
    }

    menu.appendChild(mkItem(t('ctx.moveTo'), async () => {
      try {
        const root = await deps.getLibraryRoot()
        if (!root) {
          alert('请先选择库目录')
          return
        }
        const win = window as any
        const isInside = win?.flymdIsInside as ((root: string, p: string) => boolean) | undefined
        if (!isInside || !isInside(root, path)) {
          alert('仅允许移动库内文件/文件夹')
          return
        }
        const openDlg = win?.flymdOpenDirectory as ((defaultDir: string) => Promise<string>) | undefined
        if (typeof openDlg !== 'function') {
          alert('该功能需要在 Tauri 应用中使用')
          return
        }
        const defaultDir = path.replace(/[\\/][^\\/]*$/, '')
        const dest = await openDlg(defaultDir || root)
        if (!dest) return
        if (!isInside(root, dest)) {
          alert('仅允许移动到库目录内')
          return
        }
        const name = (path.split(/[\\/]+/).pop() || '')
        const sep = dest.includes('\\') ? '\\' : '/'
        const dst = dest.replace(/[\\/]+$/, '') + sep + name
        if (dst === path) return
        if (await deps.exists(dst)) {
          const ok = await deps.askOverwrite('目标已存在，是否覆盖？')
          if (!ok) return
        }
        await deps.moveFileSafe(path, dst)
        await deps.refreshTree()
      } catch (e) {
        console.error('移动失败', e)
      }
    }))

    const doRename = async () => {
      try {
        const win = window as any
        const rename = win?.flymdRenamePathWithDialog as ((p: string) => Promise<void>) | undefined
        if (typeof rename === 'function') {
          await rename(path)
        }
      } catch (e) {
        console.error('重命名失败', e)
      }
    }

    const doDelete = async () => {
      try {
        const confirmMsg = isDir
          ? '确定删除该文件夹及其所有内容？将移至回收站'
          : '确定删除该文件？将移至回收站'
        const ok = await deps.confirmNative(confirmMsg)
        if (!ok) return
        await deps.deleteFileSafe(path, false)
        deps.onAfterDeleteCurrent()
        await deps.ensureTreeInitialized()
        await deps.refreshTree()
      } catch (e) {
        console.error('删除失败', e)
      }
    }

    menu.appendChild(mkItem(t('ctx.rename'), () => { void doRename() }))
    menu.appendChild(mkItem(t('ctx.delete'), () => { void doDelete() }))

    try {
      const sep = document.createElement('div') as HTMLDivElement
      sep.style.borderTop = '1px solid ' + (getComputedStyle(document.documentElement).getPropertyValue('--border') || '#e5e7eb')
      sep.style.margin = '6px 0'
      menu.appendChild(sep)
      const applySort = async (mode: LibSortMode) => {
        await deps.setSort(mode)
        await deps.applySortToTree(mode)
      }
      menu.appendChild(mkItem(t('ctx.sortNameAsc'), () => { void applySort('name_asc') }))
      menu.appendChild(mkItem(t('ctx.sortNameDesc'), () => { void applySort('name_desc') }))
      menu.appendChild(mkItem(t('ctx.sortTimeDesc'), () => { void applySort('mtime_desc') }))
      menu.appendChild(mkItem(t('ctx.sortTimeAsc'), () => { void applySort('mtime_asc') }))

      if (isDir) {
        menu.appendChild(mkItem('恢复当前文件夹排序', async () => {
          try {
            await deps.clearFolderOrderForParent(path)
            await deps.refreshTree()
          } catch {}
        }))
      }
    } catch {}

    // 先临时展示再根据实际尺寸计算位置，避免菜单在窗口底部被截断
    menu.style.visibility = 'hidden'
    menu.style.display = 'block'

    const rect = menu.getBoundingClientRect()
    const margin = 8
    let left = ev.clientX
    let top = ev.clientY

    // 水平方向避免超出视口
    if (left + rect.width + margin > window.innerWidth) {
      left = Math.max(margin, window.innerWidth - rect.width - margin)
    }

    // 垂直方向如果放不下则向上展开
    if (top + rect.height + margin > window.innerHeight) {
      top = Math.max(margin, ev.clientY - rect.height)
      if (top + rect.height + margin > window.innerHeight) {
        // 极端情况下仍然放不下，贴底展示
        top = Math.max(margin, window.innerHeight - rect.height - margin)
      }
    }

    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
    menu.style.visibility = 'visible'

    setTimeout(() => document.addEventListener('click', onDoc, { once: true }), 0)
  })
}
