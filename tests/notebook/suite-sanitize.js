// ============================================================================
// The sanitizer: K6 — its settings are ignored.
//
// sanitize.js passes USE_PROFILES to DOMPurify, and DOMPurify then ignores
// ALLOWED_TAGS and ALLOWED_ATTR entirely. So the marker that says «this is a
// quoted passage» is stripped (the spellchecker and the scanner can no longer
// skip it), while <img> and any CSS — position: fixed included — are kept.
//
// The allow lists have to be the lists that are actually applied.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  test('sanitize-keeps-markers', async function (t) {
    t.assert.ok(window.SafeHTML && window.SafeHTML.sanitize, 'SafeHTML is not loaded');

    const quoted = window.SafeHTML.sanitize(
      '<blockquote class="notes-inserted-ref" data-ref-insert="1" dir="rtl">نەقىل تېكىستى</blockquote>');
    t.assert.includes(quoted, 'data-ref-insert',
      'the inserted-reference marker was stripped, so quoted text cannot be recognised');
    t.assert.includes(quoted, 'notes-inserted-ref', 'the inserted-reference class was stripped');
    t.assert.includes(quoted, 'نەقىل تېكىستى', 'the quoted text itself was lost');

    const img = window.SafeHTML.sanitize('<p>ئاۋال<img src="https://example.com/a.png">كېيىن</p>');
    t.assert.excludes(img, '<img', 'an image survived the sanitizer');
    t.assert.includes(img, 'ئاۋال', 'the surrounding text was lost');

    const css = window.SafeHTML.sanitize('<p style="text-indent:1cm;position:fixed">ئابزاس</p>');
    t.assert.includes(css, 'text-indent', 'an allowed CSS property was dropped');
    t.assert.excludes(css, 'position', 'position: fixed survived the sanitizer');
  });
})();
