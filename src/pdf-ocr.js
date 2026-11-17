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

  function failed(answer) {
    return !!answer && (!!answer.e || !answer.r || !answer.r.success);
  }

  // One turn of the event loop, so answers that have already come back are
  // seen before more pages are drawn. A message, not a timer: timers are
  // held back in a window behind another one, messages are not.
  function yieldTurn() {
    if (typeof MessageChannel === 'undefined') return new Promise((r) => setTimeout(r, 0));
    return new Promise((resolve) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => { ch.port1.close(); resolve(); };
      ch.port2.postMessage(0);
    });
  }

  /**
   * Read pages 1..maxPages.
   *
   * The main process reads K pages at once (one engine, K workers, 3.6.1
   * Phase 3). To keep every worker busy, up to `inFlight` requests of
   * `batch` (= K) pages are out at once, and the next pages are drawn while
   * the ones sent are being read — about 2×K page images held at most. The
   * answers are taken in the order the requests were sent, so the pages come
   * out in page order whatever order the workers finish in.
   *
   * @param {object} o
   * @param {number} o.maxPages
   * @param {number} o.batch                 pages per ocr-recognize request (K)
   * @param {number} [o.inFlight]            requests out at once (2)
   * @param {(page: number) => Promise<string>} o.render   a page as a PNG data URL
   * @param {(images: string[]) => Promise<{success: boolean, pages?: string[], error?: string, cancelled?: boolean}>} o.recognize
   * @param {() => boolean} [o.cancelled]
   * @param {() => void} [o.abort]           drop the pages still queued in main (a failure)
   * @param {(pagesRead: number) => void} [o.onRead]       after each answer, in order
   * @returns {Promise<{pages: string[], error: string|null, cancelled: boolean}>}
   *   `pages`: one entry per page read, in page order (an empty page too);
   *   `error`: why the run stopped early, if it failed — the pages before it
   *   are kept.
   */
  async function run(o) {
    const cancelled = typeof o.cancelled === 'function' ? o.cancelled : () => false;
    const batch = Math.max(1, o.batch || 1);
    const inFlight = Math.max(1, o.inFlight || 2);
    const pages = [];
    const flights = [];
    let next = 1;
    let error = null;
    let gap = false;        // an answer came back short: later pages would not follow on
    const stopSending = () => !!error || gap || cancelled() || flights.some(f => failed(f.settled));
    const fail = (e) => {
      if (!error) error = message(e);
      if (o.abort) { try { o.abort(); } catch (_) { /* best effort */ } }
    };

    for (;;) {
      // Draw and send while fewer than `inFlight` requests are out — never
      // after a failure has come back.
      while (flights.length < inFlight && next <= o.maxPages && !stopSending()) {
        if (flights.length) {
          await yieldTurn();
          if (stopSending()) break;
        }
        const end = Math.min(next + batch - 1, o.maxPages);
        const images = [];
        try {
          for (let p = next; p <= end && !cancelled(); p++) images.push(await o.render(p));
        } catch (e) {
          fail(e);
          break;
        }
        if (!images.length || cancelled()) break;
        next += images.length;
        const flight = { count: images.length, settled: null };
        flight.answer = Promise.resolve()
          .then(() => o.recognize(images))
          .then((r) => ({ r: r }), (e) => ({ e: e }))
          .then((a) => { flight.settled = a; return a; });
        flights.push(flight);
      }
      if (!flights.length) break;

      // The oldest request's answer, whatever finished first.
      const flight = flights.shift();
      const a = await flight.answer;
      if (error || gap) continue;                 // drained, not used
      if (failed(a)) { fail(a.e || (a.r && a.r.error)); continue; }
      const got = a.r.pages || [];
      for (const t of got) pages.push(t == null ? '' : String(t));
      if (o.onRead) o.onRead(pages.length);
      if (a.r.cancelled || got.length < flight.count) gap = true;
    }
    return { pages: pages, error: error, cancelled: !error && (gap || cancelled()) };
  }

  /** Time left, from the pages read so far; null until two pages are read. */
  function estimateLeft(startedAt, now, done, total) {
    if (!(done >= 2) || !(now > startedAt)) return null;
    return Math.max(0, total - done) * ((now - startedAt) / done);
  }

  /** «تەخمىنەن 3 مىنۇت قالدى», «1 مىنۇتتىن ئاز قالدى». */
  function leftText(ms) {
    if (ms < 60000) return '1 مىنۇتتىن ئاز قالدى';
    return 'تەخمىنەن ' + Math.round(ms / 60000) + ' مىنۇت قالدى';
  }

  /**
   * The progress line: «… ماتور قوزغىلىۋاتىدۇ…» until the first page, then
   * «… بەت 7 / 40», with the time left once there is an estimate.
   */
  function progressText(label, done, total, msLeft, note) {
    const head = label + ' OCR: ';
    if (!done) return head + 'ماتور قوزغىلىۋاتىدۇ…' + (note || '');
    let s = head + 'بەت ' + done + ' / ' + total + (note || '');
    if (msLeft != null && done < total) s += ' — ' + leftText(msLeft);
    return s;
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

  return {
    run: run, failureText: failureText, showFailure: showFailure,
    estimateLeft: estimateLeft, progressText: progressText
  };
});
