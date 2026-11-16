// ============================================================================
// 3.6.1 Phase 1 — a book opens at once.
//
// Opening a book put it on the recent list through saveData(), which sends the
// whole library back to save-library. syncBooks() then ran upsertBook() for
// EVERY book, and upsertBook() deleted and re-inserted each book's row in the
// search index — FTS5 tokenizing the full text of every book, synchronously, in
// the main process. load-book-content waited behind it: 4.7–4.9 s for a
// library of 100 books (measured 2026-11-16). Before migration step 5 (3.5) the
// index's DELETE threw at once and the re-index was skipped by accident; the
// rebuilt index made it real.
//
// So: a book is written only when one of its fields changed, its index row
// only when its title or author changed (the text did not — the text has its
// own writers), and opening a book writes one row of the recent list, never
// the library.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

function fresh(ctx, name) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  return database.initDB(dir).then(function () {
    return { database: database, file: path.join(dir, 'library.db') };
  });
}

function raw(ctx, file) {
  const Sqlite = require(path.join(ctx.root, 'node_modules', 'better-sqlite3'));
  return new Sqlite(file);
}

/**
 * Uyghur-looking text of `length` characters, the same for the same seed:
 * words of one to three syllables, so the index has many distinct terms to
 * tokenize, as a real book does.
 */
function bookText(seed, length) {
  const cons = 'بپتجچخدرزسشغقكگڭلمنھۋي';
  const vows = 'اەېىوۇۆۈ';
  let s = (seed * 2654435761) >>> 0 || 1;
  const next = function (n) { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s >>> 8) % n; };
  const out = [];
  let size = 0;
  let words = 0;
  while (size < length) {
    let w = '';
    const syllables = 1 + next(3);
    for (let k = 0; k < syllables; k++) {
      w += cons[next(cons.length)] + vows[next(vows.length)];
      if (next(3) === 0) w += cons[next(cons.length)];
    }
    words++;
    const sep = words % 12 === 0 ? '\n' : ' ';
    out.push(w + sep);
    size += w.length + 1;
  }
  return out.join('').slice(0, length);
}

/** The renderer's book, as load-library hands it over. */
function asFrontendBook(row) {
  return { id: row.id, title: row.title, author: row.author, category: row.category,
           format: row.format, date: row.date, desc: row.description || '' };
}

/** Everything load-library returned, sent back as saveData() sends it. */
function savePayload(loaded) {
  return {
    books: loaded.books.map(asFrontendBook),
    cats: loaded.cats,
    nid: loaded.nid,
    theme: loaded.theme,
    recent: loaded.recent,
    readPos: loaded.readPos,
    bookmarks: loaded.bookmarks,
    notes: loaded.notes
  };
}

function indexTop(r) {
  const row = r.prepare('SELECT MAX(id) AS m FROM book_fts_data').get();
  return row ? row.m : null;
}

function updatedAt(r) {
  const out = {};
  for (const row of r.prepare('SELECT id, updated_at FROM books').all()) out[row.id] = row.updated_at;
  return out;
}

function ftsIds(r, match) {
  return r.prepare('SELECT rowid FROM book_fts WHERE book_fts MATCH ? ORDER BY rowid').all(match)
    .map(function (row) { return row.rowid; });
}

const OLD_TIME = '2020-01-01 00:00:00';

