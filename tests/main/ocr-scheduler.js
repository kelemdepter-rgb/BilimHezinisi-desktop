// ============================================================================
// 3.6.1 Phase 3 — the offline OCR uses more than one core.
//
// One worker did every page: about 9 s a page on the owner's kind of page,
// whatever the machine (measured 2026-11-16: 4 pages in 31.9 s with one
// worker, 16.9 s with two). An OCR run now has one engine with K workers
// behind tesseract.js's scheduler — K = min(4, max(1, cores − 1)), at most
// two under 8 GB of memory (≈ 100 MB per extra worker, measured) — started
// once for the run and ended when it finishes, is cancelled, or sits idle a
// minute. ocr-recognize keeps its shape: the images it gets are read in
// parallel and returned in their order.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { textPngs } = require('../lib/text-png');

function workerPathOf(ctx) {
  return require.resolve(path.join(ctx.root, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js'));
}

/** Workers that read an image as its own text, after `delay` ms each. */
function fakeWorkers(delay) {
  const made = [];
  let next = 0;
  const createWorker = function () {
    const w = {
      id: 'fake-' + (++next),
      recognized: [],
      terminated: 0,
      setParameters: function () { return Promise.resolve(); },
      recognize: function (image) {
        w.recognized.push(String(image));
        return new Promise(function (resolve) {
          setTimeout(function () { resolve({ data: { text: String(image) } }); }, typeof delay === 'function' ? delay(String(image)) : delay);
        });
      },
      terminate: function () { w.terminated++; return Promise.resolve(); }
    };
    made.push(w);
    return Promise.resolve(w);
  };
  return { createWorker: createWorker, made: made };
}

const GB = 1024 * 1024 * 1024;

module.exports = function (suite, assert, ctx) {
  const engineModule = function () { return require(path.join(ctx.root, 'ocr-engine.js')); };
  const scheduler = function () { return require(path.join(ctx.root, 'node_modules', 'tesseract.js')).createScheduler; };

  suite.test('ocr-worker-count', function () {
    const e = engineModule();
    assert.equal(typeof e.workerCount, 'function', 'ocr-engine.js has no workerCount');
    const cases = [
      [16, 32 * GB, 4], [8, 16 * GB, 4], [5, 16 * GB, 4], [4, 16 * GB, 3], [3, 16 * GB, 2],
      [2, 16 * GB, 1], [1, 16 * GB, 1], [0, 16 * GB, 1],
      [16, 7.9 * GB, 2], [4, 6 * GB, 2], [2, 4 * GB, 1], [8, 8 * GB, 4]
    ];
    for (const c of cases) {
      assert.equal(e.workerCount(c[0], c[1]), c[2], c[0] + ' cores, ' + (c[1] / GB).toFixed(1) + ' GB');
    }
  });

  // A real engine, three workers, three images of different length: the
  // short one is read first, and the answers still come in the order sent.
  suite.test('ocr-scheduler-keeps-page-order', async function () {
    const e = engineModule();
    const tessdata = path.join(ctx.root, 'assets', 'ocr', 'tessdata');
    if (!fs.existsSync(path.join(tessdata, 'eng.traineddata'))) throw new Error('the OCR models are not here — run «npm run fetch-ocr-models» first');
    const tesseract = require(path.join(ctx.root, 'node_modules', 'tesseract.js'));
    let started = 0;
    const createWorker = function () { started++; return tesseract.createWorker.apply(null, arguments); };
    const images = await textPngs([
      { lines: ['ALPHA FIRST PAGE', 'ALPHA SECOND LINE', 'ALPHA THIRD LINE', 'ALPHA FOURTH LINE', 'ALPHA FIFTH LINE', 'ALPHA SIXTH LINE', 'ALPHA LAST LINE'] },
      { lines: ['BRAVO'] },
      { lines: ['CHARLIE ONE', 'CHARLIE TWO', 'CHARLIE THREE'] }
    ]);
    const engine = e.createEngine({
      createWorker: createWorker,
      createScheduler: tesseract.createScheduler,
      langs: 'eng',
      psm: '3',
      count: 3,
      options: e.workerOptions(tessdata, workerPathOf(ctx))
    });
    const finished = [];
    try {
      const res = await engine.recognize(images, { onPage: function (i) { finished.push(i); } });
      assert.equal(res.cancelled, false);
      assert.equal(res.pages.length, 3, 'not every image was answered');
      assert.includes(res.pages[0], 'ALPHA', 'page 1 is not the first image\'s text: ' + JSON.stringify(res.pages));
      assert.includes(res.pages[1], 'BRAVO', 'page 2 is not the second image\'s text: ' + JSON.stringify(res.pages));
      assert.includes(res.pages[2], 'CHARLIE', 'page 3 is not the third image\'s text: ' + JSON.stringify(res.pages));
      assert.deepEqual(finished.slice().sort(), [0, 1, 2], 'a page was reported twice or not at all: ' + JSON.stringify(finished));
      assert.equal(engine.stats().workers, 3, 'K workers were not started: ' + JSON.stringify(engine.stats()));
      assert.equal(engine.stats().target, 3);

      // One engine for the run: a second request uses the same workers.
      const again = await engine.recognize([images[1]]);
      assert.includes(again.pages[0], 'BRAVO');
      assert.equal(started, 3, 'the second request started new workers');
    } finally {
      await engine.end();
    }
    assert.equal(engine.stats().ended, true, 'the engine did not end');
    assert.equal(engine.stats().workers, 0, 'workers are left after the end');
  });

  // Cancel drops the queued pages at once; every page already read is kept,
  // in order, and the engine still answers the next request.
  suite.test('ocr-cancel-keeps-finished-pages', async function () {
    const e = engineModule();
    const fake = fakeWorkers(60);
    const engine = e.createEngine({
      createWorker: fake.createWorker,
      createScheduler: scheduler(),
      langs: 'eng',
      count: 2,
      options: e.workerOptions('', workerPathOf(ctx))
    });
    const images = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'];
    let cancelledAt = -1;
    const res = await engine.recognize(images, {
      onPage: function () { if (cancelledAt < 0) { cancelledAt = Date.now(); engine.cancel(); } }
    });
    assert.equal(res.cancelled, true, 'the answer does not say it was cancelled');
    assert.ok(res.pages.length >= 1 && res.pages.length < images.length, 'pages kept: ' + JSON.stringify(res.pages));
    res.pages.forEach(function (p, i) { assert.equal(p, images[i], 'the pages kept are not the first ones, in order'); });
    const sent = fake.made.reduce(function (n, w) { return n + w.recognized.length; }, 0);
    assert.ok(sent <= 3, 'queued pages were still read after the cancel: ' + sent);
    assert.equal(sent, res.pages.length, 'a page that was read is not in the answer');

    const after = await engine.recognize(['q1', 'q2', 'q3']);
    assert.deepEqual(after.pages, ['q1', 'q2', 'q3'], 'the engine does not answer after a cancel');
    assert.equal(after.cancelled, false);
    await engine.end();
    assert.ok(fake.made.every(function (w) { return w.terminated === 1; }), 'a worker was not ended');

    // Ended while a page is being read: the request answers, cancelled.
    const fake2 = fakeWorkers(80);
    const engine2 = e.createEngine({ createWorker: fake2.createWorker, createScheduler: scheduler(), langs: 'eng', count: 1, options: e.workerOptions('', workerPathOf(ctx)) });
    const pending = engine2.recognize(['r1', 'r2']);
    await new Promise(function (r) { setTimeout(r, 20); });
    await engine2.end();
    const cut = await Promise.race([pending, new Promise(function (r) { setTimeout(function () { r('hung'); }, 1000); })]);
    assert.ok(cut !== 'hung', 'a request in flight never answered after the engine ended');
    assert.equal(cut.cancelled, true);
  });

  // An engine that cannot start answers every request with the start error;
  // one left idle for its minute ends itself.
  suite.test('ocr-engine-fails-and-idles', async function () {
    const e = engineModule();
    const broken = e.createEngine({
      createWorker: function () { return Promise.reject('initialization failed'); },
      createScheduler: scheduler(), langs: 'eng', count: 2,
      options: e.workerOptions('', workerPathOf(ctx))
    });
    let error = '';
    try { await broken.recognize(['x', 'y', 'z']); } catch (err) { error = err.message; }
    assert.equal(error, 'OCR ماتورى قوزغالمىدى: initialization failed');
    await broken.end();

    assert.equal(e.IDLE_END_MS, 60000, 'an idle engine is not ended after a minute');
    const fake = fakeWorkers(10);
    let ended = 0;
    const idle = e.createEngine({
      createWorker: fake.createWorker, createScheduler: scheduler(), langs: 'eng', count: 2,
      options: e.workerOptions('', workerPathOf(ctx)), idleMs: 80, onEnd: function () { ended++; }
    });
    await idle.recognize(['a', 'b']);
    assert.equal(idle.stats().ended, false, 'the engine ended before it was idle');
    await new Promise(function (r) { setTimeout(r, 250); });
    assert.equal(idle.stats().ended, true, 'an idle engine was not ended');
    assert.equal(ended, 1, 'onEnd was not called once');
    assert.ok(fake.made.length >= 1 && fake.made.every(function (w) { return w.terminated === 1; }), 'the idle workers were not ended');
  });

  // The import dialog's half (index.html is not loadable on its own).
  suite.test('pdf-import-ocr-pipeline-wired', function () {
    const html = fs.readFileSync(path.join(ctx.root, 'src', 'index.html'), 'utf8');
    const body = function (name) {
      const at = html.search(new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\('));
      assert.ok(at >= 0, name + '() is gone');
      const open = html.indexOf('{', at);
      let depth = 0;
      for (let i = open; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}' && --depth === 0) return html.slice(open, i + 1);
      }
      return html.slice(open);
    };
    const run = body('startPdfOcr');
    assert.includes(run, 'ocrWorkerCount(', 'the import does not ask how many pages the engine reads at once');
    assert.includes(run, 'PdfOcr.progressText(', 'the progress line does not say the time left');
    assert.includes(run, 'ocrEnd(', 'the run does not end its engine');
    assert.includes(body('hideAdd'), 'cancelPdfOcr(', 'closing the dialog does not stop its OCR run');
  });

  suite.test('ocr-one-engine-per-run-wired', function () {
    const main = fs.readFileSync(path.join(ctx.root, 'main.js'), 'utf8');
    assert.ok(/ocrEngine\.createEngine\(/.test(main), 'ocr-recognize does not use one engine per run');
    assert.ok(/ocrEngine\.workerCount\(os\.cpus\(\)\.length,\s*os\.totalmem\(\)\)/.test(main), 'K does not come from the cores and the memory');
    assert.ok(/ipcMain\.handle\('ocr-end'/.test(main), 'there is no ocr-end to end a run\'s engine');
    const quit = main.slice(main.indexOf("app.on('before-quit'"));
    assert.ok(/endOcrEngines\(/.test(quit.slice(0, 600)), 'closing the app does not end the OCR engines');
    const preload = fs.readFileSync(path.join(ctx.root, 'preload.js'), 'utf8');
    assert.ok(/ocrEnd:\s*\(/.test(preload), 'preload has no ocrEnd');
    assert.ok(/ocrWorkerCount:\s*\(/.test(preload), 'preload has no ocrWorkerCount');
  });
};
