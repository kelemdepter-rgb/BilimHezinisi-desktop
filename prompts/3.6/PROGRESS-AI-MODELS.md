# PROGRESS — 3.6 AI models (work order: `prompts/3.6/PROMPT-3.6-AI-MODELS.md`)

Branch `fix/ai-models-3.6` from `main` (`b45f39c`). Version stays `3.6.0`.

## Phase 0 — evidence first

Status: **done** (probe run by the owner 2026-10-29 14:38 UTC).

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

Owner's key, `node` transport (plain Node fetch reached Google from this machine):

| requested | generateContent | modelVersion | stream: first chunk has modelVersion | text before it | all chunks |
| --- | --- | --- | --- | --- | --- |
| `gemini-3.8-flash` | 200 | `gemini-3.8-flash` | yes | no | `gemini-3.8-flash` |
| `gemini-3.6-flash` | 200 | `gemini-3.6-flash` | yes | no | `gemini-3.6-flash` |
| `gemini-3.1-pro-preview` | 200 | `gemini-3.1-pro-preview` | yes | no | `gemini-3.1-pro-preview` |
| `gemini-3.7-flash` | 200 | **`gemini-3.8-flash`** | yes | no | `gemini-3.8-flash` |
| `gemini-3.5-flash-lite` | 200 | `gemini-3.5-flash-lite` | yes | no | `gemini-3.5-flash-lite` |

Decisions:

- **Match rule: exact.** Every model reported its own ID with no suffix, in both
  transports, so `answeredByRequestedModel` accepts only `modelVersion === requested`.
  No suffix was observed, so none is allowed (the work order's "allowed suffix → true"
  test became "an unseen suffix → false"). If Google ever adds one, the probe shows it
  and the rule is widened for that suffix only.
- **The aliasing is proven:** `gemini-3.7-flash` answers as `gemini-3.8-flash`, in
  generateContent and in every stream chunk. The check refuses it.
- **Streams:** the first chunk always carries `modelVersion` and no text came before
  it, so a stream is checked on its first chunk, before anything reaches `onChunk`.
  Text arriving before any chunk named the model is refused as "missing".
- **`gemini-3.6-flash` answers on the owner's key** → free, `(ھەقسىز)`, not in
  `PAID_ONLY_MODELS`.
- **`gemini-3.1-pro-preview` also answered (HTTP 200).** On 2026-08-20 a non-billing
  key got 429 «limit: 0». Either the owner's key has billing or Google opened a free
  tier. The work order keeps it paid-only and its label unchanged; asked the owner
  which it is (see Phase 1 report).

## Phase 1 — implement

Status: **done** — commit `143ffc5`. The owner's tests in `npm run dev` passed
2026-10-29: each model answered «باغلىنىشنى سىناش» as itself, the one-time notice
for `gemini-3.7-flash` appeared once, `npm test` all green.

- Line-up in `ai.js` and `src/ai-client.js`: `gemini-3.8-flash` (default, «تەۋسىيە ·
  ئەڭ يېڭى»), `gemini-3.6-flash` (ھەقسىز), `gemini-3.1-pro-preview` (پۇللۇق,
  unchanged). `RETIRED_MODELS`: 3.7-flash, 3.5-flash-lite, 3.5-flash, 3.1-flash-lite
  → `gemini-3.8-flash`, through the existing `resolveModelForSettings` /
  `PREF_MODEL_MIGRATED` notice. The notice now says the old model was taken off the
  list (it used to say Google stopped it — not true of 3.5-flash-lite).
- `answeredByRequestedModel` + the named error on every path: `callGemini` (`ask`,
  `probeKey` → test connection / per-slot tests / test all keys, `ocrImages`, the
  non-stream retries of chat and translate), `askStream`, `streamOnce` (chat,
  translate). A mismatch is never retried, never fails over to another key, never
  counted as a success; a stream that switched model after showing text is cleared
  (`onReset('')`). The status line receives the verified `modelVersion`.
- Test seam: `ai._setHttpFetchForTests(fn)` (tests only).
- `tests/main/ai-models.js`: 8 tests; with the check disabled the four mismatch tests
  fail and the failover guard passes. `npm test` all green.
- Docs: `CLAUDE.md` (AI line + the rule), `BUILD-GUIDE.md` (model notes).
- `scripts/dev-set-ai-model.js` — TEMPORARY, never committed, for the owner's test 4
  (DEV library only). Deleted in Phase 2.

## Phase 2 — texts and merge

Status: **done.**

- `prompts/3.6/STORE-WHATS-NEW-v3.6.0.md`: one AI line in each language, «six» →
  «seven» features. Measured (a line break counted once / twice): Uyghur 1,202 /
  1,219, English 1,119 / 1,136 — both ≤ 1,500. No other line shortened; the privacy
  line is unchanged.
- `RELEASE-NOTES-v3.6.0.md` (git-ignored by `RELEASE-NOTES-*.md`, so on disk only, for
  the GitHub Release): an AI section in each language, «seven» features, 183 tests.
- `PRIVACY.md` names no model ID — unchanged.
- `gemini-3.1-pro-preview` stays paid-only, as the work order says; the owner has not
  said whether the probe key has billing.
- `npm test`: 183 tests, all green. Merged into `main` with `--no-ff`; not pushed, not
  tagged.
