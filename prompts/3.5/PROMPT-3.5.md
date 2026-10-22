# PROMPT 3.5 — كومپيۇتېر نەشرى: خاتالىقلارنى ئوڭشاش ۋە يېڭى ئىقتىدارلار (v3.5.0)

**مەنبەسى:** `AUDIT-2026-10-22.md` (دېتال قىسقۇچىنىڭ يىلتىزىدا). بۇ بۇيرۇق شۇ دوكلاتتىكى خاتالىقلارنى
ئوڭشايدۇ، تور نەشرىدىن تاللانغان ئىقتىدارلارنى كۆچۈرۈپ كېلىدۇ، ئاخىرىدا نەشرنى **3.5.0** قىلىدۇ.

## قانداق ئىشلىتىسىز

1. Claude Code نى دېتال قىسقۇچىدا ئېچىڭ:
   `E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc`
2. بىرىنچى قېتىم مۇنۇ بىر قۇرنى چاپلاڭ:

   ```
   Read prompts/3.5/PROMPT-3.5.md in full and execute it, starting with Phase 0.
   ```

3. Claude Code ھەر باسقۇچ تۈگىگەندە **توختايدۇ** ۋە سىزگە ئۇيغۇرچە «نېمىنى سىناش كېرەك» دېگەن
   تىزىملىكنى بېرىدۇ. `npm run dev` بىلەن سىناڭ (ئەسلى كۇتۇپخانىڭىزغا تەگمەيدۇ). ھەممىسى جايىدا بولسا
   **«داۋاملاشتۇر»** دەڭ. مەسىلە بولسا رەسىمى بىلەن ئېيتىڭ.
4. تۈر ئۇزۇن بولۇپ كەتسە ياكى ئەتىسى داۋاملاشتۇرماقچى بولسىڭىز، **يېڭى تۈر** ئېچىپ مۇنۇنى چاپلاڭ:

   ```
   Read prompts/3.5/PROMPT-3.5.md in full, then prompts/3.5/PROGRESS.md, and continue with the next unfinished phase.
   ```

5. بىر ۋاقىتتا **بىرلا** Claude Code تۈرى ئىشلىسۇن.

## باسقۇچلار

| باسقۇچ | نېمە قىلىنىدۇ | سىز سىنايدىغىنى |
|---|---|---|
| 0 | تەييارلىق: ئايرىم شاخ (branch)، ئاپتوماتىك سىناق (`npm test`)، CLAUDE.md قائىدىلىرى | ھېچنېمە — Claude Code ئۆزى 1-باسقۇچقا ئۆتىدۇ |
| 1 | خاتىرە دەپتىرى: ئىملا چېگرىسى، فورمات سۈپۈرگىسى، «ھەممىنى ئالماشتۇرۇش»، مەنبە بەلگىسى، ساقلاش، يوشۇرۇن ئۇچۇرلار | Enter + ئىملا، سۈپۈرگە، ئالماشتۇرۇش، قۇرئانغا بېرىپ قايتىش |
| 2 | كۇتۇپخانا بىخەتەرلىكى: كىتاب ئۆچۈرۈلۈش خەۋىپى، **زاپاسلاش / ئەسلىگە كەلتۈرۈش**، تازىلىغۇچ، بىخەتەرلىك | زاپاسلاش، كىتاب ئۆچۈرۈش |
| 3 | ئىلگىرىكى نۇسخىلار، ماۋزۇ / نەقىل / ئادەتتىكى تېكىست، مۇندەرىجە، يېنىۋېلىش كۇنۇپكىلىرى | نۇسخا ئەسلىگە قايتۇرۇش، ماۋزۇ |
| 4 | چىقىرىش: فورماتلىق Word، PDF، Markdown، TXT | Word ھۆججىتىنى ئېچىپ رەسىمىنى ئەۋەتىش |
| 5 | ئەخلەت ساندۇقى، مىقلاش، مەزمۇندىن ئىزدەش؛ ئىملا خاتالىقلىرىنى بىر-بىرلەپ كۆرۈش، شەخسىي لۇغەت | ئۆچۈرۈپ قايتۇرۇش، لۇغەت تاختىسى |
| 6 | مەنبە ئۇلىنىشى، قولدا مەنبە ئىزدەش، فورماتنى بۇزمايدىغان AI تۈزىتىشى | مەنبە قىستۇرۇپ «ئېچىش»، AI تۈزىتىش |
| 7 | ئوقۇغۇچ خەتكۈچى (بەت بىلەن)، قۇرئان خەتكۈچى، شەكىل ھەرپلىرى، ئىزدەش تارىخىنى تازىلاش | خەتكۈچ، قۇرئان خەتكۈچى |
| 8 | نەشر 3.5.0: سىناق، نەشر خاتىرىسى، Store «What's new» تېكىستى | Store غا يوللاش (bilim-store-release) |

**بۇ نەشرگە كىرمەيدىغانلار (3.6 دىن كېيىن):** Electron نى يېڭىلاش، كىتابتىكى Markdown / ئۇلانمىلار،
نەقىل رەسىمى، ئېكران كۇنۇپكا تاختىسى، ئاپتور بويىچە كۆرۈش، خاتىرە بېتىنىڭ ئومۇمىي خەت تەڭشىكى.

---

# Bilim Hezinisi desktop — v3.5.0 work order

You are working on an existing, published Electron app. The owner is not a programmer and speaks
Uyghur. **Talk to the owner in Uyghur. Code, comments, commit messages and file contents stay in
English** (UI strings stay Uyghur, Arabic script).

## 0. Read before anything else

Read these in full before Phase 0, and again at the start of every new session:

1. `CLAUDE.md` — project rules. It wins over this file where they conflict; if a conflict matters,
   stop and ask.
