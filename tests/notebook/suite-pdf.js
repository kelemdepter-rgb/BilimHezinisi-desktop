// ============================================================================
// 3.6 Phase 2 — a PDF import keeps every page.
//
// A text PDF imported on its own stopped at page 100 and a batch import at
// page 200, while the dialog said «(N بەت)» with the full count. The text
// layer is now read by src/pdf-text.js — every page, with progress — which
// also says where each page lies in the joined text. Scanned-PDF OCR keeps
// its 300-page cap and says so.
//
// The PDF is made here (tests/lib/make-pdf.js) and read by the app's own
// bundled pdf.js, in Chromium 120.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  async function open(bytes) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../../assets/pdfjs/pdf.worker.min.js';
    return pdfjsLib.getDocument({ data: bytes }).promise;
  }

  function checkCover(t, ranges, text, sep, trailing) {
    let at = 0;
    ranges.forEach(function (r, i) {
      t.assert.equal(r[0], at, 'page ' + (i + 1) + ' does not start where the one before ended');
      t.assert.ok(r[1] >= r[0], 'page ' + (i + 1) + ' ends before it starts');
      at = r[1] + (i < ranges.length - 1 || trailing ? sep.length : 0);
    });
    t.assert.equal(at, text.length, 'the pages and their joins do not cover the text');
  }

  test('pdf-extract-every-page', async function (t) {
    t.assert.ok(window.PdfText && window.pdfjsLib, 'src/pdf-text.js or pdf.js is not loaded');
    const pages = [];
    for (let i = 1; i <= 150; i++) {
      pages.push(i === 77 ? { latin: 'Page 77 forms', forms: 'ADBC' } : 'Page ' + i + ' end of page ' + i);
    }
    const pdf = await open(window.MakePdf.make(pages));
    t.assert.equal(pdf.numPages, 150);

    const seen = [];
    const out = await window.PdfText.extract(pdf, { onPage: function (i, n) { seen.push([i, n]); } });
    t.assert.equal(out.pageCount, 150);
    t.assert.equal(out.ranges.length, 150, 'every page has its range');
    t.assert.includes(out.text, 'end of page 150', 'the pages after 100 were lost');
    t.assert.equal(seen.length, 150, 'progress was not reported for every page');
    t.assert.deepEqual(seen[149], [150, 150]);
    checkCover(t, out.ranges, out.text, '\n', true);
    t.assert.equal(out.text.slice(out.ranges[119][0], out.ranges[119][1]), 'Page 120 end of page 120');

    // The text layer hands glyph codepoints through as they are; the main
    // process folds them to letters and maps the ranges through the fold.
    const p77 = out.text.slice(out.ranges[76][0], out.ranges[76][1]);
    t.assert.includes(p77, 'ﻻ', 'the presentation form did not reach the text: ' + JSON.stringify(p77));
  });

  // OCR draws each page before reading it. With pdf.js's default 'display'
  // intent a render waits for animation frames, and a window behind another
  // one, or minimized, draws none (measured in the dev app, Electron 28): OCR
  // stood still whenever the owner looked at another window. This test page
  // does get frames, so it holds them back, as such a window does.
  test('pdf-render-in-a-hidden-window', async function (t) {
    const pdf = await open(window.MakePdf.make(['Drawn while hidden', 'Second']));
    const realFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = function () { return 0; };   // no frame ever comes
    let canvas;
    try {
      canvas = await Promise.race([
        window.PdfText.renderPage(pdf, 1, 1),
        new Promise(function (r) { setTimeout(function () { r(null); }, 3000); })
      ]);
    } finally {
      window.requestAnimationFrame = realFrame;
    }
    t.assert.ok(canvas, 'the page was not drawn in 3 s — the render waits for a frame that never comes');
    const px = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] < 128) ink++;
    t.assert.ok(ink > 50, 'the page came out blank');
    t.assert.equal(px[3], 255, 'the canvas is not painted white under the page');
  });

  test('pdf-ocr-join-and-cap', async function (t) {
    const P = window.PdfText;
    // OCR joins pages with a blank line and trims the whole; an empty page
    // keeps an empty range at its place.
    const j = P.joinPages(['  first', '', 'third  '], '\n\n', { trim: true });
    t.assert.equal(j.text, 'first\n\n\n\nthird');
    t.assert.deepEqual(j.ranges, [[0, 5], [7, 7], [9, 14]]);
    // The text layer: '\n' after every page, as before.
    const k = P.joinPages(['a', 'bb'], '\n', { trailing: true });
    t.assert.equal(k.text, 'a\nbb\n');
    t.assert.deepEqual(k.ranges, [[0, 1], [2, 4]]);

    t.assert.equal(P.OCR_MAX_PAGES, 300);
    t.assert.equal(P.readLabel(300, 512), '300 / 512 بەت ئوقۇلدى');
    const note = P.ocrNote(300, 512);
    t.assert.ok(note.indexOf('512') !== -1 && note.indexOf('300') !== -1, 'the description line does not say how many pages: ' + note);
    t.assert.equal(P.ocrNote(40, 40), '', 'a book read whole needs no note');
  });

  // 3.6.1 — an engine that fails ends the run with the pages read so far and
  // its own words; it used to be toasted, followed by «OCR دىن تېكىست
  // چىقمىدى», and the OCR box closed with no way to try again.
  test('pdf-ocr-error-keeps-pages', async function (t) {
    const O = window.PdfOcr;
    t.assert.ok(O && typeof O.run === 'function', 'src/pdf-ocr.js is not loaded');
    const sent = [];
    const res = await O.run({
      maxPages: 12,
      batch: 5,
      render: async function (p) { return 'page-' + p; },
      recognize: async function (images) {
        sent.push(images.slice());
        if (sent.length === 2) return { success: false, error: 'OCR ماتورى قوزغالمىدى: «node-fetch» تېپىلمىدى.' };
        return { success: true, pages: images.map(function (img, i) { return i === 1 ? '' : 'text of ' + img; }) };
      }
    });
    t.assert.deepEqual(sent.map(function (b) { return b.length; }), [5, 5], 'the run went on after the engine failed');
    t.assert.equal(res.pages.length, 5, 'the pages read before the failure were not kept');
    t.assert.equal(res.pages[1], '', 'an empty page lost its entry');
    t.assert.equal(res.pages[4], 'text of page-5');
    t.assert.equal(res.error, 'OCR ماتورى قوزغالمىدى: «node-fetch» تېپىلمىدى.');

    // A throw on the way (a page that cannot be drawn, the IPC itself) is a
    // failure too, never an exception out of the run.
    const thrown = await O.run({
      maxPages: 3, batch: 5,
      render: async function (p) { if (p === 2) throw new Error('render failed'); return 'p'; },
      recognize: async function () { return { success: true, pages: [] }; }
    });
    t.assert.equal(thrown.error, 'render failed');
    t.assert.deepEqual(thrown.pages, []);

    // A run read whole has no error; a cancel keeps what was read.
    let stop = false;
    const whole = await O.run({
      maxPages: 7, batch: 5,
      render: async function (p) { return 'page-' + p; },
      recognize: async function (images) { stop = true; return { success: true, pages: images }; },
      cancelled: function () { return stop; }
    });
    t.assert.equal(whole.error, null);
    t.assert.equal(whole.cancelled, true);
    t.assert.equal(whole.pages.length, 5, 'a cancel lost the pages already read');
  });

  test('pdf-ocr-failure-offers-retry', async function (t) {
    const O = window.PdfOcr;
    t.assert.ok(O && typeof O.showFailure === 'function', 'src/pdf-ocr.js is not loaded');
    const box = document.createElement('div');
    box.innerHTML = '<div id="b" style="display:none"></div><div id="p" style="display:block"></div><div id="m" style="display:none"></div>';
    document.body.appendChild(box);
    try {
      const els = { buttons: box.querySelector('#b'), progress: box.querySelector('#p'), message: box.querySelector('#m') };
      const said = O.failureText('OCR ماتورى قوزغالمىدى: «node-fetch» تېپىلمىدى.', 10, 40);
      O.showFailure(els, said);
      t.assert.equal(els.buttons.style.display, 'flex', 'the engine buttons did not come back');
      t.assert.equal(els.progress.style.display, 'none', 'the progress line stayed');
      t.assert.equal(els.message.style.display, 'block', 'the error is not on screen');
      t.assert.includes(els.message.textContent, '«node-fetch» تېپىلمىدى.', 'the engine\'s own words are not shown');
      t.assert.includes(els.message.textContent, '10 / 40 بەت ئوقۇلدى', 'the pages kept are not said');
      t.assert.includes(els.message.textContent, '«UKIJ OCR (تورسىز)»', 'how to try again is not said');
      t.assert.equal(O.failureText('timeout', 0, 40), 'OCR خاتالىقى: timeout. قايتا سىناش ئۈچۈن «UKIJ OCR (تورسىز)» نى بېسىڭ.');
    } finally {
      box.remove();
    }
  });
})();
