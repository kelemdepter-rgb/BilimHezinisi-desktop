// scripts/probe-gemini-models.js — asks every Gemini model ID the app offers
// (or used to offer) one tiny question and prints WHICH model answered, as
// Google reports it in the response's `modelVersion`.
//
// Why: an ID Google has retired may be silently routed to another model
// (Google's deprecations page, 2026-10-29: gemini-3.7-flash "automatically
// routes API requests to gemini-3.8-flash"). The app must never show one
// model while another answers, so the rule that checks `modelVersion` is
// written from what this probe prints, not from a guess.
//
// Each model is asked twice: once with generateContent (the app's
// non-streaming path) and once with streamGenerateContent?alt=sse (chat,
// translate, ask). For the stream it also reports whether the FIRST chunk
// carries `modelVersion` — the app checks it before showing any text.
//
// The key is read ONLY from the environment variable GEMINI_PROBE_KEY. It is
// sent in the x-goog-api-key header (never in the URL) and no part of it is
// ever printed. Use a key WITHOUT billing: the verdict FREE-OK means "answers
// on a free key".
//
// Run (PowerShell, from the repo folder):
//   $env:GEMINI_PROBE_KEY = "<key>"
//   npx electron scripts/probe-gemini-models.js
//   Remove-Item Env:GEMINI_PROBE_KEY
// Inside Electron the requests go through electron.net.fetch (Windows
// certificate store + system proxy), so an antivirus that inspects HTTPS
// does not break them. `node scripts/probe-gemini-models.js` also works on a
// machine without such an antivirus (Node 18+, global fetch).

'use strict';

const MODELS = [
  'gemini-3.8-flash',
  'gemini-3.6-flash',
  'gemini-3.1-pro-preview',
  'gemini-3.7-flash',
  'gemini-3.5-flash-lite'
];
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const TIMEOUT_MS = 60000;
const PAUSE_MS = 1500;   // stay well under the free tier's requests-per-minute

const KEY = String(process.env.GEMINI_PROBE_KEY || '').trim();

let httpFetch = null;
let transport = '';

// The same body shape ai.js buildBody() sends: thinkingLevel, never
// thinkingBudget 0 (gemini-3.5-flash-lite and gemini-3.1-pro-preview reject
// a zero budget with HTTP 400). Thinking tokens count against
// maxOutputTokens, so the budget leaves room for a short "low" think.
function probeBody() {
  return {
    contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: OK' }] }],
    generationConfig: {
      temperature: 0,
      thinkingConfig: { thinkingLevel: 'low' },
      maxOutputTokens: 1024
    }
  };
}

// Anything that looks like a key never reaches the screen.
function scrub(s) {
  let out = String(s == null ? '' : s);
  if (KEY) out = out.split(KEY).join('[key]');
  return out
    .replace(/AIza[0-9A-Za-z_\-]{10,}/g, '[key]')
    .replace(/AQ\.[0-9A-Za-z_.\-]{10,}/g, '[key]')
    .replace(/([?&]key=)[^&\s]+/gi, '$1[key]')
    .replace(/\s+/g, ' ')
    .trim();
}

function excerpt(s) {
  const t = scrub(s);
  return t ? t.slice(0, 80) : '—';
}

function verdict(status, message) {
  if (status === 200) return 'FREE-OK';
  if (status === 429 && (/limit:\s*0\b/.test(message) || /free[_ ]?(quota[_ ]?)?tier/i.test(message))) {
    return 'PAID-ONLY (429 limit 0)';
  }
  return 'OTHER-ERROR';
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// The watchdog covers the whole exchange, body included: the caller calls
// done() once it has read the response.
async function post(url) {
  const controller = new AbortController();
  const t = setTimeout(function () { try { controller.abort(); } catch (_) {} }, TIMEOUT_MS);
  const done = function () { clearTimeout(t); };
  try {
    const resp = await httpFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify(probeBody()),
      signal: controller.signal
    });
    return { resp: resp, done: done };
  } catch (e) {
    done();
    throw e;
  }
}

async function errorMessage(resp) {
  try {
    const j = await resp.json();
    return (j && j.error && j.error.message) || '';
  } catch (_) {
    return '';
  }
}

function networkFailure(model, e) {
  const msg = (e && (e.message || (e.cause && e.cause.message))) || String(e);
  const cause = e && e.cause && (e.cause.code || e.cause.message);
  return { model: model, status: '—', version: '—', error: excerpt(cause ? msg + ' (' + cause + ')' : msg), verdict: 'OTHER-ERROR', cert: /CERT|SIGNATURE|self.signed|UNABLE_TO_VERIFY/i.test(String(msg) + ' ' + String(cause)) };
}

async function probeOnce(model) {
  const url = API_BASE + '/models/' + encodeURIComponent(model) + ':generateContent';
  let p;
  try { p = await post(url); } catch (e) { return networkFailure(model, e); }
  const resp = p.resp;
  try {
    if (resp.status !== 200) {
      const m = await errorMessage(resp);
      return { model: model, status: resp.status, version: '—', error: excerpt(m), verdict: verdict(resp.status, m) };
    }
    let json = null;
    try { json = await resp.json(); } catch (_) {}
    const version = (json && json.modelVersion) || '—';
    return { model: model, status: 200, version: version, error: '—', verdict: 'FREE-OK' };
  } finally {
    p.done();
  }
}

