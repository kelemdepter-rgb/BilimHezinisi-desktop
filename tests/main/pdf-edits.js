// ============================================================================
// 3.6 Phase 7 — the PDF page beside its text: compare and correct.
//
// A correction of one page replaces only what changed, and moves everything
// that points into the text with it — the later pages of the map, bookmarks,
// in-book notes and the reading position — and the search index. Each one is
// logged in book_edits (migration step 9) so «ئەسلىگە قايتۇرۇش» undoes the
// latest of a page byte for byte, even after other pages were corrected.
//
// A book imported before 3.6 has no page map: a text-layer PDF's pages are
// found in its text in order (src/pdf-compare.js, alignPages); a scanned
// PDF's page is read by OCR and found near its estimate by its letter
// trigrams (placeByTrigrams). A moved PDF is found again by its hash:
// pdf-pages.js, 'pdf-original-found-moved-missing' (Phase 2).
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

async function fresh(ctx, name) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({ beforeFirst: async function () {} });
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

const PAGES = [
  'بىرىنچى بەت باشلىنىشى.\n\nبىرىنچى بەتنىڭ ئاخىرى.',
  'ئىككىنچى بەت: خاتا سوز بار.\n\nئىككىنچى ئابزاس.\n\nئۈچىنچى ئابزاس.',
  'ئۈچىنچى بەتتە بىر ئابزاس.\n\nيەنە بىرى.',
  'تۆتىنچى بەت.'
];

/** A PDF book with its page map, and places in it. */
function bookWithPlaces(database) {
  const j = joined(PAGES);
  const id = database.addBook('سىناق PDF', 'ئاپتور', 'باشقا', 'PDF', '2026-10-28', '', j.text, '', { pages: j.ranges });
  const s = j.ranges.map(function (r) { return r[0]; });
  const at = function (page, piece) { return s[page - 1] + PAGES[page - 1].indexOf(piece); };
  const marks = {};
  marks[id] = [
    { name: 'a', pos: 0, off: s[1] },                         // page 2's start: before the change
    { name: 'b', pos: 0, off: at(2, 'ئىككىنچى ئابزاس') },     // after it, on the same page
    { name: 'd', pos: 0, off: at(2, 'اتا سوز') }               // strictly inside what is replaced
  ];
  database.syncBookmarks(marks);
  const notes = {};
  notes[id] = [{ text: 'ئىزاھات', pos: 0, off: s[2] }];       // page 3's start
  database.syncNotes(notes);
  database.saveReadingProgress(id, 70, 4, s[3]);              // page 4's start
  return { id: id, text: j.text, starts: s, at: at };
}

/** Everything a correction may touch, as it is now. */
function snapshot(ctx, name, id) {
  const db = raw(ctx, name);
  const out = {
    content: db.prepare('SELECT content FROM book_content WHERE book_id=?').get(id).content,
    map: db.prepare('SELECT page_no, start, "end" FROM book_page_map WHERE book_id=? ORDER BY page_no').all(id),
    bookmarks: db.prepare('SELECT id, char_offset FROM bookmarks WHERE book_id=? ORDER BY id').all(id),
    notes: db.prepare('SELECT id, char_offset FROM notes WHERE book_id=? ORDER BY id').all(id),
    progress: db.prepare('SELECT char_offset FROM reading_progress WHERE book_id=?').all(id),
    fts: db.prepare('SELECT content FROM book_fts WHERE rowid=?').all(id).map(function (r) { return r.content; })
  };
  db.close();
  return out;
}

/** Words of made-up syllables: a large vocabulary, as a real book has. */
function makeWords(seed, n) {
  const syl = ['با', 'لا', 'قى', 'تۇ', 'رە', 'مى', 'سى', 'نۇ', 'دە', 'كى', 'يا', 'شى', 'غۇ', 'چە', 'زى', 'پا', 'ئو', 'ۋە', 'خا', 'جى', 'ئې', 'لۈ', 'گۆ', 'ھە'];
  let x = seed;
  const rnd = function () { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = 2 + Math.floor(rnd() * 3);
    let w = '';
    for (let j = 0; j < k; j++) w += syl[Math.floor(rnd() * syl.length)];
    out.push(w);
  }
  return { words: out, rnd: rnd };
}

