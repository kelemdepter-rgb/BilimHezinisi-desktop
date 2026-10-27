# PROMPT 3.6 — كومپيۇتېر نەشرى: يېڭى ئىقتىدارلار (v3.6.0)

بۇ بۇيرۇق 3.5.0 نىڭ ئۈستىگە قۇرۇلىدۇ. سىز تاللىغان ئىقتىدارلار قوشۇلىدۇ، ئاخىرىدا نەشر **3.6.0** بولىدۇ.

## قانداق ئىشلىتىسىز

1. Claude Code نى دېتال قىسقۇچىدا ئېچىڭ:
   `E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc`
2. بىرىنچى قېتىم مۇنۇ بىر قۇرنى چاپلاڭ:

   ```
   Read prompts/3.6/PROMPT-3.6.md in full and execute it, starting with Phase 0.
   ```

3. Claude Code ھەر باسقۇچتىن كېيىن **توختايدۇ** ۋە نېمىنى سىناشنى ئۇيغۇرچە ئېيتىدۇ. `npm run dev` بىلەن سىناڭ
   (ئەسلى كۇتۇپخانىڭىزغا تەگمەيدۇ). جايىدا بولسا **«داۋاملاشتۇر»** دەڭ؛ مەسىلە بولسا رەسىمى بىلەن ئېيتىڭ.
4. تۈر ئۇزۇن بولۇپ كەتسە ياكى كېيىن داۋاملاشتۇرماقچى بولسىڭىز، **يېڭى تۈر** ئېچىپ مۇنۇنى چاپلاڭ:

   ```
   Read prompts/3.6/PROMPT-3.6.md in full, then prompts/3.6/PROGRESS.md, and continue with the next unfinished phase.
   ```

5. بىر ۋاقىتتا **بىرلا** Claude Code تۈرى ئىشلىسۇن.

## باسقۇچلار

| باسقۇچ | نېمە قىلىنىدۇ | سىز سىنايدىغىنى |
|---|---|---|
| 0 | تەييارلىق: ئايرىم شاخ، سىناقلار، پىلان خاتىرىسى | ھېچنېمە — Claude Code ئۆزى 1-باسقۇچقا ئۆتىدۇ |
| 1 | قۇرئان: ئايەت نومۇرى چوڭىيىدۇ؛ تەرجىمىنىڭ ئاخىرىدا [7]، بىرلەشكەن تەرجىمىدە [4 _ 6] | بىرنەچچە سۈرىنى ئېچىپ كۆرۈش |
| 2 | PDF ئەكىرىش: **100 بەتتىن كېيىنكى بەتلەر يوقىلىدىغان خاتالىق** ئوڭشىلىدۇ؛ ئەسلى PDF نىڭ ئورنى ۋە ھەر بەتنىڭ باشلىنىشى ئەستە قالىدۇ | 150 بەتلىك PDF ئەكىرىش |
| 3 | قوشۇمچىنى چۈشىنىدىغان ئىزدەش | «بالىلار» دەپ ئىزدەپ «بالا» نىمۇ تېپىش |
| 4 | بىرلا ئىزدەش: كىتابلار، قۇرئان كەرىم، خاتىرە دەپتىرىم — ھەر نەتىجىنىڭ قەيەردىن كەلگەنلىكى يېزىلىدۇ | بىر سۆزنى ئىزدەپ ئۈچ بۆلەكنى كۆرۈش |
| 5 | «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» | بىر كىتابنى چۈشۈرۈپ ئوقۇش |
| 6 | ئىككى كىتابنى يانمۇيان ئوقۇش | ئىككى كىتابنى يانمۇيان ئېچىش |
| 7 | PDF كىتابتا ئەسلى بەت رەسىمى بىلەن تېكىستنى يانمۇيان كۆرۈپ تۈزىتىش | بىر بەتنى تۈزىتىپ ساقلاش |
| 8 | نەشر 3.6.0: سىناق، نەشر خاتىرىسى، Store «What's new» تېكىستى | Store غا يوللاش (bilim-store-release) |

