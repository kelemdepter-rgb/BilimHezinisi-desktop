// ============================================================================
// 3.6 Phase 2 — the offline OCR engine answers.
//
// tesseract.js 5.1.1 decides how to load a model by the environment it runs
// in, and inside Electron that is «electron», not «node»: the local tessdata
// folder is taken for a web address and fetched, and the worker throws
// «Only absolute URLs are supported» outside any promise. The OCR call never
// answered (measured in Electron 28, in the dev app and in a bare Electron
// main process with the app's options). This suite runs in the test runner's
// own Electron main process — the same place main.js runs the engine.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const { barPng } = require('../lib/bar-png');

module.exports = function (suite, assert, ctx) {
  suite.test('ocr-engine-answers', async function () {
    const engine = require(path.join(ctx.root, 'ocr-engine.js'));
    const tessdata = path.join(ctx.root, 'assets', 'ocr', 'tessdata');
    if (!fs.existsSync(path.join(tessdata, 'eng.traineddata'))) {
      throw new Error('the OCR models are not here — run «npm run fetch-ocr-models» first');
    }
    assert.deepEqual(engine.missingModels(tessdata, 'eng'), []);
    assert.deepEqual(engine.missingModels(tessdata, 'eng+nosuch'), ['nosuch'], 'a missing model is not reported');

    const before = fs.statSync(path.join(tessdata, 'eng.traineddata'));
    const { createWorker } = require(path.join(ctx.root, 'node_modules', 'tesseract.js'));
    const workerPath = require.resolve(path.join(ctx.root, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js'));

    // A worker that throws outside its promise would hang the test: the
    // throw and a timeout both end it as a failure instead.
    let onUncaught;
    let worker = null;
    try {
      const answer = await Promise.race([
        (async function () {
          worker = await createWorker('eng', 1, engine.workerOptions(tessdata, workerPath));
          const r = await worker.recognize(barPng(240, 80));
          return { text: r.data.text };
        })(),
        new Promise(function (resolve) {
          onUncaught = function (e) { resolve({ error: e && e.message ? e.message : String(e) }); };
          process.on('uncaughtException', onUncaught);
        }),
        new Promise(function (resolve) { setTimeout(function () { resolve({ error: 'no answer in 60 s' }); }, 60000); })
      ]);
      assert.ok(!answer.error, 'the OCR engine did not answer: ' + answer.error);
      assert.equal(typeof answer.text, 'string');
    } finally {
      process.removeListener('uncaughtException', onUncaught);
      if (worker) { try { await worker.terminate(); } catch (e) { /* already gone */ } }
    }

    // 'readOnly': tesseract reads the bundled models and never writes or
    // deletes them.
    const after = fs.statSync(path.join(tessdata, 'eng.traineddata'));
    assert.equal(after.size, before.size, 'the model file changed');
    assert.equal(after.mtimeMs, before.mtimeMs, 'the model file was written');
  });

  suite.test('ocr-engine-wired', function () {
    const main = fs.readFileSync(path.join(ctx.root, 'main.js'), 'utf8');
    assert.ok(/ocrEngine\.workerOptions\(/.test(main), 'main.js does not start the engine with ocrEngine.workerOptions');
    assert.ok(/ocrEngine\.missingModels\(/.test(main), 'main.js does not check every model before starting the engine');
    assert.excludes(main, "cacheMethod: 'none'", 'the options that never answered are still in main.js');
  });
};
