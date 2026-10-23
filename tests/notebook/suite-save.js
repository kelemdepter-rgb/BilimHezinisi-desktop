// ============================================================================
// Saving: K3 — nothing typed may be lost.
//
// (a) leave-and-return. The note is saved three seconds after the last
//     keystroke. Leaving the notebook in between saves nothing, and the editor
//     is re-mounted from the stale curDoc, so the writing is gone from the
//     screen and from the database.
//
// (b) failed-save-switch. When the database refuses the write, opening another
//     note goes ahead anyway: the unsaved text is dropped silently while the
//     status says «ساقلاندى».
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  function caretAtEndOfFirstBlock(t, ed) {
    const node = t.lastText(ed.children[0]);
    t.caretIn(node, node.data.length);
  }

  test('leave-and-return', async function (t) {
    const NEW = ' يېڭى يېزىلغان مۇھىم جۈملە';
    let ed = await t.fresh({ html: '<p>كونا مەزمۇن</p>' });

    caretAtEndOfFirstBlock(t, ed);
    t.type(NEW);
    t.assert.includes(ed.innerText, NEW, 'the text was not typed at all');

    // Ctrl+2 then Ctrl+3, well inside the three-second autosave window.
    await window.BH.leaveNotebook();
    await t.sleep(800);
    await window.BH.returnToNotebook();

    ed = t.editor();
    t.assert.ok(ed, 'the notebook did not come back');
    t.assert.includes(ed.innerText, NEW,
      'the writing was not on screen after leaving the notebook and returning');

    const saved = window.FAKE.saves[window.FAKE.saves.length - 1];
    t.assert.ok(saved, 'nothing was saved before leaving the notebook');
    t.assert.includes(saved.text, 'يېڭى يېزىلغان',
      'what was saved does not contain the last writing');

    const status = document.getElementById('notes-status');
    t.assert.ok(status, 'the status element is missing');
    t.assert.equal(window.S.notes.dirty, false, 'the note is still dirty after the flush');
  });

  // K3d. The main process stops the close and asks; the window goes only on a
  // true answer. Here the test plays the main process.
  test('close-waits-for-save', async function (t) {
    const NEW = ' ئاخىرقى جۈملە';
    const ed = await t.fresh({ html: '<p>كونا مەزمۇن</p>' });

    t.assert.ok(typeof window.FAKE.flushRequest === 'function',
      'the renderer never registered for app-flush-request');

    caretAtEndOfFirstBlock(t, ed);
    t.type(NEW);
    t.assert.ok(window.FAKE.dirtyReports.indexOf(true) !== -1,
      'the main process was not told that the notebook has unsaved writing');

    await window.FAKE.flushRequest();
    await t.sleep(60);

    t.assert.deepEqual(window.FAKE.flushAnswers, [true],
      'the renderer did not answer the flush request with success');
    const saved = window.FAKE.saves[window.FAKE.saves.length - 1];
    t.assert.ok(saved && saved.text.indexOf('ئاخىرقى جۈملە') !== -1,
      'the flush did not write what was on screen');
    t.assert.equal(window.FAKE.dirtyReports[window.FAKE.dirtyReports.length - 1], false,
      'the main process was not told that the notebook is clean again');

    // Now with a database that refuses: the answer must be false, so the main
    // process asks the writer instead of closing over unsaved work.
    t.type(' يەنە بىر سۆز');
    window.FAKE.failSave = true;
    await window.FAKE.flushRequest();
    await t.sleep(60);
    t.assert.equal(window.FAKE.flushAnswers[window.FAKE.flushAnswers.length - 1], false,
      'a failed flush was reported as success — the window would close over it');
  });

  test('failed-save-switch', async function (t) {
    const NEW = ' يېڭى جۈملە';
    const ed = await t.fresh({ html: '<p>كونا مەزمۇن</p>' });

    caretAtEndOfFirstBlock(t, ed);
    t.type(NEW);
    window.FAKE.failSave = true;

    await window.notesOpen(2);
    await t.sleep(150);

    t.assert.ok(window.S.notes.curDoc, 'the open note was dropped altogether');
    t.assert.equal(window.S.notes.curDoc.id, 1,
      'the writer was moved to another note although the save had failed');
    t.assert.includes(t.editor().innerText, NEW, 'the unsaved writing is gone from the screen');

    const status = document.getElementById('notes-status').textContent;
    t.assert.excludes(status, 'ساقلاندى',
      'the status says the note is saved while it is not');

    const told = window.TOASTS.some(function (entry) {
      return String(entry[0]).indexOf('ساقلانمىدى') !== -1;
    });
    t.assert.ok(told, 'the writer was not told that the save failed');
  });
})();