2. `AUDIT-2026-10-22.md` — the findings this work order fixes. IDs used below (K1…K19, W1…W23)
   come from it. Each finding has evidence and file/line references (line numbers are as of commit
   `42356e3`; they will drift — find the code by name).
3. `prompts/3.5/PROGRESS.md` — if it exists, it tells you which phase is next.
4. The reproduction scripts the audit used: `prompts/3.5/repro/` (Playwright + Chromium 141,
   reference only — port the cases into this repo's own runner, do not add Playwright).

**The web edition is a reference you may read, never modify:**
`E:\ditallar\men yasigan ditallar\BilimHezinisi-website\`. Many fixes below were already made and
measured there; the exact files are named in each item. Port the *logic and the reasons*, rewritten
as plain JavaScript in this repo's style (CommonJS in the main process; IIFE modules on `window` in
the renderer). Do not run the web project's scripts and do not copy its TypeScript, React or
Supabase code. Cite the source file in a short comment where you port something.

## 1. Working method (every phase)

- **Branch.** All work happens on `release/3.5`, created in Phase 0 from `main`. Merge to `main`
  only in Phase 8.
- **One logical change per commit**, conventional English messages (`fix(notes): …`,
  `feat(reader): …`, `test: …`, `docs: …`). Never commit `dist/`, `node_modules/`, `*.appx`.
- **Line endings:** the working tree uses CRLF (git stores LF). Keep CRLF in every file you edit or
  create; check with `git diff --stat` that a change did not rewrite whole files.
- **Syntax gate:** `node --check` every changed `.js` file. For `src/index.html`, extract the inline
  `<script>` blocks to a temp file and `node --check` them. The app runs from source — a syntax error
  ships as a crash.
- **Tests first for every bug.** From Phase 0 on, `npm test` runs the repo's own runner. For each
  bug: write the test, see it FAIL on the current code, fix, see it PASS. Record both in
  `prompts/3.5/PROGRESS.md`. Never weaken or delete a test to make it pass.
- **Real engine.** Tests run inside Electron 28 (Chromium 120) — the engine the app ships with.
  When a rule below says "measured in Chromium 141" (the audit) or "in Chromium 151 / Firefox / WebKit"
  (the web edition), re-measure in Electron 28 before relying on it, and write the result into
  `CLAUDE.md`.
- **Safe manual testing:** `npm run dev` uses `%USERPROFILE%\JamiyKutupxana-DEV`. Never test risky
  changes with `npm start`.
- **Database changes are additive only** (new tables, new columns). Never drop, rename or rewrite
  user data except where an item below says so explicitly, and then only after a backup.
- **Nothing new on the network.** Renderer CSP stays `connect-src 'self'`. No new runtime
  dependency is expected (`docx`, `turndown`, `dompurify`, `better-sqlite3` are already here). If
  you believe one is needed, stop and ask.
- **User-facing text:** Uyghur, short, calm. Use the existing `toast(msg, type)`; never
  `window.prompt()` (Electron does not implement it). Do not add new `confirm()` calls in the
  renderer — use an inline confirmation in the UI. Native dialogs are acceptable only in the main
  process for app-level decisions (closing with unsaved work, restoring a backup).
- **Never touch:** `build.appx` values in `package.json`, the data folder name `JamiyKutupxana`,
  the Qur'an texts and their attribution, the licensed-font rules in `CLAUDE.md`.
- **Never break a working feature to satisfy this document.** If an item conflicts with reality
  (the code moved, a measurement disagrees, a fix would remove something the owner uses), stop,
  explain in Uyghur, and ask.
- **End of every phase:**
  1. `npm test` green, syntax gate green.
  2. Update `prompts/3.5/PROGRESS.md`: phase status, commits (hash + subject), tests added, anything
     deferred and why.
  3. Give the owner a short Uyghur checklist of what to try in `npm run dev`, with the expected
     result for each step.
  4. **Stop and wait** for «داۋاملاشتۇر». (Phase 0 is the exception: continue into Phase 1.)
- **Long sessions:** if your context is getting long, finish the current item, commit, update
  `PROGRESS.md`, and tell the owner in Uyghur to open a new session with the resume line from the
  top of this file. Never leave the tree half-edited.

---

## Phase 0 — Groundwork (no behaviour change)

**0.1 Preflight.** `git status`, `git log --oneline -10`. Expected: on `main`, in sync with
`origin/main` at `42356e3` (v3.2.0).
- `package.json`/`package-lock.json` changes you did not make: run `git diff --stat` and
  inspect. If `package-lock.json` changes only lockfile metadata (no resolved version of any
  package changes), restore it with `git checkout -- package-lock.json`. If any resolved version
  changed, **stop and ask** in Uyghur.
- Untracked `AUDIT-2026-10-22.md` and `prompts/3.5/` are the planning files for this work: commit
  them as the first commit on the new branch (0.2) as `docs: add the 3.5 audit and work order`.
  Leave any other untracked file alone.

**0.2 Branch.** `git switch -c release/3.5`.

**0.3 Test runner (`npm test`).** Create `tests/` (it is outside `build.files`, so it is never
packaged — verify that in `package.json`):
- `tests/run.js` — an **Electron main-process** script. It (a) runs the main-process suites
  directly (they can `require` `better-sqlite3`, which is built for Electron's ABI) against a fresh
  temp directory — never the real or the DEV library; (b) opens `tests/notebook/harness.html` in a
  hidden `BrowserWindow` and runs the renderer suites through `webContents.executeJavaScript`;
  (c) prints one line per test (`PASS`/`FAIL name — detail`) and exits with code 1 on any failure.
- `tests/notebook/harness.html` loads the **real** files, unchanged: `../../src/notes.css`,
  `../../assets/vendor/purify.min.js`, `../../src/sanitize.js`, `../../src/spellcheck.js`,
  `../../src/notes.js` (and later the new modules this work adds). Before them, a small script
  provides what `index.html` normally provides: `window.icon`, `window.toast` (records messages),
  `window.S` with `notes`, `books`, `quran`, a `#side`, `#main`, `#toast`; a fake `window.electron`
  with an in-memory note store (with a switch to make saves fail), a fake spell engine (a set of
  known words; any other Arabic-script token is reported with its offsets, exactly as the real
  `spellCheck(text)` contract returns), a fake `spellSuggest`, a fake `NGram`.
- Drive editing the way the UI does: `document.execCommand('insertText' | 'insertParagraph'
  (= Enter) | 'insertLineBreak' (= Shift+Enter))`, Range selections, and dispatched
  `mousedown`/`mouseup` events with real coordinates (the spellchecker hit-tests with
  `caretRangeFromPoint`). Assert on the DOM and on what was saved.
- `package.json` → `"test": "electron tests/run.js"`.

Port these cases from `prompts/3.5/repro/` and the audit. **Every one must FAIL now** — paste the
failure lines into `PROGRESS.md`:

| Test | Asserts |
|---|---|
| `spell-enter` | Two correct words separated by Enter are not underlined; the text the engine receives has a line separator between them |
| `spell-shift-enter` | Same with Shift+Enter (`<br>`) |
| `spell-correction-scope` | Accepting a suggestion changes only that word; a mark whose range would cross a block boundary is refused and nothing changes |
| `painter-blocks` | Painting a selection over 3 paragraphs keeps 3 paragraphs, keeps `<br>` and links inside them, keeps the text; the painted runs get the source's font family and size |
| `replace-all-structure` | In `<blockquote>…</blockquote><p>…</p><p>…</p>`, replace-all changes only the matched words; the block structure is identical |
| `refscan-caret` | With a reference match in the caret's paragraph, after the scan the caret is still at the end and typed text lands at the end; saved HTML contains no `ref-match` |
| `leave-and-return` | Type, leave the notebook and come back within 3 s: the text is on screen and was saved. (The harness does what `setMode` does — replace `#main`, then `renderNotesView()`; once Phase 1 adds a notebook hook that `setMode` calls first, the test calls that hook too.) |
| `failed-save-switch` | When saving fails, opening another note keeps the current one open, shows an error, and the text is not lost |
| `sanitize-keeps-markers` | `data-ref-insert="1"` survives the sanitizer; `<img>` and `position:fixed` do not |
| `toasts` | No code path calls the non-existent `showToast` (static check over `src/`) |

**0.4 CLAUDE.md.** Add a section **"Notebook rules (3.5)"** and a section **"Library data safety
(3.5)"** containing the rules stated in Phases 1–2 below (short, imperative, one line each, with
the reason). Update them as phases land. Commit `docs(claude): record the 3.5 notebook and data
rules`.
In the same commit, add `npm test` to the workflow and to the scripts table of
`.claude/skills/bilim-desktop/SKILL.md` (the repo copy of the build skill).

