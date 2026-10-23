// ============================================================================
// K5, W16 — the place is stored.
//
// Migration step 3 adds char_offset to bookmarks, notes and reading_progress:
// a character offset into the book's whole text, where the paragraph begins.
// Rows from before it have none (NULL), and say so — they are never given a
// place they did not have. Two more things must not lose it: the renderer's
// whole-library save (syncBookmarks / syncNotes replace every row) and the
// reading-position part of that save, which used INSERT OR REPLACE and would
// have wiped the exact place on every theme change.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

async function fresh(ctx, name, steps) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({ steps: steps, beforeFirst: async function () {} });
  return database;
}

function bookIn(database) {
  return Number(database.addBook('سىناق كىتابى', '', 'باشقا', 'TXT', '', '', 'مەزمۇن', null));
}

function byName(list, key) {
  const out = {};
  (list || []).forEach(function (item) { out[item[key]] = item; });
  return out;
}

module.exports = function (suite, assert, ctx) {
  suite.test('offsets-migration-keeps-old-rows', async function () {
    // A library as 3.4 left it: the first two steps only, with a bookmark, a
    // note and a reading position in it.
    const database = await fresh(ctx, 'offsets-migration',
      require(path.join(ctx.root, 'database.js')).MIGRATIONS.filter(function (s) { return s.version <= 2; }));
    const id = bookIn(database);
    database.addBookmark(id, 'كونا خەتكۈچ', 40);
    database.addNoteDB(id, 'كونا ئىزاھات', 12);
    // The reading position as 3.4 wrote it — this code's own writer already
    // names the new column, so the row goes in through a second connection.
    const Sqlite = require(path.join(ctx.root, 'node_modules', 'better-sqlite3'));
    const raw = new Sqlite(path.join(ctx.tmpDir, 'offsets-migration', 'library.db'));
    raw.prepare('INSERT INTO reading_progress (book_id, position, page) VALUES (?, ?, ?)').run(id, 33, 4);
    raw.close();

    let backups = 0;
    const r = await database.runMigrations({ beforeFirst: async function () { backups++; } });
    assert.ok(r.ran.indexOf(3) !== -1, 'the offsets step did not run');
    assert.equal(backups, 1, 'the library was not backed up before the step');

    const bm = database.getAllBookmarksGrouped()[id];
    assert.deepEqual(bm.map(function (b) { return [b.name, b.pos, b.off]; }), [['كونا خەتكۈچ', 40, null]],
      'an old bookmark changed, or was given a place it never had');
    const notes = database.getAllNotesGrouped()[id];
    assert.deepEqual(notes.map(function (n) { return [n.text, n.pos, n.off]; }), [['كونا ئىزاھات', 12, null]]);
    const p = database.getReadingProgress(id);
    assert.deepEqual([p.position, p.page, p.char_offset], [33, 4, null], 'the reading position changed');
    database.close();
  });

  suite.test('offsets-sync-keeps-the-place', async function () {
    const database = await fresh(ctx, 'offsets-sync');
    const id = bookIn(database);
    const when = '2026-10-23T10:00:00.000Z';

    // What saveData() sends: every bookmark of every book, the new ones with
    // their place, an old one without.
    const books = {};
    books[id] = [
      { id: '1', name: '30-بەت', pos: 40, off: 91234, date: when },
      { id: '2', name: 'كونا', pos: 12, date: when },
      { id: '3', name: 'مەنپىي', pos: 1, off: -3, date: when },
      { id: '4', name: 'خەت', pos: 1, off: '12', date: when }
    ];
    database.syncBookmarks(books);
    const bm = byName(database.getAllBookmarksGrouped()[id], 'name');
    assert.equal(bm['30-بەت'].off, 91234, 'the place was lost on the round trip');
    assert.equal(bm['كونا'].off, null, 'an old bookmark was given a place');
    assert.equal(bm['مەنپىي'].off, null, 'a negative offset was stored');
    assert.equal(bm['خەت'].off, null, 'a string was stored as an offset');
    assert.equal(bm['30-بەت'].date, when, 'the date was lost');

    const notes = {};
    notes[id] = [{ id: '9', text: 'ئىزاھات', pos: 40, off: 5000, date: when }, { id: '8', text: 'كونا', pos: 3, date: when }];
    database.syncNotes(notes);
    const nt = byName(database.getAllNotesGrouped()[id], 'text');
    assert.equal(nt['ئىزاھات'].off, 5000);
    assert.equal(nt['كونا'].off, null);
    database.close();
  });

  // If the backup before the step fails, the step does not run — and the
  // library must go on saving bookmarks and the position the way it did.
  suite.test('offsets-without-the-step', async function () {
    const database = await fresh(ctx, 'offsets-without-step',
      require(path.join(ctx.root, 'database.js')).MIGRATIONS.filter(function (s) { return s.version <= 2; }));
    const id = bookIn(database);
    const books = {};
    books[id] = [{ id: '1', name: 'خەتكۈچ', pos: 40, off: 91234, date: '2026-10-23T10:00:00.000Z' }];
    database.syncBookmarks(books);
    assert.deepEqual(database.getAllBookmarksGrouped()[id].map(function (b) { return [b.name, b.off]; }), [['خەتكۈچ', null]],
      'bookmarks no longer save in a library without the step');
    database.syncNotes(books);
    database.saveReadingProgress(id, 40, 12, 91234);
    const pos = {};
    pos[id] = 41;
    database.syncReadingProgress(pos);
    assert.equal(database.getReadingProgress(id).position, 41, 'the position no longer saves in a library without the step');
    database.close();
  });

  suite.test('progress-keeps-the-place', async function () {
    const database = await fresh(ctx, 'progress-place');
    const id = bookIn(database);

    database.saveReadingProgress(id, 40, 12, 91234);
    let p = database.getReadingProgress(id);
    assert.deepEqual([p.position, p.page, p.char_offset], [40, 12, 91234], 'the exact place was not stored');

    // saveData() sends every book's percentage along with the library. The
    // same percentage must leave the exact place alone.
    const same = {};
    same[id] = 40;
    database.syncReadingProgress(same);
    p = database.getReadingProgress(id);
    assert.deepEqual([p.position, p.page, p.char_offset], [40, 12, 91234], 'saving the library wiped the exact place');

    // A different one makes the old place stale.
    const moved = {};
    moved[id] = 55;
    database.syncReadingProgress(moved);
    p = database.getReadingProgress(id);
    assert.equal(p.position, 55);
    assert.equal(p.char_offset, null, 'a stale place survived a new position');
    assert.equal(database.getAllReadingProgress()[id], 55);

    database.saveReadingProgress(id, 10, 2);
    assert.equal(database.getReadingProgress(id).char_offset, null, 'a position without a place kept the old place');
    database.close();
  });
};
