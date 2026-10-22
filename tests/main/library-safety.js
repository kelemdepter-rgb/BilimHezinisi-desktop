// ============================================================================
// K4 — the library is never changed by omission.
//
// save-library used to sync the WHOLE book list the renderer sent: any book
// missing from it was deleted, with its text, bookmarks, notes and position.
// And load-library returned `books: []` if any ONE of its eight reads failed,
// so a single failed read at startup meant the next save — a theme change, a
// page turn — would delete every book. These tests run the real database
// module on a throwaway directory through the same functions main.js calls.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

function fresh(ctx, name) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return database.initDB(dir).then(function () { return database; });
}

function addTwoBooks(database) {
  const a = database.addBook('بىرىنچى كىتاب', '', 'باشقا', 'TXT', '2026-10-22', '', 'بىرىنچى كىتابنىڭ مەزمۇنى', 'h-a');
  const b = database.addBook('ئىككىنچى كىتاب', '', 'باشقا', 'TXT', '2026-10-22', '', 'ئىككىنچى كىتابنىڭ مەزمۇنى', 'h-b');
  return { a: a, b: b };
}

function asFrontendBook(row) {
  return { id: row.id, title: row.title, author: row.author, category: row.category,
           format: row.format, date: row.date, desc: row.description || '' };
}

module.exports = function (suite, assert, ctx) {
  const sync = function () { return require(path.join(ctx.root, 'library-sync.js')); };

  suite.test('sync-never-deletes', async function () {
    const database = await fresh(ctx, 'sync-never-deletes');
    const ids = addTwoBooks(database);
    database.addBookmark(ids.b, 'خەتكۈچ', 40);

    // The renderer sends a list that lacks the second book.
    const only = database.getAllBooks().filter(function (b) { return b.id === ids.a; }).map(asFrontendBook);

    // First the database function itself — the one that used to do the deleting.
    database.syncBooks(only);
    assert.equal(database.getAllBooks().length, 2, 'syncBooks() deleted a book missing from the list');

    // Then the whole save-library path main.js runs.
    const state = sync().createState();
    sync().loadLibrary(database, state);
    sync().saveLibrary(database, { books: only }, state);

    assert.equal(database.getAllBooks().length, 2, 'save-library deleted a book missing from the list');
    assert.equal(database.getBookContent(ids.b), 'ئىككىنچى كىتابنىڭ مەزمۇنى', 'the missing book lost its text');
    assert.equal(database.getBookmarks(ids.b).length, 1, 'the missing book lost its bookmark');
    database.close();
  });

  suite.test('delete-book-cascade', async function () {
    const database = await fresh(ctx, 'delete-book-cascade');
    const ids = addTwoBooks(database);
    database.addBookmark(ids.a, 'خەتكۈچ', 10);
    database.addNoteDB(ids.a, 'ئىزاھات', 10);
    database.saveReadingProgress(ids.a, 55, 3);
    database.addRecentRead(ids.a);

    database.deleteBook(ids.a);

    assert.ok(!database.getBook(ids.a), 'the book row is still there');
    assert.ok(!database.getBookContent(ids.a), 'the book text is still there');
    assert.equal(database.getBookmarks(ids.a).length, 0, 'its bookmarks are still there');
    assert.equal(database.getNotes(ids.a).length, 0, 'its notes are still there');
    assert.ok(!database.getReadingProgress(ids.a) || !database.getReadingProgress(ids.a).position,
      'its reading position is still there');
    assert.equal(database.getAllBooks().length, 1, 'the other book went with it');
    database.close();
  });

  suite.test('empty-book-list-refused', async function () {
    const database = await fresh(ctx, 'empty-book-list-refused');
    addTwoBooks(database);

    const state = sync().createState();
    sync().loadLibrary(database, state);
    const report = sync().saveLibrary(database, { books: [] }, state);

    assert.equal(database.getAllBooks().length, 2, 'an empty book list emptied the library');
    assert.ok(report && report.refused.indexOf('books') !== -1, 'the refusal was not reported');
    database.close();
  });

  // A part that never loaded in this session holds the renderer's fallback —
  // an empty object, not the user's data. It must never be written back.
  suite.test('failed-part-not-synced', async function () {
    const database = await fresh(ctx, 'failed-part-not-synced');
    const ids = addTwoBooks(database);
    database.addBookmark(ids.a, 'خەتكۈچ', 10);

    const broken = Object.create(database);
    broken.getAllBookmarksGrouped = function () { throw new Error('disk I/O error'); };

    const state = sync().createState();
    const loaded = sync().loadLibrary(broken, state);
    assert.deepEqual(loaded.loadErrors, ['bookmarks'], 'the failed read was not reported');
    assert.ok(Array.isArray(loaded.books) && loaded.books.length === 2,
      'one failed read took the book list down with it');

    const report = sync().saveLibrary(database, { books: loaded.books, bookmarks: {} }, state);
    assert.equal(database.getBookmarks(ids.a).length, 1, 'a part that failed to load was synced back empty');
    assert.ok(report.refused.indexOf('bookmarks') !== -1, 'the refusal was not reported');
    assert.ok(report.synced.indexOf('books') !== -1, 'the parts that did load were not saved');
    database.close();
  });

  // The renderer half (index.html is not loadable on its own, so this reads it).
  suite.test('renderer-library-writes', function () {
    const html = fs.readFileSync(path.join(ctx.root, 'src', 'index.html'), 'utf8');
    const body = function (name) {
      const at = html.search(new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\('));
      assert.ok(at >= 0, name + '() is gone');
      const open = html.indexOf('{', at);
      let depth = 0;
      for (let i = open; i < html.length; i++) {
        if (html[i] === '{') depth++;
        else if (html[i] === '}' && --depth === 0) return html.slice(open, i + 1);
      }
      return html.slice(open);
    };

    const del = body('delBook');
    assert.includes(del, 'dbDeleteBook(', 'deleting a book does not go through db-delete-book');
    const change = del.search(/S\.books\s*=/);
    assert.ok(change > 0 && del.indexOf('dbDeleteBook(') < change,
      'delBook() changes S.books before the database has deleted the book');

    assert.excludes(body('renderReaderPage'), 'saveData(',
      'every page turn still sends the whole library');
    assert.excludes(body('closeReader'), 'saveData(',
      'closing the reader still sends the whole library');
  });
};
