# v3.6.0 — progress

Working document for the Claude Code sessions that execute
[`PROMPT-3.6.md`](PROMPT-3.6.md). Read it before answering any question about
what is done. Branch: `release/3.6` (cut from `main` at `2485cd9`, the v3.5.0
merge).

Resume line for a new session:

```
Read prompts/3.6/PROMPT-3.6.md in full, then prompts/3.6/PROGRESS.md, and continue with the next unfinished phase.
```

## Phases

| Phase | What | Status | Commits | Tests |
|---|---|---|---|---|
| 0 | Groundwork: branch, `npm test`, this file, CLAUDE.md «3.6» | **done** | `7fec54b` docs: add the 3.6 work order · docs(progress): this file and the «3.6» section | 114 green before anything changed |
| 1 | Qur'an: readable verse numbers; [n] and [n _ m] after each translation | **done** — waiting for the owner's check | `b587603` fix(quran): verse markers out of the translation; each verse knows its translation group · `e7cd6b9` feat(quran): readable verse numbers; every translation ends with [n] or [n _ m] · docs(progress) | 126 in all (with the syntax gate), every one green |
| 2 | PDF import keeps every page; page starts and the original file remembered | **done** — waiting for the owner's check | `fd67dd2` fix(ocr): the offline OCR engine answers inside Electron · `cadff79` feat(import): a PDF keeps every page; each page's place and the PDF's location are kept · docs(progress) | 138 in all (with the syntax gate), every one green |
| 3 | Search that understands Uyghur suffixes | **done** — waiting for the owner's check | `ed1d6bd` feat(search): a word's Uyghur forms — bases, stem changes, suffixes — for the library search · `2f9d911` feat(search): «قوشۇمچىلىرى بىلەن» in the search bar; the forms found are marked and counted · docs(progress) | 144 in all (with the syntax gate), every one green |
| 4 | One search across the books, the Qur'an and the notebook | **done** — waiting for the owner's check | `f888a53` feat(search): the Qur'an translation and the notebook searched through the Uyghur forms too · `0228555` feat(search): one search across the books, the Qur'an and the notebook · docs(progress) | 149 in all (with the syntax gate), every one green |
| 5 | «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» | **done** — waiting for the owner's check | `cf634c5` feat(web): read the website's published books and download them through its gate · `9f6c9ed` feat(web): «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» — the catalog inside the app · docs(privacy) · docs(progress) | 158 in all (with the syntax gate), every one green |
| 6 | Two books side by side | **done** — waiting for the owner's check | `293e060` feat(reader): two books side by side («يانمۇيان ئوقۇش») · docs(progress) | 164 in all (with the syntax gate), every one green |
| 7 | The PDF page beside its text: compare and correct | not started | | |
| 8 | Release 3.6.0 (no publishing) | not started | | |

## Phase 0 — done

- `main` was at `2485cd9` (the 3.5.0 merge), clean apart from untracked
  planning files under `prompts/`. Only `prompts/3.6/` was committed
  (`7fec54b`); `PARTNER-CENTER-3.2.0.md`, `PROMPT-17D-desktop-ai-models.md`,
  `PROMPT-SPELLCHECK-MORPHOLOGY.md` and `TARQITISH-TEKISTLIRI.md` are the
  owner's and were left alone. An empty folder `bilim hezinisi pc\` inside the
  project is not tracked by git and was left alone too.
- `npm test` on `release/3.6` before any change: **114 green**, 23.4 s.

## Phase 1 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| Markers out | `cleanUyghurTranslation()` removes a parenthesised group only when it holds digits and separators alone (`0-9`, `٠-٩`, space, `-`, `–`, U+0640, `،`, `,`, ZWJ/ZWNJ), with the space before it; a space stays only where words follow. `parseUyghurXml()` now returns the raw text: its old trailing strip also took the full stop («ئىگىسىدۇر(4).» became «ئىگىسىدۇر»); it is «ئىگىسىدۇر.» now. | `quran-cleaner-markers-out-words-untouched` — red: «433 translations still carry a verse marker» |
| Groups | `uyghurGroups()`: union-find over a sura's verses — identical consecutive texts, joined with the range in the marker that holds the verse (order normalised). 6:5 carries «(4)» from a copy of 6:4's sentence before its own «(5)», so only a marker holding the verse counts. | `quran-groups-from-the-bundled-text` — red: «seed.uyghurGroups is not a function» |
| Step 6 | `quran_translation_groups`: `ug_from`, `ug_to`; on a seeded library, `text_ug` re-cleaned and both columns written from the bundled XML, then `quran_fts` rebuilt. An unseeded library gets the columns; the seed writes them. Readers fall back to «each verse its own group» if the columns are missing. `quran-get-aya` sends `group_text_ug` (the longest text of the group). | `quran-step-recleans-and-groups` — red: «there is no migration step for the translation groups»; `quran-seed-writes-groups` — red: «no such column: ug_from» |
| One card per group | `collapseQuranGroups()` in `quranSearch` (FTS and LIKE paths): one result per group, the best-ranked hit's place, `verses` = each found verse with its Arabic. `quranContentSnippet` (the reference scanner) lists a group's translation once. | `quran-search-lists-a-group-once` — red: «37:151 should be part of a group» |
| The number | The verse number is the Uthmani font's own medallion at 1.75 em of the verse text (see «One departure» below). | `mushaf-verse-numbers-scale` — red: «got 14 px beside 28 px» |
| Labels | `src/verse-label.js` (UMD, the one copy): «[7]», «[4 _ 6]», a run grouped for copying. The mushaf: the translation ends with its label; a group's is shown once, under its last verse, the earlier verses show «تەرجىمىسى 6-ئايەتنىڭ ئاستىدا [4 _ 6]» (click → that verse, no menu). Copy: a run writes a group's translation once; the label follows the closing «»: `﴿…﴾ «…» [4 _ 6]`. Notebook: preview, «قىستۇرۇش» (inside the quoted span) and the «تەرجىمىسى» copy carry the label; the source search appends it to a translation snippet, not to an Arabic one. Qur'an search: one card per group, every found verse's Arabic with its number, the translation once. | `verse-label-format`, `mushaf-labels-and-groups` — red: no label; `quran-copy-carries-labels` — red: «QuranCopy.build is missing»; `verse-insert-carries-label`, `source-search-quran-labels`, `quran-search-cards-once` — red |

The harness now loads `src/quran.css`, `src/verse-label.js` and `src/quran.js`
too, and the stubs answer `quranGetAyas` / `quranLookupSura`.

