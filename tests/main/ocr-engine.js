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
const zlib = require('zlib');

/** A white PNG with a black bar, RGB, written by hand. */
function barPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    if (y > h / 2 - 5 && y < h / 2 + 5) {
      for (let x = 20; x < w - 20; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = raw[i + 1] = raw[i + 2] = 0; }
    }
  }
  const table = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

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
