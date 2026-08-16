# Claude Code prompt — publish Bilim Hezinisi to GitHub, then to the Microsoft Store

Copy everything below the line into Claude Code, running from the project folder.

---

You are working in the Electron desktop project **Bilim Hezinisi** (بىلىم خەزىنىسى), a free offline Uyghur digital library for Windows.

**Project folder:** `E:\ditallar\men yasigan ditallar\bilim hezinisi\bilim hezinisi pc`
**GitHub account:** `kelemdepter-rgb` (public)
**Target repository:** `https://github.com/kelemdepter-rgb/bilim-hezinisi` (does not exist yet — you will create it)

## Background — what has already been done

A compliance pass for Microsoft Store submission was completed before you started. Do **not** redo it, but do verify it survived:

- Three fonts whose licences forbid redistribution were deleted from `assets/`: `Bahij_Nazanin-Regular.ttf` (licence says "Not for reproduction, distribution or commercial use"), `trad-arabic.ttf` and `trad-arabic-bold.ttf` (Monotype "Microsoft supplied font", ships with Windows, cannot be redistributed). They were moved to `_to_delete/removed-fonts/`. All `@font-face` rules, dropdown options and JS branches referencing them were removed from `src/index.html` and `src/notes.js`, and they were removed from `build.files` in `package.json`. `'Traditional Arabic'` is still offered as a reading font and now resolves from the Windows system font instead of a bundled copy.
- `LICENSE` (MIT), `THIRD-PARTY-NOTICES.md`, `PRIVACY.md`, `README.md` and `STORE-SUBMISSION.md` were added. The support contact throughout them is `kelemdepter@gmail.com` — it is already filled in, do not treat it as a placeholder.
- In-app attribution for the Tanzil Qur'an text (CC BY 3.0) and the QuranEnc Uyghur translation was added to the About dialog and below every sura.
- `package.json`: version bumped to `3.1.0`, `author` set to `Bilim Hezinisi`, `repository`/`homepage`/`bugs` added, a `build.appx` block added with placeholder Partner Center identity values, and a `dist-store` script added.
- Microsoft Store tile images were generated into `build/appx/`.
- Large build artefacts (`BilimHezinisi-Source-2.8.0.zip`, `BilimHezinisi-Source-2.9.0.zip`) and duplicate seed files at the repo root were moved to `_to_delete/repo-bloat/`. `.gitignore` was extended to cover release artefacts, `.pfx`/`.p12` signing material and `_to_delete/`.

## Task A — publish the repository to GitHub

1. **Delete the staging folder.** Confirm `_to_delete/` contains only the three font files, `BadgeLogo.png` and the two source ZIPs plus two duplicate seed files, then delete the whole `_to_delete/` folder from disk. Nothing in it is referenced by the app — verify that with a grep before deleting.

2. **Safety check before anything is pushed.** This repository is going public, so run these and report the results:
   - Scan the working tree **and the full git history** for secrets: Google API keys (`AIza…`), OpenAI keys (`sk-…`), GitHub tokens (`ghp_…`), private keys, `.env` files, `.pfx`/`.p12` files. A previous scan found none — confirm.
   - Confirm `.claude/settings.local.json` is ignored and not tracked.
   - Confirm no file over 50 MB will be committed (`git ls-files` cross-checked against file sizes). GitHub warns above 50 MB and rejects above 100 MB.
   - List every file that `git status` shows as new or modified, grouped, so the result is reviewable at a glance.

3. **Branches.** The repo currently has local branches `master`, `feat/ui-redesign` (checked out, this is the newest work), `feat/ocr-notebook-ai`, `feature/ai-integration`, `fix/ai-dock-ocr-engines`, `fix/strict-model-selection`, and a large amount of uncommitted work on `feat/ui-redesign`. Do this:
   - Stage everything with `git add -A` (this also stages the deletions of the removed fonts and ZIPs) and commit on `feat/ui-redesign` with a clear conventional-commit message describing both the pre-existing UI work and the compliance changes. Split it into two commits if that reads better — one for the UI work, one for `chore(legal): Microsoft Store compliance`.
   - Create `main` from the current `feat/ui-redesign` tip and make it the branch you publish. Do not force-push or rewrite any history.
   - Push only `main` for now. Leave the other branches local; ask before pushing them.

