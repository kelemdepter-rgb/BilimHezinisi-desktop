// ============================================================================
// Where a place in a book is: a character offset into its whole text (K5, W16).
//
// The reader used to save a bookmark, a note and the reading position as a
// percentage of the scroll height of the page on screen. The same number meant
// a different place on every page, in every window size and after any change
// of font, so «خەتكۈچ» went somewhere else every time. A place is now the
// offset where its paragraph begins, and this module is the one map between
// that offset and what the reader draws: which page holds it, and which of that
// page's paragraphs. The reader renders each paragraph with its offset
// (data-off) through `paragraphs`, so the drawing and the map cannot disagree.
//
// Pure functions, no DOM: loaded as a <script> by index.html (window.ReaderPlaces)
// and required by the main-process tests (tests/main/reader-places.js).
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ReaderPlaces = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Characters per page — the reader's own constant, unchanged since pages came in. */
  const PER_PAGE = 3000;

  /**
   * The reader's pages, exactly as it has always cut them (paragraph by
   * paragraph, a page full at PER_PAGE), and where each begins in the book.
   *
   * The pages must be the ones readers already have: a reading position saved
   * as «page 12» has to stay page 12. The only addition is `starts`. A blank
   * line that would begin a page is not part of it (it never was), so a page
   * starts at its first character as drawn.
   */
  function paginate(content, perPage) {
    const text = String(content == null ? '' : content);
    const limit = perPage || PER_PAGE;
    if (text.length <= limit) return { pages: [text], starts: [0] };
    const pages = [];
    const starts = [];
    let current = '';
    let start = 0;
    let at = 0;
    for (const para of text.split('\n')) {
      if (current.length + para.length + 1 > limit && current.length > 0) {
        pages.push(current);
        starts.push(start);
        current = para;
        start = at;
      } else {
        if (!current) start = at;
        current += (current ? '\n' : '') + para;
      }
      at += para.length + 1;
    }
    if (current) {
      pages.push(current);
      starts.push(start);
    }
    return { pages: pages, starts: starts };
  }

  /**
   * The paragraphs the reader draws for a page: split at blank lines, trimmed,
   * empty ones left out — and where each begins in the book, `base` being
   * where the page itself begins.
   */
  function paragraphs(text, base) {
    const source = String(text == null ? '' : text);
    const offset = base || 0;
    const out = [];
    const push = function (from, to) {
      const raw = source.slice(from, to);
      const trimmed = raw.trim();
      if (!trimmed) return;
      out.push({ text: trimmed, off: offset + from + (raw.length - raw.trimStart().length) });
    };
    const blank = /\n{2,}/g;
    let last = 0;
    let m;
    while ((m = blank.exec(source)) !== null) {
      push(last, m.index);
      last = m.index + m[0].length;
    }
    push(last, source.length);
    return out;
  }

  /** The last index whose value is at or before `offset` (0 when none is). */
  function lastAtOrBefore(sorted, offset) {
    let low = 0;
    let high = sorted.length - 1;
    let found = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (sorted[mid] <= offset) { found = mid; low = mid + 1; }
      else high = mid - 1;
    }
    return found;
  }

  /** The page (1-based) that holds `offset`. */
  function pageOf(starts, offset) {
    if (!starts || !starts.length) return 1;
    return lastAtOrBefore(starts, offset) + 1;
  }

  /** Which of a page's paragraphs (by their offsets, in order) holds `offset`. */
  function paragraphAt(offsets, offset) {
    if (!offsets || !offsets.length) return 0;
    return lastAtOrBefore(offsets, offset);
  }

  /** Is this a place — a whole, non-negative number? Old rows carry none. */
  function isPlace(value) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  }

  return { PER_PAGE: PER_PAGE, paginate: paginate, paragraphs: paragraphs, pageOf: pageOf, paragraphAt: paragraphAt, isPlace: isPlace };
});
