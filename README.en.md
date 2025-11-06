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

### Edit
- Native `<textarea>` editor for zero‑latency typing
- WYSIWYG V2 (Milkdown) for rich, document‑true editing
  - Toggle: `Ctrl+W`; switch Instant vs Enter‑to‑render: `Ctrl+Shift+R`
- Chinese IME friendly: safe composition; smart auto‑pair for (), [], {}, "", '', ``````; full‑width pairs like 《》、【】、（） etc.
- Tab indent that stays consistent across modes:
  - Tab inserts exactly two `&emsp;` at line start; Shift+Tab removes one set
  - Works in Edit and WYSIWYG, single‑line and multi‑line; avoids 4‑space code blocks
- Formatting shortcuts: `Ctrl+B` bold, `Ctrl+I` italic; `Ctrl+K` insert link
- UTF‑8 throughout; accurate cursor/line/column reporting

### Read (Preview)
- Toggle Edit/Read: `Ctrl+E`; quick Read: `Ctrl+R`
- markdown‑it + highlight.js; DOMPurify cleans HTML and allows required SVG tags/attrs
- Local image paths auto‑converted to `asset:` in Tauri so images render without extra config
- KaTeX for LaTeX; Mermaid for diagrams. Mermaid parse errors are silenced in WYSIWYG to avoid disrupting input

### Sidebar Outline (Markdown & PDF)
- Markdown: extract H1–H6 into a clickable outline; highlight current heading; scroll‑sync
- PDF: parse document bookmarks into a clickable Outline; jump to pages; cache per file and auto‑invalidate by mtime
  - Note: `pdfjs-dist` is an optional dev/build dependency only for the Outline feature. End users do not need to install it

### Images (S3/R2 or Local)
- Priority
  1) Upload enabled + configured → upload and insert public URL (no local copy)
  2) Disabled/not configured → save locally (existing doc → sibling `images/`; unsaved → system Pictures)
  3) Upload fails while enabled → fallback to local save
- Paste/drag an image directly into the editor

### Extensions
- Built‑in extension system; install from GitHub/URL
- Example: Typecho Publisher → https://github.com/TGU-HansJack/typecho-publisher-flymd

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