// Reads the SSE stream to its end. Reports the first chunk's modelVersion,
// whether any text arrived BEFORE a chunk carried modelVersion, and whether
// every chunk named the same model.
async function probeStream(model) {
  const url = API_BASE + '/models/' + encodeURIComponent(model) + ':streamGenerateContent?alt=sse';
  let p;
  try { p = await post(url); } catch (e) { return networkFailure(model, e); }
  try {
    return await readStream(model, p.resp);
  } catch (e) {
    return networkFailure(model, e);
  } finally {
    p.done();
  }
}

async function readStream(model, resp) {
  if (resp.status !== 200) {
    const m = await errorMessage(resp);
    return { model: model, status: resp.status, version: '—', error: excerpt(m), verdict: verdict(resp.status, m), stream: null };
  }
  const st = { chunks: 0, firstVersion: null, firstChunkHasVersion: false, textBeforeVersion: false, versions: [] };
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';
  function onEvent(data) {
    let j;
    try { j = JSON.parse(data); } catch (_) { return; }
    st.chunks++;
    const v = j && j.modelVersion;
    if (v && st.versions.indexOf(v) === -1) st.versions.push(v);
    if (st.chunks === 1) st.firstChunkHasVersion = !!v;
    const parts = (j && j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const hasText = parts.some(function (p) { return p && p.text; });
    if (!st.firstVersion && v) st.firstVersion = v;
    if (hasText && !st.firstVersion) st.textBeforeVersion = true;
  }
  for (;;) {
    const r = await reader.read();
    if (r.done) break;
    buf += decoder.decode(r.value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      if (line.indexOf('data:') === 0) onEvent(line.slice(5).trim());
    }
  }
  if (buf.indexOf('data:') === 0) onEvent(buf.slice(5).trim());
  return { model: model, status: 200, version: st.firstVersion || '—', error: '—', verdict: 'FREE-OK', stream: st };
}

function line(r) {
  return [r.model, r.status, r.version, r.error, r.verdict].join(' · ');
}

function streamLine(r) {
  if (!r.stream) return line(r);
  const s = r.stream;
  return line(r) + ' · chunks ' + s.chunks
    + ' · first chunk has modelVersion: ' + (s.firstChunkHasVersion ? 'yes' : 'no')
    + ' · text before modelVersion: ' + (s.textBeforeVersion ? 'yes' : 'no')
    + ' · all chunks: ' + (s.versions.length ? s.versions.join(' + ') : '—');
}

async function main() {
  if (!KEY) {
    console.log('GEMINI_PROBE_KEY مۇھىت ئۆزگەرگۈچىسى تېپىلمىدى. ئاۋۋال ئاچقۇچنى شۇنىڭغا قويۇڭ:');
    console.log('  $env:GEMINI_PROBE_KEY = "<ئاچقۇچىڭىز>"');
    console.log('  npx electron scripts/probe-gemini-models.js');
    console.log('  Remove-Item Env:GEMINI_PROBE_KEY');
    process.exitCode = 1;
    return;
  }
  console.log('Gemini model probe · ' + new Date().toISOString() + ' · transport: ' + transport);
  console.log('requested · HTTP · modelVersion · error · verdict');
  let cert = false;
  console.log('--- generateContent');
  for (let i = 0; i < MODELS.length; i++) {
    if (i) await sleep(PAUSE_MS);
    const r = await probeOnce(MODELS[i]);
    if (r.cert) cert = true;
    console.log(line(r));
  }
  console.log('--- streamGenerateContent (SSE)');
  for (let i = 0; i < MODELS.length; i++) {
    await sleep(PAUSE_MS);
    const r = await probeStream(MODELS[i]);
    if (r.cert) cert = true;
    console.log(streamLine(r));
  }
  if (cert && transport === 'node fetch') {
    console.log('');
    console.log('گۇۋاھنامە خاتالىقى: بۇ كومپيۇتېردىكى ۋىرۇسقا قارشى پروگرامما HTTPS نى تەكشۈرىدۇ. Node نىڭ ئورنىغا Electron بىلەن ئىجرا قىلىڭ:');
    console.log('  npx electron scripts/probe-gemini-models.js');
  }
}

function fail(e) {
  console.log('probe failed: ' + scrub((e && e.message) || e));
  process.exitCode = 1;
}

const inElectron = !!(process.versions && process.versions.electron) && !process.env.ELECTRON_RUN_AS_NODE;
if (inElectron) {
  const electron = require('electron');
  electron.app.whenReady()
    .then(function () {
      httpFetch = function (u, o) { return electron.net.fetch(u, o); };
      transport = 'electron.net.fetch';
      return main();
    })
    .catch(fail)
    .then(function () { electron.app.exit(process.exitCode || 0); });
} else {
  if (typeof fetch !== 'function') {
    console.log('Node 18 ياكى ئۇنىڭدىن يېڭى نەشرى كېرەك (global fetch).');
    process.exitCode = 1;
  } else {
    httpFetch = function (u, o) { return fetch(u, o); };
    transport = 'node fetch';
    main().catch(fail);
  }
}
