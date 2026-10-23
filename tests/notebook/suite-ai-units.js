// ============================================================================
// W13, K9 — AI proofreading that keeps the note's shape.
//
// The old path read the note as plain lines and sent every one of them —
// verses, quoted passages and citations included. It wrote the answer back
// by rebuilding the whole note as one <div> per line (naiSetEditorBlocks),
// after a confirm() warning that the formatting would be flattened. Headings,
// lists, bold words, links and the Uthmani face of a verse all went, with
// only a version to go back to.
//
// src/note-units.js, a port of the web edition's lib/ai/note-blocks.ts and
// lib/ai/proofread.ts, reads the note into units and lines and never sends
// quoted material. It writes back only what changed, each change through an
// editing command over a Range. The AI answers here are fakes: what is tested
// is what the notebook does with them.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  const NOTE =
    '<h2>ماۋزۇ خاتا</h2>' +
    '<p>بىرىنچى قۇر خاتا<br>ئىككىنچى قۇر</p>' +
    '<p>بۇ <b>توم</b> سۆز خاتا</p>' +
    '<p dir="rtl"><span style="font-family:\'UthmanicHafs\',serif">ئايەت خاتا</span><br>' +
      '<span data-ref-insert="1">«تەرجىمە خاتا»</span><br>' +
      '<a class="bh-cite" href="bh://quran/1/1">— قۇرئان كەرىم، 1:1</a></p>' +
    '<blockquote class="notes-inserted-ref" data-ref-insert="1"><span>نەقىل خاتا</span><br>' +
      '<a class="bh-cite" href="bh://book/5">— سىناق كىتابى</a></blockquote>' +
    '<ul><li>تىزىملىك   خاتا</li></ul>' +
    '<p>ئۆز <a href="https://example.com/">ئۇلىنىش</a> خاتا</p>' +
    'ئاخىرقى خاتا';

  /** What the model sends back: the same markers, some lines corrected. */
  function reply(lines, fixes) {
    return lines.map(function (l) {
      return '⟦' + l.num + '⟧ ' + (Object.prototype.hasOwnProperty.call(fixes, l.text) ? fixes[l.text] : l.text);
    }).join('\n');
  }

  function textNodes(root) {
    const out = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n);
    return out;
  }

  test('ai-units-skip-quoted-and-write-back-changes', async function (t) {
    const NU = window.NoteUnits;
    t.assert.ok(NU && typeof NU.collect === 'function', 'src/note-units.js is not loaded');
    const ed = await t.fresh({ html: NOTE });

    const c = NU.collect(ed);
    t.assert.deepEqual(c.lines.map(function (l) { return l.text; }), [
      'ماۋزۇ خاتا', 'بىرىنچى قۇر خاتا', 'ئىككىنچى قۇر', 'بۇ توم سۆز خاتا', 'تىزىملىك خاتا', 'ئاخىرقى خاتا'
    ], 'what is sent is not the writer\'s own lines, one by one');
    t.assert.deepEqual(c.lines.map(function (l) { return l.num; }), [1, 2, 3, 4, 5, 6]);
    t.assert.equal(c.quoted, 3, 'the verse, the passage and the paragraph with a link are not counted as left out');
    c.lines.forEach(function (l) {
      ['ئايەت', 'تەرجىمە', 'قۇرئان كەرىم', 'نەقىل', 'سىناق كىتابى', 'ئۇلىنىش'].forEach(function (w) {
        t.assert.excludes(l.text, w, 'quoted material would be sent');
      });
    });

    const batch = NU.formatBatch(c.lines);
    t.assert.equal(batch.split('\n')[0], '⟦1⟧ ماۋزۇ خاتا', 'the ⟦N⟧ format changed');

    // Everything quoted and every untouched line, as it is now.
    const quotedBefore = ['p[dir="rtl"]', 'blockquote', 'p:last-of-type'].map(function (s) { return ed.querySelector(s).outerHTML; });
    const bold = ed.querySelector('b');
    const nodesBefore = textNodes(ed);
    const dataBefore = nodesBefore.map(function (n) { return n.data; });

    const answer = reply(c.lines, {
      'ماۋزۇ خاتا': 'ماۋزۇ توغرا',
      'بۇ توم سۆز خاتا': 'بۇ توم سۆز توغرا',
      'تىزىملىك خاتا': 'تىزىملىك، توغرا'
    });
    const checked = NU.checkBatch(c.lines, answer);
    t.assert.ok(checked.ok, 'a well-formed answer was refused');
    const changes = NU.planChanges(c, new Map(checked.segments.map(function (s) { return [s.num, s.text]; })));
    t.assert.deepEqual(changes.map(function (ch) { return ch.num; }), [1, 4, 5], 'unchanged lines were planned as changes');

    const result = NU.applyChanges(ed, changes);
    t.assert.deepEqual(result, { applied: 3, skipped: 0 });

    t.assert.equal(ed.querySelector('h2').textContent, 'ماۋزۇ توغرا', 'the heading was not corrected');
    t.assert.equal(ed.querySelector('h2 + p').innerHTML, 'بىرىنچى قۇر خاتا<br>ئىككىنچى قۇر', 'a line break or an untouched line changed');
    t.assert.equal(ed.querySelector('b'), bold, 'the bold word was rebuilt');
    t.assert.equal(bold.textContent, 'توم');
    t.assert.equal(bold.parentElement.textContent, 'بۇ توم سۆز توغرا', 'the formatted paragraph was not corrected');
    t.assert.equal(ed.querySelector('li').textContent, 'تىزىملىك، توغرا', 'a change across collapsed spaces went wrong');
    t.assert.deepEqual(['p[dir="rtl"]', 'blockquote', 'p:last-of-type'].map(function (s) { return ed.querySelector(s).outerHTML; }),
      quotedBefore, 'quoted material changed');
    t.assert.deepEqual(t.blockTags(), ['H2', 'P', 'P', 'P', 'BLOCKQUOTE', 'UL', 'P'], 'the note\'s structure changed');

    // Lines the answer left alone were never written to.
    ['بىرىنچى قۇر خاتا', 'ئىككىنچى قۇر', 'ئاخىرقى خاتا'].forEach(function (text) {
      const i = dataBefore.indexOf(text);
      t.assert.ok(i !== -1 && nodesBefore[i].isConnected && nodesBefore[i].data === text, 'an unchanged line was rewritten: ' + text);
    });
  });

  test('ai-units-protocol', async function (t) {
    const NU = window.NoteUnits;
    const sent = [{ num: 1, text: 'a' }, { num: 2, text: 'b' }, { num: 3, text: 'c' }];

    const good = NU.checkBatch(sent, 'سۆز بېشى\n⟦1⟧ A\n⟦2⟧ B\n\n⟦3⟧ C\n');
    t.assert.ok(good.ok, 'a well-formed answer was refused');
    t.assert.deepEqual(good.segments.map(function (s) { return s.text; }), ['A', 'B', 'C']);

    t.assert.equal(NU.checkBatch(sent, '⟦1⟧ A\n⟦2⟧ B').reason, 'missing');
    t.assert.equal(NU.checkBatch(sent, '⟦1⟧ A\n⟦2⟧ B\n⟦3⟧ C\n⟦4⟧ D').reason, 'extra');
    t.assert.equal(NU.checkBatch(sent, '⟦2⟧ B\n⟦1⟧ A\n⟦3⟧ C').reason, 'reordered');
    t.assert.equal(NU.checkBatch(sent, 'بەلگە يوق').reason, 'empty');
    t.assert.includes(NU.malformedMessage('missing'), 'خاتىرىڭىزگە ھېچقانداق ئۆزگەرتىش قىلىنمىدى');

    t.assert.equal(NU.formatBatch([{ num: 1, text: 'a' }, { num: 2, text: 'b' }]), '⟦1⟧ a\n⟦2⟧ b');
    const sizes = NU.buildBatches([
      { num: 1, text: 'x'.repeat(4000) }, { num: 2, text: 'y'.repeat(4000) }, { num: 3, text: 'z' }
    ], 6000).map(function (b) { return b.length; });
    t.assert.deepEqual(sizes, [1, 2], 'the batches do not respect the output budget');
    t.assert.equal(NU.buildBatches([{ num: 1, text: 'x'.repeat(9000) }]).length, 1, 'an oversized line was not sent alone');

    // A line the model answers with nothing is never applied: it would delete the line.
    const ed = await t.fresh({ html: '<p>بىر خاتا</p>' });
    const c = NU.collect(ed);
    t.assert.deepEqual(NU.planChanges(c, new Map([[1, '  ']])), [], 'an empty answer would delete the line');
  });

  test('ai-units-flattening-flag', async function (t) {
    const NU = window.NoteUnits;
    const ed = await t.fresh({ html: '<p>بۇ <b>توم</b> سۆز</p><p>ئاددىي سۆز</p>' });
    const c = NU.collect(ed);
    const changes = NU.planChanges(c, new Map([[1, 'بۇ تونسۆن'], [2, 'ئاددىي سۆزلەر']]));
    t.assert.equal(changes.length, 2);
    t.assert.equal(changes[0].flattens, true, 'a change across the bold word is not flagged');
    t.assert.equal(changes[1].flattens, false, 'a change inside plain text is flagged');

    NU.applyChanges(ed, changes);
    t.assert.equal(ed.children[0].textContent, 'بۇ تونسۆن');
    t.assert.equal(ed.children[1].textContent, 'ئاددىي سۆزلەر');
  });

  test('ai-units-stale-line-and-undo', async function (t) {
    const NU = window.NoteUnits;
    const ed = await t.fresh({ html: '<p>بىرىنچى خاتا</p><p>ئىككىنچى خاتا</p>' });
    const c = NU.collect(ed);
    const changes = NU.planChanges(c, new Map([[1, 'بىرىنچى توغرا'], [2, 'ئىككىنچى توغرا']]));

    // The writer goes on typing while the model works.
    const second = t.lastText(ed.children[1]);
    t.caretIn(second, second.data.length);
    t.type('!');

    t.assert.deepEqual(NU.applyChanges(ed, changes), { applied: 1, skipped: 1 },
      'a line the writer changed meanwhile was overwritten');
    t.assert.equal(ed.children[0].textContent, 'بىرىنچى توغرا');
    t.assert.equal(ed.children[1].textContent, 'ئىككىنچى خاتا!', 'the writer\'s typing was lost');

    document.execCommand('undo');
    t.assert.equal(ed.children[0].textContent, 'بىرىنچى خاتا', 'one change is not one undo step');
    t.assert.equal(ed.children[1].textContent, 'ئىككىنچى خاتا!');
  });

  test('ai-undo-restores-the-note', async function (t) {
    const NU = window.NoteUnits;
    let ed = await t.fresh({ html: '<h2>ماۋزۇ</h2><p>بىر <b>توم</b> خاتا</p>' });
    const original = ed.innerHTML;
    t.assert.equal(window.notesCanUndoAi(), false, 'there is something to undo before any AI change');

    t.assert.ok(window.notesBeforeAi(), 'no undo point was kept');
    const kept = window.FAKE.versionCalls.filter(function (v) { return v.reason === 'before-ai'; });
    t.assert.equal(kept.length, 1, 'no «AI تۈزىتىشتىن بۇرۇن» version was kept');
    t.assert.includes(kept[0].html, '<b>توم</b>');

    NU.applyChanges(ed, NU.planChanges(NU.collect(ed), new Map([[2, 'بىر توم توغرا']])));
    t.assert.equal(ed.children[1].textContent, 'بىر توم توغرا');
    t.assert.ok(window.notesCanUndoAi(), '«يېنىۋېلىش» is not offered');

    t.assert.ok(window.notesUndoAi(), '«يېنىۋېلىش» refused');
    ed = t.editor();
    t.assert.equal(ed.innerHTML, original, 'the note did not come back as it was');
    t.assert.ok(window.FAKE.versionCalls.some(function (v) { return v.reason === 'before-restore'; }),
      'the corrected note was not kept before it was replaced');
    t.assert.ok(window.S.notes.dirty, 'the restored note is not saved');
    t.assert.equal(window.notesCanUndoAi(), false, 'the same change can be undone twice');

    // An undo point belongs to its note.
    window.notesBeforeAi();
    await window.notesOpen(2);
    t.assert.equal(window.notesCanUndoAi(), false, 'another note offers to undo this one\'s AI change');
    t.assert.equal(window.notesUndoAi(), false, 'another note was overwritten');
  });
})();
