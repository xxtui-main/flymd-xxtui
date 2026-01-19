// Markdown 表格插入插件

// 轻量多语言：跟随宿主（flymd.locale），默认用系统语言
const MT_LOCALE_LS_KEY = 'flymd.locale';
function mtDetectLocale() {
  try {
    const nav = typeof navigator !== 'undefined' ? navigator : null;
    const lang = (nav && (nav.language || nav.userLanguage)) || 'en';
    const lower = String(lang || '').toLowerCase();
    if (lower.startsWith('zh')) return 'zh';
  } catch {}
  return 'en';
}
function mtGetLocale() {
  try {
    const ls = typeof localStorage !== 'undefined' ? localStorage : null;
    const v = ls && ls.getItem(MT_LOCALE_LS_KEY);
    if (v === 'zh' || v === 'en') return v;
  } catch {}
  return mtDetectLocale();
}
function mtText(zh, en) {
  return mtGetLocale() === 'en' ? en : zh;
}

// 生成 Markdown 表格字符串
function buildTable(colCount, rowCount) {
  const cols = Math.max(1, Math.min(10, colCount | 0));
  const rows = Math.max(1, Math.min(20, rowCount | 0));

  const headerCells = [];
  const alignCells = [];

  for (let i = 1; i <= cols; i++) {
    headerCells.push(mtText('列', 'Col ') + i);
    alignCells.push('---');
  }

  const lines = [];
  lines.push('| ' + headerCells.join(' | ') + ' |');
  lines.push('| ' + alignCells.join(' | ') + ' |');

  for (let r = 0; r < rows; r++) {
    const cells = new Array(cols).fill('');
    lines.push('| ' + cells.join(' | ') + ' |');
  }

  return lines.join('\n');
}

// ========= 所见模式插入定位：缓存最后一次有效插入锚点 =========
// 背景：命令面板/弹窗会抢走焦点与 DOM selection，导致插入点丢失；
// 同时 ProseMirror 可能重建 DOM，旧 Range 会失效，所以用 “Range + 文本偏移” 双锚点兜底。
let mtLastWysiwygAnchor = null; // { range: Range, offset: number } | null
let mtUnbindWysiwygSelectionTracker = null;

// 判断是否处于所见模式（尽量不依赖宿主实现细节）
function mtIsWysiwygActive() {
  try {
    const w = typeof window !== 'undefined' ? window : null;
    const fn = w && w.flymdGetWysiwygEnabled;
    if (typeof fn === 'function') return !!fn();
  } catch {}
  try {
    // 兜底：通过容器 class 判断（flyMD 所见 V2 会加 .wysiwyg-v2）
    return !!document.querySelector('.container.wysiwyg-v2');
  } catch {}
  return false;
}

function mtGetWysiwygRoot() {
  try {
    return document.querySelector('#md-wysiwyg-root .ProseMirror') || document.querySelector('#md-wysiwyg-root');
  } catch {
    return null;
  }
}

function mtIsWysiwygFocused() {
  try {
    const root = mtGetWysiwygRoot();
    if (!root) return false;
    const active = document.activeElement;
    return !!(active && mtNodeContains(root, active));
  } catch {
    return false;
  }
}

function mtNodeContains(container, node) {
  try {
    if (!container || !node) return false;
    return container === node || container.contains(node);
  } catch {
    return false;
  }
}

function mtCaptureWysiwygRange() {
  try {
    const root = mtGetWysiwygRoot();
    if (!root) return null;
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount <= 0) return null;
    const r0 = sel.getRangeAt(0);
    if (!r0) return null;
    // 只接受发生在所见编辑器内部的选区，避免把菜单/按钮的 selection 当成插入点
    if (!mtNodeContains(root, r0.startContainer) || !mtNodeContains(root, r0.endContainer)) return null;
    return r0.cloneRange();
  } catch {
    return null;
  }
}

function mtGetRememberedWysiwygAnchor() {
  try {
    if (!mtLastWysiwygAnchor) return null;
    const out = { range: null, offset: null };
    try {
      if (mtLastWysiwygAnchor.range && typeof mtLastWysiwygAnchor.range.cloneRange === 'function') {
        out.range = mtLastWysiwygAnchor.range.cloneRange();
      }
    } catch {}
    try {
      if (Number.isFinite(mtLastWysiwygAnchor.offset)) out.offset = mtLastWysiwygAnchor.offset;
    } catch {}
    if (out.range || Number.isFinite(out.offset)) return out;
  } catch {}
  return null;
}

