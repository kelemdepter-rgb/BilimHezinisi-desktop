// ============================================================================
// The offline OCR engine's options (tesseract.js, in the main process).
//
// tesseract.js 5.1.1 decides how to load a model by the environment it runs
// in, and inside Electron that is «electron», not «node»: it took the local
// tessdata folder for a web address, fetched it with node-fetch, and the
// worker threw «Only absolute URLs are supported» outside any promise — the
// OCR call never answered (measured in Electron 28, 3.6 Phase 2).
//
// So the models are read as tesseract's own cache. A cache is read with a
// plain file read before any address is tried, and 'readOnly' means
// tesseract never writes to it and never deletes from it (it deletes a
// cached model that fails to initialise only for 'write' and 'refresh').
//
// 3.6.1 — the installed app. The worker script runs from
// resources/app.asar.unpacked (worker_threads needs a real file), and Node
// looks for its packages from there: up through app.asar.unpacked/node_modules,
// never into the sibling app.asar/node_modules. 3.6.0 unpacked tesseract.js
// without node-fetch, regenerator-runtime, … — the worker thread died on its
// first require, its 'error' became an uncaught exception in the main process
// (tesseract.js sets worker.onerror, which a Node Worker ignores), and the
// OCR call never answered. `npm run dev` resolves everything, so it was never
// seen there. build.asarUnpack now holds the worker's whole dependency
// closure (tests/main/ocr-unpacked.js keeps it so), and startWorker() checks
// it before starting anything, and never waits for ever.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');

/** How long an engine may take to start before the call gives up. */
const START_TIMEOUT_MS = 60000;

/** createWorker options: the bundled models, read from disk, never written. */
function workerOptions(tessdata, workerPath) {
  return {
    workerPath: workerPath,
    langPath: tessdata,
    cachePath: tessdata,
    cacheMethod: 'readOnly',
    gzip: false,
    logger: () => {}
  };
}

/**
 * The models in «ukij+eng» that are not in `tessdata`. Every one must be
 * there: a missing one would send tesseract to its broken address lookup.
 */
function missingModels(tessdata, langs) {
  return String(langs || '').split('+').filter(lang => lang && !fs.existsSync(path.join(tessdata, lang + '.traineddata')));
}

/** An app.asar path as its app.asar.unpacked sibling (unchanged in the source folder). */
function unpackedPath(p) {
  return String(p).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1');
}

/** The bundled models (scripts/fetch-ocr-models.js puts them there). */
function tessdataDir() {
  return unpackedPath(path.join(__dirname, 'assets', 'ocr', 'tessdata'));
}

/** The Node worker script, which worker_threads must load from a real file. */
function workerScriptPath() {
  return unpackedPath(require.resolve('tesseract.js/src/worker-script/node/index.js'));
}

/** The folder of package `name` that `file` (resolved inside it) lies in. */
function packageDirOf(file, name) {
  const marker = path.sep + 'node_modules' + path.sep + name.split('/').join(path.sep) + path.sep;
  const at = String(file).lastIndexOf(marker);
  return at < 0 ? null : String(file).slice(0, at + marker.length - 1);
}

/**
 * The packages the worker script needs that Node cannot find from where it
 * lies: tesseract.js's production dependencies and theirs, each resolved
 * from the package that requires it — the lookup the worker thread makes.
 * [] when everything is there.
 */
function missingWorkerModules(workerPath) {
  const root = packageDirOf(workerPath, 'tesseract.js');
  if (!root || !fs.existsSync(path.join(root, 'package.json'))) return ['tesseract.js'];
  const missing = [];
  const seen = new Set();
  const queue = [root];
  while (queue.length) {
    const dir = queue.shift();
    if (seen.has(dir)) continue;
    seen.add(dir);
    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch (e) { continue; }
    const from = Module.createRequire(path.join(dir, 'package.json'));
    for (const name of Object.keys(pkg.dependencies || {})) {
      let found = null;
      try { found = from.resolve(name); } catch (e) {
        // A package whose `exports` hides its entry for require() is still there.
        try { found = from.resolve(name + '/package.json'); } catch (e2) { found = null; }
      }
      if (!found) {
        if (missing.indexOf(name) === -1) missing.push(name);
        continue;
      }
      const depDir = packageDirOf(found, name);
      if (depDir) queue.push(depDir);
    }
  }
  return missing;
}

/** The start failed — said in the owner's language; the detail is for a bug report. */
function startError(detail) {
  return new Error('OCR ماتورى قوزغالمىدى: ' + detail);
}

/**
 * Start one engine as main.js does, or fail with a short Uyghur message:
 *   - every package the worker needs must be found from where the worker
 *     script lies, before anything is started («…: «node-fetch» تېپىلمىدى.»);
 *   - a start that does not answer within `timeoutMs` (60 s) is given up, and
 *     the engine it started is terminated if it ever arrives.
 * No global uncaughtException handler: the check keeps the known failure
 * (a worker that dies on its first require) from starting at all.
 *
 * @param {Function} createWorker  tesseract.js's createWorker
 * @param {string} langs           «ukij», «ukij+uig», …
 * @param {object} options         workerOptions(tessdata, workerPath)
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<object>} the worker
 */
async function startWorker(createWorker, langs, options, opts) {
  const timeoutMs = (opts && opts.timeoutMs) || START_TIMEOUT_MS;
  const missing = missingWorkerModules(options.workerPath);
  if (missing.length) throw startError('«' + missing[0] + '» تېپىلمىدى.');

  let timer = null;
  let gaveUp = false;
  let started;
  try {
    started = Promise.resolve(createWorker(langs, 1, options));
  } catch (e) {
    throw startError((e && e.message) || String(e));
  }
  // An engine that arrives after the call gave up is ended, not leaked.
  started.then((w) => { if (gaveUp && w && typeof w.terminate === 'function') w.terminate().catch(() => {}); }, () => {});
  try {
    const answer = await Promise.race([
      started.then((w) => ({ worker: w }), (e) => ({ error: e })),
      new Promise((resolve) => { timer = setTimeout(() => resolve({ timeout: true }), timeoutMs); })
    ]);
    if (answer.timeout) {
      gaveUp = true;
      throw startError(Math.round(timeoutMs / 1000) + ' سېكۇنتتا جاۋاب بەرمىدى.');
    }
    if (answer.error) throw startError((answer.error && answer.error.message) || String(answer.error));
    return answer.worker;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  START_TIMEOUT_MS,
  workerOptions, missingModels,
  unpackedPath, tessdataDir, workerScriptPath,
  missingWorkerModules, startWorker
};
