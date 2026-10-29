# PROGRESS — 3.6 AI models (work order: `prompts/3.6/PROMPT-3.6-AI-MODELS.md`)

Branch `fix/ai-models-3.6` from `main` (`b45f39c`). Version stays `3.6.0`.

## Phase 0 — evidence first

Status: **waiting for the owner's probe output.**

### Working tree at the start

Untracked and left alone (not committed): `prompts/3.6/PROMPT-3.6-AI-MODELS.md`,
`prompts/PARTNER-CENTER-3.2.0.md`, `prompts/PROMPT-17D-desktop-ai-models.md`,
`prompts/PROMPT-SPELLCHECK-MORPHOLOGY.md`, `prompts/TARQITISH-TEKISTLIRI.md`.
The work order mentions a `package-lock.json` change: there was none.

### Where a model ID is written

Code (changes in Phase 1):

| File | Lines (at `b45f39c`) | What |
| --- | --- | --- |
| `ai.js` | 20–23, 35–37 | header comments naming `gemini-3.7-flash` |
| `ai.js` | 53 | `DEFAULT_MODEL` |
| `ai.js` | 54–65 | evidence comment + `SELECTABLE_MODELS` |
| `ai.js` | 68 | `MODEL_FALLBACKS` (derived from `SELECTABLE_MODELS`) |
| `ai.js` | 72 | `PAID_ONLY_MODELS` |
| `ai.js` | 76–79 | `RETIRED_MODELS` |
| `ai.js` | 105, 396, 1029–1036, 1142–1145 | comments naming older IDs |
| `src/ai-client.js` | 24, 27, 30–34, 39, 46–48 | `DEFAULT_MODEL`, `SELECTABLE_MODELS`, `PAID_ONLY_MODELS`, `MODEL_INFO` |
| `main.js` | 1941, 1949 | falls back to `ai.DEFAULT_MODEL` (no literal ID) |
| `src/index.html` | — | no model ID; the Settings picker reads `MODEL_INFO` |

Docs (Phase 1 §4 / Phase 2): `CLAUDE.md` (AI line), `BUILD-GUIDE.md:98` (still names
the 3.1.0 line-up: `gemini-3.5-flash`, `gemini-3.1-flash-lite`). `PRIVACY.md` and
`THIRD-PARTY-NOTICES.md` name no model ID — no change. `RELEASE-NOTES-v3.2.0.md` and
`CLAUDE-CODE-AI-INTEGRATION-PROMPT.md` are history and stay as they are.

### No feature pins its own model

Every request path takes the model from `getModel()` (the saved setting):
`ask` (non-streaming), `probeKey` via `test` / `testGivenKey` / `testKeySlot` /
`testAllKeySlots`, `askStream`, `translateStream`, `chatStream` (all three through
`streamOnce` / `streamOnceFailover`) and `ocrImages` (Gemini OCR of a PDF or an image,
also the reader's and the PDF page view's «AI بىلەن تۈزىتىش» via `ocr_cleanup` → `ask`).
`selfHealModel` is defined but never called.

Response paths that must check `modelVersion` in Phase 1: `callGemini` (the one
non-streaming request: `ask`, `probeKey`, `ocrImages`, and the non-stream retries
inside the streaming functions) and `streamOnce` (every SSE stream).

### Note for Phase 1

`resolveModelForSettings` migrates a retired ID only when Settings opens; until then
requests use the saved ID. With the `modelVersion` check, a user still on
`gemini-3.7-flash` who has not opened Settings gets the named mismatch error, which
tells them to open Settings — where the one-time migration and its notice happen.

### Probe

`scripts/probe-gemini-models.js` — key from `GEMINI_PROBE_KEY` only, sent in the
`x-goog-api-key` header, never printed. Each model is asked once with
`generateContent` and once with `streamGenerateContent?alt=sse` (the stream line also
says whether the first chunk carries `modelVersion` and whether text arrived before
it). Runs with `node` or, on a machine whose antivirus inspects HTTPS, with
`npx electron` (`electron.net.fetch`, the app's own transport). Checked 2026-10-29 with
a deliberately invalid key, both transports: every model `400 · API key not valid`,
the key absent from the output.

### Evidence (from the owner's run)

_Pending._
