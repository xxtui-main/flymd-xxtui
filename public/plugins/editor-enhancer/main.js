const PLUGIN_ID = 'editor-enhancer'
const STORAGE_KEY = 'editor-enhancer-config'
const USAGE_KEY = 'editor-enhancer-usage'
const STYLE_ID = 'editor-enhancer-style'
const MENU_ID = 'editor-enhancer-slash-menu'
const MENU_LIST_ID = 'editor-enhancer-slash-list'
const SETTINGS_OVERLAY_ID = 'editor-enhancer-settings-overlay'
const MODAL_OVERLAY_ID = 'editor-enhancer-modal-overlay'
const EE_LOCALE_LS_KEY = 'flymd.locale'

function eeDetectLocale() {
    try {
        const nav = typeof navigator !== 'undefined' ? navigator : null
        const lang = (nav && (nav.language || nav.userLanguage)) || 'en'
        const lower = String(lang || '').toLowerCase()
        if (lower.startsWith('zh')) return 'zh'
    } catch {}
    return 'en'
}

function eeGetLocale() {
    try {
        const ls = typeof localStorage !== 'undefined' ? localStorage : null
        const v = ls && ls.getItem(EE_LOCALE_LS_KEY)
        if (v === 'zh' || v === 'en') return v
    } catch {}
    return eeDetectLocale()
}

function eeText(zh, en) {
    return eeGetLocale() === 'en' ? en : zh
}

function pad2(n) {
    return String(n).padStart(2, '0')
}

function formatDate() {
    try {
        const d = new Date()
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
    } catch {
        return ''
    }
}

function formatTime() {
    try {
        const d = new Date()
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
    } catch {
        return ''
    }
}

function normalizeUsage(raw) {
    const out = {}
    if (!raw || typeof raw !== 'object') return out
    for (const key of Object.keys(raw)) {
        const v = raw[key]
        if (!v || typeof v !== 'object') continue
        const total = Number.isFinite(v.total) ? v.total : 0
        const recent = Array.isArray(v.recent) ? v.recent.filter((ts) => Number.isFinite(ts)) : []
        out[key] = { total: Math.max(0, total), recent }
    }
    return out
}

function pruneRecent(list, now) {
    const cutoff = now - SUGGEST_WINDOW_MS
    const out = []
    for (const ts of list || []) {
        if (!Number.isFinite(ts)) continue
        if (ts >= cutoff) out.push(ts)
    }
    return out
}

async function loadUsage(ctx) {
    try {
        const raw = await ctx.storage.get(USAGE_KEY)
        return normalizeUsage(raw || {})
    } catch {
        return {}
    }
}

async function saveUsage(ctx, usage) {
    try {
        await ctx.storage.set(USAGE_KEY, usage)
    } catch {}
}

function recordUsage(item) {
    try {
        if (!item || !item.id || !state.ctx) return
        const now = Date.now()
        const usage = state.usage || {}
        const prev = usage[item.id] || { total: 0, recent: [] }
        const nextRecent = pruneRecent([...(prev.recent || []), now], now)
        usage[item.id] = { total: (prev.total || 0) + 1, recent: nextRecent }
        state.usage = usage
        void saveUsage(state.ctx, usage)
    } catch {}
}

const BUILTIN_ITEMS = [
    {
        id: 'builtin-table',
        category: 'blocks',
        labelZh: '表格',
        labelEn: 'Table',
        trigger: '/table',
        templateZh: '| 列1 | 列2 |\n| --- | --- |\n|     |     |',
        templateEn: '| Col 1 | Col 2 |\n| --- | --- |\n|     |     |',
    },
    {
        id: 'builtin-code',
        category: 'blocks',
        labelZh: '代码块',
        labelEn: 'Code Block',
        trigger: '/code',
        templateZh: '```\n{{cursor}}\n```',
        templateEn: '```\n{{cursor}}\n```',
    },
    {
        id: 'builtin-h1',
        category: 'basic',
        labelZh: '一级标题',
        labelEn: 'Heading 1',
        trigger: '/h1',
        templateZh: '# {{cursor}}',
        templateEn: '# {{cursor}}',
    },
    {
        id: 'builtin-h2',
        category: 'basic',
        labelZh: '二级标题',
        labelEn: 'Heading 2',
        trigger: '/h2',
        templateZh: '## {{cursor}}',
        templateEn: '## {{cursor}}',
    },
    {
        id: 'builtin-h3',
        category: 'basic',
        labelZh: '三级标题',
        labelEn: 'Heading 3',
        trigger: '/h3',
        templateZh: '### {{cursor}}',
        templateEn: '### {{cursor}}',
    },
    {
        id: 'builtin-quote',
        category: 'basic',
        labelZh: '引用',
        labelEn: 'Quote',
        trigger: '/quote',
        templateZh: '> {{cursor}}',
        templateEn: '> {{cursor}}',
    },
    {
        id: 'builtin-hr',
        category: 'basic',
        labelZh: '分隔线',
        labelEn: 'Divider',
        trigger: '/hr',
        templateZh: '---\n{{cursor}}',
        templateEn: '---\n{{cursor}}',
    },
    {
        id: 'builtin-image',
        category: 'content',
        labelZh: '图片',
        labelEn: 'Image',
        trigger: '/image',
        templateZh: '![alt]({{cursor}})',
        templateEn: '![alt]({{cursor}})',
    },
    {
        id: 'builtin-link',
        category: 'content',
        labelZh: '链接',
        labelEn: 'Link',
        trigger: '/link',
        templateZh: '[link]({{cursor}})',
        templateEn: '[link]({{cursor}})',
    },
    {
        id: 'builtin-inline-code',
        category: 'content',
        labelZh: '行内代码',
        labelEn: 'Inline Code',
        trigger: '/inline-code',
        templateZh: '`{{cursor}}`',
        templateEn: '`{{cursor}}`',
    },
    {
        id: 'builtin-bold',
        category: 'content',
        labelZh: '加粗',
        labelEn: 'Bold',
        trigger: '/bold',
        templateZh: '**{{cursor}}**',
        templateEn: '**{{cursor}}**',
    },
    {
        id: 'builtin-italic',
        category: 'content',
        labelZh: '斜体',
        labelEn: 'Italic',
        trigger: '/italic',
        templateZh: '*{{cursor}}*',
        templateEn: '*{{cursor}}*',
    },
    {
        id: 'builtin-strike',
        category: 'content',
        labelZh: '删除线',
        labelEn: 'Strikethrough',
        trigger: '/strike',
        templateZh: '~~{{cursor}}~~',
        templateEn: '~~{{cursor}}~~',
    },
    {
        id: 'builtin-ul',
        category: 'lists',
        labelZh: '无序列表',
        labelEn: 'Bullet List',
        trigger: '/ul',
        templateZh: '- {{cursor}}',
        templateEn: '- {{cursor}}',
    },
    {
        id: 'builtin-ol',
        category: 'lists',
        labelZh: '有序列表',
        labelEn: 'Numbered List',
        trigger: '/ol',
        templateZh: '1. {{cursor}}',
        templateEn: '1. {{cursor}}',
    },
    {
        id: 'builtin-todo',
        category: 'lists',
        labelZh: '待办',
        labelEn: 'Todo',
        trigger: '/todo',
        templateZh: '- [ ] {{cursor}}',
        templateEn: '- [ ] {{cursor}}',
    },
    {
        id: 'builtin-details',
        category: 'blocks',
        labelZh: '折叠块',
        labelEn: 'Details',
        trigger: '/details',
        templateZh: '<details>\n<summary>详情</summary>\n\n{{cursor}}\n</details>',
        templateEn: '<details>\n<summary>Details</summary>\n\n{{cursor}}\n</details>',
    },
    {
        id: 'builtin-callout',
        category: 'blocks',
        labelZh: '提示块',
        labelEn: 'Callout',
        trigger: '/callout',
        templateZh: '> [!NOTE] {{cursor}}',
        templateEn: '> [!NOTE] {{cursor}}',
    },
    {
        id: 'builtin-math',
        category: 'advanced',
        labelZh: '数学块',
        labelEn: 'Math Block',
        trigger: '/math',
        templateZh: '$$\n{{cursor}}\n$$',
        templateEn: '$$\n{{cursor}}\n$$',
    },
    {
        id: 'builtin-mermaid',
        category: 'advanced',
        labelZh: '流程图',
        labelEn: 'Mermaid',
        trigger: '/mermaid',
        templateZh: '```mermaid\n{{cursor}}\n```',
        templateEn: '```mermaid\n{{cursor}}\n```',
    },
    {
        id: 'builtin-frontmatter',
        category: 'meta',
        labelZh: '元数据区',
        labelEn: 'Front Matter',
        trigger: '/frontmatter',
        templateZh: '---\n{{cursor}}\n---',
        templateEn: '---\n{{cursor}}\n---',
    },
    {
        id: 'builtin-date',
        category: 'meta',
        labelZh: '日期',
        labelEn: 'Date',
        trigger: '/date',
        templateFn: () => formatDate(),
    },
    {
        id: 'builtin-time',
        category: 'meta',
        labelZh: '时间',
        labelEn: 'Time',
        trigger: '/time',
        templateFn: () => formatTime(),
    },
]

