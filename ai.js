// ai.js — main-process Gemini client + content-type-aware prompts.
// Ported from the mobile app's js/ai.js (BilimHezinisi-Mobile).
//
// WHY THE MAIN PROCESS
// --------------------
// The renderer's CSP is `connect-src 'self'` (src/index.html) and must stay
// that way — the offline app's renderer never talks to the network. All
// Gemini traffic therefore happens here, in the Electron main process, using
// Node 18's global fetch (undici, supports streaming bodies). The renderer
// reaches this module only through the IPC handlers wired in main.js.
//
// WHY GEMINI SPECIFICALLY
// -----------------------
// The app's userbase is Uyghur-speaking and reading classical religious /
// literary texts that often blend Arabic and Uyghur. Of the free-tier API
// providers, Google Gemini gives the best Uyghur output quality by a wide
// margin and has a generous free quota from https://aistudio.google.com —
// keys begin with "AIza...".
//
// Default model: gemini-3.7-flash (line-up verified against the live models
// endpoint on 2026-08-20). Older Gemini models are deliberately excluded
// because their Uyghur output quality is too low to be useful for classical
// religious-text scholarship.
//
// STORAGE: all settings go through database.getSetting / setSetting (the
// existing key/value settings table — no schema change). The API key is the
// user's own, stored locally, lightly obfuscated at rest, and never logged.

const database = require('./database');

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

// gemini-3.7-flash is the current flagship Flash model — frontier reasoning
// quality with the speed we need for an inline Q&A flow. The user can
// override the choice in Settings.
//
// Older Gemini models (1.5, 2.0, 2.5) are intentionally EXCLUDED
// because their Uyghur quality is too low to be useful for this app's
// classical-religious-text userbase.
//
// STRICT MODEL SELECTION: the model the user picked in Settings is the
// ONLY model ask()/askStream()/test() ever call. Nothing substitutes a
// different model and nothing rewrites the stored preference behind the
// user's back — if the chosen model fails (retired ID, paid tier on a
// free key, quota), a clear Uyghur error is surfaced and the USER decides
// whether to switch models or enable billing. The ONE exception is the
// one-time, VISIBLE migration of a retired ID (RETIRED_MODELS below), which
// happens when Settings is opened — never mid-request. MODEL_FALLBACKS and
// selfHealModel below are retained for reference/diagnostics only; they
// must NEVER be used to change the model the user picked.
const DEFAULT_MODEL  = 'gemini-3.7-flash';
// Models offered in the Settings selector, in display order. Verified live
// on 2026-08-20 (models endpoint + a real generateContent call per model):
//   gemini-3.7-flash        free tier YES  — answered on a non-billing key
//   gemini-3.5-flash-lite   free tier YES  — answered on a non-billing key
//   gemini-3.1-pro-preview  free tier NO   — 429 "limit: 0" without billing
// NOTE: model IDs change over time — if one stops matching a live ID, adjust
// it HERE and in src/ai-client.js (SELECTABLE_MODELS + MODEL_INFO).
const SELECTABLE_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-pro-preview'
];
// Data-only mirror kept for the renderer (window.AI.MODEL_FALLBACKS) and for
// older ported code. STRICT selection: never used to substitute a model.
const MODEL_FALLBACKS = SELECTABLE_MODELS.slice();
// Models Google offers ONLY on the paid tier. A key without billing gets a
// 429 whose quota metric is *_free_tier_* with "limit: 0" — that is a MODEL
// problem, not a key problem, so it earns its own named error message.
const PAID_ONLY_MODELS = ['gemini-3.1-pro-preview'];
// Retired model ID → its successor. Applied ONCE, VISIBLY, when the Settings
// dialog loads (see resolveModelForSettings) — the user is told their model
// was updated because the old one was retired. Never applied mid-request.
const RETIRED_MODELS = {
  'gemini-3.5-flash':      'gemini-3.7-flash',
  'gemini-3.1-flash-lite': 'gemini-3.5-flash-lite'
};
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
// Google's own pages — linked from the UI instead of hardcoding prices or
// quota numbers that change without notice.
const URL_PRICING = 'https://ai.google.dev/pricing';
const URL_BILLING = 'https://ai.google.dev/gemini-api/docs/billing';
const URL_TERMS   = 'https://ai.google.dev/gemini-api/terms';

const PREF_API_KEY = 'ai_gemini_api_key';
// Up to 3 BACKUP keys. Each should come from a SEPARATE Google Cloud project
// (free-tier quota is per-project) so failover actually buys fresh quota.
const PREF_BACKUP_KEYS = ['ai_gemini_api_key_b1', 'ai_gemini_api_key_b2', 'ai_gemini_api_key_b3'];
const PREF_MODEL   = 'ai_gemini_model';
const PREF_ENABLED = 'ai_enabled';
// Which key slot (0 = primary, 1..3 = backups) last answered successfully.
// Persisted so a user whose first key is permanently exhausted does not pay a
// failed round-trip on every question after a restart.
const PREF_LAST_GOOD_SLOT = 'ai_last_good_key_slot';
// Set when a retired model ID was migrated, so the Settings dialog can TELL
// the user their model changed. Cleared once the dialog has shown the notice.
const PREF_MODEL_MIGRATED = 'ai_model_migrated_from';

// Retry/backoff for transient 429/5xx errors.
const MAX_TRIES = 3;
const BACKOFF_MS = [400, 1200, 3000];

// Safety ceiling for a single whole-book request. gemini-3.5-flash handles
// very large inputs, so normal books/articles are sent in FULL — we never
// pre-emptively warn about size. This 1M-char cap is only a last-resort
// guard against a pathological payload; if the API still rejects on size,
// the UI degrades reactively (tooLargeFallback).
const MAX_CONTEXT_CHARS = 1000000;

// Network watchdog: fetch() has no built-in timeout. 60s is generous
// enough for slow networks but short enough that a wedged request
// can't pin things forever.
const REQUEST_TIMEOUT_MS = 60000;

// ----------------------------------------------------------------
// Key / prefs storage (database.getSetting / setSetting — synchronous
// better-sqlite3, same settings table the rest of the app uses)
// ----------------------------------------------------------------

let cachedKey = null;
let cachedKeyLoaded = false;

// Light obfuscation for the stored key. This is NOT real security — the
// SQLite db lives in the user's own profile and nothing client-side can
// protect a secret from the machine's owner. The goal is only to keep the
// key from sitting in plain sight (e.g. in a casual db dump). Format:
// "obf1:" + base64 of the key XOR'd with a fixed app secret. Legacy
// plaintext keys (no prefix) are read transparently and migrated on load.
const KEY_OBFS_PREFIX = 'obf1:';
const KEY_OBFS_SECRET = 'BilimHezinisi/v3/ai';

function xorWithSecret(s) {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    out += String.fromCharCode(s.charCodeAt(i) ^ KEY_OBFS_SECRET.charCodeAt(i % KEY_OBFS_SECRET.length));
  }
  return out;
}
function obfuscateKey(plain) {
  try { return KEY_OBFS_PREFIX + Buffer.from(xorWithSecret(String(plain)), 'latin1').toString('base64'); }
  catch (_) { return String(plain); }
}
function deobfuscateKey(stored) {
  const s = String(stored || '');
  if (s.indexOf(KEY_OBFS_PREFIX) !== 0) return s; // legacy plaintext
  try { return xorWithSecret(Buffer.from(s.slice(KEY_OBFS_PREFIX.length), 'base64').toString('latin1')); }
  catch (_) { return ''; }
}

function loadKey() {
  if (cachedKeyLoaded) return cachedKey;
  try {
    const raw = database.getSetting(PREF_API_KEY, '');
    const plain = deobfuscateKey(raw).trim();
    cachedKey = plain;
    // Lazy migration: re-store any legacy plaintext key in obfuscated form.
    if (plain && String(raw).indexOf(KEY_OBFS_PREFIX) !== 0) {
      try { database.setSetting(PREF_API_KEY, obfuscateKey(plain)); } catch (_) {}
    }
  } catch (e) {
    console.warn('[ai] loadKey failed:', e && e.message);
    cachedKey = '';
  }
  cachedKeyLoaded = true;
  return cachedKey;
}

function getApiKey() { return loadKey(); }

function hasApiKey() {
  // A configured BACKUP key alone is enough — the failover path serves every
  // request from it even when the primary slot is empty.
  return getKeyList().length > 0;
}

// Masked form for any UI/getter that crosses into the renderer: the real key
// never leaves the main process. "AIza…XXXX" (first 4 + last 4).
function getApiKeyMasked() {
  const k = loadKey();
  if (!k) return '';
  if (k.length <= 8) return '••••';
  return k.slice(0, 4) + '…' + k.slice(-4);
}

function setApiKey(key) {
  const trimmed = String(key || '').trim();
  try {
    database.setSetting(PREF_API_KEY, trimmed ? obfuscateKey(trimmed) : '');
  } catch (e) {
    console.warn('[ai] setApiKey persist failed:', e && e.message);
  }
  cachedKey = trimmed;
  cachedKeyLoaded = true;
  resetKeyHealth();
  forgetLastGoodSlot();
}

// ----------------------------------------------------------------
// Backup keys (up to 3) + the ordered key list used for failover.
// Free-tier rate/quota limits are per-PROJECT, so a key from a SEPARATE
// project carries its OWN quota. Every request path fails over to the next
// key — SAME model, STRICT selection untouched — whenever the current key
// hits quota (429), is busy (5xx), is DEAD (invalid/expired/suspended), or
// fails at the network level. Backups are read fresh
// from the settings table (not cached) so a Settings edit applies at once.
// ----------------------------------------------------------------
function maskKey(k) {
  if (!k) return '';
  if (k.length <= 8) return '••••';
  return k.slice(0, 4) + '…' + k.slice(-4);
}

// Strip anything that looks like an API key out of an error string before it
// hits a log line (Google's suspended-consumer errors echo the key).
function scrubKeyFromMsg(s) {
  return String(s || '')
    .replace(/api_key:[A-Za-z0-9._-]+/g, 'api_key:••••')
    .replace(/AIza[A-Za-z0-9_-]{10,}/g, 'AIza••••')
    .replace(/AQ\.[A-Za-z0-9._-]{10,}/g, 'AQ.••••');
}

function getBackupKeys() {
  return PREF_BACKUP_KEYS.map(function (pref) {
    try { return deobfuscateKey(database.getSetting(pref, '')).trim(); }
    catch (_) { return ''; }
  });
}

function getBackupKeysMasked() {
  return getBackupKeys().map(maskKey);
}

function setBackupKeys(arr) {
  const list = Array.isArray(arr) ? arr : [];
  for (let i = 0; i < PREF_BACKUP_KEYS.length; i++) {
    // null / undefined = "leave this slot unchanged" — the renderer sends null
    // for an empty field so re-saving never wipes a key the user didn't
    // retype. An explicit '' string clears the slot.
    const item = list[i];
    if (item === null || item === undefined) continue;
    const v = String(item).trim();
    try { database.setSetting(PREF_BACKUP_KEYS[i], v ? obfuscateKey(v) : ''); }
    catch (e) { console.warn('[ai] setBackupKeys persist failed:', e && e.message); }
  }
  resetKeyHealth();
  forgetLastGoodSlot();
}

// Ordered, de-duplicated usable key SLOTS: [{ slot, key }] with slot 0 = the
// primary key and 1..3 = the backups, i.e. the order the user sees in
// Settings. Carrying the slot number (not just the key string) is what lets
// the UI say "ئاچقۇچ 2" and lets the last-good slot be remembered across
// restarts. Empty and duplicate keys are dropped.
function getKeySlots() {
  const all = [loadKey()].concat(getBackupKeys());
  const seen = {};
  const out = [];
  for (let i = 0; i < all.length; i++) {
    const k = String(all[i] || '').trim();
    if (k && k.length > 8 && !seen[k]) { seen[k] = 1; out.push({ slot: i, key: k }); }
  }
  return out;
}

// Same list, keys only — kept because several call sites only need "do we
// have any usable key at all?".
function getKeyList() {
  return getKeySlots().map(function (s) { return s.key; });
}

function firstKey() { return getKeyList()[0] || ''; }

// ----------------------------------------------------------------
// Key health memory (in-RAM only). A key that just failed with a quota or an
// invalid-key error is moved to the BACK of the failover order for a short
// cooldown, so requests stop burning a round-trip on a key that is known to
// be dead right now. Keys are never dropped — worst case the order is just
// unchanged — and any Settings edit or app restart clears the slate.
// ----------------------------------------------------------------
const keyHealth = Object.create(null);   // key string -> { badUntil, reason }

function resetKeyHealth() {
  for (const k in keyHealth) delete keyHealth[k];
  activeSlot = null;
}

// The keys themselves changed, so "the slot that last worked" may now hold a
// different key — drop the memory rather than starting on a stale hint.
function forgetLastGoodSlot() {
  try { database.setSetting(PREF_LAST_GOOD_SLOT, ''); } catch (_) {}
}

function markKeyBad(key, reason, retryMs) {
  if (!key) return;
  const base = (reason === 'invalid') ? 10 * 60e3 : 60e3;
  const ms = Math.max(15e3, Math.min(retryMs || base, 10 * 60e3));
  keyHealth[key] = { badUntil: Date.now() + ms, reason: reason };
  console.warn('[ai] key ' + maskKey(key) + ' marked ' + reason + ' (cooldown ' + Math.round(ms / 1000) + 's)');
}

function markKeyGood(key) { if (key && keyHealth[key]) delete keyHealth[key]; }

// The slot currently serving requests, for the unobtrusive "which key am I
// on?" indicator. RAM only — it means "right now", not "saved preference".
let activeSlot = null;

// Which slot last answered successfully (persisted). Start there so a user
// whose primary key is permanently exhausted stops paying a failed
// round-trip on every single question.
function getLastGoodSlot() {
  try {
    const n = parseInt(database.getSetting(PREF_LAST_GOOD_SLOT, ''), 10);
    return (Number.isFinite(n) && n >= 0 && n <= PREF_BACKUP_KEYS.length) ? n : null;
  } catch (_) { return null; }
}

function setLastGoodSlot(slot) {
  if (slot == null) return;
  try {
    if (getLastGoodSlot() !== slot) database.setSetting(PREF_LAST_GOOD_SLOT, String(slot));
  } catch (e) { console.warn('[ai] setLastGoodSlot failed:', e && e.message); }
}

// Record a slot that just worked: clear its cooldown, remember it for next
// time, and expose it as the active slot.
function markSlotGood(slotInfo) {
  if (!slotInfo) return;
  markKeyGood(slotInfo.key);
  activeSlot = slotInfo.slot;
  setLastGoodSlot(slotInfo.slot);
}

// The failover order: the last slot that WORKED first, then the remaining
// slots in their natural (primary → backups) order, and finally any slot
// still inside a failure cooldown. Cooled-down slots are never dropped — a
// last resort beats no answer.
function orderedKeySlots() {
  const slots = getKeySlots();
  const last = getLastGoodSlot();
  const head = [];
  const rest = [];
  for (let i = 0; i < slots.length; i++) {
    if (last != null && slots[i].slot === last) head.push(slots[i]);
    else rest.push(slots[i]);
  }
  const ordered = head.concat(rest);
  const now = Date.now();
  const ok = [];
  const bad = [];
  for (let i = 0; i < ordered.length; i++) {
    const h = keyHealth[ordered[i].key];
    if (h && h.badUntil > now) bad.push(ordered[i]);
    else { if (h) delete keyHealth[ordered[i].key]; ok.push(ordered[i]); }
  }
  return ok.concat(bad);
}

