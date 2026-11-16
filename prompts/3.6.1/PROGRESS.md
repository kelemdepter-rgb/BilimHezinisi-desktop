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
| 1 | A book opens at once; the add-book dialog closes at once | in progress | | |
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

## Measurements

| What | Before | After | Where measured |
|---|---|---|---|
| `saveLibrary` of 40 unchanged books × 250,000 chars | 2,882 ms; every book written, the index rewritten | | `library-save-skips-unchanged-books` (red run), Phase 0 |

## Deferred

| Item | Why | When |
|---|---|---|
