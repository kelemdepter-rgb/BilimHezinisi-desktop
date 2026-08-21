# Third-Party Notices — بىلىم خەزىنىسى (Bilim Hezinisi)

This application bundles third-party fonts, texts and software libraries.
Each item below is redistributed under the licence stated for it. The MIT
licence in `LICENSE` applies only to the original source code of this project.

Last reviewed: 2026-08-16

---

## 1. Fonts

### UKIJ font family — LGPL
Files: `assets/ukijekran.ttf`, `assets/fonts/UKIJEsliye*.ttf`,
`assets/fonts/UKIJTuz*.ttf`

- Copyright: Uyghur Computer Science Association (UKIJ) — <http://www.ukij.org>
- Designer: Tursun Sultan
- Licence: GNU Lesser General Public License —
  <http://www.gnu.org/licenses/lgpl.html>
- The fonts are bundled unmodified. The complete LGPL text is available at the
  URL above, and the original font files may be obtained from
  <http://www.ukij.org/fonts>.

### KFGQPC Uthmanic Hafs — free redistribution licence
Files: `assets/fonts/UthmanicHafs1.otf`, `assets/fonts/UthmanicHafs1B.otf`,
`assets/UthmanicHafs1 Ex1 Ver12.otf`, `assets/UthmanicHafs1B Ex1 Ver12.otf`

- Copyright (c) 2010 King Fahd Glorious Quran Printing Complex (KFGQPC),
  Al-Madinah Al-Munawwarah, Kingdom of Saudi Arabia. All rights reserved.
