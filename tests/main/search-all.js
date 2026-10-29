// ============================================================================
// 3.6 Phase 4 — one search across the books, the Qur'an and the notebook.
//
// The search bar asks the three sources at once, one IPC each: the books
// (searchBooks), the Qur'an (quranSearch: the Arabic as before, the Uyghur
// translation with the forms of Phase 3) and the notebook (notesSearch: title
// and text, never the trash, with the forms). These are the main-process
// halves; the sections, labels and chips are in src/index.html.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

let LIB = null;
async function library(ctx) {
  const database = require(path.join(ctx.root, 'database.js'));
  if (LIB) return LIB;
  database.close();
  const dir = path.join(ctx.tmpDir, 'search-all');
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({ beforeFirst: async function () {} });
  await require(path.join(ctx.root, 'scripts', 'seed-quran.js')).seedQuran(ctx.root, database);
  while (!database.ftsRebuildStep().done) { /* fill the book index */ }
  const book = Number(database.addBook('سىناق', '', 'باشقا', 'TXT', '', '',
    'بۇ كىتابتا پەيغەمبەرلەر ھەققىدە سۆز بار. ئۇلار يالغانچىلاردۇر دېگەن سۆزمۇ بار.', 'b1'));
  const note = database.notesCreate('خاتىرە');
  database.notesUpdate(note, 'خاتىرە', '<p>پەيغەمبىرىمىز ھەققىدە ۋە قىزىلگۈل توغرىسىدا</p>', 'پەيغەمبىرىمىز ھەققىدە ۋە قىزىلگۈل توغرىسىدا');
  const trashed = database.notesCreate('ئەخلەتتىكى');
  database.notesUpdate(trashed, 'ئەخلەتتىكى', '<p>قىزىلگۈل ۋە پەيغەمبەرلەر</p>', 'قىزىلگۈل ۋە پەيغەمبەرلەر');
  database.notesTrash(trashed);
  LIB = { database: database, book: book, note: Number(note), trashed: Number(trashed) };
  return LIB;
}

module.exports = function (suite, assert, ctx) {
  suite.test('search-all-three-sources', async function () {
    const L = await library(ctx);
    const db = L.database;
    const q = 'پەيغەمبەرلەر';
    const books = db.searchBooks(q, 'all', { forms: true });
    const quran = db.quranSearch(q, { lang: 'auto', limit: 200, forms: true });
    const notes = db.notesSearch(q, { forms: true });
    assert.deepEqual(books.map(function (r) { return Number(r.book.id); }), [L.book]);
    assert.ok(quran.length > 0, 'the Qur\'an should have this word');
    assert.deepEqual(notes.notes.map(function (n) { return Number(n.id); }), [L.note], 'the note through «پەيغەمبىرىمىز»');
    const n = notes.notes[0];
    assert.equal(n.snip.slice(n.mark[0], n.mark[1]), 'پەيغەمبىرىمىز', 'the note card marks the word found');
    assert.deepEqual(n.words, ['پەيغەمبىرىمىز'], 'the words the notebook paints');
    assert.ok(!('content_text' in n), 'a note\'s whole text does not cross the IPC');
    // The forms reach the translation: a verse with «پەيغەمبىرى…» and not the
    // typed «پەيغەمبەرلەر».
    assert.ok(quran.some(function (r) { return /پەيغەمبىر/.test(r.snip_ug || '') && (r.text_ug || '').indexOf(q) === -1; }),
      'no verse was found through a form');
    // Switched off: only what was typed.
    assert.deepEqual(db.notesSearch(q, { forms: false }).notes, [], 'off: the note holds only another form');
    assert.ok(db.quranSearch(q, { lang: 'auto', limit: 200 }).length < quran.length, 'the forms should add verses');
  });

  suite.test('search-all-only-in-a-note', async function () {
    const L = await library(ctx);
    const db = L.database;
    const q = 'قىزىلگۈل';
    assert.deepEqual(db.searchBooks(q, 'all', { forms: true }), []);
    assert.deepEqual(db.quranSearch(q, { lang: 'auto', limit: 200, forms: true }), []);
    const notes = db.notesSearch(q, { forms: true }).notes;
    assert.deepEqual(notes.map(function (n) { return Number(n.id); }), [L.note]);
  });

  suite.test('search-all-never-the-trash', async function () {
    const L = await library(ctx);
    const db = L.database;
    [true, false].forEach(function (forms) {
      ['قىزىلگۈل', 'پەيغەمبەرلەر', 'ئەخلەتتىكى'].forEach(function (q) {
        const ids = db.notesSearch(q, { forms: forms }).notes.map(function (n) { return Number(n.id); });
        assert.ok(ids.indexOf(L.trashed) === -1, 'a trashed note was found for «' + q + '», forms ' + forms);
      });
    });
    // The notebook's own list search is as it was.
    assert.ok(db.notesSearch('قىزىلگۈل').notes.every(function (n) { return Number(n.id) !== L.trashed; }));
  });

  suite.test('search-all-quran-groups-once', async function () {
    const L = await library(ctx);
    const db = L.database;
    // 37:151–152 share one translation; a word of it, typed with another
    // suffix, finds the group once, labelled with both verses.
    assert.equal(db.quranSearch('يالغانچىلىرى', { lang: 'auto', limit: 200 }).filter(function (r) { return r.sura === 37 && r.ug_from === 151; }).length, 0,
      'today\'s search should not reach «يالغانچىلاردۇر» from «يالغانچىلىرى»');
    const cards = db.quranSearch('يالغانچىلىرى', { lang: 'auto', limit: 200, forms: true })
      .filter(function (r) { return r.sura === 37 && r.ug_from === 151; });
    assert.equal(cards.length, 1, 'the group came back ' + cards.length + ' times');
    assert.deepEqual([cards[0].ug_from, cards[0].ug_to], [151, 152]);
    assert.deepEqual(cards[0].verses.map(function (v) { return v.aya; }), [151, 152]);
    const VL = require(path.join(ctx.root, 'src', 'verse-label.js'));
    assert.equal(VL.label(cards[0].ug_from, cards[0].ug_to), '[151 _ 152]');
    assert.includes(cards[0].snip_ug, '<mark>', 'the translation\'s snippet marks the word found');
    // An Arabic query keeps today's normalisation and gets no forms.
    const ar = db.quranSearch('الكتاب', { lang: 'auto', limit: 50, forms: true });
    assert.deepEqual(ar.map(function (r) { return r.id; }), db.quranSearch('الكتاب', { lang: 'auto', limit: 50 }).map(function (r) { return r.id; }));
    db.close();
    LIB = null;
  });
};
