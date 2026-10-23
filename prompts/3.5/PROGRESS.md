# v3.5.0 — progress

Working document for the Claude Code sessions that execute
[`PROMPT-3.5.md`](PROMPT-3.5.md). Read it before answering any question about
what is done. Branch: `release/3.5` (cut from `main` at `42356e3`, v3.2.0).

Resume line for a new session:

```
Read prompts/3.5/PROMPT-3.5.md in full, then prompts/3.5/PROGRESS.md, and continue with the next unfinished phase.
```

## Phases

| Phase | What | Status | Commits | Tests |
|---|---|---|---|---|
| 0 | Groundwork: branch, `npm test`, CLAUDE.md rules | **done** | `1809615` docs: add the 3.5 audit and work order · `c51ac2f` test: an Electron test runner for the notebook and the database · `1589d4f` docs(claude): record the 3.5 notebook and data rules · docs(progress): this file | 12 added, 10 failing on purpose (see below) |
| 1 | Notebook: nothing written may be damaged or lost (owner's bugs 1–2, K1, K2, K3, K7) | **done** — waiting for the owner's check | `56f4548` fix(notes): show the messages that were thrown away (K7) · `f79fc17` fix(spellcheck): one text map, where a line end is a word boundary · `6a900fe` fix(notes): nothing typed may be lost (K3) · `7be9db0` fix(notes): replace each hit where it stands (K1) · `38fa3ba` fix(notes): the format painter paints, it does not rebuild · `a935fff` fix(notes): the reference scan paints its matches (K2) · docs(progress) ×2 | 20 green; `sanitize-keeps-markers` stayed red until Phase 2.3 |
| 2 | Library safety: K4, K6, K18 + backup/restore | **done** — waiting for the owner's check | `5aef0a4` fix(library): a book is deleted only when the writer deletes it (K4) · `1203572` feat(library): backup, restore and a migrations framework · `71cdcdf` fix(sanitize): the allow lists are the lists that are applied (K6) · `d7552b9` docs: correct the removeFormat measurement; repair CLAUDE.md · `9f91645` fix(window): the window stays in the app; only http(s) goes outside (K18) · `87de2d6` build: drop sql.js, which nothing uses (K18) · docs(progress) | 37 in all (with the syntax gate), every one green |
| 3 | Versions and document structure: W1, W4, W5, W14, K11 | **done** — waiting for the owner's check | `171cf60` feat(notes): keep earlier versions of a note - storage (W1) · `d7667bb` feat(notes): history, block style, outline, undo and redo (W1, W4, W5, W14, K11) · docs(progress) | 48 in all (with the syntax gate), every one green |
| 4 | Export: W6, K8 | **done** — waiting for the owner's check | `a0c2c90` test: keep the runner alive when a suite closes its only window · `2ec60da` feat(export): a note keeps its shape in Word, PDF, Markdown and text (W6, K8) · `5972048` feat(export): «چىقىرىش ▾» in the notebook - Word, PDF, Markdown, text (W6, K8) · docs(progress) | 55 in all (with the syntax gate), every one green |
| 5 | List, trash, spelling: W2, W3, W7–W10, K12, K13 | **done** — waiting for the owner's check | `828150e` feat(notes): the trash, pinning and content search - storage (W2, W3, K13) · `ce94748` feat(notes): the list sorts, pins, previews and searches; deleting can be undone (W2, W3, K13) · `4544b0d` feat(spellcheck): one error at a time, and words ignored in one note (W7, W9, W10) · `7bd1aef` feat(spellcheck): the personal dictionary can be seen, cleaned, moved (W8, K12) · docs(progress) | 75 in all (with the syntax gate), every one green |
| 6 | Citations, sources, AI that keeps formatting: W11–W13, K9 | **done** — waiting for the owner's check | `4733c8b` feat(notes): citations lead back to the book or the verse; links open a card (W11) · `1861260` feat(notes): search the library and the Qur'an from «مەنبە»; three-way verse choice (W12) · `dd7beb4` feat(ai): notebook proofreading by units, never sending quoted material, undoable (W13, K9) · `bd80d97` feat(ai): notebook OCR cleanup works on the selection, undoable; the whole-note rebuild is gone · docs(progress) | 98 in all (with the syntax gate), every one green |
| 7 | Reader, Qur'an, search: K5, K15, K17, W16–W18, W20 | **in progress** — the W18 repair tool waits for the owner's decision on the search index (see «Phase 7 — so far») | `725d820` feat(reader): bookmarks, notes and the reading position keep their paragraph (K5, W16) · `f9dc84b` feat(quran): bookmark verses; the last verse read is offered again (W17) · `8c50274` feat(import): books come in as letters, never as glyph codepoints (W18, K15) · `13dda38` feat(search): the search history can be cleared (W20, K17) · docs(progress) | 110 in all (with the syntax gate), every one green |
| 8 | Release 3.5.0 (no publishing) | not started | — | — |

## Phase 0 — what was built

`npm test` → `electron tests/run.js`. It runs on Electron 28 / Chromium 120,
the engine the app ships with, and does three things in order:

1. **the syntax gate** — `node --check` over every `.js`/`.mjs`/`.cjs` in the
   repo (minus `node_modules`, `dist`, `build`, `_to_delete`, `prompts`) and
   over the inline `<script>` blocks of `src/index.html`, padded so node's line
   numbers match the HTML's. `npm run check-syntax` runs the gate alone, under
   plain Node;
2. **the main-process suites** (`tests/main/*.js`) against a fresh
   `%TEMP%\bilim-test-*` directory — never `JamiyKutupxana`, never the DEV one;
3. **the notebook suites** (`tests/notebook/suite-*.js`) in a hidden
   `BrowserWindow` that loads the REAL `src/sanitize.js`, `src/spellcheck.js`,
   `src/notes.js`, `src/notes.css` and `assets/vendor/purify.min.js`, with
   `tests/notebook/stubs.js` standing in for what `index.html` provides
   (`icon`, `toast`, `S`, `window.electron`, `NGram`) and an in-memory note
   store that can be told to refuse a write.

Editing is driven the way the UI drives it: `insertText` / `insertParagraph`
(Enter) / `insertLineBreak` (Shift+Enter), Range selections, and real
`mousedown` / `mouseup` / `keydown` events with coordinates — the spellchecker
hit-tests the pointer position with `caretRangeFromPoint`, so an event without
usable coordinates would find nothing. Assertions are on the DOM and on what
was saved.

Files: `tests/run.js`, `tests/lib/{tiny,syntax}.js`, `tests/main/*.js`,
`tests/notebook/{harness.html,stubs.js,framework.js,suite-*.js}`.
`tests/` is outside `build.files`, so it is never packaged (checked).

### The ten ported cases all fail on `42356e3` — as they must

Verbatim from the first run (`npm test`, 9.5 s, exit 1):

```
— syntax —
PASS syntax
— main process —   (C:\Users\Y\AppData\Local\Temp\bilim-test-XkREB2)
PASS db-temp-dir
FAIL toasts — showToast() does not exist in this app, so these messages are never shown: src/notes.js:518, src/notes.js:530, src/notes.js:561, src/notes.js:570, src/notes.js:1098, src/notes.js:1127, src/notes.js:1156, src/notes.js:1161, src/notes.js:1167, src/notes.js:1168, src/notes.js:1215, src/notes.js:1216, src/notes.js:1565, src/quran.js:367, src/quran.js:496, src/quran.js:501, src/quran.js:502, src/quran.js:613, src/quran.js:614 — expected 0, got 19
— notebook —
FAIL spell-enter — the two paragraphs were glued into one word before the engine saw them — "مەنىڭچۈشەنمىگەن" found in "ياخشى ئۇسۇللارنى ماڭا تەۋسىيە قىلغىن مەنىڭچۈشەنمىگەن ئىككىلىنىپ قالغان"
FAIL spell-shift-enter — the line break was dropped, gluing the last and first words — "قۇرئىككىنچى" found in "بىرىنچى قۇرئىككىنچى قۇر"
FAIL spell-correction-scope — exactly one word should be underlined — expected 1, got 2
FAIL painter-blocks — painting merged paragraphs instead of formatting them — expected ["P","P","P","P"], got ["P","P"]
FAIL replace-all-structure — the search wrote <mark> elements into the note instead of painting them — expected 0, got 3
FAIL refscan-caret — the scan moved the caret, so the next word landed in the wrong place — expected "بۇ بىر ئابزاس ھەققىدە يېزىلغان جۈملەXYZ", got "XYZبۇ بىر ئابزاس ھەققىدە يېزىلغان جۈملە"
FAIL leave-and-return — the writing was not on screen after leaving the notebook and returning — " يېڭى يېزىلغان مۇھىم جۈملە" not in "كونا مەزمۇن"
FAIL failed-save-switch — the writer was moved to another note although the save had failed — expected 1, got 2
FAIL sanitize-keeps-markers — the inserted-reference marker was stripped, so quoted text cannot be recognised — "data-ref-insert" not in "<blockquote class=\"notes-inserted-ref\" dir=\"rtl\">نەقىل تېكىستى</blockquote>"

10 failed
```

Notes on two of them:

- `spell-correction-scope` reports **2** marks where the fixture has exactly one
  misspelling. The second is «ئاخىرىكېيىنكى» — the end of one paragraph glued to
  the start of the next. The same defect, seen from the other side.
- `spell-correction-scope` also feeds the renderer a mark whose offsets reach
  across a paragraph break (`FAKE.forceMarks`). That is a deliberate lie by the
  stand-in engine, and it is the case the renderer must survive: a mark whose
  range does not hold exactly that word any more must change nothing. Refusing
  to paint such a mark at all is just as correct — the assertion is that the
  note comes out byte-identical.

### Preflight notes

- `package-lock.json` arrived modified: only its own `version` field
  (`2.9.1` → `3.1.0`), no resolved package version changed, so it was restored
  with `git checkout --` as the work order says.
- Four untracked files in `prompts/` from earlier releases
  (`PARTNER-CENTER-3.2.0.md`, `PROMPT-17D-desktop-ai-models.md`,
  `PROMPT-SPELLCHECK-MORPHOLOGY.md`, `TARQITISH-TEKISTLIRI.md`) were left
  alone, as instructed.

## Phase 1 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| 1.1 | `src/textmap.js` (ported from web `lib/spellcheck/marks.ts`): one offset map with a `"\n"` at every block edge and `<br>`, shared by spellcheck, find and the reference scan. Quoted material stays in the map and is blanked for the engine (`maskSpans`). A correction goes through `wordRange()` on a fresh map. «لۇغەتكە قوشۇش» asks the main process (`spell-validate-word`) whether it is one word. | `spell-enter`, `spell-shift-enter`, `spell-correction-scope` |
| 1.2 | The painter captures only what is SET (walk up to the editor root, never the theme's ink), splits the selection around `QUOTED_SELECTOR`, and paints each part with `removeFormat` + the editing commands. Alignment through `justify*` per whole block; margins no longer copied; one input pass per paint. | `painter-blocks`; new: `painter-skips-quoted`, `engine-removeformat`, `engine-font-sizes` |
| 1.3 | Hits painted (`bh-find-hit`, `bh-find-current`); each replaced over its own live Range, last first; «ھەممىنى يېنىۋېلىش» after a replace-all. | `replace-all-structure`; new: `replace-all-undo` |
| 1.4 | Matches painted (`bh-ref-match`); clicks and hovers hit-tested through `TextMap.pointAt`; the scan reads the masked map and never paints inside quoted material. | `refscan-caret`, new `refscan-skips-quoted`; guards: `refscan-click`, `legacy-markup-unwrapped` |
| 1.5 | `putDocument()` is the one writer of the editor's `innerHTML` (the AI's rebuild goes through it too); `notesFlush()`; `setMode` flushes before replacing `#main`; open/create/delete/go-to stop on a failed flush; retry 5 s / 15 s / 45 s / 60 s; the close handshake (`notes-dirty`, `app-flush-request`, `app-flush-done`, native dialog); `beforeunload` uses the clean snapshot. | `leave-and-return`, `failed-save-switch`; new: `close-waits-for-save`, `one-document-writer` |
| 1.6 | 19 `showToast` calls → `toast`. | `toasts` |

Still red, on purpose: **`sanitize-keeps-markers`** is the K6 test and its fix
is Phase 2.3 (the sanitizer passes `USE_PROFILES`, so its allow lists are
ignored). It was one of the ten ported in Phase 0; it is not weakened or
skipped. The notebook does not depend on it any more: `QUOTED_SELECTOR`
recognises an inserted passage by its class.

Not covered by an automated test, to check by hand (the owner's list): the
native «ساقلانمىغان خاتىرە بار» dialog on close (the renderer half is
tested, the main-process half needs a real window), and the help cursor over
a reference match.

### Phase 1 checklist for the owner (`npm run dev`)

1. ئىملا تەكشۈرۈشنى ئېچىڭ. بىر خاتا سۆز يېزىپ Enter نى بېسىڭ، كېيىنكى ئابزاسقا توغرا سۆز يېزىڭ → پەقەت خاتا سۆزنىڭ ئاستىغىلا سىزىق چىقىدۇ. تەكلىپنى تاللىسىڭىز، پەقەت شۇ سۆز ئالمىشىدۇ، كېيىنكى ئابزاس ئۆزگەرمەيدۇ.
2. Shift+Enter بىلەن ئوخشاش سىناڭ → نەتىجە ئوخشاش.
3. بىر ئابزاسنى چوڭ خەت ۋە باشقا فونت قىلىڭ. سۈپۈرگە بىلەن ئۈچ ئابزاسقا سۈرۈڭ → ئۈچ ئابزاس ئۈچ ئابزاس پېتى قالىدۇ، فونت ۋە چوڭلۇق ئۆتىدۇ.
4. خاتىرىنى نەقىل بىلەن باشلاڭ، Ctrl+H بىلەن بىر سۆزنى «ھەممىنى ئالماشتۇرۇش» قىلىڭ → پەقەت سۆزلەر ئالمىشىدۇ، خاتىرە نەقىلنىڭ ئىچىگە كىرمەيدۇ. «ھەممىنى يېنىۋېلىش» نى بېسىڭ → ئەسلىگە قايتىدۇ.
5. كىتاب ئامبىرىدىكى بىر كىتابتىن جۈملە يېزىڭ، توختىماي داۋاملاشتۇرۇڭ → نۇر بەلگە يازغان يېرىڭىزدە قالىدۇ. سېرىق سىزىقلىق سۆزنى بېسىڭ → «مەنبە» بەتكۈچى ئېچىلىدۇ.
6. يېزىپلا Ctrl+2، ئاندىن دەرھال Ctrl+3 → يازغانلىرىڭىز جايىدا.
7. يېزىپلا كۆزنەكنى تاقاڭ، قايتا ئېچىڭ → يازغانلىرىڭىز جايىدا.

## Phase 2 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| 2.1 | `syncBooks()` only upserts. `load-library` / `save-library` live in `library-sync.js`: each part read on its own (`loadErrors`), a part that never loaded this session is never written back (main and renderer both — `S.loadedParts`), an empty book list is refused while books exist. `delBook()` calls `db-delete-book` first. Page turns and closing the reader save the position through `db-save-progress`. The batch-import reload takes only what loaded. A red banner if the book list did not load; no welcome screen over it. | `sync-never-deletes` (red: `syncBooks()` deleted the book), `empty-book-list-refused`, `failed-part-not-synced`, `renderer-library-writes`; guard: `delete-book-cascade` |
| 2.2 | `backup.js` + `database.backupTo()` (SQLite online backup, written to `.tmp` and renamed). Weekly `auto-<date>.db`, newest 3 kept. Settings: «ھازىر زاپاسلاش», «زاپاس قىسقۇچىنى ئېچىش», «زاپاستىن ئەسلىگە كەلتۈرۈش», folder size. Restore: check → native confirm → `library-before-restore-<time>.db` → checkpoint, close, replace, drop `-wal`/`-shm` → relaunch. `MIGRATIONS` + `runMigrations()` on `PRAGMA user_version`, backup `library-before-<version>.db` before the first pending step; empty list for now. | `backup-copy`, `restore-validation`, `migrations-backup-first`, `auto-backup-rotation`, `restore-replaces-file` |
| 2.3 | No `USE_PROFILES`. Tables, `strike`, `del`, `ins`, `small` added; no `img`. `style` filtered per declaration in an `uponSanitizeAttribute` hook that exists only during the notebook's own call; `text-indent`, `list-style-type` added; no `url()`, `image-set()`, `expression()`, `javascript:`, `@import`, escapes. | `sanitize-keeps-markers`, `sanitize-tables-urls-styles`; guard: `sanitize-keeps-editor-output` (every toolbar command survives) |
| 2.4 | `navigation.js`: new windows → system browser only for parsed http(s); `will-navigate` allows only `src/index.html`. `export-as-pdf` destroys its hidden window in `finally`. `sql.js` uninstalled (`--ignore-scripts`), lockfile committed on its own. | `external-links-http-only`, `navigation-app-page-only`, `window-hardening-wired`, `no-unused-sqljs` |

Checked by hand in `npm run dev`: the app starts with no main-process error,
writes `JamiyKutupxana-DEV\backups\auto-2026-10-22.db` (6.6 MB) on the first
start and none on the second (the weekly rule). Not checked by hand: the
settings section, restore, and the Tanzil link — the owner's checklist below.

Findings on the way:

- **A wrong measurement from Phase 1, corrected.** `removeFormat` keeps
  `data-*` attributes. Phase 1 recorded the opposite because the old
  sanitizer had already stripped `data-ref-insert` when the fixture opened.
  `engine-removeformat` now checks the attribute is present first. The
  painter still skips quoted material, for the reason rule 6 gives.
- **`PRAGMA integrity_check` cannot run on this app's libraries as a whole**
  ("SQL logic error", SQLite 3.49.2): it also checks FTS5, and `book_fts`
  declares `content_rowid` without an external content table. The restore
  check runs it table by table. Changing `book_fts` would be a schema
  migration and is not part of this release.
- **A formatting bug of mine in CLAUDE.md**, from `1c9425c`: the measurements
  section was one comma-joined line and swallowed the next heading. Repaired
  in `d7552b9`.
- `npm uninstall` filled 23 packages into `node_modules` that the lockfile
  already listed but the folder lacked. The lockfile did not change for them.

### Phase 2 checklist for the owner (`npm run dev`)

1. «تەڭشەكلەر» نى ئېچىڭ → ئاستىدا «زاپاسلاش ۋە ئەسلىگە كەلتۈرۈش» بۆلىكى بار، زاپاس قىسقۇچىنىڭ ھۆججەت سانى ۋە چوڭلۇقى كۆرۈنىدۇ.
2. «ھازىر زاپاسلاش» نى بېسىڭ، ساقلاڭ → «زاپاس ساقلاندى» دېگەن ئۇچۇر چىقىدۇ. «زاپاس قىسقۇچىنى ئېچىش» نى بېسىڭ → ھۆججەت شۇ يەردە.
3. سىناق كۇتۇپخانىسىدا بىر كىتابنى ئۆچۈرۈڭ → شۇ كىتابلا يوقايدۇ، قالغانلىرى جايىدا. دېتالنى تاقاپ قايتا ئېچىڭ → ئۆچۈرۈلگەن كىتاب قايتىپ كەلمەيدۇ، قالغانلىرى يەنىلا جايىدا.
4. «زاپاستىن ئەسلىگە كەلتۈرۈش» نى بېسىپ 2-قەدەمدىكى زاپاسنى تاللاڭ → سوئال كۆزنىكى كىتاب سانىنى كۆرسىتىدۇ؛ «ئەسلىگە كەلتۈرۈش» نى بېسىڭ → دېتال قايتا قوزغىلىدۇ، ئۆچۈرگەن كىتابىڭىز قايتىپ كېلىدۇ.
5. «زاپاستىن ئەسلىگە كەلتۈرۈش» تە .db بولمىغان ياكى باشقا ھۆججەتنى تاللاڭ → «بۇ ھۆججەت بىلىم خەزىنىسىنىڭ ساندانى ئەمەس» دېگەن ئۇچۇر چىقىدۇ، ھېچنېمە ئۆزگەرمەيدۇ.
6. قۇرئاندا بىر سۈرە ئېچىپ، ئاستىدىكى «Tanzil Project» ئۇلىنىشىنى بېسىڭ → توركۆرگۈچتە ئېچىلىدۇ.
7. بىر كىتابنى ئوقۇپ بىرنەچچە بەت ۋاراقلاڭ، تاقاپ قايتا ئېچىڭ → ئوقۇغان يېرىڭىزدىن داۋاملىشىدۇ.

## Phase 3 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| 3.1 | Migration step 1: `note_versions` (cascade on note delete, AUTOINCREMENT id). `noteVersionKeep/List/Get` in `database.js` with the web's rules — no duplicate of the newest, `before-*` relabels an identical `open`/`auto`, `auto` at most every 5 min, 30 per note (oldest `auto` first, never the newest). Kept before replace-all, a paint over more than one paragraph, AI apply, restore; on open; after a confirmed save. «نەشر تارىخى» button → list → sanitized read-only preview → «بۇ نۇسخىنى ئەسلىگە قايتۇرۇش». | main: `versions-migration`, `versions-dedupe-relabel`, `versions-auto-every-5-min`, `versions-eviction`, `versions-list-get-cascade`; notebook: `versions-kept-at-the-right-moments`, `versions-before-paint`, `versions-restore` |
| 3.2 | One menu — «ئادەتتىكى تېكىست» / «چوڭ ماۋزۇ» (h2) / «كىچىك ماۋزۇ» (h3) / «نەقىل» — instead of the quote button; shows where the caret is. | `block-style-transitions` (every transition, one undo step each, redo) |
| 3.3 | «مۇندەرىجە»: h1–h4, empty left out, indented from the highest, re-read 300 ms after a change; click scrolls to just below the toolbar, caret at the start. | `outline` |
| 3.4 | «يېنىۋېلىش» / «قايتىلاش» on the toolbar. The limitation (line height and indent are outside the undo history) was already in CLAUDE.md. | `undo-redo-buttons` |

**One deliberate difference from the work order:** a heading or a quote turned
back into normal text becomes a `<p>`, not the web edition's `<div>`. The web
chose `div` because that is what Enter makes in its editor; in this one Enter
makes `<p>`, and `.notes-editor p` carries the paragraph spacing — a `div`
would sit flush against the next paragraph. The measured behaviour is the same
for both tags (one undo step, the quote's lines kept).

Checked by hand in `npm run dev`: on the first start the DEV library was backed
up to `backups\library-before-3.2.0.db` and then migrated to schema 1 —
`[migration] 1 note_versions applied`. On the owner's real library the same
happens on the first start of 3.5.0, as `library-before-3.5.0.db`. Not checked
by hand: the panes and the menu — the owner's checklist below.

### Phase 3 checklist for the owner (`npm run dev`)

1. بىر ئابزاستا تۇرۇپ، قورال بالدىقىدىكى «ئادەتتىكى تېكىست» تىزىملىكىدىن «چوڭ ماۋزۇ» نى تاللاڭ ← ئابزاس ماۋزۇغا ئايلىنىدۇ. «ئادەتتىكى تېكىست» نى تاللىسىڭىز ← قايتىدىن ئادەتتىكى ئابزاس بولىدۇ. ھەر بىرىدىن كېيىن Ctrl+Z بىر قېتىم باسسىڭىز، ئالدىنقى ھالىتىگە قايتىدۇ.
2. بىر ئابزاسنى «نەقىل» قىلىڭ، ئاندىن «ئادەتتىكى تېكىست» قىلىڭ ← نەقىل يوقىلىپ ئادەتتىكى ئابزاس بولىدۇ (بۇرۇن قايتۇرغىلى بولمايتتى).
3. نۇر بەلگىنى ماۋزۇغا، نەقىلگە، ئادەتتىكى ئابزاسقا قويۇڭ ← تىزىملىك ھەر قېتىم نۇر بەلگە تۇرغان يەرنى كۆرسىتىدۇ.
4. ئۇزۇن بىر خاتىرىگە ئۈچ-تۆت ماۋزۇ قوشۇپ، يۇقىرىدىكى «مۇندەرىجە» نى بېسىڭ ← ماۋزۇلار تىزىلىدۇ. بىرىنى بېسىڭ ← شۇ ماۋزۇ قورال بالدىقىنىڭ ئاستىغا كېلىدۇ.
5. بىر سۆزنى «ھەممىنى ئالماشتۇرۇش» قىلىڭ، ئاندىن «نەشر تارىخى» نى بېسىڭ ← «ئالماشتۇرۇشتىن بۇرۇن» دېگەن نۇسخا بار. ئۇنى بېسىپ قاراڭ، «بۇ نۇسخىنى ئەسلىگە قايتۇرۇش» نى بېسىڭ ← خاتىرە ئالماشتۇرۇشتىن بۇرۇنقى ھالىتىگە قايتىدۇ، تىزىملىككە «ئەسلىگە قايتۇرۇشتىن بۇرۇن» قوشۇلىدۇ.
6. قورال بالدىقىنىڭ ئەڭ بېشىدىكى يېنىۋېلىش / قايتىلاش كۇنۇپكىلىرىنى سىناڭ ← Ctrl+Z / Ctrl+Y بىلەن ئوخشاش ئىشلەيدۇ.

## Phase 4 — done

| Part | What | Tests |
|---|---|---|
| Model | `src/notes-export.js` (renderer): the note → plain document model, the walk of the web's `lib/notes/export-docx.ts` turned into data — blocks at any depth, `<br>`, empty lines, list depth and one id per `<ol>`, tables with spans, runs with only what is on, paragraph alignment / line height / first-line indent, citations → footnotes on request, the Qur'an credit when a verse is quoted. Also Markdown (vendored turndown, `[^n]`) and text (CRLF, blank line between paragraphs). | `export-model-structure`, `export-model-footnotes`, `export-text-and-markdown` |
| Word | `note-export.js` (main) with the existing `docx@8.5`: bidi paragraphs and runs, logical alignment (right/start → `left`, left/end → `right`), complex-script fonts and sizes, the notebook's face/size/line height as defaults, numbering per list, RTL tables, footnotes, the credit at the end. | `docx-writer` — the file unzipped with docx's own `jszip` and its XML read |
| PDF | `renderPdf()`: temp HTML with the app's `@font-face` rules (file URLs), CSP `default-src 'none'`, waits for `document.fonts.ready`, A4, window destroyed in `finally`. | `pdf-writer` — both faces really embedded |
| Credit | The export's credit lines must equal the sura footer's text. | `export-credit-matches-footer` |
| UI | «چىقىرىش ▾» replaces «Word»: four formats + «مەنبەلەرنى ئاستى ئىزاھات قىلىش» (setting `notes_export_footnotes`, off). One IPC `export-note`; text gets a BOM. The library's book export (`export-as-docx` / `export-as-pdf`) is untouched. | `export-menu` |

Findings on the way:

- **The bundled Uthmani font is named «KFGQPC HafsEx1 Uthmanic Script»** inside
  its file (read from the name tables of every bundled font). The work order
  quoted the web edition's «KFGQPC Uthmanic Script HAFS» — that is the name in
  the web edition's own, different file. Word finds a face by the name inside
  the file, so the desktop writes its own. The UKIJ files carry the names the
  app already uses.
- **A PDF was printed and looked at**, not only tested: Uyghur shaped, bold /
  italic / colour, the quote's bar, the list, the verse in the Uthmani face, an
  RTL table, the credit. That look caught an `@page { margin: 0 }` that
  overrode `printToPDF`'s margins — text ran to the edge of the paper. Fixed
  before the commit.
- **The test runner quit itself** when the PDF test closed its hidden window:
  that window was the runner's only one, and Electron's default answer to
  `window-all-closed` is to quit, so the next page load failed with
  `ERR_FAILED`. The runner now handles the event (`a0c2c90`). The app is not
  affected — its main window is open whenever an export window closes.
- Not checked here: how Word itself lays the file out. The XML is what Word
  and LibreOffice read as described, and the owner's checklist below opens
  it in Word.

### Phase 4 checklist for the owner (`npm run dev`)

سىناق ئۈچۈن بىر خاتىرە تەييارلاڭ: بىر «چوڭ ماۋزۇ»، بىر ئابزاس (ئىچىدە **توم** سۆز ۋە باشقا رەڭلىك سۆز)، بىر «نەقىل»، ئىككى قۇرلۇق بىر نومۇرلۇق تىزىملىك، «قۇرئان» تاختىسىدىن قىستۇرۇلغان بىر ئايەت ۋە «مەنبە» تاختىسىدىن قىستۇرۇلغان بىر كىتاب نەقلى.

1. ماۋزۇ بالدىقىدىكى «چىقىرىش ▾» نى بېسىڭ ← Word، PDF، Markdown، تېكىست ۋە «مەنبەلەرنى ئاستى ئىزاھات قىلىش» كۆرۈنىدۇ.
2. «Word (.docx)» نى تاللاپ ساقلاڭ، Word تا ئېچىڭ ← ئوڭدىن سولغا، ماۋزۇ ماۋزۇ پېتى، توم ۋە رەڭ جايىدا، تىزىملىك 1، 2 دەپ نومۇرلانغان، ئايەت ئوسمانى خەتتە (ئەگەر ئۇ خەت كومپيۇتېرىڭىزغا قاچىلانغان بولسا)، ئەڭ ئاخىرىدا قۇرئان مەنبەسى بار.
3. «PDF» نى تاللاپ ساقلاڭ، ئېچىڭ ← ئۇيغۇرچە خەت توغرا ئۇلىنىدۇ، ئايەت ئوسمانى خەتتە، قەغەزنىڭ چېتىدە بوشلۇق بار.
4. «مەنبەلەرنى ئاستى ئىزاھات قىلىش» نى بەلگىلەپ، قايتا Word قا چىقىرىڭ ← كىتاب نەقلىنىڭ ئاستىدىكى «— كىتاب نامى» قۇرى بەتنىڭ ئاستىغا ئىزاھات بولۇپ چۈشىدۇ.
5. «تېكىست (.txt)» نى چىقىرىپ Notepad تا ئېچىڭ ← ئۇيغۇرچە بۇزۇلماي كۆرۈنىدۇ، ئابزاسلار ئارىسىدا بوش قۇر بار.
6. Word ۋە PDF نىڭ رەسىمىنى ئەۋەتىڭ.

## Phase 5 — done

| Item | What changed | Tests |
|---|---|---|
| Trash (W2) | Migration step 2: `deleted_at`, `pinned`. Delete → trash at once, no question, toast «قايتۇرۇش» for 10 s (`toast(msg, type, { action, ms })`). «ئەخلەت ساندۇقى» at the bottom of the list: restore, delete for ever and empty — both with an inline second click. Delete-for-ever refuses a note not in the trash; the purge at startup takes what is older than 30 days; versions and ignored words go with a note. A trashed note opens read-only (main refuses to write it, too). Nothing of this touches `updated_at`. | main: `notes-trash-restore`, `notes-delete-forever-only-from-trash`, `notes-purge-30-days`; notebook: `list-trash-and-undo`, `list-trash-panel`, `list-trashed-opens-read-only` |
| List (W3, K13) | Sort «يېڭىلانغان ۋاقىت / ماۋزۇ / ياسالغان ۋاقىت», remembered; Uyghur title order via the web's `uyghurSortKey` (Chromium has no `ug` collation); pin; a one-line preview from SQL; search in titles AND text in main (literal, case-insensitive, 2–100, ≤ 50, pinned first); an untouched «يېڭى خاتىرە» is removed when the writer leaves it (main checks it again). | main: `notes-search-content`, `notes-preview-and-discard`; notebook: `list-sort-pin-preview`, `list-search-content`, `list-discard-untouched` |
| Step through (W7) | «▲ ئالدىنقى» / «▼ كېيىنكى خاتالىق» beside the switch, F7 / Shift+F7: from the caret, wrapping, scrolled into view, suggestions open; «ئىملا خاتالىقى قالمىدى» when none. | `spell-step-through`, `spell-step-none-left` |
| Dictionary (W8, K12) | «لۇغەت» panel: filter, delete, export / import `bilim-hezinisi-lughet.json` (JSON array, the web's format); import is untrusted — read and checked in main, one word by the checker's own tokenizer, 2–64, ≤ 5,000, counts reported, words shown via `textContent`; glued-looking entries marked «چاپلاشقان بولۇشى مۇمكىن» (port of `looksGlued`), never removed. | main: `personal-word-rules`, `personal-import`, `personal-export`, `glued-hints`; notebook: `dictionary-panel` |
| Ignore in note (W9) | «بۇ خاتىرىدە سەل قارا» in the popup, stored as `spell_ignore_note_<id>` (≤ 500), gone with the note. | `spell-ignore-in-note` |
| Quoted (W10) | No change needed — confirmed. | `spell-skips-quoted` |

Checked by hand in `npm run dev`: migration step 2 ran on the DEV library
after its backup — `library-before-3.2.0.db` already existed from step 1, so
the new one was named with the time (`library-before-3.2.0-<time>.db`), as
designed. No main-process or renderer error at startup.

One thing to know: the web edition gives «بىر-بىرلەپ كۆرۈش» no keyboard
shortcut because F7 is caret browsing in Chrome and Firefox. Electron has no
such binding, so the work order's F7 is used here.

### Phase 5 checklist for the owner (`npm run dev`)

1. بىر خاتىرىنى ئۆچۈرۈڭ ← ھېچنېمە سورىمايدۇ، ئاستىدا «قايتۇرۇش» كۇنۇپكىسى بار ئۇچۇر چىقىدۇ. 10 سېكۇنت ئىچىدە بېسىڭ ← خاتىرە قايتىدۇ.
2. يەنە ئۆچۈرۈڭ، تىزىملىكنىڭ ئاستىدىكى «ئەخلەت ساندۇقى» نى ئېچىڭ ← خاتىرە شۇ يەردە. ئۇنى بېسىڭ ← ئوقۇشقىلا بولىدۇ. «قايتۇرۇش» نى بېسىڭ ← قايتىدۇ. «مەڭگۈلۈك ئۆچۈرۈش» بىر قېتىم بېسىلسا سورايدۇ، ئىككىنچى قېتىمدا ئۆچىدۇ.
3. بىر خاتىرىدىكى يۇلتۇز بەلگىسىنى بېسىپ مىقلاڭ ← تىزىملىكنىڭ بېشىغا چىقىدۇ. «ماۋزۇ» بويىچە تىزىڭ ← ئېلىپبە تەرتىپى توغرا (ئ بىلەن باشلانغانلار ئالدىدا).
4. پەقەت بىر خاتىرىنىڭ ئىچىدە بار سۆزنى ئىزدەڭ ← شۇ خاتىرە تېپىلىدۇ.
5. «يېڭى خاتىرە» نى بېسىپ، ھېچنېمە يازماي باشقا خاتىرىگە ئۆتۈڭ ← بوش «يېڭى خاتىرە» تىزىملىكتە قالمايدۇ.
6. ئىملا تەكشۈرۈشنى ئېچىپ F7 نى قايتا-قايتا بېسىڭ ← خاتالىقلار بىر-بىرلەپ ئېچىلىدۇ. Shift+F7 كەينىگە ماڭىدۇ.
7. بىر خاتا سۆزدە «بۇ خاتىرىدە سەل قارا» نى بېسىڭ ← بۇ خاتىرىدە سىزىق يوقايدۇ، باشقا خاتىرىدە قالىدۇ.
8. «لۇغەت» نى ئېچىڭ ← قوشقان سۆزلىرىڭىز كۆرۈنىدۇ. «چاپلاشقان بولۇشى مۇمكىن» دېگەن سۆز بولسا، تەكشۈرۈپ خاتا بولسا ئۆچۈرۈڭ. «چىقىرىش» بىلەن لۇغەتنى ساقلاپ قويۇڭ.

## Phase 6 — done

| Item | What changed | Tests |
|---|---|---|
| Citations (W11) | An inserted passage ends with `<a class="bh-cite" href="bh://book/<id>?o=<pos>&q=<word>">— title</a>`. `pos` is the snippet's character offset into the book's content, confirmed in `database.js` (`getAllSnippetsForBook`, `searchBooks`), and the reader's `updateMatchNav` picks the occurrence that starts there. A verse ends with `bh://quran/<sura>/<aya>`. The sanitizer keeps `bh:` only on `a.bh-cite`, and only in those two shapes. A Qur'an passage from the n-gram index (books -1 / -2) cites its verse. | `cite-insert-passage`, `cite-insert-verse`, `cite-sanitizer-bh-only-on-cite`, `cite-describe` |
| The link card (W11) | A click on any link shows a card under the link: what it says, where it goes («كىتاب: «ماۋزۇ»», «قۇرئان: 2:255», the host), «ئېچىش», «ئۇلىنىشنى ئېلىۋېتىش». The second button appears only in an editable note; it is one `unlink`, so it can be undone. The card follows scrolling and closes on Escape, an outside click, an edit or the link scrolling away. Ctrl+click opens at once. «ئېچىش» saves the note, then opens the reader at the occurrence or the Qur'an at the verse. An http(s) address goes through `window.open`, then main's `setWindowOpenHandler`, then `navigation.externalUrl`. A missing book gets a toast. Every click on a link is `preventDefault`ed, a trashed note's too. | `cite-card-open-book`, `cite-open-missing-book`, `cite-ctrl-click-opens`, `cite-card-unlink`, `cite-card-external-blocked-and-closing`, `cite-card-read-only`, `cite-card-follows-scroll` |
| Source search (W12) | A search box at the top of «مەنبە»; the automatic references stay below. The library goes through `db-search`, which now takes `{ history: false }` so the notebook stays out of the reader's search history, then through each book's own places (`db-get-all-snippets`). The Qur'an goes through `quran-search`. A book shows three places, then «يەنە N ئورۇن». Words found but not side by side fall back to the FTS snippet, citing the book alone. Book text is escaped before its marks are made real. | `source-search-library-and-quran`, `source-search-fallback-and-messages` |
| Verse choice (W12) | «ئەرەبچە / تەرجىمىسى / ئىككىلىسى» replaces the checkbox, remembered as `notes_aya_mode`. The preview shows what will be inserted, and in «تەرجىمىسى» mode copy takes the translation with the verse number. The translation span carries `data-ref-insert="1"`: it is quoted material. The marker sits on the span, not the paragraph, because Enter copies a paragraph's attributes into the next one. | `source-aya-mode-remembered`, `cite-insert-verse` |
| AI proofreading (W13, K9) | `src/note-units.js` ports the web's `note-blocks.ts` and `proofread.ts` over the text map.<br>• Units are blocks and lines are map lines. Quoted units are never sent, and the number left out is shown.<br>• ⟦N⟧ batches are accepted only with the same numbers in the same order.<br>• Only the changed part of a line is written, through a Range and `insertText`: one undo step each.<br>• A line edited meanwhile is skipped, both ends of it included.<br>• The preview lists only the changes, each with a box to untick. «بۇ ئابزاستىكى فورمات ئاددىيلىشىدۇ» marks a change that runs across formatting, which is more precise than flagging every formatted paragraph.<br>• `notesBeforeAi()` keeps the before-ai version. «يېنىۋېلىش», in the tab and in the toast, restores it through `putDocument`, after a before-restore version.<br>• `naiSetEditorBlocks` and its `confirm()` are gone. | `ai-units-skip-quoted-and-write-back-changes`, `ai-units-protocol`, `ai-units-flattening-flag`, `ai-units-stale-line-and-undo`, `ai-undo-restores-the-note`; main: `ai-keeps-the-note`, `no-new-confirm` |
| OCR cleanup in the notebook | It works on the selection, or on the whole note only when the note has no quoted material, headings, lists, tables or quotations. Otherwise the toast says «OCR تېكىستىنى تاللاپ ئاندىن تۈزىتىڭ». A selection that takes in a verse, a quoted passage or a link is refused. One paragraph per block, its `<br>` lines rejoined. The answer goes back as one `insertText`, after a before-ai version, with «يېنىۋېلىش» too. If the text changed meanwhile, nothing is written. | `ocr-scope-selection`, `ocr-scope-refusals` |

Checked in `npm run dev` over the DevTools protocol, nothing on the real library:
- **Library half.** A test book was added and removed, and so were the test notes. The «مەنبە» search found three places. Inserting the second cited `bh://book/1?o=107&q=…`: 107 is exactly where that occurrence starts. Its card showed «كىتاب: «…»». «ئېچىش» opened the reader at match 2/3.
- **Qur'an half.** A verse search gave 10 results with marks. The inserted verse opened at 37:5.
- **Other checks.** The search history was unchanged. «تەرجىمىسى» inserted no Arabic, and the saved note kept `bh://quran/1/1`. No exception and no console error.

**Things to know.**
- The import dialog's OCR cleanup, `naiOcrCleanupStaged`, still asks with `confirm()`. It is outside the notebook and the work order. `no-new-confirm` caps the renderer at the eight `confirm()` calls left from before the rule, so the list can only shrink.
- The `insertText` paths may write a space next to a tag as U+00A0, as typing does. It reads the same, and the next proofread treats it as a space.

### Phase 6 checklist for the owner (`npm run dev`)

1. «مەنبە» بەتكۈچىنىڭ ئۈستىدىكى ئىزدەش رامكىسىغا كىتابتىكى بىر سۆزنى يېزىپ Enter نى بېسىڭ ← كىتابلار ۋە قۇرئاندىن نەتىجە چىقىدۇ، سۆز بەلگىلەنگەن. بىر نەتىجىنىڭ «قىستۇرۇش» نى بېسىڭ ← نەقىلنىڭ ئاستىدا «— كىتاب ماۋزۇسى» ئۇلىنىشى بار.
2. شۇ ئۇلىنىشنى چېكىڭ ← كىچىك كارتا چىقىدۇ. «ئېچىش» نى بېسىڭ ← خاتىرە ساقلىنىپ، كىتاب دەل نەقىل ئېلىنغان ئورۇندا ئېچىلىدۇ. Ctrl بىلەن چەكسىڭىز كارتىسىز بىراقلا ئېچىلىدۇ.
3. «قۇرئان» بەتكۈچىدە «ئەرەبچە / تەرجىمىسى / ئىككىلىسى» دىن بىرىنى تاللاپ ئايەت قىستۇرۇڭ ← تاللىغىنىڭىزدەك قىستۇرۇلىدۇ، ئاستىدا «— قۇرئان كەرىم، 2:255» ئۇلىنىشى بار. دېتالنى قايتا ئاچسىڭىزمۇ تاللاش ئېسىدە قالىدۇ. ئۇلىنىشتىكى «ئېچىش» ← قۇرئان شۇ ئايەتتە ئېچىلىدۇ.
4. كارتىدىكى «ئۇلىنىشنى ئېلىۋېتىش» نى بېسىڭ ← سۆز قالىدۇ، ئۇلىنىش كېتىدۇ. Ctrl+Z ئۇلىنىشنى قايتۇرىدۇ.
5. ئايەت ۋە توم (bold) سۆز بار خاتىرىدە AI ← «ئىملا تۈزىتىش» نى بېسىڭ ← ھېچنېمە سورىمايدۇ. پەقەت ئۆزگىرىدىغان قۇرلار تىزىلىدۇ، ھەر بىرىنىڭ يېنىدا تاللاش رامكىسى بار، «نەقىل، ئايەت ۋە ئۇلىنىشلار ئەۋەتىلمىدى» دەپ يېزىلغان. «قوللىنىش» ← ئايەت ۋە توم سۆز ئۆز پېتى قالىدۇ.
6. «يېنىۋېلىش» نى بېسىڭ (AI بەتكۈچىدە ياكى ئاستىدىكى ئۇچۇردا) ← خاتىرە AI دىن بۇرۇنقى ھالىتىگە قايتىدۇ. Ctrl+Z بىلەن تۈزىتىشلەرنى بىر-بىرلەپ قايتۇرۇشقىمۇ بولىدۇ.
7. OCR تېكىستىنى تاللاپ «OCR نەتىجىسىنى AI بىلەن تۈزىتىش» نى بېسىڭ ← پەقەت تاللانغان قىسىم تۈزىتىلىدۇ. ماۋزۇ ياكى ئايەت بار خاتىرىدە ھېچنېمە تاللىماي باسسىڭىز ← «OCR تېكىستىنى تاللاپ ئاندىن تۈزىتىڭ» دېگەن ئۇچۇر چىقىدۇ.

## Phase 7 — so far

| Item | What changed | Tests |
|---|---|---|
| Places (K5, W16) | A place is the character offset where a paragraph begins in the book. Migration step 3 adds `char_offset` to `bookmarks`, `notes` and `reading_progress`; old rows stay NULL. `src/reader-places.js` (UMD, pure) cuts the pages the reader always cut (proved against the old pagination), gives each page its start, and maps an offset to a page and a paragraph. The reader renders `<p data-off>`.<br>• **Add:** the paragraph at the top, named «N-بەت». Rename in place. Duplicates are judged by paragraph.<br>• **Jump:** leaves search mode, draws the page, scrolls to the paragraph and flashes it.<br>• **Old rows:** listed under «كونا خەتكۈچلەر — ئورنى ساقلانمىغان» (or «كونا ئىزاھاتلار …»); they open page 1 with a toast.<br>• **The position** is saved on a page turn, on close (before the reader is hidden) and 1.5 s after scrolling stops, and restored exactly. | main: `reader-pages-keep-their-place`, `reader-offset-to-page-and-paragraph`, `offsets-migration-keeps-old-rows`, `offsets-sync-keeps-the-place`, `offsets-without-the-step`, `progress-keeps-the-place` |
| Found on the way (K5) | `syncReadingProgress` used INSERT OR REPLACE, so every whole-library save (a theme change) reset the page and would have wiped the place. It is an upsert now: the same percentage keeps both, a new one clears the stale place. A library whose step 3 could not run still saves the old way. Search marks went into tags as well as text, so a search for a number would have broken `data-off`; they now go into text only. A book opened at the previous book's scroll position, because the reset happened while the reader was hidden; it is now reset after the reader is shown. | the same |
| Qur'an bookmarks (W17) | Migration step 4 adds `quran_bookmarks(sura, aya, note, created_at, UNIQUE)`; database.js refuses a verse that cannot exist. In the Qur'an view:<br>• the verse menu offers «خەتكۈچ قوشۇش / خەتكۈچنى ئېلىۋېتىش»;<br>• a bookmarked verse is marked on the page;<br>• a «خەتكۈچلەر» section heads the sidebar, in mushaf order, and removing from it can be undone from the toast.<br>The last verse read (`quran_last_aya`) is offered once a session when the Qur'an opens at its default page. Verses scrolled to by the app itself are not counted. | main: `quran-bookmarks-store`, `quran-bookmarks-refuse-what-cannot-be` |
| Letters on the way in (W18, K15) | `text-normalize.js` ports the web's fold and the checks:<br>• per character, the two letter ranges fold to letters, then NFC; heh isolated/final become ە;<br>• U+FDF0–FDFD (ﷲ ﷺ …) are never touched.<br>database.js folds title, author, description and text on **every** book write: add, batch, update, save-content, and the renderer's whole-library save, which would otherwise write an imported raw title back.<br>One adaptation: the Uyghur hamza ligatures U+FBEA–FBFB (ئا ئە …) are allowed two-letter forms alongside lam-alef. Any other expansion still refuses a book.<br>`close()` now clears the text cache, which belonged to the library it was read from. | main: `forms-fold`, `forms-checks`, `forms-folded-on-the-way-in` |
| Clear search history (W20, K17) | «تارىخنى تازىلاش» in the dropdown header deletes `search_history` (main IPC). It asks with a second click on the same button. | main: `search-history-clear` |

Checked in `npm run dev` over the DevTools protocol, on test books added and removed:
- **Bookmarks.** One on page 30 and one on page 2; the same paragraph twice was refused («بۇ ئابزاستا خەتكۈچ بار»).
- **Jumping and renaming.** A jump from page 2 to page 30 landed on the bookmark's paragraph and flashed it. The rename was kept. An old bookmark opened page 1.
- **Saved and restored.** The bookmarks came back from the database with their places. The exact paragraph returned after close and reopen. A number search left all 900 `data-off` attributes whole.
- **Qur'an.** The offer «ئالدىنقى قېتىم: بەقەرە — 255-ئايەت», the mark, the sidebar list, the menu label, and remove then «قايتۇرۇش» all worked. The history cleared on the second click.

### Waiting for the owner: the book search index

The W18 repair tool («كىتابلارنى تەكشۈرۈش»: scan, backup, fold each book in its own transaction with the checks, rebuild the book's search row) is written and tested. It cannot rebuild the search row: `book_fts` was created with `content_rowid='book_id'` and no external content table, so measured on the bundled SQLite (3.49.2):
- **Rows cannot be deleted.** `DELETE FROM book_fts WHERE rowid=?` fails with «no such column: T.book_id», and so does `COUNT(*)`. updateBook / saveBookContent / upsertBook swallow the error, so their insert never runs and a book whose text changes keeps its OLD words in the index.
- **Search never uses the index.** `snippet()` fails («SQL logic error»). Whenever the index finds a book, searchBooks falls back to the substring search over every book's text. When it finds none (the words exist only in changed text), it returns no content results at all.

This is the same defect as the failing `PRAGMA integrity_check` (Phase 2). The fix is a migration step that rebuilds `book_fts` correctly from `books` + `book_content`. That is derived data with a backup first, and no user data is touched. But once the index works, search can either use it, which changes what is found, or keep today's substring search. That choice is the owner's. The repair tool's code is held until then.

## Measurements

Anything the audit or the web edition measured in another engine has to be
re-measured in Electron 28 (Chromium 120) before the code relies on it. What is
confirmed here goes into `CLAUDE.md`.

| What | Result | Where measured |
|---|---|---|
| `CSS.highlights` / `Highlight` | present and paints Ranges; `CSS.highlights.clear()` works | `npm test`, Phase 0 |
| `document.caretRangeFromPoint` | present (`caretPositionFromPoint` is not) — the spellchecker's hit test works | `npm test`, Phase 0 |
| `document.execCommand('insertText' / 'insertParagraph' / 'insertLineBreak')` | all work in a hidden `BrowserWindow`, with layout and `getClientRects` | `npm test`, Phase 0 |
| `removeFormat` keeps `<a>`, `<br>`, blocks, classes? | **yes** | `engine-removeformat`, Phase 1.2 |
| `removeFormat` keeps `data-*` attributes? | **yes.** Corrected in Phase 2.3: Phase 1 recorded «no», but the old sanitizer had already stripped `data-ref-insert` when the fixture was opened (K6), so the command was never measured. The test now checks the attribute is there first. The painter still skips quoted material — a verse or citation is not the writer's to restyle — just not for this reason | `engine-removeformat`, Phases 1.2 / 2.3 |
| The toolbar's font-size levels 1–7, in pixels | 10, 13, 16, 18, 24, 32, 48 — a source size is painted as the nearest level | `engine-font-sizes`, Phase 1.2 |
| `PRAGMA integrity_check` on a whole library | **fails**: "SQL logic error" — FTS5 is checked too, and `book_fts` has `content_rowid` without external content. Table by table works | `backup-copy`, Phase 2.2 |
| The family name inside the bundled Uthmani font | «KFGQPC HafsEx1 Uthmanic Script» (regular and bold); the UKIJ files say «UKIJ Ekran», «UKIJ Esliye», «UKIJ Tuz», «UKIJ Tuz Kitab», «UKIJ Tuz Tom» | the fonts' `name` tables, Phase 4 |
| `insertText` with `\n` | each `\n` starts a new paragraph (`<p>` in this editor), `\n\n` leaves an empty `<p><br></p>`; replacing a selection with it is **one** undo step | probe, then `ocr-scope-selection`, Phase 6 |
| `Selection.toString()` | follows layout: a `<p>` with its bottom margin gives `\n\n`, an empty one more — so it is not used to find paragraphs (the text map is) | probe, Phase 6 |
| A window behind another one (the dev app during a check) | `document.visibilityState` is «hidden» and `requestAnimationFrame` never fires. A place to restore is therefore scrolled to at once after the reader is shown (scrollIntoView lays it out itself), not in a frame | probe, Phase 7 |
| `book_fts` | `content_rowid='book_id'` without `content=`: rows cannot be deleted or counted («no such column: T.book_id»), and `snippet()` fails («SQL logic error»). search falls back to substring search, and changed text stays unindexed | probe, Phase 7 |
| A hidden test window | draws no frames: `requestAnimationFrame` never fires and a scroll never sends its `scroll` event. The link card therefore follows scroll events directly (Chromium sends them at most once a frame anyway), and its test sends the event itself | `cite-card-follows-scroll`, Phase 6 |
| Leaving a heading or a quote | `formatBlock <p>` turns a heading, or a quote of text lines, into normal text; a quote of blocks needs `outdent` over its whole content (formatBlock leaves it); each is ONE undo step and comes back with redo. Matches the web's Chromium 151 findings | `block-style-transitions`, Phase 3.2 |

## Deferred

| Item | Why | When |
|---|---|---|
| — | | |

Out of scope for 3.5 (do not start): K14 Electron upgrade, K16/W22 Markdown
rendering and in-book links, W15 notebook page typography, W19 quote image,
W21 on-screen keyboard, W23 browse by author.
