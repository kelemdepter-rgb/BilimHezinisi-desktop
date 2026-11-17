# PROMPT 3.6.1 — كىتاب ئاستا ئېچىلىش ۋە PDF تېكىستكە ئايلانماسلىق مەسىلىسى (v3.6.1)

بۇ بۇيرۇق 3.6.0 دا بايقالغان ئىككى مەسىلىنى ئوڭشايدۇ. ئاخىرىدا نەشر **3.6.1** بولىدۇ.

## سەۋەبى نېمە (2026-11-16 دا تەكشۈرۈلدى، سىناق بىلەن ئىسپاتلاندى)

1. **كىتاب ئاستا ئېچىلىدۇ.** «ئوقۇش» نى باسقاندا دېتال «يېقىندا ئوقۇلغانلار» تىزىملىكىنى ساقلايمەن دەپ پۈتۈن
   كۇتۇپخانىنى ساقلايدۇ. ساقلىغاندا **ھەممە كىتابنىڭ پۈتۈن تېكىستىنى ئىزدەش كۆرسەتكۈچىگە قايتىدىن يازىدۇ**.
   بۇ ئىش تۈگىمىگۈچە كىتابنىڭ تېكىستى ئېچىلمايدۇ. 100 كىتابلىق كۇتۇپخانىدا ھەر قېتىم 4.8 سېكۇنت كېتىدۇ.
   كىتاب كۆپەيگەنسېرى ۋاقىتمۇ شۇنچە ئۇزىرايدۇ. 3.5 تىن باشلانغان. ئوڭشالغاندىن كېيىن 1-2 مىللىسېكۇنت بولىدۇ.
   كىتاب قوشقاندىن كېيىن دىئالوگنىڭ ئۇزاق تۇرۇپ قېلىشى، تېما ۋە خەتكۈچنىڭ ئاستا ساقلىنىشىمۇ شۇ سەۋەبتىن.
2. **PDF تېكىستكە ئايلانمايدۇ.** قاچىلانغان دېتالدا (Store، Setup، Portable) تورسىز OCR ماتورى ئۆزىگە
   لازىملىق بىرقانچە كىچىك بۆلەكنى تاپالماي ئېچىلالمايدۇ. شۇڭا «بەت 0 / N» دە مەڭگۈ ساقلىتىدۇ.
   `npm run dev` دا بۇ مەسىلە يوق، شۇڭا 3.6 نىڭ سىنىقىدا بايقالمىغان. خاتىرە دەپتىرىدە رەسىمدىن تېكىست ئېلىش ۋە
   PDF بەت كۆرۈنۈشىدىكى «قايتا OCR» مۇ شۇ سەۋەبتىن ئىشلىمەيدۇ. تېكىست قەۋىتى بار PDF لار نورمال ئوقۇلىدۇ.
3. **OCR ئاستا.** بىر بەتكە تەخمىنەن 9 سېكۇنت كېتىدۇ، چۈنكى كومپيۇتېرنىڭ پەقەت بىر يادروسىلا ئىشلىتىلىدۇ.
   ئىككى يادرو ئىشلەتسە ۋاقىت يېرىمىغا چۈشىدۇ.

## قانداق ئىشلىتىسىز

1. Claude Code نى دېتال قىسقۇچىدا ئېچىڭ:
   `E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc`
2. بىرىنچى قېتىم مۇنۇ بىر قۇرنى چاپلاڭ:

   ```
   Read prompts/3.6.1/PROMPT-3.6.1.md in full and execute it, starting with Phase 0.
   ```

3. Claude Code ھەر باسقۇچتىن كېيىن **توختايدۇ** ۋە نېمىنى سىناشنى ئۇيغۇرچە ئېيتىدۇ. جايىدا بولسا
   **«داۋاملاشتۇر»** دەڭ؛ مەسىلە بولسا رەسىمى بىلەن ئېيتىڭ.