**One departure from the work order — the verse number.** The order asked
for digits of about 0.75 em in a ring. Measured in the app, the bundled
`UthmanicHafs1.otf` cannot give that: its Arabic-Indic digits are **0.27 em**
tall, and through `liga` it draws a run of them as its own verse-end
medallion (0.89 em) — so at the old 14 px the digits were under 4 px, inside
the medallion, inside our ring. At 0.75 em they would still be about 6 px.
Keeping the Uthmani face, the number is now that medallion at **1.75 em** of
the verse text, without our ring: the digits come out at about 0.47 of the
verse text (13 px beside 28 px) — what 0.75 em of an ordinary face gives —
and the medallion grows with the text. `mushaf-verse-numbers-scale` loads the
real font and checks the medallion is drawn (with `liga` off it measures
0.18 em wide and fails). If the owner prefers our plain ring back, the
alternative is Arabic-Indic digits in the UKIJ face at 0.75 em (0.64 em
tall) — not the Uthmani face.

Checked in `npm run dev` over the DevTools protocol (DEV library only):
- `[migration] backed up to library-before-3.5.0.db before schema 5 → 6`,
  then `[migration] 6 quran_translation_groups applied`. The DEV library is
  migrated already; the owner's real library does the same on its first
  start of 3.6 (backup first).
- 37:150–156, 53:12–16, 2:254–255 looked at: medallions readable; 37:151 and
  53:13 show the pointer line; 37:152 «… [151 _ 152]»; 53:14 shows 53:13's
  longer text with «[13 _ 14]». Read right to left, the label meets the
  first verse first.
- Qur'an search «يالغانچىلاردۇر»: 37:151–152 is one card with both verses'
  Arabic. `QuranCopy.build` on 37:150–152 gives two paragraphs, the group's
  translation once.
- The sura footer's attribution is unchanged (`export-credit-matches-footer`
  green, the footer code untouched).

Found in the source text, left as it is (no letter is ever changed):
- 6:5 begins with a copy of 6:4's sentence (its «(4).» removed now), then
  its own text.
- 37:146 ends «… بەردۇق. ئ» and 69:31 «… تاشلاڭلار، ئ» — a stray letter
  after the marker. 15:97 begins with «:» once its leading marker «(97)» is
  gone; 11:54 ends «جۇدامەن،.».

## Phase 2 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| Every page | `src/pdf-text.js` (UMD): `extract` reads every page of the text layer with progress («PDF ئوقۇلىۋاتىدۇ: بەت 120 / 512»), yielding every 10 pages; `joinPages` keeps today's joins exactly ('\n' after each text-layer page; OCR pages with '\n\n', the whole trimmed) and gives each page's range. The single import (`handleFileResult`) and the batch import (`confirmBatchImport`) both use it. | `pdf-no-page-cap` — red: «got ["Math.min(pdf.numPages,100)","Math.min(pdf.numPages, 200)"]»; `pdf-extract-every-page` (a generated 150-page PDF read by the bundled pdf.js) — red: «src/pdf-text.js … is not loaded» |
| Page map | Migration step 7 `pdf_pages_and_original`: `book_page_map(book_id, page_no, start, "end", PRIMARY KEY(book_id, page_no))`, cascade on book delete. `normalizeWithRanges` (`text-normalize.js`) maps the extracted ranges onto the stored text (each range and gap folded on its own, then checked against the whole; a misfit drops the map). `addBook` (now one transaction) and `addBooksBatch` write it. The renderer sends ranges only while the staged text is the one they were measured in (`stagePages`); an AI cleanup of OCR text or another file drops them. `saveBookContent` with a different text, and the letters repair, drop a book's map. | `pdf-ranges-through-normalisation` — red: «normalizeWithRanges is not a function»; `pdf-step-adds-page-map-and-original` — red: no step; `pdf-add-book-keeps-every-page`, `pdf-batch-keeps-every-page`, `pdf-map-dropped-when-text-is-replaced` — red: «no such table: book_page_map» |
| The original | `books.original_size`, `original_mtime`, `original_sha256` beside the old `original_path` (added by the step if a very old library lacks it). `pdf-original.js` (main): `fileFacts`, `originalStatus` (found / moved / missing), `locateOriginal`. `db-add-book` and `db-add-books-batch` read the facts from the path themselves — never from the renderer — only for a `.pdf`. IPC `pdf-original-status` (records a new time when the same bytes were copied), `pdf-locate-original` (open dialog → same SHA-256 taken at once; another file, or any for a book from before 3.6, only after «ھەئە، شۇ كىتاب» in a native dialog). Preload `pdfOriginalStatus`, `pdfLocateOriginal`. `pdf-original.js` added to `build.files`. | `pdf-original-found-moved-missing` — red: «Cannot find module … pdf-original.js» |
| OCR cap said | `PdfText.OCR_MAX_PAGES` = 300. Progress: «UKIJ OCR: بەت 12 / 300 (PDF دا 512 بەت؛ ئالدىنقى 300 بېتى ئوقۇلىدۇ)»; result and toast: «300 / 512 بەت ئوقۇلدى»; the description gets «PDF دا 512 بەت بار؛ OCR بىلەن ئالدىنقى 300 بېتى ئوقۇلدى.» (a later run replaces it, the owner can edit it). UKIJ OCR pages keep their ranges, an empty page an empty range. | `pdf-ocr-join-and-cap` — red |
| Found: OCR stood still behind other windows | pdf.js's default display intent waits for animation frames; a window behind another one draws none. `PdfText.renderPage` draws with `intent: 'print'`; OCR uses it. | `pdf-render-in-a-hidden-window` — red: «the page was not drawn in 3 s» |
| Found: the offline OCR engine never answered | tesseract.js 5.1.1 calls its environment «electron» inside Electron, takes the local tessdata folder for a web address, and throws «Only absolute URLs are supported» outside any promise, so `ocr-recognize` never returns. `ocr-engine.js` (main): the models are read as tesseract's read-only cache (`cachePath` = tessdata, `cacheMethod: 'readOnly'` — never written, never deleted); every requested model is checked first. Also added to `build.files`. | `ocr-engine-answers` (the engine started with the app's options inside the test runner's Electron main process) — red: «the OCR engine did not answer: TypeError: Only absolute URLs are supported»; `ocr-engine-wired` — red |

Checked in `npm run dev` over the DevTools protocol (DEV library only; the
test books were removed afterwards, their page maps went with them):
- Step 7 ran after its backup (`library-before-3.5.0-2026-10-27-152139.db`).
- A generated 500-page PDF through `handleFileResult` and «قوشۇش»: 916,344
  characters extracted in 483 ms; stored 916,354 (ten lam-alef glyphs became
  two letters each); 500 ranges, consecutive, covering the text with the
  joins; no glyph codepoint left; the last page ends «End of page 500.»; its
  path, size, time and SHA-256 recorded; `pdf-original-status` → found.
