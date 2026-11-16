// ============================================================================
// A scanned PDF read by the offline OCR engine, page by page (3.6.1).
//
// The import dialog renders each page, sends the images to the main process
// (ocr-recognize) and collects one text per page, in page order — an empty
// page keeps its empty entry, because the page map needs one entry per page.
//
// When the engine failed, the dialog used to toast the error, then «OCR دىن
// تېكىست چىقمىدى», and close the OCR box: no way to try again, and in the
// installed 3.6.0 it never even got that far — the engine never answered.
// Now a failure ends the run with the pages read so far and the error, and the
// box keeps the error on screen with the engine buttons back (showFailure).
//
// Pure apart from the callbacks it is handed: loaded as a <script> by
// index.html (window.PdfOcr) and by the notebook test page.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PdfOcr = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function message(e) {
    return String((e && e.message) || e || '').trim() || 'نامەلۇم خاتالىق';
  }

  /**
   * Read pages 1..maxPages.
   *
   * @param {object} o
   * @param {number} o.maxPages
   * @param {number} o.batch                 pages per ocr-recognize request
   * @param {(page: number) => Promise<string>} o.render   a page as a PNG data URL
   * @param {(images: string[]) => Promise<{success: boolean, pages?: string[], error?: string, cancelled?: boolean}>} o.recognize
   * @param {() => boolean} [o.cancelled]
   * @param {(pagesBefore: number) => void} [o.onBatch]   before a request is sent
   * @param {(pagesRead: number) => void} [o.onRead]       after it answered
   * @returns {Promise<{pages: string[], error: string|null, cancelled: boolean}>}
   *   `pages`: one entry per page read, in page order; `error`: why the run
   *   stopped early, if it failed — the pages before it are kept.
   */
  async function run(o) {
    const cancelled = typeof o.cancelled === 'function' ? o.cancelled : () => false;
    const batch = Math.max(1, o.batch || 1);
    const pages = [];
    let error = null;
    let stopped = false;
    try {
      for (let start = 1; start <= o.maxPages && !cancelled(); start += batch) {
        const end = Math.min(start + batch - 1, o.maxPages);
        const images = [];
        for (let p = start; p <= end && !cancelled(); p++) images.push(await o.render(p));
        if (cancelled() || !images.length) break;
        if (o.onBatch) o.onBatch(start - 1);
        const r = await o.recognize(images);
        if (!r || !r.success) { error = message(r && r.error); break; }
        for (const t of (r.pages || [])) pages.push(t == null ? '' : String(t));
        if (o.onRead) o.onRead(pages.length);
        if (r.cancelled) { stopped = true; break; }
      }
    } catch (e) {
      error = message(e);
    }
    return { pages: pages, error: error, cancelled: stopped || cancelled() };
  }

  /**
   * What the OCR box says after a failure: the engine's own words, the pages
   * kept, and how to try again.
   */
  function failureText(error, read, total) {
    let said = message(error);
    if (!/^OCR /.test(said)) said = 'OCR خاتالىقى: ' + said;
    if (!/[.!?؟]$/.test(said)) said += '.';
    const parts = [said];
    if (read > 0) parts.push(read + ' / ' + total + ' بەت ئوقۇلدى؛ ئوقۇلغان بەتلەر ساقلاندى.');
    parts.push('قايتا سىناش ئۈچۈن «UKIJ OCR (تورسىز)» نى بېسىڭ.');
    return parts.join(' ');
  }

  /** The OCR box after a failure: the error stays on screen, the engines come back. */
  function showFailure(els, text) {
    if (els.progress) els.progress.style.display = 'none';
    if (els.buttons) els.buttons.style.display = 'flex';
    if (els.message) {
      els.message.textContent = text;
      els.message.style.display = 'block';
    }
  }

  return { run: run, failureText: failureText, showFailure: showFailure };
});