const CATEGORY_LABELS = {
    suggested: { zh: '建议', en: 'Suggested' },
    basic: { zh: '基础', en: 'Basics' },
    content: { zh: '内容', en: 'Content' },
    lists: { zh: '列表', en: 'Lists' },
    blocks: { zh: '块级', en: 'Blocks' },
    advanced: { zh: '进阶', en: 'Advanced' },
    meta: { zh: '元数据', en: 'Metadata' },
    custom: { zh: '自定义', en: 'Custom' },
}

const CATEGORY_ORDER = ['suggested', 'basic', 'content', 'lists', 'blocks', 'advanced', 'meta', 'custom']

const SUGGEST_WINDOW_MS = 10 * 24 * 60 * 60 * 1000

const DEFAULT_CFG = {
    slash: {
        enabled: true,
        modeSource: true,
        customItems: [],
    },
}

const state = {
    ctx: null,
    cfg: null,
    usage: {},
    editor: null,
    menuEl: null,
    listEl: null,
    open: false,
    selected: 0,
    filtered: [],
    activeToken: null,
    composing: false,
    skipKeyup: false,
    cleanup: [],
    modeHandler: null,
    outsideHandler: null,
}

function deepClone(obj) {
    try {
        return JSON.parse(JSON.stringify(obj || {}))
    } catch {
        return {}
    }
}

function normText(input) {
    try {
        return String(input || '').trim()
    } catch {
        return ''
    }
}

function isWhitespace(ch) {
    return ch === ' ' || ch === '\t'
}

function getBuiltinTriggersLower() {
    const out = new Set()
    for (const it of BUILTIN_ITEMS) {
        out.add(normText(it.trigger).toLowerCase())
    }
    return out
}

function getCategoryLabel(category) {
    const item = CATEGORY_LABELS[category]
    if (!item) return category || ''
    return eeText(item.zh, item.en)
}

function getSuggestedItems(items, query) {
    const usage = state.usage || {}
    const now = Date.now()
    const q = normText(query).toLowerCase()
    const pool = (items || []).filter((it) => {
        if (!it || !it.id) return false
        if (!q) return true
        const trig = normText(it.trigger).toLowerCase()
        const name = normText(it.label).toLowerCase()
        return trig.slice(1).startsWith(q) || name.includes(q)
    })
    if (!pool.length) return []
    const scored = pool.map((it) => {
        const rec = usage[it.id] || { total: 0, recent: [] }
        const recentCount = pruneRecent(rec.recent || [], now).length
        const total = Number.isFinite(rec.total) ? rec.total : 0
        return { item: it, recent: recentCount, total }
    })
    const anyRecent = scored.some((s) => s.recent > 0)
    const usable = scored.filter((s) => (anyRecent ? s.recent > 0 : s.total > 0))
    if (!usable.length) return []
    usable.sort((a, b) => {
        const da = anyRecent ? b.recent - a.recent : b.total - a.total
        if (da !== 0) return da
        const la = normText(a.item.label).toLowerCase()
        const lb = normText(b.item.label).toLowerCase()
        if (la < lb) return -1
        if (la > lb) return 1
        return 0
    })
    return usable.slice(0, 5).map((s) => s.item)
}

