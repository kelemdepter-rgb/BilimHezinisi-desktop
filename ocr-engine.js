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

// ---------------------------------------------------------------------------
// 3.6.1 Phase 3 — one engine per OCR run, K workers.
//
// One worker read every page, one core of the machine, about 9 s a page; two
// workers read 4 pages in 16.9 s instead of 31.9 s (measured 2026-11-16), at
// about 100 MB of memory per extra worker. An engine is started once for a
// run and ended when the run finishes or is cancelled, when the import dialog
// or the window closes, and after one idle minute.
// ---------------------------------------------------------------------------

/** An engine nobody has used for this long is ended. */
const IDLE_END_MS = 60000;

/**
 * Workers for one OCR run: every core but one, at most four, and at most two
 * when the machine has under 8 GB of memory.
 */
function workerCount(cores, totalMemBytes) {
  let k = Math.min(4, Math.max(1, (Number(cores) || 1) - 1));
  if (totalMemBytes && totalMemBytes < 8 * 1024 * 1024 * 1024) k = Math.min(k, 2);
  return k;
}

/**
 * One offline engine: up to `count` workers behind tesseract.js's scheduler.
 *
 * Workers are started as pages wait for them, each through startWorker (the
 * package check and the start timeout apply to every one), up to `count`.
 * Pages are handed to the scheduler only while a worker is free, so the queue
 * stays here: cancel() drops the pages not yet started at once, and the
 * scheduler never holds a job it would have to be terminated to let go of
 * (its terminate() empties its queue without settling those jobs).
 *
 * @param {object} o
 * @param {Function} o.createWorker, o.createScheduler   from tesseract.js
 * @param {string} o.langs
 * @param {object} o.options        workerOptions(tessdata, workerPath)
 * @param {number} o.count          K
 * @param {string} [o.psm]          tessedit_pageseg_mode for every worker
 * @param {number} [o.timeoutMs]    start timeout per worker
 * @param {number} [o.idleMs]       IDLE_END_MS
 * @param {Function} [o.onEnd]
 */
function createEngine(o) {
  const count = Math.max(1, o.count || 1);
  const idleMs = o.idleMs || IDLE_END_MS;
  const scheduler = o.createScheduler();
  const workers = [];
  const queue = [];          // jobs not started: { image, call, index }
  const running = new Set(); // jobs a worker is reading
  let starting = 0;
  let ended = false;
  let idleTimer = null;

  function settle(job, text, failed) {
    if (job.settled) return;
    job.settled = true;
    const call = job.call;
    if (failed) call.error = call.error || failed;
    else if (text !== undefined) {
      call.pages[job.index] = text;
      call.done[job.index] = true;
      if (call.onPage) { try { call.onPage(job.index); } catch (e) { /* the caller's progress */ } }
    } else {
      call.cancelled = true;
    }
    call.pending--;
    if (call.pending === 0) call.finish();
  }

  function clearIdle() {
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  }

  function idleCheck() {
    if (ended || queue.length || running.size || starting || idleTimer) return;
    idleTimer = setTimeout(() => { idleTimer = null; end(); }, idleMs);
    if (idleTimer.unref) idleTimer.unref();
  }

  // Nothing could start: every waiting page fails with the start error.
  function failQueued(err) {
    const waiting = queue.splice(0, queue.length);
    for (const job of waiting) settle(job, undefined, err);
  }

  function grow() {
    while (!ended && workers.length + starting < count &&
           workers.length + starting < queue.length + running.size) {
      starting++;
      startWorker(o.createWorker, o.langs, o.options, { timeoutMs: o.timeoutMs }).then(async (w) => {
        try {
          if (o.psm) await w.setParameters({ tessedit_pageseg_mode: String(o.psm) });
        } catch (e) {
          starting--;
          try { await w.terminate(); } catch (_) { /* gone */ }
          if (!workers.length && !starting) failQueued(startError((e && e.message) || String(e)));
          idleCheck();
          return;
        }
        starting--;
        if (ended) { w.terminate().catch(() => {}); return; }
        workers.push(w);
        scheduler.addWorker(w);
        pump();
      }, (err) => {
        starting--;
        if (!workers.length && !starting) failQueued(err);
        else if (workers.length && !ended) console.warn('[ocr] a worker did not start, going on with ' + workers.length + ':', err && err.message);
        idleCheck();
      });
    }
  }

  function pump() {
    while (!ended && queue.length && running.size < workers.length) {
      const job = queue.shift();
      running.add(job);
      scheduler.addJob('recognize', job.image).then(
        (r) => settle(job, (r && r.data && r.data.text) || ''),
        (e) => settle(job, undefined, e instanceof Error ? e : new Error(String(e)))
      ).finally(() => {
        running.delete(job);
        pump();
        idleCheck();
      });
    }
    idleCheck();
  }

  /**
   * Read `images` in parallel. Resolves with one text per image, in their
   * order — after a cancel, the ones read before it (always the first ones:
   * pages start in order), with `cancelled`. Rejects when the engine could
   * not start or a page could not be read.
   */
  function recognize(images, opts) {
    const list = Array.isArray(images) ? images : [];
    return new Promise((resolve, reject) => {
      if (ended) { resolve({ pages: [], cancelled: true }); return; }
      const call = {
        pages: new Array(list.length), done: new Array(list.length).fill(false),
        pending: list.length, cancelled: false, error: null,
        onPage: opts && opts.onPage,
        finish: () => {
          if (call.error) { reject(call.error); return; }
          const pages = [];
          for (let i = 0; i < list.length && call.done[i]; i++) pages.push(call.pages[i]);
          resolve({ pages: pages, cancelled: call.cancelled || pages.length < list.length });
        }
      };
      if (!list.length) { resolve({ pages: [], cancelled: false }); return; }
      clearIdle();
      list.forEach((image, index) => queue.push({ image: image, call: call, index: index }));
      grow();
      pump();
    });
  }

  /** Drop every page not started yet; the ones being read finish and are kept. */
  function cancel() {
    const waiting = queue.splice(0, queue.length);
    for (const job of waiting) settle(job);
    idleCheck();
  }

  /** End the engine: nothing more is read, every request in flight answers. */
  async function end() {
    if (ended) return;
    ended = true;
    clearIdle();
    const waiting = queue.splice(0, queue.length);
    for (const job of waiting) settle(job);
    for (const job of Array.from(running)) settle(job);
    running.clear();
    const all = workers.splice(0, workers.length);
    await Promise.all(all.map((w) => Promise.resolve().then(() => w.terminate()).catch(() => {})));
    if (o.onEnd) { try { o.onEnd(); } catch (e) { /* the owner's hook */ } }
  }

  function stats() {
    return { workers: workers.length, target: count, starting: starting, queued: queue.length, running: running.size, ended: ended };
  }

  return { recognize: recognize, cancel: cancel, end: end, stats: stats, get ended() { return ended; } };
}

module.exports = {
  START_TIMEOUT_MS, IDLE_END_MS,
  workerOptions, missingModels,
  unpackedPath, tessdataDir, workerScriptPath,
  missingWorkerModules, startWorker,
  workerCount, createEngine
};
