// 库管理工具（方案A实现）：统一在 flymd-settings.json 中维护 libraries/activeLibraryId
// 保持与 legacy 字段 libraryRoot 的兼容（始终与当前激活库的 root 同步）

import { Store } from '@tauri-apps/plugin-store'

// 库实体类型
export type Library = {
  id: string
  name: string
  root: string
  createdAt?: number
  lastUsedAt?: number
  // 是否在“库侧栏的库列表”中显示（默认 true；不影响顶部库切换菜单）
  sidebarVisible?: boolean
}

let _store: Store | null = null
async function getStore(): Promise<Store> {
  if (_store) return _store
  _store = await Store.load('flymd-settings.json')
  return _store
}

function normalizePath(p: string): string {
  try {
    const s = String(p || '')
    if (!s) return ''
    const norm = s.replace(/\\/g, '/').replace(/\/+$/, '')
    return norm
  } catch {
    return ''
  }
}

async function migrateFromLegacyIfNeeded(store: Store): Promise<void> {
  // 若已有 libraries 列表则不迁移
  try {
    const libsRaw = await store.get('libraries')
    if (Array.isArray(libsRaw) && libsRaw.length > 0) return
  } catch {}
  try {
    const lr = await store.get('libraryRoot')
    if (typeof lr === 'string' && lr) {
      const root = normalizePath(lr)
      const now = Date.now()
      const name = (root.split(/[/]+/).filter(Boolean).pop() || `lib-${now}`)
      const lib: Library = { id: `lib-${now}`, name, root, createdAt: now, lastUsedAt: now }
      await store.set('libraries', [lib])
      await store.set('activeLibraryId', lib.id)
      // 同步 legacy 字段
      await store.set('libraryRoot', lib.root)
      await store.save()
    }
  } catch {}
}

export async function getLibraries(): Promise<Library[]> {
  const store = await getStore()
  await migrateFromLegacyIfNeeded(store)
  try {
    const v = await store.get('libraries')
    if (!Array.isArray(v)) return []
    const arr: Library[] = []
    for (const it of v as any[]) {
      if (!it || typeof it !== 'object') continue
      const id = String((it as any).id || '').trim()
      const root = normalizePath((it as any).root || '')
      if (!id || !root) continue
      const name = String((it as any).name || '').trim() || (root.split(/[/]+/).pop() || id)
      const createdAt = Number((it as any).createdAt) > 0 ? Number((it as any).createdAt) : undefined
      const lastUsedAt = Number((it as any).lastUsedAt) > 0 ? Number((it as any).lastUsedAt) : undefined
      const sidebarVisible = (it as any).sidebarVisible === false ? false : true
      arr.push({ id, name, root, createdAt, lastUsedAt, sidebarVisible })
    }
    return arr
  } catch {
    return []
  }
}

async function setLibraries(next: Library[]): Promise<void> {
  const store = await getStore()
  await store.set('libraries', next)
  await store.save()
}

export async function getActiveLibraryId(): Promise<string | null> {
  const store = await getStore()
  await migrateFromLegacyIfNeeded(store)
  try {
    const id = await store.get('activeLibraryId')
    if (typeof id === 'string' && id) return id
  } catch {}
  const libs = await getLibraries()
  return libs[0]?.id ?? null
}

export async function getActiveLibrary(): Promise<Library | null> {
  const libs = await getLibraries()
  if (libs.length === 0) return null
  const id = await getActiveLibraryId()
  const lib = libs.find(x => x.id === id) ?? libs[0]
  return lib ?? null
}

export async function getActiveLibraryName(): Promise<string | null> {
  const lib = await getActiveLibrary()
  return lib?.name ?? null
}

export async function setActiveLibraryId(id: string): Promise<void> {
  const store = await getStore()
  const libs = await getLibraries()
  const idx = libs.findIndex(x => x.id === id)
  if (idx < 0) return
  const now = Date.now()
  libs[idx] = { ...libs[idx], lastUsedAt: now }
  await setLibraries(libs)
  await store.set('activeLibraryId', libs[idx].id)
  // 与 legacy 字段保持同步
  await store.set('libraryRoot', libs[idx].root)
  await store.save()
}

export async function getActiveLibraryRoot(): Promise<string | null> {
  const lib = await getActiveLibrary()
  return lib?.root ?? null
}