function normalizeCustomItems(items) {
    const out = []
    const seen = new Set()
    const builtin = getBuiltinTriggersLower()
    for (const raw of items || []) {
        const label = normText(raw && raw.label)
        const trigger = normText(raw && raw.trigger)
        const template = String((raw && raw.template) || '')
        if (!label || !trigger || !template) continue
        if (!trigger.startsWith('/')) continue
        if (/\s/.test(trigger)) continue
        const key = trigger.toLowerCase()
        if (builtin.has(key)) continue
        if (seen.has(key)) continue
        seen.add(key)
        out.push({
            id: normText(raw && raw.id) || `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            label,
            trigger,
            template,
            category: 'custom',
        })
    }
    return out
}

function normalizeConfig(raw) {
    const base = deepClone(DEFAULT_CFG)
    const cfg = raw && typeof raw === 'object' ? raw : {}
    const slash = cfg.slash && typeof cfg.slash === 'object' ? cfg.slash : {}
    base.slash.enabled = slash.enabled !== false
    base.slash.modeSource = slash.modeSource !== false
    base.slash.customItems = normalizeCustomItems(slash.customItems)
    return base
}

async function loadConfig(ctx) {
    try {
        const raw = await ctx.storage.get(STORAGE_KEY)
        return normalizeConfig(raw || {})
    } catch {
        return normalizeConfig({})
    }
}

async function saveConfig(ctx, cfg) {
    try {
        await ctx.storage.set(STORAGE_KEY, cfg)
        return true
    } catch {
        return false
    }
}

function getAllItems(cfg) {
    const custom = (cfg && cfg.slash && cfg.slash.customItems) || []
    const builtins = []
    const customs = []
    for (const it of BUILTIN_ITEMS) {
        const tpl = it.templateFn ? eeText('（动态）', '(dynamic)') : eeText(it.templateZh, it.templateEn)
        builtins.push({
            ...it,
            label: eeText(it.labelZh, it.labelEn),
            template: tpl,
            builtin: true,
        })
    }
    for (const it of custom) {
        customs.push({ ...it, builtin: false })
    }
    const buckets = new Map()
    const push = (item) => {
        const cat = item.category || 'custom'
        if (!buckets.has(cat)) buckets.set(cat, [])
        buckets.get(cat).push(item)
    }
    for (const it of builtins) push(it)
    for (const it of customs) push(it)
    const list = []
    for (const cat of CATEGORY_ORDER) {
        const group = buckets.get(cat)
        if (group && group.length) list.push(...group)
    }
    for (const [cat, group] of buckets.entries()) {
        if (CATEGORY_ORDER.includes(cat)) continue
        if (group && group.length) list.push(...group)
    }
    return list
}

function ensureStyle() {
    const css = [
        `#${MENU_ID}{position:fixed;z-index:90020;min-width:220px;width:310px;max-width:310px;height:340px;max-height:340px;background:var(--bg,#fff);color:var(--fg,#111);border:1px solid var(--border,#e5e7eb);border-radius:8px;box-shadow:0 10px 28px rgba(0,0,0,.18);padding:6px 0;display:none;overflow:hidden;box-sizing:border-box;flex-direction:column;}`,
        `#${MENU_ID}.show{display:flex;}`,
        `#${MENU_ID} .ee-slash-empty{padding:8px 12px;color:var(--muted,#6b7280);font-size:12px;}`,
        `#${MENU_ID} .ee-slash-item{padding:6px 12px;cursor:pointer;display:flex;flex-direction:column;gap:2px;}`,
        `#${MENU_ID} .ee-slash-item.selected{background:rgba(127,127,127,.12);}`,
        `#${MENU_ID} .ee-slash-item:hover{background:rgba(127,127,127,.12);}`,
        `#${MENU_ID} .ee-slash-item.disabled{opacity:.45;cursor:not-allowed;}`,
        `#${MENU_LIST_ID}{flex:1 1 auto;min-height:0;overflow:auto;}`,
        `#${MENU_ID} .ee-slash-group{padding:8px 16px 4px;color:var(--muted,#6b7280);font-size:11px;text-transform:uppercase;letter-spacing:.04em;background:rgba(127,127,127,.08);}`,
        `#${MENU_ID} .ee-slash-group.suggested{background:rgba(37,99,235,.12);color:var(--fg,#111);}`,
        `#${MENU_ID} .ee-slash-title{font-size:13px;font-weight:600;}`,
        `#${MENU_ID} .ee-slash-detail{font-size:11px;color:var(--muted,#6b7280);}`,
        `#${MENU_ID} .ee-slash-hint{padding:6px 12px;color:var(--muted,#6b7280);font-size:11px;border-top:1px solid var(--border,#e5e7eb);margin-top:4px;}`,
        `#${SETTINGS_OVERLAY_ID}{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:90030;}`,
        `#${SETTINGS_OVERLAY_ID}.hidden{display:none;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-dialog{width:720px;max-width:calc(100% - 40px);height:min(620px, 90vh);max-height:90vh;background:var(--bg,#fff);color:var(--fg,#111);border-radius:10px;border:1px solid var(--border,#e5e7eb);box-shadow:0 14px 36px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;font-size:13px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-header{padding:10px 14px;border-bottom:1px solid var(--border,#e5e7eb);font-weight:600;font-size:14px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-body{padding:0;flex:1;min-height:0;overflow:hidden;display:flex;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-nav{width:180px;background:rgba(127,127,127,.05);border-right:1px solid var(--border,#e5e7eb);display:flex;flex-direction:column;gap:6px;padding:10px 8px;box-sizing:border-box;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-nav-title{font-size:11px;color:var(--muted,#6b7280);letter-spacing:.04em;text-transform:uppercase;padding:4px 8px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-nav-btn{border:1px solid transparent;border-radius:10px;background:transparent;padding:8px 10px;text-align:left;font-size:13px;color:var(--fg,#111);cursor:pointer;transition:all .15s;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-nav-btn:hover{background:rgba(37,99,235,.08);border-color:rgba(37,99,235,.2);}`,
        `#${SETTINGS_OVERLAY_ID} .ee-nav-btn.active{background:#2563eb;color:#fff;border-color:#2563eb;box-shadow:0 6px 16px rgba(37,99,235,.18);}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-panel{flex:1;min-width:0;padding:12px 14px;overflow:auto;display:flex;flex-direction:column;gap:14px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-intro{border:1px solid var(--border,#e5e7eb);border-radius:10px;background:rgba(127,127,127,.05);padding:10px;display:flex;flex-direction:column;gap:6px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-intro-title{font-weight:600;font-size:13px;color:var(--fg,#111);}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-intro-item{font-size:12px;color:var(--muted,#6b7280);line-height:1.5;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-intro-warn{font-size:12px;color:#b91c1c;font-weight:600;line-height:1.5;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-group{border:1px solid var(--border,#e5e7eb);border-radius:8px;overflow:hidden;background:rgba(127,127,127,.03);}`,
        `#${SETTINGS_OVERLAY_ID} .ee-group-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px;background:rgba(127,127,127,.08);cursor:pointer;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-group-head{display:flex;align-items:center;gap:6px;min-width:0;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-group-title{font-weight:600;font-size:12px;color:var(--fg,#111);}`,
        `#${SETTINGS_OVERLAY_ID} .ee-group-meta{font-size:11px;color:var(--muted,#6b7280);}`,
        `#${SETTINGS_OVERLAY_ID} .ee-group-toggle{font-size:12px;color:var(--muted,#6b7280);}`,
        `#${SETTINGS_OVERLAY_ID} .ee-group-body{padding:8px;display:flex;flex-direction:column;gap:6px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-group.collapsed .ee-group-body{display:none;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-section{display:flex;flex-direction:column;gap:8px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-title{font-weight:600;font-size:13px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-note{font-size:11px;color:var(--muted,#6b7280);}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-row{display:flex;gap:14px;flex-wrap:wrap;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-toggle{display:flex;align-items:center;gap:6px;font-size:12px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-toggle input{margin:0;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-items{display:flex;flex-direction:column;gap:6px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-item-row{display:grid;grid-template-columns:120px 150px 1fr auto;gap:8px;align-items:center;padding:6px 8px;border:1px solid var(--border,#e5e7eb);border-radius:8px;background:rgba(127,127,127,.04);}`,
        `#${SETTINGS_OVERLAY_ID} .ee-item-row.builtin{opacity:.7;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-item-label{font-weight:600;font-size:12px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-item-trigger{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;font-size:12px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-item-template{font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;font-size:11px;white-space:pre-wrap;word-break:break-word;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-item-actions{display:flex;gap:6px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-btn{padding:4px 10px;border-radius:6px;border:1px solid var(--border,#e5e7eb);background:var(--bg,#fff);color:var(--fg,#111);cursor:pointer;font-size:12px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-btn.primary{background:#2563eb;color:#fff;border-color:#2563eb;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-btn.danger{border-color:#dc2626;color:#dc2626;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-btn:disabled{opacity:.5;cursor:not-allowed;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-item-editor{border:1px dashed var(--border,#e5e7eb);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:8px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-item-editor.hidden{display:none;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-input{border-radius:6px;border:1px solid var(--border,#e5e7eb);background:var(--bg,#fff);color:var(--fg,#111);padding:6px 8px;font-size:12px;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-textarea{border-radius:6px;border:1px solid var(--border,#e5e7eb);background:var(--bg,#fff);color:var(--fg,#111);padding:6px 8px;font-size:12px;min-height:80px;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;}`,
        `#${SETTINGS_OVERLAY_ID} .ee-settings-footer{padding:8px 14px;border-top:1px solid var(--border,#e5e7eb);display:flex;justify-content:flex-end;gap:8px;background:rgba(127,127,127,.03);}`,
        `#${MODAL_OVERLAY_ID}{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:90040;}`,
        `#${MODAL_OVERLAY_ID} .ee-modal-dialog{width:360px;max-width:92vw;background:var(--bg,#fff);color:var(--fg,#111);border:1px solid var(--border,#e5e7eb);border-radius:12px;box-shadow:0 12px 36px rgba(0,0,0,.18);overflow:hidden;}`,
        `#${MODAL_OVERLAY_ID} .ee-modal-head{padding:12px 14px;font-weight:600;border-bottom:1px solid var(--border,#e5e7eb);background:rgba(127,127,127,.05);}`,
        `#${MODAL_OVERLAY_ID} .ee-modal-body{padding:14px;font-size:13px;line-height:1.5;display:flex;flex-direction:column;gap:10px;}`,
        `#${MODAL_OVERLAY_ID} .ee-modal-row{display:flex;align-items:center;gap:10px;}`,
        `#${MODAL_OVERLAY_ID} .ee-modal-row label{width:70px;color:var(--muted,#6b7280);font-size:12px;}`,
        `#${MODAL_OVERLAY_ID} .ee-modal-row input{flex:1;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--bg,#fff);color:var(--fg,#111);padding:6px 8px;font-size:12px;box-sizing:border-box;}`,
        `#${MODAL_OVERLAY_ID} .ee-modal-actions{display:flex;justify-content:flex-end;gap:10px;padding:12px 14px;border-top:1px solid var(--border,#e5e7eb);background:rgba(127,127,127,.03);}`,
        `#${MODAL_OVERLAY_ID} .ee-btn{padding:6px 12px;border-radius:8px;border:1px solid var(--border,#e5e7eb);background:var(--bg,#fff);color:var(--fg,#111);cursor:pointer;font-size:13px;}`,
        `#${MODAL_OVERLAY_ID} .ee-btn.primary{background:#2563eb;border-color:#2563eb;color:#fff;}`,
        `@media (max-width:600px){`,
        `  #${SETTINGS_OVERLAY_ID} .ee-settings-dialog{width:100vw;height:100vh;max-width:100vw;max-height:100vh;border-radius:0;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-settings-body{flex-direction:column;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-settings-nav{width:100%;flex-direction:row;overflow-x:auto;border-right:none;border-bottom:1px solid var(--border,#e5e7eb);padding:6px;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-settings-nav-title{display:none;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-nav-btn{white-space:nowrap;padding:6px 10px;font-size:12px;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-settings-panel{padding:10px;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-settings-row{flex-direction:column;align-items:stretch;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-settings-toggle{width:100%;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-item-row{grid-template-columns:1fr;align-items:stretch;gap:6px;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-item-actions{justify-content:flex-end;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-settings-footer{flex-direction:column;align-items:stretch;}`,
        `  #${SETTINGS_OVERLAY_ID} .ee-settings-footer .ee-btn{width:100%;}`,
        `}`,
    ].join('\n')
    let style = document.getElementById(STYLE_ID)
    if (style) {
        style.textContent = css
        return
    }
    style = document.createElement('style')
    style.id = STYLE_ID
    style.textContent = css
    document.head.appendChild(style)
}

function ensureMenu() {
    if (state.menuEl && state.listEl) return
    ensureStyle()
    const menu = document.createElement('div')
    menu.id = MENU_ID
    const list = document.createElement('div')
    list.id = MENU_LIST_ID
    menu.appendChild(list)
    const hint = document.createElement('div')
    hint.className = 'ee-slash-hint'
    hint.textContent = eeText('Enter 插入 · Esc 关闭', 'Enter to insert · Esc to close')
    menu.appendChild(hint)
    document.body.appendChild(menu)
    state.menuEl = menu
    state.listEl = list

    list.addEventListener('click', (e) => {
        const row = e.target && e.target.closest('.ee-slash-item')
        if (!row) return
        const idx = Number(row.getAttribute('data-index') || '0') || 0
        state.selected = Math.max(0, Math.min(idx, state.filtered.length - 1))
        void runSelected()
    })

    list.addEventListener('mousemove', (e) => {
        const row = e.target && e.target.closest('.ee-slash-item')
        if (!row) return
        const idx = Number(row.getAttribute('data-index') || '0') || 0
        const next = Math.max(0, Math.min(idx, state.filtered.length - 1))
        if (next !== state.selected) {
            state.selected = next
            renderMenu()
        }
    })

    menu.addEventListener('click', (e) => {
        const row = e.target && e.target.closest('.ee-slash-item')
        if (row) return
        closeMenu()
    })
}

function getModeState() {
    try {
        const win = window
        const mode = typeof win.flymdGetMode === 'function' ? win.flymdGetMode() : 'edit'
        const wys = typeof win.flymdGetWysiwygEnabled === 'function' ? win.flymdGetWysiwygEnabled() : false
        return { mode, wys }
    } catch {
        return { mode: 'edit', wys: false }
    }
}

function isSourceEnabled() {
    const cfg = state.cfg
    if (!cfg || !cfg.slash || !cfg.slash.enabled) return false
    if (!cfg.slash.modeSource) return false
    const st = getModeState()
    if (!st || st.mode !== 'edit') return false
    if (st.wys) return false
    return true
}

function closeMenu() {
    if (!state.menuEl) return
    state.menuEl.classList.remove('show')
    state.open = false
    state.filtered = []
    state.selected = 0
    state.activeToken = null
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n))
}