// What the UI shows next to an answer / in Settings: which slot is in use,
// how many are configured, and which one is remembered as last-good.
function getKeyStatus() {
  const slots = getKeySlots();
  return {
    activeSlot: activeSlot,
    lastGoodSlot: getLastGoodSlot(),
    count: slots.length,
    slots: slots.map(function (s) { return s.slot; })
  };
}

function getModel() {
  try {
    const v = database.getSetting(PREF_MODEL, DEFAULT_MODEL);
    return String(v || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  } catch (_) {
    return DEFAULT_MODEL;
  }
}

function setModel(name) {
  const m = String(name || '').trim() || DEFAULT_MODEL;
  try { database.setSetting(PREF_MODEL, m); }
  catch (e) { console.warn('[ai] setModel persist failed:', e && e.message); }
  // Free-tier quota is per model+project — a key exhausted on one model may
  // be fine on another, so clear the cooldown slate on a model switch.
  resetKeyHealth();
}

function isPaidOnlyModel(name) {
  return PAID_ONLY_MODELS.indexOf(String(name || '').trim()) !== -1;
}

// ONE-TIME, VISIBLE model migration — called ONLY when the Settings dialog
// loads, never from a request path. A user upgrading from v3.1.0 has a
// retired ID saved (gemini-3.5-flash / gemini-3.1-flash-lite); we move them
// to its successor, persist that, and hand the dialog `migratedFrom` so it
// can TELL them their model changed and why. Requests keep using exactly
// what is stored — a retired ID that Google still serves keeps working
// until the user opens Settings.
function resolveModelForSettings() {
  const current = getModel();
  const successor = RETIRED_MODELS[current];
  if (successor) {
    setModel(successor);
    try { database.setSetting(PREF_MODEL_MIGRATED, current); } catch (_) {}
    console.log('[ai] retired model migrated:', current, '→', successor);
    return { model: successor, migratedFrom: current };
  }
  // A notice from an earlier Settings visit that the dialog has not shown
  // yet (e.g. the app was closed before it rendered) still needs surfacing.
  let pending = '';
  try { pending = String(database.getSetting(PREF_MODEL_MIGRATED, '') || ''); } catch (_) {}
  return { model: current, migratedFrom: pending || null };
}

// The dialog has shown the migration notice — don't nag on the next open.
function ackModelMigration() {
  try { database.setSetting(PREF_MODEL_MIGRATED, ''); } catch (_) {}
  return { ok: true };
}

function isEnabled() {
  try {
    const v = database.getSetting(PREF_ENABLED, '1');
    return String(v) !== '0';
  } catch (_) {
    return true;
  }
}

function setEnabled(on) {
  try {
    database.setSetting(PREF_ENABLED, on ? '1' : '0');
  } catch (e) {
    console.warn('[ai] setEnabled persist failed:', e && e.message);
  }
}

// ----------------------------------------------------------------
// Per-day usage counter
// ----------------------------------------------------------------

function todayKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return 'ai_usage_' + y + '-' + m + '-' + day;
}

function getTodayUsage() {
  try {
    const v = database.getSetting(todayKey(), '0');
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  } catch (_) { return 0; }
}

function bumpUsage() {
  const cur = getTodayUsage();
  try { database.setSetting(todayKey(), String(cur + 1)); } catch (_) {}
}

// ----------------------------------------------------------------
// Prompt templates (per content type) — ported VERBATIM from mobile.
//
// Design principles common to every prompt:
//   1. Uyghur output, simple/clear vocabulary.
//   2. Multi-scholar / multi-view answers — never a single verdict.
//   3. No fabricated citations.
//   4. Mainstream Sunni scholarship for Islamic questions.
//   5. No personal verdicts on contested fiqh/political questions.
// ----------------------------------------------------------------

const SYSTEM_BASE =
  'سىز ئۇيغۇر تىلىدا جاۋاب بېرىدىغان ئىختىساسلىق ياردەمچىسىز. ھەردائىم:\n' +
  '- ساپ، چۈشىنىشلىك ئۇيغۇر تىلىدا (ئۇيغۇر يېزىقىدا) جاۋاب بېرىڭ.\n' +
  '- ساغلام پىكىر، ئوبيېكتىپلىق، ئوتتۇرا يولنى ساقلاڭ.\n' +
  '- مەنبە ياكى كىشى نامىنى ئاتاپ تەكلىپ بەرسىڭىز، چوقۇم راست مەلۇم\n' +
  '  ئالىم ياكى مەنبە بولسۇن. تەخمىنىي / ئويدۇرما مەنبە ئاتىماڭ.\n' +
  '- بىلمىسىڭىز «بۇ ھەقتە ئېنىق مەلۇمات تېپىلمىدى» دەڭ.\n' +
  '- جاۋابنى Markdown شەكلىدە تۇزۇپ، تۈرلەرنى ## كىچىك سەرلەۋھە بىلەن\n' +
  '  ئاجراتسىڭىز بولىدۇ.';

// System instruction for the free-form notebook chatbot (Phase 4 — NOT tied to
// the library). Sent as Gemini `systemInstruction`, so it is NOT overridden by
// SYSTEM_BASE.
const CHAT_SYSTEM =
  'سىز بىلىمى كەڭ، سەمىمىي ياردەمچىسىز. قائىدىلەر:\n' +
  '- سوئال قايسى تىلدا بولسا شۇ تىلدا، ئادەتتە ئۇيغۇر تىلىدا (ئۇيغۇر يېزىقىدا) جاۋاب بېرىڭ.\n' +
  '- ھەدىس، ئايەت ياكى ئالىم سۆزىنى نەقىل قىلسىڭىز، پەقەت راست مەنبەدىنلا نەقىل قىلىڭ؛ مەنبەسىنى (توپلام، كىتاب) كۆرسىتىڭ. ئېنىق بىلمىسىڭىز «بۇ ھەقتە ئېنىق مەنبە تاپالمىدىم» دەڭ — ئويدۇرماڭ.\n' +
  '- جاۋابنى Markdown بىلەن رەتلىك تۈزۈڭ.\n' +
  '- ھېكايە، شېئىر قاتارلىق ئىجادىي تەلەپلەرنى خۇشاللىق بىلەن ئورۇنداڭ.';

const PROMPTS = {
  hadith: {
    role: 'سىز ئىسلام ھەدىس ئىلمى بويىچە چوڭقۇر ساۋادلىق ئالىمسىز.',
    task:
      'تۆۋەندىكى ھەدىسكە ئائىت كونتېكستنى تەھلىل قىلىپ، تارىختا داڭلىق\n' +
      'بولغان ھەدىسشۇناس ئالىملار (ئىمام بۇخارى، مۇسلىم، تىرمىزى، ئەبۇ\n' +
      'داۋۇد، نەسەئى، ئىبنى ماجاھ، ئەھمەد ئىبنى ھەنبەل، ئىبنى ھەجەر\n' +
      'ئەلئەسقالانى، ئىمام نەۋەۋى، ئىبنى رەجەب، شەۋكانى ۋە باشقىلار) نىڭ\n' +
      'شەرھى ۋە چۈشەنچىلىرىنى ئوتتۇرىغا قويۇپ بېرىڭ. تۆۋەندىكى تەرتىپ:\n' +
      '1. ھەدىستىن قىسقىچە ئۇيغۇرچە مەنا.\n' +
      '2. ھەدىسنىڭ سەھىھلىك دەرىجىسى (سەھىھ / ھەسەن / زەئىف) ۋە مەنبە.\n' +
      '3. ئاساسلىق پەند-نەسىھەتلىرى.\n' +
      '4. كلاسسىك ئالىملارنىڭ شەرھى / كۆز قارىشى. ئىختىلاپ بولسا، ئۈچ-\n' +
      '   تۆتنىڭ پىكرىنى نەقىل قىلىپ ئېيتىڭ.\n' +
      '5. زامانىۋىي مۇسۇلمانلارغا ماس كېلىدىغان ساغلام نەسىھەت.\n' +
      'دىققەت: ئۆزىڭىزدىن ھۆكۈم چىقارماڭ، شەخسىي پەتىۋا بەرمەڭ.'
  },
  tafsir: {
    role: 'سىز قۇرئان كەرىم تەپسىرى ۋە تەفسىرلار ئىلمى بويىچە چوڭقۇر ساۋادلىق ئالىمسىز.',
    task:
      'تۆۋەندىكى ئايەت ياكى ئايەتلەرنى كلاسسىك تەپسىرشۇناس ئالىملار\n' +
      '(ئىبنى كەسىر، تەبەرى، قۇرتۇبى، رازى، بەغەۋى، سەئىدى، ئىبنى ئاشۇر،\n' +
      'شەۋكانى، ئالۇسى ۋە باشقىلار) نىڭ تەپسىرلىرى ئاساسىدا تونۇشتۇرۇپ\n' +
      'بېرىڭ. تۆۋەندىكى تەرتىپ:\n' +
      '1. ئايەتنىڭ ئاددىي ئۇيغۇرچە مەنىسى.\n' +
      '2. ئەگەر بار بولسا، ئايەتنىڭ نۇزۇل (چۈشۈش) سەۋەبى.\n' +
      '3. كلاسسىك تەپسىرشۇناسلارنىڭ ئاساسلىق چۈشەندۈرۈشلىرى. ئىختىلاپ\n' +
      '   بولسا ھەر تەرەپنىڭ پىكرىنى ئادالەتلىك بايان قىلىڭ.\n' +
      '4. ئايەتتىن ئېلىش مۇمكىن بولغان پەند-ھېكمەتلەر.\n' +
      '5. زامانىمىزغا ماس كېلىدىغان نەسىھەت ياكى تەپەككۇر نۇقتىسى.\n' +
      'دىققەت: ھۆكۈم چىقارماڭ، شەخسىي ئىجتىھاد بەرمەڭ.'
  },
  fiqh: {
    role: 'سىز ئىسلام فىقھى بويىچە چوڭقۇر ساۋادلىق ئالىمسىز.',
    task:
      'تۆۋەندىكى فىقھى مەسىلىنى ئوتتۇرىغا قويۇپ، تۆت ئاساسلىق مەزھەب\n' +
      '(ھەنەفىي، مالىكىي، شافىئىي، ھەنبەلىي) نىڭ كۆز قارىشلىرىنى\n' +
      'تونۇشتۇرۇڭ. تەرتىپ:\n' +
      '1. مەسىلىنىڭ ئاددىي ئۇيغۇرچە بايانى.\n' +
      '2. ھەر بىر مەزھەبنىڭ ھۆكمى ۋە دەلىلى. ئىختىلاپ بولسا سەۋەبىنى\n' +
      '   ئېنىق ئېيتىڭ.\n' +
      '3. زامانىۋىي پەتىۋا ھەيئەتلىرى (ئىسلام فىقھى ئاكادېمىيىسى، مىسىر\n' +
      '   ئەلئەزھەر، سەئۇدى دائىمى ھەيئەت قاتارلىقلار) نىڭ كۆز قارىشى.\n' +
      '4. ئاخىرىدا ساغلام ئوتتۇرا يول.\n' +
      'دىققەت: شەخسىي پەتىۋا بەرمەڭ — ئالىملارنىڭ كۆز قاراشلىرىنىڭ\n' +
      'تەسۋىرى. مۇئەييەن مەزھەبنى تەركىپ قىلماڭ.'
  },
  poetry: {
    role: 'سىز ئۇيغۇر، پارىس ۋە ئەرەب شېئىرىيىتى بويىچە ئەدەبىيات تەنقىدچىسىز.',
    task:
      'تۆۋەندىكى شېئىرنى ئەدەبىي جەھەتتە تەھلىل قىلىڭ. تەرتىپ:\n' +
      '1. شائىر ھەققىدە قىسقىچە مەلۇمات (ئېنىق بولسا).\n' +
      '2. شېئىرنىڭ ئومۇمىي مەنا ۋە ئۇچۇرى.\n' +
      '3. شېئىردا ئىشلىتىلگەن ئوبراز، تەشبىھ، ئىستىئارە، كىنايە كەبى\n' +
      '   ئەدەبىي سەنئەت ئۇسۇللىرى.\n' +
      '4. ۋەزىن، قاپىيە ۋە رادىف (مۇۋاپىق بولسا).\n' +
      '5. شېئىردىكى مەنىۋىي / ئەخلاقىي / ئىسلامى قىممەت.\n' +
      'دىققەت: شائىر ئېنىق ئەمەس بولسا تەخمىن قىلماڭ.'
  },
  political: {
    role: 'سىز ئومۇمىي مەلۇمات ۋە ئوبيېكتىپ تەھلىل بويىچە ياردەمچىسىز.',
    task:
      'تۆۋەندىكى سىياسىي / ئىجتىمائىي تېكىستنى تەھلىل قىلىپ بېرىڭ.\n' +
      'مۇتلەق ئادىل، ئوبيېكتىپ بولۇڭ. تەرتىپ:\n' +
      '1. تېكىستتىكى ئاساسلىق پىكىر ۋە دەلىللەرنى خۇلاسىلەش.\n' +
      '2. تېكىستنىڭ ئارقىسىدىكى تارىخىي / ئىجتىمائىي فون.\n' +
      '3. ئوخشىمىغان كۆز قاراشلار (ھەر تەرەپنىڭ پىكرى).\n' +
      '4. ئېنىق بولسا مۇتەخەسسىسلەرنىڭ كۆز قارىشى.\n' +
      '5. ئاخىرىدا «بۇ پەقەت قاراشلارنىڭ تەسۋىرى» دەپ ئەسكەرتىڭ.'
  },
  literary: {
    role: 'سىز ئۇيغۇر، تۈركى ۋە ئەرەب ئەدەبىياتى بويىچە تەنقىدچىسىز.',
    task:
      'تۆۋەندىكى ئەدەبىي پارچىنى تەھلىل قىلىڭ:\n' +
      '1. پارچىنىڭ ئومۇمىي مەزمۇنى ۋە ئۇچۇرى.\n' +
      '2. ئۇسلۇب، تىل ئىشلىتىش ۋە بەدىئىي ئالاھىدىلىكى.\n' +
      '3. شەخسلەر، ۋەقەلىك، يەرلىك (بار بولسا).\n' +
      '4. مەنىۋىي ياكى ئەخلاقىي تېمىلار.\n' +
      '5. ئۇيغۇر / ئىسلام / تۈركى ئەدەبىياتىدىكى ئورنى.'
  },
  general: {
    role: 'سىز ھەرتەرەپلىمە ساۋادلىق، ئوبيېكتىپ ياردەمچىسىز.',
    task:
      'تۆۋەندىكى مەزمۇن ھەققىدە ئوقۇرمەننىڭ سوئالىغا ساغلام پىكىر بىلەن\n' +
      'جاۋاب بېرىڭ:\n' +
      '1. سوئالنىڭ نېمىنى سوراۋاتقانلىقىنى ئېنىق چۈشىنىش.\n' +
      '2. ئىشەنچلىك ئۇچۇر ئاساسىدا جاۋاب.\n' +
      '3. تەخمىن ئەمەس — بىلمىسىڭىز ئاشكارا ئېيتىڭ.\n' +
      '4. ئادىل، ئوبيېكتىپ.'
  },
  // Literary / multilingual translation into Uyghur.
  translation: {
    role: 'سىز كلاسسىك ئۇيغۇر، ئەرەب، پارىس ئەدەبىياتى ۋە دىنىي تېكىست ' +
          'ئىشلىرى بويىچە كۆپ تىللىق تەرجىمانسىز.',
    task:
      'تۆۋەندىكى تېكىستنى ئەسلىي مەنا، ئەدەبىي گۈزەللىك ۋە كونتېكستنى ' +
      'ساقلىغان ھالدا ئۇيغۇر يېزىقىغا تەرجىمە قىلىڭ. تەرتىپ:\n' +
      '1. ئۇيغۇرچە چىگ تەرجىمە (ئۇچۇر سادىقلىقى ئاساس).\n' +
      '2. ئەدەبىي ياكى شېئىرىي تەرجىمە (ماس بولسا).\n' +
      '3. مۇھىم سۆز / ئاتالغۇ / ئوبرازنىڭ چۈشەندۈرۈلۈشى.\n' +
      '4. تارىخىي ياكى دىنىي كونتېكست (مۇۋاپىق بولسا).\n' +
      'دىققەت: تەخمىنى توقۇپ چىقماڭ. ئېنىق بولمىغان جايلارنى ئېيتىڭ.'
  },
  // Find content about a topic inside the supplied book passages. In RAG
  // mode the context arrives pre-tagged with [N-ئورۇن] markers; the prompt
  // below works in both modes.
  topic_search: {
    role: 'سىز كىتاب مەزمۇنى ئىچىدىن ئۇچۇر تېپىپ بېرىدىغان ئىزدەش ياردەمچىسىز.',
    task:
      'تۆۋەندىكى كىتاب پارچىلىرى ئىچىدىن ئوقۇرمەنگە لازىم بولغان مەزمۇننى\n' +
      'تېپىپ بېرىڭ. ئەگەر پارچىلارنىڭ بېشىدا [N-ئورۇن] بەلگىسى بولسا\n' +
      'ئۇنى نەقىلنىڭ مەنبەسى سۈپىتىدە ئىشلىتىڭ. تەرتىپ:\n' +
      '1. تېپىلغان نەقىلنى مۇلاھىزىسى بىلەن كۆچۈرۈڭ.\n' +
      '2. ھەربىر نەقىلنىڭ ئاخىرىدا [N-ئورۇن] بولسا ئۇنى كۆرسىتىڭ.\n' +
      '3. ھېچنېمە تېپىلمىسا، ئاشكارا ئېيتىڭ — توقۇماڭ.'
  },
  // Dedicated summary (reader/notebook «خۇلاسىلەش») — replaces the old
  // type:'general' + canned-question path.
  summary: {
    role: 'سىز تېكىستنى دەل، ئوبيېكتىپ ۋە رەتلىك خۇلاسىلەيدىغان ماھىر ياردەمچىسىز.',
    task:
      'تۆۋەندىكى تېكىستنى (ئوقۇرمەن تاللىغان بۆلەك، ياكى بۇ بەت، ياكى پۈتۈن كىتاب) ئوقۇپ،\n' +
      'ئەڭ مۇھىم نۇقتىلىرىنى ئاجرىتىپ خۇلاسىلەپ بېرىڭ. تەرتىپ:\n' +
      '1. ئومۇمىي مەزمۇننىڭ قىسقىچە بايانى (1–2 جۈملە).\n' +
      '2. ئەڭ مۇھىم نۇقتىلار — رەتلىك، ئېنىق، ھەر بىرى قىسقا.\n' +
      '3. بار بولسا، ئاساسلىق خۇلاسە ياكى نەتىجە.\n' +
      'دىققەت: ئەسلىي مەزمۇنغا تولۇق سادىق بولۇڭ؛ يېڭى مەزمۇن قوشماڭ، تەخمىن قىلماڭ. تېكىست\n' +
      'قايسى ساھەگە (دىنىي، ئەدەبىي، تارىخىي قاتارلىق) تەۋە بولسا شۇ ئاھاڭدا، ساپ ھەم\n' +
      'چۈشىنىشلىك ھازىرقى زامان ئۇيغۇر تىلىدا يېزىڭ.'
  },
  // Central idea / authorial intent («مەركىزىي ئىدىيەسى»).
  central_idea: {
    role: 'سىز ئەسەرنىڭ ماھىيىتى ۋە ئاپتورنىڭ غايىسىنى چوڭقۇر يېشىپ بېرىدىغان ئەدەبىيات ۋە تەپەككۇر تەھلىلچىسىز.',
    task:
      'تۆۋەندىكى تېكىستنىڭ (تاللانغان بۆلەك، بۇ بەت ياكى پۈتۈن كىتاب) مەركىزىي ئىدىيەسىنى\n' +
      'چوڭقۇر تەھلىل قىلىپ بېرىڭ. ئاپتورنىڭ ئورنىدا تۇرۇپ، ئۇنىڭ ئوقۇرمەنگە يەتكۈزمەكچى\n' +
      'بولغان ئاساسلىق ئىدىيە ۋە مەقسىتىنى ئېچىپ بېرىڭ. تەرتىپ:\n' +
      '1. مەركىزىي ئىدىيە — بىر-ئىككى ئېنىق جۈملىدە.\n' +
      '2. ئاپتور بۇ ئەسەر/بۆلەك ئارقىلىق نېمىنى ئىپادىلىمەكچى؟ (مەقسەت، كۆزقاراش، روھ).\n' +
      '3. بۇ ئىدىيە تېكىستتە قانداق ئىپادىلەنگەن — ئاساس ۋە دەلىللەر.\n' +
      '4. ئاساسلىق تېما ۋە ئۇقۇملار (بار بولسا).\n' +
      '5. مۇۋاپىق بولسا، ئىدىيەنىڭ ئەدەبىي / مەنىۋىي / ئىجتىمائىي قىممىتى.\n' +
      'دىققەت: پۈتۈنلەي تېكىستكە ئاساسلىنىپ تەھلىل قىلىڭ، قۇرۇق تەخمىن قىلماڭ. ئاپتور ياكى\n' +
      'مەنبە ئېنىق بولمىسا، ئىدىيەنى تېكىستنىڭ ئۆزىدىن چىقىرىپ بايان قىلىڭ. ساپ، چوڭقۇر،\n' +
      'كەسپىي ھازىرقى زامان ئۇيغۇر تىلىدا يېزىڭ.'
  },
  // Explain a term — handles BOTH a user-typed term (in opts.question) and an
  // automatic mode (no question → the model picks the noteworthy terms).
  term_explain: {
    role: 'سىز ئاتالغۇ، ئۇقۇم ۋە ئىسىملارنى كونتېكستكە ئۇيغۇن، ئېنىق چۈشەندۈرىدىغان كەسپىي ياردەمچىسىز.',
    task:
      'تۆۋەندىكى تېكىستكە ئاساسلىنىپ ئاتالغۇ چۈشەندۈرۈڭ. ئىككى ئەھۋال بار:\n' +
      '• ئەگەر تۆۋەندە «ئوقۇرمەننىڭ سوئالى» دا مەلۇم بىر ئاتالغۇ كۆرسىتىلگەن بولسا — دەل شۇ\n' +
      '  ئاتالغۇنى، تېكىستتە قايسى مەنىدە كەلگەن بولسا شۇ كونتېكست بويىچە چۈشەندۈرۈڭ، ئاندىن\n' +
      '  (مۇۋاپىق بولسا) ئومۇمىي/كەسپىي مەنىسىنى قوشۇڭ.\n' +
      '• ئەگەر ئاتالغۇ كۆرسىتىلمىگەن بولسا — تېكىستتىن چۈشىنىشكە تەس، ئىزاھاتقا ئەرزىيدىغان\n' +
      '  مۇھىم ئاتالغۇ، ئۇقۇم، ئىسىم ياكى جاي ناملىرىنى ئۆزىڭىز تاللاپ، ھەربىرىنى\n' +
      '  «ئاتالغۇ — ئىزاھات» شەكلىدە تىزىپ چۈشەندۈرۈڭ.\n' +
      'ئىزاھاتلار ئىنتايىن مۇۋاپىق، يىغقان، ئەمما تېكىست كونتېكستىگە ئۇيغۇن بولسۇن؛ ھازىرقى\n' +
      'زامان ئۇيغۇر تىلىدا، كەسپىي ۋە ئەدەبىي ئۇسلۇبتا يېزىلسۇن.\n' +
      'دىققەت: ئەھمىيەتسىز ئادەتتىكى سۆزلەرنى ئالماڭ؛ تەخمىن قىلماڭ، بىلمىگەننى ئاشكارا ئېيتىڭ.'
  }
};