**0.5 PROGRESS.md.** Create `prompts/3.5/PROGRESS.md`: a table of phases 0–8 (status, commits,
tests), a "Measurements" list, a "Deferred" list. Commit.

Continue straight into Phase 1.

---

## Phase 1 — Notebook: nothing written may be damaged or lost

Fixes the owner's two bugs, K1, K2, K3, K7. Files: `src/spellcheck.js`, `src/notes.js`,
`src/index.html` (`setMode`, `beforeunload`), `main.js`, `preload.js`.

### 1.1 One text map with line ends (owner's bug 2)

Create `src/textmap.js` (renderer, loaded before `spellcheck.js`) holding the offset helpers that
spellcheck, find and the reference scanner will share: `readTextMap`, `locate`, `rangeFor`,
`offsetOf`, `wordRange`, `quotedSpans`, `overlapsAny`, `hitTest`, `canHighlight`.
Port from web `lib/spellcheck/marks.ts` (commits `31f76d6`, `ec9f78a`), keeping these rules:

- One virtual `"\n"` (`LINE_SEPARATOR`) wherever the reader sees a line end: entering or leaving a
  block element (`BLOCK_TAGS`: p, div, h1–h6, ul, ol, li, blockquote, pre, table, thead, tbody, tr,
  th, td, hr) and at every `<br>`. At most one between two text nodes, none at the start. Inline
  elements never break a word. Separators belong to no text node; an offset on a separator resolves
  to the end of the node before it. Empty text nodes are left out.
- **Do not drop quoted material from the map** (the current `readTextMap` rejects nodes, which
  glues the words on either side of them). Map everything; then (a) send the engine the text with
  quoted spans replaced by spaces of the same length, and (b) drop any mark overlapping a quoted
  span. Quoted material on the desktop is
  `QUOTED_SELECTOR = 'a[href], [style*="UthmanicHafs"], [style*="Uthmanic Hafs"], [data-ref-insert="1"], .notes-inserted-ref'`
  (the desktop inserts verses with the alias `UthmanicHafs`, without a space — the web selector
  alone would miss them; legacy inserted references lost `data-ref-insert`, see K6, so the class is
  needed too). Text the writer set in the Uthmani face from the toolbar counts as quoted as well —
  accepted, the web does the same. Export the selector once from `textmap.js`.
- `applyCorrection` reads a **fresh** map and goes through `wordRange`: refuse unless the flattened
  text at the mark is exactly the word, the Range's `toString()` is exactly the word, and both ends
  sit in the same block. On refusal change nothing, close the popup, re-run the check. The
  correction stays one `insertText` (one undo step).
