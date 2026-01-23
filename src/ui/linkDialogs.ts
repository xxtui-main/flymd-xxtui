// 插入链接 / 重命名 对话框 UI 模块
// 从 main.ts 拆分，专门负责 link-overlay / rename-overlay 的交互逻辑

// 打开“插入链接”对话框的 Promise 控制器
let linkDialogResolver: ((result: { label: string; url: string } | null) => void) | null = null

function showLinkOverlay(show: boolean): void {
  const overlay = document.getElementById('link-overlay') as HTMLDivElement | null
  if (!overlay) return
  if (show) overlay.classList.remove('hidden')
  else overlay.classList.add('hidden')
}

export async function openRenameDialog(stem: string, ext: string): Promise<string | null> {
  try {
    const overlay = document.getElementById('rename-overlay') as HTMLDivElement | null
    const form = overlay?.querySelector('#rename-form') as HTMLFormElement | null
    const inputText = overlay?.querySelector('#rename-text') as HTMLInputElement | null
    const inputExt = overlay?.querySelector('#rename-ext') as HTMLInputElement | null
    const btnCancel = overlay?.querySelector('#rename-cancel') as HTMLButtonElement | null
    const btnClose = overlay?.querySelector('#rename-close') as HTMLButtonElement | null
    if (!overlay || !form || !inputText || !inputExt) {
      const v = prompt('重命名为（不含后缀）：', stem) || ''
      return v.trim() || null
    }
    inputText.value = stem
    inputExt.value = ext
    return await new Promise<string | null>((resolve) => {
      const onSubmit = (e: Event) => { e.preventDefault(); const v = (inputText.value || '').trim(); resolve(v || null); cleanup() }
      const onCancel = () => { resolve(null); cleanup() }
      function cleanup() {
        overlay.classList.add('hidden')
        try {
          form.removeEventListener('submit', onSubmit)
          btnCancel?.removeEventListener('click', onCancel)
          btnClose?.removeEventListener('click', onCancel)
        } catch {}
      }
      form.addEventListener('submit', onSubmit)
      btnCancel?.addEventListener('click', onCancel)
      btnClose?.addEventListener('click', onCancel)
      // 禁止点击遮罩关闭：避免选中文字/拖拽鼠标误触到窗口外导致对话框直接消失
      overlay.classList.remove('hidden')
      setTimeout(() => { try { inputText.focus() } catch {} }, 0)
    })
  } catch {
    return null
  }
}

export async function openLinkDialog(
  presetLabel: string,
  presetUrl = 'https://',
): Promise<{ label: string; url: string } | null> {
  const overlay = document.getElementById('link-overlay') as HTMLDivElement | null
  const form = overlay?.querySelector('#link-form') as HTMLFormElement | null
  const inputText = overlay?.querySelector('#link-text') as HTMLInputElement | null
  const inputUrl = overlay?.querySelector('#link-url') as HTMLInputElement | null
  const btnCancel = overlay?.querySelector('#link-cancel') as HTMLButtonElement | null
  const btnClose = overlay?.querySelector('#link-close') as HTMLButtonElement | null

  // 如果没有自定义对话框，降级使用 prompt（保持功能可用）
  if (!overlay || !form || !inputText || !inputUrl) {
    const url = prompt('输入链接 URL：', presetUrl) || ''
    if (!url) return null
    const label = presetLabel || '链接文本'
    return { label, url }
  }

  inputText.value = presetLabel || '链接文本'
  inputUrl.value = presetUrl

  return new Promise((resolve) => {
    // 清理并设置 resolver
    linkDialogResolver = (result) => {
      showLinkOverlay(false)
      try {
        form.removeEventListener('submit', onSubmit)
        btnCancel?.removeEventListener('click', onCancel)
        btnClose?.removeEventListener('click', onCancel)
        overlay.removeEventListener('click', onOverlayClick)
      } catch {}
      resolve(result)
      linkDialogResolver = null
    }

    function onSubmit(e: Event) {
      e.preventDefault()
      const label = (inputText.value || '').trim() || '链接文本'
      const url = (inputUrl.value || '').trim()
      if (!url) {
        inputUrl.focus()
        return
      }
      linkDialogResolver && linkDialogResolver({ label, url })
    }

    function onCancel() {
      linkDialogResolver && linkDialogResolver(null)
    }

    function onOverlayClick(e: MouseEvent) {
      if (e.target === overlay) onCancel()
    }

    form.addEventListener('submit', onSubmit)
    btnCancel?.addEventListener('click', onCancel)
    btnClose?.addEventListener('click', onCancel)
    overlay.addEventListener('click', onOverlayClick)

    showLinkOverlay(true)
    setTimeout(() => {
      try {
        inputUrl.focus()
        inputUrl.select()
      } catch {}
    }, 0)
  })
}
