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
| 3 | Versions and document structure: W1, W4, W5, W14, K11 | not started | — | — |
| 4 | Export: W6, K8 | not started | — | — |
| 5 | List, trash, spelling: W2, W3, W7–W10, K12, K13 | not started | — | — |
| 6 | Citations, sources, AI that keeps formatting: W11–W13, K9 | not started | — | — |
| 7 | Reader, Qur'an, search: K5, K15, K17, W16–W18, W20 | not started | — | — |
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
| `formatBlock div` / `outdent` to leave a quote | **not yet measured** — Phase 3.2 | — |

## Deferred

| Item | Why | When |
|---|---|---|
| — | | |

Out of scope for 3.5 (do not start): K14 Electron upgrade, K16/W22 Markdown
rendering and in-book links, W15 notebook page typography, W19 quote image,
W21 on-screen keyboard, W23 browse by author.