// Directed-pair literary translation.
const LANGS = {
  uy: { name: 'Uyghur',                              script: 'the Uyghur Arabic script' },
  ar: { name: 'Arabic (Modern Standard / فصحى)',     script: 'Arabic script' },
  en: { name: 'English',                             script: 'Latin script' },
  tr: { name: 'Turkish (modern İstanbul Turkish)',   script: 'Latin script' }
};

// Self-contained translation prompt. CRITICAL: it does NOT include
// SYSTEM_BASE (which forces Uyghur output) — otherwise translating INTO
// Arabic/English/Turkish would come back in Uyghur.
function buildTranslationPrompt(from, to, text) {
  const S = LANGS[from] || LANGS.uy;
  const T = LANGS[to] || LANGS.uy;
  return [
    // State the target language up front AND at the end so it is enforced
    // beyond doubt (the model must never echo the source language).
    'TASK: Translate FROM ' + S.name + ' INTO ' + T.name + '. The entire output must be written in ' + T.name + ' (' + T.script + ').',
    '',
    'You are a master literary translator with native-level command of ' + S.name + ' and',
    T.name + ', expert across classical, religious, and literary registers.',
    'Translate the passage delimited by <<< >>> from ' + S.name + ' into ' + T.name + '.',
    'Rules:',
    '1. Convey the full meaning faithfully and precisely — no additions, omissions, or distortion.',
    '2. Write natural, fluent, idiomatic ' + T.name + ' as an educated native writer would —',
    '   never a word-for-word calque. Match the register and tone (formal→formal,',
    '   poetic→poetic, archaic→dignified classical).',
    '3. Preserve literary beauty — rhythm, imagery, and rhetorical figures — recreated with',
    "   the target language's own devices.",
    '4. Proper nouns and technical/religious terms: use the established ' + T.name + ' form;',
    '   if none exists, render faithfully and keep the original once in parentheses.',
    '5. Quran verses, hadith, or famous classical quotations: translate the meaning',
    '   faithfully and accurately; never paraphrase loosely.',
    '6. Resolve ambiguity from context; pick the most contextually apt reading.',
    '7. Output ONLY the finished translation, written entirely in ' + T.name,
    '   (' + T.script + '). No notes, no preamble, no source text, no explanation.',
    '<<<',
    String(text || ''),
    '>>>',
    '',
    'The ENTIRE response must be written in ' + T.name + ' (' + T.script + '). Do not output any text in ' + S.name + '. Do not transliterate; translate.'
  ].join('\n');
}

// Uyghur proofreading prompt (Phase 4). Fixes ONLY spelling/orthography/
// punctuation on numbered ⟦N⟧ segments, returning the SAME markers in order.
// English meta-instructions (Gemini follows them most reliably); the content
// rules are Uyghur-specific.
function buildProofreadPrompt(segmented) {
  return [
'TASK: Proofread modern Uyghur text (Arabic script). Fix ONLY spelling, orthography, and punctuation. Output the corrected text and NOTHING else.',
'',
'You are an expert editor of modern standard Uyghur (ھازىرقى زامان ئۇيغۇر ئەدەبىي تىلى) with complete command of the current official orthography and punctuation rules.',
'',
'The input consists of numbered segments. Each segment starts with a marker like ⟦1⟧, ⟦2⟧ … on its own line region. You MUST return the SAME segments with the SAME markers in the SAME order — one corrected segment per marker, no segments added, merged, split, or dropped.',
'',
'CORRECT (and nothing more):',
'1. Spelling per current Uyghur orthography: correct hemze (ئ) usage at word/syllable starts; correct Uyghur vowel letters (ا ە ې ى و ۇ ۆ ۈ); vowel-harmony-consistent suffix forms; commonly confused consonants (ق/ك، غ/خ، ھ/خ) judged by the intended word.',
'2. Character-level intrusions from Arabic/Persian keyboards: ی→ي، ك variants→ك، ه used as a vowel→ە، ة→ت where the word is Uyghur. Never "correct" genuinely Arabic quotations (Quran, hadith, duas) — leave Arabic passages exactly as written.',
'3. Punctuation per Uyghur rules: sentence-final «.», question «؟», exclamation «!», comma «،», semicolon «؛», colon «:», quotes «...» for quotations; no space BEFORE punctuation, exactly one space AFTER; paired punctuation balanced.',
'4. Spacing: collapse double spaces; fix spaces around parentheses and dashes; fix wrongly joined or split words ONLY when the correct form is unambiguous.',
'',
'NEVER:',
'- Rephrase, reorder, summarize, expand, or "improve" wording. Word choice belongs to the author.',
'- Change names, numbers, dates, Latin-script words, or Arabic quotations.',
'- Add or remove sentences. If a word is ambiguous and context does not decide it, leave it unchanged.',
'',
'OUTPUT: only the corrected segments with their ⟦N⟧ markers. No preamble, no explanations, no diff.',
'',
'INPUT SEGMENTS:',
String(segmented || '')
  ].join('\n');
}

// OCR cleanup prompt. Repairs OCR/orthography artifacts on numbered ⟦N⟧
// segments, same marker contract as proofread. Bypasses SYSTEM_BASE. Shared by
// import-time cleanup AND the in-reader "Gemini ئىملا تۈزىتىش" feature.
function buildOcrCleanupPrompt(segmented) {
  return [
'TASK: Repair OCR/orthography errors in UYGHUR text (kona yëziq, Uyghur Arabic alphabet). Fix ONLY recognition and orthography errors. Output the repaired text and NOTHING else.',
'',
'You are an expert in modern Uyghur orthography and in OCR failure modes on Uyghur print — including engines that wrongly "normalize" Uyghur toward Arabic/Persian.',
'',
'The input consists of numbered segments marked ⟦1⟧, ⟦2⟧ … Return the SAME segments, SAME markers, SAME order — none added, merged, split, or dropped.',
'',
'RULES:',
'1. This is UYGHUR — do NOT normalize toward Arabic or Persian. Restore Uyghur letters the OCR mis-read: ك that should be ڭ → ڭ; ژ that should be ۋە → ۋە; ه used as a Uyghur vowel → ە; ی → ي. Keep ئـ ھ ڭ گ ق ك خ غ ژ چ پ and the vowels ا ە و ۇ ۆ ۈ ې ى ي correct.',
'2. Remove spurious spaces INSIDE a word (a common OCR artifact) — e.g. «سە ككىز» → «سەككىز». Reconstruct the intended Uyghur word for each garbled token by context — e.g. «توركنىك» → «توركنىڭ». Rejoin hyphenated line-break splits; fix split/merged words.',
'3. Fix lost or doubled dots (ب/پ/ت/ث، ج/چ/خ، ر/ز) and confused vowels (ى/ي، و/ۇ/ۆ/ۈ); remove stray garbage glyphs; fix Latin lookalikes (l/1, O/0) inside numbers.',
'4. Fix punctuation damaged by OCR («,»→«،» etc.) per Uyghur conventions.',
'5. Keep genuinely Arabic quotations (Quran, hadith) in correct Arabic — repair their OCR damage but never translate or alter their wording. Keep numbers, dates, and proper names; repair only when the OCR error is obvious.',
'6. Change ONLY recognition/orthography errors. NEVER reword, rephrase, modernize, summarize, translate, or add/remove content. If a token is unreadable beyond repair, keep it as-is rather than inventing text.',
'',
'OUTPUT: only the repaired segments with their ⟦N⟧ markers. No commentary.',
'',
'INPUT SEGMENTS:',
String(segmented || '')
  ].join('\n');
}

