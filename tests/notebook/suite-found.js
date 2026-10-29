// ============================================================================
// 3.6 Phase 4 — a note opened from the library's search shows what was found.
//
// The search bar finds a note through the Uyghur forms of a word; opening it
// paints every word found with the find highlight (the CSS Custom Highlight
// API, as the find bar does) — nothing is written into the note. The forms
// hold only while the find box holds the search's query: typing another one,
// or opening find & replace, is the find bar as before.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  const HTML = '<p>ئۇ بالىسىنى كۆردى، بالا كەلدى.</p><p>بالاغەت يېشى.</p>';

  function hits(t) {
    return t.highlighted('bh-find-hit').concat(t.highlighted('bh-find-current'));
  }

  test('notes-show-found-paints-without-markup', async function (t) {
    const ed = await t.fresh({ html: HTML });
    const before = ed.innerHTML;
    t.assert.ok(typeof window.notesShowFound === 'function', 'notesShowFound is missing');
    window.notesShowFound('بالىلار', ['بالىسىنى', 'بالا']);

    t.assert.deepEqual(hits(t).sort(), ['بالا', 'بالىسىنى'], 'the words found are painted, «بالاغەت» is not');
    t.assert.equal(t.highlighted('bh-find-current').length, 1, 'the first is the current one');
    t.assert.equal(ed.innerHTML, before, 'something was written into the note');
    t.assert.equal(document.getElementById('notes-find-input').value, 'بالىلار');
    t.assert.equal(document.getElementById('notes-find-count').textContent, '1 / 2');
    t.assert.equal(document.getElementById('notes-replace-input').style.display, 'none', 'find only, no replace');

    // Another query in the box: the find bar as before (the query as typed).
    const inp = document.getElementById('notes-find-input');
    inp.value = 'بالا';
    window.notesFindRun();
    t.assert.equal(hits(t).length, 2, 'typed «بالا»: «بالا» and the start of «بالاغەت», as before');

    // Back to the search's query, but through Ctrl+H: no forms any more.
    window.notesShowFound('بالىلار', ['بالىسىنى', 'بالا']);
    ed.focus();
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true, cancelable: true }));
    inp.value = 'بالىلار';
    window.notesFindRun();
    t.assert.deepEqual(hits(t), [], 'find & replace replaced only the query as typed');
    window.notesFindClose();
    t.assert.equal(ed.innerHTML, before);
  });
})();
