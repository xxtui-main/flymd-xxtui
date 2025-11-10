// Milkdown Mermaid 插件：将 mermaid 代码块渲染为图表
import { $view } from '@milkdown/utils'
import { codeBlockSchema } from '@milkdown/preset-commonmark'
import type { Node } from '@milkdown/prose/model'
import type { EditorView, NodeView } from '@milkdown/prose/view'

// Mermaid 渲染函数
async function renderMermaid(container: HTMLElement, code: string) {
  try {
    const mod: any = await import('mermaid')
    const mermaid = mod?.default || mod

    // 静默错误
    try { (mermaid as any).parseError = () => {} } catch {}
    try { if ((mermaid as any).mermaidAPI) (mermaid as any).mermaidAPI.parseError = () => {} } catch {}

    try {
      mermaid.initialize?.({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'default',
        logLevel: 'fatal' as any,
        fontSize: 16 as any,
        flowchart: { useMaxWidth: true } as any,
        themeVariables: { fontFamily: 'Segoe UI, Helvetica, Arial, sans-serif', fontSize: '16px' } as any,
      })
    } catch {}

    const id = 'mmd-' + Math.random().toString(36).slice(2)
    const { svg } = await mermaid.render(id, code || '')
    // 包装成带工具条的容器
    container.innerHTML = ''
    const wrap = document.createElement('div')
    wrap.innerHTML = svg
    const svgEl = wrap.firstElementChild as SVGElement | null
    if (svgEl) {
      const fig = document.createElement('div')
      fig.className = 'mmd-figure'
      fig.appendChild(svgEl)
      // 工具条：- / + / R（调用全局 setMermaidScale）
      const tools = document.createElement('div')
      tools.className = 'mmd-tools'
      const mkBtn = (txt: string, title: string) => { const b = document.createElement('button'); b.textContent = txt; b.title = title; return b }
      const btnOut = mkBtn('-', 'Mermaid 缩小')
      const btnIn = mkBtn('+', 'Mermaid 放大')
      const btnReset = mkBtn('R', 'Mermaid 重置为100%')
      tools.appendChild(btnOut); tools.appendChild(btnIn); tools.appendChild(btnReset)
      const callSet = (n: number) => { try { const w: any = window as any; if (w.setMermaidScale) w.setMermaidScale(n) } catch {} }
      btnOut.addEventListener('click', (ev) => { ev.stopPropagation(); try { const v = (Number.parseFloat(localStorage.getItem('flymd:mermaidScale') || '1')||1)-0.1; callSet(Math.max(0.3, Math.round(v*100)/100)) } catch {} })
      btnIn.addEventListener('click', (ev) => { ev.stopPropagation(); try { const v = (Number.parseFloat(localStorage.getItem('flymd:mermaidScale') || '1')||1)+0.1; callSet(Math.min(3.0, Math.round(v*100)/100)) } catch {} })
      btnReset.addEventListener('click', (ev) => { ev.stopPropagation(); try { callSet(1.0) } catch {} })
      fig.appendChild(tools)
      container.appendChild(fig)
    }

    try {
      const svgEl = container.querySelector('svg') as SVGElement | null
      if (svgEl) {
        svgEl.style.display = 'block'
        svgEl.style.maxWidth = '100%'
        svgEl.style.height = 'auto'

        if (!svgEl.getAttribute('preserveAspectRatio')) {
          svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
        }

        const vb = svgEl.getAttribute('viewBox') || ''
        if (!/(\d|\s)\s*(\d|\s)/.test(vb)) {
          const w = parseFloat(svgEl.getAttribute('width') || '')
          const h = parseFloat(svgEl.getAttribute('height') || '')
          if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
            svgEl.setAttribute('viewBox', `0 0 ${w} ${h}`)
          }
        }

        if (svgEl.hasAttribute('width')) svgEl.removeAttribute('width')
        if (svgEl.hasAttribute('height')) svgEl.removeAttribute('height')

        setTimeout(() => {
          try {
            const bb = (svgEl as any).getBBox ? (svgEl as any).getBBox() : null
            if (bb && bb.width > 0 && bb.height > 0) {
              const pad = Math.max(2, Math.min(24, Math.round(Math.max(bb.width, bb.height) * 0.02)))
              const vx = Math.floor(bb.x) - pad
              const vy = Math.floor(bb.y) - pad
              const vw = Math.ceil(bb.width) + pad * 2
              const vh = Math.ceil(bb.height) + pad * 2
              svgEl.setAttribute('viewBox', `${vx} ${vy} ${vw} ${vh}`)

              let scale = 0.75
              try {
                const sv = localStorage.getItem('flymd:mermaidScale')
                const n = sv ? parseFloat(sv) : NaN
                if (Number.isFinite(n) && n > 0) scale = n
              } catch {}

              const finalW = Math.max(10, Math.round(vw * scale))
              svgEl.style.width = finalW + 'px'
            }
          } catch {}
        }, 0)
      }
    } catch {}
  } catch (e) {
    container.innerHTML = ''
    console.error('[Mermaid Plugin] 渲染失败:', e)
  }
}