function mtGetWysiwygCaretTextOffset(range) {
  try {
    const root = mtGetWysiwygRoot();
    if (!root || !range) return null;
    if (!mtNodeContains(root, range.startContainer)) return null;

    const r = document.createRange();
    r.setStart(root, 0);
    r.setEnd(range.startContainer, range.startOffset);
    const s = r.toString();
    return Number.isFinite(s.length) ? s.length : null;
  } catch {
    return null;
  }
}

function mtRememberWysiwygAnchor() {
  try {
    // 命令面板/弹窗打开时 activeElement 不在编辑器里：
    // 此时 DOM selection 往往不可靠（甚至会被重置到开头），不要覆盖掉之前记录的锚点。
    if (!mtIsWysiwygFocused()) return;
    const r = mtCaptureWysiwygRange();
    if (!r) return;
    const offset = mtGetWysiwygCaretTextOffset(r);
    const a = { range: r, offset: Number.isFinite(offset) ? offset : null };
    mtLastWysiwygAnchor = a;
  } catch {}
}

function mtRestoreWysiwygRange(range) {
  try {
    const sel = window.getSelection && window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    if (range) sel.addRange(range);
    return true;
  } catch {
    return false;
  }
}

function mtRestoreWysiwygByTextOffset(offset) {
  try {
    const root = mtGetWysiwygRoot();
    if (!root) return false;
    const n0 = Number(offset);
    if (!Number.isFinite(n0) || n0 < 0) return false;

    let remaining = Math.floor(n0);
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node = tw.nextNode();

    // 没有任何文本节点，退回到根起点
    if (!node) {
      const r0 = document.createRange();
      r0.setStart(root, 0);
      r0.collapse(true);
      return mtRestoreWysiwygRange(r0);
    }

    while (node) {
      const t = String(node.nodeValue || '');
      if (remaining <= t.length) {
        const r = document.createRange();
        r.setStart(node, remaining);
        r.collapse(true);
        return mtRestoreWysiwygRange(r);
      }
      remaining -= t.length;
      node = tw.nextNode();
    }

    // 偏移超出文档文本长度：放到最后一个文本节点末尾
    const last = tw.currentNode;
    if (last) {
      const t2 = String(last.nodeValue || '');
      const r2 = document.createRange();
      r2.setStart(last, t2.length);
      r2.collapse(true);
      return mtRestoreWysiwygRange(r2);
    }
  } catch {}
  return false;
}

function mtFocusWysiwygRoot() {
  const root = mtGetWysiwygRoot();
  if (!root) return false;
  try {
    if (typeof root.focus === 'function') {
      try { root.focus({ preventScroll: true }); return true; } catch {}
      try { root.focus(); return true; } catch {}
    }
  } catch {}
  return false;
}

