# Al-Maktaba Al-Shamila — Uyghur Edition ("بىلىم خەزىنىسى" / Bilim Hezinisi)

## Project Overview
Full-featured Uyghur desktop library application inspired by المكتبة الشاملة.
Standalone Windows app (NSIS installer + portable .exe). The CORE is fully
offline; AI is an OPTIONAL, opt-in online layer (see Architecture).

## Core Principles
- Production-grade, fully functional, error-free code. Outline architecture before coding; modify ONLY what is necessary.
- Development and code comments in English; Uyghur ONLY in UI strings and content.
- Offline-first: every CORE feature must work with no network and no API key.
- No transpile step — preserve CRLF line endings; `node --check` must pass on every changed `.js` file and on inline `<script>` blocks.
- Every bug gets a test that fails before the fix and passes after: `npm test` (syntax gate + main-process and notebook suites). Never weaken or delete a test to make it pass.
- Never break the renderer security model (see DO-NOT-TOUCH).

## Architecture (actual — supersedes any "React/TypeScript" assumption)
- **Electron 28 + plain JavaScript** (NOT React, NOT TypeScript; app code is not built/transpiled).
  - Main process: `main.js`, `database.js`, `ai.js`, `ocr-postprocess.js`; secure IPC bridge in `preload.js` (contextBridge).
  - Renderer: single `src/index.html` + vanilla JS modules (`notes.js`, `quran.js`, `spellcheck.js`, `ngram.js`, `sanitize.js`, `ai-client.js`).
- **Data:** better-sqlite3 + SQLite FTS5 (unicode61). The library lives OUTSIDE the source tree at `%USERPROFILE%\JamiyKutupxana\library.db` (WAL mode); `npm run dev` uses a separate `JamiyKutupxana-DEV`. Tables include `book_content`/`book_fts`, `quran_ayas`/`quran_fts`, and a key/value `settings` table.
- **Parsing:** PDF (pdfjs-dist, local), DOCX (mammoth), DOC (word-extractor), TXT, HTML/Markdown + web-page import (@mozilla/readability + turndown + node-html-parser).
- **OCR (offline):** tesseract.js + tesseract.js-core with bundled UyghurOCR 2.0 LSTM models (ukij + uig) under `assets/ocr`; `ocr-postprocess.js` reflows paragraphs and normalizes characters. Models are downloaded via `npm run fetch-ocr-models` and shipped asar-unpacked.
- **AI (optional, online):** Google Gemini, called ONLY from the main process (`ai.js`) via `electron.net.fetch` — Chromium's stack, so the Windows certificate store and system proxy apply (Node's own fetch fails wherever an antivirus inspects HTTPS); the renderer reaches it through IPC. Default model `gemini-3.7-flash`; also `gemini-3.5-flash-lite` (free) and `gemini-3.1-pro-preview` (PAID — no free tier). Every request sends `thinkingLevel` (low/high), NEVER `thinkingBudget: 0`, which two of the three models reject outright. The user supplies their OWN key (`AIza…`), stored obfuscated in the `settings` table and never logged. STRICT model selection — never silently switch the user's chosen model. SSE streaming for chat/translate/ask; 60s timeout, retry/backoff, ~1M-char cap.
- **Spellcheck (offline):** the engine lives in `src/spellcheck/*.js` (CommonJS)
  and runs in the MAIN process — not the renderer, and not a Web Worker (the
  renderer is loaded from `file://`, where Chromium refuses to start one). It
  reads `assets/spellcheck/uyghur-dict.bin`, a 2.2 MB binary dictionary of
  443,039 words (one byte per Uyghur letter, front-coded, with a flags byte
  per word for corpus frequency and productive stems). Beyond the word list it
  knows Uyghur morphology, so a correctly formed inflection the list lacks is
  accepted rather than underlined. The renderer (`src/spellcheck.js`) is a thin
  IPC client that sends the editor's flattened text and paints the returned
  offsets with the CSS Custom Highlight API — never with elements, which used
  to be saved into the note. Rebuild the dictionary with
  `npm run build-spelldict` (inputs in `spellcheck-data/`, never shipped);
  check it with `npm run test-spelldict`.
- **Packaging:** electron-builder → NSIS installer + portable .exe (x64). `asarUnpack` covers better-sqlite3, tesseract.js(+core), and `assets/ocr`.
- A companion **mobile app** (BilimHezinisi-Mobile) shares this AI/parser logic; `_mobile-ai-reference/` is the read-only port source.

## Feature Set
1. Book Management — single/bulk import, metadata edit, export. Formats: PDF, TXT, DOCX, DOC, HTML, Markdown, web URL.
2. OCR — auto-detect scanned PDFs → offline Uyghur OCR; image & clipboard OCR; optional AI cleanup of recognition errors.
3. Category System — hierarchical tree, drag-and-drop, tags.
4. Search Engine — cross-book FTS5, phrase/wildcard/Boolean operators; target <3s over 500 books.
5. Book Reader — RTL, themes, bookmarks, notes, print; plus AI panel (summarize, explain, translate, term-explain, ask).
6. Quran Module — mushaf view, FTS over ayas, copy.
7. Notebook — rich-text editor, format painter, find/replace, word count, DOCX export, collapsible panels; plus AI menu (translate, Uyghur proofread, chat, page Q&A).
8. Spellcheck — morphology-aware Uyghur checker (see below).
9. Optional Gemini AI — bring-your-own-key, content-type-aware prompts, OCR cleanup, metadata autofill; fully gated/hidden when disabled or no key.
10. .EXE Installer — NSIS + portable.

## Language & Content
Primary UI = Uyghur, **RTL mandatory**. Content languages: Uyghur, Arabic, English, Turkish.

