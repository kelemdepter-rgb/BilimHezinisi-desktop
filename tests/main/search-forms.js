// ============================================================================
// 3.6 Phase 3 — search that understands Uyghur suffixes.
//
// search-forms.js works out a typed word's base and the forms a suffix makes
// of it, and finds those forms at the start of a word followed only by known
// suffixes. The table below is the quality bar: each row is a query and a
// word in a text that must, or must not, be found. The exact query is always
// found as before; the forms can only add.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

// [query, word in the text, found?]
const TABLE = [
  ['بالىلار', 'بالا', true],
  ['بالىلار', 'بالىسى', true],
  ['بالىلار', 'بالىلىرىمىزنىڭ', true],
  ['بالا', 'بالىلار', true],
  ['بالا', 'بالىسى', true],
  ['مەدرىسىلەردە', 'مەدرىسە', true],
  ['مەدرىسىلەردە', 'مەدرىسىدە', true],
  ['مەدرىسە', 'مەدرىسىلەردە', true],
  ['ئاياق', 'ئايىغى', true],
  ['ئايىغى', 'ئاياق', true],
  ['ئاياق', 'ئاياقلار', true],
  ['يۈرەك', 'يۈرىكى', true],
  ['يۈرىكى', 'يۈرەك', true],
  ['كىتابلىرىمىز', 'كىتاب', true],
  ['كىتابلىرىمىز', 'كىتابلار', true],
  ['كىتاب', 'كىتابلارنى', true],
  ['ئادەم', 'ئادىمى', true],
  ['ئادەم', 'ئادەملەر', true],
  ['قەلەم', 'قەلىمى', true],
  ['ۋەتەن', 'ۋەتىنىمىز', true],
  ['مەكتەپ', 'مەكتەپلەردە', true],
  ['مەكتەپ', 'مەكتەپتە', true],
  ['ئانا', 'ئانىسى', true],
  ['ئانىسى', 'ئانا', true],
  ['تاياق', 'تايىقى', true],
  ['دوستلار', 'دوست', true],
  ['كىتاب', 'ئەلكىتاب', true],          // a part of a word, as before
  ['بالىلار', 'بالاغەت', false],         // another word that begins with the form
  ['كىتابلىرىمىز', 'كىتابخانا', false],  // a compound, not an inflection
  ['بالىلار', 'ئابالا', false],          // the form is not at the start of the word
  ['بالا', 'بالىق', false],              // «ق» is no suffix
  ['مەكتەپ', 'مەكتەپسىز', true],
  ['ئاياق', 'ئايال', false],
  ['يۈرەك', 'يۈرۈش', false],
  // Measured on the library's own vocabulary (spellcheck-data/frequencies.tsv):
  ['ناماز', 'نامىزى', true],
  ['پەيغەمبەر', 'پەيغەمبىرىمىز', true],
  ['ئاتا', 'ئاتىسى', true],
  ['سۈرە', 'سۈرىسى', true],
  ['ئىمام', 'ئىماننىڭ', false],          // «م» off «ئىمام» left «ئىما»
  ['ئاتا', 'ئاتىغان', false],            // a verb raises too: ئات‑
  ['ئاتا', 'ئاتىدى', false],
  ['سۈرە', 'سۈرىتى', false],             // سۈرەت, another word
  ['بالا', 'بالى', false],               // a raised stem never stands alone
  ['ئاتا', 'ئاتىماي', false],            // a verb's negative after the raised stem
  ['ئاتا', 'ئاتىغانلارنىڭ', false],
  ['بالىلار', 'بالاخانىنىڭ', false],     // بالاخانا, a compound
  ['بالا', 'بالىلىرىڭغىمۇ', true]
];