- The batch import of a 150-page PDF: 150 ranges, same checks.
- OCR with the cap lowered to 3 (in the page's memory only), the window
  behind other windows: 3 pages in 18 s, the progress, result, toast and
  description lines as above, ranges `[0,1871] [1873,3744] [3746,5617]`.

**Important for the owner:** the OCR code and the tesseract.js / Electron
versions are unchanged since v3.1.0, and the engine fails the same way in a
bare Electron main process — so the offline OCR has most likely not worked
in any desktop release since 3.1.0 (the import dialog waited for ever).

## Phase 3 — done

| Item | What changed | Tests |
|---|---|---|
| The forms | `search-forms.js` (main): `formsFor(word)` → `{ base, forms }`, `compile(query)` → `findAll(text, limit)` (spans, a hit through the forms spans the whole word), `foundWords`, `ftsQuery`, `forms` (what was added); `lowered(text)`. Built on `src/spellcheck/engine.js` (new `getDictionary()`), `dictionary.js`, `morphology.js` (`harmonyOf`) and `suffixes.generated.js`. | `search-forms-table` (47 rows: 28 must find, 19 must not), `search-forms-bases-and-forms`, `search-forms-phrase-and-switch` |
| The search | `searchBooks(q, cat, { forms: true })` → `searchBooksWithForms`: today's exact hits in every book, plus the forms in the books the full-text index names (prefix query per form; every book while the index is still being filled). Each result: `snip`, `pos`, `mark` (the word found in the snippet), `titleMark`. `getAllSnippetsForBook(…, { forms: true })`. `searchWordsInBook` → `db-search-words`. Without `opts.forms` everything is exactly as before (the notebook's «مەنبە» search included). Both searches lower-case a text only when it has a cased letter. | `search-books-with-forms`, `search-books-index-and-scan-agree` |
| The UI | «قوشۇمچىلىرى بىلەن» in the search bar (checkbox, on by default, `search_forms`; switching it runs the search on screen again). «ئىزدەلگەن شەكىللەر: بالا، بالى» under the heading. Snippet and title mark the word found (`markedAt`). Results open through `openSearchHit`, which asks for the book's found words; `openReader(id, hl, pos, words)` → `setReaderMarks` → `ReaderPlaces.searchRe`; `updateMatchNav` counts with the same expression; the in-book search box keeps the forms while it holds the same query. The «+» panel asks with the forms. | `search-forms-reader-marks-the-same` (the reader's expression marks exactly the search's spans) |

**How the rules were tightened, by measurement.** The DEV library has no
books, so the false-match measurement used the library's own vocabulary —
`spellcheck-data/frequencies.tsv`, 59,832 distinct words from the 15
published books — and 22 common words (20 bases, 4 inflected), counting the
words found with the switch off and on:

