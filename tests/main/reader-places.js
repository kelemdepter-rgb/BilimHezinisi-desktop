// ============================================================================
// K5, W16 — a bookmark or a note remembers the paragraph, not a percentage.
//
// The reader saved a bookmark as a percentage of the scroll height of the page
// on screen: the same number meant a different place on every page, in every
// window size, and after any change of font. A place is now a character offset
// into the book's whole text. src/reader-places.js turns an offset into a
// page and a paragraph, and the reader renders each paragraph with its offset
// (data-off), so the two always agree.
// ============================================================================

'use strict';

const path = require('path');

/** The reader's pagination exactly as openReader had it, to prove nothing moved. */
function oldPaginate(content, perPage) {
  if (content.length <= perPage) return [content];
  const pages = [];
  let currentPage = '';
  for (const para of content.split('\n')) {
    if (currentPage.length + para.length + 1 > perPage && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = para;
    } else {
      currentPage += (currentPage ? '\n' : '') + para;
    }
  }
  if (currentPage) pages.push(currentPage);
  return pages;
}

/** A book of `n` paragraphs, some with line breaks inside, some blank lines doubled. */
function book(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    let p = 'ئابزاس ' + i + ' — ' + 'سۆز '.repeat(20 + (i * 7) % 60).trim();
    if (i % 5 === 0) p += '\nئىككىنچى قۇر ' + i;
    out.push(p);
    if (i % 9 === 0) out.push('');   // a blank line more
  }
  return '\n' + out.join('\n\n') + '\n';
}

module.exports = function (suite, assert, ctx) {
  function places() { return require(path.join(ctx.root, 'src', 'reader-places.js')); }

  suite.test('reader-pages-keep-their-place', function () {
    const RP = places();
    const content = book(400);
    const r = RP.paginate(content, RP.PER_PAGE);
    assert.deepEqual(r.pages, oldPaginate(content, RP.PER_PAGE), 'the pages are not the ones readers already have');
    assert.ok(r.pages.length > 10, 'the fixture did not span several pages');
    assert.equal(r.starts.length, r.pages.length);
    r.pages.forEach(function (page, k) {
      assert.equal(content.slice(r.starts[k], r.starts[k] + page.length), page,
        'page ' + (k + 1) + ' does not start where its offset says');
    });

    const short = RP.paginate('قىسقا كىتاب', RP.PER_PAGE);
    assert.deepEqual(short, { pages: ['قىسقا كىتاب'], starts: [0] });
  });

  suite.test('reader-offset-to-page-and-paragraph', function () {
    const RP = places();
    const content = book(400);
    const r = RP.paginate(content, RP.PER_PAGE);
    let seen = 0;
    r.pages.forEach(function (page, k) {
      const paras = RP.paragraphs(page, r.starts[k]);
      paras.forEach(function (p, i) {
        seen++;
        assert.equal(content.slice(p.off, p.off + p.text.length), p.text,
          'paragraph ' + i + ' of page ' + (k + 1) + ' is not where its offset says');
        assert.equal(RP.pageOf(r.starts, p.off), k + 1, 'an offset maps to the wrong page');
        const offs = paras.map(function (q) { return q.off; });
        assert.equal(RP.paragraphAt(offs, p.off), i, 'an offset maps to the wrong paragraph');
        // Anywhere inside the paragraph is still that paragraph.
        assert.equal(RP.paragraphAt(offs, p.off + Math.floor(p.text.length / 2)), i);
      });
    });
    assert.ok(seen >= 400, 'not every paragraph was checked (' + seen + ')');

    // What textToParagraphs renders: split at blank lines, trimmed, empty ones dropped.
    const page = '\n  بىرىنچى\nقۇر\n\n\n\nئىككىنچى  \n\n   \n\nئۈچىنچى';
    assert.deepEqual(RP.paragraphs(page, 100).map(function (p) { return p.text; }),
      page.split(/\n{2,}/).map(function (s) { return s.trim(); }).filter(Boolean));
    assert.deepEqual(RP.paragraphs(page, 100).map(function (p) { return p.off; }), [103, 118, 135]);

    // Out of range: the first page, the last page.
    assert.equal(RP.pageOf(r.starts, -5), 1);
    assert.equal(RP.pageOf(r.starts, content.length + 50), r.pages.length);
    assert.equal(RP.paragraphAt([10, 20], 3), 0);
  });
};