// Book metadata extraction prompt (Phase 5.4). Returns ONE strict JSON object.
// Bypasses SYSTEM_BASE so the JSON instruction is not overridden.
function buildMetadataPrompt(excerpt, categories) {
  return [
'TASK: Extract bibliographic metadata from the opening excerpt of a book. Respond with ONE JSON object and NOTHING else (no markdown fences, no commentary).',
'',
'JSON shape: {"title": string, "author": string, "category": string, "description": string}',
'Rules:',
'- "title"/"author": as printed in the excerpt; empty string if not determinable. Never guess an author.',
'- "category": choose the single best fit from this exact list (copy it verbatim) or "" if none fits: ' + JSON.stringify(categories || []) + '.',
'- "description": 1–2 sentences in Uyghur (Arabic script) describing what the book is about, based only on the excerpt.',
'- All values must be plain strings without line breaks.',
'',
'EXCERPT:',
String(excerpt || '').slice(0, 4000)
  ].join('\n');
}

function buildPrompt(opts) {
  // Translation bypasses SYSTEM_BASE entirely.
  if (opts.type === 'translation' && opts.translateFrom && opts.translateTo) {
    return buildTranslationPrompt(opts.translateFrom, opts.translateTo,
      String(opts.context || '').slice(0, MAX_CONTEXT_CHARS));
  }
  // Uyghur proofread — segmented ⟦N⟧ protocol, also bypasses SYSTEM_BASE.
  if (opts.type === 'uy_proofread') {
    return buildProofreadPrompt(String(opts.context || '').slice(0, MAX_CONTEXT_CHARS));
  }
  // OCR cleanup — segmented ⟦N⟧ protocol, bypasses SYSTEM_BASE.
  if (opts.type === 'ocr_cleanup') {
    return buildOcrCleanupPrompt(String(opts.context || '').slice(0, MAX_CONTEXT_CHARS));
  }
  // Book metadata extraction — strict JSON, bypasses SYSTEM_BASE.
  if (opts.type === 'metadata') {
    return buildMetadataPrompt(String(opts.context || '').slice(0, 4000), opts.categories);
  }
  const type = opts.type || 'general';
  const tmpl = PROMPTS[type] || PROMPTS.general;
  const ctx = String(opts.context || '').slice(0, MAX_CONTEXT_CHARS);
  const question = String(opts.question || '').trim();

  const sections = [
    SYSTEM_BASE,
    '',
    'تۈر: ' + type,
    'رول: ' + tmpl.role,
    '',
    'ۋەزىپە:',
    tmpl.task,
    ''
  ];

  if (ctx) {
    sections.push('--- تېكىست (ھازىر ئوقۇلۇۋاتقان مەزمۇن) ---');
    sections.push(ctx);
    sections.push('--- تېكىست ئاخىرى ---');
    sections.push('');
  }

  if (question) {
    sections.push('ئوقۇرمەننىڭ سوئالى:');
    sections.push(question);
  } else {
    sections.push('ئوقۇرمەن ئېنىق سوئال سورىمىدى. يۇقىرىدىكى ۋەزىپە بويىچە');
    sections.push('تېكىست ھەققىدە ئەڭ پايدىلىق چۈشەندۈرۈشنى بېرىڭ.');
  }

  return sections.join('\n');
}

// ----------------------------------------------------------------
// Low-level fetch with timeout
// ----------------------------------------------------------------

// ----------------------------------------------------------------
// HTTP transport
// ----------------------------------------------------------------
// Every request goes through Electron's net.fetch (Chromium's network stack),
// NOT Node's global fetch.
//
// WHY: Chromium uses the WINDOWS certificate store and the system proxy
// settings; Node ships its own fixed CA list and ignores both. Antivirus
// products that inspect HTTPS (Avast, AVG, Kaspersky, ESET…) work by
// re-signing every certificate with their own root CA, which lives in the
// Windows store. Under Node's fetch those requests fail with
// UNABLE_TO_VERIFY_LEAF_SIGNATURE — verified on a real Avast machine with
// Electron 28: node fetch and https.get both failed while net.fetch returned
// HTTP 200. The user would see "no internet" while their browser works fine.
//
// net.fetch is a drop-in here: it streams incrementally (measured: 61
// progressive reads on a 25 KB SSE answer), honours AbortSignal, and returns
// error bodies unchanged. Falls back to global fetch when Electron is absent
// (unit tests / tooling).
let netFetchImpl;
function httpFetch(url, opts) {
  if (netFetchImpl === undefined) {
    try {
      const electron = require('electron');
      netFetchImpl = (electron && electron.net && typeof electron.net.fetch === 'function')
        ? function (u, o) { return electron.net.fetch(u, o); }
        : null;
    } catch (_) { netFetchImpl = null; }
    console.log('[ai] transport =', netFetchImpl ? 'electron.net.fetch (system CA store + system proxy)' : 'node fetch');
  }
  return netFetchImpl ? netFetchImpl(url, opts) : fetch(url, opts);
}

function fetchWithTimeout(url, opts, timeoutMs) {
  return new Promise(function (resolve, reject) {
    const controller = new AbortController();
    const fetchOpts = Object.assign({}, opts || {});
    fetchOpts.signal = controller.signal;
    const t = setTimeout(function () {
      try { controller.abort(); } catch (_) {}
      reject(new Error('بەلگىلەنگەن ۋاقىتتا جاۋاب چىقمىدى (' + timeoutMs + 'ms)'));
    }, timeoutMs);
    httpFetch(url, fetchOpts).then(function (r) {
      clearTimeout(t);
      resolve(r);
    }).catch(function (e) {
      clearTimeout(t);
      reject(e);
    });
  });
}

// ----------------------------------------------------------------
// Main API call
// ----------------------------------------------------------------

async function callGemini(model, key, body, opts) {
  opts = opts || {};
  // x-goog-api-key HEADER auth (Google's current standard). Works for BOTH
  // legacy "AIza…" keys AND the newer "AQ.…" auth keys AI Studio now issues by
  // default, so the call path keeps working past the 2026-06-19 / 2026-09
  // standard-key deprecation. The key rides in a header, never in the URL or a
  // log line.
  const url = API_BASE + '/models/' + encodeURIComponent(model)
            + ':generateContent';
  console.log('[ai] POST', url);

  let lastErr = null;
  for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
    try {
      const resp = await fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body)
      }, REQUEST_TIMEOUT_MS);

      // 429 / 5xx: retry with backoff.
      if (resp.status === 429 || (resp.status >= 500 && resp.status < 600)) {
        let detail = '';
        let retryMs = 0;
        try {
          const j = await resp.json();
          detail = (j.error && j.error.message) || '';
          // Google 429s often carry RetryInfo.retryDelay (e.g. "26s") — use
          // it to size the key cooldown precisely instead of guessing.
          const det = (j.error && j.error.details) || [];
          for (let di = 0; di < det.length; di++) {
            const rd = det[di] && det[di].retryDelay;
            if (rd) { const s = parseFloat(String(rd)); if (isFinite(s) && s > 0) retryMs = Math.round(s * 1000); }
          }
        } catch (_) {}
        lastErr = new Error('HTTP ' + resp.status + (detail ? ' — ' + detail : ''));
        // Stash the status so ask() can map 429 to a friendly Uyghur
        // "quota exhausted" message instead of the raw Gemini string.
        lastErr.status = resp.status;
        if (retryMs) lastErr.retryDelayMs = retryMs;
        console.warn('[ai] attempt', attempt + 1, 'retryable error:', scrubKeyFromMsg(lastErr.message));
        // A paid-only model on a key without billing can NEVER succeed —
        // Google reports it as a 429, but no amount of backoff will help.
        // Break out at once so the failover loop can try a key that might
        // have billing, instead of burning the retry budget first.
        if (isPaidOnlyModelError(lastErr)) break;
        // Quota (429) OR server-busy (503/5xx) on a key that still has backups:
        // don't burn the whole backoff budget — fail over fast so we reach a
        // working key quickly. (callGeminiFailover sets quotaFastFail for every
        // key except the last; the last key keeps the full retry budget.)
        if (opts.quotaFastFail && (resp.status === 429 || (resp.status >= 500 && resp.status < 600))) break;
        await sleep(BACKOFF_MS[attempt] || 3000);
        continue;
      }

      // 404 on model name: signal so caller can fall back to another model.
      if (resp.status === 404) {
        let detail = '';
        try { const j = await resp.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
        const e = new Error('Model not found: ' + (detail || model));
        e.notFound = true;
        throw e;
      }

      if (!resp.ok) {
        let detail = '';
        try { const j = await resp.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
        throw new Error('HTTP ' + resp.status + (detail ? ' — ' + detail : ''));
      }

      const json = await resp.json();
      return json;
    } catch (e) {
      // Network / abort errors retry; explicit "notFound" doesn't.
      if (e && e.notFound) throw e;
      lastErr = e;
      console.warn('[ai] attempt', attempt + 1, 'failed:', (e && e.message) || e);
      // Fast-fail mode (every key except the last): ONE attempt per key, then
      // let the failover loop advance instead of burning the whole backoff
      // budget on a key that may simply be dead or unreachable.
      if (opts.quotaFastFail) break;
      if (attempt === MAX_TRIES - 1) break;
      await sleep(BACKOFF_MS[attempt] || 3000);
    }
  }
  throw lastErr || new Error('سوراش مەغلۇپ بولدى');
}

function extractText(json) {
  if (!json || !json.candidates || !json.candidates.length) return '';
  const cand = json.candidates[0];
  if (!cand.content || !cand.content.parts) return '';
  return cand.content.parts.map(function (p) { return p.text || ''; }).join('').trim();
}

// Streaming variant: like extractText but WITHOUT the trailing trim — each SSE
// chunk is a delta, and trimming would swallow the spaces between consecutive
// chunks (e.g. "...سۆز" + " يەنە..." → "...سۆزيەنە..."). The accumulated text
// is what the UI renders, so inter-chunk whitespace must survive.
function extractDelta(json) {
  if (!json || !json.candidates || !json.candidates.length) return '';
  const cand = json.candidates[0];
  if (!cand.content || !cand.content.parts) return '';
  return cand.content.parts.map(function (p) { return p.text || ''; }).join('');
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// ----------------------------------------------------------------
// Request-body builders (shared by ask() + askStream())
// ----------------------------------------------------------------

// Optional multi-turn history. `opts.history` is an array of
// { role:'user'|'model', text } that the UI caps to the last ~3 turns. We map
// it into Gemini `contents` BEFORE the new fully-framed user turn, and clamp
// each prior turn so a long earlier answer can't blow the free-tier token
// budget. With no history this returns exactly the single user turn.
function buildContents(opts) {
  const contents = [];
  const hist = Array.isArray(opts.history) ? opts.history.slice(-6) : [];
  for (let i = 0; i < hist.length; i++) {
    const h = hist[i];
    if (!h || !h.text) continue;
    const role = (h.role === 'model') ? 'model' : 'user';
    contents.push({ role: role, parts: [{ text: String(h.text).slice(0, 4000) }] });
  }
  contents.push({ role: 'user', parts: [{ text: buildPrompt(opts) }] });
  return contents;
}

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
];

// Gemini 3.x thinking control — the ONLY shape every model we offer accepts.
//
// VERIFIED against the live API on 2026-08-20: `thinkingBudget: 0` (what
// v3.1.0 sent on every non-deep request) is REJECTED with HTTP 400 by
// gemini-3.5-flash-lite ("Request contains an invalid argument") and by
// gemini-3.1-pro-preview ("Budget 0 is invalid. This model only works in
// thinking mode"). That is exactly why gemini-3.1-pro-preview failed in
// v3.1.0 even on a billing-enabled key — the request never reached the
// model. `thinkingLevel` is accepted by all three current models and by the
// two retired ones, so it is what every path sends now.
//   low  → minimum thinking, fastest, cheapest (the default for Q&A)
//   high → deep reasoning (the deepThink toggle)
// NOTE: thinking tokens are billed as output AND count against
// maxOutputTokens, which is why the long-output budget below carries
// headroom.
function thinkingConfigFor(deep) {
  return { thinkingLevel: deep ? 'high' : 'low' };
}

function buildBody(opts) {
  // Deep-reasoning toggle. Default OFF (thinkingLevel 'low') so the model
  // spends its budget on visible output instead of thinking.
  const deep = !!opts.deepThink;
  // Translation favours fidelity (lower temperature) and needs a much larger
  // output budget — a full translation is long, and the default 4096 would
  // truncate it.
  const isTranslate = (opts.type === 'translation');
  // Reconstruction tasks (translation, Uyghur proofread, OCR cleanup) must be
  // able to return the WHOLE input text — give them the large output budget so
  // a long note is never truncated mid-reply (truncation used to drop the tail
  // and break the ⟦N⟧ segment format).
  const isLongOutput = isTranslate || opts.type === 'uy_proofread' || opts.type === 'ocr_cleanup';
  return {
    contents: buildContents(opts),
    generationConfig: {
      temperature: isTranslate ? 0.3 : 0.4,
      topP: 0.9,
      thinkingConfig: thinkingConfigFor(deep),
      // Thinking tokens are drawn from THIS budget (measured: ~600-1300 at
      // level 'low'), so the reconstruction tasks — which must be able to
      // return the whole input text — get 12288 to keep the same ~8k of
      // usable answer space they had before thinking was mandatory.
      // The models cap at 65536, so both values are well inside the limit.
      maxOutputTokens: isLongOutput ? 12288 : 4096
    },
    safetySettings: SAFETY_SETTINGS
  };
}

// STRICT: the user's selected model is the ONLY model we try. We
// deliberately do NOT append MODEL_FALLBACKS — a silent substitution would
// run a model the user didn't choose (different quality AND different
// price). Kept list-shaped so the ask()/askStream() loops stay unchanged.
function modelListFor(requestedModel) {
  return [requestedModel || DEFAULT_MODEL];
}

