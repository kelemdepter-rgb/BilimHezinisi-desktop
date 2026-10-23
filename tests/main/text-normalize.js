// ============================================================================
// W18, K15 — letters, not glyph codepoints.
//
// Some Word installations save Uyghur as Arabic PRESENTATION FORMS: one
// codepoint per drawn shape of a letter. The page looks right, and the text
// is invisible to search, a separate author in the index, and useless when
// copied out. text-normalize.js folds the shapes back into letters (a port of
// the web edition's lib/books/presentation-forms.ts) at every way text enters
// the library, and «كىتابلارنى تەكشۈرۈش» repairs books already stored that way
// with the web repair script's checks.
//
// The one thing never to do is NFKC over a whole string: it expands ﷲ into
// four letters and ﷺ into an eighteen-letter phrase, and they are content.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

/** A string as glyph codepoints, the way a damaged Word file stores it. */
const DAMAGED_UYGHUR = 'ﺋﯘﻳﻐﯘﺭ ﺗﯩﻠﻰ ﺑﯩﻠﻪﻥ ﻳﯧﺰﯨﻠﻐﺎﻥ ﻛﯩﺘﺎﺏ ﺩﯙﻟﻪﺕ';

async function fresh(ctx, name) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({ beforeFirst: async function () {} });
  return database;
}

