// ============================================================================
// W2, W3, K13 — the notebook's list and its trash, the renderer's half.
//
// The rules of the store are tested in tests/main/note-list.js. Here: deleting
// asks nothing and can be taken back from the toast or from «ئەخلەت ساندۇقى»;
// deleting for ever takes two clicks; a trashed note opens read-only; the list
// sorts titles in Uyghur order, pins, previews, and searches the text; an
// untouched new note does not stay behind.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  function itemTitles() {
    return Array.from(document.querySelectorAll('#notes-list-inner .notes-item .notes-item-title'))
      .map(function (el) { return el.textContent.trim(); });
  }

  function notes(list) {
    const out = {};
    list.forEach(function (n, i) {
      out[n.id] = Object.assign({
        content_html: '<p>' + (n.text || n.title) + '</p>',
        content_text: n.text || n.title,
        created_at: '2026-10-0' + (i + 1) + ' 09:00:00',
        updated_at: '2026-10-1' + (i + 1) + ' 09:00:00'
      }, n);
    });
    return out;
  }

  test('list-trash-and-undo', async function (t) {
    let asked = 0;
    const realConfirm = window.confirm;
    window.confirm = function () { asked++; return true; };
    try {
      await t.fresh({});
      await window.notesRefreshList();
      t.assert.deepEqual(itemTitles().sort(), ['ئىككىنچى خاتىرە', 'سىناق'].sort(), 'the list is not there');

      await window.notesDelete(2);
      await t.sleep(20);
      t.assert.equal(asked, 0, 'deleting a note asked a question');
      t.assert.ok(window.FAKE.notes[2] && window.FAKE.notes[2].deleted_at, 'the note was not moved to the trash');
      t.assert.deepEqual(itemTitles(), ['سىناق'], 'the trashed note is still in the list');
      t.assert.equal((document.getElementById('notes-trash-toggle') || {}).textContent.indexOf('1') !== -1, true,
        'the trash does not show its count');

      const toast = window.TOASTS.filter(function (x) { return x[2] && x[2].action; }).pop();
      t.assert.ok(toast, 'there is no «قايتۇرۇش» in the toast');
      t.assert.equal(toast[2].action.label, 'قايتۇرۇش');
      t.assert.ok(toast[2].ms >= 10000, 'the toast does not stay 10 seconds');
      await toast[2].action.run();
      await t.sleep(30);
      t.assert.ok(!window.FAKE.notes[2].deleted_at, '«قايتۇرۇش» did not restore the note');
      t.assert.deepEqual(itemTitles().sort(), ['ئىككىنچى خاتىرە', 'سىناق'].sort(), 'the restored note is not back in the list');
    } finally {
      window.confirm = realConfirm;
    }
  });

  test('list-trash-panel', async function (t) {
    await t.fresh({
      notes: notes([
        { id: 1, title: 'سىناق' },
        { id: 2, title: 'بىرىنچى ئەخلەت', deleted_at: '2026-10-20T08:00:00.000Z' },
        { id: 3, title: 'ئىككىنچى ئەخلەت', deleted_at: '2026-10-21T08:00:00.000Z' }
      ])
    });
    await window.notesToggleTrash();
    await t.sleep(30);
    const rows = Array.from(document.querySelectorAll('#notes-trash-list .notes-trash-item'));
    t.assert.equal(rows.length, 2, 'the trash does not list its notes');

    // Restore from the trash.
    rows[0].querySelector('[data-action="restore"]').click();
    await t.sleep(30);
    t.assert.equal(Object.keys(window.FAKE.notes).filter(function (id) { return window.FAKE.notes[id].deleted_at; }).length, 1,
      'restoring from the trash did nothing');

    // Delete for ever: the first click only asks, inline.
    let forever = document.querySelector('#notes-trash-list .notes-trash-item [data-action="forever"]');
    const id = Number(forever.closest('.notes-trash-item').dataset.id);
    forever.click();
    await t.sleep(20);
    t.assert.ok(window.FAKE.notes[id], 'one click deleted a note for ever');
    forever = document.querySelector('#notes-trash-list .notes-trash-item[data-id="' + id + '"] [data-action="forever"]');
    t.assert.ok(forever && forever.classList.contains('armed'), 'the first click did not ask for a second');
    forever.click();
    await t.sleep(30);
    t.assert.ok(!window.FAKE.notes[id], 'the second click did not delete the note for ever');

    // Empty the trash: two clicks as well.
    await window.notesDelete(1);
    await t.sleep(20);
    const empty = document.getElementById('notes-trash-empty');
    t.assert.ok(empty, 'there is no «ئەخلەت ساندۇقىنى بوشىتىش»');
    empty.click();
    await t.sleep(20);
    t.assert.ok(window.FAKE.notes[1], 'one click emptied the trash');
    document.getElementById('notes-trash-empty').click();
    await t.sleep(30);
    t.assert.ok(!window.FAKE.notes[1], 'the second click did not empty the trash');
  });

  test('list-trashed-opens-read-only', async function (t) {
    await t.fresh({
      notes: notes([
        { id: 1, title: 'سىناق' },
        { id: 2, title: 'ئەخلەتتىكى خاتىرە', text: 'كونا مەزمۇن', deleted_at: '2026-10-21T08:00:00.000Z' }
      ])
    });
    await window.notesOpen(2);
    await t.sleep(30);
    const ed = t.editor();
    t.assert.equal(ed.getAttribute('contenteditable'), 'false', 'a trashed note opened for editing');
    const banner = document.getElementById('notes-trashed-banner');
    t.assert.ok(banner, 'nothing says the note is in the trash');
    window.notesSaveNow();
    await t.sleep(20);
    t.assert.equal(window.FAKE.saves.length, 0, 'a trashed note was saved');

    banner.querySelector('[data-action="restore"]').click();
    await t.sleep(60);
    t.assert.ok(!window.FAKE.notes[2].deleted_at, 'the banner\'s «قايتۇرۇش» did not restore the note');
    t.assert.equal(t.editor().getAttribute('contenteditable'), 'true', 'the restored note is still read-only');
  });

  test('list-sort-pin-preview', async function (t) {
    await t.fresh({
      notes: notes([
        { id: 1, title: 'پادىشاھ' },
        { id: 2, title: 'ەسەر' },
        { id: 3, title: 'بالا', text: 'بىرىنچى قۇر\nئىككىنچى قۇر' },
        { id: 4, title: 'ئالما' }
      ])
    });
    window.notesSetListSort('title');
    await t.sleep(30);
    // ئ first, then the alphabet: ا ە ب پ … — code-point order would put ە last.
    t.assert.deepEqual(itemTitles(), ['ئالما', 'ەسەر', 'بالا', 'پادىشاھ'], 'titles are not in Uyghur order');
    t.assert.equal(window.FAKE.settings.notes_list_sort, 'title', 'the order is not remembered');

    const preview = document.querySelector('#notes-list-inner .notes-item[data-id="3"] .notes-item-preview');
    t.assert.ok(preview && preview.textContent.indexOf('بىرىنچى قۇر') !== -1, 'there is no preview line');

    await window.notesTogglePin(1);
    await t.sleep(30);
    t.assert.equal(itemTitles()[0], 'پادىشاھ', 'a pinned note is not first');
    t.assert.ok(document.querySelector('#notes-list-inner .notes-list-group'), 'pinned notes have no heading of their own');
    t.assert.ok(window.FAKE.notes[1].pinned, 'the pin was not stored');
  });

  test('list-search-content', async function (t) {
    await t.fresh({
      notes: notes([
        { id: 1, title: 'بىرىنچى', text: 'بۇ يەردە ئالتۇن ئاچقۇچ بار' },
        { id: 2, title: 'ئىككىنچى', text: 'باشقا نەرسە' }
      ])
    });
    const box = document.getElementById('notes-list-search');
    box.value = 'ئالتۇن ئاچقۇچ';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await t.sleep(400);
    t.assert.ok(window.FAKE.calls.some(function (c) { return c[0] === 'notesSearch' && c[1] === 'ئالتۇن ئاچقۇچ'; }),
      'the search did not go to the main process');
    t.assert.deepEqual(itemTitles(), ['بىرىنچى'], 'a note found by its text is not listed');

    box.value = '';
    box.dispatchEvent(new Event('input', { bubbles: true }));
    await t.sleep(400);
    t.assert.equal(itemTitles().length, 2, 'clearing the search did not bring the list back');
  });

  test('list-discard-untouched', async function (t) {
    await t.fresh({});
    await window.notesCreate();
    await t.sleep(30);
    const created = window.S.notes.curDoc.id;
    t.assert.ok(window.FAKE.notes[created], 'the new note was not created');

    await window.notesOpen(1);
    await t.sleep(30);
    t.assert.ok(!window.FAKE.notes[created], 'an untouched new note stayed behind');

    // A new note that was written in stays.
    await window.notesCreate();
    await t.sleep(30);
    const kept = window.S.notes.curDoc.id;
    t.caretToEnd();
    t.type('بىر نەرسە');
    await window.notesOpen(1);
    await t.sleep(30);
    t.assert.ok(window.FAKE.notes[kept], 'a new note with text in it was removed');
  });
})();
