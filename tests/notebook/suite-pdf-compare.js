// ============================================================================
// 3.6 Phase 7 — the PDF page view («ئەسلى بەت بىلەن سېلىشتۇرۇش»).
//
// One page at a time: its text on the right, editable only when the page is
// placed in the book; the page drawn by pdf.js on the left, one canvas. A
// correction is saved only on «ساقلاش»; unsaved text is asked about inline
// before leaving the page; OCR and AI help comes as a preview that replaces
// nothing until «قوللىنىش». A PDF that is not where it was recorded shows the
// banner with «PDF نى كۆرسىتىپ بېرىش».
//
// The real src/pdf-compare.js, src/pdf-text.js and pdf.js are loaded by the
// harness. The main process is a stand-in with the same `api` index.html hands in.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** The main process, for one book: pages 1 and 3 placed, page 2 an estimate. */
  function fakeApi(opts) {
    const o = opts || {};
    const calls = [];
    const texts = { 1: 'بىرىنچى بەتنىڭ تېكىستى.', 2: 'تەخمىنىي تېكىست.', 3: 'ئۈچىنچى بەت.' };
    let status = o.status || 'found';
    const api = {
      calls: calls,
      texts: texts,
      status: async function () { calls.push(['status']); return { success: true, status: status }; },
      locate: async function () { calls.push(['locate']); status = 'found'; return { success: true, ok: true, same: true }; },
      bytes: async function () { calls.push(['bytes']); return { success: true, data: window.MakePdf.make(['Page one of the test book, with a line of text.', 'Page two of the test book, with a line of text.', 'Page three of the test book, with a line of text.']) }; },
      info: async function (p, n) {
        calls.push(['info', p, n]);
        if (p === 2) return { success: true, placed: false, estimated: { start: 30, end: 46 }, text: texts[2], edits: 0, mapped: 2 };
        return { success: true, placed: true, text: texts[p], edits: o.edits || 0, mapped: 2 };
      },
      pageAt: async function (off, n) { calls.push(['pageAt', off, n]); return { success: true, page: o.startPage || 1 }; },
      save: async function (p, t) { calls.push(['save', p, t]); texts[p] = t; return { success: true, ok: true }; },
      undo: async function (p) { calls.push(['undo', p]); return { success: true, ok: true }; },
      align: async function (t) { calls.push(['align', t.length]); return { success: true, placed: 3, missing: [] }; },
      place: async function (p, n, t) { calls.push(['place', p, n, t]); return { success: true, ok: true }; }
    };
    return api;
  }

  async function withView(api, body, extra) {
    const host = document.createElement('div');
    host.id = 'pcv';
    host.className = 'on';
    host.style.cssText = 'position:fixed;inset:0;z-index:20;display:flex;flex-direction:column;background:#fff';
    document.body.appendChild(host);
    const log = { toasts: [], changed: 0, closed: null, renders: [] };
    const view = window.PdfCompare.createView(Object.assign({
      host: host,
      pdfjs: window.pdfjsLib,
      renderPage: function (pdf, n, scale) { log.renders.push([n, scale]); return window.PdfText.renderPage(pdf, n, scale); },
      api: api,
      title: 'سىناق',
      ocrPage: async function () { return 'OCR ئوقۇغان تېكىست'; },
      aiAvailable: async function () { return false; },
      aiCleanup: async function (t) { return t + ' (AI)'; },
      toast: function (m, t) { log.toasts.push([m, t]); },
      onChanged: async function () { log.changed++; },
      onClose: function (changed) { log.closed = changed; }
    }, extra || {}));
    try {
      await body(view, host, log);
    } finally {
      host.remove();
    }
  }

  function click(el) { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
  function type(view, text) {
    const ta = view.elements().text;
    ta.value = text;
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }

  test('pdf-compare-one-page-at-a-time', async function (t) {
    if (!window.PdfCompare) throw new Error('window.PdfCompare is missing (src/pdf-compare.js)');
    const api = fakeApi({ startPage: 3 });
    await withView(api, async function (view, host, log) {
      await view.open(1234);
      t.assert.deepEqual(api.calls.filter(function (c) { return c[0] === 'pageAt'; }), [['pageAt', 1234, 3]], 'it asked for the page holding the reader\'s place');
      t.assert.equal(view.state().page, 3, 'and opened there');
      t.assert.equal(view.state().pageCount, 3);
      t.assert.equal(host.querySelectorAll('canvas').length, 1, 'one page drawn');
      t.assert.deepEqual(log.renders.map(function (r) { return r[0]; }), [3], 'only the page on screen was drawn');
      t.assert.equal(view.elements().text.value, 'ئۈچىنچى بەت.', 'its text on the right');
      t.assert.ok(!view.elements().text.readOnly, 'a placed page can be corrected');
      t.assert.equal(api.calls.filter(function (c) { return c[0] === 'bytes'; }).length, 1, 'the PDF was read once');
      t.assert.equal(api.calls.filter(function (c) { return c[0] === 'align'; }).length, 0, 'a book with a map is not aligned again');

      await view.go(2);
      t.assert.equal(host.querySelectorAll('canvas').length, 1, 'still one canvas');
      t.assert.ok(view.elements().text.readOnly, 'an estimated page cannot be edited');
      t.assert.includes(view.elements().state.textContent, 'تەخمىنىي', 'and says it is an estimate');
      t.assert.equal(view.elements().place.style.display, '', '«بۇ بەتنى تېكىستتىن تېپىش» is offered');
      t.assert.ok(view.elements().save.disabled, 'nothing to save');

      // Zoom: the same page, drawn larger.
      const w1 = host.querySelector('canvas').getBoundingClientRect().width;
      click(host.querySelector('.pcv-zin'));
      await sleep(150);
      const w2 = host.querySelector('canvas').getBoundingClientRect().width;
      t.assert.ok(w2 > w1 * 1.2, 'zoomed in: ' + Math.round(w1) + ' → ' + Math.round(w2));
      t.assert.equal(api.calls.filter(function (c) { return c[0] === 'bytes'; }).length, 1, 'zooming read nothing again');
    });
  });

  test('pdf-compare-save-only-on-save', async function (t) {
    if (!window.PdfCompare) throw new Error('window.PdfCompare is missing (src/pdf-compare.js)');
    const api = fakeApi();
    await withView(api, async function (view, host, log) {
      await view.open();
      t.assert.equal(view.state().page, 1, 'without a place, page 1');
      type(view, 'بىرىنچى بەتنىڭ تۈزىتىلگەن تېكىستى.');
      t.assert.ok(view.state().dirty && !view.elements().save.disabled, 'changed text can be saved');
      t.assert.equal(api.calls.filter(function (c) { return c[0] === 'save'; }).length, 0, 'typing saves nothing');

      // Leaving the page asks, inline; «قېلىش» stays.
      const going = view.go(3);
      await sleep(20);
      const ask = host.querySelector('.pcv-ask');
      t.assert.equal(ask.style.display, '', 'asked before leaving unsaved text');
      click([].slice.call(ask.querySelectorAll('button')).find(function (b) { return b.textContent === 'قېلىش'; }));
      await going;
      t.assert.equal(view.state().page, 1, 'stayed on the page');
      t.assert.equal(view.elements().text.value, 'بىرىنچى بەتنىڭ تۈزىتىلگەن تېكىستى.', 'with the text as typed');

      // «ساقلاپ ئۆتۈش»: saved, then on.
      const again = view.go(3);
      await sleep(20);
      click([].slice.call(host.querySelectorAll('.pcv-ask button')).find(function (b) { return b.textContent === 'ساقلاپ ئۆتۈش'; }));
      await again;
      t.assert.deepEqual(api.calls.filter(function (c) { return c[0] === 'save'; }), [['save', 1, 'بىرىنچى بەتنىڭ تۈزىتىلگەن تېكىستى.']], 'saved once, page 1, the text as typed');
      t.assert.equal(log.changed, 1, 'the app was told (it reloads the places)');
      t.assert.equal(view.state().page, 3, 'and went on');

      // A preview replaces nothing until «قوللىنىش».
      click(view.elements().ocr);
      await sleep(50);
      t.assert.equal(view.elements().preview.style.display, '', 'the OCR came as a preview');
      t.assert.equal(view.elements().text.value, 'ئۈچىنچى بەت.', 'the text is untouched');
      t.assert.ok(!view.state().dirty, 'nothing to save yet');
      click(host.querySelector('.pcv-apply'));
      t.assert.equal(view.elements().text.value, 'OCR ئوقۇغان تېكىست', '«قوللىنىش» put it in the text');
      t.assert.ok(view.state().dirty, 'to be saved like any correction');
      t.assert.equal(api.calls.filter(function (c) { return c[0] === 'save'; }).length, 1, 'not saved by applying');

      // Closing with unsaved text asks too; «ساقلىماي ئۆتۈش» closes.
      const closing = view.close();
      await sleep(20);
      click([].slice.call(host.querySelectorAll('.pcv-ask button')).find(function (b) { return b.textContent === 'ساقلىماي ئۆتۈش'; }));
      await closing;
      t.assert.equal(log.closed, true, 'closed, saying the book changed');
      t.assert.equal(api.calls.filter(function (c) { return c[0] === 'save'; }).length, 1, 'the dropped text was not saved');
    });
  });

  test('pdf-compare-moved-pdf-banner', async function (t) {
    if (!window.PdfCompare) throw new Error('window.PdfCompare is missing (src/pdf-compare.js)');
    const api = fakeApi({ status: 'moved' });
    await withView(api, async function (view, host) {
      await view.open();
      const banner = host.querySelector('.pcv-banner');
      t.assert.equal(banner.style.display, '', 'the banner is shown');
      t.assert.includes(banner.textContent, 'ئەسلى PDF تېپىلمىدى');
      t.assert.equal(api.calls.filter(function (c) { return c[0] === 'bytes'; }).length, 0, 'the PDF was not read');
      t.assert.equal(host.querySelectorAll('canvas').length, 0, 'nothing drawn');
      click([].slice.call(banner.querySelectorAll('button')).find(function (b) { return b.textContent === 'PDF نى كۆرسىتىپ بېرىش'; }));
      for (let i = 0; i < 50 && !host.querySelector('canvas'); i++) await sleep(20);
      t.assert.ok(api.calls.some(function (c) { return c[0] === 'locate'; }), 'the owner was asked to point to it');
      t.assert.equal(banner.style.display, 'none', 'found: the banner is gone');
      t.assert.equal(host.querySelectorAll('canvas').length, 1, 'and the page is drawn');
    });
  });

  test('pdf-compare-aligns-a-book-without-a-map', async function (t) {
    if (!window.PdfCompare) throw new Error('window.PdfCompare is missing (src/pdf-compare.js)');
    const api = fakeApi();
    const info = api.info;
    let mapped = 0;
    api.info = async function (p, n) { const r = await info(p, n); r.mapped = mapped; return r; };
    const align = api.align;
    api.align = async function (texts) { mapped = 3; api.texts.sent = texts; return align(texts); };
    await withView(api, async function (view, host, log) {
      await view.open();
      t.assert.deepEqual(api.texts.sent, ['Page one of the test book, with a line of text.', 'Page two of the test book, with a line of text.', 'Page three of the test book, with a line of text.'], 'every page\'s text layer was sent, in order');
      t.assert.ok(log.toasts.some(function (x) { return x[0].indexOf('3') !== -1; }), 'and the owner told how many were placed');
    });
  });
})();