function positionMenu() {
    if (!state.menuEl) return
    const menu = state.menuEl
    let rect = null
    try {
        rect = state.ctx && typeof state.ctx.getSourceCaretRect === 'function'
            ? state.ctx.getSourceCaretRect()
            : null
    } catch {
        rect = null
    }
    let left = 0
    let top = 0
    if (rect) {
        left = rect.left
        top = rect.bottom + 6
    } else if (state.editor) {
        const edRect = state.editor.getBoundingClientRect()
        left = edRect.left + 12
        top = edRect.top + 12
    }
    const padding = 8
    const vw = window.innerWidth || 1280
    const vh = window.innerHeight || 720
    menu.style.left = '0px'
    menu.style.top = '0px'
    menu.style.opacity = '0'
    menu.style.transform = 'translateY(-4px)'

    requestAnimationFrame(() => {
        const menuRect = menu.getBoundingClientRect()
        const w = menuRect.width || 240
        const h = menuRect.height || 180
        let nx = clamp(left, padding, Math.max(padding, vw - w - padding))
        let ny = clamp(top, padding, Math.max(padding, vh - h - padding))
        if (top + h + padding > vh) {
            ny = clamp((rect ? rect.top - h - 6 : top), padding, Math.max(padding, vh - h - padding))
        }
        menu.style.left = `${nx}px`
        menu.style.top = `${ny}px`
        menu.style.opacity = '1'
        menu.style.transform = 'translateY(0)'
    })
}

function renderMenu() {
    if (!state.listEl) return
    const list = state.listEl
    list.innerHTML = ''
    if (!state.filtered.length) {
        const empty = document.createElement('div')
        empty.className = 'ee-slash-empty'
        empty.textContent = eeText('无匹配结果', 'No matches')
        list.appendChild(empty)
        return
    }
    let lastCategory = null
    for (let i = 0; i < state.filtered.length; i++) {
        const item = state.filtered[i]
        const cat = item.menuCategory || item.category || 'custom'
        if (cat !== lastCategory) {
            lastCategory = cat
            const group = document.createElement('div')
            group.className = 'ee-slash-group' + (cat === 'suggested' ? ' suggested' : '')
            group.textContent = getCategoryLabel(cat)
            list.appendChild(group)
        }
        const row = document.createElement('div')
        row.className = 'ee-slash-item' + (i === state.selected ? ' selected' : '')
        row.setAttribute('data-index', String(i))
        const title = document.createElement('div')
        title.className = 'ee-slash-title'
        title.textContent = item.label || ''
        const detail = document.createElement('div')
        detail.className = 'ee-slash-detail'
        detail.textContent = item.trigger || ''
        row.appendChild(title)
        row.appendChild(detail)
        list.appendChild(row)
    }
}

