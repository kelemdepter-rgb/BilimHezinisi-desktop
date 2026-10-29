# Project instructions — Bilim Hezinisi (desktop)

Paste everything below the line into the Cowork project's **Project instructions** box.

---

I am working on **بىلىم خەزىنىسى / Bilim Hezinisi**, a free offline Uyghur digital-library desktop app for Windows.

**Answer me in Uyghur.** Keep code, commit messages, file contents and anything I paste into Microsoft Partner Center in English.

## Where things are

- Local folder: `E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc`
- GitHub: `https://github.com/kelemdepter-rgb/BilimHezinisi-desktop` (branch `main`, public)
- Microsoft Store: `https://apps.microsoft.com/detail/9N2T15L4DX86` — live since 2026-08-20
- Web edition (separate project, **reference only** — never change it from desktop work): `E:\ditallar\men yasigan ditallar\BilimHezinisi-website`

## Versions

- Last tagged release on GitHub: **v3.2.0**. **v3.5.0** is merged into `main` and pushed, not yet tagged or sent to the Store.
- Microsoft Store: **3.1.0** at last check. Update this line after each Store submission.
- **In progress: v3.6.0** on branch `release/3.6`. Work order: `prompts/3.6/PROMPT-3.6.md`; status: `prompts/3.6/PROGRESS.md` (Claude Code keeps it current).
  - 3.6 adds: readable Qur'an verse numbers with [n] / [n _ m] after each translation; the PDF import fix (pages after 100 were lost); search that understands Uyghur suffixes; one search across books, the Qur'an and the notebook; «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» (a catalog of the website's published books inside the app); two books side by side; a PDF page beside its text for correction.
  - Decided 2026-10-27: a shared translation shows once under the last verse of its group; the catalog lives inside the app; original PDFs are not copied, only their location is remembered.
- History: `AUDIT-2026-10-22.md` (also in this project's docs) and `prompts/3.5/` for the 3.5 work.
- Not in 3.6: Electron upgrade, Markdown rendering and in-book links, AI features such as «كۇتۇپخانامدىن سوراش», note sync with the website, any change to the website.

## What the app is

Electron 28 desktop app, plain JavaScript, no build step. Imports PDF/DOCX/DOC/TXT/MD/HTML into a local library, full-text search tuned for Uyghur and Arabic script, offline OCR (Tesseract), a notebook («خاتىرە دەپتىرىم»), an offline Qur'an module, Uyghur spell-checking, and export to PDF/DOCX. An optional AI assistant uses Google Gemini with the user's own API key. Everything else works offline. The user's library lives in `%USERPROFILE%\JamiyKutupxana` and must survive uninstall/reinstall.

## Values that must never change

Changing any of these breaks the Store listing or the users' installs:

| Field (in `package.json` → `build.appx`) | Value |
| --- | --- |
| `identityName` | `BilimHezinisi.BilimHezinisi` |
| `publisher` | `CN=92DA40C5-9257-4E65-B590-0E8EF5BE2F1C` |
| `publisherDisplayName` | `Bilim Hezinisi` |
| `displayName` | `بىلىم خەزىنىسى` — a reserved Store name; byte-identical only |
| `languages` | `["ug-arab", "en-US"]` — plain `"ug"` is not a supported Store code |
| `applicationId`, `artifactName` | must stay ASCII |

Also fixed: the data folder name `JamiyKutupxana`, and the Store ID `9N2T15L4DX86`.

## Licensing rules — never break these

Three fonts were removed in v3.1.0 because their licences forbid redistribution. **Never re-add them**: `Bahij_Nazanin-Regular.ttf`, `trad-arabic.ttf`, `trad-arabic-bold.ttf`. `'Traditional Arabic'` is still offered as a reading font and resolves from Windows.

Bundled third-party material must keep its attribution and must not be modified: Qur'an Arabic text (Tanzil, CC BY 3.0), Uyghur translation (QuranEnc.com, v1.0.2-xml.1), UKIJ fonts (LGPL), KFGQPC Uthmanic Hafs font. Attribution lives in `THIRD-PARTY-NOTICES.md`, the About dialog, and a footer under every sura. Anything newly bundled must be added to `THIRD-PARTY-NOTICES.md` in the same commit.

## Rules learned in the 3.5 audit (details in the repo's `CLAUDE.md`)

- The notebook never rewrites the whole note through editing commands (`selectAll` + `insertHTML` is banned); one helper writes a whole document, and it takes a saved version first when the change is destructive.
- Nothing temporary is written into a note: spellcheck underlines, find hits and reference matches are painted with the CSS Custom Highlight API.
- A line end (block edge or `<br>`) is always a word boundary.
- Nothing typed may be lost: save before leaving the notebook, switching notes or closing the window; never show «ساقلاندى» while something is unsaved.
- The library is never changed by omission: a book is deleted only by an explicit delete. Back up before any schema change.
- Verses and citations are quoted material: the spellchecker, the format painter and AI proofreading never change them.

## How I work

- I run commands on **my own Windows machine** — Cowork's sandbox is Linux and cannot build or run this app. Give me the exact command to run, or write a prompt I paste into Claude Code in the project folder.
- Claude Code does the git and build work. Cowork advises, audits, writes prompts, checks documents, and walks me through Partner Center.
- Claude Code prompts follow one format: a Uyghur header (how to use it, what it does, what I should test), then `---`, then the English instructions. Long work goes in phases; after each phase Claude Code stops, gives me a Uyghur test list for `npm run dev`, and waits for «داۋاملاشتۇر». Only one Claude Code session at a time.
- `npm run dev` uses a separate test library (`JamiyKutupxana-DEV`); `npm start` uses my real library — only for a final check.
- Before telling me to paste text into a Partner Center field, **check the character limit**. Known limits: Copyright and trademark info 200, restricted-capability justification 500, Short description 270, What's new in this version 1,500, keywords 7 items / 21 words total.
- Never break a working feature to satisfy a policy or a plan. If they conflict, stop and ask me.

## Skills

- **bilim-desktop-dev** — changing the app's code: fixing bugs, adding features, porting from the web edition, auditing, writing Claude Code prompts.
- **bilim-desktop** — running, rebuilding and packaging (`npm run dev`, `npm test`, `npm run dist-win`).
- **bilim-store-release** — publishing a version to GitHub and the Microsoft Store. Use it rather than improvising.