1. First version (the work order's rules as written, plus «ى سى م ڭ»): 508
   words added. An even sample of 30: **3 wrong** (ئاتىكە a name, ئاتىلامدۇ
   a verb, بالاخانىنىڭ a compound). Reading the lists: «ئىمام» had the base
   «ئىما» («م» taken off) and found 31 words of «ئىمان» — all wrong; «ئاتا» →
   «ئاتى» found the verb ئات‑ (ئاتىغان، ئاتىدى…), «سۈرە» → «سۈرى» found
   «سۈرىتى» (سۈرەت).
2. Tightened: a possessive outside the ACCEPT tier comes off a dictionary
   word only to undo a stem change; after a raised stem every suffix must be
   a noun's; a tail that begins with a word of its own is a compound.
3. Final: **725 → 1,195** words found (470 added). A fresh even sample of
   30: **all correct** (one derived: «كىشىلىك»). The three longest lists read
   in full (162 words): **5 doubtful** — ئاتىكە ×3 (a name), بالايى,
   بالاتتىكى — about **3 %**. The table's «must not» rows hold every
   measured false match.

**Departures from the work order, and why:**
- «…or makes a dictionary word» for what follows a form was not used: it
  accepts «بالاغەت» for «بالا» and «بالاخانا» for «بالا». A tail must be one to
  three known suffixes instead (the engine's SUGGEST tier, which holds the
  inflection chains the dictionary has, plus the possessives) — that is
  what «makes a dictionary word» was meant to admit.
- The «narrower ACCEPT tier» alone was not enough: it lacks «تە» (مەكتەپتە)
  and holds verb suffixes, so it neither keeps the right words nor stops
  the verbs. The two noun rules above did both.
- The words the reader marks are not sent with every result: listing them
  meant finding every hit in every book. They are asked for when a book is
  opened (`db-search-words`).

Checked in `npm run dev` over the DevTools protocol, with two test books
added and removed (the DEV library is empty again): «بالىلار» found both,
«ئىزدەلگەن شەكىللەر: بالا، بالى» shown, the snippet and the title marking
«بالىسى» and «بالا»; the reader marked بالىلار، بالىسىنى، بالا،
بالىلىرىمىزنىڭ، بالىلارنى، بالىغا — not بالاغەت — and counted «1/6». The
header at the window's minimum width (900 px) fits: no overflow, the input
231 px wide.

### Phase 3 checklist for the owner (`npm run dev`)

ئالدى بىلەن سىناق كۇتۇپخانىسىغا «بالا»، «بالىلار»، «بالىسى»، «مەدرىسە»، «ئاياق» دېگەن سۆزلەر بار بىر-ئىككى كىتاب قوشۇڭ (ھازىر سىناق كۇتۇپخانىسىدا كىتاب يوق).

1. ئىزدەش رامكىسىنىڭ ئىچىدە «قوشۇمچىلىرى بىلەن» بەلگىسى بار، ئادەتتە بەلگىلەنگەن.
2. «بالىلار» دەپ ئىزدەڭ ← تىزىملىكنىڭ ئۈستىدە «ئىزدەلگەن شەكىللەر: بالا، بالى» دېگەن قۇر چىقىدۇ؛ «بالا»، «بالىسى»، «بالىغا» بار كىتابلارمۇ تېپىلىدۇ؛ ھەر نەتىجىدە سېرىق بەلگىلەنگىنى دەل تېپىلغان سۆز.
3. بەلگىنى ئېلىۋېتىڭ ← پەقەت «بالىلار» بار كىتابلارلا قالىدۇ (بۇرۇنقىدەك). قايتا بەلگىلىسىڭىز، دېتالنى تاقاپ ئاچسىڭىزمۇ بەلگىلەنگەن پېتى قالىدۇ.
4. «مەدرىسىلەردە» دەپ ئىزدەڭ ← «مەدرىسە» ۋە «مەدرىسىدە» مۇ تېپىلىدۇ. «ئاياق» دەپ ئىزدەڭ ← «ئايىغى» مۇ تېپىلىدۇ.
5. بىر نەتىجىنى ئېچىڭ ← تېپىلغان ھەممە شەكىل بەلگىلەنگەن، ساننى («1/6» دەك) ئوقلار بىلەن بىرمۇبىر ماڭسىڭىز ھەر بىرىگە بارىدۇ.
6. نەتىجىدىكى «+ بۇ كىتابتىكى بارلىق ئورۇنلارنى كۆرۈش» ← شەكىللەرمۇ تىزىلىدۇ؛ بىرىنى چەكسىڭىز شۇ ئورۇندا ئېچىلىدۇ.
7. بىلىپ قويۇڭ: «ئاتا» دەپ ئىزدىسىڭىز «ئاتىكە» (ئىسىم) دەك ناھايىتى ئاز خاتا سۆز چىقىشى مۇمكىن (ئۆلچىگەندە %3 ئەتراپىدا). خاتا نەتىجە كۆپ چىقسا، سۆزنى ۋە كىتابنى ئېيتىڭ.

## Phase 4 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| The Qur'an | `quranSearch` = `quranSearchRows` (today's search, one row per verse) + with `opts.forms` `quranFormRows` (FTS `text_ug : (…)` names the candidates, the matcher decides; the snippet marks the word found, its text escaped), then `collapseQuranGroups` once. `lang: 'ar'` and Arabic queries get nothing added. | `search-all-quran-groups-once` — red: «the group came back 0 times» (today's prefix search cannot reach «يالغانچىلاردۇر» from «يالغانچىلىرى») |
| The notebook | `notesSearch(q, opts)`: with `opts`, `notesSearchForLibrary` — every note not in the trash, title and text through the matcher (forms when `opts.forms`), pinned first, newest first, at most 50; `snip`, `mark`, `titleMark`, `words`; the note's whole text never crosses the IPC. Without `opts` the notebook list's own search, unchanged. | `search-all-three-sources` — red: «the note through «پەيغەمبىرىمىز» — got []»; `search-all-only-in-a-note`, `search-all-never-the-trash` (guards); `notes-search-content`, `list-search-content` still green |
| The page | `doSearch`: three requests at once (books through `searchBooksPart`), each section drawn as it arrives, stale answers dropped (`S.srchSeq`). `renderSearch`: chips with counts, the category note, the forms line, three sections with counts and «ئىزدەۋاتىدۇ...» / «نەتىجە يوق»; «ھەممىسى» shows five per section and «يەنە كۆرسىتىش»; a chip shows a section whole, the books paginated as before. Cards: `bookHitHtml` (the old card + «كىتاب»), `quranHitHtml` (sura, verses, each verse's Arabic, the translation once with «[n _ m]»), `noteHitHtml` (title, date, the words around the one found). | checked in the dev app (below) |
| Opening | `openQuranHit` → the Qur'an at the verse, selected (`S.quran.selectAya`, also verse 1). `openNoteHit` → `notesOpen`, then `notesShowFound(query, words)` (notes.js): the find bar, find only, every word found painted by the find highlight; another query or Ctrl+H is the plain find bar. `setMode` returns the view's promise. | `notes-show-found-paints-without-markup` — red: «notesShowFound is missing» |

Checked in `npm run dev` over the DevTools protocol, with a test book (in
«تارىخ») and a test note added and removed again (the DEV library is
empty again): «پەيغەمبەرلەر» gave «كىتابلار (1)», «قۇرئان كەرىم (349)»,
«خاتىرە دەپتىرىم (1)» with their labels, «يەنە كۆرسىتىش (344)» under the
Qur'an; the first verse (15:80) opened selected; the note opened with
«پەيغەمبىرىمىزنىڭ» painted, «1 / 1», no markup in the editor; with the
category «تارىخ» the page said ««تارىخ» تۈرى پەقەت كىتابلارغا قوللىنىلدى».

Not checked by a test: the page itself (it lives in `src/index.html`,
which the test page does not load) — the owner's checklist below.

### Phase 4 checklist for the owner (`npm run dev`)

ئالدى بىلەن سىناق كۇتۇپخانىسىغا بىر سۆز (مەسىلەن «پەيغەمبەر») بار بىر كىتاب، ۋە شۇ سۆز بار بىر خاتىرە قوشۇڭ.

1. ئىزدەش رامكىسىغا «پەيغەمبەرلەر» دەپ ئىزدەڭ ← ئۈچ بۆلەك چىقىدۇ: «كىتابلار (…)»، «قۇرئان كەرىم (…)»، «خاتىرە دەپتىرىم (…)»، ھەر بىرىدە سانى بار. ھەر كارتىنىڭ بېشىدا كىچىك بەلگە: «كىتاب»، «قۇرئان كەرىم»، «خاتىرە دەپتىرىم».
2. ئۈستىدىكى «ھەممىسى · كىتابلار · قۇرئان كەرىم · خاتىرە دەپتىرىم» نى بىر-بىرلەپ بېسىڭ ← پەقەت شۇ بۆلەك چىقىدۇ. «ھەممىسى» دە ھەر بۆلەكتە 5 نەتىجە ۋە «يەنە كۆرسىتىش» بار.
3. قۇرئان نەتىجىسىنى بېسىڭ ← قۇرئان شۇ ئايەتتە ئېچىلىدۇ، ئايەت بەلگىلەنگەن. تەرجىمىنىڭ ئاخىرىدا [n] ياكى [n _ m] بار، بىر گۇرۇپپا بىرلا قېتىم چىقىدۇ.
4. خاتىرە نەتىجىسىنى بېسىڭ ← خاتىرە دەپتىرى شۇ خاتىرىدە ئېچىلىدۇ، تېپىلغان سۆز سېرىق رەڭدە، ئىزدەش بالدىقىدا «1 / 1». خاتىرىگە ھېچنېمە يېزىلمايدۇ.
5. كىتاب نەتىجىسىنى بېسىڭ ← كىتاب بۇرۇنقىدەك شۇ ئورۇندا ئېچىلىدۇ.
6. سول تەرەپتىن بىر تۈرنى (مەسىلەن «تارىخ») تاللاپ ئىزدەڭ ← «تۈرى پەقەت كىتابلارغا قوللىنىلدى» دېگەن خەت چىقىدۇ؛ قۇرئان ۋە خاتىرە يەنىلا ئىزدىلىدۇ.
7. ئەخلەت ساندۇقىدىكى خاتىرە ھەرگىز چىقمايدۇ.

## Phase 5 — done

| Item | What changed | Tests |
|---|---|---|
| The key | The website's Supabase address and anon key, read from the web project's `.env.local` with a filter that printed those two lines only; the key's payload says `role: anon`. In `web-library.js` as constants marked public by design; `checkPublicKey` refuses `service_role` and `sb_secret_` when the client is made. | `web-key-is-public` |
| The catalog | `categories`, then `books` with `status=eq.published`, 1,000 rows a request, ordered by id; each book: title, author, category, description, pages, format, published and updated dates. Read once a session; «يېڭىلاش» reads it again. | `web-catalog` |
| The download | The website's gate first (a refusal shows the gate's own Uyghur message); `book_pages` in batches of 100 (`gte`/`lte`), joined with a blank line; a `markdown` book through `MarkdownText.toPlain`, now `src/markdown-text.js`, which the `.md` import also calls. 20 s timeout; a network error or 5xx retried twice (1.5 s, 4 s), a 4xx never; offline → «تورغا ئۇلىنالمىدى». | `web-gate-refusals`, `web-offline-and-retry`, `web-pages-in-batches`, `web-markdown-like-md-import` |
| The library | Migration step 8: `books.source`, `source_id`, `source_updated_at` (+ index). A book is found by its source first, then by its text's SHA-256; «توختىتىش» aborts before anything is written. An update: `replaceBookText` in one transaction — the new text, places clamped to its length, the website's date recorded. | `web-import-and-duplicates`, `web-cancel-leaves-no-half-book`, `web-update-keeps-places` |
| The page | A header button and a «ھۆججەت» menu item open the catalog: search, category and order (newest / title) filtered locally; per book «چۈشۈرۈش» → the category (same name → «باشقا» → «يېڭى تۈر قوشۇش») → «بەت x / y» + «توختىتىش» → «چۈشۈرۈلگەن — ئېچىش»; a newer version on the website → «تور بېتىدە يېڭىلانغان — يېڭىلاش», confirmed inline. After an update the screen reloads books, bookmarks and notes from the database (`syncBookmarks` would otherwise write the old places back). | checked in the dev app (below) |
| Privacy | `PRIVACY.md` (both languages, 28 October 2026): section 3 now has three situations; 3.3 names bilimhezinisi.com and its Supabase project, what a request carries (IP address, app name and version, which book) and that nothing from the library or the notebook is sent; section 2 lists the downloaded books' source and the PDF's recorded location. CLAUDE.md's «The network, exactly» lists every host main may contact. | — |

Checked in `npm run dev` against the live website: the catalog listed 66
published books in 17 categories; a short book (website id 1885) came down
through the app — 3,076 characters, its source recorded, «چۈشۈرۈلگەن —
ئېچىش» on reopening the catalog, «ئېچىش» opened the reader. With the DEV
library's recorded date set earlier, the card read «تور بېتىدە يېڭىلانغان —
يېڭىلاش», the inline question appeared, and the update ended at «چۈشۈرۈلگەن —
ئېچىش». The header measured at 900, 1040, 1299 and 1300 px: icon only at 900
(nothing overflows, the search box 181 px wide), «تور بېتىدىن» from 1040,
the full label from 1300. The DEV library was emptied again afterwards.

Found on the way: this machine's router answered SERVFAIL for
bilimhezinisi.com at times (public resolvers find it; Supabase's own host
always resolved). The catalog still opens then, but the gate cannot be
reached and the download says «تورغا ئۇلىنالمىدى». The app does not get
around the gate and does not ask another DNS service: both would be new
network behaviour. Listed under Deferred.

Not checked by a test: the dialog itself (it lives in `src/index.html`) —
the owner's checklist below.

### Phase 5 checklist for the owner (`npm run dev`)

1. ئۈستىدىكى «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» كۇنۇپكىسىنى بېسىڭ ← تور بېتىدە ئېلان قىلىنغان كىتابلار تىزىملىكى چىقىدۇ، ئۈستىدە «… كىتاب ئېلان قىلىنغان». (كۆزنەك تار بولسا كۇنۇپكا «تور بېتىدىن» ياكى پەقەت سىنبەلگە بولۇپ قىسقىرايدۇ؛ «ھۆججەت» تىزىملىكىدىمۇ بار.)
2. ئىزدەش رامكىسىغا بىر كىتابنىڭ ئىسمى ياكى ئاپتورىنى يېزىڭ، تۈر ۋە تەرتىپنى ئۆزگەرتىپ بېقىڭ ← تىزىملىك شۇئان سۈزۈلىدۇ.
3. قىسقا بىر كىتابنىڭ «چۈشۈرۈش» ىنى بېسىڭ ← تۈر تاللاش چىقىدۇ (تور بېتىدىكى تۈرنىڭ ئىسمى بىلەن ئوخشاش تۈر ئالدىن تاللانغان). «چۈشۈرۈشنى باشلاش» ← «بەت x / y» ئىلگىرىلەيدۇ، ئاخىرىدا «… چۈشۈرۈلدى» ۋە «ئېچىش».
4. «ئېچىش» نى بېسىڭ ← كىتاب ئوقۇغۇچتا ئېچىلىدۇ، تېكىستى تور بېتىدىكىدەك.
5. كاتالوگنى قايتا ئېچىڭ ← شۇ كىتابتا «چۈشۈرۈلگەن — ئېچىش» يېزىلغان. ئۇنى يەنە چۈشۈرگىلى بولمايدۇ (ئىككى نۇسخا بولمايدۇ).
6. ئۇزۇنراق بىر كىتابنى چۈشۈرۈۋاتقاندا «توختىتىش» نى بېسىڭ ← «چۈشۈرۈش توختىتىلدى — ھېچنېمە قوشۇلمىدى»، كۇتۇپخانىدا يېرىم كىتاب يوق.
7. تورنى ئۈزۈپ (Wi-Fi نى تاقاپ) دېتالنى قايتا ئېچىپ كاتالوگنى ئېچىڭ ← «تورغا ئۇلىنالمىدى» ۋە «قايتا سىناش»؛ دېتالنىڭ باشقا ھەممە ئىقتىدارى ئىلگىرىكىدەك ئىشلەيدۇ.
8. بىلىپ قويۇڭ: بۇ كومپيۇتېردىكى router بەزىدە bilimhezinisi.com نى تاپالمىدى. ئۇ چاغدا تىزىملىك ئېچىلىدۇ، لېكىن چۈشۈرۈش «تورغا ئۇلىنالمىدى» دەيدۇ — بىردەمدىن كېيىن قايتا سىناڭ. بۇ داۋاملىق يۈز بەرسە ئېيتىڭ.

## Phase 6 — done

| Item | What changed | Tests (red before → green after) |
|---|---|---|
| The pane | `src/parallel.js` (new): `Parallel.createSession` puts a pane after the reader's own area (`#rc`) with a divider: its own pages (`ReaderPlaces.paginate`), page navigation, font size (A-/A+) and search in the book (the whole book marked, as the reader's search does, ↑/↓ through the hits). It draws with the reader's `textToParagraphs(text, true, base)` and `highlightInHtml`, handed in — no second renderer. `src/parallel.css` (new) styles it. | `parallel-panes-paginate-apart`, `parallel-pane-search` — red: «window.Parallel is missing (src/parallel.js)» |
| Swap and close | «ئورنىنى ئالماشتۇرۇش»: the left book opens in the reader at its page, the right one moves to the pane at its page (its text from the reader, not read again); if the reader cannot open it, nothing moves. «تاقاش» (and closing the reader) removes the pane and divider and puts `#rc`'s `style` attribute back. | `parallel-swap-keeps-each-page`, `parallel-close-restores-the-reader` — red: the same |
| «بىللە سىيرىلىش» | Off whenever the pane opens; the tooltip says it is approximate. A turn turns the other side to the page at the same proportion of its book; a scroll moves it to the same proportion of its page; a scroll the session made is not echoed back. | `parallel-sync-moves-the-other-pane` — red: the same |
| Width | The two share the reader's width by the divider's ratio (20–80 %), `flex-grow` on each and `min-width: 0`; in this mode the reader's paddings are smaller and its page navigation wraps. | `parallel-narrow-window-never-overlaps` — red: the same |
| The reader | A toolbar button «يانمۇيان ئوقۇش» (its label from 1300 px, the icon below) opens a searchable list of the library without the open book, «ئاخىرقى قېتىمقى جۈپ» first. The pair and the ratio are kept in the setting `reader_parallel`. `renderReaderPage` tells the pane about a turn, `#rc`'s scroll about a scroll; Escape closes the list before the reader. | checked in the dev app (below) |
| The reader's toolbar | `#rh` had a fixed height of 52 px: below about 1100 px its last buttons wrapped onto the text (by 18 px at 900, 10 px at 1000 — measured before any change). It has a `min-height` now and grows to two rows instead. | measured (below) |