function openMenuWithItems(items) {
    ensureMenu()
    state.filtered = items
    state.selected = 0
    state.open = true
    state.menuEl.classList.add('show')
    renderMenu()
    positionMenu()
}

function updateMenuFromEditor(allowOpen) {
    if (!isSourceEnabled()) {
        closeMenu()
        return
    }
    if (!state.open && !allowOpen) return
    const ed = state.editor
    if (!ed) {
        closeMenu()
        return
    }
    const selStart = ed.selectionStart >>> 0
    const selEnd = ed.selectionEnd >>> 0
    if (selStart !== selEnd) {
        closeMenu()
        return
    }
    const value = String(ed.value || '')
    const caret = selEnd
    const lineStart = value.lastIndexOf('\n', Math.max(0, caret - 1)) + 1
    let lineEnd = value.indexOf('\n', caret)
    if (lineEnd === -1) lineEnd = value.length

    let start = caret
    while (start > lineStart) {
        const ch = value[start - 1]
        if (isWhitespace(ch)) break
        start--
    }
    let end = caret
    while (end < lineEnd) {
        const ch = value[end]
        if (isWhitespace(ch)) break
        end++
    }
    if (caret !== end) {
        closeMenu()
        return
    }
    const token = value.slice(start, end)
    if (!token.startsWith('/')) {
        closeMenu()
        return
    }
    const beforeToken = value.slice(lineStart, start)
    const afterToken = value.slice(end, lineEnd)
    if (beforeToken.trim() || afterToken.trim()) {
        closeMenu()
        return
    }
    const qLen = Math.max(0, caret - start - 1)
    const query = token.slice(1, 1 + qLen)

    const items = getAllItems(state.cfg)
    const q = query.toLowerCase()
    const matched = !q
        ? items
        : items.filter((it) => {
            const trig = normText(it.trigger).toLowerCase()
            const name = normText(it.label).toLowerCase()
            return trig.slice(1).startsWith(q) || name.includes(q)
        })

    state.activeToken = { start, end }
    const suggested = q ? [] : getSuggestedItems(matched, q)
    let menuItems = matched.map((it) => ({ ...it, menuCategory: it.category || 'custom' }))
    if (suggested.length) {
        const head = suggested.map((it) => ({ ...it, menuCategory: 'suggested' }))
        menuItems = [...head, ...menuItems]
    }
    openMenuWithItems(menuItems)
}

function getSelectionText() {
    try {
        if (state.ctx && typeof state.ctx.getSelection === 'function') {
            const sel = state.ctx.getSelection()
            if (sel && typeof sel.text === 'string') return sel.text
        }
    } catch {}
    try {
        if (state.editor) {
            const s = state.editor.selectionStart >>> 0
            const e = state.editor.selectionEnd >>> 0
            if (s !== e) return String(state.editor.value || '').slice(Math.min(s, e), Math.max(s, e))
        }
    } catch {}
    return ''
}

function getTemplateVars() {
    const date = formatDate()
    const time = formatTime()
    return {
        date,
        time,
        datetime: date && time ? `${date} ${time}` : date || time,
        selection: getSelectionText(),
    }
}

function expandTemplate(template, vars) {
    const src = String(template || '')
    const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g
    let out = ''
    let lastIndex = 0
    let cursorOffset = null
    let match
    while ((match = re.exec(src))) {
        out += src.slice(lastIndex, match.index)
        const key = String(match[1] || '').toLowerCase()
        if (key === 'cursor') {
            if (cursorOffset == null) cursorOffset = out.length
        } else if (Object.prototype.hasOwnProperty.call(vars || {}, key)) {
            out += String(vars[key] ?? '')
        } else {
            out += match[0]
        }
        lastIndex = match.index + match[0].length
    }
    out += src.slice(lastIndex)
    return { text: out, cursorOffset }
}

function buildInsertText(template, before, after, cursorOffset) {
    let insert = String(template || '')
    let offset = Number.isFinite(cursorOffset) ? cursorOffset : null
    const needPrefix = before.length > 0 && !before.endsWith('\n')
    const needSuffix = after.length > 0 && !after.startsWith('\n')
    if (needPrefix) {
        insert = '\n' + insert
        if (offset != null) offset += 1
    }
    if (needSuffix) insert = insert + '\n'
    return { insert, cursorOffset: offset }
}

function buildTableTemplate(rows, cols) {
    const r = Math.max(1, Math.min(20, Number(rows) || 1))
    const c = Math.max(1, Math.min(12, Number(cols) || 1))
    const headers = []
    for (let i = 0; i < c; i++) {
        headers.push(eeText(`列${i + 1}`, `Col ${i + 1}`))
    }
    const headerLine = `| ${headers.join(' | ')} |`
    const dividerLine = `| ${Array(c).fill('---').join(' | ')} |`
    const rowsOut = []
    for (let i = 0; i < r; i++) {
        const cells = Array(c).fill('')
        if (i === 0) cells[0] = '{{cursor}}'
        rowsOut.push(`| ${cells.join(' | ')} |`)
    }
    return [headerLine, dividerLine, ...rowsOut].join('\n')
}

async function runSelected() {
    const item = state.filtered[state.selected]
    if (!item) return
    const token = state.activeToken
    if (!token || !state.ctx) return
    const text = state.editor ? String(state.editor.value || '') : ''
    const before = text.slice(0, token.start)
    const after = text.slice(token.end)
    let baseTemplate = typeof item.templateFn === 'function' ? item.templateFn() : item.template
    if (item.id === 'builtin-table') {
        const dims = await showTableDialog()
        if (!dims) {
            closeMenu()
            return
        }
        baseTemplate = buildTableTemplate(dims.rows, dims.cols)
    }
    const vars = getTemplateVars()
    const expanded = expandTemplate(baseTemplate, vars)
    const built = buildInsertText(expanded.text, before, after, expanded.cursorOffset)
    try {
        state.ctx.replaceRange(token.start, token.end, built.insert)
    } catch {}
    if (state.editor && built.cursorOffset != null) {
        const pos = token.start + built.cursorOffset
        try {
            state.editor.selectionStart = pos
            state.editor.selectionEnd = pos
        } catch {}
    }
    recordUsage(item)
    closeMenu()
}

function onEditorInput(e) {
    if (state.composing) return
    const allowOpen = !state.open && e && e.inputType === 'insertText' && e.data === '/'
    updateMenuFromEditor(!!allowOpen || state.open)
}

function onEditorKeydown(e) {
    if (!state.open) return
    if (e.key === 'ArrowDown') {
        e.preventDefault()
        state.skipKeyup = true
        state.selected = Math.min(state.selected + 1, Math.max(0, state.filtered.length - 1))
        renderMenu()
        return
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault()
        state.skipKeyup = true
        state.selected = Math.max(state.selected - 1, 0)
        renderMenu()
        return
    }
    if (e.key === 'Enter') {
        e.preventDefault()
        state.skipKeyup = true
        void runSelected()
        return
    }
    if (e.key === 'Escape') {
        e.preventDefault()
        state.skipKeyup = true
        closeMenu()
    }
}

