// src/exporters/pdf.ts
// 使用 html2pdf.js 将指定 DOM 元素导出为 PDF 字节

function normalizeSvgSize(svgEl: SVGElement, targetWidth: number) {
  try {
    const vb = svgEl.getAttribute('viewBox')
    let w = 0, h = 0
    if (vb) {
      const p = vb.split(/\s+/).map(Number)
      if (p.length === 4) { w = p[2]; h = p[3] }
    }
    const hasWH = Number(svgEl.getAttribute('width')) || Number(svgEl.getAttribute('height'))
    if ((!w || !h) && hasWH) {
      w = Number(svgEl.getAttribute('width')) || 800
      h = Number(svgEl.getAttribute('height')) || 600
    }
    if (!w || !h) { w = 800; h = 600 }
    const ratio = targetWidth / w
    const targetHeight = Math.max(1, Math.round(h * ratio))
    svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet')
    svgEl.setAttribute('width', String(targetWidth))
    svgEl.setAttribute('height', String(targetHeight))
    try { (svgEl.style as any).width = '100%'; (svgEl.style as any).height = 'auto' } catch {}
  } catch {}
}

export async function exportPdf(el: HTMLElement, opt?: any): Promise<Uint8Array> {
  const mod: any = await import('html2pdf.js/dist/html2pdf.bundle.min.js')
  const html2pdf: any = (mod && (mod.default || mod)) || mod

  const options = {
    margin: 10, // 单位：mm
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
    ...opt,
  }

  // 克隆并约束版心宽度
  const wrap = document.createElement('div')
  wrap.style.position = 'fixed'
  wrap.style.left = '-10000px'
  wrap.style.top = '0'
  wrap.style.width = '720px' // 约等于 A4 净宽
  const clone = el.cloneNode(true) as HTMLElement
  clone.style.width = '100%'

  // 基础样式：保证图片不溢出
  const style = document.createElement('style')
  style.textContent = `
    .preview-body img, img { max-width: 100% !important; height: auto !important; }
    figure { max-width: 100% !important; }
  `
  clone.prepend(style)

  // 处理 Mermaid：将 code/pre 转为 .mermaid 并渲染为 SVG
  try {
    const codeBlocks = clone.querySelectorAll('pre > code.language-mermaid')
    codeBlocks.forEach((code) => {
      try {
        const pre = code.parentElement as HTMLElement
        const text = code.textContent || ''
        const div = document.createElement('div')
        div.className = 'mermaid'
        div.textContent = text
        pre.replaceWith(div)
      } catch {}
    })
    const preMermaid = clone.querySelectorAll('pre.mermaid')
    preMermaid.forEach((pre) => {
      try {
        const text = pre.textContent || ''
        const div = document.createElement('div')
        div.className = 'mermaid'
        div.textContent = text
        pre.replaceWith(div)
      } catch {}
    })
    const nodes = Array.from(clone.querySelectorAll('.mermaid')) as HTMLElement[]
    if (nodes.length > 0) {
      let mermaid: any
      try { mermaid = (await import('mermaid')).default } catch (e1) { try { mermaid = (await import('mermaid/dist/mermaid.esm.mjs')).default } catch { mermaid = null } }
      if (mermaid) {
        try { mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'default', logLevel: 'fatal' as any }) } catch {}
        for (let i = 0; i < nodes.length; i++) {
          const n = nodes[i]
          const code = n.textContent || ''
          try {
            const id = 'pdf-mermaid-' + i + '-' + Date.now()
            const { svg } = await mermaid.render(id, code)
            const wrapSvg = document.createElement('div')
            wrapSvg.innerHTML = svg
            const svgEl = wrapSvg.firstElementChild as SVGElement | null
            if (svgEl) {
              // 归一化尺寸：按页宽适配
              normalizeSvgSize(svgEl, 720)
              n.replaceWith(svgEl)
            }
          } catch {}
        }
      }
    }
  } catch {}

  // 同步归一化所有现存 SVG（包含非 mermaid 的）
  try { Array.from(clone.querySelectorAll('svg')).forEach((svg) => normalizeSvgSize(svg, 720)) } catch {}

  wrap.appendChild(clone)
  document.body.appendChild(wrap)
  try {
    const ab: ArrayBuffer = await html2pdf().set(options).from(clone).toPdf().output('arraybuffer')
    return new Uint8Array(ab)
  } finally {
    try { document.body.removeChild(wrap) } catch {}
  }
}