Departures from the work order, each small:
- `src/parallel.css` is a new file (the order named `parallel.js`, `index.html`, `reader-places.js`): the pane's styles live beside it, and the test page loads them, so the width test measures the real layout.
- The left pane always uses the automatic (smart) font. The reader's font menu stays with the right-hand book: one chosen font for an Arabic book and its Uyghur translation would suit only one of them.
- «بىللە سىيرىلىش» is not remembered: the order says off by default, and it is off each time the pane opens.
- The reader's toolbar height (above) — a fix the new button needed, since the order asks for 900 px to work.

Checked in `npm run dev` over the DevTools protocol, with Al-Baqara in
Arabic and its Uyghur translation (from the bundled seed files) added as two
test books and deleted again afterwards (with the `reader_parallel` setting
they left). The owner's own book in the DEV library — «مۇھەررىرلەرگە مەدھىيە»,
downloaded at 16:47 during the Phase 5 checklist — was left alone.
- The list: both other books, the filter, Escape closed the list and left
  the reader open.
- The Arabic book (21 pages) on the right, the translation (32 pages) on the
  left; the pane's own buttons and page box turned only the pane; A+ made the
  pane 19 px and left the reader at 17 px; «ئىبراھىم» found 19 places in the
  pane, none marked in the reader; the book on the left had **no** reading
  position afterwards, while the right one's was saved (page 4).
