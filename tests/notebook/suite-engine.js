// ============================================================================
// What the engine actually does — measured, not assumed.
//
// The format painter and the block-style menu are built on editing commands,
// and what those commands do to a document is engine behaviour. The audit
// measured in Chromium 141 and the web edition in Chromium 151 / Firefox /
// WebKit; this app ships Electron 28, which is Chromium 120, so the behaviour
// the code relies on is measured HERE and written into CLAUDE.md.
//
// These are not tests of the app. They are the measurements the app's design
// depends on: if an Electron upgrade changes one of them, this suite goes red
// before the notebook does.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  // Phase 1.2 relies on removeFormat clearing inline character formatting
  // WITHOUT touching the structure: paragraphs, line breaks, links and the
  // markers that say a passage is quoted all have to survive it, because the
  // painter runs it over a selection that spans several paragraphs.
  test('engine-removeformat', async function (t) {
    const ed = await t.fresh({
      html: '<p>ئالدى <b>توم</b> <a href="https://example.com">ئۇلىنىش</a> كەينى<br>ئىككىنچى قۇر</p>' +
            '<p><span style="font-family:\'UKIJ Tuz Tom\';font-size:24px">چوڭ خەت</span></p>' +
            '<blockquote class="notes-inserted-ref" data-ref-insert="1">نەقىل</blockquote>'
    });

    t.select(t.firstText(ed.children[0]), 0,
             t.lastText(ed.children[2]), t.lastText(ed.children[2]).data.length);
    ed.focus();
    document.execCommand('removeFormat');
    await t.sleep(30);

    const detail = ' — after removeFormat: ' + ed.innerHTML;
    t.assert.deepEqual(t.blockTags(), ['P', 'P', 'BLOCKQUOTE'],
      'removeFormat changed the block structure' + detail);
    t.assert.ok(ed.children[0].querySelector('br'),
      'removeFormat removed a line break' + detail);
    t.assert.ok(ed.children[0].querySelector('a[href]'),
      'removeFormat removed a link' + detail);
    // MEASURED in Electron 28 (Chromium 120): removeFormat keeps the blocks,
    // the <br>, the link and the class — and STRIPS data attributes. So a
    // painted range must never contain quoted material: data-ref-insert="1"
    // would be lost and the passage would stop being recognised as a
    // quotation. The painter splits the selection around QUOTED_SELECTOR for
    // exactly that reason, and .notes-inserted-ref is in that selector so the
    // class alone still identifies a quote. If a future engine starts keeping
    // the attribute, this line goes red and the split can be reconsidered.
    t.assert.ok(!ed.querySelector('[data-ref-insert="1"]'),
      'removeFormat now KEEPS data attributes — re-read the painter\'s split' + detail);
    t.assert.ok(ed.querySelector('.notes-inserted-ref'),
      'removeFormat removed the class that identifies a quoted passage' + detail);
    t.assert.ok(!ed.children[0].querySelector('b'),
      'removeFormat left the bold in place' + detail);
    const big = t.firstText(ed.children[1]).parentElement;
    t.assert.ok(window.getComputedStyle(big).fontSize !== '24px',
      'removeFormat left the font size in place' + detail);
  });

  // The toolbar's size levels are <font size="N">, and the painter maps a
  // source's pixel size to the nearest level. These are the pixel sizes the
  // engine gives those levels.
  test('engine-font-sizes', async function (t) {
    const ed = await t.fresh({ html: '<p>سىناق تېكىستى</p>' });
    const node = t.firstText(ed.children[0]);
    const measured = [];
    for (let level = 1; level <= 7; level++) {
      t.select(node, 0, node, node.data.length);
      ed.focus();
      document.execCommand('fontSize', false, String(level));
      await t.sleep(10);
      const run = t.firstText(ed.children[0]).parentElement;
      measured.push(window.getComputedStyle(run).fontSize);
    }
    t.assert.deepEqual(measured, ['10px', '13px', '16px', '18px', '24px', '32px', '48px'],
      'the toolbar size levels are not the pixel sizes the painter maps to');
  });
})();
