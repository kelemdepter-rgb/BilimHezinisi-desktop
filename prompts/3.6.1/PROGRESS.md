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
| 2 | The offline OCR answers in the installed app; an error is said, never waited for | **done** — waiting for the owner's check | `eeb5ab5` fix(ocr): the offline OCR starts in the installed app, or says why · `ba05206` fix(import): a failed offline OCR keeps its pages and offers a retry · `b4bdb93` chore(build): npm run check-package checks OCR in the built app · `2a7de76` docs(build) · docs(progress) | 196 in all (with the syntax gate), every one green |
| 3 | OCR uses more than one core; the time left is shown | **done** — waiting for the owner's check | `f642fb1` feat(ocr): one engine per OCR run, K workers reading at once · `df2d3bc` feat(import): OCR keeps every worker busy and says the time left · docs(progress) | 204 in all (with the syntax gate), every one green |
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

## Phase 2 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| Unpacked | `build.asarUnpack` gets the worker's run-time dependency closure, from `npm ls` on this machine: `bmp-js`, `idb-keyval`, `is-electron`, `is-url`, `node-fetch` (+ `whatwg-url`, `tr46`, `webidl-conversions`), `opencollective-postinstall`, `regenerator-runtime`, `wasm-feature-detect`, `zlibjs`. `build.appx` byte-identical to `main`. | `ocr-worker-dependencies-unpacked` (walks tesseract.js's production `dependencies` through `node_modules/*/package.json`, matches each against the `asarUnpack` globs) — red: «bmp-js, idb-keyval, … are not unpacked … got 12» |
| Never waits for ever | `ocr-engine.js`: `missingWorkerModules(workerPath)` resolves the closure with `Module.createRequire` from where the worker lies, each package from the one that requires it; `startWorker(createWorker, langs, options, { timeoutMs })` refuses to start when one is missing — «OCR ماتورى قوزغالمىدى: «bmp-js» تېپىلمىدى.» (the first one; the name is for a bug report) — gives up after 60 s («… 60 سېكۇنتتا جاۋاب بەرمىدى.»), ends an engine that arrives later, and words any other start failure the same way. No global `uncaughtException` handler. `tessdataDir()` / `workerScriptPath()` moved from main.js unchanged. `ocr-recognize` starts through `startWorker` (it still passes `ocrEngine.workerOptions(…)`, so `ocr-engine-wired` holds as it was). | `ocr-engine-unpacked-layout` (only `tesseract.js` copied into a temp `node_modules`, in the runner's Electron main process) — red: «no answer within 30 s (uncaught in the main process: Cannot find module 'node-fetch')»; now the named error in well under a second, no uncaught exception. `ocr-engine-start-answers` — red: «engine.missingWorkerModules is not a function»; `ocr-engine-start-timeout` — red: «the start timeout is not a minute»; `ocr-start-wired` — red. `ocr-engine-answers` green throughout. |
| The dialog says it | `src/pdf-ocr.js` (`window.PdfOcr`, UMD, loaded by index.html and the harness): `run()` reads the pages as before (render, binarize, five a request, one entry per page in page order) and ends a failure or a throw with the pages read so far and the engine's words; `failureText()` / `showFailure()`. `startPdfOcr`: on a failure the error stays in the OCR box («… 10 / 40 بەت ئوقۇلدى؛ ئوقۇلغان بەتلەر ساقلاندى. قايتا سىناش ئۈچۈن «UKIJ OCR (تورسىز)» نى بېسىڭ.»), the progress line goes, the engine buttons come back, the partial text stays staged with its page ranges, `finfo` says «⚠ PDF (UKIJ OCR قىسمەن)», and the description gets its line. A retry reads from page 1 again. Gemini OCR's path is unchanged (split into its own branch, same code). | `pdf-ocr-error-keeps-pages`, `pdf-ocr-failure-offers-retry` — red: «src/pdf-ocr.js is not loaded»; `pdf-import-ocr-error-offers-retry` (static over `startPdfOcr`) — red: «index.html does not load src/pdf-ocr.js» |
| The other callers | Checked, unchanged: the notebook's image OCR toasts «OCR خاتالىقى: <error>» (`src/notes.js`), the page view's re-OCR toasts «OCR مەغلۇپ بولدى: <error>» (`ocrThisPage` in `src/pdf-compare.js`, `ocrPage` throws the engine's error). With the start guard both now get an answer instead of waiting. | — |
| `npm run check-package` | `scripts/check-package.js` (+ `check-package-probe.js`, both left out of the package): the four models, the worker and its packages unpacked, and one real page read by the BUILT exe with `ELECTRON_RUN_AS_NODE=1`, the engine started exactly as main.js does (ocr-engine.js and tesseract.js from `app.asar`; for a build from before 3.6.1, main.js's old start). Optional folder argument for the Store build. | On the 3.6.0 `dist/win-unpacked`: **FAIL** — «the worker cannot find: bmp-js, idb-keyval, is-electron, is-url, node-fetch, opencollective-postinstall, regenerator-runtime, wasm-feature-detect, zlibjs», «OCR in the built app: uncaught in the main process: Cannot find module 'node-fetch'». Rebuilt: **OK** — «one page read in 159 ms». |
| Docs | `BUILD-GUIDE.md` (step 6 and «3.1»), `CLAUDE.md` (build workflow, packaging line, `pdf-ocr.js` in the renderer list). | — |

**Measured — Electron keeps a packed app's module lookups inside
`resources`.** The 3.6.0 exe with `ELECTRON_RUN_AS_NODE=1`, from inside the
source folder (whose `node_modules` holds node-fetch): `Module._nodeModulePaths`
from the worker's folder stops at `dist\win-unpacked\resources\node_modules`;
`createRequire(worker).resolve('node-fetch')` fails; a `Worker` on the script
dies with «Cannot find module 'node-fetch'». So the owner's check from
`dist\win-unpacked` inside the source folder is a true test, and plain Node
from the source tree is not (it would find the source `node_modules`) — which
is why check-package asks the built exe.

**The rebuild.** `npx electron-builder --win --x64 --dir` (7 s): it rewrote
only `dist\win-unpacked`. `npm run dist-win` would also have overwritten
`dist\Bilim Hezinisi Setup 3.6.0.exe` and the 3.6.0 portable with a build that
is no longer 3.6.0; the version becomes 3.6.1 in Phase 4. The new
`app.asar.unpacked\node_modules` holds the 15 packages; the scripts of
check-package are not in `app.asar`.

**Checked in the built app** (`dist\win-unpacked\Bilim Hezinisi.exe --dev`
over the DevTools protocol, DEV library, nothing written): `ocr-recognize`
through the real IPC on two lines of Uyghur drawn in the renderer answered
in **523 ms** with Uyghur text (`[ocr] ukij page 1/1 chars=76` in the log).

### Phase 2 checklist for the owner

These run in a terminal in the app folder.

1. `npm run dist-win` ← `dist` قىسقۇچىدا ياسىلىدۇ. (دىققەت: ئۇ `Bilim Hezinisi Setup 3.6.0.exe` ۋە `BilimHezinisi-Portable-3.6.0.exe` نىڭ ئۈستىگە يازىدۇ؛ ئۇلار لازىم بولسا ئالدى بىلەن باشقا يەرگە كۆچۈرۈۋېلىڭ. ياكى پەقەت `npx electron-builder --win --x64 --dir` نى ئىجرا قىلىڭ — ئۇ پەقەت `dist\win-unpacked` نى ياسايدۇ.)
2. `npm run check-package` ← ئاخىرىدا `check-package OK` چىقىدۇ.
3. `"dist\win-unpacked\Bilim Hezinisi.exe" --dev` ← دېتال سىناق كۇتۇپخانىسى بىلەن ئېچىلىدۇ.
4. 2–3 بەتلىك سىكان PDF نى «كىتاب قوشۇش» بىلەن ئەكىرىپ «UKIJ OCR (تورسىز)» نى بېسىڭ ← «بەت 1 / 3»، «بەت 2 / 3» … ئىلگىرىلەيدۇ، ئاخىرىدا تېكىست چىقىدۇ («OCR تامام بولدى»). «قوشۇش» نى بېسىڭ، كىتابنى ئېچىپ تېكىستنى كۆرۈڭ.
5. خاتىرە دەپتىرىدە كامېرا كۇنۇپكىسى «رەسىمدىن تېكىست (OCR، تورسىز)» بىلەن تېكىستلىك بىر رەسىم تاللاڭ ← تېكىست خاتىرىگە كىرىدۇ.
6. 4-قەدەمدە قوشقان PDF كىتابنى ئېچىپ «ئەسلى بەت بىلەن سېلىشتۇرۇش» نى بېسىڭ، ئاندىن «بۇ بەتنى قايتا OCR قىلىش (تورسىز)» ← ئالدىن كۆرۈش رامكىسى تېكىست بىلەن تولىدۇ.
7. ئىشىڭىز تۈگىگەندە 4-قەدەمدە قوشقان سىناق كىتابنى ئۆچۈرۈۋەتسىڭىز بولىدۇ (سىناق كۇتۇپخانىسى، ئەسلى كۇتۇپخانىڭىز ئەمەس).

## Phase 3 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| K | `ocrEngine.workerCount(cores, totalmem)`: K = min(4, max(1, cores − 1)), at most 2 under 8 GB. main.js asks it with `os.cpus().length`, `os.totalmem()`. This machine: 16 logical cores, 31.9 GB → **K = 4**. | `ocr-worker-count` (twelve cases) — red: «ocr-engine.js has no workerCount» |
| One engine per run | `ocrEngine.createEngine()`: up to K workers behind tesseract.js's `createScheduler`, each started through `startWorker` (package check and start timeout per worker), started as pages wait for them — one picture starts one worker. Pages go to the scheduler only while a worker is free, so the queue is the engine's: `cancel()` drops the pages not started at once, the ones being read finish and are kept. (The scheduler's own `terminate()` empties its queue without settling those jobs — read in `createScheduler.js` — so it is never relied on to cancel.) `recognize()` answers in input order; `end()` answers every request in flight (cancelled); an idle minute (`IDLE_END_MS`) ends the engine. main.js: one engine per model set (`ukij`, `ukij+uig`, …; the notebook's does not end an import's), kept across a run's requests; `ocr-recognize` keeps its shape for every caller, one progress event a page; `ocr-cancel` drops the queued pages of every engine; new `ocr-end(langs)` and `ocr-worker-count`; `before-quit` ends every engine. | `ocr-scheduler-keeps-page-order` (real engine, three workers, three Latin texts of 7, 1 and 3 lines drawn by Chromium — `tests/lib/text-png.js` — answered in order; a second request starts no worker; ended afterwards), `ocr-cancel-keeps-finished-pages` (fake workers, real scheduler: cancel after the first page → the first pages in order, nothing queued read, the engine answers the next request; ended while reading → the request answers), `ocr-engine-fails-and-idles` (start error for every request; idle end), `ocr-one-engine-per-run-wired` — red: «createEngine is not a function» / «ocr-recognize does not use one engine per run» |
| Workers kept busy | `PdfOcr.run` sends requests of K pages, two out at once, and draws the next pages while the ones sent are read (≤ about 2×K page images); answers are taken in the order sent, so the pages come out in page order, an empty page keeping its entry. Before drawing more it lets answers that have come back be seen (a `MessageChannel` turn — a timer is held back in a window behind others), so nothing more is sent once a failure is in (`pdf-ocr-error-keeps-pages` holds as written in Phase 2). An answer that comes back short (a cancel) is the last one used. | `pdf-ocr-pipeline-order` (fake engine answering out of order with delays: every page sent once, in order, drawn pages = sent pages, page 4 empty and kept, at most 2×K held, more than K held) — red: «the next pages were not drawn while the others were read: 3» |
| Progress | «UKIJ OCR: ماتور قوزغىلىۋاتىدۇ…» until the first page; then «UKIJ OCR: بەت 7 / 40»; from the second page «— تەخمىنەن 3 مىنۇت قالدى» (minutes, rounded; «— 1 مىنۇتتىن ئاز قالدى» under a minute), recomputed at every page from the time since the run began (`PdfOcr.estimateLeft`, `progressText`). After «توختىتىش» the line keeps «— توختىتىلىۋاتىدۇ...». Gemini's line is unchanged. | `pdf-ocr-progress-text` — red: «src/pdf-ocr.js has no progressText» |
| Ends | The run calls `ocr-end` when it finishes, is cancelled or fails; `hideAdd()` cancels a running OCR (the pages read stay staged, as with «توختىتىش»); a run whose dialog was opened afresh meanwhile (`S.ocrPdf` changed) stages nothing. | `pdf-import-ocr-pipeline-wired` (static) — red: «ocrWorkerCount( not found» |
| Unchanged | Render scale 3.2 and `binarizeCanvas`; `ukij` by default and the language boxes; `PdfText.OCR_MAX_PAGES` (300) and its lines; `PdfText.joinPages` and the page ranges; Gemini OCR. | `pdf-ocr-join-and-cap`, `pdf-ocr-error-keeps-pages`, `pdf-ocr-failure-offers-retry` green |

`ocr-start-wired` (Phase 2) followed the engine start from main.js into
`createEngine`: it now requires main.js to start workers through
`ocrEngine.createEngine` and createEngine through `startWorker`, and also
starts an engine on the 3.6.0 layout and requires the named start error and
no uncaught exception — a behaviour check it did not have before.

**Measured** — a 10-page scanned PDF made for this (A4, Uyghur prose from the
bundled translation of Al-Baqara in «UKIJ Tuz Tom», 150 DPI JPEG pages, no
text layer: `prompts/3.6.1/test-scan-10.pdf`, untracked, 3.8 MB), imported
through `startPdfOcr` over the DevTools protocol, DEV library, nothing added:

| Build | Workers | Wall time | Text |
|---|---|---|---|
| Phase 2 (`dist\win-unpacked`, one worker, five pages a request) | 1 | **102.2 s** (pages at 8.1, 14.8, 21.8, 27.6, 34.1, 48.9, 62.9, 75.9, 89.9 s) | 32,824 characters |
| Phase 3, `npm run dev` | 4 | **22.2 s** | identical to one worker, byte for byte |
| Phase 3, rebuilt `dist\win-unpacked` (`check-package` OK) | 4 | **22.1 s** (pages 1–4 at 8.7–9.3 s, 5–8 at 15.5–16.7 s, 9–10 at 22 s) | identical |

4.6× faster. Cancel at page 5 (dev): the queued page 10 was dropped at once,
the pages being read (6–9) finished and were kept — 9 / 10 pages, a prefix of
the full text; the run ended at 21.6 s, when the page that had just started
(9) finished, as the old loop also waited for its current page. One picture
with `ukij+uig` (the notebook's models) in the rebuilt app: one worker, 536 ms.

### Phase 3 checklist for the owner (`npm run dev`)

`prompts\3.6.1\test-scan-10.pdf` is a 10-page scanned PDF made for this test; one of your own is just as good.

1. `npm run dev` ← دېتال سىناق كۇتۇپخانىسى بىلەن ئېچىلىدۇ.
2. «كىتاب قوشۇش» بىلەن 10 بەتلىك سىكان PDF نى تاللاپ «UKIJ OCR (تورسىز)» نى بېسىڭ، سائەت بىلەن ۋاقىت ئۆلچەڭ ← ئالدى بىلەن «ماتور قوزغىلىۋاتىدۇ…»، ئاندىن «بەت 4 / 10» دەك بىرقانچە بەت بىراقلا كۆپىيىدۇ؛ ئىككىنچى بەتتىن كېيىن «تەخمىنەن … مىنۇت قالدى» ياكى «1 مىنۇتتىن ئاز قالدى» كۆرۈنىدۇ. بۇ كومپيۇتېردا 10 بەت تەخمىنەن 22 سېكۇنت (بۇرۇن 102 سېكۇنت).
3. يەنە بىر قېتىم باشلاپ، 4–5 بەت ئوقۇلغاندا «توختىتىش» نى بېسىڭ ← «توختىتىلىۋاتىدۇ...» دەيدۇ، ئوقۇلۇۋاتقان بەتلەر تۈگىگەندە توختايدۇ (بىرنەچچە سېكۇنت)؛ «OCR توختىتىلدى — قىسمەن تېكىست ساقلاندى» چىقىدۇ، ئوقۇلغان بەتلەر ساقلانغان.
4. ئاندىن تولۇق بىر قېتىم ئوقۇتۇپ «قوشۇش» نى بېسىڭ، كىتابنى ئېچىپ تېكىستنى ئوقۇپ بېقىڭ ← بۇرۇنقىدەك ياخشى ئوقۇلغان (تېكىست بىر ئىشچى بىلەن ئوقۇغاندىكى بىلەن ھەرپمۇھەرپ ئوخشاش چىقتى).
5. ئىش تۈگىگەندە سىناق كىتابنى ئۆچۈرۈۋەتسىڭىز بولىدۇ (سىناق كۇتۇپخانىسى).

## Measurements

| What | Before | After | Where measured |
|---|---|---|---|
| `saveLibrary` of 40 unchanged books × 250,000 chars | 2,882 ms; every book written, the index rewritten | under the 250 ms bound; nothing written | `library-save-skips-unchanged-books`, Phases 0–1 |
| `saveLibrary` as `addToRecent` sent it, 100 books × 300,000 chars | (Cowork, Xeon 2.1 GHz: 4,680–4,920 ms, WAL grew to 83 MB) | **1.2–2.9 ms** over five saves; WAL 9.2 MB (all of it the 100 imports) | ELECTRON_RUN_AS_NODE script with the app's `database.js` + `library-sync.js`, this machine (16 logical cores), Phase 1 |
| Opening a book (`openReader` until the page is drawn), DEV library of 101 books, 100 × 300,000 chars, ten books | 7,658–9,497 ms (median ≈ 8,470 ms) | **11–21 ms** (median 15 ms) | `npm run dev` over the DevTools protocol, Phase 1 |
| Adding a small TXT book («قوشۇش» until the dialog closes), same library, three books | 8,077–8,664 ms | **10–38 ms** | the same, Phase 1 |
| `npm run check-package` | 3.6.0 build: FAIL (worker cannot find 9 packages directly — 12 with node-fetch's own; uncaught «Cannot find module 'node-fetch'») | rebuilt: OK, one page read by the built exe in 159 ms | Phase 2 |
| Offline OCR through the built app's IPC (two lines of Uyghur, 1400 × 360) | never answered (3.6.0) | **523 ms**, Uyghur text | built exe `--dev` over the DevTools protocol, Phase 2 |
| This machine | 13th Gen Intel Core i5-13400F, 16 logical cores, 31.9 GB | | for Phase 3's worker count |
| 10-page scanned PDF through the import's offline OCR | 102.2 s (Phase 2 build, 1 worker) | **22.1 s** (Phase 3 build, K = 4), text identical | built exe `--dev` over the DevTools protocol, Phase 3 |
| One picture, `ukij+uig`, through `ocr-recognize` | 523 ms (`ukij`, Phase 2) | 536 ms, one worker started | built exe, Phase 3 |

## Deferred

| Item | Why | When |
|---|---|---|