function mtBuildHtmlTable(colCount, rowCount) {
  const cols = Math.max(1, Math.min(10, colCount | 0));
  const rows = Math.max(1, Math.min(20, rowCount | 0));
  if (typeof document === 'undefined') return '';

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  const trHead = document.createElement('tr');
  for (let i = 1; i <= cols; i++) {
    const th = document.createElement('th');
    th.textContent = mtText('列', 'Col ') + i;
    trHead.appendChild(th);
  }
  thead.appendChild(trHead);
  table.appendChild(thead);

  for (let r = 0; r < rows; r++) {
    const tr = document.createElement('tr');
    for (let c = 0; c < cols; c++) {
      const td = document.createElement('td');
      td.textContent = '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);

  return table.outerHTML;
}

function mtExecCommandInsert(cmd, payload) {
  try {
    if (typeof document === 'undefined') return false;
    if (typeof document.execCommand !== 'function') return false;
    return !!document.execCommand(cmd, false, payload);
  } catch {
    return false;
  }
}

function mtTryInsertTableInWysiwyg(context, cols, rows, range) {
  // 先聚焦（命令面板会抢走焦点；ProseMirror 可能在 focus 时自己恢复选区）
  mtFocusWysiwygRoot();

  // 再尝试恢复选区：优先使用传入 Range；Range 失效就用缓存偏移兜底
  let restored = false;
  try {
    const r = range || null;
    if (r) restored = mtRestoreWysiwygRange(r);
  } catch {}
  if (!restored) {
    try {
      const a = mtGetRememberedWysiwygAnchor();
      if (a && Number.isFinite(a.offset)) {
        restored = mtRestoreWysiwygByTextOffset(a.offset);
      }
    } catch {}
  }

  // 优先插入 HTML 表格：让 ProseMirror/Milkdown 直接解析为表格节点
  const html = mtBuildHtmlTable(cols, rows);
  if (html && mtExecCommandInsert('insertHTML', html)) return true;

  // 兜底：插入 Markdown 表格文本（依赖 automd/gfm 的输入规则转换）
  const md = buildTable(cols, rows);
  const text = '\n' + md + '\n';
  if (mtExecCommandInsert('insertText', text)) return true;

  // 最差情况：告诉用户切回源码模式
  try {
    context.ui.notice(
      mtText('所见模式插入失败：请切回源码模式再试', 'WYSIWYG insert failed: please switch to source mode and retry'),
      'err',
      2400,
    );
  } catch {}
  return false;
}

function mtCaptureInsertAnchor(context) {
  // 所见模式：抓 DOM Range；源码模式：抓字符偏移
  if (mtIsWysiwygActive()) {
    // 关键点：
    // - 当所见编辑器未聚焦时（例如命令面板/弹窗/本插件浮层），window.getSelection 往往不可靠；
    // - 这时应优先使用“最后一次聚焦时记录”的锚点，才能插到用户真正的光标位置。
    const remembered = mtGetRememberedWysiwygAnchor();
    if (!mtIsWysiwygFocused()) {
      if (remembered) return { mode: 'wysiwyg', range: remembered.range, offset: remembered.offset };
      const r0 = mtCaptureWysiwygRange();
      if (r0) {
        const off0 = mtGetWysiwygCaretTextOffset(r0);
        return { mode: 'wysiwyg', range: r0, offset: Number.isFinite(off0) ? off0 : null };
      }
      return { mode: 'wysiwyg', range: null, offset: null };
    }

    // 所见编辑器聚焦时：当前 selection 才可信
    const r = mtCaptureWysiwygRange();
    if (r) {
      const off = mtGetWysiwygCaretTextOffset(r);
      return { mode: 'wysiwyg', range: r, offset: Number.isFinite(off) ? off : null };
    }
    return { mode: 'wysiwyg', range: remembered ? remembered.range : null, offset: remembered ? remembered.offset : null };
  }
  try {
    const sel = context.getSelection && context.getSelection();
    if (sel && Number.isFinite(sel.start) && Number.isFinite(sel.end)) {
      return { mode: 'source', start: sel.start, end: sel.end, text: String(sel.text || '') };
    }
  } catch {}
  return { mode: 'unknown' };
}

function mtStartWysiwygSelectionTracker() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};
  if (mtUnbindWysiwygSelectionTracker) return mtUnbindWysiwygSelectionTracker;

  // 用捕获阶段监听，尽量早拿到 selection（同时我们只记录发生在所见编辑器内的 range）
  const handler = (ev) => {
    try {
      if (!mtIsWysiwygActive()) return;
      // 1) 鼠标事件：只要命中所见编辑器，就记录（哪怕此刻还没 focus）
      try {
        const root = mtGetWysiwygRoot();
        const t = ev && ev.target;
        const hit = root && t && mtNodeContains(root, t);
        if (hit) {
          const r = mtCaptureWysiwygRange();
          if (r) {
            const offset = mtGetWysiwygCaretTextOffset(r);
            mtLastWysiwygAnchor = { range: r, offset: Number.isFinite(offset) ? offset : null };
            return;
          }
        }
      } catch {}
      // 2) 其它情况：仅当所见编辑器确实处于 focus 时才更新（避免命令面板覆盖锚点）
      mtRememberWysiwygAnchor();
    } catch {}
  };

  try { document.addEventListener('selectionchange', handler, true); } catch {}
  try { document.addEventListener('mouseup', handler, true); } catch {}
  try { document.addEventListener('keyup', handler, true); } catch {}
  try { document.addEventListener('mousedown', handler, true); } catch {}

  const unbind = () => {
    try { document.removeEventListener('selectionchange', handler, true); } catch {}
    try { document.removeEventListener('mouseup', handler, true); } catch {}
    try { document.removeEventListener('keyup', handler, true); } catch {}
    try { document.removeEventListener('mousedown', handler, true); } catch {}
  };

  mtUnbindWysiwygSelectionTracker = unbind;
  return unbind;
}

