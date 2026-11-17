// ============================================================================
// The half of `npm run check-package` that runs INSIDE the built app.
//
// scripts/check-package.js starts the built «Bilim Hezinisi.exe» with
// ELECTRON_RUN_AS_NODE=1 on this file, so the lookups below are the packaged
// app's own: Electron keeps a packed app's module lookups inside its
// resources folder, which plain Node from the source tree would not (it
// would find the source folder's node_modules and pass a broken build).
//
// It starts the offline OCR engine exactly as main.js does — ocr-engine.js and
// tesseract.js from resources/app.asar, the worker script and the models from
// app.asar.unpacked — reads one image, and prints one line:
//   CHECK-PACKAGE {"missing": [...], "ocr": {...}}
//
//   <exe> check-package-probe.js <resources> <checker ocr-engine.js> <png> <timeoutMs>
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

const [resources, checkerEngine, pngPath, timeoutArg] = process.argv.slice(2);
const timeoutMs = Number(timeoutArg) || 60000;
const LANGS = 'ukij';
const report = { electron: process.versions.electron || null, missing: null, ocr: null };

function done(code) {
  process.stdout.write('CHECK-PACKAGE ' + JSON.stringify(report) + '\n');
  process.exit(code);
}

function unpacked(p) {
  return String(p).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

(async function () {
  const appDir = path.join(resources, 'app.asar');
  const appRequire = Module.createRequire(path.join(appDir, 'package.json'));
  let built;
  let tesseract;
  try {
    built = appRequire('./ocr-engine.js');
    tesseract = appRequire('tesseract.js');
  } catch (e) {
    report.ocr = { error: 'could not load the engine from app.asar: ' + e.message };
    return done(1);
  }
  // A build from before 3.6.1 has neither helper; main.js computed the same paths.
  const tessdata = typeof built.tessdataDir === 'function'
    ? built.tessdataDir() : unpacked(path.join(appDir, 'assets', 'ocr', 'tessdata'));
  const workerPath = typeof built.workerScriptPath === 'function'
    ? built.workerScriptPath() : unpacked(appRequire.resolve('tesseract.js/src/worker-script/node/index.js'));
  report.workerPath = workerPath;
  report.tessdata = tessdata;

  // Every package the worker needs, looked up from where it lies — the
  // checker's own rule, through this app's module lookup.
  report.missing = require(checkerEngine).missingWorkerModules(workerPath);

  // A real page through the built engine, started as main.js starts it. A
  // worker that dies on its first require never answers: its uncaught error
  // ends the wait at once instead of the timeout.
  const started = Date.now();
  let worker = null;
  let onUncaught = null;
  const outcome = await Promise.race([
    (async function () {
      const options = built.workerOptions(tessdata, workerPath);
      worker = typeof built.startWorker === 'function'
        ? await built.startWorker(tesseract.createWorker, LANGS, options, { timeoutMs: timeoutMs })
        : await tesseract.createWorker(LANGS, 1, options);
      await worker.setParameters({ tessedit_pageseg_mode: '3' });
      const r = await worker.recognize(fs.readFileSync(pngPath));
      return { answered: true, chars: ((r.data && r.data.text) || '').length };
    })().catch(function (e) { return { error: (e && e.message) || String(e) }; }),
    new Promise(function (resolve) {
      onUncaught = function (e) { resolve({ error: 'uncaught in the main process: ' + String((e && e.message) || e).split('\n')[0] }); };
      process.on('uncaughtException', onUncaught);
    }),
    new Promise(function (resolve) { setTimeout(function () { resolve({ error: 'no answer in ' + Math.round(timeoutMs / 1000) + ' s' }); }, timeoutMs); })
  ]);
  outcome.ms = Date.now() - started;
  report.ocr = outcome;
  if (worker) { try { await worker.terminate(); } catch (e) { /* gone */ } }
  done(outcome.answered && report.missing.length === 0 ? 0 : 1);
})().catch(function (e) {
  report.ocr = { error: 'probe failed: ' + ((e && e.stack) || e) };
  done(1);
});
