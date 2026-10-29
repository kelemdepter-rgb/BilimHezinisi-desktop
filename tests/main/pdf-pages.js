// ============================================================================
// 3.6 Phase 2 — a PDF book keeps every page, and remembers where each page
// starts and where its PDF is.
//
// Migration step 7 adds book_page_map(book_id, page_no, start, end) and the
// original file's size, time and SHA-256 beside the old, never-filled
// books.original_path. The renderer sends each page's range in the text as
// it was extracted; the text is then stored as letters (text-normalize.js),
// which can change its length — a lam-alef glyph is two letters — so the
// ranges are mapped through that normalisation and are true for the STORED
// text. The PDF itself is never copied.
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

function raw(ctx, name) {
  const Sqlite = require(path.join(ctx.root, 'node_modules', 'better-sqlite3'));
  return new Sqlite(path.join(ctx.tmpDir, name, 'library.db'));
}

/** Pages joined the way the text-layer import joins them: '\n' after each. */
function joined(pages) {
  const ranges = [];
  let text = '';
  pages.forEach(function (p) { ranges.push([text.length, text.length + p.length]); text += p + '\n'; });
  return { text: text, ranges: ranges };
}

/** The ranges are consecutive, never overlap, and with the joins cover the text. */
function checkCover(assert, ranges, text, sep, trailing) {
  let at = 0;
  ranges.forEach(function (r, i) {
    assert.ok(r[0] === at, 'page ' + (i + 1) + ' starts at ' + r[0] + ', expected ' + at);
    assert.ok(r[1] >= r[0], 'page ' + (i + 1) + ' ends before it starts');
    at = r[1] + (i < ranges.length - 1 || trailing ? sep.length : 0);
  });
  assert.equal(at, text.length, 'the pages and their joins do not cover the text');
}

function mapOf(ctx, name, bookId) {
  const db = raw(ctx, name);
  const rows = db.prepare('SELECT page_no, start, "end" FROM book_page_map WHERE book_id=? ORDER BY page_no').all(bookId);
  db.close();
  return rows;
}