- «لۇغەتكە قوشۇش» adds a word only if it is exactly one word by the engine's own rules: add a
  main-process check (extend `spell-personal` or add `spell-validate-word`) using
  `WORD_PATTERN`/`isCheckable` from `src/spellcheck/dictionary.js`; 2–64 characters. Reject
  anything else with a toast.

### 1.2 Format painter (owner's bug 1)

Rewrite `fpCaptureFormat` / `fpApplyFormat` in `src/notes.js`. Keep the desktop's strengths (font
family and size are copied; one-shot and sticky modes; Alt+Ctrl+C / Alt+Ctrl+V; Esc). Reference:
web `lib/notes/painter.ts` (`formatAt`, `selectedTexts`, `rangeFormat`, `paint`) — it carries only
bold/italic/underline/colour; extend it.

- **Capture explicit formatting only**, by walking from the source text node up to the editor
  root (`formatAt`): bold, italic, underline, strike-through, font family (`<font face>` or
  `style.fontFamily`), size level (`<font size>`, or `style.fontSize` mapped to the nearest
  toolbar level 1–7 by pixel size: 10, 13, 16, 18, 24, 32, 48 px), text colour **only if set on
  the text** (never the theme's ink — audit §2: text painted in the dark theme turned
  near-invisible in the light one), background only if set. Headings count as bold. Paragraph metrics: alignment, line height, first-line indent — only if set inline on the
  source block.
- **Apply with editing commands only — never rebuild the selection as HTML** (no `sel.toString()`,
  no `insertHTML`). Override semantics, like Word: for each target sub-range run `removeFormat`, then
  re-apply each captured property with its command — `bold`/`italic`/`underline`/`strikeThrough`
  using the coverage check (`rangeFormat`: run a toggle only when the range is not already
  all-on/all-off as wanted; never un-bold a heading), `fontName`, `fontSize` (level),
  `foreColor`, and `hiliteColor` (with `styleWithCSS` true, then back to false). **Measure first**
  in Electron 28 that `removeFormat` keeps `<a>`, `<br>`, block elements and data attributes, and
  write the measurement into `CLAUDE.md`. If it does not, drop `removeFormat` and rely on the
  coverage toggles (the web approach) for that property.
- **Never paint quoted material.** Split the selection into the maximal sub-ranges that do not
  intersect `QUOTED_SELECTOR` elements and paint each in turn; if nothing is left, toast
  «ئايەت ۋە نەقىلگە سۈپۈرگە ئىشلىمەيدۇ».
- Paragraph metrics go only to blocks the selection covers **entirely**. Alignment through
  `justifyRight` / `justifyCenter` / `justifyLeft` / `justifyFull` (undoable). Line height and
  indent are set directly (there is no command); margins are no longer copied.
- The whole paint is one batch: the editor's input handler (autosave, counts, spellcheck, scan)
  runs once at the end, not once per command.

### 1.3 Find & replace (K1)

Port web `lib/notes/find.ts` (`findInEditor`, `replaceHits`):
- Hits are found per text node over `readTextMap` (a hit never crosses a text node), case-insensitive
  literal as now.
- **Show hits with the CSS Custom Highlight API** (`bh-find-hit`, `bh-find-current`) — no
  `<mark>` elements in the note any more.
- **Replace each hit over its own Range with one `insertText`, last hit first.** Never
  `selectAll` + `insertHTML`. «ھەممىنى ئالماشتۇرۇش» runs as one batch; before it, keep an
  in-memory snapshot of the note and offer «ھەممىنى يېنىۋېلىش» in the find bar: it runs that many
  native undos and, if the note still differs from the snapshot, writes the snapshot back through
  `putDocument` (1.5). (Phase 3 also stores it as a version.)

### 1.4 Reference scan (K2)

- Show matches with the Highlight API (`bh-ref-match`, styled like the old `.ref-match`) instead of
  wrapping words in `<span>`s. A click on a highlighted phrase is hit-tested through `textmap.js`
  (as the spellchecker does) and calls `notesShowRefFor(word)`. The note's DOM is never touched by
  the scanner, so the caret cannot move.
- The scanner and the highlighter skip `QUOTED_SELECTOR` (inserted references and verses).
- On open (`mountEditor`), unwrap legacy `span.ref-match` and `mark.notes-find-hit` exactly like
  the legacy `span.spell-error` unwrap that is already there. The next save writes the note back
  clean.

### 1.5 Saving (K3)

- **One writer of the whole document:** `putDocument(html)` in `notes.js` — sanitize, set
  `innerHTML`, unwrap legacy transient markup, re-run counts/spell/scan. It is the only code that
  assigns the editor's `innerHTML` (mount, version restore, AI apply). Add a static test that fails
  if any other place assigns it.
- When a save **starts**, update `S.notes.curDoc.content_html/content_text` from the snapshot at
  once, so re-mounting the editor always shows the newest text even while the IPC is in flight.
- `window.notesFlush()` → `Promise<boolean>`: cancel the debounce, wait for an in-flight save, save
  if dirty, resolve `true` only when the database confirmed the latest edit.
- `setMode`: when leaving the notebook, take the snapshot synchronously and start the flush
  **before** `#main` is replaced.
- `notesOpen`, `notesCreate`, deleting the open note, `notesGoToBook`, `notesGoToQuranAya`: `await
  notesFlush()`; on `false` stay on the current note, set the status to the error, toast
  «خاتىرە ساقلانمىدى — قايتا سىناڭ».
- After a failed save retry at 5 s, 15 s, 45 s, then every 60 s while dirty; «ساقلاش» / Ctrl+S
  retries at once. The status never says «ساقلاندى» while something unsaved is on screen.