**سىزنىڭ قارارلىرىڭىز (2026-10-27):** بىرلەشكەن تەرجىمە ئاخىرقى ئايەتنىڭ ئاستىدا بىرلا قېتىم كۆرۈنىدۇ؛ تور
كۇتۇپخانىسى دېتال ئىچىدىكى تىزىملىك بولىدۇ؛ ئەسلى PDF كۆچۈرۈلمەيدۇ، ئورنى ئەستە تۇتۇلىدۇ؛ نەشر 3.6.0.

**بۇ نەشرگە كىرمەيدىغانلار:** Electron نى يېڭىلاش (ئايرىم نەشر)، كىتابتىكى Markdown ۋە ئۇلانمىلار، AI
ئىقتىدارلىرى («كۇتۇپخانامدىن سوراش» قاتارلىق)، تور بېتىگە خاتىرە ماسلاشتۇرۇش، تور بېتىنىڭ ئۆزىگە ئۆزگەرتىش.

---

# Bilim Hezinisi desktop — v3.6.0 work order

You are working on an existing, published Electron app. The owner is not a programmer and speaks
Uyghur. **Talk to the owner in Uyghur. Code, comments, commit messages and file contents stay in
English** (UI strings stay Uyghur, Arabic script).

## 0. Read before anything else

Read these in full before Phase 0, and again at the start of every new session:

