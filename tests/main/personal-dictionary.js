// ============================================================================
// W8, K12 — the personal dictionary, the main process's half.
//
// The writer could add words but never see, delete, back up or move them, and
// the owner's bug 2 may have put glued «words» in it (two words a paragraph
// break apart, accepted for ever). The rules here: what counts as one word,
// what an imported file may bring (untrusted input), the file it exports, and
// which entries look glued — a hint, never a removal.
// ============================================================================

'use strict';

const path = require('path');

module.exports = function (suite, assert, ctx) {
  const personal = function () { return require(path.join(ctx.root, 'src', 'spellcheck', 'personal.js')); };
  const engine = function () { return require(path.join(ctx.root, 'src', 'spellcheck', 'engine.js')); };

  suite.test('personal-word-rules', function () {
    const v = personal().validatePersonalWord;
    assert.ok(v('ئالما').ok, 'a Uyghur word was refused');
    assert.ok(v('  ئالما ').ok, 'surrounding spaces made a word fail');
    assert.equal(v('ئىككى سۆز').reason, 'not-one-word', 'two words were accepted');
    assert.equal(v('ئ').reason, 'length', 'a one-letter word was accepted');
    assert.equal(v('ا'.repeat(65)).reason, 'length', 'a 65-letter word was accepted');
    assert.ok(!v('English').ok, 'a Latin word was accepted');
    assert.ok(!v('<b>ئالما</b>').ok, 'markup was accepted as a word');
    assert.ok(!v(42).ok, 'a number was accepted');
  });

  suite.test('personal-import', function () {
    const merge = personal().mergeImport;
    assert.deepEqual(merge([], 'not json'), { ok: false, reason: 'not_json' }, 'a file that is not JSON was read');
    assert.deepEqual(merge([], '{"a": 1}'), { ok: false, reason: 'not_array' }, 'a JSON object was read as a list');

    const file = JSON.stringify(['يېڭى', 'ئالما', 'ئىككى سۆز', 'x', 123, '<img src=x onerror=alert(1)>', 'يېڭى', 'ا'.repeat(65)]);
    const r = merge(['ئالما'], file);
    assert.ok(r.ok);
    assert.deepEqual(r.words, ['ئالما', 'يېڭى'], 'the merged dictionary is wrong');
    assert.equal(r.added, 1, 'the count of added words is wrong');
    assert.equal(r.rejected, 5, 'the count of refused entries is wrong (duplicates are not refusals)');

    // Never past 5,000; whatever would go past it is counted as refused. (What
    // is already in the dictionary is the writer's own and is not re-checked.)
    const existing = Array.from({ length: 4999 }, function (_, i) { return 'w' + i; });
    const capped = merge(existing, JSON.stringify(['بىرىنچى', 'ئىككىنچى', 'ئۈچىنچى']));
    assert.equal(capped.words.length, 5000, 'the dictionary went past 5,000 words');
    assert.equal(capped.added, 1, 'more than fit was added');
    assert.equal(capped.rejected, 2, 'what did not fit was not counted');

    const big = merge([], '[' + '"ئالما",'.repeat(400000) + '"ئالما"]');
    assert.deepEqual(big, { ok: false, reason: 'too_big' }, 'a file over 2 MB was read');
  });

  suite.test('personal-export', function () {
    const text = personal().exportPersonal(['ئالما', 'كىتاب']);
    assert.deepEqual(JSON.parse(text), ['ئالما', 'كىتاب'], 'the export is not a JSON array of the words');
    assert.equal(personal().EXPORT_FILE_NAME, 'bilim-hezinisi-lughet.json', 'not the web edition\'s file name');
  });

  // «كىتابئوقۇغۇچى» is كىتاب + ئوقۇغۇچى glued together; «ئوقۇغۇچىلار» is a real
  // word; a hyphen is the writer's own join; «كىتاب» is too short to hold two.
  suite.test('glued-hints', function () {
    const e = engine();
    e.init([]);
    const flagged = e.glued(['كىتابئوقۇغۇچى', 'ئوقۇغۇچىلار', 'كىتاب-دەپتەر', 'كىتاب', 'ياخشىكىتاب']);
    assert.ok(flagged.indexOf('كىتابئوقۇغۇچى') !== -1, 'two words glued together were not flagged');
    assert.ok(flagged.indexOf('ياخشىكىتاب') !== -1, 'two words glued together were not flagged');
    assert.ok(flagged.indexOf('ئوقۇغۇچىلار') === -1, 'a real word was flagged');
    assert.ok(flagged.indexOf('كىتاب-دەپتەر') === -1, 'a hyphenated word was flagged');
    assert.ok(flagged.indexOf('كىتاب') === -1, 'a short word was flagged');
  });
};
