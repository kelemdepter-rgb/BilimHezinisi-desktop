# v3.6.1 — progress

Working document for the Claude Code sessions that execute
[`PROMPT-3.6.1.md`](PROMPT-3.6.1.md). Read it before answering any question
about what is done. Branch: `release/3.6.1` (cut from `main` at `8af6a5e`, the
AI-model merge of 3.6.0).

Resume line for a new session:

```
Read prompts/3.6.1/PROMPT-3.6.1.md in full, then prompts/3.6.1/PROGRESS.md, and continue with the next unfinished phase.
```

## Phases

| Phase | What | Status | Commits | Tests |
|---|---|---|---|---|
| 0 | Groundwork: branch, `npm test`, this file, the red tests of Phases 1 and 2 | **done** | `87f499e` docs: add the 3.6.1 work order · docs(progress): this file | 183 green + the syntax gate before anything changed |
| 1 | A book opens at once; the add-book dialog closes at once | **done** — waiting for the owner's check | `7625fab` perf(library): save-library writes only the books that changed · `f0f3838` perf(reader): opening a book writes one recent-list row, never the library · docs(progress) | 188 in all (with the syntax gate), every one green |
| 2 | The offline OCR answers in the installed app; an error is said, never waited for | not started | | |
| 3 | OCR uses more than one core; the time left is shown | not started | | |
| 4 | Release 3.6.1 (no publishing) | not started | | |

## Phase 0 — done

- `main` was at `8af6a5e` (the AI-model merge), clean apart from untracked
  files under `prompts/` that are the owner's (the 3.6 videos and screenshots,
  `prompts/3.6/PROMPT-3.6-AI-MODELS.md`, `PARTNER-CENTER-3.2.0.md`,
  `PROMPT-17D-desktop-ai-models.md`, `PROMPT-SPELLCHECK-MORPHOLOGY.md`,
  `TARQITISH-TEKISTLIRI.md`) — left alone. Only `prompts/3.6.1/` was committed
  (`87f499e`).
- `npm test` on `release/3.6.1` before any change: **183 green** and the
  syntax gate, 30.0 s.
- The red tests, written before any fix and run against today's code:

