// ============================================================================
// 3.6.1 Phase 2 — the offline OCR answers in the installed app.
//
// main.js starts tesseract.js with its worker script from
// resources/app.asar.unpacked/node_modules/tesseract.js. That script's first
// line is require('node-fetch'), then regenerator-runtime, is-url, … — and
// 3.6.0 unpacked only better-sqlite3, tesseract.js, tesseract.js-core and
// assets/ocr. Node's lookup from app.asar.unpacked never reaches the sibling
// app.asar/node_modules: the worker thread died, its 'error' became an
// uncaught exception in the main process, and ocr-recognize never answered.
// The import dialog showed «بەت 0 / N» for ever. `npm run dev` resolves
// everything, so 3.6 never saw it (reproduced in Electron 28.3.3, 2026-11-16).
//
// Written red in Phase 0 (before any fix): «… are not unpacked», and «no
// answer within 30 s (uncaught in the main process: Cannot find module
// 'node-fetch')» with main.js's createWorker call of 3.6.0.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { barPng } = require('../lib/bar-png');

/** electron-builder's file patterns as a RegExp: **, *, ?, {a,b}. */
function globRe(pattern) {
  let re = '';
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      i++;
      if (pattern[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else if (c === '{') re += '(?:';
    else if (c === '}') re += ')';
    else if (c === ',') re += '|';
    else re += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

/** Where Node finds package `name` from `fromDir`, stopping at the app root. */
function locate(root, name, fromDir) {
  let dir = fromDir;
  for (;;) {
    if (path.basename(dir) !== 'node_modules') {
      const cand = path.join(dir, 'node_modules', name);
      if (fs.existsSync(path.join(cand, 'package.json'))) return cand;
    }
    if (path.resolve(dir) === path.resolve(root)) return null;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** tesseract.js and every production dependency it pulls in, as installed. */
function workerClosure(root) {
  const found = new Map();
  const queue = [{ name: 'tesseract.js', from: root }];
  while (queue.length) {
    const item = queue.shift();
    const dir = locate(root, item.name, item.from);
    if (!dir || found.has(dir)) continue;   // not installed (optional), or seen
    found.set(dir, item.name);
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    for (const dep of Object.keys(pkg.dependencies || {})) queue.push({ name: dep, from: dir });
  }
  return Array.from(found.entries()).map(function (e) {
    return { name: e[1], rel: path.relative(root, e[0]).replace(/\\/g, '/') };
  });
}

/** Runs `fn` with uncaught exceptions collected instead of reaching Electron's error box. */
async function catchingUncaught(fn) {
  const uncaught = [];
  const onUncaught = function (e) { uncaught.push(e && e.message ? e.message : String(e)); };
  process.on('uncaughtException', onUncaught);
  try {
    return { value: await fn(uncaught), uncaught: uncaught };
  } finally {
    process.removeListener('uncaughtException', onUncaught);
  }
}

function modelsHere(ctx) {
  const tessdata = path.join(ctx.root, 'assets', 'ocr', 'tessdata');
  if (!fs.existsSync(path.join(tessdata, 'eng.traineddata'))) {
    throw new Error('the OCR models are not here — run «npm run fetch-ocr-models» first');
  }
  return tessdata;
}

const START_FAILED = /^OCR ماتورى قوزغالمىدى: /;

module.exports = function (suite, assert, ctx) {
  // The worker's whole dependency closure is unpacked beside it.
  suite.test('ocr-worker-dependencies-unpacked', function () {
    const pkg = JSON.parse(fs.readFileSync(path.join(ctx.root, 'package.json'), 'utf8'));
    const patterns = ((pkg.build && pkg.build.asarUnpack) || []).map(globRe);
    const closure = workerClosure(ctx.root);
    assert.ok(closure.length > 1 && closure.some(function (d) { return d.name === 'node-fetch'; }),
      'the dependency walk found nothing — is tesseract.js installed? ' + JSON.stringify(closure));
    const missing = closure.filter(function (d) {
      const file = d.rel + '/package.json';
      return !patterns.some(function (re) { return re.test(file); });
    }).map(function (d) { return d.name; });
    assert.equal(missing.length, 0, missing.join(', ') + ' are not unpacked (build.asarUnpack)');
  });

  // The 3.6.0 layout: tesseract.js alone in a node_modules folder, without
  // the packages its worker requires. The engine must answer — with an error
  // that names what is missing — instead of never answering.
  suite.test('ocr-engine-unpacked-layout', async function () {
    const engine = require(path.join(ctx.root, 'ocr-engine.js'));
    const tessdata = modelsHere(ctx);
    const layout = path.join(ctx.tmpDir, 'ocr-unpacked-layout');
    fs.cpSync(path.join(ctx.root, 'node_modules', 'tesseract.js'), path.join(layout, 'node_modules', 'tesseract.js'), { recursive: true });
    const workerPath = path.join(layout, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js');
    const { createWorker } = require(path.join(ctx.root, 'node_modules', 'tesseract.js'));
    const deps = Object.keys(JSON.parse(fs.readFileSync(path.join(ctx.root, 'node_modules', 'tesseract.js', 'package.json'), 'utf8')).dependencies);

    let worker = null;
    let timer = null;
    const started = Date.now();
    const run = await catchingUncaught(function () {
      return Promise.race([
        engine.startWorker(createWorker, 'eng', engine.workerOptions(tessdata, workerPath)).then(
          function (w) { worker = w; return w.recognize(barPng(240, 80)).then(function () { return { answered: true }; }); },
          function (e) { return { error: e && e.message ? e.message : String(e) }; }),
        new Promise(function (resolve) { timer = setTimeout(function () { resolve({ timeout: true }); }, 30000); })
      ]);
    });
    clearTimeout(timer);
    if (worker) { try { await worker.terminate(); } catch (e) { /* already gone */ } }
    const answer = run.value;
    const took = Date.now() - started;

    assert.ok(!answer.timeout, 'no answer within 30 s' +
      (run.uncaught.length ? ' (uncaught in the main process: ' + run.uncaught.join(' | ').split('\n')[0] + ')' : ''));
    assert.ok(answer.error, 'the engine started without the packages its worker needs');
    const named = /^OCR ماتورى قوزغالمىدى: «([^»]+)» تېپىلمىدى\.$/.exec(answer.error);
    assert.ok(named, 'the error is not the short Uyghur one naming the package: ' + answer.error);
    assert.ok(deps.indexOf(named[1]) !== -1, 'the error names a package the worker does not need: ' + named[1]);
    assert.ok(took < 10000, 'the error took ' + took + ' ms');
    assert.equal(run.uncaught.length, 0, 'an uncaught exception reached the main process: ' + run.uncaught.join(' | '));
  });

  // The check finds nothing missing where everything is: the engine starts
  // through it and reads a page.
  suite.test('ocr-engine-start-answers', async function () {
    const engine = require(path.join(ctx.root, 'ocr-engine.js'));
    const tessdata = modelsHere(ctx);
    const workerPath = require.resolve(path.join(ctx.root, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js'));
    assert.deepEqual(engine.missingWorkerModules(workerPath), [], 'the check reports packages that are installed');
    const { createWorker } = require(path.join(ctx.root, 'node_modules', 'tesseract.js'));
    let worker = null;
    const run = await catchingUncaught(async function () {
      try {
        worker = await engine.startWorker(createWorker, 'eng', engine.workerOptions(tessdata, workerPath), { timeoutMs: 30000 });
        const r = await worker.recognize(barPng(240, 80));
        return { text: r.data.text };
      } catch (e) {
        return { error: e && e.message ? e.message : String(e) };
      }
    });
    if (worker) { try { await worker.terminate(); } catch (e) { /* already gone */ } }
    assert.ok(!run.value.error, 'the engine did not start: ' + run.value.error);
    assert.equal(typeof run.value.text, 'string');
    assert.equal(run.uncaught.length, 0, 'an uncaught exception reached the main process: ' + run.uncaught.join(' | '));
  });

  // A start that never answers is given up, and the engine is ended if it
  // arrives later — never waited for, never leaked.
  suite.test('ocr-engine-start-timeout', async function () {
    const engine = require(path.join(ctx.root, 'ocr-engine.js'));
    const workerPath = require.resolve(path.join(ctx.root, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js'));
    assert.equal(engine.START_TIMEOUT_MS, 60000, 'the start timeout is not a minute');
    let terminated = 0;
    const late = { terminate: function () { terminated++; return Promise.resolve(); } };
    const slow = function () { return new Promise(function (resolve) { setTimeout(function () { resolve(late); }, 300); }); };
    const started = Date.now();
    let error = '';
    try {
      await engine.startWorker(slow, 'eng', engine.workerOptions('', workerPath), { timeoutMs: 100 });
    } catch (e) { error = e.message; }
    assert.ok(START_FAILED.test(error), 'a start that did not answer was not given up: ' + error);
    assert.ok(Date.now() - started < 1000, 'the timeout was not kept');
    await new Promise(function (resolve) { setTimeout(resolve, 400); });
    assert.equal(terminated, 1, 'the engine that arrived late was not ended');

    // A start that fails says so in the same words.
    let failed = '';
    try {
      await engine.startWorker(function () { return Promise.reject('initialization failed'); }, 'eng', engine.workerOptions('', workerPath));
    } catch (e) { failed = e.message; }
    assert.equal(failed, 'OCR ماتورى قوزغالمىدى: initialization failed');
  });

  suite.test('ocr-start-wired', function () {
    const main = fs.readFileSync(path.join(ctx.root, 'main.js'), 'utf8');
    assert.ok(/ocrEngine\.startWorker\(createWorker,/.test(main), 'ocr-recognize does not start the engine through ocrEngine.startWorker');
    assert.excludes(main, 'await createWorker(', 'main.js still starts an engine without the check and the timeout');
  });
};
