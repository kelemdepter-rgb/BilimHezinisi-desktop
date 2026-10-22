// ============================================================================
// Format painter: it paints, it does not rebuild.
//
// The owner's bug 1 (audit §2). The painter takes the selection as plain text
// (sel.toString()) and writes it back inside ONE span, so three painted
// paragraphs become one, and every line break, link and inline format inside
// them is gone. What it must do instead is apply the captured format to the
// selection with editing commands and leave the structure alone.
//
// Word's override semantics are deliberate: a painted range takes the source's
// format, so the <b> inside the target is expected to lose its weight. The
// paragraphs, the <br>, the link and the text are not the format — they stay.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  const SOURCE = '<p><span style="font-family:\'UKIJ Tuz Tom\';font-size:24px">مەنبە ئابزاس</span></p>';
  const TARGETS =
    '<p>بىرىنچى ئابزاس <b>توم سۆز</b> بار<br>قۇر ئىككى</p>' +
    '<p>ئىككىنچى <a href="https://example.com">ئۇلىنىش</a> ئابزاس</p>' +
    '<p>ئۈچىنچى ئابزاس</p>';

  test('painter-blocks', async function (t) {
    const ed = await t.fresh({ html: SOURCE + TARGETS });

    t.assert.deepEqual(t.blockTags(), ['P', 'P', 'P', 'P'], 'the fixture did not survive the sanitizer');
    const textsBefore = Array.from(ed.children).map(function (el) { return el.textContent; });

    // Caret in the source text, then one press of the brush (one-shot mode).
    const source = t.firstText(ed.children[0]);
    t.caretIn(source, 2);
    const btn = document.getElementById('notes-fp-btn');
    t.assert.ok(btn, 'the format painter button is missing');
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await t.sleep(320);                     // the press timer is 220 ms

    // Select the three target paragraphs, the way a drag does, and release.
    t.select(t.firstText(ed.children[1]), 0,
             t.lastText(ed.children[3]), t.lastText(ed.children[3]).data.length);
    ed.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    await t.sleep(120);

    // --- structure ---
    t.assert.deepEqual(t.blockTags(), ['P', 'P', 'P', 'P'],
      'painting merged paragraphs instead of formatting them');
    t.assert.ok(ed.children[1].querySelector('br'),
      'the line break inside the painted paragraph was destroyed');
    t.assert.ok(ed.children[2].querySelector('a[href]'),
      'the link inside the painted paragraph was destroyed');

    // --- text ---
    const textsAfter = Array.from(ed.children).map(function (el) { return el.textContent; });
    t.assert.deepEqual(textsAfter, textsBefore, 'painting changed the text');

    // --- the format actually arrived ---
    for (let i = 1; i <= 3; i++) {
      const run = t.firstText(ed.children[i]).parentElement;
      const cs = window.getComputedStyle(run);
      t.assert.includes(cs.fontFamily, 'UKIJ Tuz Tom',
        'paragraph ' + i + ' did not take the source font family');
      t.assert.equal(cs.fontSize, '24px',
        'paragraph ' + i + ' did not take the source font size');
    }

    // --- the source is not a target ---
    t.assert.equal(ed.children[0].textContent, textsBefore[0], 'the source paragraph changed');
  });
})();
