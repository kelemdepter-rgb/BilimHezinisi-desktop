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
const ISO_TIME = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/;

/** The body of a function in src/index.html (the renderer is not loadable on its own). */
function rendererBody(ctx, assert, name) {
  const html = fs.readFileSync(path.join(ctx.root, 'src', 'index.html'), 'utf8');
  const at = html.search(new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\('));
  assert.ok(at >= 0, name + '() is gone');
  const open = html.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(open, i + 1);
  }
  return html.slice(open);
}

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

  // The recent list's one-row write, in the renderer's own time format, so it
  // sorts with the rows syncRecent writes (datetime('now') gives
  // «YYYY-MM-DD HH:MM:SS», and ' ' sorts before 'T').
  suite.test('recent-one-row-in-order', async function () {
    const at = await fresh(ctx, 'recent-one-row');
    const database = at.database;
    const ids = [];
    for (let i = 1; i <= 25; i++) ids.push(Number(database.addBook('كىتاب ' + i, '', 'باشقا', 'TXT', '', '', 'تېكىست ' + i, 'h-' + i)));

    const base = Date.now() - 3600 * 1000;
    const time = function (k) { return new Date(base + k * 1000).toISOString(); };
    database.syncRecent([{ id: ids[2], time: time(3) }, { id: ids[1], time: time(2) }, { id: ids[0], time: time(1) }]);

    database.addRecentRead(ids[3], time(4));
    let list = database.getRecentForFrontend();
    assert.equal(list[0].id, ids[3], 'the book just opened is not first: ' + JSON.stringify(list.slice(0, 4)));
    assert.ok(ISO_TIME.test(list[0].time), 'the time is not in syncRecent\'s format: ' + list[0].time);
    assert.equal(list[0].time, time(4), 'the renderer\'s time was not kept');

    // Opening one already on the list moves it to the top, once.
    database.addRecentRead(ids[0], time(5));
    list = database.getRecentForFrontend();
    assert.deepEqual(list.map(function (x) { return x.id; }), [ids[0], ids[3], ids[2], ids[1]], 'the list is out of order');

    // At most 20 rows; the oldest go.
    for (let i = 4; i < 25; i++) database.addRecentRead(ids[i], time(10 + i));
    list = database.getRecentForFrontend();
    assert.equal(list.length, 20, 'the recent list is not cut at 20');
    assert.equal(list[0].id, ids[24], 'the last book opened is not first');
    let r = raw(ctx, at.file);
    const rows = r.prepare('SELECT COUNT(*) AS n FROM recent_reads').get().n;
    r.close();
    assert.equal(rows, 20, 'recent_reads holds more than 20 rows');

    // A later whole-library save writes the same list back in the same order.
    const order = list.map(function (x) { return x.id; });
    database.syncRecent(list);
    assert.deepEqual(database.getRecentForFrontend().map(function (x) { return x.id; }), order,
      'syncRecent changed the order the one-row writes made');
    database.close();
  });

  // The renderer half: opening a book sends no library, and asks for the
  // text before anything else that waits on main.
  suite.test('open-book-sends-no-library', function () {
    const recent = rendererBody(ctx, assert, 'addToRecent');
    assert.excludes(recent, 'saveData(', 'opening a book still sends the whole library');
    assert.includes(recent, 'dbAddRecent(', 'the recent list is not written through its own IPC');

    const open = rendererBody(ctx, assert, 'openReader');
    const all = open.indexOf('Promise.all(');
    const text = open.indexOf('loadBookContent(');
    const add = open.indexOf('addToRecent(');
    assert.ok(all >= 0 && text > all, 'openReader() does not ask for the text and the position together');
    assert.ok(add > text, 'openReader() writes the recent list before it asks for the text');

    const preload = fs.readFileSync(path.join(ctx.root, 'preload.js'), 'utf8');
    assert.ok(/dbAddRecent:\s*\(bookId,\s*time\)\s*=>\s*ipcRenderer\.invoke\('db-add-recent',\s*bookId,\s*time\)/.test(preload),
      'preload does not pass the time to db-add-recent');
    const main = fs.readFileSync(path.join(ctx.root, 'main.js'), 'utf8');
    assert.ok(/database\.addRecentRead\(bookId,\s*time\)/.test(main), 'db-add-recent does not keep the renderer\'s time');
  });
};