// 将表格插入到当前选区或光标处
function insertTable(context, cols, rows, anchor) {
  // 所见模式：优先走 ProseMirror 插入（否则会用到 textarea 的旧光标位置，必然错）
  if (anchor && anchor.mode === 'wysiwyg') {
    // 注意：anchor.range 可能为空/失效；mtTryInsertTableInWysiwyg 内部会用缓存偏移兜底
    const ok = mtTryInsertTableInWysiwyg(context, cols, rows, anchor.range || null);
    if (ok) {
      context.ui.notice(
        mtText('已插入 ', 'Inserted ') + cols + '×' + rows + mtText(' 表格', ' table'),
        'ok',
        2000,
      );
    }
    return;
  }

  const table = buildTable(cols, rows);
  const sel = (() => {
    try {
      if (anchor && anchor.mode === 'source' && Number.isFinite(anchor.start) && Number.isFinite(anchor.end)) {
        return { start: anchor.start, end: anchor.end, text: String(anchor.text || '') };
      }
      return context.getSelection && context.getSelection();
    } catch {
      return null;
    }
  })();

  // 优先用 replaceRange：能在“失焦后 selection 丢失/变化”时保持插入位置稳定
  if (sel && Number.isFinite(sel.start) && Number.isFinite(sel.end) && context.replaceRange) {
    if (sel.text && sel.text.length > 0) {
      context.replaceRange(sel.start, sel.end, table);
    } else {
      context.replaceRange(sel.start, sel.end, '\n' + table + '\n');
    }
  } else if (context.insertAtCursor) {
    context.insertAtCursor('\n' + table + '\n');
  } else {
    const content = context.getEditorValue();
    const next = (content || '') + '\n\n' + table + '\n';
    context.setEditorValue(next);
  }

  context.ui.notice(
    mtText('已插入 ', 'Inserted ') + cols + '×' + rows + mtText(' 表格', ' table'),
    'ok',
    2000,
  );
}

