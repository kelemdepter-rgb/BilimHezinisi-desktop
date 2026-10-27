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
| 2 | PDF import keeps every page; page starts and the original file remembered | not started | | |
| 3 | Search that understands Uyghur suffixes | not started | | |
| 4 | One search across the books, the Qur'an and the notebook | not started | | |
| 5 | «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» | not started | | |
| 6 | Two books side by side | not started | | |
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

## Measurements

| What | Result | Where measured |
|---|---|---|
| The bundled Uyghur translation | 6,236 verses; 185 runs of identical consecutive translations (149 × 2, 24 × 3, 6 × 4, 3 × 5, 2 × 6, 1 × 7) — as the work order says. Markers with a tatweel: **432** (the order said about 420); with a hyphen: **14** (order: 12); backwards: 20:29–30, 23:55–56; single markers with a stray separator or ZWJ: 17; markers mid-text or at the start: 15:97, 37:146, 69:31, 89:2; one verse with two markers: 6:5. After the union: **186 groups, 430 verses** (53:13–14 the only group of different texts) | probe over the XML, then `quran-groups-from-the-bundled-text`, Phase 1 |
| The 3.5 cleaner over the raw file | leaves a marker in **433** translations | `quran-cleaner-markers-out-words-untouched` (red run), Phase 1 |
| `quran_fts` after an UPDATE without 'rebuild' | `integrity-check` → «database disk image is malformed» | `quran-step-recleans-and-groups` with the rebuild taken out, Phase 1 |
| Reading the XML and building every verse's row and group | about 0.1 s | node, Phase 1 |
| `UthmanicHafs1.otf` digits | plain (`liga` off) **0.27 em** tall; with `liga` a run of digits becomes the verse-end medallion, **0.89 em** tall; «ن» 0.61 em. `UKIJ Ekran`: «152» 0.71 em, «١٥٢» 0.64 em | screenshots of 100 px text in the dev app, ink measured from the PNG, Phase 1 |

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

## Deferred

| Item | Why | When |
|---|---|---|
| — | | |
