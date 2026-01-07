// 简版 markdown-it KaTeX 插件，固定使用顶层 katex@0.16
import type MarkdownIt from 'markdown-it'
import katex from 'katex'
// 启用 mhchem：支持 \ce{...} / \pu{...} 等化学公式宏（所见模式/阅读模式共用同一份 KaTeX 实例）
import 'katex/contrib/mhchem'

type KatexOpts = Parameters<typeof katex.renderToString>[1]

function isValidDelim(src: string, pos: number) {
  const max = src.length
  const prev = pos > 0 ? src.charCodeAt(pos - 1) : -1
  const next = pos + 1 <= max ? src.charCodeAt(pos + 1) : -1
  const canClose = !(prev === 0x20 || prev === 0x09 || (next >= 0x30 && next <= 0x39))
  const canOpen = !(next === 0x20 || next === 0x09)
  return { canOpen, canClose }
}

function math_inline(state: any, silent: boolean) {
  if (state.src[state.pos] !== '$') return false
  const res = isValidDelim(state.src, state.pos)
  if (!res.canOpen) { if (!silent) state.pending += '$'; state.pos += 1; return true }
  let start = state.pos + 1
  let match = start
  while ((match = state.src.indexOf('$', match)) !== -1) {
    let p = match - 1
    while (state.src[p] === '\\') p--
    if (((match - p) & 1) === 1) break
    match++
  }
  if (match === -1) { if (!silent) state.pending += '$'; state.pos = start; return true }
  if (match - start === 0) { if (!silent) state.pending += '$$'; state.pos = start + 1; return true }
  const res2 = isValidDelim(state.src, match)
  if (!res2.canClose) { if (!silent) state.pending += '$'; state.pos = start; return true }
  if (!silent) { const t = state.push('math_inline', 'math', 0); t.markup = '$'; t.content = state.src.slice(start, match) }
  state.pos = match + 1
  return true
}

function math_block(state: any, start: number, end: number, silent: boolean) {
  let pos = state.bMarks[start] + state.tShift[start]
  let max = state.eMarks[start]
  if (pos + 2 > max) return false
  if (state.src.slice(pos, pos + 2) !== '$$') return false
  pos += 2
  let firstLine = state.src.slice(pos, max)
  let next = start, lastLine = '', found = false
  if (silent) return true
  if (firstLine.trim().slice(-2) === '$$') { firstLine = firstLine.trim().slice(0, -2); found = true }
  for (; !found;) {
    next++
    if (next >= end) break
    pos = state.bMarks[next] + state.tShift[next]
    max = state.eMarks[next]
    if (pos < max && state.tShift[next] < state.blkIndent) break
    if (state.src.slice(pos, max).trim().slice(-2) === '$$') {
      const lastPos = state.src.slice(0, max).lastIndexOf('$$')
      lastLine = state.src.slice(pos, lastPos)
      found = true
    }
  }
  state.line = next + 1
  const token = state.push('math_block', 'math', 0)
  token.block = true
  token.content = (firstLine && firstLine.trim() ? firstLine + '\n' : '') +
                  state.getLines(start + 1, next, state.tShift[start], true) +
                  (lastLine && lastLine.trim() ? lastLine : '')
  token.map = [start, state.line]; token.markup = '$$'
  return true
}

export default function katexPlugin(md: MarkdownIt, options: KatexOpts = {}) {
  // 解析仍复用现有的数学语法识别，但不直接生成 KaTeX HTML 字符串，
  // 改为输出占位元素，后续在渲染阶段用 katex.render 挂载（与所见模式一致）。
  const esc = (s: string) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

  md.inline.ruler.after('escape', 'math_inline', math_inline as any)
  md.block.ruler.after('blockquote', 'math_block', math_block as any, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })

  // 输出安全占位，示例如下：
  //   <span class="md-math-inline" data-math="..."></span>
  //   <div class="md-math-block" data-math="..."></div>
  // 这样 DOMPurify 不会剥离关键 SVG/path 属性，因为真正的 KaTeX DOM 在消毒之后才插入。
  md.renderer.rules.math_inline = (t: any, i: number) => `<span class="md-math-inline" data-math="${esc(t[i].content)}"></span>`
  md.renderer.rules.math_block = (t: any, i: number) => `<div class="md-math-block" data-math="${esc(t[i].content)}"></div>\n`
}
