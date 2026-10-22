// ============================================================================
// The note's structure: block style (W4, K11), the outline (W5), and undo /
// redo on the toolbar (W14).
//
// K11: a quote could not be turned back into normal text — pressing the quote
// button again, or «فورماتنى ئۆچۈرۈش», left it a quote — and there was no way
// to make a heading at all. One menu now shows what the caret is in and turns
// it into any of the four, each as ONE undo step.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  // Apply a block style with the caret placed by `place`, then prove the change
  // is exactly one undo step and comes back with redo.
  async function styled(t, ed, place, value) {
    place();
    window.notesSaveSel();
    const before = ed.innerHTML;
    window.notesSetBlockStyle(value);
    await t.sleep(20);
    const after = ed.innerHTML;
    t.assert.ok(after !== before, value + ' changed nothing');

    ed.focus();
    document.execCommand('undo');
    await t.sleep(10);
    t.assert.equal(ed.innerHTML, before, value + ' is not one undo step');
    document.execCommand('redo');
    await t.sleep(10);
    t.assert.equal(ed.innerHTML, after, value + ' does not come back with redo');
    return after;
  }

  function inBlock(t, ed, index) {
    return function () {
      const node = t.firstText(ed.children[index]);
      t.caretIn(node, 1);
    };
  }

  test('block-style-transitions', async function (t) {
    const sel = document.getElementById('notes-block-style');
    let ed = await t.fresh({ html: '<p>بىرىنچى ئابزاس</p><p>ئىككىنچى ئابزاس</p>' });
    t.assert.ok(document.getElementById('notes-block-style'), 'there is no block-style menu');

    // normal → big heading → normal
    await styled(t, ed, inBlock(t, ed, 0), 'h2');
    t.assert.equal(ed.children[0].tagName, 'H2', 'normal text did not become a big heading');
    t.assert.equal(ed.children[0].textContent, 'بىرىنچى ئابزاس', 'the heading lost text');
    await styled(t, ed, inBlock(t, ed, 0), 'normal');
    t.assert.equal(ed.children[0].tagName, 'P', 'a heading did not become a normal paragraph');
    t.assert.deepEqual(t.blockTags(), ['P', 'P'], 'turning a heading back changed the other blocks');

    // normal → small heading
    await styled(t, ed, inBlock(t, ed, 1), 'h3');
    t.assert.equal(ed.children[1].tagName, 'H3', 'normal text did not become a small heading');

    // normal → quote
    await styled(t, ed, inBlock(t, ed, 0), 'quote');
    t.assert.equal(ed.children[0].tagName, 'BLOCKQUOTE', 'normal text did not become a quote');

    // A quote holding lines of text → one normal paragraph (K11).
    ed = await t.fresh({ html: '<blockquote>نەقىلنىڭ بىرىنچى قۇرى<br>ئىككىنچى قۇرى</blockquote><p>كەينى</p>' });
    await styled(t, ed, inBlock(t, ed, 0), 'normal');
    t.assert.equal(ed.querySelectorAll('blockquote').length, 0, 'a quote of text lines stayed a quote');
    t.assert.includes(ed.textContent, 'نەقىلنىڭ بىرىنچى قۇرى', 'the quote lost text');
    t.assert.includes(ed.textContent, 'ئىككىنچى قۇرى', 'the quote lost its second line');
    t.assert.equal(ed.lastElementChild.textContent, 'كەينى', 'the paragraph after the quote changed');

    // A quote holding blocks (as pasted) → its blocks, out of the quote.
    ed = await t.fresh({ html: '<blockquote><p>بىرىنچى</p><p>ئىككىنچى</p></blockquote><p>كەينى</p>' });
    await styled(t, ed, function () { t.caretIn(t.firstText(ed.querySelector('blockquote p')), 1); }, 'normal');
    t.assert.equal(ed.querySelectorAll('blockquote').length, 0, 'a quote of paragraphs stayed a quote');
    t.assert.equal(ed.textContent.replace(/\s+/g, ''), 'بىرىنچىئىككىنچىكەينى', 'the quote lost text');

    // The menu shows where the caret is.
    ed = await t.fresh({ html: '<h3>ماۋزۇ</h3><blockquote>نەقىل</blockquote><p>تېكىست</p>' });
    const shows = async function (index, expected) {
      t.caretIn(t.firstText(ed.children[index]), 1);
      document.dispatchEvent(new Event('selectionchange'));
      await t.sleep(30);
      t.assert.equal(document.getElementById('notes-block-style').value, expected,
        'the menu does not show the block the caret is in (' + expected + ')');
    };
    await shows(0, 'h3');
    await shows(1, 'quote');
    await shows(2, 'normal');
    void sel;
  });

  test('outline', async function (t) {
    const filler = Array.from({ length: 40 }, function (_, i) { return '<p>ئابزاس ' + i + '</p>'; }).join('');
    const ed = await t.fresh({
      html: '<h2>بىرىنچى باب</h2>' + filler + '<h3>كىچىك ماۋزۇ</h3>' + filler +
            '<h2>   </h2><h2>ئىككىنچى باب</h2>' + filler
    });
    t.assert.ok(typeof window.notesShowOutline === 'function', 'there is no «مۇندەرىجە»');
    window.notesShowOutline();
    await t.sleep(60);

    const items = Array.from(document.querySelectorAll('#notes-outline .notes-outline-item'));
    t.assert.deepEqual(items.map(function (i) { return i.textContent.trim(); }),
      ['بىرىنچى باب', 'كىچىك ماۋزۇ', 'ئىككىنچى باب'], 'the outline does not list the headings (empty ones left out)');
    t.assert.deepEqual(items.map(function (i) { return i.getAttribute('data-depth'); }), ['0', '1', '0'],
      'the outline is not indented from the note\'s highest level');

    items[2].click();
    await t.sleep(60);
    const heading = Array.from(ed.querySelectorAll('h2')).filter(function (h) { return h.textContent === 'ئىككىنچى باب'; })[0];
    const top = heading.getBoundingClientRect().top - ed.getBoundingClientRect().top;
    t.assert.ok(top >= 0 && top < 60, 'the heading was not scrolled to just below the toolbar (' + Math.round(top) + ' px)');
    const s = window.getSelection();
    t.assert.ok(s.rangeCount && heading.contains(s.anchorNode) && s.anchorOffset === 0 && s.isCollapsed,
      'the caret is not at the start of the heading');

    // Re-read after a change.
    t.caretIn(t.firstText(ed.children[1]), 0);
    window.notesSaveSel();
    window.notesSetBlockStyle('h2');
    await t.sleep(450);
    const after = Array.from(document.querySelectorAll('#notes-outline .notes-outline-item'))
      .map(function (i) { return i.textContent.trim(); });
    t.assert.equal(after.length, 4, 'the outline was not re-read after a heading was made');
  });

  test('undo-redo-buttons', async function (t) {
    const ed = await t.fresh({ html: '<p>بىرىنچى</p>' });
    const undo = document.getElementById('notes-undo-btn');
    const redo = document.getElementById('notes-redo-btn');
    t.assert.ok(undo && redo, 'there are no undo / redo buttons');

    t.caretToEnd();
    t.type(' يېڭى سۆز');
    t.assert.includes(ed.textContent, 'يېڭى سۆز', 'typing did nothing');
    undo.click();
    await t.sleep(20);
    t.assert.excludes(ed.textContent, 'يېڭى سۆز', '«يېنىۋېلىش» did not undo');
    redo.click();
    await t.sleep(20);
    t.assert.includes(ed.textContent, 'يېڭى سۆز', '«قايتىلاش» did not redo');
  });
})();