module.exports = function (suite, assert, ctx) {
  function TN() { return require(path.join(ctx.root, 'text-normalize.js')); }

  suite.test('forms-fold', function () {
    const tn = TN();
    // Every assigned codepoint of both letter ranges.
    let generated = '';
    for (const range of [[0xFB50, 0xFBFF], [0xFE70, 0xFEFF]]) {
      for (let cp = range[0]; cp <= range[1]; cp++) {
        const ch = String.fromCodePoint(cp);
        if (ch.normalize('NFKC') !== ch) generated += ch;
      }
    }
    assert.ok(generated.length > 250, 'the generated text is too short to mean anything (' + generated.length + ')');
    const folded = tn.foldPresentationForms(generated);
    for (const ch of folded) {
      assert.ok(!tn.isPresentationForm(ch.codePointAt(0)), 'a glyph codepoint survived: U+' + ch.codePointAt(0).toString(16));
    }
    // Every form that folds to a letter, or to the two letters of a lam-alef
    // or a Uyghur hamza ligature, passes the repair's checks...
    const letterForms = Array.from(generated).filter(function (ch) {
      const n = Array.from(tn.foldPresentationForms(ch)).length;
      const cp = ch.codePointAt(0);
      return n === 1 || (cp >= tn.LAM_ALEF_FIRST && cp <= tn.LAM_ALEF_LAST) ||
        (cp >= tn.HAMZA_LIGATURE_FIRST && cp <= tn.HAMZA_LIGATURE_LAST);
    }).join('');
    assert.ok(Array.from(letterForms).length > 250, 'too few letter forms (' + Array.from(letterForms).length + ')');
    assert.deepEqual(tn.verifyFold(letterForms, tn.foldPresentationForms(letterForms)), [],
      'the fold of the letter forms fails its own checks');
    // ...and anything else that folds to more (a spacing vowel mark) refuses its book.
    assert.ok(tn.verifyFold('abﹰ', tn.foldPresentationForms('abﹰ')).some(function (p) { return /not lam-alef/.test(p); }),
      'an unexpected expansion was let through');

    // Heh drawn alone or at the end of a word is the Uyghur ە, not ه.
    assert.equal(tn.foldPresentationForms('ﻩﻪ'), 'ەە');
    assert.equal(tn.foldPresentationForms('ﻫﻬ'), 'هه');
    // Lam-alef, and a hamza ligature: one codepoint, two letters.
    assert.equal(tn.foldPresentationForms('ﻻ'), 'لا');
    assert.equal(tn.foldPresentationForms('ﯬ'), 'ئە', 'ﯬ did not fold to ئە');

    // The religious ligatures and the ornate parentheses are content.
    const sacred = 'ﷲ ﷺ ﷻ ﷽ ﴾ﷲ﴿';
    assert.equal(tn.foldPresentationForms(sacred), sacred, 'a religious ligature was folded');
    assert.equal(tn.normalizeImportedText(sacred), sacred);

    const fixed = tn.normalizeImportedText(DAMAGED_UYGHUR);
    assert.equal(fixed, 'ئۇيغۇر تىلى بىلەن يېزىلغان كىتاب دۆلەت', 'damaged Uyghur did not come back as letters');
    // Ordinary text comes back exactly as it went in.
    const plain = 'بۇ ئادەتتىكى ئۇيغۇرچە تېكىست. English, 123, ﷲ.';
    assert.equal(tn.normalizeImportedText(plain), plain);
    assert.equal(tn.normalizeImportedText(null), '');
  });

  suite.test('forms-checks', function () {
    const tn = TN();
    const before = DAMAGED_UYGHUR + ' ﻻ ﷲ';
    assert.deepEqual(tn.verifyFold(before, tn.foldPresentationForms(before)), []);

    const survivor = tn.verifyFold(before, tn.foldPresentationForms(before) + 'ﺍ');
    assert.ok(survivor.some(function (p) { return /still there/.test(p); }), 'a surviving glyph was not caught');

    // What NFKC over the whole string would do: ﷲ becomes four letters.
    const nfkc = tn.verifyFold(before, before.normalize('NFKC'));
    assert.ok(nfkc.some(function (p) { return /religious ligatures/.test(p); }), 'an expanded ﷲ was not caught');
    assert.ok(nfkc.some(function (p) { return /length/.test(p); }), 'a wrong length was not caught');

    assert.ok(tn.verifyFold(before, '').some(function (p) { return /emptied/.test(p); }), 'an emptied row was not caught');

    const share = tn.presentationFormShare('abﺍﺍ');
    assert.deepEqual(share, { forms: 2, total: 4, share: 0.5 });
    assert.equal(tn.countSacredLigatures('ﷲ ﷺ x'), 2);
  });

  suite.test('forms-folded-on-the-way-in', async function () {
    const database = await fresh(ctx, 'forms-ingest');
    const id = Number(database.addBook(DAMAGED_UYGHUR, DAMAGED_UYGHUR, 'باشقا', 'DOCX', '', DAMAGED_UYGHUR, 'باش ' + DAMAGED_UYGHUR + ' ﷲ', null));
    let b = database.getBook(id);
    assert.equal(b.title, 'ئۇيغۇر تىلى بىلەن يېزىلغان كىتاب دۆلەت', 'db-add-book stored glyph codepoints in the title');
    assert.equal(b.author, b.title, 'db-add-book stored glyph codepoints in the author');
    assert.equal(b.description, b.title, 'db-add-book stored glyph codepoints in the description');
    assert.equal(database.getBookContent(id), 'باش ئۇيغۇر تىلى بىلەن يېزىلغان كىتاب دۆلەت ﷲ', 'db-add-book stored glyph codepoints in the text');
    assert.ok(database.searchBooks('يېزىلغان').some(function (r) { return r.book.id === id; }), 'the folded text is not found by search');

    const batch = database.addBooksBatch([{ title: DAMAGED_UYGHUR + ' 2', author: '', content: DAMAGED_UYGHUR }]);
    const id2 = Number(batch.added[0].id);
    assert.equal(database.getBook(id2).title, 'ئۇيغۇر تىلى بىلەن يېزىلغان كىتاب دۆلەت 2', 'db-add-books-batch did not fold');
    assert.equal(database.getBookContent(id2), 'ئۇيغۇر تىلى بىلەن يېزىلغان كىتاب دۆلەت');

    database.updateBook(id, DAMAGED_UYGHUR, '', 'باشقا', '');
    assert.equal(database.getBook(id).title, 'ئۇيغۇر تىلى بىلەن يېزىلغان كىتاب دۆلەت', 'db-update-book did not fold');
    database.saveBookContent(id, DAMAGED_UYGHUR);
    assert.equal(database.getBookContent(id), 'ئۇيغۇر تىلى بىلەن يېزىلغان كىتاب دۆلەت', 'db-save-content did not fold');
    // The renderer's whole-library save sends the title it holds.
    database.syncBooks([{ id: id, title: DAMAGED_UYGHUR, author: DAMAGED_UYGHUR, category: 'باشقا', format: 'DOCX', date: '', desc: '' }]);
    b = database.getBook(id);
    assert.equal(b.title, 'ئۇيغۇر تىلى بىلەن يېزىلغان كىتاب دۆلەت', 'save-library wrote glyph codepoints back');
    assert.equal(b.author, b.title);
    database.close();
  });

};