4. يېڭى تۈردە داۋاملاشتۇرماقچى بولسىڭىز مۇنۇنى چاپلاڭ:

   ```
   Read prompts/3.6.1/PROMPT-3.6.1.md in full, then prompts/3.6.1/PROGRESS.md, and continue with the next unfinished phase.
   ```

5. بىر ۋاقىتتا **بىرلا** Claude Code تۈرى ئىشلىسۇن.

## باسقۇچلار

| باسقۇچ | نېمە قىلىنىدۇ | سىز سىنايدىغىنى |
|---|---|---|
| 0 | تەييارلىق؛ خاتالىقلارنى سىناق بىلەن ئىسپاتلاش | ھېچنېمە |
| 1 | كىتاب دەرھال ئېچىلىدۇ؛ كىتاب قوشقاندا دىئالوگ دەرھال يېپىلىدۇ | `npm run dev` دا بىرقانچە كىتابنى ئېچىش، بىر كىتاب قوشۇش |
| 2 | قاچىلانغان دېتالدا OCR قايتا ئىشلەيدۇ؛ خاتالىق بولسا مەڭگۈ ساقلاتماي سەۋەبىنى ئېيتىدۇ | ياسالغان exe دا (`--dev` بىلەن) سىكان PDF ئەكىرىش، خاتىرە دەپتىرىدە رەسىمدىن تېكىست ئېلىش |
| 3 | OCR تېزلىشىدۇ (بىرقانچە يادرو)؛ قالغان ۋاقىت كۆرسىتىلىدۇ | 10 بەتلىك سىكان PDF نى ۋاقىت ئۆلچەپ ئەكىرىش |
| 4 | نەشر 3.6.1، exe ياساش ۋە ئۇنى تەكشۈرۈش | ياسالغان exe دا ئاخىرقى سىناق، ئاندىن Store (bilim-store-release) |

**مۇھىم:** ئىككىنچى مەسىلە پەقەت **ياسالغان** دېتالدا كۆرۈلىدۇ، شۇڭا 2- ۋە 4-باسقۇچنىڭ سىنىقى
`dist\win-unpacked\Bilim Hezinisi.exe --dev` دا بولىدۇ (`--dev` سىناق كۇتۇپخانىسىنى ئاچىدۇ، ئەسلى كۇتۇپخانىڭىزغا
تەگمەيدۇ).

**بۇ نەشرگە كىرمەيدىغانلار:** Electron نى يېڭىلاش؛ OCR نىڭ توغرىلىقىنى ئۆزگەرتىش (رەسىم سۈپىتى، تىل مودېللىرى)؛
Gemini OCR؛ ئىزدەش نەتىجىسىدىن كىتاب ئېچىش (ئۆلچەندى: 3 مىليون ھەرپلىك كىتابمۇ 0.6 سېكۇنتتا ئېچىلىدۇ — نورمال).

---

# Bilim Hezinisi desktop — v3.6.1 work order: books open at once, OCR answers in the installed app

You are working on an existing, published Electron app. The owner is not a programmer and speaks
Uyghur. **Talk to the owner in Uyghur. Code, comments, commit messages and file contents stay in
English** (UI strings stay Uyghur, Arabic script).

## 0. Read before anything else

1. `CLAUDE.md` — the project rules, including «Library data safety (3.5)», «Reader, Qur'an and search
   (3.5)» and the «3.6» sections («PDF import (Phase 2)» describes the OCR engine options). It wins over
   this file where they conflict; if a conflict matters, stop and ask.
2. `prompts/3.6.1/PROGRESS.md` — if it exists, it tells you which phase is next.
3. `prompts/3.6/PROGRESS.md` — Phase 2 there (the OCR engine fix, verified in the dev app only) and
   the «Measurements» table.

The owner reported (2026-11-16, translated): "When I press «ئوقۇش» to open a book, it opens very
slowly — find out why and make it fast, thinking it through from every side. PDF books cannot be
imported: even a PDF of a few pages is not turned into text for a long time; it made me wait very long."

## 1. Evidence (Cowork, 2026-11-16 — reproduced, not guessed)

