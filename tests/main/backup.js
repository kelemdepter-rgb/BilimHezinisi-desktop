// ============================================================================
// Backup, restore and the migrations framework (audit §4.5).
//
// The library holds every book's text, every note and every bookmark, and
// before v3.5 there was no way to copy it out and back. These run the real
// database module and backup.js on throwaway directories.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

function dirFor(ctx, name) {
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function freshDb(ctx, name) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = dirFor(ctx, name);
  await database.initDB(dir);
  return { database: database, dir: dir };
}

function counts(file) {
  const Database = require('better-sqlite3');
  const db = new Database(file, { readonly: true, fileMustExist: true });
  try {
    return {
      books: db.prepare('SELECT COUNT(*) AS n FROM books').get().n,
      content: db.prepare('SELECT COUNT(*) AS n FROM book_content').get().n,
      bookmarks: db.prepare('SELECT COUNT(*) AS n FROM bookmarks').get().n,
      notes: db.prepare('SELECT COUNT(*) AS n FROM note_documents').get().n
    };
  } finally { db.close(); }
}

module.exports = function (suite, assert, ctx) {
  const backup = function () { return require(path.join(ctx.root, 'backup.js')); };

  suite.test('backup-copy', async function () {
    const env = await freshDb(ctx, 'backup-copy');
    const database = env.database;
    const id = database.addBook('زاپاس كىتابى', '', 'باشقا', 'TXT', '2026-10-22', '', 'مەزمۇن', 'h-1');
    database.addBook('يەنە بىر كىتاب', '', 'باشقا', 'TXT', '2026-10-22', '', 'مەزمۇن ٢', 'h-2');
    database.addBookmark(id, 'خەتكۈچ', 5);
    database.notesCreate('خاتىرە');

    const file = path.join(env.dir, 'copy.db');
    await database.backupTo(file);
    const live = counts(path.join(env.dir, 'library.db'));
    const copy = counts(file);
    assert.deepEqual(copy, live, 'the backup does not hold what the library holds');
    assert.equal(copy.books, 2, 'the backup lost books');

    const check = backup().validateLibraryFile(file);
    assert.ok(check.ok, 'a fresh backup does not pass the restore check: ' + check.reason);
    assert.equal(check.counts.books, 2, 'the restore check counted the books wrong');
    database.close();
  });

  suite.test('restore-validation', async function () {
    const dir = dirFor(ctx, 'restore-validation');

    const text = path.join(dir, 'not-a-database.db');
    fs.writeFileSync(text, 'this is not a database, it only has the extension of one\n'.repeat(50));
    const a = backup().validateLibraryFile(text);
    assert.ok(!a.ok, 'a text file passed the restore check');
    assert.equal(a.reason, 'not-sqlite', 'a text file was not recognised as one');

    const Database = require('better-sqlite3');
    const other = path.join(dir, 'other-app.db');
    const db = new Database(other);
    db.exec('CREATE TABLE something_else (id INTEGER PRIMARY KEY, name TEXT)');
    db.close();
    const b = backup().validateLibraryFile(other);
    assert.ok(!b.ok, 'a database without the library tables passed the restore check');
    assert.equal(b.reason, 'missing-tables', 'a foreign database was not recognised as one');

    const missing = backup().validateLibraryFile(path.join(dir, 'nowhere.db'));
    assert.ok(!missing.ok, 'a file that does not exist passed the restore check');
  });

  // The framework Phases 3-7 add their schema changes to. Here with steps of
  // the test's own, to prove the order: backup first, then each step in its own
  // transaction, and nothing at all when the backup fails.
  suite.test('migrations-backup-first', async function () {
    const env = await freshDb(ctx, 'migrations');
    const database = env.database;
    const calls = [];
    const steps = [
      { version: 1, name: 'one', up: function (db) { calls.push('step 1'); db.exec('CREATE TABLE IF NOT EXISTS t_one (x INTEGER)'); } },
      { version: 2, name: 'two', up: function (db) { calls.push('step 2'); db.exec('CREATE TABLE IF NOT EXISTS t_two (x INTEGER)'); } }
    ];

    // A failing backup stops everything.
    let threw = false;
    try {
      await database.runMigrations({ steps: steps, beforeFirst: async function () { calls.push('backup'); throw new Error('disk full'); } });
    } catch (e) { threw = true; }
    assert.ok(threw, 'a failed backup did not stop the migration');
    assert.equal(database.schemaVersion(), 0, 'a step ran although the backup failed');
    assert.deepEqual(calls, ['backup'], 'a step ran although the backup failed');

    calls.length = 0;
    const result = await database.runMigrations({
      steps: steps,
      beforeFirst: async function (from, to) { calls.push('backup ' + from + '→' + to); }
    });
    assert.deepEqual(calls, ['backup 0→2', 'step 1', 'step 2'], 'not backup first, then the steps in order');
    assert.equal(database.schemaVersion(), 2, 'user_version did not follow the steps');
    assert.deepEqual(result.ran, [1, 2], 'the result does not list the steps that ran');

    calls.length = 0;
    await database.runMigrations({ steps: steps, beforeFirst: async function () { calls.push('backup'); } });
    assert.deepEqual(calls, [], 'a second run backed up or migrated again');

    // A step that throws leaves its own changes out and stops the rest.
    const bad = steps.concat([
      { version: 3, name: 'bad', up: function (db) { db.exec('CREATE TABLE t_three (x INTEGER)'); throw new Error('broken step'); } },
      { version: 4, name: 'after', up: function () { calls.push('step 4'); } }
    ]);
    threw = false;
    try { await database.runMigrations({ steps: bad, beforeFirst: async function () {} }); }
    catch (e) { threw = true; }
    assert.ok(threw, 'a broken step did not fail the run');
    assert.equal(database.schemaVersion(), 2, 'a broken step moved user_version');
    const Database = require('better-sqlite3');
    const peek = new Database(path.join(env.dir, 'library.db'), { readonly: true });
    const t3 = peek.prepare("SELECT name FROM sqlite_master WHERE name='t_three'").get();
    peek.close();
    assert.ok(!t3, 'a broken step left half its changes behind');
    assert.deepEqual(calls, [], 'the steps after a broken one ran');
    database.close();
  });

  suite.test('auto-backup-rotation', async function () {
    const env = await freshDb(ctx, 'auto-backup');
    const database = env.database;
    database.addBook('كىتاب', '', 'باشقا', 'TXT', '2026-10-22', '', 'مەزمۇن', 'h-1');
    const dir = path.join(env.dir, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    for (const day of ['2026-09-01', '2026-09-08', '2026-09-15']) {
      fs.writeFileSync(path.join(dir, 'auto-' + day + '.db'), 'old');
    }
    fs.writeFileSync(path.join(dir, 'BilimHezinisi-2026-09-02-1000.db'), 'manual');

    // Two days after the newest: nothing to do.
    let r = await backup().autoBackupIfDue(database, dir, new Date('2026-09-17T10:00:00'));
    assert.ok(!r.made, 'an automatic backup was made two days after the last one');

    // More than a week after the newest: a new one, and only three are kept.
    r = await backup().autoBackupIfDue(database, dir, new Date('2026-10-22T10:00:00'));
    assert.ok(r.made, 'no automatic backup a week after the last one');
    const autos = fs.readdirSync(dir).filter(function (f) { return /^auto-.*\.db$/.test(f); }).sort();
    assert.deepEqual(autos, ['auto-2026-09-08.db', 'auto-2026-09-15.db', 'auto-2026-10-22.db'],
      'the automatic backups were not rotated to the newest three');
    assert.ok(fs.existsSync(path.join(dir, 'BilimHezinisi-2026-09-02-1000.db')),
      'the rotation removed a manual backup');
    assert.equal(counts(path.join(dir, 'auto-2026-10-22.db')).books, 1, 'the automatic backup is not a copy of the library');
    assert.ok(!fs.readdirSync(dir).some(function (f) { return /\.tmp$/.test(f); }), 'a temporary file was left behind');

    const info = backup().folderInfo(dir);
    assert.equal(info.count, 4, 'the backup folder was counted wrong');
    assert.ok(info.bytes > 0, 'the backup folder size is zero');
    database.close();
  });

  suite.test('restore-replaces-file', async function () {
    const env = await freshDb(ctx, 'restore-replace');
    const database = env.database;
    database.addBook('زاپاستىكى كىتاب', '', 'باشقا', 'TXT', '2026-10-22', '', 'مەزمۇن', 'h-1');
    const saved = path.join(env.dir, 'saved.db');
    await database.backupTo(saved);
    database.addBook('كېيىن قوشۇلغان', '', 'باشقا', 'TXT', '2026-10-22', '', 'مەزمۇن ٢', 'h-2');

    const live = path.join(env.dir, 'library.db');
    database.checkpoint();
    database.close();
    fs.writeFileSync(live + '-wal', 'stale');
    fs.writeFileSync(live + '-shm', 'stale');

    backup().replaceLibraryFile(saved, live);
    assert.ok(!fs.existsSync(live + '-wal') && !fs.existsSync(live + '-shm'),
      'stale -wal/-shm files were left next to the restored library');
    assert.equal(counts(live).books, 1, 'the library is not the backup after the restore');

    await database.initDB(env.dir);
    assert.equal(database.getAllBooks().length, 1, 'the restored library does not open');
    database.close();
  });
};
