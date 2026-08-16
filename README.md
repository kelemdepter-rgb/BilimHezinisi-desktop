<div align="right">

# بىلىم خەزىنىسى — Bilim Hezinisi

**ئۆزىڭىزگە تەۋە رەقەملىك كۇتۇپخانا** — A free, offline-first Uyghur digital
library for Windows.

</div>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Platform](https://img.shields.io/badge/platform-Windows%2010%2F11-0078D4)
![Electron](https://img.shields.io/badge/Electron-28-47848F)

---

## What it is

Bilim Hezinisi turns a folder of books into a searchable personal library that
works **without an internet connection**. It was built for Uyghur readers, and
it handles Uyghur, Arabic, Turkish and English text and right-to-left layout
properly — including full-text search inside Arabic-script documents, which
most general-purpose readers get wrong.

It is **free**, contains **no advertising**, **no accounts** and **no
tracking**.

## Features

- **Import and read** PDF, DOCX, DOC, TXT, MD and HTML, or pull an article
  straight from a web address.
- **Full-text search** across the whole library and inside a single book,
  tuned for Uyghur and Arabic script.
- **Offline OCR** — recognise text in scanned PDFs and images on your own
  machine (Tesseract), with Uyghur-specific post-processing.
- **Notebook** — a rich-text editor with highlighting, a format painter and
  automatic references back to the page you took the note from.
- **Qur'an module** — the Uthmani Hafs Arabic text with the Uyghur
  translation, offline, with search.
- **Uyghur spell-check** built on a SymSpell index.
- **Export** to PDF and DOCX with correct Uyghur typography.
- **Optional AI assistant** — bring your own free Google Gemini API key to ask
  questions about the book you have open. Entirely opt-in; the app is fully
  usable without it.

## Install

**Microsoft Store** — *(link to be added once the listing is live)*

Or grab an installer from the [Releases](https://github.com/kelemdepter-rgb/BilimHezinisi-desktop/releases)
page:

- `Bilim Hezinisi Setup <version>.exe` — normal installer (no admin rights
  needed).
- `BilimHezinisi-Portable-<version>.exe` — single file, runs from a USB stick.

Windows 10 version 1809 (build 17763) or later, 64-bit.

Your library lives in `C:\Users\<you>\JamiyKutupxana` and survives
uninstalling and reinstalling the app.

## Build from source

```bash
git clone https://github.com/kelemdepter-rgb/BilimHezinisi-desktop.git
cd bilim-hezinisi
npm install            # postinstall rebuilds better-sqlite3 and copies vendor files
npm run fetch-ocr-models   # downloads the offline OCR trained data
npm start              # run in development
```

Packaging:

```bash
npm run dist       # NSIS installer + portable .exe
npm run dist-store # MSIX/AppX package for the Microsoft Store
```

See [BUILD-GUIDE.md](BUILD-GUIDE.md) for the full walkthrough (in Uyghur).

## Privacy

The app has no server, no analytics and no telemetry. Everything stays on your
computer unless you deliberately enable the AI assistant or import from a URL.
Full details: [PRIVACY.md](PRIVACY.md).

## Licensing

The original source code is MIT-licensed — see [LICENSE](LICENSE).

Bundled fonts, the Qur'an text, the Uyghur translation and the word lists
belong to their respective owners and are redistributed under their own terms.
Every one of them is listed, with its licence and source, in
[THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

If you believe anything here infringes your rights, open an issue and it will
be corrected or removed promptly.

## Support

Questions, bug reports or a request to remove material:
**kelemdepter@gmail.com**, or open an
[issue](https://github.com/kelemdepter-rgb/BilimHezinisi-desktop/issues).

## Credits

- Qur'an Arabic text — [Tanzil Project](https://tanzil.net) (CC BY 3.0)
- Uyghur translation — Shaykh Muhammad Salih, published by
  [QuranEnc.com](https://quranenc.com/en/browse/uyghur_saleh), v1.0.2-xml.1
- Fonts — [UKIJ](http://www.ukij.org) (LGPL) and the
  [King Fahd Glorious Quran Printing Complex](http://fonts.qurancomplex.gov.sa/)
- Spell-check data — [UyghurSpell](https://github.com/gheyret/UyghurSpell) (MIT)
