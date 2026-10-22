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
