# FlySpeed Markdown (flyMD)

[中文说明](README.md) | English

[![Version](https://img.shields.io/badge/version-v0.1.6-blue.svg)](https://github.com/flyhunterl/flymd)
[![License](https://img.shields.io/badge/license-NonCommercial-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg)](https://github.com/flyhunterl/flymd)

A fast, cross‑platform Markdown editor and PDF reader with a clean UI, safe preview, and a modern WYSIWYG V2 experience.

> Screenshots: see the Chinese README for an up‑to‑date gallery.

## Highlights
- Lightweight & instant: tiny installer, sub‑second cold start
- Clean layout: minimalist menubar + editor, distraction‑free
- WYSIWYG V2: real editing view powered by Milkdown (toggle `Ctrl+W`)
  - Two render modes: Instant render and Enter‑to‑render (`Ctrl+Shift+R`)
- Edit/Read modes: toggle `Ctrl+E`, quick Read `Ctrl+R`
- Complete stack: Markdown, KaTeX (LaTeX), Mermaid, HTML, highlight.js
- Safe preview: DOMPurify sanitizes HTML; external links add `target="_blank"` + `rel="noopener"`
- Library: folder tree + recent files + context actions (new/rename/move/delete)
- PDF: built‑in viewer and bookmark Outline (with cache & auto‑invalidate)
- Image upload: S3/R2 integration; paste/drag to upload and insert URL; robust local fallback
- Sync: WebDAV extension with logs, progress and conflict prompts
- Position memory: remember last read/edit caret/scroll per file
- i18n: English/Chinese UI with Auto mode following system language

## Core Features
- Editing Experience (WYSIWYG V2)
  - Real-time editing / true WYSIWYG powered by Milkdown; two render modes: Instant and Enter-to-render (`Ctrl+W` to toggle, `Ctrl+Shift+R` to choose mode)
  - Low-latency native pipeline: keep `<textarea>`, IME-friendly composition, smart pairing for brackets/quotes without disrupting input
  - Consistent indent & multi-line: `Tab/Shift+Tab` behave the same in Edit and WYSIWYG, avoiding accidental 4-space code blocks
  - Formatting shortcuts: `Ctrl+B` bold, `Ctrl+I` italic, `Ctrl+K` insert link; precise line/column/caret info
- Reading & Outline
  - Safe preview: `markdown-it` + `highlight.js` + `DOMPurify`; external links get `target="_blank"` + `rel="noopener"`
  - Outline navigation: extract `H1-H6` into a clickable TOC; highlight current heading; scroll sync with preview
  - PDF Outline: built-in PDF viewer with bookmarks; cached per file and auto-invalidated on change
- Images & Hosting
  - Paste/drag images; prefer upload to S3/R2 and insert a public URL; when unconfigured/failure, fall back to local save
  - Local images just work: convert local paths to `asset:` in Tauri so they render without extra config
- Sync (WebDAV extension)
  - Visual sync: status hints, logs, progress, and conflict prompts
  - Conflict strategies: `newest`/`skip`/`last-wins` (default `newest`), based on `mtime/etag` to reduce misjudgment
  - Remote MOVE optimization: use `MOVE` to avoid duplicate download/upload; better rename/move handling
- PDF Export (no header/footer)
  - Save directly as PDF: cross-platform native export with headers/footers removed; supports `A4/margins/background`
  - Preview-accurate: export from the preview HTML to match what you see
- i18n & Usability
  - English/Chinese + Auto follow system language; remember user preference
  - Position memory: per-file last read/edit caret and scroll position
- Security & Performance
  - Local-first, no background network unless you explicitly enable features (image upload, sync, etc.)
  - Optimized startup/render: lazy loads, chunked assets, controllable logs; target cold start <300ms, preview toggle <16ms (typical 2-3k lines)
## Getting Started
- Install
  - Download the installer for your platform; on Windows, WebView2 is required (usually preinstalled)
- Create/Open
  - New: `Ctrl+N`; Open: `Ctrl+O`; Save: `Ctrl+S`; Save As: `Ctrl+Shift+S`
  - Library: sidebar tree supports new/rename/move/delete and recent files
- Mode Switch
  - Edit/Read: `Ctrl+E`; Quick Read: `Ctrl+R`
  - WYSIWYG: `Ctrl+W`; switch Instant vs Enter-to-render: `Ctrl+Shift+R`
- Editing
  - Bold/Italic/Link: `Ctrl+B / Ctrl+I / Ctrl+K`; `Esc` closes dialogs
  - Images: paste/drag; with S3/R2 configured, auto-upload and insert URL; otherwise fall back to local save
- Sync (optional)
  - Enable WebDAV in Extensions; you will see logs/progress/conflicts; start with an empty folder to verify
- Export to PDF (optional)
  - Choose `.pdf` in Save As; cross-platform header/footer-free export; defaults to `A4` with `16mm` margins and background on
- Language
  - Switch Chinese/English or Auto; your preference is remembered
## Shortcuts
- File: `Ctrl+N` New, `Ctrl+O` Open, `Ctrl+S` Save, `Ctrl+Shift+S` Save As
- Mode: `Ctrl+E` Edit/Read, `Ctrl+R` Quick Read, `Ctrl+W` Toggle WYSIWYG, `Ctrl+Shift+R` Toggle Enter‑to‑render (WYSIWYG)
- Format: `Ctrl+B` Bold, `Ctrl+I` Italic, `Ctrl+K` Insert Link, `Esc` Close dialogs

## Install
- Download the latest release and run the installer
- Requirements: Windows 10/11 (x64) / Linux / macOS; WebView2 on Windows

## Development & Build
- Run
  - Frontend dev: `npm run dev`
  - Tauri dev: `npm run tauri:dev`
- Build
  - Frontend: `npm run build`
  - Tauri package: `npm run tauri:build`
- Optional (PDF Outline only): `npm i pdfjs-dist`
- Android: see BUILD_ANDROID.md

## Roadmap
### Completed (v0.1.6)
- WYSIWYG V2 (Milkdown) with instant/enter-to-render; dual Edit/Read views with quick toggle
- Library + recent files + context actions; Markdown outline with scroll sync
- PDF reading with Outline cache; PDF export (no header/footer, cross-platform)
- Image paste/drag + S3/R2 first + local fallback
- WebDAV sync extension: visual progress and conflict handling (`newest/skip/last-wins`)
- DOMPurify preview safety; i18n (EN/zh + Auto); position memory; performance and size optimizations

### In Progress (0.1.x)
- Sync robustness: more precise `etag/mtime` comparison; solid rename/move/interruption handling
- Image hosting UX: retries and batch insert; broader S3-compatible coverage
- PDF export details: more paper sizes/margin presets; clarity/pagination tuning
- Performance & stability: finer-grained lazy loading; smoother large-document scroll/render
- Usability: more shortcuts and localized menu items; consistent dialogs/status hints
## Privacy & Security
- flyMD is a local desktop app. No background network access is performed unless you explicitly enable features (e.g., S3/R2 upload, WebDAV sync)

## License & Notices
- Non‑Commercial Open License (flyMD NC 1.0). See [LICENSE](LICENSE)
- Allowed: use/modify/copy/redistribute for non‑commercial purposes with attribution and a link to the source
- Commercial use: prohibited without prior written authorization → contact: flyhunterl <flyhunterl@gmail.com>
- Third‑party notices: [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)
- In case of discrepancy, the Chinese original in LICENSE prevails

## Acknowledgements
- Tauri, markdown‑it, DOMPurify, highlight.js, KaTeX, Mermaid, Milkdown