- ISBN 978-603-8010-15-0, Accession No. 1430/7278
- Designer: Alif Lam Mim Tech. (Ashfaq A. Niazi)
- Source: <http://fonts.qurancomplex.gov.sa/>
- Licence (from the font's embedded EULA): *"Permission is hereby granted,
  Free of Cost, to any person obtaining a copy of this Font accompanying this
  license, the rights to Use, Copy, Distribute"*, subject to the condition
  that the font software is not sold, modified, altered, translated, reverse
  engineered, decompiled or disassembled.
- The fonts are bundled **unmodified**, as required.

### Traditional Arabic — NOT bundled
`'Traditional Arabic'` is offered as a reading font, but the font file is
**not** included in this package. It is resolved from the Windows operating
system, where it ships as a Microsoft-supplied Monotype font whose licence
does not permit redistribution inside third-party applications. On systems
where it is unavailable the app falls back to another serif face.

### Liberation Fonts / Foxit fonts (via pdf.js)
Files: `assets/pdfjs/standard_fonts/`

- Liberation Fonts — SIL Open Font License 1.1. See
  `assets/pdfjs/standard_fonts/LICENSE_LIBERATION`.
- Foxit standard fonts — see
  `assets/pdfjs/standard_fonts/LICENSE_FOXIT`.

---

## 2. Qur'an text and translation

### Arabic text — Tanzil Qur'an Text (Uthmani, Hafs), version 1.1
File: `assets/seed/quran-uthmani-hafs.txt`

- Copyright (C) 2007-2025 Tanzil Project — <https://tanzil.net>
- Licence: Creative Commons Attribution 3.0 — <https://tanzil.net/docs/text_license>
- Permission is granted to copy and distribute **verbatim** copies of this
  text, but **changing it is not allowed**. The source is clearly identified
  as the Tanzil Project, and a link to <https://tanzil.net> is provided so
  users can keep track of changes.
- The full Tanzil copyright notice is preserved verbatim inside the text file
  itself and is not stripped at build or seed time.

### Uyghur translation — Shaykh Muhammad Salih
Files: `assets/seed/uyghur_saleh_v1.0.2-xml.1.xml`,
`assets/seed/uyghur_saleh_v1.0.2-excel.1.xlsx`

- Translation of the meanings of the Noble Qur'an into Uyghur.
- Publisher / source: **QuranEnc.com** — Encyclopedia of the Noble Qur'an,
  <https://quranenc.com/en/browse/uyghur_saleh>
- Version redistributed: **v1.0.2-xml.1** (updated 2025-09-03)
- Redistributed under QuranEnc's publishing terms: the text is reproduced
  **without alteration or deletion**, the publisher and source are clearly
  credited, the version number is stated, the embedded metadata is preserved,
  and no advertising is displayed alongside the Qur'anic content.
- Updates: <https://quranenc.com/check/uyghur_saleh/v1.0.2-xml.1>

---

## 3. Language data

### Uyghur spell-check word list
Files: `assets/spellcheck/uyghur_words.txt` (source, not shipped since 3.2.0),
`assets/spellcheck/uyghur-dict.bin`, `assets/spellcheck/uyghur_corrections.json`

- Derived from **UyghurSpell** — <https://github.com/gheyret/UyghurSpell>
- MIT License, Copyright (c) 2022 Uyghur. Full text in
  `assets/spellcheck/raw/LICENSE_imlalughet`.
- Since 3.2.0 the app ships `uyghur-dict.bin`, a binary re-encoding of that same
  word list (one byte per Uyghur letter, front-coded) built by
  `npm run build-spelldict`. The words are unchanged; the licence is unchanged.

### Uyghur corpus-derived spell-check data
Files: `assets/spellcheck/uyghur-dict.bin` (the flags byte of each word),
`assets/spellcheck/uyghur_corrections.json` (the reviewed additions),
`spellcheck-data/*` (build inputs, not shipped),
`src/spellcheck/suffixes.generated.js`, `src/spellcheck/edit-weights.generated.js`

Three tables that are not a third party's work — they were measured from this
project's own material and are published with it:

- **Word frequencies and the productive-stem list** — how often each word occurs
  across the 15 books published in this project's own library, as log2 buckets,
  and which stems the dictionary inflects widely. Counted from that library.
- **Suffix tables** (525 accept, 2,576 suggest) — mined from the word list
  itself: wherever one dictionary word is another dictionary word plus a tail,
  that tail is a candidate suffix.
- **Edit weights** (158 segment rewrites, 75 character confusions) — counted
  from the hand-collected `uyghur_corrections.json` pairs above, four fifths of
  them, with the remaining fifth held out of the counting.
- **1,717 words and 326 correction pairs** admitted after reviewing candidates
  drawn from that same library, one line at a time (`spellcheck-data/vocabulary.txt`).

Licence: **CC BY-SA 4.0** — <https://creativecommons.org/licenses/by-sa/4.0/> —
Copyright (c) 2026 Bilim Hezinisi. Reuse is welcome with attribution; the
underlying word list stays under its own MIT licence above.

The engine that reads them (`src/spellcheck/*.js`) is part of this app and
carries the app's own MIT licence. It was ported from the web edition of Bilim
Hezinisi, which is the same project.

### SymSpell algorithm
No longer used. `src/symspell.js` implemented the SymSpell algorithm by Wolf
Garbe (<https://github.com/wolfgarbe/SymSpell>), MIT License; it was removed in
3.2.0 when the checker stopped precomputing a symmetric-delete index. The
notice is kept for the record of what earlier versions shipped.

---

## 4. Offline OCR

**Tesseract.js** (Apache-2.0) with **Tesseract OCR** trained data
(`assets/ocr/tessdata/`), Apache License 2.0 —
<https://github.com/tesseract-ocr/tessdata>. OCR runs entirely on the local
machine; no image or text is uploaded for recognition.

---

## 5. npm dependencies

| Package | Version | Licence |
| --- | --- | --- |
| @mozilla/readability | ^0.6.0 | Apache-2.0 |
| better-sqlite3 | ^11.10.0 | MIT |
| docx | ^8.5.0 | MIT |
| dompurify | ^3.4.1 | MPL-2.0 OR Apache-2.0 |
| electron | ^28.0.0 | MIT |
| electron-window-state | ^5.0.3 | MIT |
| mammoth | ^1.6.0 | BSD-2-Clause |
| node-html-parser | ^6.1.13 | MIT |
| pdfjs-dist | 3.11.174 | Apache-2.0 |
| sql.js | ^1.10.0 | MIT |
| tesseract.js | ^5.0.0 | Apache-2.0 |
| turndown | ^7.2.4 | MIT |
| word-extractor | ^1.0.4 | MIT |

Build-time only: @electron/rebuild (MIT), electron-builder (MIT).

**Electron** bundles the Chromium engine (BSD-3-Clause and others) and Node.js
(MIT). Their notices ship inside the Electron distribution in
`LICENSES.chromium.html`.

---

## 6. Third-party service

The optional AI assistant calls the **Google Gemini API**
(<https://generativelanguage.googleapis.com>) using an API key that the user
supplies themselves. Google's terms apply to that use:
<https://ai.google.dev/gemini-api/terms>. No API key is shipped with the app.

---

If you believe any material in this repository is used in a way that infringes
your rights, please open an issue and it will be removed or corrected promptly.
