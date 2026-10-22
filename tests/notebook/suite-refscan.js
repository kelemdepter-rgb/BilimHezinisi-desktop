// ============================================================================
// Reference scan: K2 — the scanner moves the caret and saves its own marks.
//
// «كىتاب ئامبىرىدىن ئىزدەش» is on by default. When it finds a word, it wraps
// every occurrence in a <span class="ref-match">, replacing the text nodes the
// writer's caret is sitting in. The caret jumps to the start of the paragraph,
// so the next word typed lands in the wrong place — and the yellow marker is
// saved into the note, because snapshotHtml() does not strip it.
//
// The scan must not touch the note's DOM at all.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  test('refscan-caret', async function (t) {
    const SENTENCE = 'بۇ بىر ئابزاس ھەققىدە يېزىلغان جۈملە';
    const ed = await t.fresh({ refscan: true, ngramWords: ['ئابزاس'] });

    t.caretIn(ed.children[0], 0);
    t.type(SENTENCE);

    // The scan runs 400 ms after typing stops.
    await t.sleep(900);

    t.assert.ok(window.S.notes.matches && window.S.notes.matches.size,
      'the scanner found nothing, so this test proves nothing');

    // Keep typing where the caret was left: at the end.
    t.type('XYZ');
    await t.sleep(30);

    t.assert.equal(ed.innerText.trim(), SENTENCE + 'XYZ',
      'the scan moved the caret, so the next word landed in the wrong place');

    // The match is shown without writing anything into the note.
    t.assert.equal(ed.querySelectorAll('.ref-match').length, 0,
      'the scanner wrapped words in <span class="ref-match"> inside the note');
    t.assert.ok(t.highlighted('bh-ref-match').length > 0,
      'the match is not painted on the highlight layer');

    // ...and nothing of it reaches the database.
    window.notesSaveNow();
    await t.sleep(120);
    const saved = window.FAKE.saves[window.FAKE.saves.length - 1];
    t.assert.ok(saved, 'the note was not saved');
    t.assert.excludes(saved.html, 'ref-match', 'the scanner mark was saved into the note');
    t.assert.includes(saved.text, 'XYZ', 'the saved text is missing what was typed last');
  });
})();