- **Closing the window:** the renderer reports its dirty state to main (`notes-dirty`, boolean, on
  change). In `mainWindow.on('close')`, if dirty: `preventDefault()`, send `app-flush-request`; the
  renderer runs `notesFlush()` and answers `app-flush-done` with the result; main then closes, or
  after 3 s without an answer, or if the flush failed asks with a native dialog «ساقلانمىغان خاتىرە
  بار. يەنىلا تاقامسىز؟» (Yes / No). The database is closed only after that. Keep the
  `beforeunload` save as a last resort but make it use the clean snapshot.

### 1.6 Messages (K7)

Replace every `showToast` call in `src/notes.js` and `src/quran.js` with `toast`. The static test
from Phase 0 now passes.

**Phase 1 manual checklist for the owner (write it in Uyghur):** Enter between a misspelled and a
correct word → only the misspelled one is underlined, the suggestion replaces only it; Shift+Enter
the same; paint a format over three paragraphs → three paragraphs stay; replace-all in a note
starting with a quote → only the words change; write a sentence quoted from a library book →
the caret stays where you type; type, press Ctrl+2 and at once Ctrl+3 → the text is still there;
close the window right after typing → reopen, the text is there.

---

## Phase 2 — Library safety

Fixes K4, K6, K18 and adds the backup the audit asks for (§4.5). Files: `main.js`,
`database.js`, `preload.js`, `src/index.html`, `src/sanitize.js`.

### 2.1 No deletion by omission (K4)

- `database.syncBooks` never deletes. Remove the "not in the incoming list → delete" loops from
  `syncBooks` and from `save-library` (the `cleanupBookFiles` call there goes too; `db-delete-book`
  keeps it).
- `delBook` in `index.html` calls `window.electron.dbDeleteBook(id)` (it exists) and only then
  updates `S`. Check every other place that removes a book from `S.books` and route it the same
  way.
- `load-library`: wrap each of its eight reads separately; return the parts that worked plus
  `loadErrors: [part…]`. If `books` failed, the renderer shows a persistent Uyghur banner
  «كىتاب تىزىملىكى ئوقۇلمىدى — ھېچنېمە ئۆزگەرتىلمىدى. دېتالنى قايتا قوزغىتىڭ.» and `saveData()`
  never sends a part that failed to load.
- `save-library` additionally refuses (and logs) a `books` list that is empty while the database
  holds books, and refuses to sync any part (bookmarks, notes, progress, recent, categories) that
  failed to load in this session — main remembers the result of `load-library`.
- Reading-position saves on every page turn (`renderReaderPage` → `saveData()`) are replaced by the
  targeted `dbSaveProgress` IPC that already exists. `saveData()` is for real state changes only.
- Tests (main-process suite, temp DB): a full sync without a book never deletes it; `db-delete-book`
  deletes book, content, bookmarks, notes, progress; an empty incoming list is refused.

### 2.2 Backup and restore (audit §4.5)

- **Migrations framework:** `PRAGMA user_version`. Ordered, additive steps, each in a transaction.
  Before the **first pending step** of a run, back up the database (see below) to
  `JamiyKutupxana\backups\library-before-<version>.db`. All schema changes in Phases 3–7 are
  steps of this framework.
