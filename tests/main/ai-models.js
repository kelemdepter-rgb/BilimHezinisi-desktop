// ============================================================================
// 3.6 AI models — the line-up, the one-time move off a retired model, and the
// rule that the model which answers is the model that was chosen.
//
// scripts/probe-gemini-models.js (2026-10-29) showed every listed model
// reporting its own ID as `modelVersion`, and gemini-3.7-flash answering as
// gemini-3.8-flash. An answer whose modelVersion is not the requested ID is
// refused on every path: no text of it is used, nothing is retried, no other
// model is tried. Nothing here touches the network — ai.js is handed a fake
// transport — and the keys are made-up test values.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const LINE_UP = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.1-pro-preview'];
const RETIRED = ['gemini-3.7-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
const KEY_1 = 'AIzaTEST-primary-0000000000000000000';
const KEY_2 = 'AIzaTEST-backup-11111111111111111111';

function mismatchText(requested, actual) {
  return 'Google بۇ سوئالغا تاللانغان مودېل (' + requested + ') ئەمەس، باشقا مودېل ('
       + (actual || 'نامەلۇم') + ') بىلەن جاۋاب قايتۇردى. شۇڭا جاۋاب قوبۇل قىلىنمىدى. تەڭشەكلەردىن باشقا مودېل تاللاڭ.';
}

/** src/ai-client.js as the renderer composes it (no bridge, no DOM). */
function clientAI(root) {
  const src = fs.readFileSync(path.join(root, 'src', 'ai-client.js'), 'utf8');
  const win = { AIBridge: {} };
  vm.runInNewContext(src, { window: win, console: console });
  return win.AI;
}

/** A generateContent answer. `version` undefined → no modelVersion field. */
function answer(text, version) {
  const j = {
    candidates: [{ content: { role: 'model', parts: [{ text: text }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1, totalTokenCount: 6 }
  };
  if (version !== undefined) j.modelVersion = version;
  return j;
}

function reply(status, json) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: async function () { return json; },
    body: null
  };
}

/** An SSE response whose chunks are the given objects, one frame per read. */
function sse(chunks) {
  const enc = new TextEncoder();
  const frames = chunks.map(function (c) { return enc.encode('data: ' + JSON.stringify(c) + '\r\n\r\n'); });
  let i = 0;
  return {
    ok: true,
    status: 200,
    json: async function () { return {}; },
    body: {
      getReader: function () {
        return {
          read: async function () {
            return i < frames.length ? { done: false, value: frames[i++] } : { done: true, value: undefined };
          },
          cancel: function () { i = frames.length; }
        };
      }
    }
  };
}

/** A stream chunk carrying `text`, with or without a modelVersion. */
function chunk(text, version) {
  const j = { candidates: [{ content: { role: 'model', parts: [{ text: text }] } }] };
  if (version !== undefined) j.modelVersion = version;
  return j;
}

/**
 * Hands ai.js a fake transport. `handler({ model, method, key })` returns
 * the response; every request is logged.
 */
function fakeGoogle(ai, handler) {
  const log = [];
  ai._setHttpFetchForTests(async function (url, init) {
    const m = /\/models\/([^:]+):(\w+)/.exec(url);
    const req = {
      model: decodeURIComponent(m[1]),
      method: m[2],
      key: (init && init.headers && init.headers['x-goog-api-key']) || ''
    };
    log.push(req);
    return handler(req);
  });
  return log;
}

/** Runs one streaming call to its end: { chunks, done, error, resets }. */
function runStream(start) {
  return new Promise(function (resolve) {
    const out = { chunks: [], done: null, error: null, resets: [] };
    const timer = setTimeout(function () { out.error = { timeout: true }; resolve(out); }, 5000);
    start(
      function (d) { out.chunks.push(d); },
      function (full, model) { out.done = { full: full, model: model }; clearTimeout(timer); resolve(out); },
      function (res) { out.error = res; clearTimeout(timer); resolve(out); },
      function (t) { out.resets.push(t); }
    );
  });
}

module.exports = function (suite, assert, ctx) {
  const database = require(path.join(ctx.root, 'database.js'));
  const ai = require(path.join(ctx.root, 'ai.js'));
  let dbCount = 0;

  // ai.js logs every request and every mismatch; the runner prints one line
  // per test, so the logs are held back while a test runs.
  const realLog = console.log;
  const realWarn = console.warn;

  /** A fresh library in the temp dir, one key (or two), the given model. */
  async function fresh(model, keys) {
    console.log = function () {};
    console.warn = function () {};
    database.close();
    const dir = path.join(ctx.tmpDir, 'ai-models-' + (++dbCount));
    fs.mkdirSync(dir, { recursive: true });
    await database.initDB(dir);
    const k = keys || [KEY_1];
    ai.setApiKey(k[0]);
    ai.setBackupKeys([k[1] || '', k[2] || '', k[3] || '']);
    if (model) ai.setModel(model);
  }

  function done() {
    ai._setHttpFetchForTests(null);
    database.close();
    console.log = realLog;
    console.warn = realWarn;
  }

  suite.test('ai-models-line-up', async function () {
    const client = clientAI(ctx.root);
    assert.deepEqual(ai.SELECTABLE_MODELS, LINE_UP, 'ai.js line-up');
    assert.deepEqual(Array.from(client.SELECTABLE_MODELS), LINE_UP, 'src/ai-client.js line-up');
    assert.equal(ai.DEFAULT_MODEL, LINE_UP[0], 'ai.js default is not first');
    assert.equal(client.DEFAULT_MODEL, LINE_UP[0], 'ai-client.js default is not first');
    assert.deepEqual(ai.MODEL_FALLBACKS, LINE_UP);
    assert.deepEqual(Array.from(client.MODEL_FALLBACKS), LINE_UP);
    assert.deepEqual(Array.from(client.PAID_ONLY_MODELS), ai.PAID_ONLY_MODELS, 'paid-only lists differ');
    assert.ok(ai.PAID_ONLY_MODELS.indexOf('gemini-3.1-pro-preview') !== -1, 'pro-preview is not paid-only');

    assert.deepEqual(Object.keys(client.MODEL_INFO), LINE_UP, 'MODEL_INFO is not exactly the line-up');
    LINE_UP.forEach(function (m) { assert.ok(String(client.MODEL_INFO[m] || '').trim(), 'no MODEL_INFO for ' + m); });
    assert.includes(client.MODEL_INFO['gemini-3.8-flash'], 'تەۋسىيە');
    assert.includes(client.MODEL_INFO['gemini-3.8-flash'], '(ھەقسىز)');
    assert.includes(client.MODEL_INFO['gemini-3.6-flash'], '(ھەقسىز)');
    assert.includes(client.MODEL_INFO['gemini-3.1-pro-preview'], 'پۇللۇق');

    RETIRED.forEach(function (m) {
      assert.ok(ai.SELECTABLE_MODELS.indexOf(m) === -1, m + ' is selectable in ai.js');
      assert.ok(Array.from(client.SELECTABLE_MODELS).indexOf(m) === -1, m + ' is selectable in ai-client.js');
      assert.equal(ai.RETIRED_MODELS[m], 'gemini-3.8-flash', m + ' does not move straight to the default');
    });
    assert.deepEqual(Object.keys(ai.RETIRED_MODELS).sort(), RETIRED.slice().sort());
  });

  suite.test('ai-models-retired-moved-once', async function () {
    try {
      for (const old of RETIRED) {
        await fresh(old);
        const first = ai.resolveModelForSettings();
        assert.equal(first.model, 'gemini-3.8-flash', old + ' was not moved');
        assert.equal(first.migratedFrom, old, 'the notice does not name ' + old);
        assert.equal(ai.getModel(), 'gemini-3.8-flash', 'the move was not saved');
        // The dialog closed before showing it: the notice is still owed.
        assert.equal(ai.resolveModelForSettings().migratedFrom, old, 'an unshown notice was lost');
        ai.ackModelMigration();
        const again = ai.resolveModelForSettings();
        assert.equal(again.model, 'gemini-3.8-flash');
        assert.equal(again.migratedFrom, null, 'the notice came back after it was shown');
      }
      // A model on the list is never moved.
      for (const m of LINE_UP) {
        await fresh(m);
        const r = ai.resolveModelForSettings();
        assert.equal(r.model, m);
        assert.equal(r.migratedFrom, null);
      }
    } finally { done(); }
  });

  suite.test('ai-models-unknown-kept', async function () {
    try {
      await fresh('gemini-9.9-experimental');
      const r = ai.resolveModelForSettings();
      assert.equal(r.model, 'gemini-9.9-experimental', 'an unknown model was replaced');
      assert.equal(r.migratedFrom, null);
      assert.equal(ai.getModel(), 'gemini-9.9-experimental');
    } finally { done(); }
  });

  suite.test('ai-models-answered-by-rule', async function () {
    const f = ai.answeredByRequestedModel;
    assert.equal(f('gemini-3.8-flash', { modelVersion: 'gemini-3.8-flash' }), true, 'exact match');
    assert.equal(f('gemini-3.6-flash', { modelVersion: 'gemini-3.6-flash' }), true);
    assert.equal(f('gemini-3.1-pro-preview', { modelVersion: 'gemini-3.1-pro-preview' }), true);
    // The probe's own finding: the retired ID answered by another model.
    assert.equal(f('gemini-3.7-flash', { modelVersion: 'gemini-3.8-flash' }), false, 'alias accepted');
    assert.equal(f('gemini-3.8-flash', { modelVersion: 'gemini-3.8-flash-lite' }), false, 'another family accepted');
    // No suffix was seen in the probe, so none is accepted.
    assert.equal(f('gemini-3.8-flash', { modelVersion: 'gemini-3.8-flash-001' }), false, 'an unseen suffix accepted');
    assert.equal(f('gemini-3.8-flash', { modelVersion: 'models/gemini-3.8-flash' }), false);
    assert.equal(f('gemini-3.8-flash', {}), false, 'missing modelVersion accepted');
    assert.equal(f('gemini-3.8-flash', { modelVersion: '' }), false);
    assert.equal(f('gemini-3.8-flash', null), false);
  });

  suite.test('ai-models-ask-checks-the-model', async function () {
    try {
      await fresh('gemini-3.6-flash', [KEY_1, KEY_2]);
      const usage = ai.getTodayUsage();

      let log = fakeGoogle(ai, function () { return reply(200, answer('OK', 'gemini-3.8-flash')); });
      let r = await ai.ask({ type: 'general', context: 'متن', question: 'سوئال' });
      assert.equal(r.ok, false, 'another model\'s answer was accepted');
      assert.equal(r.modelMismatch, true);
      assert.equal(r.error, mismatchText('gemini-3.6-flash', 'gemini-3.8-flash'));
      assert.equal(r.text, undefined, 'the answer text was passed on');
      assert.equal(log.length, 1, 'retried or failed over (' + log.length + ' requests)');
      assert.equal(ai.getTodayUsage(), usage, 'counted as a success');

      log = fakeGoogle(ai, function () { return reply(200, answer('OK')); });
      r = await ai.ask({ type: 'general', context: 'متن', question: 'سوئال' });
      assert.equal(r.ok, false, 'an answer without modelVersion was accepted');
      assert.equal(r.error, mismatchText('gemini-3.6-flash', null));
      assert.equal(log.length, 1);

      log = fakeGoogle(ai, function () { return reply(200, answer('OK', 'gemini-3.6-flash')); });
      r = await ai.ask({ type: 'general', context: 'متن', question: 'سوئال' });
      assert.equal(r.ok, true, 'the right model was refused: ' + r.error);
      assert.equal(r.text, 'OK');
      assert.equal(r.model, 'gemini-3.6-flash');
      assert.equal(log[0].model, 'gemini-3.6-flash');
    } finally { done(); }
  });

  suite.test('ai-models-streams-check-the-model', async function () {
    try {
      await fresh('gemini-3.6-flash', [KEY_1, KEY_2]);

      // askStream, chatStream and translateStream: the first chunk names
      // another model → nothing reaches the UI, no ask() fallback, no key
      // failover.
      const starts = {
        askStream: function (c, d, e, r) { ai.askStream({ type: 'general', context: 'متن', question: 'سوئال' }, c, d, e, r); },
        chatStream: function (c, d, e, r) { ai.chatStream([{ role: 'user', text: 'سالام' }], c, d, e, r); },
        translateStream: function (c, d, e, r) { ai.translateStream({ translateFrom: 'ar', translateTo: 'uy', context: 'نص' }, c, d, e, r); }
      };
      for (const name of Object.keys(starts)) {
        const log = fakeGoogle(ai, function () { return sse([chunk('جاۋاب', 'gemini-3.8-flash'), chunk(' داۋامى', 'gemini-3.8-flash')]); });
        const out = await runStream(starts[name]);
        assert.deepEqual(out.chunks, [], name + ': text of another model reached the UI');
        assert.equal(out.done, null, name + ': finished as a success');
        assert.ok(out.error && out.error.modelMismatch, name + ': no mismatch error — ' + JSON.stringify(out.error));
        assert.equal(out.error.error, mismatchText('gemini-3.6-flash', 'gemini-3.8-flash'), name);
        assert.equal(log.length, 1, name + ': re-asked (' + log.length + ' requests)');
      }

      // Text before any chunk named the model.
      let log = fakeGoogle(ai, function () { return sse([chunk('جاۋاب'), chunk(' داۋامى', 'gemini-3.6-flash')]); });
      let out = await runStream(starts.askStream);
      assert.deepEqual(out.chunks, [], 'text without a modelVersion reached the UI');
      assert.equal(out.error && out.error.error, mismatchText('gemini-3.6-flash', null));
      assert.equal(log.length, 1);

      // The model changes after text was shown: the screen is cleared.
      log = fakeGoogle(ai, function () { return sse([chunk('جاۋاب', 'gemini-3.6-flash'), chunk(' داۋامى', 'gemini-3.8-flash')]); });
      out = await runStream(starts.askStream);
      assert.deepEqual(out.chunks, ['جاۋاب']);
      assert.deepEqual(out.resets, [''], 'the shown text was not cleared');
      assert.equal(out.done, null);
      assert.ok(out.error && out.error.modelMismatch);
      out = await runStream(starts.chatStream);
      assert.deepEqual(out.resets, [''], 'chat: the shown text was not cleared');
      assert.ok(out.error && out.error.modelMismatch);

      // The right model streams as before, and the status line gets it.
      fakeGoogle(ai, function () { return sse([chunk('جاۋاب', 'gemini-3.6-flash'), chunk(' داۋامى', 'gemini-3.6-flash')]); });
      for (const name of Object.keys(starts)) {
        out = await runStream(starts[name]);
        assert.equal(out.error, null, name + ': ' + JSON.stringify(out.error));
        assert.equal(out.done && out.done.full, 'جاۋاب داۋامى', name);
        assert.equal(out.done.model, 'gemini-3.6-flash', name);
      }
    } finally { done(); }
  });

  suite.test('ai-models-test-and-ocr-check-the-model', async function () {
    try {
      await fresh('gemini-3.8-flash', [KEY_1, KEY_2]);
      let log = fakeGoogle(ai, function () { return reply(200, answer('سالام', 'gemini-3.6-flash')); });
      const t = await ai.test();
      assert.equal(t.ok, false, 'test connection passed on another model\'s answer');
      assert.equal(t.status, 'model_mismatch');
      assert.equal(t.message, mismatchText('gemini-3.8-flash', 'gemini-3.6-flash'));
      assert.equal(log.length, 1);

      log = fakeGoogle(ai, function () { return reply(200, answer('سالام', 'gemini-3.6-flash')); });
      const all = await ai.testAllKeySlots();
      assert.equal(all.ok, false, 'test all keys passed on another model\'s answer');
      assert.deepEqual(all.results.slice(0, 2).map(function (r) { return r.status; }), ['model_mismatch', 'model_mismatch']);

      log = fakeGoogle(ai, function () { return reply(200, answer('بەت', 'gemini-3.6-flash')); });
      const o = await ai.ocrImages(['data:image/png;base64,AAAA']);
      assert.equal(o.ok, false, 'OCR used another model\'s text');
      assert.equal(o.modelMismatch, true);
      assert.deepEqual(o.pages, []);
      assert.equal(log.length, 1);

      fakeGoogle(ai, function () { return reply(200, answer('سالام', 'gemini-3.8-flash')); });
      const ok = await ai.test();
      assert.equal(ok.ok, true, ok.message);
      assert.equal(ok.model, 'gemini-3.8-flash');
    } finally { done(); }
  });

  // Regression guard: key failover changes the key, never the model.
  suite.test('ai-models-failover-keeps-the-model', async function () {
    try {
      await fresh('gemini-3.6-flash', [KEY_1, KEY_2]);
      const handler = function (req) {
        if (req.key === KEY_1) {
          return reply(429, { error: { code: 429, message: 'Resource has been exhausted (e.g. check quota).', status: 'RESOURCE_EXHAUSTED' } });
        }
        return req.method === 'streamGenerateContent'
          ? sse([chunk('جاۋاب', 'gemini-3.6-flash')])
          : reply(200, answer('OK', 'gemini-3.6-flash'));
      };

      let log = fakeGoogle(ai, handler);
      const r = await ai.ask({ type: 'general', context: 'متن', question: 'سوئال' });
      assert.equal(r.ok, true, r.error);
      assert.deepEqual(log.map(function (q) { return q.key === KEY_1 ? 1 : 2; }), [1, 2], 'did not fail over to key 2');
      assert.deepEqual(log.map(function (q) { return q.model; }), ['gemini-3.6-flash', 'gemini-3.6-flash'], 'the model changed');

      // Key 2 is now remembered as the last good one; start on key 1 again.
      ai.setBackupKeys([KEY_2, '', '']);
      log = fakeGoogle(ai, handler);
      const out = await runStream(function (c, d, e, rs) { ai.askStream({ type: 'general', context: 'متن', question: 'سوئال' }, c, d, e, rs); });
      assert.equal(out.error, null, JSON.stringify(out.error));
      assert.equal(out.done.model, 'gemini-3.6-flash');
      assert.deepEqual(log.map(function (q) { return q.model; }), ['gemini-3.6-flash', 'gemini-3.6-flash']);
      assert.deepEqual(log.map(function (q) { return q.key === KEY_1 ? 1 : 2; }), [1, 2]);
    } finally { done(); }
  });
};
