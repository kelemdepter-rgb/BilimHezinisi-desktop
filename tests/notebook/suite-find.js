// ============================================================================
// Find and replace: K1 — «ھەممىنى ئالماشتۇرۇش» swallows the note.
//
// Replace-all selects the whole document and writes it back as HTML
// (selectAll + insertHTML). When the note starts with a quote, Chromium puts
// everything that follows INSIDE that quote, and three seconds later the
// wreckage is saved. The structure must be untouched: each hit is replaced over
// its own Range.
//
// The hits themselves must not be written into the note either (<mark> elements
// used to be saved with it) — they belong on the CSS Custom Highlight layer,
// where the spellchecker already draws.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  test('replace-all-structure', async function (t) {
    const ed = await t.fresh({
      html: '<blockquote>نەقىل سۆز</blockquote><p>بىرىنچى سۆز</p><p>ئىككىنچى سۆز</p>'
    });
    t.assert.deepEqual(t.blockTags(), ['BLOCKQUOTE', 'P', 'P'],
      'the fixture did not survive the sanitizer');

    // Ctrl+H, as the writer opens it.
    ed.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'h', ctrlKey: true, bubbles: true, cancelable: true
    }));
    await t.sleep(30);
    const findInput = document.getElementById('notes-find-input');
    const replaceInput = document.getElementById('notes-replace-input');
    t.assert.ok(findInput && replaceInput, 'the find bar did not open');

    findInput.value = 'سۆز';
    window.notesFindRun();
    await t.sleep(30);

    // Nothing transient may be written into the note.
    t.assert.equal(ed.querySelectorAll('mark.notes-find-hit').length, 0,
      'the search wrote <mark> elements into the note instead of painting them');
    const painted = t.highlighted('bh-find-hit');
    t.assert.equal(painted.length, 3, 'the three hits are not painted as highlights');

    replaceInput.value = 'گەپ';
    window.notesReplaceAll();
    await t.sleep(80);
    window.notesFindClose();
    await t.sleep(20);

    t.assert.deepEqual(t.blockTags(), ['BLOCKQUOTE', 'P', 'P'],
      'replace-all changed the block structure');
    t.assert.equal(ed.querySelectorAll('blockquote').length, 1,
      'replace-all nested the note inside the quote');
    t.assert.deepEqual(
      Array.from(ed.children).map(function (el) { return el.textContent; }),
      ['نەقىل گەپ', 'بىرىنچى گەپ', 'ئىككىنچى گەپ'],
      'replace-all did not replace exactly the matched words');
    t.assert.equal(ed.querySelectorAll('mark.notes-find-hit').length, 0,
      'search marks were left in the note');
  });
})();