4. **Create the repository and push.**
   - Check `gh auth status`. If not authenticated, stop and tell me the exact command to run (`gh auth login`) rather than guessing.
   - `gh repo create kelemdepter-rgb/bilim-hezinisi --public --source . --remote origin --description "بىلىم خەزىنىسى — a free offline Uyghur digital library for Windows"` and push `main`.
   - Set repository topics: `uyghur`, `electron`, `digital-library`, `ebook-reader`, `ocr`, `quran`, `offline-first`, `windows`.
   - Set the default branch to `main`.

5. **Verify the push.** Fetch the repo fresh into a temp folder, confirm `README.md`, `LICENSE`, `THIRD-PARTY-NOTICES.md` and `PRIVACY.md` are all present and render, confirm GitHub detected the licence as MIT, and confirm `node_modules/` and `dist/` are absent. Then delete the temp clone.

## Task B — verify the app still builds and runs

The compliance edits touched `src/index.html`, `src/notes.js`, `src/quran.js`, `src/quran.css` and `package.json`. **No feature may regress.** Verify:

1. `npm install` completes (the `postinstall` step rebuilds `better-sqlite3` and copies vendor files).
2. `npm run fetch-ocr-models` succeeds.
3. `npm start` launches the app. Then check by hand and report on each:
   - the reader font dropdown no longer offers "Bahij Nazanin", still offers "Traditional Arabic", and selecting Traditional Arabic renders correctly using the Windows system font;
   - a user who had previously selected the removed font falls back to automatic detection instead of breaking (there is a migration line in `changeReaderFont`);
   - the notebook font dropdown works and no longer lists the removed font;
   - the Qur'an view shows the new source-attribution footer under each sura, and the two links open in the external browser (they rely on `setWindowOpenHandler` in `main.js`);
   - the About dialog shows the new credits block and is still scrollable and correctly laid out in both light and dark themes;
   - importing a PDF, full-text search, OCR, notes, and export to PDF/DOCX all still work.
4. `npm run dist` still produces the NSIS installer and the portable `.exe` in `dist/`.

If anything regressed, fix it — but never by restoring the removed fonts.

## Task C — build the Microsoft Store package

Read `STORE-SUBMISSION.md` in the repo first; it has the full procedure.

The `build.appx` block in `package.json` contains three placeholders that must be replaced with real values from Partner Center → the app → **Product management → Product identity**:

```
"identityName":  "REPLACE_WITH_PARTNER_CENTER_PACKAGE_IDENTITY_NAME"
"publisher":     "CN=REPLACE_WITH_PARTNER_CENTER_PUBLISHER_ID"
```

- If I have already given you those values, substitute them and run `npm run dist-store` to produce `dist\BilimHezinisi-Store-3.1.0.appx`. Do not sign it — the Store signs it during publishing.
- If I have not given you those values yet, **do not invent them**. Stop, and tell me exactly which two strings you need and where in Partner Center to find them.

Then help me smoke-test the package locally by generating a self-signed test certificate, signing a **copy** of the `.appx` with it, installing it, and confirming the app launches and that the library still lives in `%USERPROFILE%\JamiyKutupxana`. Never commit the `.pfx`.

## Task D — GitHub Release

Once Task B passes, create a `v3.1.0` release on GitHub with `dist\Bilim Hezinisi Setup 3.1.0.exe` and `dist\BilimHezinisi-Portable-3.1.0.exe` attached, and release notes (Uyghur first, English second) covering: the removal of the three non-redistributable fonts and why, the new licence and privacy documentation, the in-app source attribution, and everything else in the release.

## Ground rules

- **Never break a feature.** If a compliance requirement and a feature conflict, stop and ask me.
- **Never restore** `Bahij_Nazanin-Regular.ttf`, `trad-arabic.ttf` or `trad-arabic-bold.ttf`. Their licences forbid redistribution and they would fail Microsoft Store policy 11.2.
- **Never rewrite git history** or force-push.
- Do not commit anything in `dist/`, `node_modules/`, or any `.pfx`/`.p12`.
- Report what you did in Uyghur; keep code, commit messages and file contents in English.