function bindSourceListeners() {
    detachSourceListeners()
    const ed = document.getElementById('editor')
    if (!ed) return
    state.editor = ed

    const onInput = (e) => onEditorInput(e)
    const onKeydown = (e) => onEditorKeydown(e)
    const onKeyup = () => {
        if (state.skipKeyup) {
            state.skipKeyup = false
            return
        }
        if (!state.open) return
        updateMenuFromEditor(state.open)
    }
    const onClick = () => {
        if (!state.open) return
        closeMenu()
    }
    const onScroll = () => {
        if (state.open) positionMenu()
    }
    const onCompStart = () => { state.composing = true }
    const onCompEnd = () => { state.composing = false; updateMenuFromEditor(state.open) }

    ed.addEventListener('input', onInput)
    ed.addEventListener('keydown', onKeydown)
    ed.addEventListener('keyup', onKeyup)
    ed.addEventListener('click', onClick)
    ed.addEventListener('scroll', onScroll)
    ed.addEventListener('compositionstart', onCompStart)
    ed.addEventListener('compositionend', onCompEnd)

    state.cleanup.push(() => ed.removeEventListener('input', onInput))
    state.cleanup.push(() => ed.removeEventListener('keydown', onKeydown))
    state.cleanup.push(() => ed.removeEventListener('keyup', onKeyup))
    state.cleanup.push(() => ed.removeEventListener('click', onClick))
    state.cleanup.push(() => ed.removeEventListener('scroll', onScroll))
    state.cleanup.push(() => ed.removeEventListener('compositionstart', onCompStart))
    state.cleanup.push(() => ed.removeEventListener('compositionend', onCompEnd))

    if (!state.outsideHandler) {
        state.outsideHandler = (e) => {
            if (!state.open) return
            const target = e.target
            if (!target) return
            if (state.menuEl && state.menuEl.contains(target)) return
            closeMenu()
        }
        document.addEventListener('mousedown', state.outsideHandler)
    }
}

function detachSourceListeners() {
    for (const fn of state.cleanup) {
        try { fn() } catch {}
    }
    state.cleanup = []
    state.editor = null
    closeMenu()

    if (state.outsideHandler) {
        document.removeEventListener('mousedown', state.outsideHandler)
        state.outsideHandler = null
    }
}

function applyConfig() {
    detachSourceListeners()
    if (isSourceEnabled()) bindSourceListeners()
}

function removeSettingsOverlay() {
    const old = document.getElementById(SETTINGS_OVERLAY_ID)
    if (old) old.remove()
}

function removeModalOverlay() {
    const old = document.getElementById(MODAL_OVERLAY_ID)
    if (old) old.remove()
}

function showConfirmDialog(opts) {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') {
            resolve(false)
            return
        }
        ensureStyle()
        removeModalOverlay()

        const overlay = document.createElement('div')
        overlay.id = MODAL_OVERLAY_ID

        const dialog = document.createElement('div')
        dialog.className = 'ee-modal-dialog'
        overlay.appendChild(dialog)

        const head = document.createElement('div')
        head.className = 'ee-modal-head'
        head.textContent = opts && opts.title ? opts.title : eeText('确认操作', 'Confirm')
        dialog.appendChild(head)

        const body = document.createElement('div')
        body.className = 'ee-modal-body'
        body.textContent = opts && opts.message ? opts.message : ''
        dialog.appendChild(body)

        const actions = document.createElement('div')
        actions.className = 'ee-modal-actions'
        dialog.appendChild(actions)

        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'ee-btn'
        cancelBtn.textContent = (opts && opts.cancelText) || eeText('取消', 'Cancel')
        actions.appendChild(cancelBtn)

        const okBtn = document.createElement('button')
        okBtn.className = 'ee-btn primary'
        okBtn.textContent = (opts && opts.okText) || eeText('确认', 'OK')
        actions.appendChild(okBtn)

        const cleanup = (val) => {
            removeModalOverlay()
            document.removeEventListener('keydown', onKeydown, true)
            resolve(val)
        }

        const onKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                cleanup(false)
            }
        }

        cancelBtn.addEventListener('click', () => cleanup(false))
        okBtn.addEventListener('click', () => cleanup(true))
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(false)
        })
        document.addEventListener('keydown', onKeydown, true)

        document.body.appendChild(overlay)
        try { okBtn.focus() } catch {}
    })
}

function showTableDialog() {
    return new Promise((resolve) => {
        if (typeof document === 'undefined') {
            resolve(null)
            return
        }
        ensureStyle()
        removeModalOverlay()

        const overlay = document.createElement('div')
        overlay.id = MODAL_OVERLAY_ID

        const dialog = document.createElement('div')
        dialog.className = 'ee-modal-dialog'
        overlay.appendChild(dialog)

        const head = document.createElement('div')
        head.className = 'ee-modal-head'
        head.textContent = eeText('插入表格', 'Insert Table')
        dialog.appendChild(head)

        const body = document.createElement('div')
        body.className = 'ee-modal-body'
        dialog.appendChild(body)

        const rowWrap = document.createElement('div')
        rowWrap.className = 'ee-modal-row'
        const rowLabel = document.createElement('label')
        rowLabel.textContent = eeText('行数', 'Rows')
        const rowInput = document.createElement('input')
        rowInput.type = 'number'
        rowInput.min = '1'
        rowInput.max = '20'
        rowInput.value = '2'
        rowWrap.appendChild(rowLabel)
        rowWrap.appendChild(rowInput)
        body.appendChild(rowWrap)

        const colWrap = document.createElement('div')
        colWrap.className = 'ee-modal-row'
        const colLabel = document.createElement('label')
        colLabel.textContent = eeText('列数', 'Columns')
        const colInput = document.createElement('input')
        colInput.type = 'number'
        colInput.min = '1'
        colInput.max = '12'
        colInput.value = '2'
        colWrap.appendChild(colLabel)
        colWrap.appendChild(colInput)
        body.appendChild(colWrap)

        const actions = document.createElement('div')
        actions.className = 'ee-modal-actions'
        dialog.appendChild(actions)

        const cancelBtn = document.createElement('button')
        cancelBtn.className = 'ee-btn'
        cancelBtn.textContent = eeText('取消', 'Cancel')
        actions.appendChild(cancelBtn)

        const okBtn = document.createElement('button')
        okBtn.className = 'ee-btn primary'
        okBtn.textContent = eeText('插入', 'Insert')
        actions.appendChild(okBtn)

        const cleanup = (val) => {
            removeModalOverlay()
            document.removeEventListener('keydown', onKeydown, true)
            resolve(val)
        }

        const onKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault()
                cleanup(null)
            }
            if (e.key === 'Enter') {
                e.preventDefault()
                okBtn.click()
            }
        }

        cancelBtn.addEventListener('click', () => cleanup(null))
        okBtn.addEventListener('click', () => {
            const rows = Math.max(1, Math.min(20, Number(rowInput.value) || 1))
            const cols = Math.max(1, Math.min(12, Number(colInput.value) || 1))
            cleanup({ rows, cols })
        })
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) cleanup(null)
        })
        document.addEventListener('keydown', onKeydown, true)

        document.body.appendChild(overlay)
        try { rowInput.focus() } catch {}
    })
}

function buildSettingsRow(label, inputEl) {
    const wrap = document.createElement('div')
    wrap.className = 'ee-item-row'
    const lab = document.createElement('div')
    lab.className = 'ee-item-label'
    lab.textContent = label
    const box = document.createElement('div')
    box.style.gridColumn = 'span 3'
    box.appendChild(inputEl)
    wrap.innerHTML = ''
    wrap.appendChild(lab)
    wrap.appendChild(box)
    return wrap
}