## Performance Targets
Startup <3s · Import <10s · Search (500 books) <3s · AI responses stream incrementally.

## DO-NOT-TOUCH (hard constraints)
- Renderer CSP stays `connect-src 'self'` — the renderer NEVER talks to the network; ALL AI traffic is main-process only.
- CORE features must keep working with no network and no AI key. AI is always opt-in and gated.
- Never log or expose the API key beyond a masked form; it stays in the main process.
- Do not relocate, rename, or rewrite the user library at `JamiyKutupxana`.

## Notebook rules (3.5)
Each of these is a bug the 2026-10-22 audit reproduced. The reason is the rule.
- **A line end is a word boundary.** Spellcheck, find and the reference scanner read the note through ONE text map (`src/textmap.js`) that puts `"\n"` at every block edge and every `<br>`. Concatenating text nodes glued «مەنىڭ» + «چۈشەنمىگەن» into one "word", and accepting its suggestion then deleted the next paragraph's first word.
- **Never rewrite a selection, or the whole note, as HTML.** No `sel.toString()` + `insertHTML`, no `selectAll` + `insertHTML` — edit over Ranges with the editing commands (`insertText`, `bold`, `fontName`, …). Rebuilding the selection merged three painted paragraphs into one and nested a whole note inside its leading quote.
- **`putDocument(html)` is the only code that assigns the editor's `innerHTML`** (mount, version restore, AI apply), so sanitizing, unwrapping legacy markup and re-running the counts happen in exactly one place. A static test fails if anything else assigns it.
- **Nothing temporary goes into the note.** Spelling underlines, find hits and reference matches are painted with the CSS Custom Highlight API, and clicks are hit-tested back into the text. Elements were saved with the note and came back as dead markup the writer could not remove.
- **Nothing typed is lost.** Save before leaving the notebook, switching notes, following a link or closing the window; retry a failed save (5 s, 15 s, 45 s, then every 60 s while dirty); never show «ساقلاندى» while something unsaved is on screen.
- **Destructive changes are undoable.** Replace-all, AI apply and version restore store a `note_versions` row first.
- **Quoted material is not the writer's text.** `QUOTED_SELECTOR` — `a[href]`, an inline `UthmanicHafs` (the desktop's alias, written without a space) or `Uthmanic Hafs`, `[data-ref-insert="1"]`, `.notes-inserted-ref` — is never spell-marked, never painted, never scanned and never sent to the AI.
- **The format painter copies font family and size** (the desktop's advantage over the web edition), captures only formatting that is explicitly set, and never copies the theme's text colour: text painted in the dark theme was near-invisible in the light one.
- **Messages go through `toast(msg, type)`.** `showToast` never existed, so 19 messages were thrown away silently. No `window.prompt()` (Electron does not implement it) and no new renderer `confirm()`.

### Measured in Electron 28 (Chromium 120),Kept as tests in `tests/notebook/suite-engine.js`, so an Electron upgrade that changes one of them goes red there first.,- `document.caretRangeFromPoint` exists, `caretPositionFromPoint` does not — the hit test uses the first.,- The toolbar's size levels 1–7 are 10, 13, 16, 18, 24, 32, 48 px. A pixel size is painted as the nearest level.,- `removeFormat` keeps block elements, `<br>`, links and classes, and **strips `data-*` attributes** — so a painted range must never contain quoted material (`.notes-inserted-ref` is in `QUOTED_SELECTOR` for that reason).,- Line height and first-line indent have no editing command: they are set directly on blocks and are **not** part of the browser's undo history. Accepted; the version history (Phase 3) covers them.,,## Library data safety (3.5)
- **A book is deleted only by `db-delete-book`.** `save-library` and `syncBooks` never delete by omission: one failed read at startup left `books: []`, and the next save (a theme change, a page turn) would have wiped the library.
- **`load-library` reads its parts separately** and reports `loadErrors`. A part that failed to load in this session is never synced back; the renderer says so instead of saving over it.
- **Schema changes are additive, ordered `PRAGMA user_version` steps**, each in a transaction, with a backup to `JamiyKutupxana\backups\` before the first pending step of a run.
- **Backups live in `JamiyKutupxana\backups\`.** Nothing inside `JamiyKutupxana` is renamed or moved, ever.
- **A reading position is saved with the targeted progress IPC**, not by sending the whole library on every page turn. `saveData()` is for real state changes.
- **Risky testing uses `npm run dev`** (`JamiyKutupxana-DEV`); `npm test` uses a fresh temp directory. The real library is for a final check only.
- **Nothing new reaches the network:** the renderer CSP stays `connect-src 'self'`, `will-navigate` allows only the app's own `index.html`, and `setWindowOpenHandler` hands only parsed `http:`/`https:` URLs to `shell.openExternal`.

## Build / Release Workflow
Edit only in the source folder → `npm test` (the syntax gate — `node --check` over every `.js` and the inline scripts of `index.html` — plus the main-process and notebook suites; `npm run check-syntax` runs the gate alone) → test with `npm run dev` (`npm start` only for a final check on the real library) → bump `version` in `package.json` → `npm run fetch-ocr-models` on a networked machine (BEFORE dist, so models ship) → `npm run dist-win` → commit per change.

## Roadmap / Future Direction
- Desktop ↔ mobile feature parity from shared AI/parser logic.
- Deepen AI usefulness for classical Uyghur/Arabic texts; add usage/quota visibility; investigate an offline/local model option to restore fully-offline AI.
- Reliable single-step (native) undo for AI-applied text edits (proofread / OCR-cleanup).
- More import formats (e.g. EPUB) and expanded OCR coverage.
- Optional backup/sync for the library and notes.