// Mermaid NodeView
class MermaidNodeView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement | null
  private chartContainer: HTMLElement
  private preWrapper: HTMLElement
  private node: Node
  private view: EditorView
  private getPos: () => number | undefined

  constructor(node: Node, view: EditorView, getPos: () => number | undefined) {
    console.log('[Mermaid Plugin] 创建 NodeView, language:', node.attrs.language)

    this.node = node
    this.view = view
    this.getPos = getPos

    // 创建外层容器
    this.dom = document.createElement('div')
    this.dom.classList.add('mermaid-node-wrapper')
    this.dom.style.margin = '1em 0'
    this.dom.style.position = 'relative'

    // 创建源代码容器（保持可编辑）- 使用标准的 pre>code 结构
    this.preWrapper = document.createElement('pre')
    this.preWrapper.style.display = 'none' // 隐藏源代码
    this.preWrapper.style.whiteSpace = 'pre'
    this.contentDOM = document.createElement('code')
    this.preWrapper.appendChild(this.contentDOM)
    this.dom.appendChild(this.preWrapper)

    // 创建图表容器
    this.chartContainer = document.createElement('div')
    this.chartContainer.classList.add('mermaid-chart-display')
    this.chartContainer.style.background = 'var(--wysiwyg-bg, #f5f5f5)'
    this.chartContainer.style.borderRadius = '4px'
    this.chartContainer.style.padding = '8px'
    this.chartContainer.style.minHeight = '50px'
    this.chartContainer.style.cursor = 'pointer'
    this.chartContainer.textContent = '渲染中...'

    // 双击切换到源代码编辑
    this.chartContainer.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      e.preventDefault()
      console.log('[Mermaid Plugin] 双击图表，切换到源代码')
      // 显示源代码，隐藏图表
      this.preWrapper.style.display = 'block'
      this.preWrapper.style.border = '1px solid #ccc'
      this.preWrapper.style.padding = '8px'
      this.preWrapper.style.borderRadius = '4px'
      this.preWrapper.style.background = '#fff'
      this.chartContainer.style.display = 'none'
      // 聚焦到代码编辑区
      requestAnimationFrame(() => {
        try {
          const range = document.createRange()
          const sel = window.getSelection()
          if (this.contentDOM && sel) {
            range.selectNodeContents(this.contentDOM)
            range.collapse(false)
            sel.removeAllRanges()
            sel.addRange(range)
            // 强制聚焦
            ;(this.contentDOM as HTMLElement).focus()
          }
        } catch {}
      })
    })

    // 按 Escape 键退出编辑模式
    const exitEditMode = () => {
      console.log('[Mermaid Plugin] 退出编辑模式')
      this.preWrapper.style.display = 'none'
      this.chartContainer.style.display = 'block'
      // 强制重新渲染
      requestAnimationFrame(() => {
        this.renderChart()
      })
    }

    this.preWrapper.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        exitEditMode()
      }
    })

    // 点击外部区域时退出编辑模式
    document.addEventListener('click', this.handleClickOutside)

    this.dom.appendChild(this.chartContainer)

    // 初始渲染
    this.renderChart()
  }

  private async renderChart() {
    const code = this.node.textContent
    console.log('[Mermaid Plugin] 开始渲染，代码长度:', code.length)

    if (!code || !code.trim()) {
      this.chartContainer.textContent = '(空 mermaid 图表)'
      return
    }

    this.chartContainer.textContent = '渲染中...'
    try {
      await renderMermaid(this.chartContainer, code)
      console.log('[Mermaid Plugin] 渲染完成')
    } catch (e) {
      console.error('[Mermaid Plugin] 渲染出错:', e)
      this.chartContainer.textContent = '渲染失败'
    }
  }

  update(node: Node) {
    console.log('[Mermaid Plugin] update 被调用')
    if (node.type !== this.node.type) return false

    const oldCode = this.node.textContent
    const newCode = node.textContent

    this.node = node

    if (oldCode !== newCode) {
      console.log('[Mermaid Plugin] 代码变化，重新渲染')
      this.renderChart()
    }

    return true
  }

  destroy() {
    console.log('[Mermaid Plugin] destroy 被调用')
    // 清理事件监听器
    try {
      document.removeEventListener('click', this.handleClickOutside)
    } catch {}
  }

  private handleClickOutside = (e: Event) => {
    if (this.preWrapper.style.display !== 'none') {
      const target = e.target as HTMLElement
      if (!this.dom.contains(target)) {
        this.preWrapper.style.display = 'none'
        this.chartContainer.style.display = 'block'
        requestAnimationFrame(() => {
          this.renderChart()
        })
      }
    }
  }

  ignoreMutation() {
    return true
  }
}

// 创建 mermaid 插件
export const mermaidPlugin = $view(codeBlockSchema.node, () => {
  return (node, view, getPos) => {
    // 只处理 language 为 mermaid 的代码块
    const lang = node.attrs.language
    console.log('[Mermaid Plugin] $view 回调, language:', lang)

    if (lang && lang.toLowerCase() === 'mermaid') {
      console.log('[Mermaid Plugin] 创建 MermaidNodeView')
      return new MermaidNodeView(node, view, getPos as () => number | undefined)
    }

    // 其他代码块返回 undefined，使用默认渲染
    return undefined
  }
})
