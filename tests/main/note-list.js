// ============================================================================
// W2, W3, K13 — the notebook's list and its trash.
//
// Deleting a note used to be permanent after one confirm(); the list searched
// titles only, could not be sorted or pinned, and every abandoned «يېڭى خاتىرە»
// stayed in it. Migration step 2 adds deleted_at and pinned; these are the
// rules of what database.js does with them.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 9, 0, 0);

async function fresh(ctx, name) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({ beforeFirst: async function () {} });
  return database;
}

function note(database, title, text) {
  const id = Number(database.notesCreate(title));
  database.notesUpdate(id, title, '<p>' + (text || '') + '</p>', text || '');
  return id;
}

function ids(list) { return list.map(function (n) { return n.id; }); }

module.exports = function (suite, assert, ctx) {
  suite.test('notes-trash-restore', async function () {
    const database = await fresh(ctx, 'notes-trash');
    assert.ok(database.schemaVersion() >= 2, 'migration step 2 did not run');
    const a = note(database, 'بىرىنچى', 'مەزمۇن');
    const b = note(database, 'ئىككىنچى', 'باشقا مەزمۇن');
    const before = database.notesGet(a).updated_at;

    assert.ok(database.notesTrash(a, T0), 'the note was not moved to the trash');
    assert.deepEqual(ids(database.notesGetAll()), [b], 'a trashed note is still in the list');
    const trash = database.notesTrashList();
    assert.deepEqual(ids(trash), [a], 'the trashed note is not in the trash');
    assert.ok(trash[0].deleted_at, 'the trash does not say when');
    assert.equal(database.notesGet(a).updated_at, before, 'moving to the trash changed updated_at');
    assert.ok(database.notesGet(a).deleted_at, 'a trashed note does not say it is trashed');

    assert.equal(database.notesUpdate(a, 'بىرىنچى', '<p>x</p>', 'x'), 0, 'a trashed note was written to');

    assert.ok(database.notesRestore(a), 'the note was not restored');
    assert.deepEqual(ids(database.notesGetAll()).sort(), [a, b].sort(), 'the restored note is not back in the list');
    assert.equal(database.notesGet(a).updated_at, before, 'restoring changed updated_at');

    assert.ok(database.notesSetPinned(a, true), 'the note was not pinned');
    assert.equal(database.notesGetAll().filter(function (n) { return n.id === a; })[0].pinned, 1, 'the list does not say it is pinned');
    assert.equal(database.notesGet(a).updated_at, before, 'pinning changed updated_at');
    database.close();
  });

  suite.test('notes-delete-forever-only-from-trash', async function () {
    const database = await fresh(ctx, 'notes-forever');
    const a = note(database, 'بىر', 'a');
    const b = note(database, 'ئىككى', 'b');
    const c = note(database, 'ئۈچ', 'c');
    database.noteVersionKeep(a, 'open', 'بىر', '<p>a</p>', 'a', T0);
    database.setSetting('spell_ignore_note_' + a, '["سۆز"]');

    assert.ok(!database.notesDeleteForever(b), 'a note that is not in the trash was deleted for ever');
    assert.ok(database.notesGet(b), 'a note that is not in the trash was deleted for ever');

    database.notesTrash(a, T0);
    assert.ok(database.notesDeleteForever(a), 'a trashed note was not deleted');
    assert.ok(!database.notesGet(a), 'the note is still there');
    assert.equal(database.noteVersionList(a).length, 0, 'its versions were left behind');
    assert.equal(database.getSetting('spell_ignore_note_' + a, null), null, 'its ignored words were left behind');

    database.notesTrash(b, T0);
    database.notesTrash(c, T0);
    database.notesRestore(c);
    assert.equal(database.notesEmptyTrash(), 1, 'emptying the trash did not report what it removed');
    assert.ok(!database.notesGet(b), 'emptying the trash left a trashed note');
    assert.ok(database.notesGet(c), 'emptying the trash removed a note that is not in it');
    database.close();
  });

  suite.test('notes-purge-30-days', async function () {
    const database = await fresh(ctx, 'notes-purge');
    const a = note(database, 'كونا', 'a');
    const b = note(database, 'يېڭى', 'b');
    database.notesTrash(a, T0);
    database.notesTrash(b, T0 + 20 * DAY);

    assert.equal(database.notesPurgeTrash(T0 + 29 * DAY), 0, 'a note was purged before 30 days');
    assert.equal(database.notesPurgeTrash(T0 + 31 * DAY), 1, 'a note 31 days in the trash was not purged');
    assert.ok(!database.notesGet(a), 'the old note is still there');
    assert.ok(database.notesGet(b), 'a note 11 days in the trash was purged');
    database.close();
  });

  suite.test('notes-search-content', async function () {
    const database = await fresh(ctx, 'notes-search');
    const a = note(database, 'ئادەتتىكى ماۋزۇ', 'بۇ يەردە ئالتۇن ئاچقۇچ دېگەن سۆز بار');
    const b = note(database, 'ئالتۇن ئاچقۇچ ھەققىدە', 'مەزمۇن');
    const c = note(database, 'Report 100% done', 'english text');
    const d = note(database, 'ئەخلەتتىكى', 'ئالتۇن ئاچقۇچ');
    database.notesTrash(d, T0);
    database.notesSetPinned(a, true);

    const found = database.notesSearch('ئالتۇن ئاچقۇچ');
    assert.ok(found.ok, 'the search was refused');
    assert.deepEqual(ids(found.notes), [a, b], 'the content was not searched, or pinned did not come first, or the trash was searched');
    assert.deepEqual(ids(database.notesSearch('100%').notes), [c], 'a % in the phrase was not taken literally');
    assert.deepEqual(ids(database.notesSearch('REPORT').notes), [c], 'the search is not case-insensitive');
    assert.equal(database.notesSearch('ئ').ok, false, 'a one-letter search was run');
    assert.equal(database.notesSearch('x'.repeat(101)).ok, false, 'a 101-character search was run');

    for (let i = 0; i < 60; i++) note(database, 'تىزىملىك ' + i, 'ئورتاق سۆز');
    assert.equal(database.notesSearch('ئورتاق سۆز').notes.length, 50, 'more than 50 results came back');
    database.close();
  });

  suite.test('notes-preview-and-discard', async function () {
    const database = await fresh(ctx, 'notes-preview');
    const long = 'بىرىنچى قۇر\nئىككىنچى قۇر ' + 'ئۇزۇن '.repeat(60);
    const a = note(database, 'ماۋزۇ', long);
    const row = database.notesGetAll().filter(function (n) { return n.id === a; })[0];
    assert.ok(row.preview.indexOf('بىرىنچى قۇر ئىككىنچى قۇر') === 0, 'the preview is not the text on one line');
    assert.ok(row.preview.length <= 120, 'the preview is longer than 120 characters');

    const empty = Number(database.notesCreate('يېڭى خاتىرە'));
    const named = Number(database.notesCreate('مېنىڭ ماۋزۇيۇم'));
    const written = note(database, 'يېڭى خاتىرە', 'بىر نەرسە يېزىلغان');
    assert.ok(database.notesDiscardIfEmpty(empty), 'an untouched new note was not removed');
    assert.ok(!database.notesGet(empty), 'an untouched new note was not removed');
    assert.ok(!database.notesDiscardIfEmpty(named), 'a note with its own title was removed');
    assert.ok(!database.notesDiscardIfEmpty(written), 'a note with text was removed');
    assert.ok(database.notesGet(named) && database.notesGet(written), 'a note with something in it was removed');
    database.close();
  });
};