// Run a request across the key list (primary → backups, with recently failed
// keys moved to the back). The key advances on anything a DIFFERENT key could
// plausibly fix: quota / rate-limit (429), server busy (5xx), a DEAD key
// (invalid / expired / suspended project), or a network-level failure.
// Model-not-found, size and other 4xx errors surface immediately — no key can
// fix those. The MODEL never changes here (STRICT model selection); only the
// key. quotaFastFail skips the per-key retry budget for every key except the
// last so failover stays snappy; the last key keeps the full retry budget.
async function callGeminiFailover(model, body) {
  const slots = orderedKeySlots();
  if (!slots.length) { const e = new Error('NO_KEY'); e.noKey = true; throw e; }
  let bestErr = null;
  let bestRank = -1;
  let attempts = 0;
  let paidOnlyCount = 0;
  for (let i = 0; i < slots.length; i++) {
    const isLast = (i === slots.length - 1);
    const s = slots[i];
    try {
      const json = await callGemini(model, s.key, body, { quotaFastFail: !isLast });
      markSlotGood(s);
      return json;
    } catch (e) {
      attempts++;
      // A paid-only model is NOT a sick key — the same key serves the free
      // models fine, so it keeps its place in the order.
      if (isPaidOnlyModelError(e)) paidOnlyCount++;
      else if (isQuotaError(e)) markKeyBad(s.key, 'quota', e.retryDelayMs);
      else if (isKeyInvalidError(e)) markKeyBad(s.key, 'invalid');
      // Keep the most ACTIONABLE error for the final message: busy ("retry
      // shortly") over quota ("wait / switch key") over a dead key.
      const rank = isServerBusyError(e) ? 3 : (isQuotaError(e) ? 2 : (isKeyInvalidError(e) ? 1 : 0));
      if (rank > bestRank) { bestRank = rank; bestErr = e; }
      if (!isFailoverError(e)) throw e;
      if (!isLast) {
        console.warn('[ai] key slot ' + s.slot + ' failed (' + scrubKeyFromMsg((e && e.message) || e) + ') — failing over to next key');
        continue;
      }
    }
  }
  // EVERY configured key answered "this model has no free tier for you" →
  // the problem is the MODEL, not the keys. Flag it so the caller shows the
  // named paid-key message instead of a generic quota failure.
  if (attempts > 0 && paidOnlyCount === attempts) {
    const e = bestErr || new Error('PAID_ONLY');
    e.paidOnlyAllKeys = true;
    throw e;
  }
  throw bestErr || new Error('سوراش مەغلۇپ بولدى');
}

function isQuotaError(err) {
  return !!(err && (err.status === 429 ||
    /\b429\b|quota|resource has been exhausted|rate.?limit/i.test(String(err.message || ''))));
}

// Did the request fail because the chosen MODEL has no free tier and THIS key
// has no billing? Google reports it as a 429 whose quota metric is
// *_free_tier_* with "limit: 0" — verified 2026-08-20 against
// gemini-3.1-pro-preview on a non-billing key:
//   "Quota exceeded for metric: …/generate_content_free_tier_requests,
//    limit: 0, model: gemini-3.1-pro"
// It looks like a quota error but it is NOT: waiting will never help and the
// same key works fine on a free model. A DIFFERENT key can fix it (a backup
// with billing enabled), so failover still walks the slots — but if every
// slot answers this way the user gets the named "needs a paid key" message
// instead of a generic quota complaint.
function isPaidOnlyModelError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  if (!isQuotaError(err)) return false;
  return /limit:\s*0\b/.test(msg) || /free[_ ]quota[_ ]tier/i.test(msg);
}

// Convenience for the "stream failed → non-stream retry failed too" paths:
// did EITHER attempt end with the paid-only verdict?
function isPaidOnly2(a, b) {
  return !!((a && (a.paidOnlyAllKeys || isPaidOnlyModelError(a))) ||
            (b && (b.paidOnlyAllKeys || isPaidOnlyModelError(b))));
}

// Did the request never reach Google at all — no HTTP status, because DNS,
// the connection or the 60s watchdog failed? Distinguishing this from an API
// rejection is what lets the UI say "check your internet" instead of
// blaming the key.
function isNetworkError(err) {
  if (!err) return false;
  if (err.noKey || err.aborted || err.notFound) return false;
  if (err.status != null) return false;
  return /fetch failed|ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ECONNRESET|ETIMEDOUT|network|socket|بەلگىلەنگەن ۋاقىتتا/i
    .test(String(err.message || '')) || err.status == null;
}

// Did the request fail because THIS key itself is dead — invalid, expired,
// revoked, or its Google Cloud project suspended/disabled? These are exactly
// the "one key stopped working" cases: a DIFFERENT key works fine, so the
// failover loop must advance past it. Must be checked BEFORE
// isModelUnavailableError, which otherwise swallows the 400/403 statuses
// these errors arrive with.
function isKeyInvalidError(err) {
  if (!err) return false;
  const msg = String(err.message || '');
  if (/API[ _]?key[ _]?not[ _]?valid|API_KEY_INVALID|API[ _]?key[ _]?(?:expired|invalid)|expired[^.]{0,40}API[ _]?key|CONSUMER_SUSPENDED|CONSUMER_INVALID|consumer[^.]{0,60}(?:suspended|invalid)|has been suspended|SERVICE_DISABLED|has not been used in project|API[ _]?key[^.]{0,40}(?:revoked|deleted|disabled)/i.test(msg)) return true;
  if ((err.status === 400 || /\bHTTP 400\b/.test(msg)) && /API key/i.test(msg)) return true;
  return false;
}

// Can a DIFFERENT key plausibly fix this error? Quota (429), busy server
// (5xx), a dead key, or a network-level failure (no HTTP status at all —
// timeout / DNS / wedged connect) → yes. A missing model (404), an input-size
// rejection, or any other 4xx is identical for every key → no.
function isFailoverError(err) {
  if (!err) return false;
  if (err.notFound || err.aborted || err.noKey) return false;
  if (isSizeError(err)) return false;
  // A paid-only model on a key without billing: a DIFFERENT key may well have
  // billing enabled, so keep walking the slots. (isQuotaError already covers
  // it, but say so explicitly — the intent is not obvious.)
  if (isPaidOnlyModelError(err)) return true;
  if (isQuotaError(err) || isServerBusyError(err) || isKeyInvalidError(err)) return true;
  if (err.status == null) return true;   // network / timeout / no-stream
  return false;
}