function validateTrigger(trigger, existing, ctx) {
    if (!trigger.startsWith('/')) {
        ctx.ui.notice(eeText('触发词必须以 / 开头', 'Trigger must start with /'), 'err', 2000)
        return false
    }
    if (/\s/.test(trigger)) {
        ctx.ui.notice(eeText('触发词不能包含空格', 'Trigger cannot contain spaces'), 'err', 2000)
        return false
    }
    const key = trigger.toLowerCase()
    if (existing.has(key)) {
        ctx.ui.notice(eeText('触发词已存在', 'Trigger already exists'), 'err', 2000)
        return false
    }
    return true
}

export async function activate(context) {
    state.ctx = context
    state.cfg = await loadConfig(context)
    state.usage = await loadUsage(context)
    applyConfig()

    state.modeHandler = () => {
        applyConfig()
    }
    window.addEventListener('flymd:mode:changed', state.modeHandler)
}

export async function deactivate() {
    detachSourceListeners()
    if (state.modeHandler) {
        window.removeEventListener('flymd:mode:changed', state.modeHandler)
        state.modeHandler = null
    }
    removeSettingsOverlay()
    removeModalOverlay()
    if (state.menuEl) {
        try { state.menuEl.remove() } catch {}
        state.menuEl = null
        state.listEl = null
    }
}