export async function upsertLibrary(input: { id?: string; name?: string; root: string }): Promise<Library> {
  const libs = await getLibraries()
  const root = normalizePath(input.root)
  const now = Date.now()
  // 先按 id，再按 root 查找现有库
  let cur = input.id ? libs.find(x => x.id === input.id) : undefined
  if (!cur) cur = libs.find(x => normalizePath(x.root) === root)
  if (cur) {
    const next: Library = { ...cur, name: input.name ?? cur.name, root, lastUsedAt: now }
    const arr = libs.map(x => x.id === cur!.id ? next : x)
    await setLibraries(arr)
    await setActiveLibraryId(next.id)
    return next
  }
  const id = input.id || `lib-${now}`
  const name = input.name || (root.split(/[/]+/).filter(Boolean).pop() || id)
  const createdAt = now
  const lastUsedAt = now
  const lib: Library = { id, name, root, createdAt, lastUsedAt }
  await setLibraries([...libs, lib])
  await setActiveLibraryId(lib.id)
  return lib
}

export async function renameLibrary(id: string, name: string): Promise<void> {
  const libs = await getLibraries()
  const idx = libs.findIndex(x => x.id === id)
  if (idx < 0) return
  libs[idx] = { ...libs[idx], name }
  await setLibraries(libs)
}

export async function setLibrarySidebarVisible(id: string, visible: boolean): Promise<void> {
  const libs = await getLibraries()
  const idx = libs.findIndex(x => x.id === id)
  if (idx < 0) return
  libs[idx] = { ...libs[idx], sidebarVisible: !!visible }
  await setLibraries(libs)
}

export async function setLibrariesOrder(idsInOrder: string[]): Promise<void> {
  const libs = await getLibraries()
  if (libs.length <= 1) return
  const idSet = new Set((idsInOrder || []).map(x => String(x || '').trim()).filter(Boolean))
  const byId = new Map(libs.map(l => [l.id, l] as const))

  const out: Library[] = []
  for (const id of idsInOrder || []) {
    const key = String(id || '').trim()
    if (!key || !byId.has(key)) continue
    if (out.find(x => x.id === key)) continue
    out.push(byId.get(key)!)
  }
  // 补齐：把漏掉的库按原顺序追加
  for (const l of libs) {
    if (!idSet.has(l.id)) out.push(l)
  }
  await setLibraries(out)
}

export async function applyLibrariesSettings(input: { orderIds?: string[]; sidebarVisibleById?: Record<string, boolean> }): Promise<void> {
  const libs = await getLibraries()
  if (libs.length === 0) return

  let out = libs

  // 1) 重排（通过数组顺序实现）
  try {
    const orderIds = Array.isArray(input?.orderIds) ? input.orderIds : null
    if (orderIds && orderIds.length > 0) {
      const idSet = new Set(orderIds.map(x => String(x || '').trim()).filter(Boolean))
      const byId = new Map(out.map(l => [l.id, l] as const))
      const next: Library[] = []
      for (const id of orderIds) {
        const key = String(id || '').trim()
        if (!key) continue
        const l = byId.get(key)
        if (!l) continue
        if (next.find(x => x.id === key)) continue
        next.push(l)
      }
      for (const l of out) {
        if (!idSet.has(l.id)) next.push(l)
      }
      out = next
    }
  } catch {}

  // 2) 批量更新侧栏显示开关
  try {
    const m = input?.sidebarVisibleById || null
    if (m && typeof m === 'object') {
      out = out.map(l => {
        if (!(l.id in m)) return l
        return { ...l, sidebarVisible: !!(m as any)[l.id] }
      })
    }
  } catch {}

  await setLibraries(out)
}

export async function removeLibrary(id: string): Promise<void> {
  const store = await getStore()
  let libs = await getLibraries()
  const idx = libs.findIndex(x => x.id === id)
  if (idx < 0) return
  libs = libs.filter(x => x.id !== id)
  await setLibraries(libs)
  const nextActive = libs[0]?.id ?? null
  if (nextActive) {
    await store.set('activeLibraryId', nextActive)
    await store.set('libraryRoot', libs[0].root)
  } else {
    await store.set('activeLibraryId', null as any)
    await store.set('libraryRoot', null as any)
  }
  await store.save()
}

// 库切换位置设置：'sidebar'（侧栏内，原方案）| 'ribbon'（垂直标题栏）
export type LibSwitcherPosition = 'sidebar' | 'ribbon'

export async function getLibSwitcherPosition(): Promise<LibSwitcherPosition> {
  try {
    const store = await getStore()
    const v = await store.get('libSwitcherPosition')
    if (v === 'sidebar' || v === 'ribbon') return v
  } catch {}
  return 'ribbon' // 默认使用新方案
}

export async function setLibSwitcherPosition(pos: LibSwitcherPosition): Promise<void> {
  try {
    const store = await getStore()
    await store.set('libSwitcherPosition', pos)
    await store.save()
  } catch {}
}

