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
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

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

module.exports = { workerOptions, missingModels };