module.exports = function (suite, assert, ctx) {
  const sync = function () { return require(path.join(ctx.root, 'library-sync.js')); };

  // What every saveData() does — opening a book, a theme change, a bookmark,
  // the add-book dialog — with nothing about the books changed.
  suite.test('library-save-skips-unchanged-books', async function () {
    const at = await fresh(ctx, 'save-skips-unchanged');
    const database = at.database;
    const BOOKS = 40;
    const CHARS = 250000;
    for (let i = 1; i <= BOOKS; i++) {
      database.addBook('كىتاب ' + i, 'ئاپتور ' + (i % 7), 'باشقا', 'TXT', '2026-11-16', 'چۈشەندۈرۈش ' + i,
        bookText(i, CHARS), 'h-' + i);
    }
    let r = raw(ctx, at.file);
    r.prepare('UPDATE books SET updated_at=?').run(OLD_TIME);
    const before = updatedAt(r);
    const topBefore = indexTop(r);
    r.close();

    const state = sync().createState();
    const loaded = sync().loadLibrary(database, state);
    assert.deepEqual(loaded.loadErrors, [], 'the library did not load');
    assert.equal(loaded.books.length, BOOKS);

    const started = Date.now();
    const report = sync().saveLibrary(database, savePayload(loaded), state);
    const took = Date.now() - started;
    assert.ok(report.synced.indexOf('books') !== -1, 'the books were not saved: ' + JSON.stringify(report));

    r = raw(ctx, at.file);
    const after = updatedAt(r);
    const topAfter = indexTop(r);
    r.close();
    const touched = Object.keys(before).filter(function (id) { return after[id] !== before[id]; });

    const problems = [];
    if (touched.length) problems.push(touched.length + ' of ' + BOOKS + ' unchanged books were written (updated_at)');
    if (topAfter !== topBefore) problems.push('the search index was rewritten (book_fts_data ' + topBefore + ' → ' + topAfter + ')');
    if (took > 250) problems.push('the save took ' + took + ' ms');
    assert.equal(problems.join('; '), '',
      'saving a library of ' + BOOKS + ' unchanged books × ' + CHARS + ' chars (' + took + ' ms)');
    database.close();
  });

  suite.test('library-save-title-change-reindexes', async function () {
    const at = await fresh(ctx, 'save-title-change');
    const database = at.database;
    const a = Number(database.addBook('بىرىنچى كىتاب', 'ئاپتور', 'باشقا', 'TXT', '2026-11-16', '', 'ئىلىم نۇر مەرىپەت', 'h-a'));
    const b = Number(database.addBook('كونىماۋزۇ', 'كونائاپتور', 'باشقا', 'TXT', '2026-11-16', '', 'جاھالەت قاراڭغۇلۇق', 'h-b'));
    let r = raw(ctx, at.file);
    r.prepare('UPDATE books SET updated_at=?').run(OLD_TIME);
    r.close();

    const state = sync().createState();
    const loaded = sync().loadLibrary(database, state);
    const payload = savePayload(loaded);
    payload.books.forEach(function (bk) { if (bk.id === b) bk.title = 'يېڭىماۋزۇ'; });
    sync().saveLibrary(database, payload, state);

    r = raw(ctx, at.file);
    assert.deepEqual(ftsIds(r, 'title : "يېڭىماۋزۇ"'), [b], 'the index does not know the new title');
    assert.deepEqual(ftsIds(r, 'title : "كونىماۋزۇ"'), [], 'the index still holds the old title');
    assert.deepEqual(ftsIds(r, 'content : "قاراڭغۇلۇق"'), [b], 'the book\'s text left the index with the old title');
    const times = updatedAt(r);
    r.close();
    assert.ok(times[b] !== OLD_TIME, 'the renamed book was not written');
    assert.equal(times[a], OLD_TIME, 'the book that did not change was written');
    assert.ok(database.searchBooks('يېڭىماۋزۇ').some(function (x) { return x.book.id === b; }), 'search does not find the new title');
    assert.ok(!database.searchBooks('كونىماۋزۇ').some(function (x) { return x.book.id === b; }), 'search still finds the old title');

    // The author is in the index too.
    const again = savePayload(sync().loadLibrary(database, state));
    again.books.forEach(function (bk) { if (bk.id === b) bk.author = 'يېڭىئاپتور'; });
    sync().saveLibrary(database, again, state);
    r = raw(ctx, at.file);
    assert.deepEqual(ftsIds(r, 'author : "يېڭىئاپتور"'), [b], 'the index does not know the new author');
    assert.deepEqual(ftsIds(r, 'author : "كونائاپتور"'), [], 'the index still holds the old author');
    assert.deepEqual(ftsIds(r, 'content : "قاراڭغۇلۇق"'), [b], 'the book\'s text left the index with the old author');
    r.close();
    database.close();
  });

  // A change the index does not hold — the category — writes the book, and
  // leaves its index row alone.
  suite.test('library-save-category-change-keeps-index', async function () {
    const at = await fresh(ctx, 'save-category-change');
    const database = at.database;
    const a = Number(database.addBook('بىرىنچى كىتاب', '', 'باشقا', 'TXT', '2026-11-16', '', bookText(1, 20000), 'h-a'));
    const b = Number(database.addBook('ئىككىنچى كىتاب', '', 'باشقا', 'TXT', '2026-11-16', '', bookText(2, 20000), 'h-b'));
    let r = raw(ctx, at.file);
    r.prepare('UPDATE books SET updated_at=?').run(OLD_TIME);
    const top = indexTop(r);
    r.close();

    const state = sync().createState();
    const payload = savePayload(sync().loadLibrary(database, state));
    payload.books.forEach(function (bk) { if (bk.id === b) bk.category = 'تارىخ'; });
    sync().saveLibrary(database, payload, state);

    assert.equal(database.getBook(b).category, 'تارىخ', 'the new category was not saved');
    r = raw(ctx, at.file);
    const times = updatedAt(r);
    const topAfter = indexTop(r);
    r.close();
    assert.ok(times[b] !== OLD_TIME, 'the changed book was not written');
    assert.equal(times[a], OLD_TIME, 'the book that did not change was written');
    assert.equal(topAfter, top, 'a category change rewrote the search index');
    database.close();
  });
};