### A. Why a book opens slowly — every save re-indexes the whole library

`openReader()` → `addToRecent(id)` → `saveData()` → IPC `save-library` → `librarySync.saveLibrary` →
`database.syncBooks(S.books)` → `upsertBook()` **for every book** → `DELETE FROM book_fts WHERE rowid=?`,
`getBookContent(id)` (the LRU holds 20 books, so most are read from SQLite), `INSERT INTO book_fts
(… content)`. FTS5 re-tokenizes the full text of every book in the library, synchronously, in the main
process. `load-book-content`, sent right after, waits behind it: the main thread serves one IPC at a
time and better-sqlite3 is synchronous.

Why it is new: before migration step 5 (3.5) `book_fts` was declared with `content_rowid='book_id'`
and no content table, so the `DELETE` threw at once and the catch skipped the re-index. Step 5 built
the index correctly, and since then the re-index really runs on every `saveData()`. It grows with
the library (3.6's website downloads make libraries larger).

Measured with the app's own `database.js` + `library-sync.js` (better-sqlite3, Node 22, Xeon 2.1 GHz),
books of 300,000 characters of real Uyghur vocabulary:

| Library | `save-library` as `addToRecent` sends it | With `upsertBook` writing only what changed |
|---|---|---|
| 20 books (6 M chars) | 870–980 ms | — |
| 100 books (30 M chars) | **4,680–4,920 ms** (WAL grew to 83 MB) | **1–2 ms** (WAL 6 MB) |

Every other `saveData()` caller pays the same: the add-book dialog (`addBook()` awaits `saveData()`
before `hideAdd()`, so the dialog stays open), edit book, theme toggle, bookmarks and in-book notes,
categories.

Not the cause (measured in Chromium with the reader's own functions): drawing one page 3–12 ms; the
whole book in search mode 131 ms (0.3 M chars), 208 ms (1 M), 575 ms (3 M). Content IPC for a book
from SQLite: ≈3 ms. Leave those alone.

### B. Why a scanned PDF never becomes text — the OCR worker cannot load in the installed app

`main.js` starts tesseract.js with `workerPath` = `unpackedPath(require.resolve('tesseract.js/src/
worker-script/node/index.js'))`, i.e. `resources/app.asar.unpacked/node_modules/tesseract.js/…`.
That worker's first lines `require('node-fetch')`, then `regenerator-runtime`, `is-url`, `is-electron`,
`wasm-feature-detect`, … Those live only in `app.asar/node_modules`: `build.asarUnpack` unpacks
`better-sqlite3`, `tesseract.js`, `tesseract.js-core` and `assets/ocr`, nothing else (confirmed in the
3.6.0 build: `dist/win-unpacked/resources/app.asar.unpacked/node_modules` holds exactly those three).
Node's resolution from `app.asar.unpacked/…` walks up through `app.asar.unpacked/node_modules` and
never reaches the sibling `app.asar/node_modules`. The worker thread dies; tesseract.js sets
`worker.onerror`, which a Node `Worker` ignores, so the `'error'` event becomes an uncaught exception
in the main process (Electron's «A JavaScript error occurred in the main process» box), and
`ocr-recognize` never answers. The import dialog shows «UKIJ OCR: بەت 0 / N» for ever.

Reproduced in **Electron 28.3.3** with a minimal app that starts the engine exactly as `main.js`
does (same `unpackedPath`, `ocrEngine.workerOptions`, `createWorker('ukij', 1, …)`), packed with
`@electron/asar` using this app's unpack rules:

| Layout | Result |
|---|---|
| Source folder (= `npm run dev`) | answered, 10.6 s for one A4 page |
| Packed like 3.6.0 (`tesseract.js`, `tesseract.js-core`, `assets/ocr` unpacked) | `Cannot find module 'node-fetch'` in the main process; **no answer in 60 s** |
| Packed with the worker's dependencies unpacked too | **answered, 10.7 s** |
| Worker run from inside `app.asar` instead | «Only absolute URLs are supported»; no answer — not an option |

3.6 Phase 2 verified the OCR fix in `npm run dev` only, where everything resolves. Every offline OCR
in the installed app is affected: the scanned-PDF import (`startPdfOcr`), the notebook's image OCR
(`src/notes.js` ≈ line 3088), and the PDF page view's «بۇ بەتنى قايتا OCR قىلىش» (`src/index.html`
≈ line 2420). Text-layer PDFs are not affected: a 200-page text PDF read through `PdfText.extract`
from a packed `app.asar` in Electron 28 took 334 ms with the real pdf.js worker.

The dependency closure of tesseract.js 5.1.1 as npm installs it (verify on Windows with
`npm ls --omit=dev --all tesseract.js`): `node-fetch` (+ `whatwg-url`, `tr46`,
`webidl-conversions`), `regenerator-runtime`, `is-url`, `is-electron`, `wasm-feature-detect`,
`bmp-js`, `zlibjs`, `idb-keyval` (`opencollective-postinstall` is a postinstall helper, not needed
at run time). Together ≈ 5 MB unpacked (`zlibjs` 3.7 MB).

### C. How fast the offline OCR is

tesseract.js 5.1.1 in Node, the app's worker options, `ukij`, OEM 1, PSM 3, an A4 page of Uyghur
(UKIJ Tuz Tom, 12.5 pt) binarized exactly like `binarizeCanvas`:

| What | Time |
|---|---|
| Engine start (`createWorker` + model) | ≈ 0.25 s |
| One page, `ukij`, render scale 3.2 / 2.5 / 2.0 | 8.8 s / 8.8 s / 8.8 s (the scale does not change recognition time) |
| One page, `ukij+uig` | 10.6 s |
| 4 pages, 1 worker | 31.9 s (8.0 s a page) |
| 4 pages, 2 workers (`createScheduler`) | **16.9 s (4.2 s a page)**, ≈ +100 MB memory per extra worker |

The test machine had 2 cores; the owner's PC very likely has more. The renderer today renders five
pages, sends them, and waits; one worker does all the work, and the first progress line appears only
after the first page is recognized.

## 2. Working method (every phase)

- **Branch** `release/3.6.1`, created in Phase 0 from `main`. Merge to `main` only in Phase 4.
- **One logical change per commit**, conventional English messages. Never commit `dist/`,
  `node_modules/`, `*.appx`. CRLF in every file you edit or create; check `git diff --stat` that
  nothing was rewritten whole.
- **Tests first.** For every bug: a test that FAILS on today's code (record the red message), then the
  fix, then PASS. `npm test` green at the end of every phase. Never weaken or delete a test.
- **Measure, don't assume.** Before/after numbers go into `prompts/3.6.1/PROGRESS.md`; a number that
  becomes a rule goes into `CLAUDE.md`.
- **Library safety (K4) stays:** a book is deleted only by `db-delete-book`; `syncBooks` never deletes;
  a part that did not load is never written back. No schema change is needed — if you find you need
  one, stop and ask.
- **No new runtime dependency.** tesseract.js's scheduler is already in tesseract.js.
- **Never touch:** `build.appx` values, `JamiyKutupxana`, the Qur'an texts and their attribution, the
  licensed-font rules, the renderer CSP. **Never break a working feature** — stop, explain in Uyghur,
  ask.
- **End of every phase:** `npm test` green → update `PROGRESS.md` → a short Uyghur checklist for the
  owner with the expected result of each step → **stop** and wait for «داۋاملاشتۇر» (Phase 0
  continues straight into Phase 1).

---

## Phase 0 — Groundwork

1. `git status`, `git log --oneline -5`. Expected: `main` at `8af6a5e` (the AI-model merge) or later.
   Untracked files under `prompts/` are the owner's: commit only `prompts/3.6.1/` as the first commit
   on the new branch (`docs: add the 3.6.1 work order`); leave the rest alone. Anything else you did
   not make → stop and ask.
2. `git switch -c release/3.6.1`. `npm test` must be green before anything changes.
3. Create `prompts/3.6.1/PROGRESS.md` (phases 0–4: status, commits, tests; «Measurements»; «Deferred»).
4. Write the red tests of Phases 1 and 2 now (listed there), run them, record each red message. Commit
   them only together with their fixes (or mark them as expected failures in one commit if the runner
   supports it — do not leave `npm test` red on a commit).

Continue into Phase 1.

---

## Phase 1 — A book opens at once

### What to build

1. **`upsertBook` writes only what changed** (`database.js`). Fold the incoming title, author and
   description with `letters()` as today; read the stored `title, author, category, format, date,
   description` (NULL as `''`). If all six are equal: write nothing — no `UPDATE`, no `updated_at`
   change, no index work. If something differs: `UPDATE` as today; rewrite the `book_fts` row only
   when the title or the author changed (the content did not). A book not in the table: insert as
   today. Return whether anything was written. `syncBooks` stays one transaction and never deletes.
2. **Opening a book sends no library.** `addToRecent()` no longer calls `saveData()`. It writes one
   row through a targeted IPC. The existing `db-add-recent` stores `datetime('now')`
   (`YYYY-MM-DD HH:MM:SS`), while `syncRecent` stores the renderer's ISO time
   (`YYYY-MM-DDTHH:MM:SS.sssZ`); the two formats do not sort together (`' '` < `'T'`). So the
   targeted write takes the renderer's ISO time (extend `addRecentRead(bookId, time)` or add a new
   function — one way, not two), keeps at most 20 rows, and `S.recent` stays as it is in memory.
3. **`openReader` asks for the text first.** `loadBookContent` and `dbGetProgress` are sent together
   (`Promise.all`) before anything else that waits on main; the recent-list write is fire-and-forget
   after them. The rest of `openReader` is unchanged (places, search marks, panels, AI gate).
4. Nothing else changes in `saveData()` or its callers; they get fast through item 1. Measure the
   add-book dialog: from «قوشۇش» to the dialog closing.

### Tests (red first)

- `library-save-skips-unchanged-books` (main suite, temp library, e.g. 40 books × 250,000 chars):
  load, then `saveLibrary` with what was loaded → every book's `updated_at` unchanged and the index
  untouched (deterministic: `SELECT MAX(id) FROM book_fts_data` unchanged — checked in Cowork: one save
  of 5 unchanged books moves it today and leaves it with the change), and the call under a generous
  bound (e.g. 250 ms; record today's time in the red message).
- `library-save-title-change-reindexes`: one title changed through `saveLibrary` → the search finds the
  new title, not the old one, and the book's text is still found.
- `recent-one-row-in-order`: the targeted write puts the book first, in the same time format as
  `syncRecent`, at most 20 rows, and a later `syncRecent` keeps the order.
- `open-book-sends-no-library` (static check, like `tests/main/static-checks.js`): `addToRecent` does
  not call `saveData`.
- The K4 suites (`library-safety`, …) stay green.

### Measure (dev app, DEV library only)

Put ≥ 100 generated books of ≈ 300,000 characters into `JamiyKutupxana-DEV` (remove them afterwards,
as 3.6 did). Before and after: time from the «ئوقۇش» click to the text on screen, and from «قوشۇش» to
the add dialog closing. Record both in `PROGRESS.md`.

### Owner's checklist (Uyghur, at the stop)

`npm run dev` → several books opened one after another (each at once, at its last place); a bookmark
added and removed; the theme switched; one small TXT book added (the dialog closes at once, the book is
found by its title in search); the app closed and opened again (the recent list is in the right order).

---

## Phase 2 — The offline OCR answers in the installed app

### What to build

1. **`build.asarUnpack`** gets the OCR worker's run-time dependency closure (section 1B; take the list
   from `npm ls` on this machine). Nothing in `build.appx` changes.
2. **A test keeps that list complete:** `ocr-worker-dependencies-unpacked` (main suite, static) walks
   tesseract.js's production `dependencies` recursively through `node_modules/*/package.json` and
   checks that each installed one is matched by an `asarUnpack` pattern. Red today: «node-fetch,
   regenerator-runtime, … are not unpacked».
3. **The engine never waits for ever** (`ocr-engine.js` + `main.js`):
   - before `createWorker`, check that every dependency the worker script needs resolves from the
     worker's own folder (`Module.createRequire(workerPath).resolve(name)`); if one does not, answer
     `{ success: false, error: 'OCR ماتورى قوزغالمىدى: «' + name + '» تېپىلمىدى.' }` (keep it short;
     the module name is for a bug report);
   - a start timeout (60 s) on engine start: on expiry, terminate what was started and answer with
     an error in the same style. No global `uncaughtException` handler.
   - Test `ocr-engine-unpacked-layout` in the test runner's Electron main process: copy **only**
     `node_modules/tesseract.js` into a temp folder's `node_modules/`, and start the engine with that
     worker script — the 3.6.0 layout. Red today: no answer within 30 s (the runner must not hang:
     race the call against a timer). After: an error answer within a few seconds.
     `ocr-engine-answers` stays green.
4. **The import dialog says what happened and lets the owner try again.** Today, when `ocr-recognize`
   fails, `startPdfOcr` toasts the error, then «OCR دىن تېكىست چىقمىدى», and hides the OCR offer — no
   way to retry. Instead: the error stays visible in the OCR box, the engine buttons come back, and
   pages already read are kept. The notebook image OCR and the page view's re-OCR show the error with
   `toast()` as they do now — check they do.
5. **`scripts/check-package.js`, `npm run check-package`** — run after `npm run dist-win`, before any
   Store package. On `dist/win-unpacked/resources`:
   - the four models (`ukij`, `uig`, `eng`, `tur`) in `app.asar.unpacked/assets/ocr/tessdata`;
   - the worker script in `app.asar.unpacked/node_modules/tesseract.js/…`, and every dependency it
     needs resolves from there (`createRequire`);
   - a real one-page OCR with the **built** engine: run `dist/win-unpacked/Bilim Hezinisi.exe` with
     `ELECTRON_RUN_AS_NODE=1` on a small script that starts the engine exactly like `main.js` (paths
     inside `resources/app.asar`, worker and models from `app.asar.unpacked`) and reads a generated
     PNG (reuse `barPng` from `tests/main/ocr-engine.js` or a generated text image), with a timeout.
   - Prints OK or what is missing; exit code 1 on any failure.
   **Run it on the existing 3.6.0 `dist/win-unpacked` first — it must FAIL** (record the message);
   then rebuild (`npm run dist-win`) and it must pass.
6. `BUILD-GUIDE.md` and `CLAUDE.md` (build steps): `npm run check-package` after every `dist-win`;
   OCR is checked in the BUILT app, not only in `npm run dev`.

### Owner's checklist (Uyghur, at the stop)

The owner runs `npm run dist-win`, then `npm run check-package` (OK), then
`"dist\win-unpacked\Bilim Hezinisi.exe" --dev` (the DEV library): a scanned PDF of 2–3 pages → «UKIJ OCR
(تورسىز)» → the pages are read and the text appears; in the notebook the camera button «رەسىمدىن تېكىست
(OCR، تورسىز)» with a picture of text → the text appears in the note; a PDF book's page view → «بۇ بەتنى
قايتا OCR قىلىش (تورسىز)» fills the preview. Give him the exact commands.

---

## Phase 3 — OCR uses more than one core

### What to build

1. **One engine per OCR run, K workers** (main): tesseract.js `createScheduler` with
   K = min(4, max(1, cpu cores − 1)), and K ≤ 2 when total memory is under 8 GB (≈ 100 MB per extra
   worker, measured). Started once for a run, ended when the run finishes or is cancelled, when the
   import dialog or the window closes, and after one idle minute. `ocr-recognize` keeps its shape for
   every caller (PDF import, notebook image, page view): the images it receives are recognized in
   parallel and returned in their order. The start guard and timeout of Phase 2 apply to every worker.
2. **The renderer keeps the workers busy:** it renders the next pages while the current ones are being
   recognized, with at most about 2×K page images held at once (each a PNG data URL). Pages come back
   in page order; an empty page keeps its empty entry (the page map needs one entry per page).
3. **Progress the owner can trust:** «ماتور قوزغىلىۋاتىدۇ…» until the first page; then «بەت 7 / 40»; once
   two pages are done, «تەخمىنەن 3 مىنۇت قالدى», updated as it goes (minutes, rounded; «1 مىنۇتتىن ئاز»
   under a minute).
4. **Cancel** stops the scheduler's queued jobs at once and keeps every finished page, as today.
5. **Unchanged:** render scale 3.2 and `binarizeCanvas` (accuracy), `ukij` as the default and the
   language checkboxes, `PdfText.OCR_MAX_PAGES` (300) and its messages, the joins
   (`PdfText.joinPages`, `'\n\n'`, trimmed) and the page ranges, Gemini OCR.

### Tests

- `ocr-scheduler-keeps-page-order` (main, real engine, 3 small generated images of different content):
  results in input order; K reported; the engine ended afterwards.
- `ocr-cancel-keeps-finished-pages`.
- A renderer test that the pipeline sends every page once, in order, with an empty page kept (fake
  `window.electron.ocrRecognize` that answers out of order and with delays).

### Measure

A scanned PDF of about 10 pages (ask the owner for one of his, or generate one by rendering a Uyghur
text page to an image-only PDF): wall time before (Phase 2 build) and after, the K used, and the
machine's core count, in `PROGRESS.md`. Check the text is the same as with one worker.

### Owner's checklist (Uyghur, at the stop)

`npm run dev`: the same 10-page scanned PDF — the time, the estimate line, cancel in the middle (the
pages read so far are kept), then a full run; the text reads as well as before.

---

## Phase 4 — Release 3.6.1 (no publishing)

1. `npm test` and the syntax gate — all green.
2. `npm version 3.6.1 --no-git-tag-version`. `build.appx` byte-identical to `main`.
3. `RELEASE-NOTES-v3.6.1.md` (untracked, like 3.6.0's): Uyghur first, then English — books open at
   once; the offline OCR works again in the installed app (the PDF import, the notebook picture, the
   page view); OCR faster on computers with several cores; the time left is shown. The Partner Center
   «What's new in this version» text in English and in Uyghur, **each ≤ 1,500 characters** — print the
   counts.
4. `CLAUDE.md`: the rules this release makes —
   - `syncBooks` writes a book only when its fields changed; the index of a book is rewritten only when
     its title, author or text changes; opening a book never sends the library;
   - `build.asarUnpack` covers the OCR worker's whole dependency closure (a test keeps it so);
     `npm run check-package` after every `dist-win`; OCR is checked in the built app;
   - OCR runs K workers (the rule for K), one engine per run.
5. The owner's final check (give him the exact commands): `npm run fetch-ocr-models` if the models are
   missing → `npm run dist-win` → `npm run check-package` (OK) →
   `"dist\win-unpacked\Bilim Hezinisi.exe" --dev` (book opening, add book, scanned PDF) → then once
   `npm start` on the real library (open several books; nothing else).
6. Update `PROGRESS.md`, merge `release/3.6.1` into `main`. **Do not tag, do not push, do not build the
   Store package** — that is the owner's step with the Cowork skill **bilim-store-release** (which must
   also run `npm run check-package` on the Store build's unpacked folder).
7. Final report in Uyghur: what changed, the before/after numbers, and the next step.

## Out of scope for 3.6.1 (do not start these)

The Electron upgrade; OCR accuracy (scale, binarization, models, `ukij+uig` defaults); Gemini OCR and
its page map; drawing a whole book in search mode (measured fine); the FTS index's own layout (no
`optimize`, no schema change); anything in the web edition. If one becomes necessary, stop and ask.