module.exports = function (suite, assert, ctx) {
  const PC = function () { return require(path.join(ctx.root, 'src', 'pdf-compare.js')); };
  const letters = function (t) { return require(path.join(ctx.root, 'text-normalize.js')).normalizeImportedText(t); };

  suite.test('page-edit-step-adds-book-edits', async function () {
    const database = await fresh(ctx, 'edits-step');
    const db = raw(ctx, 'edits-step');
    const cols = db.prepare('PRAGMA table_info(book_edits)').all().map(function (c) { return c.name; });
    db.close();
    assert.deepEqual(cols, ['id', 'book_id', 'page_no', 'start', 'old_text', 'new_text', 'moved', 'created_at']);
    assert.ok(database.schemaVersion() >= 9, 'step 9 ran');
    database.close();
  });

  suite.test('page-edit-shifts-later-pages-and-places', async function () {
    const database = await fresh(ctx, 'edits-shift');
    const b = bookWithPlaces(database);
    assert.equal(database.getBookContent(b.id), b.text, 'the cache holds the old text before the edit');
    const before = snapshot(ctx, 'edits-shift', b.id);

    const fixed = PAGES[1].replace('خاتا سوز', 'توغرا سۆز');
    const r = database.savePageEdit(b.id, 2, fixed);
    assert.ok(r.ok && !r.unchanged, 'saved: ' + JSON.stringify(r));
    const after = snapshot(ctx, 'edits-shift', b.id);

    // Only what changed was replaced: «خاتا سو» → «توغرا سۆ», one longer.
    const at = b.at(2, 'خاتا سوز');
    const expected = b.text.slice(0, at) + 'توغرا سۆ' + b.text.slice(at + 'خاتا سو'.length);
    assert.equal(after.content, expected, 'the text');
    assert.equal(database.getBookContent(b.id), expected, 'the cache was cleared');
    assert.equal(after.fts[0], expected, 'the search index has the new text');
    const idx = raw(ctx, 'edits-shift');
    const hits = idx.prepare('SELECT rowid AS id FROM book_fts WHERE book_fts MATCH ?').all('"توغرا"').map(function (x) { return x.id; });
    idx.close();
    assert.deepEqual(hits, [b.id], 'the index finds the new word');

    // The map: page 1 as it was, page 2 one longer, pages 3 and 4 one later.
    assert.deepEqual(after.map[0], before.map[0], 'page 1');
    assert.deepEqual([after.map[1].start, after.map[1].end], [before.map[1].start, before.map[1].end + 1], 'page 2');
    assert.deepEqual([after.map[2].start, after.map[2].end], [before.map[2].start + 1, before.map[2].end + 1], 'page 3');
    assert.deepEqual([after.map[3].start, after.map[3].end], [before.map[3].start + 1, before.map[3].end + 1], 'page 4');
    assert.equal(after.content.slice(after.map[1].start, after.map[1].end), fixed, 'page 2 reads as corrected');
    assert.equal(after.content.slice(after.map[2].start, after.map[2].end), PAGES[2], 'page 3 still reads as itself');

    // The places.
    const bm = after.bookmarks.map(function (x) { return x.char_offset; });
    assert.equal(bm[0], b.starts[1], 'a bookmark before the change stays');
    assert.equal(bm[1], b.at(2, 'ئىككىنچى ئابزاس') + 1, 'a bookmark after it moves by one');
    assert.equal(bm[2], at, 'a bookmark inside what was replaced goes to its start');
    assert.equal(after.notes[0].char_offset, b.starts[2] + 1, 'the note on page 3 moves by one');
    assert.equal(after.progress[0].char_offset, b.starts[3] + 1, 'the reading position on page 4 moves by one');

    // The log: page 2, from the page's own start.
    const db = raw(ctx, 'edits-shift');
    const log = db.prepare('SELECT page_no, start, old_text, new_text, moved FROM book_edits WHERE book_id=?').all(b.id);
    db.close();
    assert.equal(log.length, 1);
    assert.deepEqual([log[0].page_no, log[0].start, log[0].old_text, log[0].new_text],
      [2, PAGES[1].indexOf('خاتا سوز'), 'خاتا سو', 'توغرا سۆ']);
    assert.equal(JSON.parse(log[0].moved).length, 1, 'the one place it moved is remembered');

    const same = database.savePageEdit(b.id, 2, fixed);
    assert.ok(same.ok && same.unchanged, 'saving the same text again changes nothing');
    database.close();
  });

  suite.test('page-edit-undo-byte-for-byte', async function () {
    const database = await fresh(ctx, 'edits-undo');
    const b = bookWithPlaces(database);
    const original = snapshot(ctx, 'edits-undo', b.id);
    assert.equal(database.undoPageEdit(b.id, 2).reason, 'none', 'nothing to undo yet');

    // A later page first, then an earlier one (which moves it), then a
    // correction across paragraphs, over places.
    assert.ok(database.savePageEdit(b.id, 3, PAGES[2].replace('بىر ئابزاس', 'بىرلا ئابزاس بار')).ok);
    assert.ok(database.savePageEdit(b.id, 1, PAGES[0].replace('باشلىنىشى', 'باشى')).ok);
    assert.ok(database.savePageEdit(b.id, 2, 'ئىككىنچى بەت پۈتۈنلەي باشقىچە.').ok);
    const edited = snapshot(ctx, 'edits-undo', b.id);
    assert.ok(edited.content !== original.content);
    // The page kept «ئىككىنچى بەت»; the change starts at the «:» it replaced.
    assert.equal(edited.bookmarks[1].char_offset, edited.map[1].start + 'ئىككىنچى بەت'.length, 'a place inside the rewritten paragraphs went to the change\'s start');

    let r = database.undoPageEdit(b.id, 3);
    assert.ok(r.ok, 'page 3 undone after page 1 moved it: ' + JSON.stringify(r));
    r = database.undoPageEdit(b.id, 2);
    assert.ok(r.ok, 'page 2 undone');
    r = database.undoPageEdit(b.id, 1);
    assert.ok(r.ok, 'page 1 undone');
    assert.deepEqual(snapshot(ctx, 'edits-undo', b.id), original, 'the text, the map, every place and the index — as they were');
    assert.equal(database.undoPageEdit(b.id, 2).reason, 'none', 'nothing left to undo');

    // Two corrections of one page come back one at a time.
    assert.ok(database.savePageEdit(b.id, 4, 'تۆتىنچى بەت، بىرىنچى تۈزىتىش.').ok);
    const once = snapshot(ctx, 'edits-undo', b.id);
    assert.ok(database.savePageEdit(b.id, 4, 'تۆتىنچى بەت، ئىككىنچى تۈزىتىش.').ok);
    assert.ok(database.undoPageEdit(b.id, 4).ok);
    assert.deepEqual(snapshot(ctx, 'edits-undo', b.id), once, 'the first correction is back');
    assert.ok(database.undoPageEdit(b.id, 4).ok);
    assert.deepEqual(snapshot(ctx, 'edits-undo', b.id), original, 'and then the original');
    database.close();
  });

  suite.test('page-edit-refused-where-it-cannot-be-undone', async function () {
    const database = await fresh(ctx, 'edits-refused');
    // A book with no page map: nothing can be saved over a page.
    const id = database.addBook('كونا', '', 'باشقا', 'PDF', '2026-10-28', '', 'كونا كىتابنىڭ تېكىستى.', '');
    const r = database.savePageEdit(id, 1, 'باشقا');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'unplaced');
    assert.equal(database.getBookContent(id), 'كونا كىتابنىڭ تېكىستى.', 'the text is untouched');

    // A whole new text (the reader's page fix) drops the map, and the
    // corrections made against it with it.
    const b = bookWithPlaces(database);
    assert.ok(database.savePageEdit(b.id, 2, PAGES[1] + ' قوشۇلدى').ok);
    database.saveBookContent(b.id, 'پۈتۈنلەي يېڭى تېكىست.');
    assert.deepEqual(database.getPageMap(b.id), [], 'the map is gone');
    const db = raw(ctx, 'edits-refused');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM book_edits WHERE book_id=?').get(b.id).n, 0, 'so are its corrections');
    db.close();
    assert.equal(database.undoPageEdit(b.id, 2).reason, 'none');
    database.close();
  });

  suite.test('page-align-old-text-layer-book', async function () {
    const pc = PC();
    // As the PDF's text layer reads (presentation forms on page 2, as some
    // Word installations write them; a double space on page 1).
    const extracted = [
      'بىرىنچى  بەت: كىتابنىڭ باشلىنىشى ۋە مۇقەددىمىسى.',
      'ﺑﯩﻠﯩﻢ خەزىنىسى — ئىككىنچى بەتنىڭ تېكىستى بۇ يەردە.',
      'ئۈچىنچى بەت: بۇ بەتتىكى بىر سۆز كېيىن ئوقۇغۇچتا تۈزىتىلگەن ئىدى، شۇڭا ئۇ پۈتۈن تېپىلمايدۇ.',
      '',
      'بەشىنچى بەت: يەنە بىر قانچە جۈملە، ئاخىرىدا چېكىت.',
      'ئالتىنچى بەت: كونا ئەكىرىش 5-بەتتە توختىغانلىقى ئۈچۈن كىتابتا يوق.',
      'يەتتىنچى بەت: بۇمۇ يوق.'
    ];
    // What a pre-3.6 import stored: the first five pages, '\n' after each,
    // folded into letters; page 3 later corrected in the reader.
    const stored = letters(extracted.slice(0, 5).map(function (p) { return p.replace(/  /g, ' ') + '\n'; }).join(''))
      .replace('بىر سۆز كېيىن', 'بىر سۆزى كېيىنرەك');
    const pages = extracted.map(letters);
    const r = pc.alignPages(stored, pages);
    assert.deepEqual(r.missing, [6, 7], 'the pages the old import never read are reported');
    assert.deepEqual(r.placed.map(function (p) { return p.page; }), [1, 2, 3, 4, 5], 'the others are placed, in order');
    const text = function (p) { return stored.slice(p.start, p.end); };
    assert.equal(text(r.placed[0]), 'بىرىنچى بەت: كىتابنىڭ باشلىنىشى ۋە مۇقەددىمىسى.', 'page 1, spaced differently');
    assert.equal(text(r.placed[1]), letters(extracted[1]), 'page 2, through the letters fold');
    assert.equal(text(r.placed[2]), letters(extracted[2]).replace('بىر سۆز كېيىن', 'بىر سۆزى كېيىنرەك'), 'page 3, by its first and last words');
    assert.equal(r.placed[3].start, r.placed[3].end, 'the empty page has an empty range');
    // On its own line, as the importer joins pages: after page 3's line end,
    // before its own — where a 3.6 import puts an empty page too.
    assert.equal(r.placed[3].start, r.placed[2].end + 1, 'after the line end of the page before it');
    assert.equal(r.placed[4].start, r.placed[3].start + 1, 'and before its own');
    assert.equal(text(r.placed[4]), letters(extracted[4]), 'page 5');

    // Written to the map, only where the order holds.
    const database = await fresh(ctx, 'edits-align');
    const id = database.addBook('كونا PDF', '', 'باشقا', 'PDF', '2026-10-28', '', stored, '');
    assert.equal(database.placePages(id, r.placed), 5);
    assert.deepEqual(database.getPageMap(id).map(function (x) { return [x.page_no, x.start, x.end]; }),
      r.placed.map(function (p) { return [p.page, p.start, p.end]; }));
    assert.equal(database.placePages(id, [{ page: 6, start: 0, end: 10 }]), 0, 'a page out of order is not written');
    const info = database.pdfPageInfo(id, 3, 7, pc.estimateRange);
    assert.ok(info.placed && info.text === text(r.placed[2]), 'the view gets the placed page\'s text');
    assert.ok(database.savePageEdit(id, 3, info.text.replace('سۆزى', 'سۆز')).ok, 'and it can be corrected now');
    database.close();
  });

  // Some PDFs space every glyph in their text layer (Chromium's own print
  // to PDF of Uyghur, measured in the dev app): there are no words to count,
  // and a page changed since must still be found by its ends.
  suite.test('page-align-glyph-spaced-text-layer', function () {
    const pc = PC();
    const spaced = function (t) { return t.split('').filter(function (c) { return c !== ' '; }).join(' '); };
    const pages = [
      'بىرىنچى بەتنىڭ تېكىستى، بىر قانچە جۈملە بىلەن.',
      'ئىككىنچى بەت: كېيىن بىر سۆزى ئوقۇغۇچتا تۈزىتىلگەن بەت مۇشۇ.',
      'ئۈچىنچى بەت، ئاخىرقىسى.'
    ].map(spaced);
    const stored = pages.map(function (p) { return p + '\n'; }).join('').replace('ئ و ق ۇ غ ۇ چ ت ا', 'ئ و ق ۇ غ ۇ چ ت ا [ تۈزىتىلدى ]');
    const r = pc.alignPages(stored, pages);
    assert.deepEqual(r.missing, [], 'every page found');
    assert.ok(stored.slice(r.placed[1].start, r.placed[1].end).indexOf('[ تۈزىتىلدى ]') !== -1, 'the changed page, by its ends');
    assert.equal(r.placed[2].start, r.placed[1].end + 1, 'the next page right after it');
  });

  suite.test('page-place-scanned-by-trigrams', async function () {
    const pc = PC();
    const gen = makeWords(7, 1200);
    const pages = [];
    for (let p = 0; p < 6; p++) {
      const w = gen.words.slice(p * 180, p * 180 + 180);
      pages.push(w.slice(0, 90).join(' ') + '.\n\n' + w.slice(90).join(' ') + '.');
    }
    // A scanned book: its OCR pages joined with a blank line, as the import does.
    const content = pages.join('\n\n');
    const starts = [];
    let at = 0;
    pages.forEach(function (p) { starts.push(at); at += p.length + 2; });

    // Page 4 read again by OCR: about one letter in twelve wrong, some spaces lost.
    const noisy = pages[3].split('').map(function (c) {
      const r = gen.rnd();
      if (c === ' ' && r < 0.08) return '';
      if (c !== ' ' && c !== '\n' && r < 0.08) return 'ق';
      return c;
    }).join('');

    const est = pc.estimateRange(content, 4, 6, []);
    assert.ok(est.start > starts[2] && est.start < starts[4], 'the estimate is near page 4: ' + est.start + ' (page 4 starts at ' + starts[3] + ')');
    const found = pc.placeByTrigrams(content, noisy, est.lo, est.hi);
    assert.ok(found, 'page 4 was found');
    assert.deepEqual([found.start, found.end], [starts[3], starts[3] + pages[3].length], 'exactly page 4 (score ' + found.score + ')');

    assert.equal(pc.placeByTrigrams(content, 'The quick brown fox jumps over the lazy dog, again and again and again.', 0, content.length), null,
      'OCR of something else is not placed');

    // Placed pages anchor the next estimate.
    const est5 = pc.estimateRange(content, 5, 6, [{ page_no: 4, start: found.start, end: found.end }]);
    assert.equal(est5.lo, found.end, 'page 5 is looked for after page 4');
    assert.equal(est5.start, starts[4], 'and its estimate begins where page 5 does');

    const database = await fresh(ctx, 'edits-scanned');
    const id = database.addBook('سىكان', '', 'باشقا', 'PDF', '2026-10-28', '', content, '');
    assert.equal(database.placePages(id, [{ page: 4, start: found.start, end: found.end }]), 1);
    assert.equal(database.placePages(id, [{ page: 5, start: found.start + 10, end: found.end + 50 }]), 0, 'a page that would overlap page 4 is refused');
    const guess = database.pdfPageInfo(id, 2, 6, pc.estimateRange);
    assert.ok(!guess.placed && guess.estimated, 'an unplaced page is an estimate');
    assert.equal(database.savePageEdit(id, 2, 'ھەر نېمە').reason, 'unplaced', 'which cannot be saved over');
    database.close();
  });
};