- «بىللە سىيرىلىش»: the reader's page 3 of 21 took the pane to page 4 of 32;
  the pane's next page took the reader to page 4; at 900 px, scrolling either
  side to the middle or the end took the other to the same proportion (0.5,
  1.0).
- 900 px with the notes panel open: at ratios 0.2, 0.5 and 0.8 the reader,
  divider, pane and panel stood side by side, nothing spilled, the toolbar
  wrapped above the text (83 px high).
- The divider dragged to 0.6 was stored; the swap gave 19 at page 4 ↔ 20 at
  page 7 → 20 at page 7 ↔ 19 at page 4, the titles changed sides; «تاقاش»
  left the reader full width; with the reader closed and opened again,
  «ئاخىرقى قېتىمقى جۈپ» brought the swapped pair back with the 0.6 divider
  and «بىللە سىيرىلىش» off. The setting itself survived a restart of the app.

Seen on the way, not changed: in the reader's automatic font a verse holding
«ى» (U+0649, which Arabic writes too) counts as Uyghur, so some Arabic verses
are drawn in the Uyghur font. That rule (`isArabicLine`) is older than 3.6.

### Phase 6 checklist for the owner (`npm run dev`)

1. ئەرەبچە بىر كىتابنى ئېچىڭ. ئۈستىدىكى «يانمۇيان ئوقۇش» (تار كۆزنەكتە پەقەت ئىككى ستونلۇق سىنبەلگە) نى بېسىڭ ← كۇتۇپخانىدىكى باشقا كىتابلار تىزىملىكى چىقىدۇ؛ ئىسمىنى يېزىپ سۈزگىلى بولىدۇ.
2. ئۇنىڭ ئۇيغۇرچە تەرجىمىسىنى تاللاڭ ← ئەرەبچە كىتاب ئوڭدا قالىدۇ، تەرجىمە سولدا ئېچىلىدۇ، ئوتتۇرىدا ئايرىغۇچ سىزىق بار.
3. سولدىكى «كېيىنكى بەت ←» نى بېسىڭ ← پەقەت سول تەرەپ ۋاراقلىنىدۇ. ئوڭدىكىنى ۋاراقلىسىڭىز، سول تەرەپ ئورنىدا قالىدۇ. ھەر تەرەپنىڭ A- / A+ ى ۋە ئىزدەش رامكىسى ئايرىم.
4. «بىللە سىيرىلىش» نى قوزغىتىڭ ← بىر تەرەپنى ۋاراقلىسىڭىز ياكى سىيرىسىڭىز، يەنە بىر تەرەپ تەخمىنەن ماس يەرگە بارىدۇ (جۈملىمۇ جۈملە ئەمەس — بۇ ھەقتىكى چۈشەندۈرۈش چاشقىنەكنى ئۈستىدە توختاتسىڭىز چىقىدۇ).
5. ئوتتۇرىدىكى ئايرىغۇچنى سۆرەڭ ← ئىككى تەرەپنىڭ كەڭلىكى ئۆزگىرىدۇ.
6. «ئورنىنى ئالماشتۇرۇش» (ئىككى ئوقلۇق سىنبەلگە) نى بېسىڭ ← ئىككى كىتاب ئورۇن ئالماشتۇرىدۇ، ھەر بىرى ئۆز بېتىدە قالىدۇ. خەتكۈچ، ئىزاھات ۋە ئوقۇش ئورنى ئەمدى ئوڭدىكى كىتابقا تەۋە.
7. «تاقاش» (×) نى بېسىڭ ← ئوقۇغۇچ بۇرۇنقىدەك يالغۇز كىتاب بولۇپ قالىدۇ.
8. ئوقۇغۇچتىن چىقىپ قايتا كىرىپ «يانمۇيان ئوقۇش» نى بېسىڭ ← ئەڭ ئۈستىدە «ئاخىرقى قېتىمقى جۈپ» بار؛ بېسىڭ ← ئىككى كىتاب ئاخىرقى قېتىمقىدەك ئېچىلىدۇ.
9. كۆزنەكنى ئەڭ تار قىلىڭ ← ئىككى تەرەپ تارىيىدۇ، بىر-بىرىنى ياپمايدۇ؛ ئۈستىدىكى كۇنۇپكىلار ئىككى قۇرغا چۈشىدۇ، تېكىستنى ياپمايدۇ.

