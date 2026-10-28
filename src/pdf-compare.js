// ============================================================================
// «ئەسلى بەت بىلەن سېلىشتۇرۇش» — a PDF page beside its text (3.6 Phase 7).
//
// Two halves in one file:
//
//   - where a PDF page lies in a book's stored text, for a book that has no
//     page map (imported before 3.6): `alignPages` finds every page of a
//     text-layer PDF in order; `placeByTrigrams` finds one OCR-read page of a
//     scanned PDF near its estimate; `estimateRange` is that estimate. Pure
//     functions on text already folded into letters — main.js runs them
//     (require('./src/pdf-compare')), the tests too;
//
//   - the view (`createView`), in the renderer: the page's text on the
//     right, editable when the page is placed; the page drawn by pdf.js on
//     the left, one page at a time, zoom in/out/fit width; navigation by PDF
//     page number. index.html hands it everything that reaches the main
//     process or the rest of the app.
//
// Matching ignores spacing (whitespace, tatweel, zero-width characters): an
// old import, a reader's page fix or OCR may have spaced a page differently,
// and the letters are what identify it.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PdfCompare = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Spacing that matching ignores. */
  function ignored(code) {
    return code === 0x20 || code === 0x0A || code === 0x0D || code === 0x09 || code === 0x0B || code === 0x0C ||
      code === 0xA0 || code === 0x0640 || (code >= 0x200B && code <= 0x200F) || code === 0x2060 ||
      code === 0xFEFF || code === 0x202F || (code >= 0x2000 && code <= 0x200A) || code === 0x3000;
  }

  /** A text without its spacing, and where each of its characters stands in the text. */
  function skeleton(text) {
    const t = String(text || '');
    const at = new Int32Array(t.length);
    let out = '';
    let n = 0;
    let run = 0;
    for (let i = 0; i < t.length; i++) {
      if (ignored(t.charCodeAt(i))) {
        if (i > run) out += t.slice(run, i);
        run = i + 1;
        continue;
      }
      at[n++] = i;
    }
    if (t.length > run) out += t.slice(run);
    return { s: out, at: at.subarray(0, n) };
  }

  /** The range in the text of skeleton characters [a, b). */
  function toText(sk, a, b) {
    return { start: sk.at[a], end: sk.at[b - 1] + 1 };
  }

  /**
   * Every page of a text-layer PDF, found in order in the book's text.
   *
   * A page is found whole when its letters stand in the text as they are;
   * otherwise by its first and last letters (a word fixed since, a page
   * joined differently), when the stretch between them is of a likely length.
   * A page that is not found is listed, and the next one is looked for from
   * where the last found page ended. An empty page takes an empty range where
   * the next page would begin.
   *
   * @param {string} content the stored text (letters)
   * @param {string[]} pages each page's text layer, folded the same way
   * @returns {{placed: Array<{page: number, start: number, end: number}>, missing: number[]}}
   */
  function alignPages(content, pages) {
    const text = String(content || '');
    const sk = skeleton(text);
    const placed = [];
    const missing = [];
    let cur = 0;        // in the skeleton: where the next page may begin
    let textAt = 0;     // in the text: the same place
    (pages || []).forEach(function (pageText, i) {
      const ps = skeleton(pageText);
      const len = ps.s.length;
      if (!len) {
        let at = textAt;
        if (text.charCodeAt(at) === 0x0A) at++;
        placed.push({ page: i + 1, start: Math.min(at, text.length), end: Math.min(at, text.length) });
        return;
      }
      const reach = Math.max(2000, 3 * len);
      let found = null;
      const a = sk.s.indexOf(ps.s, cur);
      if (a !== -1 && (a - cur <= reach || len >= 40)) found = [a, a + len];
      if (!found) found = byEnds(sk.s, ps.s, cur, reach, len);
      if (!found) { missing.push(i + 1); return; }
      const r = toText(sk, found[0], found[1]);
      placed.push({ page: i + 1, start: r.start, end: r.end });
      cur = found[1];
      textAt = r.end;
    });
    return { placed: placed, missing: missing };
  }

  /**
   * A page by its first and last letters (up to 24 of each, spacing
   * ignored — some PDFs space every glyph, so words cannot be counted on):
   * [a, b) in the skeleton, or null.
   */
  function byEnds(s, ps, cur, reach, len) {
    const k = Math.min(24, Math.floor(len / 3));
    if (k < 8) return null;
    const head = ps.slice(0, k);
    const tail = ps.slice(len - k);
    const a = s.indexOf(head, cur);
    if (a === -1 || a - cur > reach) return null;
    let t = s.indexOf(tail, a);
    while (t !== -1 && t <= a + 2 * len) {
      const b = t + tail.length;
      const span = b - a;
      if (span >= 0.5 * len && span <= 2 * len) return [a, b];
      t = s.indexOf(tail, t + 1);
    }
    return null;
  }

  /** The nearest line end to `at` within `slack`, preferring a blank line; `at` when there is none. */
  function snap(text, at, slack, lo, hi) {
    let best = -1;
    let bestScore = Infinity;
    const from = Math.max(lo, at - slack);
    const to = Math.min(hi, at + slack);
    for (let i = from; i <= to; i++) {
      // A page begins after a line end (or at the start of the text).
      const before = i === 0 ? 0x0A : text.charCodeAt(i - 1);
      if (before !== 0x0A) continue;
      const blank = i >= 2 && text.charCodeAt(i - 2) === 0x0A;
      const score = Math.abs(i - at) - (blank ? slack / 2 : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    return best === -1 ? at : best;
  }

  /** Where a page ending at `at` stops: before the line end(s) that follow it. */
  function trimEnd(text, at, lo) {
    let e = at;
    while (e > lo && (text.charCodeAt(e - 1) === 0x0A || text.charCodeAt(e - 1) === 0x20)) e--;
    return e;
  }

  /**
   * Where page `pageNo` of `pageCount` probably lies: proportionally between
   * the nearest placed pages before and after it (or the ends of the text),
   * snapped to line ends.
   *
   * @param {Array<{page_no: number, start: number, end: number}>} map the placed pages, in order
   */
  function estimateRange(text, pageNo, pageCount, map) {
    const t = String(text || '');
    let lo = 0, loPage = 0, hi = t.length, hiPage = pageCount + 1;
    (map || []).forEach(function (r) {
      if (r.page_no < pageNo && r.page_no >= loPage) { loPage = r.page_no; lo = r.end; }
      if (r.page_no > pageNo && r.page_no < hiPage) { hiPage = r.page_no; hi = r.start; }
    });
    const span = Math.max(0, hi - lo);
    const k = Math.max(1, hiPage - loPage - 1);
    const i = pageNo - loPage - 1;
    const rawStart = Math.round(lo + span * i / k);
    const rawEnd = Math.round(lo + span * (i + 1) / k);
    const slack = Math.max(40, Math.round(span / k / 4));
    const start = snap(t, rawStart, slack, lo, hi);
    let end = i + 1 >= k ? hi : snap(t, rawEnd, slack, start, hi);
    end = Math.max(start, trimEnd(t, end, start));
    return { start: start, end: end, lo: lo, hi: hi };
  }

  function trigrams(s) {
    const set = new Set();
    for (let i = 0; i + 3 <= s.length; i++) set.add(s.substr(i, 3));
    return set;
  }

  /**
   * One page read by OCR, found in the text between `lo` and `hi`: the
   * stretch of its length whose letter trigrams overlap it most, its ends
   * snapped to line ends. Null when nothing overlaps well enough — OCR of
   * another page, or of an image.
   *
   * @returns {{start: number, end: number, score: number}|null}
   */
  function placeByTrigrams(text, ocrText, lo, hi, minScore) {
    const t = String(text || '');
    const from = Math.max(0, lo | 0);
    const to = Math.min(t.length, hi == null ? t.length : hi);
    const os = skeleton(ocrText).s;
    const L = os.length;
    if (L < 30 || to - from < 10) return null;
    const want = trigrams(os);
    const sk = skeleton(t.slice(from, to));
    const s = sk.s;
    if (s.length < 10) return null;
    const win = Math.min(L, s.length);
    const step = Math.max(1, Math.floor(win / 25));
    let best = -1, bestScore = -1;
    const scoreAt = function (a) {
      let hit = 0;
      const seen = new Set();
      for (let i = a; i + 3 <= a + win; i++) {
        const g = s.substr(i, 3);
        if (want.has(g) && !seen.has(g)) { seen.add(g); hit++; }
      }
      return hit / want.size;
    };
    for (let a = 0; a + win <= s.length; a += step) {
      const sc = scoreAt(a);
      if (sc > bestScore) { bestScore = sc; best = a; }
    }
    if (best === -1) { best = 0; bestScore = scoreAt(0); }
    // Finer, around the best coarse place.
    for (let a = Math.max(0, best - step); a <= Math.min(s.length - win, best + step); a++) {
      const sc = scoreAt(a);
      if (sc > bestScore) { bestScore = sc; best = a; }
    }
    if (bestScore < (minScore == null ? 0.35 : minScore)) return null;
    const r = toText(sk, best, best + win);
    const slack = Math.max(40, Math.round((r.end - r.start) * 0.08));
    const start = snap(t, from + r.start, slack, from, to);
    let end = snap(t, from + r.end, slack, start, to);
    end = Math.max(start, trimEnd(t, end, start));
    return { start: start, end: end, score: Math.round(bestScore * 1000) / 1000 };
  }

  // ==========================================================================
  // The view (renderer only).
  // ==========================================================================

  /**
   * @param {object} o
   *   host            element the view fills
   *   pdfjs           window.pdfjsLib
   *   renderPage      PdfText.renderPage(pdf, pageNo, scale) → canvas
   *   api             { status(), locate(), bytes(from) → { total, data } (a piece),
   *                     info(pageNo, pageCount),
   *                     pageAt(offset, pageCount), save(pageNo, text),
   *                     undo(pageNo), align(pageTexts),
   *                     place(pageNo, pageCount, ocrText) } — main, per book
   *   ocrPage(canvas) → Promise<string>   offline OCR of a drawn page
   *   aiCleanup(text) → Promise<string|null>, aiAvailable() → Promise<boolean>
   *   textFont, textSize                  the reader's font
   *   toast(msg, type), onChanged(), onClose(changed)
   *   title           the book's title
   */
  function createView(o) {
    const host = o.host;
    const st = {
      pdf: null, pageCount: 0, page: 1, scale: null, fit: true,
      info: null, dirty: false, changed: false, preview: null, busy: false,
      renderSeq: 0, pending: null, closed: false
    };

    host.innerHTML =
      '<div class="pcv-head">' +
        '<button type="button" class="hbtn pcv-back">→ قايتىش</button>' +
        '<div class="pcv-title"></div>' +
        '<div class="pcv-nav">' +
          '<button type="button" class="hbtn pcv-prev" title="ئالدىنقى بەت">→</button>' +
          '<input type="number" class="pcv-pgin" min="1" value="1"><span class="pcv-pgn">/ 0</span>' +
          '<button type="button" class="hbtn pcv-next" title="كېيىنكى بەت">←</button>' +
        '</div>' +
        '<div class="pcv-zoom">' +
          '<button type="button" class="hbtn pcv-zout" title="كىچىكلىتىش">−</button>' +
          '<button type="button" class="hbtn pcv-fit" title="كەڭلىككە توغرىلاش">كەڭلىككە</button>' +
          '<button type="button" class="hbtn pcv-zin" title="چوڭايتىش">+</button>' +
        '</div>' +
      '</div>' +
      '<div class="pcv-banner" style="display:none"></div>' +
      '<div class="pcv-ask" style="display:none"></div>' +
      '<div class="pcv-body">' +
        '<div class="pcv-textside">' +
          '<div class="pcv-state"></div>' +
          '<textarea class="pcv-text" dir="rtl" spellcheck="false"></textarea>' +
          '<div class="pcv-acts">' +
            '<button type="button" class="hbtn p pcv-save" disabled>ساقلاش</button>' +
            '<button type="button" class="hbtn pcv-undo" disabled>ئەسلىگە قايتۇرۇش</button>' +
            '<button type="button" class="hbtn pcv-place" style="display:none">بۇ بەتنى تېكىستتىن تېپىش</button>' +
            '<button type="button" class="hbtn pcv-ocr">بۇ بەتنى قايتا OCR قىلىش (تورسىز)</button>' +
            '<button type="button" class="hbtn pcv-ai" style="display:none">AI بىلەن تۈزىتىش (تور)</button>' +
          '</div>' +
          '<div class="pcv-preview" style="display:none">' +
            '<div class="pcv-preview-head"></div>' +
            '<div class="pcv-preview-text" dir="rtl"></div>' +
            '<div class="pcv-preview-acts">' +
              '<button type="button" class="hbtn p pcv-apply">قوللىنىش</button>' +
              '<button type="button" class="hbtn pcv-drop">ۋاز كېچىش</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="pcv-pageside"><div class="pcv-canvas-wrap"><div class="pcv-msg"></div></div></div>' +
      '</div>';

    const $ = function (sel) { return host.querySelector(sel); };
    const el = {
      title: $('.pcv-title'), pgin: $('.pcv-pgin'), pgn: $('.pcv-pgn'), prev: $('.pcv-prev'), next: $('.pcv-next'),
      banner: $('.pcv-banner'), ask: $('.pcv-ask'), state: $('.pcv-state'), text: $('.pcv-text'),
      save: $('.pcv-save'), undo: $('.pcv-undo'), place: $('.pcv-place'), ocr: $('.pcv-ocr'), ai: $('.pcv-ai'),
      preview: $('.pcv-preview'), previewHead: $('.pcv-preview-head'), previewText: $('.pcv-preview-text'),
      wrap: $('.pcv-canvas-wrap'), side: $('.pcv-pageside'), msg: $('.pcv-msg')
    };
    el.title.textContent = o.title || '';
    el.text.style.fontFamily = o.textFont || '';
    if (o.textSize) el.text.style.fontSize = o.textSize + 'px';

    function message(text) {
      el.msg.textContent = text || '';
      el.msg.style.display = text ? '' : 'none';
    }

    // --- the PDF ------------------------------------------------------------
    async function loadPdf() {
      message('PDF ئوقۇلىۋاتىدۇ...');
      // In pieces, so a large PDF never holds the window while it arrives.
      const r = await o.api.bytes(0);
      if (!r || !r.success || !r.data) { message(''); showBanner('moved'); return false; }
      const total = r.total || r.data.byteLength;
      const data = new Uint8Array(total);
      data.set(r.data, 0);
      let at = r.data.byteLength;
      while (at < total) {
        const next = await o.api.bytes(at);
        if (st.closed) return false;
        if (!next || !next.success || !next.data || !next.data.byteLength) { message('PDF ئوقۇغىلى بولمىدى'); return false; }
        data.set(next.data, at);
        at += next.data.byteLength;
        message('PDF ئوقۇلىۋاتىدۇ: ' + Math.round((at / total) * 100) + '%');
      }
      try {
        st.pdf = await o.pdfjs.getDocument({ data: data, cMapUrl: '../assets/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '../assets/pdfjs/standard_fonts/' }).promise;
      } catch (e) {
        message('PDF ئوقۇغىلى بولمىدى');
        return false;
      }
      st.pageCount = st.pdf.numPages;
      el.pgin.max = String(st.pageCount);
      el.pgn.textContent = '/ ' + st.pageCount;
      message('');
      return true;
    }

    function showBanner(status) {
      el.banner.style.display = '';
      el.banner.innerHTML = '';
      const t = document.createElement('span');
      t.textContent = status === 'missing'
        ? 'ئەسلى PDF تېپىلمىدى — بۇ كىتاب PDF نىڭ ئورنى خاتىرىلىنىشتىن بۇرۇن ئەكىرىلگەن.'
        : 'ئەسلى PDF تېپىلمىدى — ئۇ يۆتكەلگەن ياكى ئۆچۈرۈلگەن بولۇشى مۇمكىن.';
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'hbtn p';
      b.textContent = 'PDF نى كۆرسىتىپ بېرىش';
      b.addEventListener('click', locate);
      el.banner.appendChild(t);
      el.banner.appendChild(b);
      el.text.value = '';
      el.text.readOnly = true;
      setState('');
    }

    async function locate() {
      const r = await o.api.locate();
      if (!r || !r.success) { o.toast((r && r.error) || 'PDF نى ئوقۇغىلى بولمىدى', 'e'); return; }
      if (!r.ok) return;
      el.banner.style.display = 'none';
      await start();
    }

    // --- one page -----------------------------------------------------------
    async function drawPage() {
      if (!st.pdf) return;
      const seq = ++st.renderSeq;
      const page = await st.pdf.getPage(st.page);
      const base = page.getViewport({ scale: 1 });
      if (st.fit || !st.scale) {
        const room = Math.max(200, el.side.clientWidth - 32);
        st.scale = Math.max(0.25, Math.min(5, room / base.width));
      }
      const dpr = window.devicePixelRatio || 1;
      const canvas = await o.renderPage(st.pdf, st.page, st.scale * dpr);
      if (seq !== st.renderSeq || st.closed) { canvas.width = canvas.height = 0; return; }
      canvas.className = 'pcv-canvas';
      canvas.style.width = Math.round(canvas.width / dpr) + 'px';
      canvas.style.height = Math.round(canvas.height / dpr) + 'px';
      const old = el.wrap.querySelector('canvas');
      if (old) { old.width = old.height = 0; old.remove(); }
      el.wrap.appendChild(canvas);
    }

    function setState(text, kind) {
      el.state.textContent = text || '';
      el.state.className = 'pcv-state' + (kind ? ' ' + kind : '');
    }

    async function showText() {
      const info = await o.api.info(st.page, st.pageCount);
      if (st.closed) return;
      st.info = info || { placed: false, text: '' };
      st.dirty = false;
      el.text.value = st.info.text || '';
      el.text.readOnly = !st.info.placed;
      el.save.disabled = true;
      el.undo.disabled = !(st.info.placed && st.info.edits > 0);
      el.place.style.display = st.info.placed ? 'none' : '';
      if (!st.info.placed && st.info.estimated) {
        setState('تەخمىنىي — بۇ بەتنىڭ كىتابتىكى ئورنى تېخى تېپىلمىدى؛ تۈزىتىشتىن بۇرۇن «بۇ بەتنى تېكىستتىن تېپىش» نى بېسىڭ.', 'guess');
      } else if (!st.info.placed) {
        setState('بۇ بەتنىڭ تېكىستى كىتابتا تېپىلمىدى.', 'guess');
      } else {
        setState(st.info.edits > 0 ? 'بۇ بەت تۈزىتىلگەن (' + st.info.edits + ' قېتىم)' : '', st.info.edits > 0 ? 'edited' : '');
      }
      hidePreview();
    }

    async function go(n) {
      const p = Math.max(1, Math.min(st.pageCount || 1, Math.round(Number(n)) || 1));
      if (st.dirty && !(await askLeave())) { el.pgin.value = String(st.page); return; }
      st.page = p;
      el.pgin.value = String(p);
      el.prev.disabled = p <= 1;
      el.next.disabled = p >= st.pageCount;
      await Promise.all([drawPage(), showText()]);
    }

    // Unsaved text: asked inline, never with confirm().
    function askLeave() {
      return new Promise(function (resolve) {
        el.ask.style.display = '';
        el.ask.innerHTML = '';
        const t = document.createElement('span');
        t.textContent = 'بۇ بەتتىكى ئۆزگىرىش ساقلانمىدى.';
        const mk = function (label, cls, fn) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'hbtn' + (cls ? ' ' + cls : ''); b.textContent = label;
          b.addEventListener('click', fn);
          return b;
        };
        const done = function (v) { el.ask.style.display = 'none'; el.ask.innerHTML = ''; resolve(v); };
        el.ask.appendChild(t);
        el.ask.appendChild(mk('ساقلاپ ئۆتۈش', 'p', async function () { done(await save()); }));
        el.ask.appendChild(mk('ساقلىماي ئۆتۈش', '', function () { st.dirty = false; done(true); }));
        el.ask.appendChild(mk('قېلىش', '', function () { done(false); }));
      });
    }

    // --- saving and undoing ---------------------------------------------------
    async function save() {
      if (!st.info || !st.info.placed || st.busy) return false;
      st.busy = true;
      try {
        const r = await o.api.save(st.page, el.text.value);
        if (!r || !r.success || !r.ok) {
          o.toast((r && r.error) || 'ساقلىغىلى بولمىدى', 'e');
          return false;
        }
        if (!r.unchanged) { st.changed = true; o.toast('بەت ساقلاندى', 's'); if (o.onChanged) await o.onChanged(); }
        await showText();
        return true;
      } finally {
        st.busy = false;
      }
    }

    async function undo() {
      if (!st.info || !st.info.placed || st.busy) return;
      if (st.dirty && !(await askLeave())) return;
      st.busy = true;
      try {
        const r = await o.api.undo(st.page);
        if (!r || !r.success || !r.ok) {
          o.toast(r && r.reason === 'changed' ? 'بۇ بەتنىڭ تېكىستى ئارىدا ئۆزگەرتىلگەن — ئەسلىگە قايتۇرغىلى بولمايدۇ' : ((r && r.error) || 'ئەسلىگە قايتۇرغىلى بولمىدى'), 'e');
          return;
        }
        st.changed = true;
        o.toast('ئەسلىگە قايتۇرۇلدى', 's');
        if (o.onChanged) await o.onChanged();
        await showText();
      } finally {
        st.busy = false;
      }
    }

    // --- help with the correction: a preview, applied only on a click --------
    function showPreview(head, text) {
      st.preview = text;
      el.preview.style.display = '';
      el.previewHead.textContent = head;
      el.previewText.textContent = text;
    }
    function hidePreview() {
      st.preview = null;
      el.preview.style.display = 'none';
      el.previewText.textContent = '';
    }

    async function ocrThisPage() {
      if (!st.pdf || st.busy) return null;
      st.busy = true;
      const label = el.ocr.textContent;
      el.ocr.disabled = true;
      el.ocr.textContent = 'OCR ئوقۇۋاتىدۇ...';
      try {
        const canvas = await o.renderPage(st.pdf, st.page, 3.2);
        const text = await o.ocrPage(canvas);
        canvas.width = canvas.height = 0;
        return text;
      } catch (e) {
        o.toast('OCR مەغلۇپ بولدى: ' + ((e && e.message) || ''), 'e');
        return null;
      } finally {
        el.ocr.disabled = false;
        el.ocr.textContent = label;
        st.busy = false;
      }
    }

    async function reOcr() {
      const text = await ocrThisPage();
      if (text == null || st.closed) return;
      if (!text.trim()) { o.toast('OCR بۇ بەتتىن تېكىست تاپالمىدى', 'i'); return; }
      showPreview('OCR (تورسىز) — يېڭى ئوقۇلغان تېكىست:', text);
    }

    async function aiFix() {
      if (st.busy) return;
      const base = el.text.value;
      if (!base.trim()) { o.toast('تۈزىتىدىغان تېكىست يوق', 'e'); return; }
      st.busy = true;
      el.ai.disabled = true;
      const label = el.ai.textContent;
      el.ai.textContent = 'AI تۈزىتىۋاتىدۇ...';
      try {
        const out = await o.aiCleanup(base);
        if (out != null && !st.closed) showPreview('AI (تور) — تۈزىتىلگەن نۇسخا:', out);
      } finally {
        el.ai.disabled = false;
        el.ai.textContent = label;
        st.busy = false;
      }
    }

    function applyPreview() {
      if (st.preview == null || !st.info || !st.info.placed) return;
      el.text.value = st.preview;
      hidePreview();
      markDirty();
      el.text.focus();
    }

    // A scanned book's page: read it, then find it in the text near its estimate.
    async function placeThisPage() {
      const text = await ocrThisPage();
      if (text == null || st.closed) return;
      const r = await o.api.place(st.page, st.pageCount, text);
      if (!r || !r.success || !r.ok) {
        o.toast('بۇ بەتنى كىتابنىڭ تېكىستىدىن تاپالمىدى', 'e');
        return;
      }
      o.toast('بەتنىڭ ئورنى تېپىلدى', 's');
      await showText();
    }

    function markDirty() {
      if (!st.info || !st.info.placed) return;
      st.dirty = el.text.value !== (st.info.text || '');
      el.save.disabled = !st.dirty;
    }

    // --- a book without a page map --------------------------------------------
    async function alignIfNeeded() {
      const first = await o.api.info(1, st.pageCount);
      if (!first || first.mapped > 0) return;
      message('PDF نىڭ تېكىستى ئوقۇلىۋاتىدۇ...');
      const texts = [];
      let chars = 0;
      for (let i = 1; i <= st.pageCount; i++) {
        const page = await st.pdf.getPage(i);
        const tc = await page.getTextContent();
        const t = tc.items.map(function (x) { return x.str; }).join(' ');
        texts.push(t);
        chars += t.trim().length;
        if (page.cleanup) { try { page.cleanup(); } catch (_) {} }
        if (i % 10 === 0) {
          message('PDF نىڭ تېكىستى ئوقۇلىۋاتىدۇ: ' + i + ' / ' + st.pageCount);
          await new Promise(function (r) { setTimeout(r, 0); });
        }
        if (st.closed) return;
      }
      message('');
      // A scanned PDF has (almost) no text layer: its pages are placed one by one.
      if (chars < 20 * st.pageCount) return;
      const r = await o.api.align(texts);
      if (!r || !r.success) return;
      const n = r.placed || 0;
      o.toast(r.missing && r.missing.length
        ? n + ' بەتنىڭ ئورنى تېپىلدى؛ ' + r.missing.length + ' بەت كىتابنىڭ تېكىستىدىن تېپىلمىدى'
        : 'ھەممە ' + n + ' بەتنىڭ ئورنى تېپىلدى', r.missing && r.missing.length ? 'i' : 's');
    }

    async function start() {
      const s = await o.api.status();
      if (!s || !s.success) { message('PDF نىڭ ئورنىنى ئوقۇغىلى بولمىدى'); return; }
      if (s.status !== 'found') { showBanner(s.status); return; }
      if (!(await loadPdf())) return;
      await alignIfNeeded();
      if (st.closed) return;
      let first = 1;
      if (typeof st.startOffset === 'number' && o.api.pageAt) {
        const r = await o.api.pageAt(st.startOffset, st.pageCount);
        if (r && r.success && r.page) first = r.page;
      }
      await go(first);
    }

    async function close() {
      if (st.dirty && !(await askLeave())) return;
      st.closed = true;
      const old = el.wrap.querySelector('canvas');
      if (old) { old.width = old.height = 0; }
      if (st.pdf) { try { st.pdf.destroy(); } catch (_) {} st.pdf = null; }
      host.innerHTML = '';
      if (o.onClose) o.onClose(st.changed);
    }

    // --- controls -------------------------------------------------------------
    $('.pcv-back').addEventListener('click', close);
    el.prev.addEventListener('click', function () { go(st.page - 1); });
    el.next.addEventListener('click', function () { go(st.page + 1); });
    el.pgin.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(el.pgin.value); });
    $('.pcv-zin').addEventListener('click', function () { st.fit = false; st.scale = Math.min(5, (st.scale || 1) * 1.25); drawPage(); });
    $('.pcv-zout').addEventListener('click', function () { st.fit = false; st.scale = Math.max(0.25, (st.scale || 1) / 1.25); drawPage(); });
    $('.pcv-fit').addEventListener('click', function () { st.fit = true; drawPage(); });
    el.text.addEventListener('input', markDirty);
    el.save.addEventListener('click', save);
    el.undo.addEventListener('click', undo);
    el.place.addEventListener('click', placeThisPage);
    el.ocr.addEventListener('click', reOcr);
    el.ai.addEventListener('click', aiFix);
    $('.pcv-apply').addEventListener('click', applyPreview);
    $('.pcv-drop').addEventListener('click', hidePreview);
    message('');
    if (typeof o.aiAvailable === 'function') {
      Promise.resolve(o.aiAvailable()).then(function (ok) { el.ai.style.display = ok ? '' : 'none'; }).catch(function () {});
    }

    return {
      /** Open at the PDF page holding `startOffset`, a place in the book's text (page 1 without one). */
      open: function (startOffset) { st.startOffset = typeof startOffset === 'number' ? startOffset : null; return start(); },
      close: close,
      go: go,
      save: save,
      undo: undo,
      state: function () {
        return { page: st.page, pageCount: st.pageCount, dirty: st.dirty, changed: st.changed, placed: !!(st.info && st.info.placed), scale: st.scale };
      },
      elements: function () { return el; }
    };
  }

  return {
    skeleton: skeleton,
    alignPages: alignPages,
    estimateRange: estimateRange,
    placeByTrigrams: placeByTrigrams,
    createView: createView
  };
});