// Did the request fail because the SELECTED model itself is unavailable to
// this key? Covers: retired/wrong model ID (404), permission/billing gate
// (403 / PERMISSION_DENIED), and a paid-only model called with a free key —
// Gemini reports that last case as a 429 whose message says the model has
// no free quota tier (limit: 0), so it must be tested BEFORE isQuotaError.
// Strict model selection maps all of these to a "pick another model"
// message instead of silently substituting a different model.
function isModelUnavailableError(err) {
  if (!err) return false;
  if (isKeyInvalidError(err)) return false;   // dead KEY, not a model problem
  if (err.notFound) return true;
  if (err.status === 403 || err.status === 404) return true;
  const msg = String(err.message || '');
  if (/\bHTTP 40[34]\b/.test(msg)) return true;
  if (/PERMISSION_DENIED|permission denied|is not found|was not found|not supported|doesn'?t have access|does not have access/i.test(msg)) return true;
  if (/free quota tier|limit:\s*0\b/i.test(msg)) return true;
  return false;
}

// Uyghur error for an unavailable selected model — names the exact model so
// the user knows which choice failed and what to do. A retired / mistyped ID
// and a permission gate land here; the paid-tier case has its own message.
function modelUnavailableMessage(model) {
  return '«' + model + '» مودېلى ئىشلىمىدى. بۇ مودېلنىڭ ID سى ئۆزگەرگەن ياكى Google ئۇنى توختاتقان بولۇشى مۇمكىن. تەڭشەكلەرگە كىرىپ باشقا مودېل تاللاڭ. (مودېلىڭىز ئۆزلۈكىدىن ئالماشتۇرۇلمىدى.)';
}

// The chosen model is PAID-ONLY and no configured key has billing. Names the
// model, says plainly why it failed, gives both ways out, and states that the
// app did NOT switch the model behind the user's back.
function paidOnlyMessage(model) {
  const free = SELECTABLE_MODELS.filter(function (m) { return !isPaidOnlyModel(m); }).join(' / ');
  return '«' + model + '» — پۇللۇق مودېل. ھەقسىز Gemini ئاچقۇچى بۇ مودېلنى ئىشلىتەلمەيدۇ '
       + '(Google بۇ مودېلنىڭ ھەقسىز ھەققىنى 0 قىلىپ بەلگىلىگەن). ئىككى يولى بار: '
       + '① تەڭشەكلەردىن ھەقسىز مودېل تاللاڭ (' + free + ')؛ '
       + '② ياكى Google ھېساباتىڭىزدا billing نى ئېچىڭ: ' + URL_BILLING + ' . '
       + 'تاللىغان مودېلىڭىز ئۆزلۈكىدىن ئۆزگەرتىلمىدى.';
}

// No HTTP response at all — offline, DNS failure, or the 60s watchdog fired.
// Every non-AI feature keeps working, so say that too.
const NETWORK_MSG = 'ئىنتېرنېتقا باغلىنالمىدى. سۈنئىي ئىدراك ئىنتېرنېت تەلەپ قىلىدۇ؛ ئوقۇش، ئىزدەش، OCR، خاتىرە ۋە قۇرئان بۆلىكى ئىنتېرنېتسىزمۇ نورمال ئىشلەيدۇ.';

// Gemini's safety filter blocked the prompt or the answer.
const SAFETY_MSG = 'Google نىڭ بىخەتەرلىك سۈزگۈچى بۇ مەزمۇنغا جاۋاب بېرىشنى رەت قىلدى. سوئالنى باشقىچە يېزىپ ياكى تېكىستنىڭ باشقا بۆلىكىنى تاللاپ سىناڭ.';

// The call succeeded but came back with no text. The finishReason /
// blockReason Google returns is the only real clue — turn each known one
// into something the user can act on instead of printing the raw token.
function emptyAnswerMessage(reason) {
  const r = String(reason || '').toUpperCase();
  if (/SAFETY|BLOCKLIST|PROHIBITED|BLOCKED_REASON|IMAGE_SAFETY/.test(r)) return SAFETY_MSG;
  if (/RECITATION/.test(r)) return 'جاۋاب Google نىڭ نەقىل چەكلىمىسىگە ئۇچرىدى (مەزمۇن باشقا مەنبەگە بەك ئوخشاپ قالغان). سوئالنى ئازراق ئۆزگەرتىپ قايتا سىناڭ.';
  if (/MAX_TOKENS/.test(r)) return 'جاۋاب بەك ئۇزۇن بولۇپ كېتىپ توختاپ قالدى. تېكىستنى قىسقىراق بۆلەكلەرگە بۆلۈپ سىناڭ.';
  return 'جاۋاب چىقمىدى (سەۋەب: ' + (reason || 'نامەلۇم') + '). قايتا سىناڭ.';
}

// 429 on every key. Google reports how long to wait (RetryInfo) — show THAT
// instead of a made-up free-tier number, and only mention it when we have it.
function quotaAllMessage(retryMs) {
  const secs = (retryMs && retryMs > 0) ? Math.ceil(retryMs / 1000) : 0;
  const wait = secs
    ? ' Google ' + (secs >= 90 ? Math.ceil(secs / 60) + ' مىنۇت' : secs + ' سېكۇنت') + ' كۈتۈڭ دەۋاتىدۇ.'
    : '';
  return 'ھەقسىز ئىشلىتىش ھەققىڭىز توشۇپ قالدى.' + wait
       + ' بىردەمدىن كېيىن قايتا سىناڭ ياكى تەڭشەكلەرگە زاپاس Gemini API ئاچقۇچى قوشۇڭ.';
}

// Was the request rejected because Google's model is momentarily BUSY (HTTP
// 503 UNAVAILABLE / 500), not because of the key? A 503 means auth succeeded
// and the key is valid — the model was overloaded. An invalid key returns
// 400/403, never 503, so this is checked AFTER isModelUnavailableError (which
// owns 403/404) but it never overlaps with it. Lets test()/ask()/… show a
// "try again shortly" message instead of a hard failure or a fake key error.
function isServerBusyError(err) {
  if (!err) return false;
  if (err.status === 503 || err.status === 500) return true;
  return /\bHTTP 50[03]\b|UNAVAILABLE|overloaded|high demand/i.test(String(err.message || ''));
}

// Friendly Uyghur message for a momentarily busy model (used by ask/askStream/
// translateStream/chatStream — test() has its own key-reassuring variant).
const SERVER_BUSY_MESSAGE = 'مودېل ھازىر ئالدىراش (بەك كۆپ تەلەپ بار). بىردەمدىن كېيىن قايتا سىناڭ ياكى زاپاس Gemini API ئاچقۇچىغا ئالماشتۇرۇپ بېقىڭ.';

// NOTE: the "every key is quota-limited" text is built by quotaAllMessage()
// above, which folds in the wait Google actually reports. canSwitchKey on the
// result drives the renderer's "API ئالماشتۇرىمەن" button (jump to Settings to
// add / fix a backup key).

// Shown when the request died on invalid / expired / suspended key(s) and no
// healthier key could serve it. canSwitchKey → same Settings jump action.
const KEY_INVALID_MSG = 'Gemini API ئاچقۇچى ئىناۋەتسىز ياكى ۋاقتى ئۆتكەن. تەڭشەكلەرگە كىرىپ ئاچقۇچلىرىڭىزنى تەكشۈرۈپ يېڭىلاڭ.';

// Did Gemini reject the request because the INPUT was too large (token/size
// limit)? Used to drive the reactive "book too large" fallback — never a
// pre-emptive guess. We require a size-related phrase, and for a bare HTTP
// 400 also an INVALID_ARGUMENT + size word, so ordinary 400s (e.g. bad key)
// don't trip it.
function isSizeError(err) {
  const msg = String((err && err.message) || err || '');
  if (/exceeds the maximum number of tokens|maximum input|input token|request payload size|too large|content too long|exceeds the limit/i.test(msg)) return true;
  if (/INVALID_ARGUMENT/i.test(msg) && /token|size|large|payload|long/i.test(msg)) return true;
  return false;
}

function logTokenUsage(model, usageMetadata, deepThink) {
  try {
    const u = usageMetadata || {};
    console.log('[ai] tokens model=' + model +
      ' total=' + (u.totalTokenCount != null ? u.totalTokenCount : '?') +
      ' prompt=' + (u.promptTokenCount != null ? u.promptTokenCount : '?') +
      ' out=' + (u.candidatesTokenCount != null ? u.candidatesTokenCount : '?') +
      (deepThink ? ' (deep)' : ''));
  } catch (_) {}
}

// Defensive model self-heal — RETIRED from the automatic path. STRICT model
// selection means nothing may rewrite the user's chosen model behind their
// back, so ask()/askStream()/test() no longer invoke this. Kept only for
// diagnostics / a possible future explicit "find available models" button
// in Settings. NOTE: it persists a different model via setModel() — never
// wire it back into an automatic error path.
async function selfHealModel(key) {
  try {
    const url = API_BASE + '/models?key=' + encodeURIComponent(key);
    const resp = await fetchWithTimeout(url, { method: 'GET' }, REQUEST_TIMEOUT_MS);
    if (!resp.ok) return false;
    const json = await resp.json();
    const list = (json && json.models) || [];
    const usable = list.filter(function (m) {
      const methods = (m && m.supportedGenerationMethods) || [];
      return methods.indexOf('generateContent') !== -1;
    }).map(function (m) {
      return String((m && m.name) || '').replace(/^models\//, '');
    }).filter(Boolean);
    if (!usable.length) return false;
    // Prefer a flash tier (fast + good Uyghur on 3.x). Lexical desc sort
    // surfaces the highest version name (e.g. 3.5 before 3.1 before 2.x).
    const flash = usable.filter(function (n) { return /flash/i.test(n); });
    const pick = (flash.length ? flash : usable).slice().sort().reverse()[0];
    if (!pick) return false;
    setModel(pick);
    console.log('[ai] self-healed model →', pick);
    return true;
  } catch (e) {
    console.warn('[ai] selfHealModel failed:', e && (e.message || e));
    return false;
  }
}

async function ask(opts) {
  opts = opts || {};
  // RAG mode — the caller supplies context pre-tagged with [N-ئورۇن]
  // markers. Force the topic_search template so the model cites them.
  if (opts.mode === 'rag' && !opts.type) opts.type = 'topic_search';
  if (!getKeyList().length) {
    return { ok: false, error: 'Gemini API ئاچقۇچى تەڭشەلمىگەن. تەڭشەكلەرگە كىرىپ ئاچقۇچىڭىزنى قوشۇڭ.' };
  }
  if (!isEnabled()) {
    return { ok: false, error: 'سۈنئىي ئىدراك ئىقتىدارى تەڭشەكلەردە ئېتىلگەن.' };
  }

  const requestedModel = getModel();
  // Kept for the usage-log line below; buildBody() computes its own copy.
  const deepThink = !!opts.deepThink;
  const body = buildBody(opts);

  // Same model on every attempt; callGeminiFailover walks primary → backups,
  // advancing only on a 429. STRICT model selection is preserved.
  let lastErr = null;
  try {
    const json = await callGeminiFailover(requestedModel, body);
    const text = extractText(json);
    if (!text) {
      const reason = (json.promptFeedback && json.promptFeedback.blockReason)
                  || (json.candidates && json.candidates[0] && json.candidates[0].finishReason)
                  || 'unknown';
      // Log the response shape so we can diagnose safety-filter blocks vs.
      // token-budget exhaustion vs. odd response shapes.
      console.warn('[ai] empty response from', requestedModel, '— reason:', reason, 'json:',
                   JSON.stringify(json).slice(0, 400));
      return { ok: false, error: emptyAnswerMessage(reason) };
    }
    bumpUsage();
    logTokenUsage(requestedModel, json.usageMetadata, deepThink);
    return { ok: true, text: text, model: requestedModel };
  } catch (e) {
    // STRICT: the selected model failed on every key — no model substitution.
    // The error is mapped to a clear message below and the USER decides what
    // to do (switch model / enable billing / wait).
    lastErr = e;
  }

  // The API rejected the input on size. Signal the UI to offer the
  // in-book-search fallback instead of dumping a raw 400.
  if (isSizeError(lastErr)) {
    return { ok: false, tooLargeFallback: true, error: 'بۇ كىتاب بەك چوڭ بولۇپ، API نى بىراقلا قوبۇل قىلمىدى.' };
  }

  // Not one configured key has billing and the chosen model is paid-only.
  // Say exactly that, naming the model — never a generic "quota" complaint,
  // and never a silent hop to a cheaper model.
  if (lastErr && (lastErr.paidOnlyAllKeys || isPaidOnlyModelError(lastErr))) {
    return { ok: false, paidOnlyModel: true, model: requestedModel, error: paidOnlyMessage(requestedModel) };
  }

  // Every usable key was itself dead (invalid / expired / suspended) — point
  // the user at Settings; canSwitchKey drives the renderer's switch-key action.
  if (isKeyInvalidError(lastErr)) {
    return { ok: false, keyInvalid: true, canSwitchKey: true, error: KEY_INVALID_MSG };
  }

  // The SELECTED model itself is unavailable to this key (retired ID, or a
  // permission gate). Checked BEFORE the quota mapping because such errors
  // can arrive with odd statuses.
  if (isModelUnavailableError(lastErr)) {
    return { ok: false, error: modelUnavailableMessage(requestedModel) };
  }

  // Model momentarily busy (HTTP 503/500) — not a quota problem, just retry.
  if (isServerBusyError(lastErr)) {
    return { ok: false, busy: true, canSwitchKey: true, error: SERVER_BUSY_MESSAGE };
  }

  // 429 on EVERY key ("quota exhausted" or "rate limited"). Both Gemini's
  // per-minute rate limit and its per-day free-tier quota return 429; once the
  // quota refreshes on Google's side the next request succeeds automatically.
  // allKeysExhausted / canSwitchKey tell the renderer to offer the "switch
  // key" action (add or fix a backup key in Settings).
  if (isQuotaError(lastErr)) {
    return {
      ok: false,
      quotaExhausted: true,
      allKeysExhausted: true,
      canSwitchKey: true,
      error: quotaAllMessage(lastErr && lastErr.retryDelayMs)
    };
  }

  // Nothing ever reached Google — offline, DNS, or the watchdog.
  if (isNetworkError(lastErr)) {
    return { ok: false, offline: true, error: NETWORK_MSG };
  }

  return {
    ok: false,
    error: 'سوراش مەغلۇپ بولدى: ' + scrubKeyFromMsg((lastErr && lastErr.message) || 'نامەلۇم خاتالىق')
  };
}

// Lightweight connectivity probe — sends a one-token prompt, returns ok=true
// if anything comes back. Used by the Settings "test connection" button so
// the user knows their key actually works before opening a book.
// STRICT: probes ONLY the currently-selected model — a ✓ here means THIS
// model works, not that some other model answered in its place.
// One probe, one verdict. Every "does this key work?" button in Settings goes
// through here so the four slots can never be judged by different rules.
// `status` is the machine-readable verdict the UI colours on:
//   valid      — the model answered
//   invalid    — the key itself is rejected / expired / suspended
//   quota      — the key is fine, its free quota is spent for now
//   paid_only  — the key is fine, but the SELECTED model needs billing
//   busy       — the key is fine, the model is overloaded (5xx)
//   model_gone — the selected model ID is unavailable to this key
//   offline    — nothing reached Google
//   empty      — answered with no text (safety / token budget)
//   error      — anything else
// `keyOk` answers the narrower question the per-slot buttons ask: is THIS KEY
// usable at all? (true for quota / paid_only / busy — auth succeeded).
async function probeKey(key, model) {
  try {
    const json = await callGemini(model, key, {
      contents: [{ role: 'user', parts: [{ text: 'سالام دەپ بىر سۆزلا جاۋاب بەر.' }] }],
      generationConfig: {
        temperature: 0.2,
        thinkingConfig: thinkingConfigFor(false),
        // Thinking tokens come out of this budget, so a probe sized for the
        // one-word answer alone would come back EMPTY on a thinking model.
        maxOutputTokens: 1024
      }
    }, { quotaFastFail: true });
    const text = extractText(json);
    if (text) return { status: 'valid', keyOk: true, message: text, model: model };
    const reason = (json && json.candidates && json.candidates[0] && json.candidates[0].finishReason)
                || (json && json.promptFeedback && json.promptFeedback.blockReason)
                || 'unknown';
    return { status: 'empty', keyOk: true, message: emptyAnswerMessage(reason), model: model };
  } catch (e) {
    // Order matters: a paid-only model reports as a 429, and a dead key can
    // report as a 400 that also mentions the model.
    if (isPaidOnlyModelError(e)) {
      return { status: 'paid_only', keyOk: true, model: model,
               message: 'ئاچقۇچ توغرا — ئەمما «' + model + '» پۇللۇق مودېل، بۇ ئاچقۇچتا billing يوق.' };
    }
    if (isKeyInvalidError(e)) {
      return { status: 'invalid', keyOk: false, model: model,
               message: 'ئاچقۇچ ئىناۋەتسىز، ۋاقتى ئۆتكەن ياكى تىزىملىكى توختىتىلغان.' };
    }
    if (isModelUnavailableError(e)) {
      return { status: 'model_gone', keyOk: true, model: model, message: modelUnavailableMessage(model) };
    }
    if (isServerBusyError(e)) {
      return { status: 'busy', keyOk: true, model: model,
               message: 'ئاچقۇچ توغرا — «' + model + '» مودېلى ھازىر ئالدىراش (HTTP 503).' };
    }
    if (isQuotaError(e)) {
      const secs = e.retryDelayMs ? Math.ceil(e.retryDelayMs / 1000) : 0;
      return { status: 'quota', keyOk: true, model: model,
               message: 'ئاچقۇچ توغرا — ئەمما ھەققى ھازىرچە توشۇپ تۇرۇپتۇ.' + (secs ? ' (' + secs + ' سېكۇنتتىن كېيىن سىناڭ)' : '') };
    }
    if (isNetworkError(e)) {
      return { status: 'offline', keyOk: false, model: model, message: NETWORK_MSG };
    }
    return { status: 'error', keyOk: false, model: model,
             message: scrubKeyFromMsg((e && e.message) || 'سىناشتا خاتالىق') };
  }
}

// "باغلىنىشنى سىناش" for the PRIMARY key. This button answers "will AI work
// right now?", so a paid-only model counts as a FAILURE here (with the named
// message) even though the key itself is fine.
// STRICT: probes ONLY the currently-selected model — a ✓ here means THIS
// model works, not that some other model answered in its place.
async function test() {
  const key = loadKey();
  if (!key) return { ok: false, status: 'none', message: 'ئاچقۇچ يوق' };

  const model = getModel();
  const r = await probeKey(key, model);
  if (r.status === 'valid') return { ok: true, status: r.status, message: r.message, model: model };
  if (r.status === 'paid_only') {
    return { ok: false, status: r.status, paidOnlyModel: true, model: model, message: paidOnlyMessage(model) };
  }
  // HTTP 503/500 means the key is VALID — auth succeeded, the model is just
  // busy. Reassure the user the key is saved; don't render a hard ✗.
  if (r.status === 'busy') {
    return { ok: false, status: r.status, busy: true, model: model,
             message: '✓ ئاچقۇچىڭىز توغرا قوبۇل قىلىندى. بىراق «' + model + '» مودېلى ھازىر بەك ئالدىراش (HTTP 503). ئاچقۇچىڭىز ساقلاندى — بىردەمدىن كېيىن قايتا سىناڭ.' };
  }
  return { ok: false, status: r.status, model: model, message: r.message };
}

// Validate a SPECIFIC key string against the currently-selected model. Used by
// the Settings per-slot test buttons: the question is "is this KEY good?", so
// quota / paid-only / busy all still count as a working key.
async function testGivenKey(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key) return { ok: false, status: 'none', message: 'ئاچقۇچ بوش' };
  const model = getModel();
  const r = await probeKey(key, model);
  return {
    ok: r.keyOk,
    status: r.status,
    quota: r.status === 'quota',
    busy: r.status === 'busy',
    paidOnlyModel: r.status === 'paid_only',
    model: model,
    message: r.status === 'valid' ? 'ئىشلەۋاتىدۇ' : r.message
  };
}

// Test the key STORED in a slot: 0 = primary, 1..3 = backups. Lets the Settings
// UI verify each saved key by index — the renderer never sees the real key,
// only the status/message verdict.
async function testKeySlot(index) {
  const i = parseInt(index, 10) || 0;
  const all = [loadKey()].concat(getBackupKeys());
  const key = all[i] || '';
  if (!key) return { ok: false, status: 'none', slot: i, message: 'بۇ ئورۇندا ئاچقۇچ يوق' };
  const r = await testGivenKey(key);
  r.slot = i;
  return r;
}

// Test EVERY configured slot in one go and summarise. Used by the Settings
// "test all keys" action: the user sees at a glance which slots work, and if
// every key lacks billing while a paid-only model is selected we say THAT
// instead of showing four identical quota complaints.
async function testAllKeySlots() {
  const model = getModel();
  const all = [loadKey()].concat(getBackupKeys());
  const results = [];
  for (let i = 0; i < all.length; i++) {
    if (!all[i]) { results.push({ slot: i, ok: false, status: 'none', message: '' }); continue; }
    results.push(await testKeySlot(i));
  }
  const configured = results.filter(function (r) { return r.status !== 'none'; });
  const allPaidOnly = configured.length > 0 && configured.every(function (r) { return r.status === 'paid_only'; });
  return {
    ok: configured.some(function (r) { return r.status === 'valid'; }),
    model: model,
    results: results,
    allPaidOnly: allPaidOnly,
    summary: allPaidOnly ? paidOnlyMessage(model) : ''
  };
}

// ----------------------------------------------------------------
// Streaming variant of ask() — Server-Sent Events
//
// Builds the request EXACTLY like ask() (same buildPrompt / STRICT
// single-model list / generationConfig incl. thinkingConfig /
// safetySettings / usage counter / 429→friendly mapping / multi-turn
// history) but hits the SSE endpoint and feeds the answer to the caller
// as it arrives:
//   onChunk(textDelta)            — called as each delta arrives
//   onDone(fullText, model, usage, meta) — once the stream completes
//   onError({ok:false, error, …}) — called on failure (same shape as ask())
//   onReset(textSoFar)            — REPLACE everything rendered so far with
//                                   `textSoFar` (usually ''): the answer is
//                                   being restarted on the next key. Splicing
//                                   two half-answers together would produce
//                                   nonsense, so a mid-stream failover always
//                                   resets first. translateStream passes the
//                                   segments already finished, so only the
//                                   segment being retried is discarded.
// Returns { abort } so the caller can cancel mid-stream. If the stream fails
// BEFORE any text arrives, it transparently falls back to the non-stream
// ask() so nothing breaks.
// ----------------------------------------------------------------
function askStream(opts, onChunk, onDone, onError, onReset) {
  opts = opts || {};
  onChunk = onChunk || function () {};
  onDone  = onDone  || function () {};
  onError = onError || function () {};
  onReset = onReset || function () {};
  // Parity with ask(): RAG context forces the topic_search template.
  if (opts.mode === 'rag' && !opts.type) opts.type = 'topic_search';

  let aborted = false;
  let controller = null;
  function abort() {
    aborted = true;
    if (controller) { try { controller.abort(); } catch (_) {} }
  }

  (async function run() {
    if (!getKeyList().length) {
      onError({ ok: false, noKey: true, error: 'Gemini API ئاچقۇچى تەڭشەلمىگەن. تەڭشەكلەرگە كىرىپ ئاچقۇچىڭىزنى قوشۇڭ.' });
      return;
    }
    if (!isEnabled()) {
      onError({ ok: false, error: 'سۈنئىي ئىدراك ئىقتىدارى تەڭشەكلەردە ئېتىلگەن.' });
      return;
    }
    if (aborted) return;

    const requestedModel = getModel();
    const slots = orderedKeySlots();        // last-good slot first, then the rest
    const body = buildBody(opts);
    let lastErr = null;
    let emittedAny = false;   // did we hand any text to onChunk?
    let streamed = '';        // accumulated text for the current attempt
    let attempts = 0;         // how many slots actually failed
    let paidOnlyCount = 0;    // …of which, "model needs billing" failures

    // Stream with each key in turn. A 429 (quota / rate-limit), a 5xx or a
    // dead key fails over to the NEXT key with the SAME model — so the answer
    // streams straight from a backup with no action from the user. STRICT
    // model selection holds: only the key changes, never the model. If text
    // had already reached the UI when the failure hit, we call onReset() and
    // start the answer over on the next key rather than splicing two partial
    // answers together.
    for (let ki = 0; ki < slots.length; ki++) {
      const s = slots[ki];
      const k = s.key;
      const isLastKey = (ki === slots.length - 1);
      if (aborted) return;
      streamed = '';
      try {
        controller = new AbortController();
        const url = API_BASE + '/models/' + encodeURIComponent(requestedModel)
                  + ':streamGenerateContent?alt=sse';
        console.log('[ai] STREAM', url, '(key slot ' + s.slot + ')');
        // Connect watchdog: fetch() has no timeout, and a wedged connect used
        // to hang the request forever with no failover. Abort → the catch
        // below advances to the next key (nothing emitted yet).
        const connectController = controller;
        const connectTimer = setTimeout(function () {
          try { connectController.abort(); } catch (_) {}
        }, REQUEST_TIMEOUT_MS);
        let resp;
        try {
          resp = await httpFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': k },
            body: JSON.stringify(body),
            signal: controller.signal
          });
        } finally { clearTimeout(connectTimer); }

        if (resp.status === 404) {
          const e = new Error('Model not found: ' + requestedModel); e.notFound = true;
          lastErr = e; break;   // STRICT: model issue — another key won't help
        }
        if (!resp.ok) {
          let detail = '';
          try { const j = await resp.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
          lastErr = new Error('HTTP ' + resp.status + (detail ? ' — ' + detail : ''));
          lastErr.status = resp.status;
          attempts++;
          // Quota (429), server-busy (5xx) AND dead-key (invalid / expired /
          // suspended) errors → try the next key; a backup from a different
          // Cloud project very often gets through. Errors no key can fix
          // (missing model, size, other 4xx) stop the loop instead.
          if (isPaidOnlyModelError(lastErr)) paidOnlyCount++;   // model, not key — keep its place
          else if (isQuotaError(lastErr)) markKeyBad(k, 'quota', lastErr.retryDelayMs);
          else if (isKeyInvalidError(lastErr)) markKeyBad(k, 'invalid');
          if (isFailoverError(lastErr) && !isLastKey) continue;
          break;
        }
        if (!resp.body || typeof resp.body.getReader !== 'function') {
          throw new Error('NO_STREAM');
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buf = '';
        let usage = null;
        while (true) {
          if (aborted) { try { reader.cancel(); } catch (_) {} return; }
          const piece = await reader.read();
          if (piece.done) break;
          buf += decoder.decode(piece.value, { stream: true });
          // SSE frames are newline-delimited; a "data:" line carries one
          // complete GenerateContentResponse chunk. We only process whole
          // lines so a JSON object split across reads is never half-parsed.
          let nl;
          while ((nl = buf.indexOf('\n')) !== -1) {
            let line = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            line = line.replace(/\r$/, '').trim();
            if (!line || line.charAt(0) === ':') continue;       // keepalive/comment
            if (line.indexOf('data:') !== 0) continue;
            const payload = line.slice(5).trim();
            if (!payload || payload === '[DONE]') continue;
            let j = null;
            try { j = JSON.parse(payload); } catch (_) { continue; }
            const delta = extractDelta(j);   // no trim — preserve inter-chunk spaces
            if (delta) { streamed += delta; emittedAny = true; if (!aborted) onChunk(delta); }
            if (j.usageMetadata) usage = j.usageMetadata;
          }
        }
        if (aborted) return;
        if (!streamed) { lastErr = new Error('EMPTY_STREAM'); break; }

        markSlotGood(s);
        bumpUsage();
        logTokenUsage(requestedModel, usage, !!opts.deepThink);
        onDone(streamed, requestedModel, usage, { slot: s.slot });
        return;
      } catch (e) {
        if (aborted) return;
        lastErr = e;
        attempts++;
        // Network error / NO_STREAM / a mid-stream death → try the next key
        // (the network path to Google can be what's wedged, and the connect
        // watchdog lands here too).
        if (isFailoverError(e) && !isLastKey) {
          // Text was already on screen when it died: tell the caller to throw
          // it away, then start the answer over on the next key. Continuing
          // in place would splice two different half-answers together.
          if (emittedAny) {
            console.warn('[ai] stream died mid-output (slot ' + s.slot + ') — restarting cleanly on the next key');
            emittedAny = false;
            streamed = '';
            try { onReset(''); } catch (_) {}
          }
          continue;
        }
        break;
      }
    }

    if (aborted) return;

    // The LAST key died mid-answer and there is nothing left to fail over to.
    // Keeping the partial text beats throwing the user's answer away — it is
    // one answer cut short, not two spliced together.
    if (emittedAny && streamed) {
      bumpUsage();
      onDone(streamed, requestedModel, null, { slot: activeSlot, partial: true });
      return;
    }

    // Not one configured key has billing and the chosen model is paid-only.
    if ((attempts > 0 && paidOnlyCount === attempts) || isPaidOnlyModelError(lastErr)) {
      onError({ ok: false, paidOnlyModel: true, model: requestedModel, error: paidOnlyMessage(requestedModel) });
      return;
    }

    // If the API rejected the input on size, surface the reactive fallback
    // directly — don't re-send the huge body via ask().
    if (isSizeError(lastErr)) {
      onError({ ok: false, tooLargeFallback: true, error: 'بۇ كىتاب بەك چوڭ بولۇپ، API نى بىراقلا قوبۇل قىلمىدى.' });
      return;
    }

    // Every usable key was dead (invalid / expired / suspended).
    if (isKeyInvalidError(lastErr)) {
      onError({ ok: false, keyInvalid: true, canSwitchKey: true, error: KEY_INVALID_MSG });
      return;
    }

    // STRICT: the selected model itself is unavailable (404/403/paid-only).
    // Re-sending via ask() would just fail the same way on the same model —
    // surface the explicit Uyghur message now.
    if (isModelUnavailableError(lastErr)) {
      onError({ ok: false, error: modelUnavailableMessage(requestedModel) });
      return;
    }

    // Model momentarily busy (HTTP 503/500) — don't re-send the whole body via
    // ask(); just tell the user to retry shortly.
    if (isServerBusyError(lastErr)) {
      onError({ ok: false, busy: true, canSwitchKey: true, error: SERVER_BUSY_MESSAGE });
      return;
    }

    // 429 on every key — all keys are quota-limited. Surface it directly with
    // the switch-key action instead of re-running the non-stream ask().
    if (isQuotaError(lastErr)) {
      onError({ ok: false, quotaExhausted: true, allKeysExhausted: true, canSwitchKey: true,
                error: quotaAllMessage(lastErr && lastErr.retryDelayMs) });
      return;
    }

    // Nothing reached Google at all — offline / DNS / watchdog. Re-running
    // ask() over the same dead network would only add another 60s wait.
    if (isNetworkError(lastErr)) {
      onError({ ok: false, offline: true, error: NETWORK_MSG });
      return;
    }

    // Otherwise fall back to the proven non-stream path (SAME model,
    // non-streaming transport) so nothing breaks.
    try {
      const res = await ask(opts);
      if (aborted) return;
      if (res.ok) { onChunk(res.text); onDone(res.text, res.model, null, { slot: activeSlot }); }
      else onError(res);
    } catch (e2) {
      if (aborted) return;
      if (isQuotaError(lastErr) || isQuotaError(e2)) {
        onError({ ok: false, quotaExhausted: true, allKeysExhausted: true, canSwitchKey: true,
                  error: quotaAllMessage((lastErr && lastErr.retryDelayMs) || (e2 && e2.retryDelayMs)) });
      } else if (isNetworkError(lastErr) || isNetworkError(e2)) {
        onError({ ok: false, offline: true, error: NETWORK_MSG });
      } else {
        onError({ ok: false, error: 'سوراش مەغلۇپ بولدى: ' + scrubKeyFromMsg((lastErr && lastErr.message) || (e2 && e2.message) || 'نامەلۇم خاتالىق') });
      }
    }
  })();

  return { abort: abort };
}

// ----------------------------------------------------------------
// Directed-pair literary translation with streaming.
// ----------------------------------------------------------------

// Split long text into ordered segments ≤ maxLen on paragraph → sentence →
// hard boundaries, so each translation call stays well within the output
// budget (avoids mid-translation truncation). Short text → one segment.
function splitForTranslation(text, maxLen) {
  maxLen = maxLen || 6000;
  text = String(text || '');
  if (text.length <= maxLen) return [text];
  const units = text.split(/\n{2,}/);
  const pieces = [];
  for (let u = 0; u < units.length; u++) {
    const unit = units[u];
    if (unit.length <= maxLen) { pieces.push(unit); continue; }
    // Oversized paragraph: break on sentence enders / newlines.
    const tokens = unit.match(/[^.!?۔؟\n]*[.!?۔؟\n]?/g) || [unit];
    let bufp = '';
    for (let i = 0; i < tokens.length; i++) {
      const tk = tokens[i];
      if (!tk) continue;
      if (bufp.length + tk.length > maxLen) {
        if (bufp) pieces.push(bufp);
        if (tk.length > maxLen) {
          for (let k = 0; k < tk.length; k += maxLen) pieces.push(tk.slice(k, k + maxLen));
          bufp = '';
        } else { bufp = tk; }
      } else { bufp += tk; }
    }
    if (bufp) pieces.push(bufp);
  }
  // Merge adjacent pieces back up to maxLen, rejoining paragraphs with \n\n.
  const segs = [];
  let cur = '';
  for (let i = 0; i < pieces.length; i++) {
    const p = pieces[i];
    if (!cur) cur = p;
    else if (cur.length + 2 + p.length <= maxLen) cur += '\n\n' + p;
    else { segs.push(cur); cur = p; }
  }
  if (cur) segs.push(cur);
  return segs.length ? segs : [text];
}

// Low-level: stream ONE generateContent request. Calls onDelta(text) as
// chunks arrive; resolves { text, usage }. Throws on HTTP/abort/no-stream
// (e.notFound for 404, e.status for HTTP, e.noStream when unreadable,
// e.aborted when cancelled). Shared SSE core for the translation path.
async function streamOnce(model, key, body, onDelta, isAborted, setController) {
  const controller = new AbortController();
  if (typeof setController === 'function') setController(controller);
  const url = API_BASE + '/models/' + encodeURIComponent(model)
            + ':streamGenerateContent?alt=sse';
  // Connect watchdog — a wedged connect must fail (and let the caller fail
  // over to the next key) instead of hanging forever.
  const connectTimer = setTimeout(function () {
    try { controller.abort(); } catch (_) {}
  }, REQUEST_TIMEOUT_MS);
  let resp;
  try {
    resp = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally { clearTimeout(connectTimer); }
  if (resp.status === 404) { const e = new Error('Model not found: ' + model); e.notFound = true; throw e; }
  if (!resp.ok) {
    let detail = '';
    try { const j = await resp.json(); detail = (j.error && j.error.message) || ''; } catch (_) {}
    const e = new Error('HTTP ' + resp.status + (detail ? ' — ' + detail : '')); e.status = resp.status; throw e;
  }
  if (!resp.body || typeof resp.body.getReader !== 'function') {
    const e = new Error('NO_STREAM'); e.noStream = true; throw e;
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '', text = '', usage = null;
  while (true) {
    if (isAborted && isAborted()) { try { reader.cancel(); } catch (_) {} const e = new Error('ABORTED'); e.aborted = true; throw e; }
    const piece = await reader.read();
    if (piece.done) break;
    buf += decoder.decode(piece.value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) !== -1) {
      let line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      line = line.replace(/\r$/, '').trim();
      if (!line || line.charAt(0) === ':') continue;
      if (line.indexOf('data:') !== 0) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let j = null;
      try { j = JSON.parse(payload); } catch (_) { continue; }
      const d = extractDelta(j);
      if (d) { text += d; if (onDelta) onDelta(d); }
      if (j.usageMetadata) usage = j.usageMetadata;
    }
  }
  return { text: text, usage: usage };
}

// Stream ONE request across the ordered key list (same advance rules as
// callGeminiFailover). While NOTHING has been emitted the loop may move on to
// the next key; once deltas have reached the caller, a mid-stream death
// returns the partial text ({ partial: true }) instead — switching keys after
// output would duplicate text. Shared by chatStream/translateStream.
async function streamOnceFailover(model, body, onDelta, isAborted, setController, onReset) {
  const slots = orderedKeySlots();
  if (!slots.length) { const e = new Error('NO_KEY'); e.noKey = true; throw e; }
  let bestErr = null;
  let bestRank = -1;
  let attempts = 0;
  let paidOnlyCount = 0;
  for (let i = 0; i < slots.length; i++) {
    const isLast = (i === slots.length - 1);
    const s = slots[i];
    let attemptText = '';
    try {
      const r = await streamOnce(model, s.key, body, function (d) {
        attemptText += d;
        if (onDelta) onDelta(d);
      }, isAborted, setController);
      markSlotGood(s);
      return r;
    } catch (e) {
      if (e && e.aborted) throw e;
      if (isAborted && isAborted()) { const e2 = new Error('ABORTED'); e2.aborted = true; throw e2; }
      attempts++;
      if (attemptText && (isLast || !isFailoverError(e))) {
        // Nothing left to fail over to — keep the partial answer rather than
        // throwing the user's text away.
        console.warn('[ai] stream died mid-output (slot ' + s.slot + ') — keeping partial text');
        return { text: attemptText, usage: null, partial: true };
      }
      if (attemptText) {
        // Text was already on screen: discard it and restart cleanly on the
        // next key instead of splicing two half-answers together.
        console.warn('[ai] stream died mid-output (slot ' + s.slot + ') — restarting cleanly on the next key');
        if (onReset) { try { onReset(); } catch (_) {} }
      }
      if (isPaidOnlyModelError(e)) paidOnlyCount++;
      else if (isQuotaError(e)) markKeyBad(s.key, 'quota', e.retryDelayMs);
      else if (isKeyInvalidError(e)) markKeyBad(s.key, 'invalid');
      const rank = isServerBusyError(e) ? 3 : (isQuotaError(e) ? 2 : (isKeyInvalidError(e) ? 1 : 0));
      if (rank > bestRank) { bestRank = rank; bestErr = e; }
      if (!isFailoverError(e)) throw e;
      if (!isLast) {
        console.warn('[ai] stream key slot ' + s.slot + ' failed (' + scrubKeyFromMsg((e && e.message) || e) + ') — failing over');
        continue;
      }
    }
  }
  if (attempts > 0 && paidOnlyCount === attempts) {
    const e = bestErr || new Error('PAID_ONLY');
    e.paidOnlyAllKeys = true;
    throw e;
  }
  throw bestErr || new Error('سوراش مەغلۇپ بولدى');
}

// Streaming translation. opts: { translateFrom, translateTo, context }.
// Same callback contract as askStream so the reader UI (Stop/copy/share/
// regenerate) works unchanged. Chunks long input and streams each finished
// segment in order; falls back to the non-stream callGemini per segment.
function translateStream(opts, onChunk, onDone, onError, onReset) {
  opts = opts || {};
  onChunk = onChunk || function () {};
  onDone  = onDone  || function () {};
  onError = onError || function () {};
  onReset = onReset || function () {};
  const from = opts.translateFrom, to = opts.translateTo;
  const text = String(opts.context || '');

  let aborted = false;
  let controller = null;
  function abort() { aborted = true; if (controller) { try { controller.abort(); } catch (_) {} } }

  (async function run() {
    if (!getKeyList().length) { onError({ ok: false, noKey: true, error: 'Gemini API ئاچقۇچى تەڭشەلمىگەن. تەڭشەكلەرگە كىرىپ ئاچقۇچىڭىزنى قوشۇڭ.' }); return; }
    if (!isEnabled()) { onError({ ok: false, error: 'سۈنئىي ئىدراك ئىقتىدارى تەڭشەكلەردە ئېتىلگەن.' }); return; }
    if (!text.trim()) { onError({ ok: false, error: 'تەرجىمە قىلىدىغان تېكىست تېپىلمىدى.' }); return; }
    if (aborted) return;

    const segments = splitForTranslation(text, 6000);
    const M = segments.length;
    const model = getModel();
    let full = '', lastUsage = null, emittedAny = false;

    for (let i = 0; i < M; i++) {
      if (aborted) return;
      const partNote = (M > 1)
        ? ('\n\n(This is part ' + (i + 1) + ' of ' + M + ' of a longer text; keep terminology and style consistent.)')
        : '';
      const prompt = buildTranslationPrompt(from, to, segments[i]) + partNote;
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, topP: 0.9, thinkingConfig: thinkingConfigFor(false), maxOutputTokens: 12288 },
        safetySettings: SAFETY_SETTINGS
      };
      if (i > 0) { full += '\n\n'; onChunk('\n\n'); }   // paragraph break between segments
      const fullLenBeforeSegment = full.length;
      try {
        const r = await streamOnceFailover(model, body,
          function (d) { if (!aborted) { full += d; emittedAny = true; onChunk(d); } },
          function () { return aborted; },
          function (c) { controller = c; },
          // Restarting THIS segment on another key: rewind to the segments
          // already translated so the retry can't duplicate half a sentence.
          function () { full = full.slice(0, fullLenBeforeSegment); onReset(full); });
        lastUsage = r.usage || lastUsage;
        if (r.partial) break;   // mid-stream death — finalize with what we have
      } catch (e) {
        if (aborted) return;
        if (e && e.aborted) return;
        // Streaming failed for this segment → non-stream fallback.
        try {
          const json = await callGeminiFailover(model, body);
          if (aborted) return;
          const t = extractText(json);
          // Rewind any partial deltas from the failed stream attempt so the
          // FINAL text (which onDone re-renders) never contains them twice.
          if (t) { full = full.slice(0, fullLenBeforeSegment) + t; emittedAny = true; onChunk(t); }
        } catch (e2) {
          if (aborted) return;
          if (isSizeError(e) || isSizeError(e2)) { onError({ ok: false, tooLargeFallback: true, error: 'بۇ تېكىست بەك چوڭ بولۇپ، API نى بىراقلا قوبۇل قىلمىدى.' }); return; }
          if (isPaidOnly2(e, e2)) { onError({ ok: false, paidOnlyModel: true, model: model, error: paidOnlyMessage(model) }); return; }
          if (isKeyInvalidError(e) || isKeyInvalidError(e2)) { onError({ ok: false, keyInvalid: true, canSwitchKey: true, error: KEY_INVALID_MSG }); return; }
          if (isServerBusyError(e) || isServerBusyError(e2)) { onError({ ok: false, busy: true, canSwitchKey: true, error: SERVER_BUSY_MESSAGE }); return; }
          if (isQuotaError(e) || isQuotaError(e2)) { onError({ ok: false, quotaExhausted: true, allKeysExhausted: true, canSwitchKey: true, error: quotaAllMessage((e2 && e2.retryDelayMs) || (e && e.retryDelayMs)) }); return; }
          if (isNetworkError(e) || isNetworkError(e2)) { onError({ ok: false, offline: true, error: NETWORK_MSG }); return; }
          onError({ ok: false, error: 'تەرجىمە مەغلۇپ بولدى: ' + scrubKeyFromMsg((e2 && e2.message) || (e && e.message) || 'نامەلۇم خاتالىق') }); return;
        }
      }
    }

    if (aborted) return;
    if (!emittedAny || !full.trim()) { onError({ ok: false, error: 'تەرجىمە چىقمىدى. قايتا سىناڭ.' }); return; }
    bumpUsage();
    logTokenUsage(model, lastUsage, false);
    onDone(full, model, lastUsage, { slot: activeSlot });
  })();

  return { abort: abort };
}