## Measurements

| What | Result | Where measured |
|---|---|---|
| The bundled Uyghur translation | 6,236 verses; 185 runs of identical consecutive translations (149 × 2, 24 × 3, 6 × 4, 3 × 5, 2 × 6, 1 × 7) — as the work order says. Markers with a tatweel: **432** (the order said about 420); with a hyphen: **14** (order: 12); backwards: 20:29–30, 23:55–56; single markers with a stray separator or ZWJ: 17; markers mid-text or at the start: 15:97, 37:146, 69:31, 89:2; one verse with two markers: 6:5. After the union: **186 groups, 430 verses** (53:13–14 the only group of different texts) | probe over the XML, then `quran-groups-from-the-bundled-text`, Phase 1 |
| The 3.5 cleaner over the raw file | leaves a marker in **433** translations | `quran-cleaner-markers-out-words-untouched` (red run), Phase 1 |
| `quran_fts` after an UPDATE without 'rebuild' | `integrity-check` → «database disk image is malformed» | `quran-step-recleans-and-groups` with the rebuild taken out, Phase 1 |
| Reading the XML and building every verse's row and group | about 0.1 s | node, Phase 1 |
| `UthmanicHafs1.otf` digits | plain (`liga` off) **0.27 em** tall; with `liga` a run of digits becomes the verse-end medallion, **0.89 em** tall; «ن» 0.61 em. `UKIJ Ekran`: «152» 0.71 em, «١٥٢» 0.64 em | screenshots of 100 px text in the dev app, ink measured from the PNG, Phase 1 |
| Reading a 500-page text PDF | 916,344 characters in **483 ms**; the longest pause of a 20 ms timer during it: **21 ms** | dev app, Phase 2 |
| pdf.js and text beyond the page's edge | left out: a 1,854-character line set past the edge came back as 97 characters (the test PDF generator now wraps its lines) | dev app, Phase 2 |
| pdf.js `render()` in a window behind another one | display intent: never finishes (no frame; `requestAnimationFrame` never fires — `visibilityState` «hidden»); `intent: 'print'`: **20 ms** | dev app, Phase 2 |
| tesseract.js 5.1.1 inside Electron 28 | environment «electron» → a local `langPath` is fetched as an address → «Only absolute URLs are supported», thrown outside any promise; `{ code, data }` models → «initialization failed»; a `readOnly` cache at tessdata → works (3 pages of `eng` in 18 s, page render to text) | bare Electron main process, the dev app, `ocr-engine-answers`, Phase 2 |
| The test runner's hidden window | `requestAnimationFrame` **did** fire in this run (3.5 recorded that it never does); CLAUDE.md now says a test cannot count on either | `pdf-render-in-a-hidden-window` (first version), Phase 2 |
| The forms over the library's vocabulary (22 words) | words found: 725 as typed, 1,195 with the forms; an even sample of 30 added words all correct; 5 of 162 doubtful in the three longest lists (≈3 %) — after tightening (before: 3 of 30 wrong, «ئىمام» 31 of 31 wrong) | `spellcheck-data/frequencies.tsv`, Phase 3 |
| Search over 500 books / 100 MB (synthetic, real vocabulary at real frequencies) | today's search 1.97 s median, 2.16 s max (2.11 s before the case check); with the forms 2.06 s median, 2.32 s max; with the index still filling (every book scanned for the forms) 2.0–2.1 s — every book matched in this library, the worst case for the index | ELECTRON_RUN_AS_NODE script, Phase 3 |
| Where the search time goes | lower-casing 100 MB of Uyghur 586 ms (now skipped: no cased letter, a 67 ms check); `indexOf` over it 7 ms; the rest is reading the texts (the content cache holds 20 books) | probe, Phase 3 |
| The spell dictionary loads | 26 ms | search-forms, Phase 3 |
| The website's catalog | 66 published books, 17 categories — one request each (under the 1,000-row page) | dev app against the live site, Phase 5 |
| The header with the new button | 900 px: icon only, no overflow, search box 181 px; 1040–1299 px: «تور بېتىدىن»; 1300 px and wider: the full label | dev app, measured from the DOM, Phase 5 |
| The reader's toolbar before 3.6 | fixed at 52 px; its buttons reached 70 px at 900 px and 62 px at 1000 px — over the text; one row from 1100 px | hidden-window measurement of `#rh`, Phase 6 |
| The reader's toolbar with the new button | 900 px: two rows, 83 px, the text below it; 1000 px: 75 px; 1100–1299 px: one row (icon only); 1300 px and wider: one row with «يانمۇيان ئوقۇش» | the same, Phase 6 |
| Two panes at 900 px with the notes panel | ratio 0.2: reader 150 px, pane 489 px; 0.5: 333 / 306; 0.8: 517 / 122 — side by side, nothing spilled | dev app, Phase 6 |
| Name lookup for bilimhezinisi.com on this machine | the router answered SERVFAIL at times; public resolvers and the Supabase host resolved | name lookups on this machine, Phase 5 |

### Phase 1 checklist for the owner (`npm run dev`)