1. `CLAUDE.md` — project rules, including the sections written during 3.5 («Notebook rules (3.5)»,
   «Reader, Qur'an and search (3.5)», «Library data safety (3.5)»). It wins over this file where they
   conflict; if a conflict matters, stop and ask.
2. `prompts/3.6/PROGRESS.md` — if it exists, it tells you which phase is next.
3. `prompts/3.5/PROGRESS.md` — how the 3.5 work was built (test runner, migrations framework,
   `src/textmap.js`, `src/reader-places.js`, `text-normalize.js`). Reuse those pieces; do not build
   second copies.

The owner decided these on 2026-10-27 (do not re-ask):

| Question | Decision |
|---|---|
| A translation shared by several verses | Shown **once, under the last verse of the group**, ending «[4 _ 6]»; the earlier verses show a short line pointing to it |
| «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» | A **catalog inside the app** (not the website in a window) |
| The original PDF of a book | **Not copied.** Its location is remembered; if it moved, the owner is asked to point to it |
| Version | **3.6.0** |

**The web edition is a reference you may read, never modify:**
`E:\ditallar\men yasigan ditallar\BilimHezinisi-website\`. Phase 5 reads data the website already
publishes; it adds nothing to the website. Never run the web project's scripts.

## 1. Working method (every phase)

Same rules as 3.5 — restated so this file stands alone:

- **Branch.** All work on `release/3.6`, created in Phase 0 from `main`. Merge to `main` only in
  Phase 8.
- **One logical change per commit**, conventional English messages. Never commit `dist/`,
  `node_modules/`, `*.appx`.
- **CRLF** in every file you edit or create; check `git diff --stat` that nothing was rewritten whole.
- **Syntax gate + tests:** `npm test` (it runs the syntax gate, the main-process suites on a temp
  database, and the renderer suites in a hidden window on Electron 28). For every bug: a test that
  FAILS first, then the fix, then PASS — record both in `prompts/3.6/PROGRESS.md`. Never weaken or
  delete a test to make it pass.
- **Measure, don't assume.** Anything that depends on Chromium 120's behaviour or on the owner's data
  (search speed, how many false matches a rule makes) is measured, and the number goes into
  `PROGRESS.md` and, if it is a rule, into `CLAUDE.md`.
- **Database changes are additive** steps of the existing `PRAGMA user_version` framework (the next
  free version after step 5). The framework already backs up before the first pending step.
- **Book text is user data.** Only Phase 7 changes a book's text, only on the owner's explicit save,
  and every such change can be undone.
- **Network:** the renderer CSP stays `connect-src 'self'`. Only the main process talks to the
  network, and Phase 5 adds exactly two hosts (the website and its Supabase project), only when the
  owner opens the catalog or downloads a book. Nothing else new reaches the network.
- **No new runtime dependency** without asking (pdf.js, better-sqlite3, docx, turndown are here).
- **User-facing text:** Uyghur, short, calm; `toast()` for messages; no `window.prompt()`; no new
  renderer `confirm()` (inline confirmation instead); native dialogs only in main for app-level
  decisions.
- **Never touch:** `build.appx` values, the data folder name `JamiyKutupxana`, the Qur'an texts and
  their attribution, the licensed-font rules. **Never break a working feature to satisfy this
  document** — stop, explain in Uyghur, ask.
- **End of every phase:** `npm test` green → update `PROGRESS.md` (status, commits, tests,
  measurements, deferred items) → a short Uyghur checklist for the owner with the expected result of
  each step → **stop** and wait for «داۋاملاشتۇر» (Phase 0 continues straight into Phase 1).
- **Long sessions:** finish the current item, commit, update `PROGRESS.md`, and give the owner the
  resume line from the top of this file. Never leave the tree half-edited.

---

## Phase 0 — Groundwork

1. `git status`, `git log --oneline -10`. Expected: `main` at the 3.5.0 merge (`2485cd9` or later).
   Untracked planning files under `prompts/` are the owner's: commit only `prompts/3.6/`
   (`docs: add the 3.6 work order`) as the first commit on the new branch; leave the rest alone.
   Anything else you did not make → stop and ask.
2. `git switch -c release/3.6`.
3. `npm test` must be green before anything changes. If it is not, stop and report.
4. Create `prompts/3.6/PROGRESS.md` (phases 0–8: status, commits, tests; a «Measurements» list; a
   «Deferred» list). Commit.
5. `CLAUDE.md`: add an empty section «3.6» that later phases fill with their rules. Commit with
   `PROGRESS.md` or on its own.

Continue into Phase 1.

---

## Phase 1 — Qur'an: verse numbers that can be read

Files: `scripts/seed-quran.js`, `database.js`, `src/quran.js`, `src/quran.css`, `src/notes.js`
(verse insert), and wherever a verse is copied.

### What the data really is (measured on `assets/seed/uyghur_saleh_v1.0.2-xml.1.xml`, 2026-10-27)

- 6,236 verses. Each translation ends with its number in parentheses: «…ئىگىسىدۇر(4).»
- **185 groups** of consecutive verses carry the **identical** translation text — the translator
  rendered them as one sentence and the file repeats it under each verse. Sizes: 149 × 2, 24 × 3,
  6 × 4, 3 × 5, 2 × 6, 1 × 7. Their marker is a range: «(160ـ161)».
- Range separators: **ARABIC TATWEEL U+0640** in ~420 markers («(160ـ161)», «(13 ـ 14)»), a hyphen in
  12, sometimes written backwards («(56- 55)»). 17 single markers carry a stray separator or a ZWJ
  («(54 ـ )», «(-144)», «(ـ51)», «(\u200D88)»). Four verses have the marker mid-text or at the start
  (15:97, 37:146, 69:31, 89:2).
- **One exception:** 53:13 and 53:14 both end «(13ـ14)» but their texts differ — 53:14's is a
  shortened copy of 53:13's.
- Parentheses that hold words are translation text and stay: 58:4 «(60 مىسكىنگە بىر ۋاخ تاماق بېرىشى
  لازىم)».
- `cleanUyghurTranslation()` in `scripts/seed-quran.js` strips `\([\d،,\s\-]+\)` — **it misses every
  tatweel and ZWJ marker**, so about 430 verses in the owner's database still show «(160ـ161)» inside
  the translation today.

### What to build

- **Markers out, words untouched.** Extend the cleaner to remove a parenthesised group only when it
  holds nothing but digits and separators (`0-9`, `٠-٩`, spaces, `-`, `–`, U+0640, `،`, `,`,
  U+200D/U+200C). A test runs the new cleaner over all 6,236 verses and proves that, for every verse,
  the text it removed is only such groups — no letter of the translation is ever removed or changed.
- **Each verse knows its translation group.** New migration step: columns `ug_from`, `ug_to` on
  `quran_ayas`. Compute from the bundled XML (the source of truth, never from the cleaned column):
  group = consecutive verses with identical text, unioned with the range in the marker (order
  normalised, so «56- 55» is 55–56); a single verse is `ug_from = ug_to = aya`. In the same step,
  re-clean `text_ug` for every verse from the bundled XML. `quran_fts` is an external-content FTS5
  table (`content='quran_ayas'`) with insert and delete triggers and **no update trigger**, so after
  the update run `INSERT INTO quran_fts(quran_fts) VALUES('rebuild')` once inside the step (or issue
  the 'delete' with the old values per changed row). Tests pin the counts above, 53:13–14 as one
  group, 58:4's words, and that a search for a word of a re-cleaned verse finds it.
- **The mushaf view** (`renderSura`):
  - The verse number in the Arabic line is too small (14 px digits in a 36 px ring beside 28 px
    text). Size it in `em` against the Arabic text — digits about 0.75 em, the ring growing with them
    — so it stays readable at any font size. Keep Arabic-Indic digits in the Uthmani face.
  - After each translation, the number in square brackets with Western digits, as the owner wrote
    them: «… ئىگىسىدۇر. [4]». A group shows its translation **once, under the last verse of the
    group**, ending «[4 _ 6]» — exactly `[` + from + ` _ ` + to + `]`, underscore U+005F with one
    space on each side, in that logical order inside the right-to-left paragraph (no left-to-right
    isolation, so a right-to-left reader meets 4 first, as in the owner's message). For 53:13–14
    show the longer of the two texts.
  - The earlier verses of a group show, instead of a translation, one small grey line
    «تەرجىمىسى 6-ئايەتنىڭ ئاستىدا [4 _ 6]»; clicking it scrolls to that verse.
- **Everywhere a verse leaves the mushaf** — copy, «قىستۇرۇش» into a note, Qur'an search results, the
  notebook's source search — the translation carries its label: «[7]» or «[4 _ 6]». Copying or
  inserting a run of verses that covers a whole group writes that group's translation once.
  Search results list a group once, not once per verse.
- Re-check the sura footer attribution is unchanged.

**Manual checklist (Uyghur):** open Al-Fatiha, Al-Baqara, sura 37 around verses 151–169, sura 53
around 13–14; the numbers are easy to read; every translation ends with [n] or [n _ m]; no «(…ـ…)»
left inside a translation; copy a verse inside a group and paste it into Notepad.

---

## Phase 2 — PDF import keeps every page, and remembers where each page starts

Files: `src/index.html` (`handleFileResult`, `startPdfOcr`, batch import), `main.js`, `database.js`,
`preload.js`.

### The bug (found 2026-10-27)

- A text-layer PDF imported on its own stops at **page 100**
  (`const total=Math.min(pdf.numPages,100)`), while the dialog says «(N بەت)» with the full count.
  Pages 101+ are silently lost. Batch import stops at **page 200** the same way. Scanned-PDF OCR stops
  at **300** (that cap is intended — OCR is slow — but it is never said).

### What to build

- Extract **every** page of a text-layer PDF, with progress. Measure a 500-page PDF; keep the UI
  responsive (yield between pages).
- OCR keeps its 300-page cap, but the progress text and the result say plainly how many pages were
  read out of how many («300 / 512 بەت ئوقۇلدى»), and the add-book dialog pre-fills a line about it
  in the description, which the owner can edit.
- **Page starts.** New migration step: table `book_page_map(book_id, page_no, start, end,
  PRIMARY KEY(book_id, page_no))` (cascade on book delete). Every PDF import — single, batch, OCR —
  records, for each PDF page, the character range it occupies in the stored text (an empty OCR page
  gets an empty range at its position). Keep the joins exactly as they are today (`'\n'` between
  text-layer pages, `'\n\n'` between OCR pages) so existing reading behaviour does not change.
  Record the map **after** the text is normalised by `text-normalize.js`, or map it through the
  normalisation, so the offsets are true for the stored text (test this with a PDF that contains
  presentation forms).
- **The original file.** Use the existing, never-filled column `books.original_path` and add
  `original_size`, `original_mtime`, `original_sha256` in the same migration step. Store them at import. Never copy the PDF. Main exposes `pdf-original-status(bookId)` →
  `found | moved | missing`, and `pdf-locate-original(bookId)` (open dialog → hash check; a different
  file is accepted only after the owner confirms in the dialog that it is the same book).
- Tests: a generated 150-page text PDF imports all pages; the page ranges are consecutive and never
  overlap, and together with the join characters they cover the whole text; batch import likewise; the OCR cap message.

**Manual checklist (Uyghur):** import a PDF with more than 100 pages (text PDF) and check the last
page's text is in the book; batch-import a folder with a long PDF.

---

## Phase 3 — Search that understands Uyghur suffixes

Files: new `search-forms.js` (main, CommonJS), `database.js` (`searchBooks`, Qur'an and notes
search), `main.js`, `preload.js`, `src/index.html` (search bar, results, reader highlight).

### Today

`searchBooks` is a case-insensitive **substring** search (the owner's 3.5 decision) — «كىتاب» already
finds «كىتابلار». What it cannot do: a word typed with a suffix finds only that exact form
(«مەدرىسىلەردە» does not find «مەدرىسە»), and a stem whose last vowel or consonant changes before a
suffix is missed («بالا» → «بالىلار», «ئاياق» → «ئايىغى», «يۈرەك» → «يۈرىكى»).

### What to build

- `search-forms.js`: `formsFor(word)` → `{ base, forms }`, built on the spellcheck engine already in
  main (`src/spellcheck/dictionary.js` — `hasWord`, `isKnownStem`, `normalizeForLookup`,
  `isCheckable`; `src/spellcheck/morphology.js`; the suffix lists in `suffixes.generated.js`). For a
  Uyghur word of 3+ letters:
  1. **Find the base.** The word itself if it is a dictionary word with no shorter base; otherwise
     strip known suffixes (longest first) to a stem that is a dictionary word or known stem
     (`MIN_STEM`), then undo the stem changes Uyghur makes before a suffix: a final ى that was ا or ە
     («بالى» → «بالا», «مەدرىسى» → «مەدرىسە»), and a final غ/گ that was ق/ك with the vowel before it
     raised («ئايىغ» → «ئاياق»). Accept a reconstruction only if it is a dictionary word.
  2. **Generate the forms to look for:** the base and its changed stems (last ا/ە → ى; final
     ق → غ and ك → گ with that vowel change).
  3. A form matches in text only **at the start of a word** and only if what follows it, up to the
     end of the word, is empty, a known suffix, or makes a dictionary word. The plain substring hit
     of the exact query is always kept, so the toggle can only add results, never remove one.
- Arabic-script **Arabic** words (non-Uyghur letters, tashkil) keep today's Arabic normalisation; no
  morphology.
- Several words: apply `formsFor` to each word and require them in order, separated only by
  whitespace/punctuation.
- **Speed:** target < 3 s over 500 books. Use the rebuilt `book_fts` index to pick candidate books
  with prefix queries for the forms, then scan only those books; measure on the DEV library and a
  synthetic 500-book library, write the numbers into `PROGRESS.md`.
- **UI:** a switch in the search bar, «قوشۇمچىلىرى بىلەن», on by default, remembered. When forms were
  added, one line under the results: «ئىزدەلگەن شەكىللەر: بالا، بالى…». Snippets highlight the word
  actually found. The reader's highlight and match navigation take a **list** of surface forms (today
  `openReader(id, hl)` builds one regex from one string) so every found form is marked and counted.
- **Quality, measured:** a test table of at least 30 pairs (query → must find / must not find),
  including: «بالىلار» → «بالا»; «مەدرىسىلەردە» → «مەدرىسە»، «مەدرىسىدە»; «ئاياق» → «ئايىغى»;
  «يۈرەك» → «يۈرىكى»; «كىتابلىرىمىز» → «كىتاب»، «كىتابلار»; and short words that must not explode
  (a 2-letter word gets no forms). Then on the DEV library, for 20 common words, count results with
  the switch off and on and hand-check 10 of the added ones; record the false-match rate. If it is
  high, tighten (the narrower ACCEPT suffix tier) rather than ship noise, and say so to the owner.
- Record the rules in `CLAUDE.md` («3.6»).

**Manual checklist (Uyghur):** search «بالىلار», «مەدرىسىلەردە», «ئاياق» with the switch on and off;
open a result and see every found form highlighted.

---

## Phase 4 — One search across the books, the Qur'an and the notebook

Files: `src/index.html` (`doSearch`, `renderSearch`), `main.js`, `database.js`, `preload.js`.

- The top search bar searches **all three** at once: books (title, author, text — today's search,
  with Phase 3's forms), the Qur'an (Arabic with today's normalisation, the Uyghur translation with
  Phase 3's forms), the notebook (title and text, trash excluded — today's `notes-search`, with the
  forms).
- Results come in three sections, in this order, each with its name and count: «كىتابلار (12)»,
  «قۇرئان كەرىم (5)», «خاتىرە دەپتىرىم (2)». **Every result card carries its source as a small label**
  — «كىتاب», «قۇرئان كەرىم», «خاتىرە دەپتىرىم» — so a card is never ambiguous even out of its section.
  Above the results, filter chips: «ھەممىسى · كىتابلار · قۇرئان كەرىم · خاتىرە دەپتىرىم».
- Each section shows its first results and «يەنە كۆرسىتىش»; the existing pagination keeps working for
  books.
- Opening a result: a book → the reader at that occurrence, highlighted (today's behaviour); a verse
  → the Qur'an view at that verse, selected; a note → the notebook with that note open and the found
  words highlighted with the find highlight (no markup written into the note).
- Category filter applies to books only; say so next to the chips when a category is selected.
- Search history keeps working and records the query once.
- One IPC per source, run in parallel; a slow source never blocks the others from showing.
- Tests: a query present in all three; a query only in a note; a trashed note never appears; Qur'an
  groups appear once with their [n _ m] label.

**Manual checklist (Uyghur):** search a word that is in a book, a verse and a note; check the three
sections and labels; open one of each.

---

## Phase 5 — «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش»

Files: new `web-library.js` (main), `main.js`, `preload.js`, `database.js`, new `src/web-library.js`
(renderer), `src/index.html`, `PRIVACY.md`.

### What the website already offers (read it there, change nothing)

- Published books are readable by anyone: Supabase tables `books` (id, title, author, category_id,
  description, page_count, content_format `text|markdown`, status, published_at, updated_at),
  `categories` (id, parent_id, name, sort_order) and `book_pages` (book_id, page_no, content), all
  under row-level security that lets the public read **published** books only.
- `https://bilimhezinisi.com/api/books/<id>/download` is the gate the website itself calls before a
  whole-book download: it refuses drafts and **rate-limits per address (20 downloads / 10 minutes)**,
  answering with a Uyghur `message` on refusal, and returns `{ ok, title, author, pageCount,
  contentFormat }`.
- The website then reads pages from Supabase in batches of 100 (`lib/books/download.ts`) and joins
  them with a blank line (`lib/books/export-book.ts`). Read both files and do the same.
- The website's project runs on free tiers (5 GB of database egress a month). Be a polite client.

### The public key

The desktop needs the website's **public** Supabase URL and anon key — the same two values every
visitor's browser receives. Read **only** the lines `NEXT_PUBLIC_SUPABASE_URL=` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY=` from the web project's `.env.local` with a filtering command (for
example `grep '^NEXT_PUBLIC_SUPABASE_' .env.local`, or `findstr /B "NEXT_PUBLIC_SUPABASE_" .env.local`
in cmd). **Never open, print or copy any other line of that file** — it holds a service-role secret.
Check the key before using it: a JWT whose payload `role` is `anon`, or a key starting
`sb_publishable_`; anything else (`service_role`, `sb_secret_`) → stop and tell the owner. Store the
two values in `web-library.js` with a comment saying they are public by design (every visitor's
browser receives them) and protected by the website's row-level security. If GitHub push protection
or any secret scanner flags the commit, stop and ask — never bypass it.

### What to build

- **Toolbar:** a button **«بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش»** directly beside «كىتاب قوشۇش» in the
  top bar (same style as «تور بەت قوشۇش», a download/globe icon), and the same item in the «ھۆججەت»
  menu beside «تور بەت قوشۇش (URL)». The bar must still fit at the window's minimum width (900 px):
  measure; if it does not, shorten only the visible label at narrow widths and keep the full text as
  the tooltip.
- **Catalog dialog** (renderer, same look as the app's other dialogs): loads the published books and
  categories through main; shows each book with its generated cover (`bookCover`), title, author,
  category, page count and the start of its description; a search box filtering title, author and
  description locally (lower-case, tatweel stripped); a category filter; sort by newest or title.
  Each book has «چۈشۈرۈش»; a book already downloaded shows «چۈشۈرۈلگەن — ئېچىش»; one that changed on
  the website since shows «تور بېتىدە يېڭىلانغان — يېڭىلاش».
- **Download:** main calls the gate first (show its `message` as-is on refusal), then reads the pages
  in batches of 100, **one request at a time**, with progress «بەت 300 / 512» and «توختىتىش». Join
  as the website does; `markdown` books become plain text with the same converter the app uses for
  `.md` imports (`markdownToPlainText`, today inside `src/index.html`: convert in the renderer, or move
  it to a shared module the way `src/reader-places.js` is shared — one copy, never two). Save through
  the normal add-book path, so normalisation (`text-normalize.js`), the search index and the
  duplicate checks all apply.
- **Category:** preselect the desktop category with the same name as the website's; otherwise offer
  «باشقا» or «يېڭى تۈر قوشۇش: <name>».
- **Where it came from:** new migration step — `books.source`, `books.source_id`,
  `books.source_updated_at`. A downloaded book has `source = 'bilimhezinisi.com'`. «يېڭىلاش»
  replaces the text after an inline confirmation that says bookmarks may shift slightly; bookmarks,
  notes and the reading position keep their offsets (clamped to the new length).
- **Manners:** one download at a time; no «download everything»; the catalog is fetched once per
  session (a «يېڭىلاش» button refreshes it); 20 s timeouts; retry network errors twice with backoff,
  never a 4xx; a `User-Agent` naming the app and version. Offline → «تورغا ئۇلىنالمىدى» and nothing
  else changes.
- **Privacy:** update `PRIVACY.md` (and its date): when the owner opens this catalog or downloads a
  book, the app contacts bilimhezinisi.com and its database provider; the request carries the IP
  address, the app version and which book is downloaded — nothing from the library or the notebook.
  Update the «Network» rule in `CLAUDE.md` to list exactly the hosts the main process may contact.
- **Tests (no real network):** inject the fetch function. Catalog parsing; gate refusals (404, 429
  with its message); batching, order and a missing page; markdown → text parity with the `.md`
  import; duplicate by `source_id`; the «updated» badge; cancel mid-download leaves no half book; the
  key check rejects a service-role JWT and `sb_secret_`.

**Manual checklist (Uyghur):** click the new button; search the catalog; download a short book and
read it; open the catalog again — it shows «چۈشۈرۈلگەن»; try with the network off.

---

## Phase 6 — Two books side by side

Files: new `src/parallel.js`, `src/index.html`, `src/reader-places.js` (reuse only).

- In the reader's toolbar, «يانمۇيان ئوقۇش»: pick a second book (a searchable list of the library).
  The current book stays on the right, the second opens on the left, with a draggable divider and
  «ئورنىنى ئالماشتۇرۇش» to swap them and «تاقاش» to close the second.
- Each pane has its own pages (`ReaderPlaces.paginate`), page navigation, font size and search in
  book. Rendering reuses the reader's paragraph rendering and smart Arabic/Uyghur font switching — do
  not write a second renderer.
- «بىللە سىيرىلىش» (off by default): when on, scrolling one pane moves the other to the same
  proportion of its current page, and turning a page turns the other's to the page at the same
  proportion of its book. Say in a tooltip that this is approximate.
- Bookmarks, in-book notes, the AI panel and reading-position saving stay with the main (right)
  book, exactly as today; the left pane saves nothing.
- The pair and the divider position are remembered for next time («ئاخىرقى قېتىمقى جۈپ»).
- Works at the minimum window width (900 px): the panes may narrow, never overlap.
- Tests: pagination per pane is independent; swapping keeps each pane's page; closing restores the
  normal reader.

**Manual checklist (Uyghur):** open an Arabic book and its Uyghur translation side by side; turn pages
in each; switch on «بىللە سىيرىلىش»; swap; close.

---

## Phase 7 — The PDF page beside its text: compare and correct

Files: new `src/pdf-compare.js`, `src/index.html`, `main.js`, `database.js`, `preload.js`.

- In the reader, for a book whose format is PDF: «ئەسلى بەت بىلەن سېلىشتۇرۇش». It opens a view with
  the text of one **PDF page** on the right (editable, plain text, RTL, the reader's font) and that
  page's image on the left (rendered with the bundled pdf.js, zoom in/out/fit width), page navigation
  by PDF page number.
- **Finding the PDF:** `pdf-original-status` (Phase 2). `moved`/`missing` → a banner
  «ئەسلى PDF تېپىلمىدى» with «PDF نى كۆرسىتىپ بېرىش» (`pdf-locate-original`). Read the PDF once per
  view through main; render only the visible page; measure a 100 MB PDF and keep the window
  responsive.
- **Books imported before 3.6** have no page map. When the owner points to their PDF:
  - text-layer PDF → extract each page's text and align it to the stored text in order (normalise
    both sides the same way; locate each page's first and last words; write the map; report pages
    that could not be placed);
  - scanned PDF → start from a proportional estimate and offer «بۇ بەتنى تېكىستتىن تېپىش»: OCR that
    one page offline with the existing engine and place it by the best trigram overlap with the text
    around the estimate. A placed page is saved to the map; an estimated one is marked «تەخمىنىي»
    and cannot be saved over until it is placed.
- **Saving a correction** (only on «ساقلاش»): replace exactly that page's range in the book text,
  then in one transaction: shift every later page range in `book_page_map`; shift `char_offset` of
  bookmarks, in-book notes and the reading position that lie after the edit (those inside it move to
  its start); rebuild the book's `book_fts` row; clear the content cache; log the edit in a new table
  `book_edits(id, book_id, page_no, start, old_text, new_text, created_at)`. «ئەسلىگە قايتۇرۇش»
  undoes the latest edit of that page through the same path. Notebook citations keep working because
  they locate their word near the stored offset.
- **Help with the correction:** «بۇ بەتنى قايتا OCR قىلىش (تورسىز)» puts the fresh OCR in a preview
  beside the current text (never over it without a click); if the AI is on, «AI بىلەن تۈزىتىش (تور)»
  runs the existing OCR-cleanup prompt on this page only, also into the preview. Applying a preview is
  an edit like any other (save, undo).
- Tests: an edit shifts later pages, bookmarks and the reading position correctly; undo restores the
  text and every offset byte for byte; alignment of an old text-layer book; a moved PDF is found again
  by hash.

**Manual checklist (Uyghur):** open a PDF book, compare a page, fix a word, save, find the fix in the
reader and in search, undo it; move the PDF to another folder and point the app to it.

---

## Phase 8 — Release 3.6.0 (no publishing)

1. `npm test` and the syntax gate — all green.
2. `npm version 3.6.0 --no-git-tag-version`. The app shows «V3.6». `build.appx` byte-identical to
   `main`.
3. `RELEASE-NOTES-v3.6.0.md`: Uyghur first, then English; the PDF-truncation fix first, then the new
   features; how the website download respects the site's limits. The Partner Center «What's new in
   this version» text in English and in Uyghur, **each ≤ 1,500 characters** — print the counts.
4. `PRIVACY.md` updated in Phase 5 — confirm the date and wording. `THIRD-PARTY-NOTICES.md`: nothing
   new is bundled — confirm.
5. `CLAUDE.md`: the feature list, the «3.6» rules, the roadmap without what shipped.
6. Update `PROGRESS.md`, merge `release/3.6` into `main`. **Do not tag, do not push, do not build the
   Store package** — that is the owner's step with the Cowork skill **bilim-store-release**.
7. Final report in Uyghur: what changed, what to check once with `npm start` on the real library (the
   migrations take a backup first), and the next step.

## Out of scope for 3.6 (do not start these)

Electron upgrade; Markdown rendering and in-book links in the reader; any AI feature beyond reusing the
OCR-cleanup prompt in Phase 7; syncing notes with the website; uploading to the website; any change to
the web project; copying PDFs into the library. If one becomes necessary for an item above, stop and
ask.