// 解析用户输入的行列数
function parseSize(input, fallback, min, max) {
  if (input == null) return fallback;
  const n = parseInt(String(input).trim(), 10);
  if (!Number.isFinite(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

// 使用输入框方式选择表格大小（降级方案）
function openTablePickerWithPrompt(context, anchor) {
  const colInput = prompt(mtText('请输入列数（1-10）', 'Enter number of columns (1-10)'), '3');
  if (colInput === null) return;

  const rowInput = prompt(mtText('请输入数据行数（1-20）', 'Enter number of data rows (1-20)'), '3');
  if (rowInput === null) return;

  const cols = parseSize(colInput, 3, 1, 10);
  const rows = parseSize(rowInput, 3, 1, 20);

  insertTable(context, cols, rows, anchor);
}

let tablePickerState = null;

// 打开类似 Word 的表格选择网格
function openTablePicker(context) {
  // 注意：不要在这里“强行记选区”——命令面板触发时 selection 可能已不可靠，容易把锚点覆盖成开头。
  // 插入时再取 anchor（当前 selection 或缓存锚点）即可。
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    const anchor = mtCaptureInsertAnchor(context);
    openTablePickerWithPrompt(context, anchor);
    return;
  }

  if (!document.body) {
    const anchor = mtCaptureInsertAnchor(context);
    openTablePickerWithPrompt(context, anchor);
    return;
  }

  if (tablePickerState && tablePickerState.overlay) {
    tablePickerState.overlay.remove();
    window.removeEventListener('keydown', tablePickerState.keyHandler);
    tablePickerState = null;
  }

  const maxCols = 10;
  const maxRows = 8;

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.background = 'rgba(15,23,42,0.35)';
  overlay.style.zIndex = '999999';

  const panel = document.createElement('div');
  panel.style.background = 'var(--bg, #ffffff)';
  panel.style.color = 'var(--fg, #0f172a)';
  panel.style.borderRadius = '8px';
  panel.style.boxShadow = '0 20px 40px rgba(15,23,42,0.30)';
  panel.style.padding = '12px 16px';
  panel.style.fontSize = '13px';
  panel.style.fontFamily = 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif';

  const label = document.createElement('div');
  label.textContent = mtText('选择表格大小：1 × 1', 'Table size: 1 × 1');
  label.style.marginBottom = '8px';

  const grid = document.createElement('div');
  grid.style.display = 'grid';
  grid.style.gridTemplateColumns = 'repeat(' + maxCols + ', 18px)';
  grid.style.gridTemplateRows = 'repeat(' + maxRows + ', 18px)';
  grid.style.gap = '2px';

  const cells = [];
  for (let r = 1; r <= maxRows; r++) {
    for (let c = 1; c <= maxCols; c++) {
      const cell = document.createElement('div');
      cell.style.width = '18px';
      cell.style.height = '18px';
      cell.style.border = '1px solid #cbd5f5';
      cell.style.borderRadius = '2px';
      cell.style.boxSizing = 'border-box';
      cell.style.background = '#ffffff';
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      grid.appendChild(cell);
      cells.push(cell);
    }
  }

  let currentRows = 1;
  let currentCols = 1;

  const updateHighlight = (rows, cols) => {
    currentRows = rows;
    currentCols = cols;
    label.textContent =
      mtText('选择表格大小：', 'Table size: ') + cols + ' × ' + rows;
    for (const cell of cells) {
      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);
      if (r <= rows && c <= cols) {
        cell.style.background = '#3b82f6';
        cell.style.borderColor = '#1d4ed8';
      } else {
        cell.style.background = '#ffffff';
        cell.style.borderColor = '#cbd5f5';
      }
    }
  };

  for (const cell of cells) {
    cell.addEventListener('mouseover', () => {
      const r = parseInt(cell.dataset.row, 10);
      const c = parseInt(cell.dataset.col, 10);
      updateHighlight(r, c);
    });
    cell.addEventListener('click', () => {
      if (currentCols > 0 && currentRows > 0) {
        if (tablePickerState && tablePickerState.overlay) {
          tablePickerState.overlay.remove();
          window.removeEventListener('keydown', tablePickerState.keyHandler);
          tablePickerState = null;
        }
        const anchor = mtCaptureInsertAnchor(context);
        insertTable(context, currentCols, currentRows, anchor);
      }
    });
  }

  const keyHandler = (e) => {
    if (e.key === 'Escape') {
      if (tablePickerState && tablePickerState.overlay) {
        tablePickerState.overlay.remove();
        window.removeEventListener('keydown', keyHandler);
        tablePickerState = null;
      }
    }
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      if (tablePickerState && tablePickerState.overlay) {
        tablePickerState.overlay.remove();
        window.removeEventListener('keydown', keyHandler);
        tablePickerState = null;
      }
    }
  });

  panel.appendChild(label);
  panel.appendChild(grid);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  tablePickerState = { overlay, keyHandler };
  window.addEventListener('keydown', keyHandler);

  updateHighlight(1, 1);
}

export function activate(context) {
  // 所见模式：追踪最后一次有效选区（命令面板/弹窗抢焦点时仍能插到正确位置）
  try {
    const unbind = mtStartWysiwygSelectionTracker();
    // 兼容：若宿主提供 onDeactivate，则挂到一起清理
    try {
      const prev = context && context.onDeactivate;
      if (typeof prev === 'function') {
        context.onDeactivate = () => { try { unbind() } catch {}; try { prev() } catch {} };
      } else if (context) {
        context.onDeactivate = () => { try { unbind() } catch {} };
      }
    } catch {}
  } catch {}

  context.addMenuItem({
    label: mtText('表格', 'Table'),
    title: mtText('插入 Markdown 表格', 'Insert Markdown table'),
    onClick: () => {
      openTablePicker(context);
    }
  });

  // 右键菜单：在当前光标处插入表格
  context.addContextMenuItem({
    label: mtText('插入表格…', 'Insert table…'),
    icon: '📊',
    condition: (ctx) => ctx.mode === 'edit' || ctx.mode === 'wysiwyg',
    onClick: () => {
      openTablePicker(context);
    }
  });
}

export function deactivate() {
  // 清理所见选区追踪监听
  try {
    if (mtUnbindWysiwygSelectionTracker) {
      mtUnbindWysiwygSelectionTracker();
      mtUnbindWysiwygSelectionTracker = null;
    }
  } catch {}
  mtLastWysiwygAnchor = null;
}