1. «قۇرئان كەرىم» نى ئېچىپ «فاتىھە» نى كۆرۈڭ ← ھەر ئايەتنىڭ ئاخىرىدىكى نومۇر ئوسمانى خەتنىڭ گۈللۈك چەمبىرى ئىچىدە، ئاسان ئوقۇغىلى بولىدىغان چوڭلۇقتا. ھەر تەرجىمىنىڭ ئاخىرىدا [1]، [2] … [7] بار.
2. «بەقەرە» نى ئېچىپ ئاستىغا سىيرىڭ ← ھېچقانداق تەرجىمىنىڭ ئىچىدە «(160ـ161)» دېگەندەك تىرناق ئىچىدىكى نومۇر قالمىغان. سۆز بار تىرناقلار (مەسىلەن «(يەنى …)») جايىدا.
3. 37-سۈرىنىڭ 151–169-ئايەتلىرىگە بېرىڭ ← 151-ئايەتنىڭ ئاستىدا «تەرجىمىسى 152-ئايەتنىڭ ئاستىدا [151 _ 152]» دېگەن كىچىك كۈلرەڭ قۇر بار؛ ئۇنى چەكسىڭىز 152-ئايەتكە بارىدۇ. 152-ئايەتنىڭ ئاستىدا تەرجىمە بىرلا قېتىم، ئاخىرىدا [151 _ 152]. 161–163 ۋە 167–169 مۇ شۇنداق ([161 _ 163]، [167 _ 169]).
4. 53-سۈرىنىڭ 13–14-ئايەتلىرى ← 13-ئايەتتە كۆرسەتكۈچ قۇر، 14-ئايەتنىڭ ئاستىدا ئۇزۇنراق تەرجىمە (13-ئايەتنىڭكى)، ئاخىرىدا [13 _ 14].
5. 151-ئايەتنى چېكىپ «تەرجىمىسى بىلەن كۆچۈرۈش» نى بېسىڭ، Notepad قا چاپلاڭ ← 151-ئايەتنىڭ ئەرەبچىسى، ئاندىن «…» [151 _ 152].
6. Ctrl نى بېسىپ تۇرۇپ 151 ۋە 152-ئايەتنى چېكىڭ، Ctrl+C، Notepad قا چاپلاڭ ← ئىككى ئايەتنىڭ ئەرەبچىسى، تەرجىمە بىرلا قېتىم، ئاخىرىدا [151 _ 152].
7. قۇرئاندا «يالغانچىلاردۇر» دەپ ئىزدەڭ ← 37:151–152 بىرلا كارتا بولۇپ چىقىدۇ، ئىچىدە ئىككى ئايەتنىڭ ئەرەبچىسى، تەرجىمىنىڭ ئاخىرىدا [151 _ 152].
8. خاتىرە دەپتىرىدە «قۇرئان» بەتكۈچىدىن 37:151 نى «ئىككىلىسى» بىلەن قىستۇرۇڭ ← تەرجىمىنىڭ ئاخىرىدا [151 _ 152]. «مەنبە» دىكى ئىزدەشتە تېپىلغان تەرجىمىنىڭ ئاخىرىدىمۇ نومۇر بار.
9. سۈرىنىڭ ئەڭ ئاستىدىكى مەنبە ئۇچۇرى (Tanzil، QuranEnc) ئىلگىرىكىدەك.
10. ئايەت نومۇرىنىڭ يېڭى كۆرۈنۈشى (گۈللۈك چەمبەر) سىزگە ياقمىسا ئېيتىڭ: باشقا تاللاش — بىزنىڭ ئاددىي چەمبىرىمىز ئىچىدە ئۇيغۇرچە خەتتىكى ئەرەبچە رەقەملەر (ئوسمانى خەت ئەمەس).

### Phase 2 checklist for the owner (`npm run dev`)

1. 100 بەتتىن كۆپ بەتلىك، تېكىستلىك (سىكان ئەمەس) بىر PDF نى «كىتاب قوشۇش» بىلەن ئەكىرىڭ ← ئوقۇۋاتقاندا «PDF ئوقۇلىۋاتىدۇ: بەت 120 / 512» دەك سان كۆرۈنىدۇ. قوشۇپ بولۇپ كىتابنى ئېچىڭ، ئەڭ ئاخىرقى بەتكە بېرىڭ ← PDF نىڭ ئاخىرقى بېتىدىكى تېكىست بار (بۇرۇن 100-بەتتە توختايتتى).
2. ئۇزۇن بىر PDF بار قىسقۇچنى «تۈركۈملەپ قوشۇش» بىلەن ئەكىرىڭ ← ئۇ كىتابنىڭمۇ ئاخىرقى بېتى بار (بۇرۇن 200-بەتتە توختايتتى).
3. سىكان قىلىنغان (رەسىملىك) بىر PDF ئەكىرىپ «UKIJ OCR (تورسىز)» نى بېسىڭ ← OCR بەتمۇبەت ئىلگىرىلەيدۇ. ئۇ ئىشلەۋاتقاندا باشقا بىر پروگراممىغا ئۆتۈپ، بىر-ئىككى مىنۇتتىن كېيىن قايتىپ كېلىڭ ← توختاپ قالماي داۋاملاشقان بولىدۇ.
4. 300 بەتتىن ئۇزۇن سىكان PDF بولسا ← ئىلگىرىلەش قۇرىدا «(PDF دا 512 بەت؛ ئالدىنقى 300 بېتى ئوقۇلىدۇ)»، ئاخىرىدا «300 / 512 بەت ئوقۇلدى» يېزىلىدۇ، «چۈشەندۈرۈش» رامكىسىغا بۇ ھەقتە بىر قۇر قوشۇلىدۇ (ئۆزگەرتسىڭىز ياكى ئۆچۈرسىڭىز بولىدۇ).
5. ئەسلى PDF كۆچۈرۈلمەيدۇ، ئورنىلا ئەستە قالىدۇ — بۇ باسقۇچتا كۆرۈنىدىغان ئۆزگىرىش يوق؛ 7-باسقۇچتا ئىشلىتىلىدۇ.

## Deferred

| Item | Why | When |
|---|---|---|
| A page map for Gemini OCR imports | The online engine reads two pages per request and returns one text, so where one page ends is not known. Changing its batching would be an AI change (out of scope for 3.6). Phase 7 places such pages like a book from before 3.6. | Phase 7, or a later release |
| A page map when the staged OCR text was cleaned by AI before «قوشۇش» | The AI rewrote the text; the ranges no longer fit it, so none are stored (by design). Phase 7 can realign. | Phase 7 |
| A way around a router that cannot find bilimhezinisi.com | Asking another DNS service (DNS over HTTPS) would be a new host and new network behaviour — a privacy change the owner decides. Until then the download says «تورغا ئۇلىنالمىدى» and a retry usually works. | If the owner wants it |