export async function openSettings(context) {
    if (typeof document === 'undefined') return
    removeSettingsOverlay()
    ensureStyle()

    const cfg = await loadConfig(context)
    const draft = deepClone(cfg)

    const overlay = document.createElement('div')
    overlay.id = SETTINGS_OVERLAY_ID

    const dialog = document.createElement('div')
    dialog.className = 'ee-settings-dialog'
    overlay.appendChild(dialog)

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            overlay.remove()
        }
    })
    dialog.addEventListener('click', (e) => e.stopPropagation())

    const header = document.createElement('div')
    header.className = 'ee-settings-header'
    header.textContent = eeText('编辑器增强设置', 'Editor Enhancer Settings')
    dialog.appendChild(header)

    const body = document.createElement('div')
    body.className = 'ee-settings-body'
    dialog.appendChild(body)

    const nav = document.createElement('div')
    nav.className = 'ee-settings-nav'
    body.appendChild(nav)

    const navTitle = document.createElement('div')
    navTitle.className = 'ee-settings-nav-title'
    navTitle.textContent = eeText('配置', 'Settings')
    nav.appendChild(navTitle)

    const navBtn = document.createElement('button')
    navBtn.type = 'button'
    navBtn.className = 'ee-nav-btn active'
    navBtn.textContent = eeText('Slash 配置项', 'Slash Settings')
    nav.appendChild(navBtn)

    const panel = document.createElement('div')
    panel.className = 'ee-settings-panel'
    body.appendChild(panel)

    const intro = document.createElement('div')
    intro.className = 'ee-settings-intro'
    panel.appendChild(intro)

    const introTitle = document.createElement('div')
    introTitle.className = 'ee-settings-intro-title'
    introTitle.textContent = eeText('用法说明', 'Usage')
    intro.appendChild(introTitle)

    const introItem1 = document.createElement('div')
    introItem1.className = 'ee-settings-intro-item'
    introItem1.textContent = eeText('在空行输入 / 触发菜单，继续输入可筛选，Enter 插入，Esc/点击空白关闭。', 'Type / on an empty line to open the menu, keep typing to filter, Enter to insert, Esc/click blank area to close.')
    intro.appendChild(introItem1)

    const introItem2 = document.createElement('div')
    introItem2.className = 'ee-settings-intro-item'
    introItem2.textContent = eeText('自定义触发词必须以 / 开头，且不能包含空格。', 'Custom triggers must start with / and cannot contain spaces.')
    intro.appendChild(introItem2)

    const introWarn = document.createElement('div')
    introWarn.className = 'ee-settings-intro-warn'
    introWarn.textContent = eeText('注意：当自定义触发词与内置项冲突时，自定义项将失效。', 'Note: If a custom trigger conflicts with a built-in one, the custom item is ignored.')
    intro.appendChild(introWarn)

    const slashSection = document.createElement('div')
    slashSection.className = 'ee-settings-section'
    panel.appendChild(slashSection)

    const slashTitle = document.createElement('div')
    slashTitle.className = 'ee-settings-title'
    slashTitle.textContent = eeText('Slash 菜单', 'Slash Menu')
    slashSection.appendChild(slashTitle)

    const toggleRow = document.createElement('div')
    toggleRow.className = 'ee-settings-row'
    slashSection.appendChild(toggleRow)

    const toggleEnabled = document.createElement('label')
    toggleEnabled.className = 'ee-settings-toggle'
    const enabledInput = document.createElement('input')
    enabledInput.type = 'checkbox'
    enabledInput.checked = !!draft.slash.enabled
    enabledInput.addEventListener('change', () => {
        draft.slash.enabled = enabledInput.checked
    })
    toggleEnabled.appendChild(enabledInput)
    toggleEnabled.appendChild(document.createTextNode(eeText('启用 Slash 菜单', 'Enable slash menu')))

    const toggleSource = document.createElement('label')
    toggleSource.className = 'ee-settings-toggle'
    const sourceInput = document.createElement('input')
    sourceInput.type = 'checkbox'
    sourceInput.checked = !!draft.slash.modeSource
    sourceInput.addEventListener('change', () => {
        draft.slash.modeSource = sourceInput.checked
    })
    toggleSource.appendChild(sourceInput)
    toggleSource.appendChild(document.createTextNode(eeText('源码模式启用', 'Enable in source mode')))

    toggleRow.appendChild(toggleEnabled)
    toggleRow.appendChild(toggleSource)

    const itemsSection = document.createElement('div')
    itemsSection.className = 'ee-settings-section'
    panel.appendChild(itemsSection)

    const itemsTitle = document.createElement('div')
    itemsTitle.className = 'ee-settings-title'
    itemsTitle.textContent = eeText('菜单项', 'Menu Items')
    itemsSection.appendChild(itemsTitle)

    const templateNote = document.createElement('div')
    templateNote.className = 'ee-settings-note'
    templateNote.textContent = eeText(
        '模板变量：{{cursor}} 光标位置，{{date}} {{time}} {{datetime}} 当前时间，{{selection}} 选中文本。',
        'Template vars: {{cursor}} caret, {{date}} {{time}} {{datetime}} current time, {{selection}} selection.',
    )
    itemsSection.appendChild(templateNote)

    const itemsWrap = document.createElement('div')
    itemsWrap.className = 'ee-settings-items'
    itemsSection.appendChild(itemsWrap)

    const editorBox = document.createElement('div')
    editorBox.className = 'ee-item-editor hidden'
    itemsSection.appendChild(editorBox)

    const editorTitle = document.createElement('div')
    editorTitle.style.fontWeight = '600'
    editorTitle.textContent = eeText('新增菜单项', 'Add Item')
    editorBox.appendChild(editorTitle)

    const inputLabel = document.createElement('input')
    inputLabel.className = 'ee-input'
    inputLabel.placeholder = eeText('名称', 'Label')
    editorBox.appendChild(buildSettingsRow(eeText('名称', 'Label'), inputLabel))

    const inputTrigger = document.createElement('input')
    inputTrigger.className = 'ee-input'
    inputTrigger.placeholder = '/trigger'
    editorBox.appendChild(buildSettingsRow(eeText('触发词', 'Trigger'), inputTrigger))

    const inputTemplate = document.createElement('textarea')
    inputTemplate.className = 'ee-textarea'
    inputTemplate.placeholder = eeText('要插入的内容', 'Template to insert')
    editorBox.appendChild(buildSettingsRow(eeText('模板', 'Template'), inputTemplate))

    const editorActions = document.createElement('div')
    editorActions.style.display = 'flex'
    editorActions.style.gap = '8px'
    editorBox.appendChild(editorActions)

    const editorSave = document.createElement('button')
    editorSave.className = 'ee-btn primary'
    editorSave.textContent = eeText('保存菜单项', 'Save item')
    editorActions.appendChild(editorSave)

    const editorCancel = document.createElement('button')
    editorCancel.className = 'ee-btn'
    editorCancel.textContent = eeText('取消', 'Cancel')
    editorActions.appendChild(editorCancel)

    let editingId = null

    function hideEditor() {
        editorBox.classList.add('hidden')
        editingId = null
    }

    function showEditor(item) {
        editingId = item && item.id ? item.id : null
        editorTitle.textContent = editingId ? eeText('编辑菜单项', 'Edit Item') : eeText('新增菜单项', 'Add Item')
        inputLabel.value = (item && item.label) || ''
        inputTrigger.value = (item && item.trigger) || ''
        inputTemplate.value = (item && item.template) || ''
        editorBox.classList.remove('hidden')
    }

    editorCancel.addEventListener('click', () => hideEditor())

    editorSave.addEventListener('click', () => {
        const label = normText(inputLabel.value)
        const trigger = normText(inputTrigger.value)
        const template = String(inputTemplate.value || '')
        if (!label || !trigger || !template) {
            context.ui.notice(eeText('名称、触发词和模板为必填', 'Label, trigger, and template are required'), 'err', 2000)
            return
        }

        const existing = new Set(getBuiltinTriggersLower())
        for (const it of draft.slash.customItems) {
            if (!editingId || it.id !== editingId) {
                existing.add(normText(it.trigger).toLowerCase())
            }
        }
        if (!validateTrigger(trigger, existing, context)) return

        if (editingId) {
            const idx = draft.slash.customItems.findIndex((it) => it.id === editingId)
            if (idx >= 0) {
                draft.slash.customItems[idx] = { id: editingId, label, trigger, template }
            }
        } else {
            const id = `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
            draft.slash.customItems.push({ id, label, trigger, template })
        }
        renderItems()
        hideEditor()
    })

    const addBtn = document.createElement('button')
    addBtn.className = 'ee-btn'
    addBtn.textContent = eeText('新增菜单项', 'Add item')
    addBtn.addEventListener('click', () => showEditor(null))
    itemsSection.appendChild(addBtn)

    function renderItems() {
        itemsWrap.innerHTML = ''
        const allItems = getAllItems(draft)
        const grouped = new Map()
        for (const item of allItems) {
            const cat = item.category || 'custom'
            if (!grouped.has(cat)) grouped.set(cat, [])
            grouped.get(cat).push(item)
        }
        const orderedCategories = [
            ...CATEGORY_ORDER.filter((cat) => grouped.has(cat)),
            ...Array.from(grouped.keys()).filter((cat) => !CATEGORY_ORDER.includes(cat)),
        ]

        function makeRow(item) {
            const row = document.createElement('div')
            row.className = 'ee-item-row' + (item.builtin ? ' builtin' : '')

            const label = document.createElement('div')
            label.className = 'ee-item-label'
            label.textContent = item.label || ''

            const trig = document.createElement('div')
            trig.className = 'ee-item-trigger'
            trig.textContent = item.trigger || ''

            const tpl = document.createElement('div')
            tpl.className = 'ee-item-template'
            tpl.textContent = item.template || ''

            const actions = document.createElement('div')
            actions.className = 'ee-item-actions'

            const editBtn = document.createElement('button')
            editBtn.className = 'ee-btn'
            editBtn.textContent = eeText('编辑', 'Edit')
            editBtn.disabled = !!item.builtin
            editBtn.addEventListener('click', () => {
                if (item.builtin) return
                showEditor(item)
            })

            const delBtn = document.createElement('button')
            delBtn.className = 'ee-btn danger'
            delBtn.textContent = eeText('删除', 'Delete')
            delBtn.disabled = !!item.builtin
            delBtn.addEventListener('click', () => {
                if (item.builtin) return
                void (async () => {
                    const ok = await showConfirmDialog({
                        title: eeText('删除菜单项', 'Delete Item'),
                        message: eeText('确认删除该菜单项？', 'Delete this item?'),
                        okText: eeText('删除', 'Delete'),
                        cancelText: eeText('取消', 'Cancel'),
                    })
                    if (!ok) return
                    draft.slash.customItems = draft.slash.customItems.filter((it) => it.id !== item.id)
                    renderItems()
                })()
            })

            actions.appendChild(editBtn)
            actions.appendChild(delBtn)

            row.appendChild(label)
            row.appendChild(trig)
            row.appendChild(tpl)
            row.appendChild(actions)

            return row
        }

        for (const cat of orderedCategories) {
            const items = grouped.get(cat) || []
            if (!items.length) continue
            const group = document.createElement('div')
            group.className = 'ee-group collapsed'

            const header = document.createElement('div')
            header.className = 'ee-group-header'

            const headLeft = document.createElement('div')
            headLeft.className = 'ee-group-head'

            const title = document.createElement('div')
            title.className = 'ee-group-title'
            title.textContent = getCategoryLabel(cat)

            const meta = document.createElement('div')
            meta.className = 'ee-group-meta'
            meta.textContent = eeText(`${items.length} 项`, `${items.length} items`)

            headLeft.appendChild(title)
            headLeft.appendChild(meta)

            const toggle = document.createElement('div')
            toggle.className = 'ee-group-toggle'
            toggle.textContent = '>'

            header.appendChild(headLeft)
            header.appendChild(toggle)
            group.appendChild(header)

            const bodyEl = document.createElement('div')
            bodyEl.className = 'ee-group-body'
            for (const item of items) {
                bodyEl.appendChild(makeRow(item))
            }
            group.appendChild(bodyEl)

            header.addEventListener('click', () => {
                const collapsed = group.classList.toggle('collapsed')
                toggle.textContent = collapsed ? '>' : 'v'
            })

            itemsWrap.appendChild(group)
        }
    }

    renderItems()

    const footer = document.createElement('div')
    footer.className = 'ee-settings-footer'
    dialog.appendChild(footer)

    const cancelBtn = document.createElement('button')
    cancelBtn.className = 'ee-btn'
    cancelBtn.textContent = eeText('取消', 'Cancel')
    cancelBtn.addEventListener('click', () => overlay.remove())
    footer.appendChild(cancelBtn)

    const saveBtn = document.createElement('button')
    saveBtn.className = 'ee-btn primary'
    saveBtn.textContent = eeText('保存', 'Save')
    saveBtn.addEventListener('click', async () => {
        const normalized = normalizeConfig(draft)
        const ok = await saveConfig(context, normalized)
        if (!ok) {
            context.ui.notice(eeText('保存设置失败', 'Failed to save settings'), 'err', 2000)
            return
        }
        state.cfg = normalized
        applyConfig()
        context.ui.notice(eeText('设置已保存', 'Settings saved'), 'ok', 1600)
        overlay.remove()
    })
    footer.appendChild(saveBtn)

    document.body.appendChild(overlay)
}