// ----------------------------------------------------------------
// Free-form chat (Phase 4) — multi-turn Gemini chat, NOT tied to the library.
// `messages` is [{ role:'user'|'model', text }]; mapped to Gemini `contents`
// with CHAT_SYSTEM as the systemInstruction. Same SSE core (streamOnce),
// timeout, STRICT model selection, and quota/unavailable error mapping as the
// rest of the file. Callback contract matches askStream.
// ----------------------------------------------------------------
function chatStream(messages, onChunk, onDone, onError, onReset) {
  onChunk = onChunk || function () {};
  onDone  = onDone  || function () {};
  onError = onError || function () {};
  onReset = onReset || function () {};

  let aborted = false;
  let controller = null;
  function abort() { aborted = true; if (controller) { try { controller.abort(); } catch (_) {} } }

  (async function run() {
    if (!getKeyList().length) { onError({ ok: false, noKey: true, error: 'Gemini API ئاچقۇچى تەڭشەلمىگەن. تەڭشەكلەرگە كىرىپ ئاچقۇچىڭىزنى قوشۇڭ.' }); return; }
    if (!isEnabled()) { onError({ ok: false, error: 'سۈنئىي ئىدراك ئىقتىدارى تەڭشەكلەردە ئېتىلگەن.' }); return; }

    // Cap history to the last 20 turns; clamp each turn's length.
    const msgs = Array.isArray(messages) ? messages.slice(-20) : [];
    const contents = msgs
      .filter(function (m) { return m && m.text; })
      .map(function (m) { return { role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text).slice(0, 8000) }] }; });
    if (!contents.length) { onError({ ok: false, error: 'سوئال يوق.' }); return; }
    if (aborted) return;

    const model = getModel();
    const body = {
      systemInstruction: { parts: [{ text: CHAT_SYSTEM }] },
      contents: contents,
      generationConfig: { temperature: 0.7, topP: 0.9, thinkingConfig: thinkingConfigFor(false), maxOutputTokens: 4096 },
      safetySettings: SAFETY_SETTINGS
    };

    try {
      const r = await streamOnceFailover(model, body,
        function (d) { if (!aborted) onChunk(d); },
        function () { return aborted; },
        function (c) { controller = c; },
        function () { onReset(''); });   // restarting on another key — clear the bubble
      if (aborted) return;
      if (!r.text || !r.text.trim()) { onError({ ok: false, error: 'جاۋاب چىقمىدى. قايتا سىناڭ.' }); return; }
      bumpUsage();
      logTokenUsage(model, r.usage, false);
      onDone(r.text, model, r.usage, { slot: activeSlot });
    } catch (e) {
      if (aborted || (e && e.aborted)) return;
      // Streaming failed → one non-stream retry on the SAME model (STRICT).
      try {
        const json = await callGeminiFailover(model, body);
        if (aborted) return;
        const t = extractText(json);
        if (t) { bumpUsage(); onChunk(t); onDone(t, model, json.usageMetadata || null, { slot: activeSlot }); return; }
        onError({ ok: false, error: 'جاۋاب چىقمىدى. قايتا سىناڭ.' });
      } catch (e2) {
        if (aborted) return;
        if (isPaidOnly2(e, e2)) { onError({ ok: false, paidOnlyModel: true, model: model, error: paidOnlyMessage(model) }); return; }
        if (isKeyInvalidError(e) || isKeyInvalidError(e2)) { onError({ ok: false, keyInvalid: true, canSwitchKey: true, error: KEY_INVALID_MSG }); return; }
        if (isModelUnavailableError(e) || isModelUnavailableError(e2)) { onError({ ok: false, error: modelUnavailableMessage(model) }); return; }
        if (isServerBusyError(e) || isServerBusyError(e2)) { onError({ ok: false, busy: true, canSwitchKey: true, error: SERVER_BUSY_MESSAGE }); return; }
        if (isQuotaError(e) || isQuotaError(e2)) { onError({ ok: false, quotaExhausted: true, allKeysExhausted: true, canSwitchKey: true, error: quotaAllMessage((e2 && e2.retryDelayMs) || (e && e.retryDelayMs)) }); return; }
        if (isNetworkError(e) || isNetworkError(e2)) { onError({ ok: false, offline: true, error: NETWORK_MSG }); return; }
        onError({ ok: false, error: 'سوراش مەغلۇپ بولدى: ' + scrubKeyFromMsg((e2 && e2.message) || (e && e.message) || 'نامەلۇم خاتالىق') });
      }
    }
  })();

  return { abort: abort };
}