module.exports = function (suite, assert, ctx) {
  const sf = function () { return require(path.join(ctx.root, 'search-forms.js')); };

  suite.test('search-forms-table', function () {
    const S = sf();
    assert.ok(TABLE.length >= 30, 'the table needs at least 30 rows');
    const wrong = [];
    for (const row of TABLE) {
      const text = 'ئالدى ' + row[1] + ' كەينى';
      const found = S.compile(row[0]).findAll(text).length > 0;
      if (found !== row[2]) wrong.push(row[0] + ' → ' + row[1] + ' should ' + (row[2] ? '' : 'not ') + 'be found');
    }
    assert.deepEqual(wrong, [], wrong.length + ' of ' + TABLE.length + ' rows wrong');
  });

  suite.test('search-forms-bases-and-forms', function () {
    const S = sf();
    assert.deepEqual(S.formsFor('بالىلار').forms, ['بالا', 'بالى']);
    assert.equal(S.formsFor('مەدرىسىلەردە').base, 'مەدرىسە');
    assert.deepEqual(S.formsFor('ئايىغى').forms, ['ئاياق', 'ئايىق', 'ئايىغ']);
    assert.equal(S.formsFor('يۈرىكى').base, 'يۈرەك');
    assert.equal(S.formsFor('كىتابلىرىمىز').base, 'كىتاب');
    assert.equal(S.formsFor('كىتابخانا').base, 'كىتابخانا', 'a compound is its own base');
    // No forms: two letters, Arabic, vowel marks, not a word the dictionary knows.
    ['ئۇ', 'ۋە', 'الله', 'كِتَاب', 'abc', 'قسغدبى'].forEach(function (w) {
      assert.deepEqual(S.formsFor(w).forms, [], '«' + w + '» should get no forms');
    });
  });

  suite.test('search-forms-phrase-and-switch', function () {
    const S = sf();
    // Several words: each by its forms, in order, separated only by spaces
    // and punctuation.
    assert.equal(S.compile('بالا مەكتەپ').findAll('بىز بالىلار، مەكتەپتە ئوقۇيمىز').length, 1);
    assert.equal(S.compile('بالا مەكتەپ').findAll('بالىلار يەنە مەكتەپتە').length, 0, 'a word between them');
    // The exact phrase anywhere, as before.
    assert.equal(S.compile('لا مەك').findAll('بالا مەكتەپ').length, 1);
    // Switched off: the query as typed, nothing more.
    assert.equal(S.compile('بالىلار', { forms: false }).findAll('بالا كەلدى').length, 0);
    assert.equal(S.compile('بالىلار', { forms: false }).findAll('بالىلارنى').length, 1);
    // A hit through the forms spans the word found, for the snippet's mark.
    const hit = S.compile('بالىلار').findAll('ئۇ بالىسىنى كۆردى')[0];
    assert.deepEqual([hit.start, hit.end, hit.word], [3, 11, true]);
    // What was added to the search, for «ئىزدەلگەن شەكىللەر».
    assert.deepEqual(S.compile('بالىلار').forms, ['بالا', 'بالى']);
    assert.deepEqual(S.compile('ئۇ').forms, []);
  });

  suite.test('search-forms-reader-marks-the-same', function () {
    // The reader marks the words the search found with a regular expression
    // (ReaderPlaces.searchRe): it must mark exactly what the search matched.
    const S = sf();
    const RP = require(path.join(ctx.root, 'src', 'reader-places.js'));
    const text = 'بالىلار بالا بالاغەت ئابالا بالىسىنى، بالىلىرىمىزنىڭ بالىق';
    const m = S.compile('بالىلار');
    const spans = m.findAll(text);
    const words = Array.from(new Set(spans.filter(function (s) { return s.word; }).map(function (s) { return text.slice(s.start, s.end); })));
    const re = RP.searchRe(m.query, words);
    const marked = [];
    let x;
    while ((x = re.exec(text)) !== null) marked.push([x.index, x.index + x[0].length]);
    assert.deepEqual(marked, spans.map(function (s) { return [s.start, s.end]; }));
    // The query as typed is marked as itself; the list holds what the forms added.
    assert.deepEqual(words, ['بالا', 'بالىسىنى', 'بالىلىرىمىزنىڭ']);
  });

  async function library(name) {
    const database = require(path.join(ctx.root, 'database.js'));
    database.close();
    const dir = path.join(ctx.tmpDir, name);
    fs.mkdirSync(dir, { recursive: true });
    await database.initDB(dir);
    await database.runMigrations({ beforeFirst: async function () {} });
    const add = function (title, content, cat) { return Number(database.addBook(title, '', cat || 'باشقا', 'TXT', '', '', content, title)); };
    return {
      database: database,
      ids: {
        exact: add('بىرىنچى', 'بۇ يەردە بالىلار ئوينايدۇ.'),
        base: add('ئىككىنچى', 'بىر بالا كەلدى، ئاندىن يەنە بىر بالا كەلدى.'),
        raised: add('ئۈچىنچى', 'ئۇنىڭ بالىسىنى كۆردۇم.', 'تارىخ'),
        other: add('تۆتىنچى', 'بالاغەت يېشى ھەققىدە.'),
        none: add('بەشىنچى', 'ھېچنېمە يوق.'),
        title: add('بالىسىنىڭ ھېكايىسى', 'باشقا بىر نەرسە.')
      }
    };
  }

  function ids(results) { return results.map(function (r) { return Number(r.book.id); }).sort(function (a, b) { return a - b; }); }

  suite.test('search-books-with-forms', async function () {
    const lib = await library('search-forms-books');
    const db = lib.database;
    const I = lib.ids;
    // Switched off: today's search, exactly.
    assert.deepEqual(ids(db.searchBooks('بالىلار', 'all')), [I.exact]);
    assert.deepEqual(ids(db.searchBooks('بالىلار', 'all', { forms: false })), [I.exact]);
    // On: the forms add, never take away.
    const on = db.searchBooks('بالىلار', 'all', { forms: true });
    assert.deepEqual(ids(on), [I.exact, I.base, I.raised, I.title].sort(function (a, b) { return a - b; }));
    const base = on.find(function (r) { return Number(r.book.id) === I.base; });
    assert.equal(base.snip.slice(base.mark[0], base.mark[1]), 'بالا', 'the snippet marks the word found');
    assert.equal(db.getBookContent(I.base).slice(base.pos, base.pos + 4), 'بالا');
    const byTitle = on.find(function (r) { return Number(r.book.id) === I.title; });
    assert.ok(byTitle.inT && !byTitle.inC);
    assert.deepEqual(byTitle.titleMark, [0, 9], 'the title marks the word found');
    // The words the reader marks, asked for when the book is opened.
    assert.deepEqual(db.searchWordsInBook(I.base, 'بالىلار'), ['بالا']);
    assert.deepEqual(db.searchWordsInBook(I.raised, 'بالىلار'), ['بالىسىنى']);
    assert.deepEqual(db.searchWordsInBook(I.exact, 'بالىلار'), [], 'the query as typed is marked as itself');
    // The category still filters.
    assert.deepEqual(ids(db.searchBooks('بالىلار', 'تارىخ', { forms: true })), [I.raised]);
    // Every place in one book, through the forms.
    const all = db.getAllSnippetsForBook(I.base, 'بالىلار', 200, 70, { forms: true });
    assert.equal(all.length, 2);
    assert.includes(all[0].snip, '§MARK_OPEN§بالا§MARK_CLOSE§');
    assert.equal(db.getAllSnippetsForBook(I.base, 'بالىلار', 200, 70).length, 0, 'switched off by default');
    db.close();
  });

  suite.test('search-books-index-and-scan-agree', async function () {
    // With the full-text index ready, only the books it names are scanned for
    // the forms; while it is still being filled, every book is. Same answer.
    const lib = await library('search-forms-index');
    const db = lib.database;
    while (!db.ftsRebuildStep().done) { /* fill the index, as main does after start */ }
    assert.ok(!db.ftsRebuildPending(), 'the index is filled');
    const viaIndex = ids(db.searchBooks('مەدرىسىلەردە بالىلار', 'all', { forms: true }));
    const q2 = ids(db.searchBooks('بالىلار', 'all', { forms: true }));
    db.setSetting('fts_fill_after', '0');
    assert.ok(db.ftsRebuildPending());
    assert.deepEqual(ids(db.searchBooks('مەدرىسىلەردە بالىلار', 'all', { forms: true })), viaIndex);
    assert.deepEqual(ids(db.searchBooks('بالىلار', 'all', { forms: true })), q2);
    db.close();
  });
};
