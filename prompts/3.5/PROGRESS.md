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
| 1 | Notebook: nothing written may be damaged or lost (owner's bugs 1–2, K1, K2, K3, K7) | in progress | — | — |
| 2 | Library safety: K4, K6, K18 + backup/restore | not started | — | — |
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

## Measurements

Anything the audit or the web edition measured in another engine has to be
re-measured in Electron 28 (Chromium 120) before the code relies on it. What is
confirmed here goes into `CLAUDE.md`.

| What | Result | Where measured |
|---|---|---|
| `CSS.highlights` / `Highlight` | present and paints Ranges; `CSS.highlights.clear()` works | `npm test`, Phase 0 |
| `document.caretRangeFromPoint` | present (`caretPositionFromPoint` is not) — the spellchecker's hit test works | `npm test`, Phase 0 |
| `document.execCommand('insertText' / 'insertParagraph' / 'insertLineBreak')` | all work in a hidden `BrowserWindow`, with layout and `getClientRects` | `npm test`, Phase 0 |
| `removeFormat` keeps `<a>`, `<br>`, blocks, data attributes? | **not yet measured** — Phase 1.2 must, before relying on it | — |
| `formatBlock div` / `outdent` to leave a quote | **not yet measured** — Phase 3.2 | — |

## Deferred

| Item | Why | When |
|---|---|---|
| — | | |

Out of scope for 3.5 (do not start): K14 Electron upgrade, K16/W22 Markdown
rendering and in-book links, W15 notebook page typography, W19 quote image,
W21 on-screen keyboard, W23 browse by author.
