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
    // The hit the find bar is on gets its own colour, so the three are spread
    // over the two highlights.
    const painted = t.highlighted('bh-find-hit').concat(t.highlighted('bh-find-current'));
    t.assert.equal(painted.length, 3, 'the three hits are not painted as highlights');
    t.assert.equal(t.highlighted('bh-find-current').length, 1,
      'the current hit is not marked as the current one');

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

  // The whole batch has to be retractable in one go — the find bar grows
  // «ھەممىنى يېنىۋېلىش» after a replace-all.
  test('replace-all-undo', async function (t) {
    const HTML = '<blockquote>نەقىل سۆز</blockquote><p>بىرىنچى سۆز</p><p>ئىككىنچى سۆز</p>';
    const ed = await t.fresh({ html: HTML });
    const before = ed.innerHTML;

    ed.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'h', ctrlKey: true, bubbles: true, cancelable: true
    }));
    await t.sleep(30);
    document.getElementById('notes-find-input').value = 'سۆز';
    window.notesFindRun();
    document.getElementById('notes-replace-input').value = 'گەپ';
    window.notesReplaceAll();
    await t.sleep(80);

    const undo = document.getElementById('notes-undo-all-btn');
    t.assert.ok(undo, 'the find bar has no «ھەممىنى يېنىۋېلىش» button');
    t.assert.ok(undo.style.display !== 'none', 'the undo-all button was not offered');

    window.notesUndoReplaceAll();
    await t.sleep(80);

    t.assert.equal(ed.innerHTML, before, 'undoing the replace-all did not restore the note');
    t.assert.equal(undo.style.display, 'none', 'the undo-all button is still offered');
  });
})();
