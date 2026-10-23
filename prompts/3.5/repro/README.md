# Audit reproductions (reference only)

These are the scripts that produced the evidence in `AUDIT-2026-10-22.md` (sections 2 and 3).
They ran on 2026-10-22 with Playwright 1.56 and Chromium 141, outside this repository, against
**unmodified copies** of `src/notes.js`, `src/spellcheck.js`, `src/sanitize.js`, `src/notes.css`
and `assets/vendor/purify.min.js` placed next to `harness.html`.

- `harness.html` — loads those files with stand-ins for `index.html` globals and a fake
  `window.electron` (in-memory note, fake dictionary, fake n-gram matcher).
- `run-1.js` — tests 1–7: Enter + spellcheck, format painter, replace-all, sanitizer,
  reference scan caret, leave-and-return, failed save + switch.
- `run-2.js` — Shift+Enter, quote back to normal text, Ctrl+Z after the painter.

Do **not** add Playwright to this project. Port the cases into the repo's own Electron runner
(`npm test`, see `prompts/3.5/PROMPT-3.5.md`, Phase 0), which runs on Electron 28 / Chromium 120 —
the engine the app ships with.
