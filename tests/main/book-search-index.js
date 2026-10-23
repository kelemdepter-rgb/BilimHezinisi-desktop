// ============================================================================
// The book search index, built right — and search as it was (Phase 7, W18).
//
// book_fts was created with content_rowid='book_id' and no external content
// table. FTS5 then reads its own content through a column that does not
// exist: a row could not be deleted or counted («no such column: T.book_id»)
// and snippet() failed. Every book whose text or title changed kept its OLD
// words in the index (the delete threw, and the insert after it never ran),
// and search could not use the index at all.
//
// Migration step 5 drops the index and builds it again from books +
// book_content. It is derived data: no user data is touched, and the library
// is backed up before the step.
//
// The owner's decision (2026-10-23): search keeps finding what it finds now —
// any part of a word, in the title, the author or the text («كتاب» finds
// «الكتاب») — and now also finds words that are only in changed text, which
// it used to miss.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

/** The table as every library before 3.5 has it. */
const BROKEN_FTS = "CREATE VIRTUAL TABLE book_fts USING fts5(title, author, content, content_rowid='book_id', tokenize='unicode61')";

async function atStep(ctx, name, last) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({
    steps: last === undefined ? undefined : database.MIGRATIONS.filter(function (s) { return s.version <= last; }),
    beforeFirst: async function () {}
  });
  return { database: database, file: path.join(dir, 'library.db') };
}

function raw(ctx, file) {
  const Sqlite = require(path.join(ctx.root, 'node_modules', 'better-sqlite3'));
  return new Sqlite(file);
}

function ids(results) { return results.map(function (r) { return r.book.id; }).sort(); }

