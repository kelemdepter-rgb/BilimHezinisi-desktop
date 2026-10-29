// ============================================================================
// A PDF's text, page by page, and where each page lies in it (3.6).
//
// The importer read a text-layer PDF only up to page 100 (page 200 in a batch
// import) while the dialog showed the whole page count: everything after was
// silently lost. Every page is read now, with progress, and the book's text
// is joined exactly as before — '\n' after each text-layer page, a blank line
// between OCR pages, the whole trimmed — with each page's [start, end) in it,
// which the main process maps through the normalisation and stores
// (book_page_map). An empty page keeps an empty range at its place.
//
// Pure apart from the pdf.js document it is handed: loaded as a <script> by
// index.html (window.PdfText) and by the notebook test page.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PdfText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Scanned PDFs: OCR reads at most this many pages (it is slow), and says so. */
  const OCR_MAX_PAGES = 300;

  /** Pages read between two yields to the event loop, so the window stays responsive. */
  const YIELD_EVERY = 10;

  /**
   * Pages joined into one text, and where each page is in it.
   *
   * @param {string[]} texts one per page
   * @param {string} sep between pages
   * @param {{trailing?: boolean, trim?: boolean}} [opts] trailing: `sep`
   *   after the last page too; trim: the whole text trimmed, the ranges
   *   moved with it
   * @returns {{text: string, ranges: Array<[number, number]>}}
   */
  function joinPages(texts, sep, opts) {
    const o = opts || {};
    const list = (texts || []).map(t => String(t == null ? '' : t));
    let text = '';
    const ranges = [];
    list.forEach((t, i) => {
      if (i > 0) text += sep;
      ranges.push([text.length, text.length + t.length]);
      text += t;
    });
    if (o.trailing && list.length) text += sep;
    if (!o.trim) return { text: text, ranges: ranges };
    const lead = text.length - text.replace(/^\s+/, '').length;
    const trimmed = text.trim();
    const clamp = n => Math.max(0, Math.min(trimmed.length, n - lead));
    return { text: trimmed, ranges: ranges.map(r => [clamp(r[0]), clamp(r[1])]) };
  }

  /**
   * Every page's text layer, joined as the importer always joined it.
   *
   * @param {object} pdf a pdf.js document
   * @param {{onPage?: function(number, number)}} [opts] called after each page
   * @returns {Promise<{text: string, ranges: Array<[number, number]>, pageCount: number}>}
   */
  async function extract(pdf, opts) {
    const o = opts || {};
    const total = pdf.numPages;
    const texts = [];
    for (let i = 1; i <= total; i++) {
      const page = await pdf.getPage(i);
      const tc = await page.getTextContent();
      texts.push(tc.items.map(x => x.str).join(' '));
      if (page.cleanup) { try { page.cleanup(); } catch (e) { /* only memory */ } }
      if (typeof o.onPage === 'function') o.onPage(i, total);
      if (i % YIELD_EVERY === 0) await new Promise(resolve => setTimeout(resolve, 0));
    }
    const joined = joinPages(texts, '\n', { trailing: true });
    return { text: joined.text, ranges: joined.ranges, pageCount: total };
  }

  /**
   * One page drawn on a white canvas at `scale` (OCR, and the PDF page view).
   * pdf.js renders onto a transparent canvas — Tesseract can take that for an
   * empty page — so it is painted white first.
   *
   * intent 'print': with the default 'display' intent pdf.js waits for
   * animation frames between steps, and a window that is behind another one
   * or minimized draws none (measured in Electron 28) — OCR stood still
   * whenever the owner looked at another window.
   */
  async function renderPage(pdf, pageNo, scale) {
    const page = await pdf.getPage(pageNo);
    const viewport = page.getViewport({ scale: scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: viewport, intent: 'print' }).promise;
    if (page.cleanup) { try { page.cleanup(); } catch (e) { /* only memory */ } }
    return canvas;
  }

  /** «300 / 512 بەت ئوقۇلدى». */
  function readLabel(read, total) {
    return read + ' / ' + total + ' بەت ئوقۇلدى';
  }

  /**
   * The line the add-book dialog puts in the description when OCR read
   * fewer pages than the PDF has; '' when it read them all.
   */
  function ocrNote(read, total) {
    if (!(total > read)) return '';
    return 'PDF دا ' + total + ' بەت بار؛ OCR بىلەن ئالدىنقى ' + read + ' بېتى ئوقۇلدى.';
  }

  return { OCR_MAX_PAGES: OCR_MAX_PAGES, joinPages: joinPages, extract: extract, renderPage: renderPage, readLabel: readLabel, ocrNote: ocrNote };
});
