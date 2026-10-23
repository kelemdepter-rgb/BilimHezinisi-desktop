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

  // ---------------------------------------------------------------- helpers

  /** A Range over the first occurrence of `word` in the editor's text. */
  function rangeOfWord(ed, word) {
    const TM = window.TextMap;
    const map = TM.readTextMap(ed);
    const at = map.text.indexOf(word);
    return at < 0 ? null : TM.rangeFor(map, at, at + word.length);
  }

  /**
   * Everything the scanner has marked, as strings with where they sit —
   * whether it marked them with elements (before v3.5) or on the highlight
   * layer (from v3.5), so the same test describes both.
   */
  function markedRuns(t, ed) {
    const runs = [];
    ed.querySelectorAll('.ref-match').forEach(function (el) {
      runs.push({ text: el.textContent, node: el });
    });
    t.highlightRanges('bh-ref-match').forEach(function (range) {
      runs.push({ text: range.toString(), node: range.startContainer });
    });
    return runs;
  }

  // A click on a matched word still opens its sources — the feature the old
  // <span> carried has to survive the span going away.
  test('refscan-click', async function (t) {
    const ed = await t.fresh({ html: '<p>بۇ بىر ئابزاس ھەققىدە يېزىلغان جۈملە</p>', refscan: true, ngramWords: ['ئابزاس'] });
    await t.sleep(700);
    t.assert.ok(markedRuns(t, ed).length > 0, 'the scanner marked nothing, so there is nothing to click');

    const range = rangeOfWord(ed, 'ئابزاس');
    const rect = range && range.getClientRects()[0];
    t.assert.ok(rect && rect.width > 0, 'the matched word has no rectangle to click');
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const target = document.elementFromPoint(x, y);
    t.assert.ok(target && ed.contains(target), 'the click point is not inside the note');
    t.mouse(target, 'mousedown', x, y);
    t.mouse(target, 'mouseup', x, y);
    t.mouse(target, 'click', x, y);
    await t.sleep(60);

    t.assert.equal(window.S.notes.refsFilter, 'ئابزاس', 'clicking the matched word did not filter its sources');
    t.assert.equal(window.S.notes.rightTab, 'refs', 'clicking the matched word did not open the «مەنبە» tab');
  });

  // An inserted passage is quoted material: its words came FROM the library,
  // so they must not be matched against it again. The class alone has to be
  // enough — notes saved before v3.5 lost data-ref-insert to the sanitizer (K6).
  test('refscan-skips-quoted', async function (t) {
    const ed = await t.fresh({
      html: '<blockquote class="notes-inserted-ref" data-ref-insert="1"><span>ئابزاس نەقىلدە تۇرىدۇ</span></blockquote>' +
            '<p>بۇ ئابزاس مېنىڭ ئۆز سۆزۈم</p>',
      refscan: true,
      ngramWords: ['ئابزاس']
    });
    await t.sleep(700);

    const runs = markedRuns(t, ed);
    const quote = ed.querySelector('.notes-inserted-ref');
    t.assert.ok(quote, 'the fixture lost its quoted passage');
    const inQuote = runs.filter(function (run) { return quote.contains(run.node); });
    const inOwn = runs.filter(function (run) { return ed.children[1].contains(run.node); });
    t.assert.equal(inQuote.length, 0, 'the scanner marked words inside an inserted passage');
    t.assert.ok(inOwn.length > 0, 'the writer\'s own paragraph was not scanned');
  });

  // Notes saved before v3.5 carry the old transient markup in their HTML. It is
  // unwrapped on open and never written back.
  test('legacy-markup-unwrapped', async function (t) {
    const ed = await t.fresh({
      html: '<p>ئالدى <span class="ref-match" data-ref-word="سۆز">سۆز</span> ' +
            '<mark class="notes-find-hit">ئىزدەش</mark> <span class="spell-error">خاتا</span> كەينى</p>'
    });
    t.assert.equal(ed.querySelectorAll('.ref-match, mark.notes-find-hit, .spell-error').length, 0,
      'the old transient markup is still in the note after opening it');
    t.assert.equal(ed.textContent, 'ئالدى سۆز ئىزدەش خاتا كەينى', 'unwrapping the old markup lost text');

    t.caretToEnd();
    t.type('!');
    window.notesSaveNow();
    await t.sleep(100);
    const saved = window.FAKE.saves[window.FAKE.saves.length - 1];
    t.assert.ok(saved, 'the note was not saved');
    ['ref-match', 'notes-find-hit', 'spell-error'].forEach(function (cls) {
      t.assert.excludes(saved.html, cls, 'the old transient markup was saved again');
    });
  });
})();