module.exports = function (suite, assert, ctx) {
  suite.test('fts-rebuilt-from-the-broken-table', async function () {
    const at = await atStep(ctx, 'fts-rebuild', 4);
    const database = at.database;
    // The broken index, with the books in it, as 3.4 left it.
    let r = raw(ctx, at.file);
    r.exec('DROP TABLE book_fts');
    r.exec(BROKEN_FTS);
    r.close();
    const a = Number(database.addBook('بىرىنچى كىتاب', 'ئاپتور', 'باشقا', 'TXT', '', '', 'ئىلىم نۇر', null));
    const b = Number(database.addBook('ئىككىنچى كىتاب', '', 'باشقا', 'TXT', '', '', 'جاھالەت قاراڭغۇلۇق', null));
    database.addBook('تېكىستسىز', '', 'باشقا', 'TXT', '', '', '', null);
    r = raw(ctx, at.file);
    let broken = '';
    try { r.prepare('DELETE FROM book_fts WHERE rowid=?').run(a); } catch (e) { broken = e.message; }
    r.close();
    assert.includes(broken, 'T.book_id', 'the fixture is not the broken table');

    let backups = 0;
    const ran = await database.runMigrations({ beforeFirst: async function () { backups++; } });
    assert.ok(ran.ran.indexOf(5) !== -1, 'the rebuild step did not run');
    assert.equal(backups, 1, 'the library was not backed up before the rebuild');

    // The step itself only lays the table down — a large library takes a
    // minute to index, and the window must not wait for it. The index is
    // filled afterwards, a little at a time (main.js, after the window).
    assert.ok(database.ftsRebuildPending(), 'nothing says the index still has to be filled');
    let steps = 0;
    while (!database.ftsRebuildStep(1).done) steps++;
    assert.ok(steps >= 2, 'the index was not filled a little at a time');
    assert.equal(database.ftsRebuildPending(), false, 'the index is still waiting after it was filled');

    r = raw(ctx, at.file);
    assert.equal(r.prepare('SELECT COUNT(*) AS n FROM book_fts').get().n, 2, 'the index does not hold exactly the books with text');
    assert.deepEqual(r.prepare("SELECT rowid FROM book_fts WHERE book_fts MATCH 'ئىلىم'").all().map(function (x) { return x.rowid; }), [a]);
    assert.ok(r.prepare("SELECT snippet(book_fts, 2, '[', ']', '…', 5) AS s FROM book_fts WHERE book_fts MATCH 'جاھالەت'").get().s.indexOf('[جاھالەت]') !== -1,
      'snippet() still fails');
    r.prepare('DELETE FROM book_fts WHERE rowid=?').run(b);
    assert.equal(r.prepare('SELECT COUNT(*) AS n FROM book_fts').get().n, 1, 'a row still cannot be deleted');
    r.close();
    database.close();
  });

  // The app can be closed while the index fills, and books can change.
  suite.test('fts-fill-resumes-and-keeps-changes', async function () {
    const at = await atStep(ctx, 'fts-resume', 4);
    let database = at.database;
    const made = [];
    for (let i = 0; i < 6; i++) made.push(Number(database.addBook('كىتاب ' + i, '', 'باشقا', 'TXT', '', '', 'كونا سۆز' + i, null)));
    await database.runMigrations({ beforeFirst: async function () {} });

    database.ftsRebuildStep(1);   // one book in, then the app is closed
    database.close();
    await database.initDB(path.dirname(at.file));
    database = require(path.join(ctx.root, 'database.js'));
    assert.ok(database.ftsRebuildPending(), 'the unfinished fill was forgotten on restart');

    // Meanwhile a book is changed and one is deleted.
    database.saveBookContent(made[4], 'يېڭى سۆز');
    database.deleteBook(made[5]);
    while (!database.ftsRebuildStep(1).done) { /* fill */ }

    const r = raw(ctx, at.file);
    const match = function (q) { return r.prepare('SELECT rowid FROM book_fts WHERE book_fts MATCH ?').all(q).map(function (x) { return x.rowid; }).sort(); };
    assert.deepEqual(match('كونا'), made.slice(0, 4), 'the index does not hold every book once');
    assert.deepEqual(match('يېڭى'), [made[4]], 'a book changed while the index filled has its old text');
    assert.equal(r.prepare('SELECT COUNT(*) AS n FROM book_fts').get().n, 5, 'a deleted book, or a book twice, is in the index');
    r.close();
    database.close();
  });

  suite.test('search-unchanged-and-sees-changed-text', async function () {
    const at = await atStep(ctx, 'fts-search');
    const database = at.database;
    while (!database.ftsRebuildStep(1 << 20).done) { /* a fresh library: nothing to fill */ }
    const arabic = Number(database.addBook('عربي', '', 'باشقا', 'TXT', '', '', 'هذا هو الكتاب المبين', null));
    const uyghur = Number(database.addBook('ئۇيغۇرچە', 'مۇئەللىپ', 'باشقا', 'TXT', '', '', 'كىتابلارنى ئوقۇش پايدىلىق', null));

    // Any part of a word, as before: inside «الكتاب», inside «كىتابلارنى».
    assert.deepEqual(ids(database.searchBooks('كتاب')), [arabic], 'a part of a word is no longer found');
    assert.deepEqual(ids(database.searchBooks('تابلار')), [uyghur]);
    const hit = database.searchBooks('ئوقۇش')[0];
    assert.equal(hit.book.id, uyghur);
    assert.ok(hit.inC && hit.snip.indexOf('ئوقۇش') !== -1 && hit.pos === 'كىتابلارنى '.length, 'the result lost its snippet or its place');
    assert.deepEqual(ids(database.searchBooks('مۇئەللىپ')), [uyghur], 'the author is no longer searched');
    assert.equal(database.searchBooks('مۇئەللىپ')[0].inA, true);

    // Words only in changed text: found now, where the index used to miss them.
    database.saveBookContent(uyghur, 'يېڭى تېكىست — ھېكمەت خەزىنىسى');
    assert.deepEqual(ids(database.searchBooks('ھېكمەت')), [uyghur], 'a word only in the changed text is not found');
    assert.deepEqual(ids(database.searchBooks('ئوقۇش')), [], 'the old text is still found');

    // And the index itself follows: text, title, deletion.
    database.updateBook(uyghur, 'يېڭى ماۋزۇ', '', 'باشقا', '');
    const r = raw(ctx, at.file);
    const match = function (q) { return r.prepare('SELECT rowid FROM book_fts WHERE book_fts MATCH ?').all(q).map(function (x) { return x.rowid; }); };
    assert.deepEqual(match('ھېكمەت'), [uyghur], 'the index did not take the new text');
    assert.deepEqual(match('ئوقۇش'), [], 'the index kept the old text');
    assert.deepEqual(match('ماۋزۇ'), [uyghur], 'the index did not take the new title');
    database.deleteBook(arabic);
    assert.deepEqual(match('الكتاب'), [], 'a deleted book stayed in the index');
    r.close();
    database.close();
  });
};
