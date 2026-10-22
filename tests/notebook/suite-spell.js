// ============================================================================
// Spellcheck: a line end is a word boundary, and a correction touches one word.
//
// These are the owner's bug 2 (audit §2) and K1's neighbour in §3. The engine
// is a stand-in here, but the defect is not in the engine: it is in the way the
// renderer flattens the note's text before handing it over, and in the way it
// writes a correction back.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  // --------------------------------------------------------------- spell-enter
  // Two correct words separated by Enter must stay two words.
  test('spell-enter', async function (t) {
    const first = ['ياخشى', 'ئۇسۇللارنى', 'ماڭا', 'تەۋسىيە', 'قىلغىن', 'مەنىڭ'];
    const second = ['چۈشەنمىگەن', 'ئىككىلىنىپ', 'قالغان'];
    const ed = await t.fresh({ spell: true, good: first.concat(second) });

    t.caretIn(ed.children[0], 0);
    t.type(first.join(' '));
    t.enter();
    t.type(second.join(' '));

    await window.notesRunSpellCheck();
    await t.sleep(30);

    const checked = window.FAKE.lastChecked;
    t.assert.ok(checked, 'the engine was never called');
    t.assert.excludes(checked, 'مەنىڭچۈشەنمىگەن',
      'the two paragraphs were glued into one word before the engine saw them');
    t.assert.includes(checked, 'مەنىڭ\nچۈشەنمىگەن',
      'a paragraph break must reach the engine as a line separator');
    t.assert.deepEqual(t.highlighted('bh-spell-error'), [],
      'every word is in the dictionary, so nothing may be underlined');
  });

  // --------------------------------------------------------- spell-shift-enter
  // The same, for Shift+Enter — a <br> inside one paragraph.
  test('spell-shift-enter', async function (t) {
    const ed = await t.fresh({ spell: true, good: ['بىرىنچى', 'قۇر', 'ئىككىنچى'] });

    t.caretIn(ed.children[0], 0);
    t.type('بىرىنچى قۇر');
    t.lineBreak();
    t.type('ئىككىنچى قۇر');

    await window.notesRunSpellCheck();
    await t.sleep(30);

    const checked = window.FAKE.lastChecked;
    t.assert.ok(ed.querySelector('br'), 'Shift+Enter did not produce a line break');
    t.assert.excludes(checked, 'قۇرئىككىنچى',
      'the line break was dropped, gluing the last and first words');
    t.assert.includes(checked, 'قۇر\nئىككىنچى',
      'a <br> must reach the engine as a line separator');
    t.assert.deepEqual(t.highlighted('bh-spell-error'), [],
      'every word is in the dictionary, so nothing may be underlined');
  });

  // ---------------------------------------------------- spell-correction-scope
  // Part a: accepting a suggestion changes that word and nothing else.
  // Part b: a mark whose range crosses a block boundary is refused — the note
  //         is left byte-identical. (Refusing to paint such a mark at all is
  //         just as correct; the note must be unchanged either way.)
  test('spell-correction-scope', async function (t) {
    // --- a ---
    let ed = await t.fresh({
      html: '<p>بىرىنچى خاتاسۆز ئاخىرى</p><p>كېيىنكى ئابزاس</p>',
      spell: true,
      good: ['بىرىنچى', 'ئاخىرى', 'كېيىنكى', 'ئابزاس'],
      suggest: ['تۈزىتىلگەن']
    });

    await window.notesRunSpellCheck();
    await t.sleep(30);

    let ranges = t.highlightRanges('bh-spell-error');
    t.assert.equal(ranges.length, 1, 'exactly one word should be underlined');
    t.assert.equal(ranges[0].toString(), 'خاتاسۆز', 'the wrong word is underlined');

    let rect = ranges[0].getClientRects()[0];
    t.assert.ok(rect && rect.width > 0, 'the underlined word has no rectangle to click');
    t.clickRect(ed, rect, 'mousedown');
    await t.sleep(60);

    let item = document.querySelector('.spell-popup-item[data-correction]');
    t.assert.ok(item, 'clicking the underlined word did not open the suggestion popup');
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await t.sleep(80);

    t.assert.deepEqual(t.blockTags(), ['P', 'P'], 'the paragraph structure changed');
    t.assert.equal(ed.children[0].textContent, 'بىرىنچى تۈزىتىلگەن ئاخىرى',
      'the correction did not land on the marked word alone');
    t.assert.equal(ed.children[1].textContent, 'كېيىنكى ئابزاس',
      'the next paragraph was damaged by a correction in the previous one');

    // --- b ---
    ed = await t.fresh({
      html: '<p>ئالدىنقى ئابزاس</p><p>كېيىنكى ئابزاس</p>',
      spell: true,
      good: ['ئالدىنقى', 'ئابزاس', 'كېيىنكى'],
      suggest: ['تۈزىتىلگەن']
    });

    // Read the flattened text the engine is given, then tell the engine to
    // report one "word" reaching from the last word of the first paragraph into
    // the first word of the second. Whatever the renderer does with that, the
    // note must come out unchanged.
    await window.notesRunSpellCheck();
    await t.sleep(20);
    const flat = window.FAKE.lastChecked;
    const start = flat.indexOf('ئابزاس');
    const end = flat.indexOf('كېيىنكى') + 'كېيىنكى'.length;
    t.assert.ok(start > 0 && end > start, 'could not build a cross-paragraph mark');

    window.FAKE.forceMarks = [{ word: flat.slice(start, end), start: start, end: end }];
    await window.notesRunSpellCheck();
    await t.sleep(30);

    const before = ed.innerHTML;
    ranges = t.highlightRanges('bh-spell-error');
    if (ranges.length) {
      rect = ranges[0].getClientRects()[0];
      if (rect && rect.width > 0) {
        t.clickRect(ed, rect, 'mousedown');
        await t.sleep(60);
        item = document.querySelector('.spell-popup-item[data-correction]');
        if (item) {
          item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
          await t.sleep(80);
        }
      }
    }

    t.assert.equal(ed.innerHTML, before,
      'a correction on a mark crossing a paragraph break rewrote the note');
    t.assert.deepEqual(t.blockTags(), ['P', 'P'], 'the paragraph structure changed');
    t.assert.equal(ed.children[1].textContent, 'كېيىنكى ئابزاس',
      'the second paragraph lost text to a cross-paragraph correction');
  });

  // ------------------------------------------------------------ W7: one by one
  function popupWord() {
    const header = document.querySelector('.spell-popup-header');
    const m = header ? /«([^»]+)»/.exec(header.textContent) : null;
    return m ? m[1] : null;
  }

  const STEP_NOTE = '<p>بىرىنچى خاتاسۆز ئابزاس</p><p>ئىككىنچى ئابزاس يەنەخاتا</p><p>ئۈچىنچى ئۈچىنچىخاتا ئابزاس</p>';
  const STEP_GOOD = ['بىرىنچى', 'ئابزاس', 'ئىككىنچى', 'ئۈچىنچى'];

  test('spell-step-through', async function (t) {
    const ed = await t.fresh({ html: STEP_NOTE, spell: true, good: STEP_GOOD });
    await window.notesRunSpellCheck();
    t.caretIn(t.firstText(ed.children[0]), 0);

    t.assert.ok(typeof window.notesSpellStep === 'function', 'there is no way to step through the errors');
    const seen = [];
    for (let i = 0; i < 4; i++) {
      await window.notesSpellStep(1);
      await t.sleep(40);
      seen.push(popupWord());
    }
    t.assert.deepEqual(seen, ['خاتاسۆز', 'يەنەخاتا', 'ئۈچىنچىخاتا', 'خاتاسۆز'],
      '«كېيىنكى» does not go from the caret to each error in turn and wrap');

    await window.notesSpellStep(-1);
    await t.sleep(40);
    t.assert.equal(popupWord(), 'ئۈچىنچىخاتا', '«ئالدىنقى» does not wrap back to the last error');

    // F7 is «كېيىنكى» from the keyboard.
    t.caretIn(t.firstText(ed.children[1]), 0);
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'F7', bubbles: true, cancelable: true }));
    await t.sleep(60);
    t.assert.equal(popupWord(), 'يەنەخاتا', 'F7 does not open the next error after the caret');

    const buttons = document.querySelectorAll('[data-spell-step]');
    t.assert.equal(buttons.length, 2, 'there are no «ئالدىنقى» / «كېيىنكى خاتالىق» buttons');
  });

  test('spell-step-none-left', async function (t) {
    await t.fresh({ html: '<p>بىرىنچى ئابزاس</p>', spell: true, good: STEP_GOOD });
    await window.notesRunSpellCheck();
    await window.notesSpellStep(1);
    await t.sleep(30);
    t.assert.ok(window.TOASTS.some(function (x) { return x[0] === 'ئىملا خاتالىقى قالمىدى'; }),
      'stepping with nothing left does not say so');
  });

  // ------------------------------------------------- W9: ignore in this note
  test('spell-ignore-in-note', async function (t) {
    const html = '<p>بىرىنچى خاتاسۆز ئابزاس</p>';
    const notes = {
      1: { id: 1, title: 'بىرى', content_html: html, content_text: '' },
      2: { id: 2, title: 'يەنە بىرى', content_html: html, content_text: '' }
    };
    let ed = await t.fresh({ notes: notes, spell: true, good: STEP_GOOD });
    await window.notesRunSpellCheck();
    await t.sleep(20);
    let ranges = t.highlightRanges('bh-spell-error');
    t.assert.equal(ranges.length, 1, 'the fixture has no misspelling');
    t.clickRect(ed, ranges[0].getClientRects()[0], 'mousedown');
    await t.sleep(60);
    const item = document.querySelector('.spell-popup-item[data-action="ignore-note"]');
    t.assert.ok(item, 'the popup has no «بۇ خاتىرىدە سەل قارا»');
    t.assert.includes(item.textContent, 'بۇ خاتىرىدە سەل قارا');
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await t.sleep(60);
    t.assert.equal(t.highlightRanges('bh-spell-error').length, 0, 'the word is still underlined');
    t.assert.deepEqual(JSON.parse(window.FAKE.settings.spell_ignore_note_1 || '[]'), ['خاتاسۆز'],
      'the word was not stored for this note');

    // Still ignored when the note is opened again...
    await window.notesOpen(2);
    await window.notesOpen(1);
    await window.notesRunSpellCheck();
    await t.sleep(20);
    t.assert.equal(t.highlightRanges('bh-spell-error').length, 0, 'the word came back after reopening the note');

    // ...and only in this note.
    await window.notesOpen(2);
    await window.notesRunSpellCheck();
    await t.sleep(20);
    t.assert.equal(t.highlightRanges('bh-spell-error').length, 1, 'the word is ignored in another note too');
  });

  // ----------------------------------------- W10: quoted material is not marked
  test('spell-skips-quoted', async function (t) {
    const ed = await t.fresh({
      html: '<p>بىرىنچى <span style="font-family:\'UthmanicHafs\',serif">ﷺ مۇقەددەس ئايەت</span> ئابزاس خاتاسۆز</p>' +
            '<blockquote class="notes-inserted-ref" data-ref-insert="1"><span>كىتابتىكى نەقىل</span></blockquote>' +
            '<p><a href="https://example.com">ئۇلىنىشتىكى سۆز</a> ئابزاس</p>',
      spell: true,
      good: STEP_GOOD
    });
    await window.notesRunSpellCheck();
    await t.sleep(20);
    t.assert.deepEqual(t.highlighted('bh-spell-error'), ['خاتاسۆز'],
      'quoted material was marked, or the writer\'s own misspelling was not');
    const sent = window.FAKE.lastChecked;
    ['مۇقەددەس', 'كىتابتىكى', 'ئۇلىنىشتىكى'].forEach(function (word) {
      t.assert.excludes(sent, word, 'quoted material was sent to the engine: ' + word);
    });
    t.assert.includes(sent, 'بىرىنچى', 'the writer\'s own words were not sent');
    void ed;
  });
})();