- **Backup helper** in main: `database.backupTo(file)` using better-sqlite3's `db.backup()`.
- **Automatic:** at startup, if the newest `backups\auto-*.db` is older than 7 days, write
  `auto-<yyyy-mm-dd>.db`; keep the newest 3 automatic ones. Show the backups folder's size in the
  settings section (the database holds every book's text and can be large).
- **Manual:** a «زاپاسلاش ۋە ئەسلىگە كەلتۈرۈش» section in the settings dialog (or the existing
  data/about menu — follow the current UI): «ھازىر زاپاسلاش» (save dialog, default name
  `BilimHezinisi-<yyyy-mm-dd-HHmm>.db`), «زاپاس قىسقۇچىنى ئېچىش», «زاپاستىن ئەسلىگە كەلتۈرۈش».
- **Restore:** open dialog (`.db`) → main opens the file read-only, runs `PRAGMA integrity_check`
  and checks the required tables → native confirm in main → back up the current database to
  `backups\library-before-restore-<timestamp>.db` → close the database (checkpoint WAL), replace
  `library.db` (remove stale `-wal`/`-shm`), `app.relaunch()`, `app.exit(0)`.
- The `backups` subfolder lives inside `JamiyKutupxana`. Nothing is renamed or moved.
- Tests: backup produces a readable copy with the same row counts; restore validation rejects a
  non-SQLite file and a database missing tables.

### 2.3 Sanitizer (K6)

`src/sanitize.js`: remove `USE_PROFILES` (it makes DOMPurify ignore `ALLOWED_TAGS`/`ALLOWED_ATTR`).
Keep explicit lists: add `table, thead, tbody, tr, th, td` to tags; keep `data-ref-insert` in
attributes (Phase 6 adds the citation attributes). Enforce `ALLOWED_CSS_PROPS` with a DOMPurify
`uponSanitizeAttribute` hook that rewrites `style` to the allowed declarations only (add
`text-indent`, `text-align`, `direction`, `unicode-bidi`, `list-style-type` if missing). `img` is not
allowed. The `sanitize-keeps-markers` test now passes; add cases for tables, `style` filtering and
`javascript:` URLs.

### 2.4 Window hardening (K18)

- `webContents.on('will-navigate')`: allow only the app's own `index.html`; prevent everything else.
- `setWindowOpenHandler`: call `shell.openExternal` only for a parsed `http:`/`https:` URL; deny
  all. (The sura footer's Tanzil/QuranEnc links must keep opening in the browser.)
- `export-as-pdf`: close the hidden window in a `finally`.
- `sql.js`: if nothing requires it (search the whole repo except `node_modules`), remove it with
  `npm uninstall sql.js` and commit the lockfile change on its own.

**Phase 2 manual checklist (Uyghur):** make a backup and find the file; delete a test book in the
DEV library → it is gone and everything else stays; restore the backup → the book is back; open a
Qur'an sura and click the Tanzil link → it opens in the browser.

---

## Phase 3 — Versions and document structure

Adds W1, W4, W5, W14; fixes K11. Reference: web `lib/notes/history.ts`,
`lib/notes/history-labels.ts`, `components/notes/history-panel.tsx`, `lib/notes/blocks.ts`,
`lib/notes/outline.ts`.

### 3.1 Earlier versions (W1)

- Migration: `note_versions(id INTEGER PK, note_id INTEGER NOT NULL REFERENCES
  note_documents(id) ON DELETE CASCADE, reason TEXT NOT NULL, title TEXT, content_html TEXT,
  content_text TEXT, created_at TEXT DEFAULT (datetime('now')))`, index `(note_id, created_at)`.
- Reasons and Uyghur labels: `open` «ئاچقاندا», `auto` «ئۆزلۈكىدىن», `before-replace-all`
  «ئالماشتۇرۇشتىن بۇرۇن», `before-paint` «سۈپۈرگىدىن بۇرۇن» (only when a paint covers more than one
  block), `before-ai` «AI تۈزىتىشتىن بۇرۇن», `before-restore` «ئەسلىگە قايتۇرۇشتىن بۇرۇن».
- Rules (from the web): a version identical to the note's newest is never stored twice — a
  `before-*` reason relabels an identical newest `open`/`auto` instead; `auto` only after a
  **confirmed** save and at most every 5 minutes per note; at most 30 per note — evict the oldest
  `auto` first, then the oldest of any reason, never the newest; versions are written in the
  background and never delay a save.
- UI: a «نەشر تارىخى» button in the note's title bar opens a panel (reuse the right-panel shape):
  label, local date/time, first line. Selecting one shows a sanitized read-only preview with
  «بۇ نۇسخىنى ئەسلىگە قايتۇرۇش» → `before-restore` version, `putDocument`, then saved like an edit.
- Tests (main suite): dedupe, relabel, eviction order, cascade on note delete.

### 3.2 Block style (W4, K11)

Replace the lone quote button with one select showing where the caret is: «ئادەتتىكى تېكىست»,
«چوڭ ماۋزۇ» (h2), «كىچىك ماۋزۇ» (h3), «نەقىل». Heading → `formatBlock` h2/h3; heading → normal
with `formatBlock div`; quote → normal with web `quoteToNormalCommand` (`formatBlock div` for a
quote holding text, `outdent` for one holding blocks). Re-measure in Electron 28. Test: every
transition, one undo step each.

### 3.3 Outline (W5)

«مۇندەرىجە» panel: `h1`–`h4`, empty ones left out, indented from the note's highest level, re-read
300 ms after a change; a click scrolls the heading just below the toolbar and puts the caret at its
start.

### 3.4 Undo / redo buttons (W14)

«يېنىۋېلىش» / «قايتىلاش» in the toolbar (`execCommand('undo'|'redo')`). Record in `CLAUDE.md`:
line height and first-line indent are set directly on blocks and are not part of the browser's undo
history (accepted limitation; the version history covers it).

**Phase 3 manual checklist (Uyghur):** make a heading and turn it back to normal text; turn a quote
back to normal text; replace-all, then restore «ئالماشتۇرۇشتىن بۇرۇن» from the history; use the
outline on a long note.

---

## Phase 4 — Export (W6, K8)

Reference: web `lib/notes/export-docx.ts`, `export-shared.ts`, `export-markdown.ts`,
`export-text.ts` — read their comments; they carry rules that were checked in Word and LibreOffice.

- **Design:** the renderer turns the note DOM into a plain JSON document model
  (`src/notes-export.js`): blocks (paragraph, heading level, quote, list item with depth and list
  id/type, table with rows/cells and spans), runs (text, bold, italic, underline, strike, font
  family, size, colour, highlight, link/citation), paragraph properties (logical alignment, line
  height, first-line indent). Main builds the files (`note-export.js`) with the existing `docx@8`
  and writes them after a save dialog. One IPC: `export-note(format, payload)`.
- **Word:** every block its own paragraph; `<br>` → line break; empty line → empty paragraph;
  lists at their depth and **each `<ol>` its own numbering definition**; tables with
  right-to-left layout; paragraphs `bidirectional`, runs `rightToLeft`; **alignment is logical in a
  right-to-left paragraph** (CSS right/start → `left`, left/end → `right`, centre, justify →
  `both`) exactly as the web rule — then open the result in Word to confirm; only properties that
  are ON are written to a run; sizes from px × 0.75 pt; the notebook's default face and size as
  the document defaults; fonts **named by the family name inside the font file** (read the name
  table of `assets/fonts/UthmanicHafs1.otf` — the web found «KFGQPC Uthmanic Script HAFS» — and of
  the UKIJ files; never embed fonts).
- **Citations:** an option «مەنبەلەرنى ئاستى ئىزاھات قىلىش» (setting, off by default). When on,
  each citation becomes a footnote (Word footnote / Markdown `[^n]`). Every format ends with the
  Qur'an credit when a verse is quoted — use the exact Uyghur credit text of the sura footer
  (`src/quran.js`).
- **PDF:** main renders the sanitized note HTML in a hidden window from a temp HTML file that
  declares the app's `@font-face` rules with file URLs to `assets/`, A4, `printToPDF`, window
  closed in `finally`. Check that Uyghur and the Uthmani face render in the PDF.
- **Markdown:** the vendored `turndown` in the renderer; **TXT:** block edges and `<br>` end lines,
  a blank line between paragraphs, UTF-8 with BOM, CRLF.
- UI: replace the «Word» button with «چىقىرىش ▾»: «Word (.docx)», «PDF», «Markdown (.md)»,
  «تېكىست (.txt)» and the footnote switch.
- Tests: the model builder over headings, quotes, nested lists, two separate numbered lists,
  tables, `<br>`, citations; the DOCX writer (main suite) — unzip the buffer (with the `jszip` that
  `docx` already depends on; no new dependency) and assert `word/document.xml` (bidi, jc, rFonts,
  numbering) and `word/footnotes.xml`.

**Phase 4 manual checklist (Uyghur):** export a note with a heading, a quote, a numbered list, a
verse and a library citation to Word and PDF; open both; send screenshots.

---

## Phase 5 — The list, the trash, and spelling

Adds W2, W3, W7, W8, W9, W10; fixes K12, K13. Reference: web `components/notes/note-list.tsx`,
`trash-list.tsx`, `lib/notes/list-sort.ts`, `components/notes/spell-nav.tsx`,
`components/notes/dictionary-panel.tsx`, `lib/spellcheck/personal.ts`, `personal-store.ts`,
`ignore.ts`, `glued.ts`.

- **Trash (W2):** migration adds `note_documents.deleted_at`. Deleting moves to the trash at once,
  no question, with «قايتۇرۇش» in the toast for 10 s. «ئەخلەت ساندۇقى» at the bottom of the list:
  restore; delete for ever (inline two-step confirmation); empty the trash. Purge items older than
  30 days at startup. A trashed note opens read-only. Trashing, restoring and pinning **never
  change `updated_at`**.
- **List (W3):** migration adds `pinned`. Pin toggle; sort select (يېڭىلانغان ۋاقىت / ماۋزۇ /
  ياسالغان ۋاقىت, remembered); Uyghur title order with web `uyghurSortKey` (ئ first, then the
  alphabet — never code-point order); a one-line preview (first 120 characters of the text,
  computed in SQL); the search box searches title **and** content through a main-process IPC
  (literal phrase, case-insensitive, 2–100 characters, ≤ 50 results, pinned first). A new note
  left with the default title and no text is removed when the writer leaves it.
- **Step through errors (W7):** «كېيىنكى خاتالىق» / «ئالدىنقى» beside the spellcheck switch, and
  F7 for next: first mark after the caret, wrapping; scroll it into view and open its popup; none
  left → «ئىملا خاتالىقى قالمىدى».
- **Personal dictionary (W8, K12):** a panel listing the words with a filter, delete, export
  (`bilim-hezinisi-lughet.json`, a JSON array — the same format as the web so files move between
  them) and import (untrusted input: JSON array only, each entry exactly one word by the engine's
  rules, 2–64 characters, ≤ 5,000 after merging, rejected entries counted and reported, never
  rendered as HTML). Mark entries that look glued (port `looksGlued` into the main process: ≥ 8
  letters, not accepted by the checker, splittable into two dictionary words of ≥ 3 letters) with
  «چاپلاشقان بولۇشى مۇمكىن» — a hint, never an automatic removal. Bug 2 may have stored such
  words; this is how the owner finds them.
- **Ignore in this note (W9):** «بۇ خاتىرىدە سەل قارا» in the popup, stored per note in the
  settings table (≤ 500 words); the session-only «ئاتلاش» stays.
- **Quoted material (W10):** confirm the spellchecker and scanner use `QUOTED_SELECTOR` everywhere.

**Phase 5 manual checklist (Uyghur):** delete a note and bring it back from the toast and from the
trash; pin a note; search for a word that is only inside a note's text; step through spelling
errors with F7; open the personal dictionary and look for glued words.

---

## Phase 6 — Citations, sources, AI that keeps formatting

Adds W11, W12, W13; fixes K9. Reference: web `lib/notes/insert.ts`, `lib/notes/links.ts`,
`components/notes/link-popover.tsx`, `components/notes/anchored.ts`,
`components/notes/source-panel.tsx`, `lib/ai/note-blocks.ts`, `lib/ai/proofread.ts`.

- **Citation links (W11):** newly inserted library passages end with
  `<a class="bh-cite" href="bh://book/<id>?o=<charOffset>&q=<word>">— <title></a>` (the offset is
  the snippet's `pos`, a character offset into the book content — verify in `database.js`), verses
  with `<a class="bh-cite" href="bh://quran/<sura>/<aya>">`. The sanitizer allows the `bh:` scheme
  only on `a.bh-cite`. Clicking a link in the note (Ctrl+click opens at once) shows a small card
  anchored to it — it follows scrolling and closes on Escape or an outside click — with what it
  points to («كىتاب: «ماۋزۇ»», «قۇرئان: 2:255», or the host name), «ئېچىش» and «ئۇلىنىشنى
  ئېلىۋېتىش» (`execCommand('unlink')` over the whole link). «ئېچىش»: flush the note, then open the
  reader at the offset with the word highlighted (`openReader(id, hl, targetPos)`), or the Qur'an
  at the verse; an http(s) link goes to main for `openExternal`. Nothing in the note ever
  navigates the window. Old inserted references without a link stay as they are.
- **Manual source search (W12):** a search box at the top of the «مەنبە» tab searches the library
  (existing search IPC + snippets) and the Qur'an (existing `quran-search`) and inserts a result
  as above. The «تەرجىمىسى بىلەن» checkbox becomes a three-way choice «ئەرەبچە / تەرجىمىسى /
  ئىككىلىسى», remembered. The automatic references stay below.
- **AI proofreading that keeps formatting (W13, K9):** port the unit model of
  `lib/ai/note-blocks.ts`. Units are leaf blocks (and bare text runs), split into lines at `<br>`.
  Units holding quoted material are **never sent**. Keep the ⟦N⟧ protocol and batching. Only lines
  that changed are written back: a unit without inline formatting is corrected line by line through
  a Range and `insertText` (undoable); a unit with inline formatting is flagged in the preview
  («بۇ ئابزاستىكى فورمات ئاددىيلىشىدۇ») and the writer can untick it. A `before-ai` version is
  stored first and the AI tab offers «يېنىۋېلىش», which restores it through `putDocument`. The old
  whole-document rebuild (`naiSetEditorBlocks`) and its `confirm()` go away.
- **OCR cleanup in the notebook:** works on the selection when there is one (replaced with
  `insertText` / `insertParagraph`, undoable); on the whole note only when it holds no quoted
  material, headings or lists — otherwise toast «OCR تېكىستىنى تاللاپ ئاندىن تۈزىتىڭ». Always a
  `before-ai` version first.
- Tests: insert/describe/unlink a citation; the sanitizer keeps `bh:` only on `a.bh-cite`; the
  unit builder skips quoted units and writes back only changed lines (fake AI answer).

**Phase 6 manual checklist (Uyghur):** search the library from the «مەنبە» tab, insert a passage,
click its link → «ئېچىش» opens the book at that place; insert a verse and open it; run AI
proofreading on a note with a verse and a bold word → the verse is untouched; undo the AI change.

---

## Phase 7 — Reader, Qur'an, search

Fixes K5, K15, K17; adds W16, W17, W18, W20. Reference: web `lib/books/presentation-forms.ts`,
`scripts/lib/presentation-forms.mjs`, `scripts/normalize-presentation-forms.mjs` (its parity
checks), `components/reader/annotation-form.tsx`, `components/my/quran-bookmark-list.tsx`.

- **Bookmarks and in-book notes with their place (K5, W16):** migration adds `char_offset` to
  `bookmarks`, `notes` and `reading_progress`. The reader renders each paragraph with its character
  offset in the whole book (`data-off`). Adding stores the offset of the first paragraph visible at
  the top. Names are editable inline in the panel (default «<page>-بەت»). Duplicates are judged by
  paragraph, not by percent. Jumping finds the page that holds the offset, renders it, scrolls to
  the paragraph and flashes it. Old rows (`char_offset` NULL) are listed under «كونا خەتكۈچلەر —
  ئورنى ساقلانمىغان», open page 1 with a toast, and can be deleted. Reading progress restores the
  exact paragraph when it has an offset. Tests: offset → page/paragraph mapping; legacy rows.
- **Qur'an bookmarks (W17):** migration `quran_bookmarks(sura, aya, note, created_at,
  UNIQUE(sura, aya))`. The verse menu gets «خەتكۈچ قوشۇش / ئېلىۋېتىش»; bookmarked verses are marked;
  a «خەتكۈچلەر» section in the Qur'an sidebar lists them. The last verse read is remembered and
  offered when the Qur'an opens.
- **Presentation forms (W18, K15):** port the fold as `text-normalize.js` (CommonJS, main): NFC,
  then per character U+FB50–U+FBFF and U+FE70–U+FEFF to their letters (lam-alef ligatures to two
  letters; U+FEE9/U+FEEA to ە), and **never** U+FDF0–U+FDFD (ﷲ, ﷺ …). Apply it in main at every
  way text enters: `db-add-book`, `db-add-books-batch`, `db-update-book`, `db-save-content`
  (content, title, author, description). A one-time tool in settings, «كىتابلارنى تەكشۈرۈش»:
  counts affected books read-only; «ئوڭشاش» makes a backup, folds each affected book in its own
  transaction with the web script's checks (nothing from the two ranges survives; length changes
  only by lam-alef; the count of religious ligatures is unchanged; a book that fails its check is
  skipped and listed), and rebuilds that book's FTS row. Tests: the fold on generated text, the
  checks, ﷲ untouched.
- **Clear search history (W20, K17):** «تارىخنى تازىلاش» in the history dropdown; a main IPC
  deletes `search_history`.

**Phase 7 manual checklist (Uyghur):** add a bookmark on page 30 and one on page 2, jump between
them; rename one; bookmark a verse and find it in the sidebar; run «كىتابلارنى تەكشۈرۈش»; clear
the search history.

---

## Phase 8 — Release 3.5.0 (no publishing)

1. `npm test` and the syntax gate over every JS file and the inline scripts — all green.
2. `npm version 3.5.0 --no-git-tag-version` (updates `package.json` and the lockfile). The app
   shows «V3.5» from `major.minor`. Diff `build.appx` against `main` — it must be byte-identical.
3. `RELEASE-NOTES-v3.5.0.md`: Uyghur first, then English; fixes first, then new features; say
   where backups are kept. Also prepare the Partner Center «What's new in this version» text in
   English and in Uyghur, **each ≤ 1,500 characters** — print the character counts.
4. `PRIVACY.md`: confirm nothing new leaves the machine (AI proofreading now sends less). Change the
   file only if something changed. `THIRD-PARTY-NOTICES.md`: nothing new is bundled — confirm.
5. `CLAUDE.md`: update the feature list and the 3.5 rules; move finished items out of the roadmap.
6. Update `PROGRESS.md`, then merge `release/3.5` into `main`. **Do not tag, do not push, do not
   build the Store package** — that is the owner's release step (Cowork skill
   **bilim-store-release**).
7. Final report to the owner in Uyghur: what changed, what to test once more with `npm start` on
   the real library (a backup is taken automatically before the first migration), and the next
   step: «Cowork دا bilim-store-release نى ئىشلىتىپ GitHub ۋە Store غا يوللاڭ».

## Out of scope for 3.5 (do not start these)

K14 Electron upgrade (its own release with a full rebuild and test pass), K16/W22 Markdown
rendering and in-book links, W15 notebook page typography, W19 quote image, W21 on-screen keyboard,
W23 browse by author. If one of them becomes necessary for an item above, stop and ask.