module.exports = function (suite, assert, ctx) {
  suite.test('pdf-no-page-cap', function () {
    const html = fs.readFileSync(path.join(ctx.root, 'src', 'index.html'), 'utf8');
    const caps = html.match(/Math\.min\(\s*pdf\.numPages\s*,\s*\d+\s*\)/g) || [];
    assert.deepEqual(caps, [], 'a text-layer import still stops at a fixed page');
    assert.ok((html.match(/PdfText\.extract\(/g) || []).length >= 2, 'the single and the batch import should both read through PdfText.extract');
  });

  suite.test('pdf-step-adds-page-map-and-original', async function () {
    const database = require(path.join(ctx.root, 'database.js'));
    const step = database.MIGRATIONS.find(function (s) { return s.name === 'pdf_pages_and_original'; });
    assert.ok(step, 'there is no migration step for the page map');
    await fresh(ctx, 'pdf-step', database.MIGRATIONS.filter(function (s) { return s.version < step.version; }));
    const id = Number(database.addBook('كونا كىتاب', '', 'باشقا', 'PDF', '', '', 'مەزمۇن', null));
    const r = await database.runMigrations({ beforeFirst: async function () {} });
    assert.ok(r.ran.indexOf(step.version) !== -1, 'the step did not run');

    const db = raw(ctx, 'pdf-step');
    const cols = db.prepare('PRAGMA table_info(books)').all().map(function (c) { return c.name; });
    ['original_path', 'original_size', 'original_mtime', 'original_sha256'].forEach(function (c) {
      assert.ok(cols.indexOf(c) !== -1, 'books has no ' + c);
    });
    const old = db.prepare('SELECT original_path, original_size, original_sha256 FROM books WHERE id=?').get(id);
    assert.deepEqual([old.original_size, old.original_sha256], [null, null], 'a book from before has no original');
    db.close();
    assert.deepEqual(mapOf(ctx, 'pdf-step', id), [], 'a book from before has no page map');
    database.close();
  });

  suite.test('pdf-ranges-through-normalisation', function () {
    const tn = require(path.join(ctx.root, 'text-normalize.js'));
    // Page 2 holds glyph codepoints: ﻻ (one) is لا (two) as letters.
    const pages = ['Page one', 'ﻻ ﺑﺎﻟﺎ ok', '', 'Last page'];
    const j = joined(pages);
    const out = tn.normalizeWithRanges(j.text, j.ranges);
    assert.equal(out.text, tn.normalizeImportedText(j.text), 'the text must be what the library stores');
    assert.ok(out.text.length > j.text.length, 'the fixture should change length when folded');
    assert.ok(Array.isArray(out.ranges) && out.ranges.length === 4, 'the ranges were lost');
    pages.forEach(function (p, i) {
      assert.equal(out.text.slice(out.ranges[i][0], out.ranges[i][1]), tn.normalizeImportedText(p), 'page ' + (i + 1) + ' is not where its range says');
    });
    checkCover(assert, out.ranges, out.text, '\n', true);

    // Ranges that do not fit the text are refused, never stored half-true.
    assert.equal(tn.normalizeWithRanges('abc', [[0, 9]]).ranges, null);
    assert.equal(tn.normalizeWithRanges('abc', [[2, 3], [0, 1]]).ranges, null);
  });

  suite.test('pdf-add-book-keeps-every-page', async function () {
    const database = await fresh(ctx, 'pdf-add');
    const pages = [];
    for (let i = 1; i <= 150; i++) pages.push('Page ' + i + (i === 77 ? ' ﻻ ﺑﺎﻟﺎ' : '') + ' text of page ' + i);
    const j = joined(pages);
    const original = { path: 'C:\\books\\long.pdf', size: 123456, mtime: 1700000000000, sha256: 'ab'.repeat(32) };
    const id = Number(database.addBook('ئۇزۇن', '', 'باشقا', 'PDF', '', '', j.text, 'h1', { pages: j.ranges, original: original }));

    const content = database.getBookContent(id);
    assert.includes(content, 'text of page 150', 'the last page is missing');
    const rows = mapOf(ctx, 'pdf-add', id);
    assert.equal(rows.length, 150, 'every page has its place');
    const ranges = rows.map(function (r) { return [r.start, r.end]; });
    checkCover(assert, ranges, content, '\n', true);
    assert.equal(content.slice(ranges[76][0], ranges[76][1]), 'Page 77 لا بالا text of page 77', 'page 77 is not where its range says');
    assert.deepEqual(rows.map(function (r) { return r.page_no; }).slice(0, 3), [1, 2, 3]);

    const o = database.getBookOriginal(id);
    assert.deepEqual([o.path, o.size, o.mtime, o.sha256], [original.path, original.size, original.mtime, original.sha256]);

    // A book that is not a PDF has neither.
    const txt = Number(database.addBook('تېكىست', '', 'باشقا', 'TXT', '', '', 'abc', 'h2'));
    assert.deepEqual(mapOf(ctx, 'pdf-add', txt), []);
    assert.equal(database.getBookOriginal(txt).sha256, null);

    // The map goes with its book.
    database.deleteBook(id);
    assert.deepEqual(mapOf(ctx, 'pdf-add', id), [], 'the page map outlived its book');
    database.close();
  });

  suite.test('pdf-batch-keeps-every-page', async function () {
    const database = await fresh(ctx, 'pdf-batch');
    const a = joined(['A1', 'A2', 'A3']);
    const b = joined(['ﻻ', 'B2']);
    const r = database.addBooksBatch([
      { title: 'A', format: 'PDF', content: a.text, fileHash: 'ha', pages: a.ranges, original: { path: 'a.pdf', size: 1, mtime: 2, sha256: 'x' } },
      { title: 'B', format: 'PDF', content: b.text, fileHash: 'hb', pages: b.ranges },
      { title: 'C', format: 'TXT', content: 'plain', fileHash: 'hc' }
    ]);
    assert.equal(r.added.length, 3);
    const idA = Number(r.added[0].id), idB = Number(r.added[1].id), idC = Number(r.added[2].id);
    assert.deepEqual(mapOf(ctx, 'pdf-batch', idA).map(function (x) { return [x.start, x.end]; }), [[0, 2], [3, 5], [6, 8]]);
    const bText = database.getBookContent(idB);
    assert.equal(bText, 'لا\nB2\n');
    assert.deepEqual(mapOf(ctx, 'pdf-batch', idB).map(function (x) { return [x.start, x.end]; }), [[0, 2], [3, 5]]);
    assert.deepEqual(mapOf(ctx, 'pdf-batch', idC), []);
    assert.equal(database.getBookOriginal(idA).path, 'a.pdf');
    database.close();
  });

  suite.test('pdf-map-dropped-when-text-is-replaced', async function () {
    const database = await fresh(ctx, 'pdf-replace');
    const j = joined(['one', 'two']);
    const id = Number(database.addBook('T', '', '', 'PDF', '', '', j.text, 'h', { pages: j.ranges }));
    database.saveBookContent(id, j.text);
    assert.equal(mapOf(ctx, 'pdf-replace', id).length, 2, 'saving the same text dropped the map');
    database.saveBookContent(id, 'one\nTWO changed\n');
    assert.deepEqual(mapOf(ctx, 'pdf-replace', id), [], 'a map that no longer fits the text was kept');
    database.close();
  });

  suite.test('pdf-original-found-moved-missing', async function () {
    const database = await fresh(ctx, 'pdf-original');
    const po = require(path.join(ctx.root, 'pdf-original.js'));
    const dir = path.join(ctx.tmpDir, 'pdf-original-files');
    fs.mkdirSync(path.join(dir, 'elsewhere'), { recursive: true });
    const file = path.join(dir, 'book.pdf');
    fs.writeFileSync(file, Buffer.from('%PDF-1.4 the book'));

    const facts = await po.fileFacts(file);
    assert.equal(facts.size, 17);
    assert.equal(facts.sha256, require('crypto').createHash('sha256').update('%PDF-1.4 the book').digest('hex'));
    const id = Number(database.addBook('B', '', '', 'PDF', '', '', 'x', 'h', { original: facts }));

    assert.equal(await po.originalStatus(database.getBookOriginal(id)), 'found');
    const old = Number(database.addBook('Old', '', '', 'PDF', '', '', 'y', 'h2'));
    assert.equal(await po.originalStatus(database.getBookOriginal(old)), 'missing', 'a book without a recorded PDF');

    // Moved: nothing at the path.
    const moved = path.join(dir, 'elsewhere', 'renamed.pdf');
    fs.renameSync(file, moved);
    assert.equal(await po.originalStatus(database.getBookOriginal(id)), 'moved');
    // Another file at the path is not the book.
    fs.writeFileSync(file, Buffer.from('%PDF-1.4 another'));
    assert.equal(await po.originalStatus(database.getBookOriginal(id)), 'moved', 'a different file was taken for the book');

    // Pointing to the moved file: found by its hash, no question asked.
    let asked = 0;
    let r = await po.locateOriginal(database, id, moved, async function () { asked++; return false; });
    assert.ok(r.ok && r.same, 'the same file was not recognised');
    assert.equal(asked, 0, 'the owner was asked about the very same file');
    assert.equal(database.getBookOriginal(id).path, moved);
    assert.equal(await po.originalStatus(database.getBookOriginal(id)), 'found');

    // A different file only with the owner's yes.
    r = await po.locateOriginal(database, id, file, async function () { asked++; return false; });
    assert.ok(!r.ok && r.cancelled, 'a different file was taken without the owner\'s yes');
    assert.equal(database.getBookOriginal(id).path, moved, 'a refused file changed the record');
    r = await po.locateOriginal(database, id, file, async function () { asked++; return true; });
    assert.ok(r.ok && !r.same);
    assert.equal(asked, 2);
    const now = database.getBookOriginal(id);
    assert.deepEqual([now.path, now.sha256], [file, require('crypto').createHash('sha256').update('%PDF-1.4 another').digest('hex')]);

    // An old book gets its PDF only with the owner's yes too.
    r = await po.locateOriginal(database, old, moved, async function () { return true; });
    assert.ok(r.ok && !r.same);
    assert.equal(await po.originalStatus(database.getBookOriginal(old)), 'found');
    database.close();
  });
};