| Test | Phase | Red message (today's code) |
|---|---|---|
| `library-save-skips-unchanged-books` (40 books × 250,000 chars) | 1 | «40 of 40 unchanged books were written (updated_at); the search index was rewritten (book_fts_data 1649267441782 → 1374389534948); the save took **2882 ms**» |
| `library-save-title-change-reindexes` | 1 | the index part already passes (a title change is re-indexed today); red on «the book that did not change was written — expected "2020-01-01 00:00:00", got "2026-11-16 14:34:11"» |
| `library-save-category-change-keeps-index` (added: a change the index does not hold) | 1 | «the book that did not change was written» |
| `recent-one-row-in-order` | 1 | «the book just opened is not first: … {"id":4,"time":"2026-11-16 14:34:11"}» — `addRecentRead` writes `datetime('now')`, which sorts below the ISO times `syncRecent` writes |
| `open-book-sends-no-library` (static) | 1 | «opening a book still sends the whole library — "saveData(" found» |
| `ocr-worker-dependencies-unpacked` (static) | 2 | «bmp-js, idb-keyval, is-electron, is-url, node-fetch, opencollective-postinstall, regenerator-runtime, wasm-feature-detect, zlibjs, whatwg-url, tr46, webidl-conversions are not unpacked (build.asarUnpack) — expected 0, got 12» |
| `ocr-engine-unpacked-layout` (the 3.6.0 layout in the runner's Electron main process) | 2 | «no answer within 30 s (uncaught in the main process: Cannot find module 'node-fetch')» |

The test runner has no «expected failure», so a red test is committed only
with its fix. The two Phase 2 tests wait in `tests/pending/ocr-unpacked.js`
(untracked, outside the runner's folders) until Phase 2 moves them into
`tests/main/`. `ocr-engine-answers` stays green.

The dependency closure on this machine (`npm ls --omit=dev --all`):
tesseract.js 5.1.1 → `bmp-js`, `idb-keyval`, `is-electron`, `is-url`,
`node-fetch` 2.7.0 (→ `whatwg-url` 5.0.0 → `tr46` 0.0.3, `webidl-conversions`
3.0.1; `encoding` is an optional peer, not installed), `opencollective-postinstall`,
`regenerator-runtime`, `tesseract.js-core`, `wasm-feature-detect`, `zlibjs` —
as the work order says. `opencollective-postinstall` is not needed at run time,
but it is a production dependency and a few KB; it is unpacked with the rest,
so the rule «every installed production dependency of tesseract.js is
unpacked» has no exception to forget.

## Phase 1 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| Only what changed | `upsertBook` (`database.js`) folds the incoming title, author and description as before, reads the stored `title, author, category, format, date, description` (NULL as `''`) and compares: all six equal → nothing written (no `UPDATE`, no `updated_at`, no index work); something differs → `UPDATE` as before, and the `book_fts` row is rewritten (`indexBookRow`, with the stored text) only when the title or the author changed. A book not in the table is inserted as before. It returns whether it wrote; `syncBooks` stays one transaction, never deletes, and returns how many it wrote. `saveData()` and its callers are unchanged — they are fast through this. | `library-save-skips-unchanged-books` — red: «40 of 40 unchanged books were written; the search index was rewritten; 2882 ms»; `library-save-title-change-reindexes` (title, then author: the index finds the new one, not the old, and the text is still found; the other book untouched) — red on the untouched book; `library-save-category-change-keeps-index` — red |
| Opening sends no library | `addToRecent()` updates `S.recent` as before and writes one row through the existing `db-add-recent` IPC, unawaited (`dbAddRecent(bookId, time)` in preload). `addRecentRead(bookId, time)` — the one way, extended — stores the renderer's ISO time (anything else: now, in ISO), keeps at most 20 rows (ties by id). It was unused by the renderer before. | `recent-one-row-in-order` — red: «the book just opened is not first … "2026-11-16 14:34:11"» |
| The text first | `openReader()` sends `loadBookContent` and the saved place (`askSavedPlace`, which never throws) together in one `Promise.all`, before anything else that waits on main; `addToRecent` follows, unawaited. The rest is unchanged (places, search marks, panels, AI gate). | `open-book-sends-no-library` (static: `addToRecent` has no `saveData(`, uses `dbAddRecent(`; `openReader` asks in `Promise.all` before `addToRecent`; preload and main pass the time) — red |

The K4 suites (`sync-never-deletes`, `empty-book-list-refused`,
`failed-part-not-synced`, `renderer-library-writes`, …) stay green.

Checked in `npm run dev` over the DevTools protocol, DEV library only: the
DEV library (1 book) was copied aside, 100 generated books of 300,000
characters were added (101 books, 165 MB), the old code (the fix stashed)
and the new code were each started on the same seeded file, ten books opened
(`openReader`, timed until it returns with the page drawn) and three small
TXT books added (`addBook`, timed until the dialog closed); then the DEV
library was put back byte for byte (same SHA-256). The app's own weekly
backup `auto-2026-11-16.db` was taken on the first start, before the test
books went in, and stays. After the new code: the recent list in the
database is newest first with ISO times, and the added book is found by its
title.

**Found in passing:** `.gitignore` gained a «Promo-film footage» block and
`prompts/3.6/PROMPT-PROMO-VIDEO-3.6.md` appeared while this phase ran — not
made here (another session's promo-video work). Left alone, not committed.

### Phase 1 checklist for the owner (`npm run dev`)

1. `npm run dev` ← دېتال DEV كۇتۇپخانىسى بىلەن ئېچىلىدۇ.
2. بىرقانچە كىتابنى بىرىنىڭ كەينىدىن «ئوقۇش» بىلەن ئېچىڭ ← ھەر بىرى دەرھال ئېچىلىدۇ، ئاخىرقى قېتىم ئوقۇغان يېرىدە.
3. بىر كىتابقا خەتكۈچ قوشۇڭ، ئاندىن ئۆچۈرۈڭ ← ھەر ئىككىسى دەرھال بولىدۇ.
4. باشتىكى تېما كۇنۇپكىسى (ئاي/قۇياش) بىلەن تېمىنى ئالماشتۇرۇڭ ← دەرھال ئالمىشىدۇ.
5. «كىتاب قوشۇش» بىلەن كىچىك بىر TXT كىتاب قوشۇڭ ← «قوشۇش» نى باسقان ھامان دىئالوگ يېپىلىدۇ؛ ئىزدەش رامكىسىغا كىتابنىڭ نامىنى يازسىڭىز تېپىلىدۇ.
6. دېتالنى يېپىپ قايتا ئېچىڭ ← «يېقىندا ئوقۇلغانلار» دا ئەڭ ئاخىرىدا ئاچقان كىتاب ئەڭ ئۈستىدە، قالغانلىرى ئاچقان تەرتىپىڭىز بويىچە. 3- ۋە 4-قەدەمدىكى خەتكۈچ ۋە تېما ساقلانغان.

## Measurements

| What | Before | After | Where measured |
|---|---|---|---|
| `saveLibrary` of 40 unchanged books × 250,000 chars | 2,882 ms; every book written, the index rewritten | under the 250 ms bound; nothing written | `library-save-skips-unchanged-books`, Phases 0–1 |
| `saveLibrary` as `addToRecent` sent it, 100 books × 300,000 chars | (Cowork, Xeon 2.1 GHz: 4,680–4,920 ms, WAL grew to 83 MB) | **1.2–2.9 ms** over five saves; WAL 9.2 MB (all of it the 100 imports) | ELECTRON_RUN_AS_NODE script with the app's `database.js` + `library-sync.js`, this machine (16 logical cores), Phase 1 |
| Opening a book (`openReader` until the page is drawn), DEV library of 101 books, 100 × 300,000 chars, ten books | 7,658–9,497 ms (median ≈ 8,470 ms) | **11–21 ms** (median 15 ms) | `npm run dev` over the DevTools protocol, Phase 1 |
| Adding a small TXT book («قوشۇش» until the dialog closes), same library, three books | 8,077–8,664 ms | **10–38 ms** | the same, Phase 1 |

## Deferred

| Item | Why | When |
|---|---|---|
