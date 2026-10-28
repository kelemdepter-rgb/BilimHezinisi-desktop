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
  - Main process: `main.js`, `database.js`, `ai.js`, `ocr-postprocess.js`, `library-sync.js` (the safe load/save of the library), `backup.js` (backups and restore), `navigation.js` (where windows may go), `note-export.js` (a note as Word and PDF), `pdf-original.js` (where a PDF book's file is), `ocr-engine.js` (the offline OCR engine's options), `search-forms.js` (a word's Uyghur forms for search), `web-library.js` (the website's catalog and downloads), `text-normalize.js` (letters, not glyph codepoints); secure IPC bridge in `preload.js` (contextBridge). Every new top-level main-process file must also be listed in `build.files`.
  - Renderer: single `src/index.html` + vanilla JS modules (`notes.js`, `notes-export.js`, `note-units.js`, `reader-places.js`, `textmap.js`, `quran.js`, `verse-label.js`, `pdf-text.js`, `markdown-text.js`, `spellcheck.js`, `ngram.js`, `sanitize.js`, `ai-client.js`). The spell engine's main-process side also holds `src/spellcheck/personal.js` (the personal dictionary's rules) and `glued.js`.
- **Data:** better-sqlite3 + SQLite FTS5 (unicode61). The library lives OUTSIDE the source tree at `%USERPROFILE%\JamiyKutupxana\library.db` (WAL mode); `npm run dev` uses a separate `JamiyKutupxana-DEV`. Tables include `book_content`/`book_fts`, `quran_ayas`/`quran_fts`, and a key/value `settings` table.
- **Parsing:** PDF (pdfjs-dist, local), DOCX (mammoth), DOC (word-extractor), TXT, HTML/Markdown + web-page import (@mozilla/readability + turndown + node-html-parser).
- **OCR (offline):** tesseract.js + tesseract.js-core with bundled UyghurOCR 2.0 LSTM models (ukij + uig) under `assets/ocr`; `ocr-postprocess.js` reflows paragraphs and normalizes characters; `ocr-engine.js` holds the engine's options (see «3.6»). Models are downloaded via `npm run fetch-ocr-models` and shipped asar-unpacked.
- **AI (optional, online):** Google Gemini, called ONLY from the main process (`ai.js`) via `electron.net.fetch` — Chromium's stack, so the Windows certificate store and system proxy apply (Node's own fetch fails wherever an antivirus inspects HTTPS); the renderer reaches it through IPC. Default model `gemini-3.7-flash`; also `gemini-3.5-flash-lite` (free) and `gemini-3.1-pro-preview` (PAID — no free tier). Every request sends `thinkingLevel` (low/high), NEVER `thinkingBudget: 0`, which two of the three models reject outright. The user supplies their OWN key (`AIza…`), stored obfuscated in the `settings` table and never logged. STRICT model selection — never silently switch the user's chosen model. SSE streaming for chat/translate/ask; 60s timeout, retry/backoff, ~1M-char cap.
- **The website's books (optional, online):** «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» reads the published catalog of bilimhezinisi.com from its Supabase project with the public anon key and downloads a book through the website's own gate — main process only (`web-library.js`, `electron.net.fetch`), only when the owner opens the catalog or downloads a book (see «3.6»).
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
1. Book Management — single/bulk import, metadata edit, export. Formats: PDF, TXT, DOCX, DOC, HTML, Markdown, web URL; and the Bilim Hezinisi website's published books, downloaded and kept up to date from a catalog inside the app. Text is stored as letters, never as presentation-form glyphs; «كىتابلارنى تەكشۈرۈش» (Settings) repairs older books.
2. OCR — auto-detect scanned PDFs → offline Uyghur OCR; image & clipboard OCR; optional AI cleanup of recognition errors (in the notebook: on the selection, undoable).
3. Category System — hierarchical tree, drag-and-drop, tags.
4. Search Engine — cross-book search for any part of a word in title, author and text (substring — the owner's decision for 3.5; the FTS5 index serves the notebook's reference scan); search history, clearable; target <3s over 500 books.
5. Book Reader — RTL, themes, print; bookmarks (named, renamable) and in-book notes that keep their paragraph; the reading position restored to the paragraph; plus AI panel (summarize, explain, translate, term-explain, ask).
6. Quran Module — mushaf view, FTS over ayas, copy; verse bookmarks with a sidebar list; the last verse read offered again.
7. Notebook — rich-text editor, format painter, find/replace, block style, outline, undo/redo buttons, word count; version history, trash, a sortable/pinnable list with content search; export to Word, PDF, Markdown and text; citation links and a link card; a source search over the library and the Qur'an; collapsible panels; plus AI menu (translate, Uyghur proofread by units, chat, page Q&A).
8. Spellcheck — morphology-aware Uyghur checker (see below); F7 step-through, a personal-dictionary panel, ignore-in-this-note.
9. Optional Gemini AI — bring-your-own-key, content-type-aware prompts, OCR cleanup, metadata autofill; fully gated/hidden when disabled or no key.
10. Backup and restore — weekly automatic backups, one before every schema step, restore from Settings; all in `JamiyKutupxana\backups\`.
11. .EXE Installer — NSIS + portable.

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
- **Destructive changes are undoable.** Replace-all, a format paint over more than one paragraph, AI apply and version restore keep a `note_versions` row first (`window.notesKeepVersion(reason)`, snapshot taken synchronously before the change). The rules of the store — no duplicates, `auto` every 5 min, 30 per note — are in `database.js` (`noteVersionKeep`).
- **Quoted material is not the writer's text.** `QUOTED_SELECTOR` — `a[href]`, an inline `UthmanicHafs` (the desktop's alias, written without a space) or `Uthmanic Hafs`, `[data-ref-insert="1"]`, `.notes-inserted-ref` — is never spell-marked, never painted, never scanned and never sent to the AI. An inserted verse's translation span carries `data-ref-insert="1"` too — on the span, never the paragraph, which Enter would copy into the writer's next line.
- **A citation leads back, and nothing in the note navigates.** An inserted passage ends with `a.bh-cite` → `bh://book/<id>?o=<offset>&q=<word>` (the offset is the snippet's `pos` into the book's content), a verse with `bh://quran/<sura>/<aya>`; the sanitizer keeps `bh:` on `a.bh-cite` in those two shapes only. A click on any link shows the card (`showLinkCard` in notes.js), Ctrl+click opens; «ئېچىش» saves the note first; an http(s) address goes through `window.open` to main's `setWindowOpenHandler`. Every link click is `preventDefault`ed.
- **The AI writes back only what changed.** `src/note-units.js`: units holding quoted material are never sent; a ⟦N⟧ answer is accepted only whole and in order; only the changed part of a line is written, through a Range and `insertText` (one undo step each); a line edited meanwhile is left alone. OCR cleanup replaces the selection, or a note of plain paragraphs only, as one `insertText`. Every AI apply calls `window.notesBeforeAi()` first; «يېنىۋېلىش» is `window.notesUndoAi()`. The whole-note rebuild (`naiSetEditorBlocks`) is gone and a static test keeps it gone.
- **The format painter copies font family and size** (the desktop's advantage over the web edition), captures only formatting that is explicitly set, and never copies the theme's text colour: text painted in the dark theme was near-invisible in the light one.
- **The sanitizer is explicit.** No `USE_PROFILES` in DOMPurify — a profile silently REPLACES the allow lists, which is how `data-ref-insert` was stripped while `<img>` and any CSS passed (K6). Tags, attributes and CSS properties are named one by one in `src/sanitize.js`; `style` is filtered per declaration, never with a `url()`. `sanitize-keeps-editor-output` proves every toolbar command survives it.
- **Export reads a model, not text.** `src/notes-export.js` turns the note into a plain document model (and into Markdown / text); `note-export.js` writes Word from it and prints the PDF. Word paragraphs and runs are right-to-left, alignment is written logically (CSS right/start → `left`), fonts are named — never embedded — by the family inside the font file, for complex script too. A note quoting a verse ends with the Qur'an credit, word for word as the sura footer says it (a test keeps them in step).
- **Deleting a note is reversible.** It goes to the trash (no question, «قايتۇرۇش» in the toast); it is deleted for good only from the trash, when the trash is emptied, after 30 days, or when it is an untouched «يېڭى خاتىرە». A trashed note is read-only. Trashing, restoring and pinning never change `updated_at`. An irreversible button asks with an inline second click, never `confirm()`.
- **The personal dictionary is the writer's, and untrusted on import.** One word by the checker's own tokenizer (`src/spellcheck/personal.js`), 2–64 characters, ≤ 5,000; words go on screen through `textContent`. A glued-looking entry is marked, never removed.
- **Messages go through `toast(msg, type)`** — for a change that can be taken back, `toast(msg, type, { action: { label, run }, ms })`. `showToast` never existed, so 19 messages were thrown away silently. No `window.prompt()` (Electron does not implement it) and no new renderer `confirm()`.

### Measured in Electron 28 (Chromium 120)
Kept as tests in `tests/notebook/suite-engine.js`, so an Electron upgrade that changes one of them goes red there first.
- `document.caretRangeFromPoint` exists, `caretPositionFromPoint` does not — the hit test uses the first.
- The toolbar's size levels 1–7 are 10, 13, 16, 18, 24, 32, 48 px. A pixel size is painted as the nearest level.
- `removeFormat` keeps block elements, `<br>`, links, classes and `data-*` attributes. (Phase 1 first recorded that it strips `data-*`: that was the old sanitizer stripping `data-ref-insert` on open — K6 — not the command. The test now checks the attribute is there before the command runs.)
- Line height and first-line indent have no editing command: they are set directly on blocks and are **not** part of the browser's undo history. Accepted; the version history (Phase 3) covers them.
- A heading, or a quote of text lines, becomes normal text with `formatBlock <p>`; a quote of blocks needs `outdent` over its whole content. Each is one undo step. Normal text is `<p>` in this editor (that is what Enter makes), not the web edition's `<div>`.
- The bundled `UthmanicHafs1.otf` names itself «KFGQPC HafsEx1 Uthmanic Script» (read from its name table) — that is the name an exported Word file uses for a verse. The UKIJ files carry the names the app already uses.
- `insertText` with `\n` makes a paragraph of each line (`\n\n` leaves an empty `<p>`), and replacing a selection with it is ONE undo step. `Selection.toString()` follows layout (a `<p>`'s margin gives `\n\n`), so paragraphs are found through the text map, not through it.
- A hidden `BrowserWindow` (the test runner's) cannot be counted on for frames: 3.5 measured that `requestAnimationFrame` never fires there and scrolling sends no `scroll` event; in 3.6 Phase 2 it did fire. Code a test must cover does not wait for a frame; a test that needs a scroll event sends it; a test that needs NO frames holds them back itself (`pdf-render-in-a-hidden-window`).
- A plain `PRAGMA integrity_check` failed with "SQL logic error" on every library made before 3.5: the bundled SQLite (3.49.2) also checks FTS5, and `book_fts` was declared with `content_rowid` without an external content table — which also made its rows impossible to delete and `snippet()` fail. Migration step 5 rebuilds it; `backup.js` still checks table by table.
- A window behind another one (`visibilityState` «hidden») draws no frames either: a place to restore is scrolled to at once, not in `requestAnimationFrame`.

## Reader, Qur'an and search (3.5)
- **A place is a character offset**, where its paragraph begins in the book's text — never a percentage of a scroll height. `src/reader-places.js` cuts the reader's pages (exactly the ones readers already had), gives each page its start and maps an offset to a page and a paragraph; the reader renders `<p data-off>` through it. Bookmarks, in-book notes and the reading position store it as `char_offset` (migration step 3); NULL is an old row, listed as such, never given a place it did not have. `syncReadingProgress` is an upsert that keeps the place when the percentage is unchanged.
- **Books are stored as letters.** `text-normalize.js` folds Arabic presentation forms (U+FB50–FBFF, U+FE70–FEFF) per character, then NFC; never NFKC over a whole string, which would expand ﷲ ﷺ (U+FDF0–FDFD, never touched). database.js applies it at every write of a book's title, author, description or text. «كىتابلارنى تەكشۈرۈش» repairs older books after a backup, each in its own transaction, only after the checks (`verifyFold`).
- **Search finds any part of a word** (`searchBooks` is the substring search — the owner's decision, 2026-10-23). The full-text index `book_fts` (rebuilt by migration step 5, filled after the window is up and resumable) is kept right on every write and serves the notebook's reference scan; a ranked word search on it is a separate decision.
- **The Qur'an keeps bookmarks** in `quran_bookmarks` (migration step 4, one per verse) and the last verse read in the setting `quran_last_aya`.

## Library data safety (3.5)
- **A book is deleted only by `db-delete-book`.** `save-library` and `syncBooks` never delete by omission: one failed read at startup left `books: []`, and the next save (a theme change, a page turn) would have wiped the library.
- **`load-library` reads its parts separately** and reports `loadErrors`. A part that failed to load in this session is never synced back; the renderer says so instead of saving over it.
- **Schema changes are additive, ordered `PRAGMA user_version` steps**, each in a transaction, with a backup to `JamiyKutupxana\backups\` before the first pending step of a run.
- **Backups live in `JamiyKutupxana\backups\`.** Nothing inside `JamiyKutupxana` is renamed or moved, ever.
- **A reading position is saved with the targeted progress IPC**, not by sending the whole library on every page turn. `saveData()` is for real state changes.
- **Risky testing uses `npm run dev`** (`JamiyKutupxana-DEV`); `npm test` uses a fresh temp directory. The real library is for a final check only.
- **Nothing new reaches the network:** the renderer CSP stays `connect-src 'self'`, `will-navigate` allows only the app's own `index.html`, and `setWindowOpenHandler` hands only parsed `http:`/`https:` URLs to `shell.openExternal`.
- **The network, exactly.** Only the main process goes online, each time because the owner asked, and only to: `generativelanguage.googleapis.com` (the AI, after the owner has entered a key — `ai.js`); `bilimhezinisi.com` and `jmnaqaeqolrtktvpbtci.supabase.co` (the website's catalog and its downloads, when the owner opens «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» — `web-library.js`); and the address the owner pastes into «تور بەت قوشۇش» (`fetch-url-html`). A new host is a change to `PRIVACY.md` and to this list first. Links the owner opens go to the system browser, not through the app.

## 3.6
Rules written by the 3.6 phases (work order: `prompts/3.6/PROMPT-3.6.md`, status: `prompts/3.6/PROGRESS.md`).

### Qur'an translation (Phase 1)
- **A verse marker is not translation text.** The bundled QuranEnc file ends each translation with «(4)»; `cleanUyghurTranslation()` (`scripts/seed-quran.js`) removes a parenthesised group only when it holds digits and separators alone (`0-9`, `٠-٩`, space, `-`, `–`, tatweel U+0640, `،`, `,`, ZWJ/ZWNJ) — never a letter, never a punctuation mark. Parentheses with words stay (58:4). A test proves it over all 6,236 verses.
- **Every verse knows its translation group.** `quran_ayas.ug_from` / `ug_to` (migration step 6), computed from the RAW bundled XML, never from the cleaned column: identical consecutive texts joined with the range in their marker. 186 groups share a translation: the 185 identical runs and 53:13–14 (its marker joins two different texts; the longer, 53:13's, is shown). A verse on its own is `ug_from = ug_to = aya`; a library whose step 6 did not run reads that way too.
- **`quran_fts` has no update trigger.** Anything that UPDATEs `quran_ayas` text rebuilds it (`INSERT INTO quran_fts(quran_fts) VALUES('rebuild')`), or FTS5 reports the index malformed.
- **A translation carries its label** wherever it goes — the mushaf, copy, insert into a note, Qur'an search, the notebook's source search: «… [7]», or «… [4 _ 6]» for a group, exactly `[` from ` _ ` to `]`, no isolation (`src/verse-label.js`, one copy). A group's translation is shown once, under its last verse; the earlier ones point to it. A run that is copied writes a group's translation once; one verse of a group carries the group's. Search lists a group once (`collapseQuranGroups` in database.js) with each found verse's Arabic.
- **The verse number is the Uthmani font's own medallion.** `UthmanicHafs1.otf` draws Arabic-Indic digits as its verse-end medallion through `liga`; its digits are 0.27 em tall, the medallion 0.89 em (measured). The number is set at 1.75 em of the verse text, so the digits are about 0.47 of it. Never turn `liga` off there: the digits fall to plain 0.27 em glyphs.

### PDF import (Phase 2)
- **Every page is read.** `src/pdf-text.js` (`PdfText.extract`) reads a text-layer PDF to its last page, with progress, for the single and the batch import alike — they used to stop at pages 100 and 200 while the dialog showed the whole count. 500 pages: about 0.5 s, the window never held more than about 20 ms (measured). OCR reads at most `PdfText.OCR_MAX_PAGES` (300) and says so: «300 / 512 بەت ئوقۇلدى», and a line in the description the owner can edit.
- **The joins do not change:** `'\n'` after every text-layer page; OCR pages joined with `'\n\n'`, the whole trimmed (`PdfText.joinPages`).
- **A page is a range in the STORED text.** `book_page_map(book_id, page_no, start, "end")` (migration step 7; `end` is a keyword, so quoted): page n is `[start, end)`; an empty page has an empty range at its place. The renderer sends ranges in the extracted text; `normalizeWithRanges` (`text-normalize.js`) maps them through the fold to letters, and a map that does not come out exactly is dropped, never stored half-true. The renderer sends them only while the staged text is still the one they were measured in (`stagePages`). Gemini OCR sends two pages per request and gets one text back, so its imports have no map.
- **A map fits only its text.** Writing a different whole text over a book (`saveBookContent` — the reader's page fix — or the letters repair) drops its map. The PDF page view (Phase 7) edits through its own path, which shifts the map with the edit.
- **The PDF is never copied.** Its path, size, time and SHA-256 are recorded at import in `books.original_*`, read by main from the chosen path, never taken from the renderer (`pdf-original.js`). `pdf-original-status` → `found` (same size and time, or same SHA-256) / `moved` (recorded, but not at its path) / `missing` (never recorded: books from before 3.6). `pdf-locate-original` takes the same file at once and any other only after the owner's yes in a native dialog.
- **The offline OCR engine reads its models as a read-only cache** (`ocr-engine.js`: `cachePath` = tessdata, `cacheMethod: 'readOnly'`). tesseract.js 5.1.1 calls its environment «electron», not «node», inside Electron, takes a local `langPath` for a web address and throws «Only absolute URLs are supported» outside any promise — `ocr-recognize` never answered (measured in Electron 28, `ocr-engine-answers`). A cache is read with a plain file read first, and `readOnly` never writes or deletes. Every requested model is checked before the engine starts (`missingModels`). Passing a model as `{ code, data }` fails in 5.1.1 too («initialization failed»).
- **A PDF page is drawn with `intent: 'print'`** (`PdfText.renderPage`). The default display intent waits for animation frames, and a window behind another one or minimized draws none (measured): OCR stood still whenever the owner looked at another window.

### Search with Uyghur suffixes (Phase 3)
- **The forms only add.** The exact query is always found as before, any part of a word included. «قوشۇمچىلىرى بىلەن» in the search bar (on by default, setting `search_forms`) adds the forms of each typed Uyghur word (`search-forms.js`, main), built on the spell engine's own dictionary and suffix lists — never a second copy. `db-search` and `db-get-all-snippets` look for forms only when asked (`opts.forms`), so the notebook's «مەنبە» search is exact, as it was.
- **The base:** the engine's ACCEPT-tier suffixes (and the possessives ى، سى، م، ڭ it cannot hold) come off longest first, up to three, to a dictionary word, the stem change undone (…ى → …ا/ە, …ىغ → …اق, …ىك → …ەك). A possessive outside ACCEPT comes off a dictionary word only when it undoes a stem change: «م» off «ئىمام» left «ئىما», and the search found «ئىمان». Arabic words and words under three letters get no forms.
- **The forms:** the base and its last ا/ە raised to ى (two syllables or more), with ق → غ and ك → گ after it.
- **A match** is a form at the START of a word followed by nothing or one to three known suffixes. After a raised stem every suffix must be a noun's — verbs raise too («ئاتا» found «ئاتىدى», «سۈرە» found «سۈرىتى»). A tail that begins with a word of its own (not an ACCEPT suffix) is a compound: «كىتابخانا» is not a form of «كىتاب». Several words: each by its forms, in order, separated only by spaces and punctuation.
- **Measured** over the library's own vocabulary (`spellcheck-data/frequencies.tsv`, 59,832 words), 22 common words: 725 words found as typed, 1,195 with the forms; an even sample of 30 added words all correct; in the three longest lists 5 of 162 doubtful (a name, homographs), about 3%. 500 books / 100 MB: today's search 1.97 s median; with the forms 2.06 s median, 2.32 s at most.
- **A text is lower-cased only when it has a cased letter** (`searchForms.lowered`): lower-casing 100 MB of Uyghur took 0.6 s for nothing.
- **The reader marks what the search found:** the words the forms found in that book (`db-search-words`, asked when the book opens) as whole words, and the query as typed anywhere — one expression (`ReaderPlaces.searchRe`) for the marks and for counting the matches before a place; a test proves it marks exactly the search's spans.

### One search: books, Qur'an, notebook (Phase 4)
- **Three sources, one request each, at once** (`db-search`, `quran-search`, `notes-search`, each with `{ forms }`); each section is drawn as its answer arrives, so a slow source never holds back the others, and a newer search makes an older answer stale (`S.srchSeq`). The history records the query once (`db-search`).
- **Sections in this order, with their counts:** «كىتابلار»، «قۇرئان كەرىم»، «خاتىرە دەپتىرىم». Every card carries its source as a small label. Chips «ھەممىسى · كىتابلار · قۇرئان كەرىم · خاتىرە دەپتىرىم»; «ھەممىسى» shows each section's first five and «يەنە كۆرسىتىش», which opens that chip; the books keep their pagination. The category filters the books only, and the page says so next to the chips.
- **The Qur'an:** the Arabic as before; with the forms, the translation also through the Uyghur forms (`quranFormRows`: the index names the candidates with `text_ug : (…)`, the matcher decides), one card per translation group with its «[n _ m]».
- **The notebook:** `notesSearch(q, opts)` with `opts` reads every note's title and text through the matcher — never the trash, pinned first, at most 50 — and gives `snip`, `mark`, `titleMark`, `words`. Without `opts` it is the notebook list's search, as it was.
- **Opening a result:** a book → the reader at the place (as before); a verse → the Qur'an at it, selected (`S.quran.selectAya`, the first verse too); a note → `notesOpen`, then `notesShowFound(query, words)`: the find bar, find only, with every word found painted by the find highlight — nothing written into the note. Another query in the box, or Ctrl+H, is the plain find bar. `setMode` returns the view's render promise for this.

### «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» (Phase 5)
- **Read what the website already publishes; change nothing there.** `web-library.js` (main) reads `categories` and the `published` `books` from the website's Supabase REST API (1,000 rows a request), calls the website's own gate `/api/books/<id>/download` before every download and update, then reads `book_pages` in batches of 100 and joins them with `'\n\n'`, as the website does. A `markdown` book becomes plain text through `MarkdownText.toPlain` (`src/markdown-text.js`) — the one converter, the same the `.md` import uses.
- **Only the public key is in the app.** `SUPABASE_ANON_KEY` is the anon key every visitor's browser receives; the website's row-level security decides what it reads. `checkPublicKey` refuses a `service_role` JWT or an `sb_secret_` key when the client is made. Nothing else of the web project's `.env.local` is ever read.
- **A polite client** (the site runs on free tiers): one download at a time; the catalog once a session (`webCatalogCache`; «يېڭىلاش» reads it again); 20 s timeouts; a network error or a 5xx retried twice (1.5 s, 4 s), a 4xx never; the gate's Uyghur `message` shown as it is; User-Agent `BilimHezinisi-Desktop/<version> (+https://bilimhezinisi.com)`. The renderer sends a book's id only; main takes the book from its own catalog.
- **A downloaded book knows where it came from:** `books.source`, `source_id`, `source_updated_at` (migration step 8). It is found by `(source, source_id)` first, then by its text's SHA-256, like every import. The catalog's `updatedAt` later than `source_updated_at` → «تور بېتىدە يېڭىلانغان — يېڭىلاش».
- **«توختىتىش» leaves nothing behind:** the book is written only after its last page has arrived.
- **An update replaces the text and keeps the places** (`replaceBookText`, one transaction): the new text (the page map dropped, as with any whole new text), bookmarks, in-book notes and the reading position clamped to its length, `source_updated_at` recorded. It is asked inline, never with `confirm()`. Afterwards the renderer reloads books, bookmarks and notes from the database: `syncBookmarks` and `syncNotes` rewrite every row from the renderer's state and would put the old places back.
- **The header button** reads «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» at 1300 px and wider, «تور بېتىدىن» from 1040 px, the icon alone below that; at 900 px nothing overflows (measured).

## Build / Release Workflow
Edit only in the source folder → `npm test` (the syntax gate — `node --check` over every `.js` and the inline scripts of `index.html` — plus the main-process and notebook suites; `npm run check-syntax` runs the gate alone) → test with `npm run dev` (`npm start` only for a final check on the real library) → bump `version` in `package.json` → `npm run fetch-ocr-models` on a networked machine (BEFORE dist, so models ship) → `npm run dist-win` → commit per change.

## Roadmap / Future Direction
- Desktop ↔ mobile feature parity from shared AI/parser logic.
- Deepen AI usefulness for classical Uyghur/Arabic texts; add usage/quota visibility; investigate an offline/local model option to restore fully-offline AI.
- More import formats (e.g. EPUB) and expanded OCR coverage.
- Optional sync of the library and notes (backup and restore shipped in 3.5).
- A ranked word search on the rebuilt FTS5 index, if the owner wants one beside the substring search.
- Left out of 3.5 on purpose: the Electron upgrade (K14, its own release), Markdown rendering and in-book links (K16/W22), notebook page typography (W15), quote image (W19), on-screen keyboard (W21), browse by author (W23).