// ----------------------------------------------------------------
// Gemini OCR (Phase 7B) — multimodal transcription of scanned page images.
// The user's selected model is multimodal; STRICT model selection still
// applies. Pages are sent in small batches (≈2–4 images per request) and the
// transcriptions are concatenated. Free-tier / size / quota failures are
// classified as `freeTierLimit` so the renderer can fall back to offline UKIJ
// OCR instead. Returns { ok:true, text } or { ok:false, error, freeTierLimit?,
// pages? } (pages = whatever was transcribed before the failure).
// ----------------------------------------------------------------
// Strong Uyghur-specific OCR prompt. Vision models tend to "normalize" Uyghur
// (kona yëziq) toward Arabic/Persian — these rules forbid that explicitly.
// Vision quality is best on the Pro model (the user's STRICT choice still wins).
const OCR_IMAGE_INSTRUCTION = [
  'These page images contain UYGHUR text written in the Uyghur Arabic alphabet (kona yëziq).',
  'Transcribe the text EXACTLY as printed, in correct modern Uyghur orthography.',
  'CRITICAL RULES:',
  '- Do NOT normalize, "correct", or convert anything toward Arabic or Persian spelling.',
  '- Preserve the Uyghur letters exactly: ئـ ھ ڭ گ ق ك خ غ ژ چ پ and the vowels ا ە و ۇ ۆ ۈ ې ى ي.',
  '- NEVER replace ڭ with ك, NEVER replace ۋە with ژ, NEVER replace ە with ه.',
  '- Do NOT insert spaces inside a word; keep each word as one token.',
  '- Output plain Unicode Uyghur text only. Preserve paragraph breaks. No transliteration, no commentary, no translation.'
].join('\n');

async function ocrImages(imagesBase64, opts) {
  opts = opts || {};
  if (!getKeyList().length) return { ok: false, error: 'Gemini API ئاچقۇچى تەڭشەلمىگەن.' };
  if (!isEnabled()) return { ok: false, error: 'سۈنئىي ئىدراك ئىقتىدارى ئېتىلگەن.' };
  const images = Array.isArray(imagesBase64) ? imagesBase64 : [];
  if (!images.length) return { ok: false, error: 'رەسىم تېپىلمىدى' };

  const model = getModel();   // STRICT — multimodal, never substituted
  // ~2 images/request keeps payloads within the free tier while sending higher-
  // resolution pages (the renderer also caps Gemini batches at 2).
  const batch = Math.min(Math.max(parseInt(opts.batchSize, 10) || 2, 1), 4);
  const FREE_TIER_MSG = 'ھەقسىز API بۇ كىتابنى ئايلاندۇرالمىدى. UKIJ OCR (تورسىز) نى تاللاڭ ياكى سەل تۇرۇپ قايتا سىناڭ';
  const out = [];

  for (let i = 0; i < images.length; i += batch) {
    const slice = images.slice(i, i + batch);
    const parts = [{ text: OCR_IMAGE_INSTRUCTION }];
    for (const img of slice) {
      const data = String(img || '').replace(/^data:image\/[a-zA-Z]+;base64,/, '');
      parts.push({ inlineData: { mimeType: 'image/png', data: data } });
    }
    const body = {
      contents: [{ role: 'user', parts: parts }],
      generationConfig: { temperature: 0.1, topP: 0.9, thinkingConfig: thinkingConfigFor(false), maxOutputTokens: 12288 },
      safetySettings: SAFETY_SETTINGS
    };
    try {
      const json = await callGeminiFailover(model, body);
      const text = extractText(json);
      if (text) out.push(text);
      bumpUsage();
      logTokenUsage(model, json.usageMetadata, false);
      if (typeof opts.onProgress === 'function') {
        try { opts.onProgress(Math.min(i + batch, images.length), images.length); } catch (_) {}
      }
    } catch (e) {
      // Paid-only model first — it arrives as a 429 and would otherwise be
      // mistaken for an ordinary free-tier limit.
      if (e && (e.paidOnlyAllKeys || isPaidOnlyModelError(e))) {
        return { ok: false, paidOnlyModel: true, model: model, error: paidOnlyMessage(model), pages: out };
      }
      // Unavailable model → strict message. Size/quota → free-tier fallback.
      if (isModelUnavailableError(e)) return { ok: false, error: modelUnavailableMessage(model), pages: out };
      if (isSizeError(e) || isQuotaError(e)) return { ok: false, freeTierLimit: true, error: FREE_TIER_MSG, pages: out };
      if (isServerBusyError(e)) return { ok: false, busy: true, canSwitchKey: true, error: SERVER_BUSY_MESSAGE, pages: out };
      if (isNetworkError(e)) return { ok: false, offline: true, error: NETWORK_MSG, pages: out };
      return { ok: false, error: scrubKeyFromMsg((e && e.message) || 'Gemini OCR مەغلۇپ بولدى'), pages: out };
    }
  }
  return { ok: true, text: out.join('\n\n') };
}

// ----------------------------------------------------------------
// Public surface (consumed by main.js IPC handlers; the renderer-side
// detectType/typeLabel/MAX_CONTEXT_CHARS helpers arrive in src/ai-client.js)
// ----------------------------------------------------------------

module.exports = {
  hasApiKey: hasApiKey,
  getApiKey: getApiKey,             // main-process internal — never wire to IPC
  getApiKeyMasked: getApiKeyMasked,
  setApiKey: setApiKey,
  getBackupKeysMasked: getBackupKeysMasked,
  setBackupKeys: setBackupKeys,
  testKeySlot: testKeySlot,
  testAllKeySlots: testAllKeySlots,
  getKeyStatus: getKeyStatus,
  getModel: getModel,
  setModel: setModel,
  resolveModelForSettings: resolveModelForSettings,
  ackModelMigration: ackModelMigration,
  isEnabled: isEnabled,
  setEnabled: setEnabled,
  getTodayUsage: getTodayUsage,
  ask: ask,
  askStream: askStream,
  translateStream: translateStream,
  chatStream: chatStream,
  ocrImages: ocrImages,
  test: test,
  DEFAULT_MODEL: DEFAULT_MODEL,
  MODEL_FALLBACKS: MODEL_FALLBACKS,
  SELECTABLE_MODELS: SELECTABLE_MODELS,
  PAID_ONLY_MODELS: PAID_ONLY_MODELS,
  MAX_CONTEXT_CHARS: MAX_CONTEXT_CHARS,
  URL_PRICING: URL_PRICING,
  URL_BILLING: URL_BILLING,
  URL_TERMS: URL_TERMS
};
