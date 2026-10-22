// ============================================================================
// W8, K12 — the personal-dictionary panel.
//
// The words the writer added with «لۇغەتكە قوشۇش» could never be seen or
// removed. The panel lists them, filters, deletes, exports and imports, and
// marks the ones that look like two words glued together — which the owner's
// bug 2 may have stored. Every word is put on screen as text, never as HTML.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  function rows() {
    return Array.from(document.querySelectorAll('#notes-dict-list .nd-row'));
  }
  function wordsShown() {
    return rows().map(function (r) { return r.querySelector('.nd-word').textContent; });
  }

  test('dictionary-panel', async function (t) {
    await t.fresh({
      settings: { spell_user_words: 'ئالما,كىتابئوقۇغۇچى,<b>x</b>' },
      glued: ['كىتابئوقۇغۇچى']
    });
    t.assert.ok(typeof window.notesShowDictionary === 'function', 'there is no personal-dictionary panel');
    await window.notesShowDictionary();
    await t.sleep(60);

    t.assert.equal(rows().length, 3, 'the panel does not list the words');
    t.assert.ok(wordsShown().indexOf('<b>x</b>') !== -1, 'an odd entry was not shown as it is');
    t.assert.ok(!document.querySelector('#notes-dict-list b'), 'an entry was rendered as HTML');
    const glued = rows().filter(function (r) { return r.querySelector('.nd-glued'); })
      .map(function (r) { return r.querySelector('.nd-word').textContent; });
    t.assert.deepEqual(glued, ['كىتابئوقۇغۇچى'], 'the glued entry is not marked, or a correct one is');

    // Filter.
    const filter = document.getElementById('notes-dict-filter');
    filter.value = 'ئال';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await t.sleep(30);
    t.assert.deepEqual(wordsShown(), ['ئالما'], 'the filter does not narrow the list');
    filter.value = '';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await t.sleep(30);

    // Delete.
    const row = rows().filter(function (r) { return r.querySelector('.nd-word').textContent === 'كىتابئوقۇغۇچى'; })[0];
    row.querySelector('.nd-del').click();
    await t.sleep(60);
    t.assert.equal(window.FAKE.settings.spell_user_words.split(',').indexOf('كىتابئوقۇغۇچى'), -1,
      'the deleted word is still stored');
    t.assert.equal(window.FAKE.personal.indexOf('كىتابئوقۇغۇچى'), -1, 'the engine was not told');
    t.assert.equal(wordsShown().indexOf('كىتابئوقۇغۇچى'), -1, 'the deleted word is still listed');

    // Export.
    document.querySelector('#notes-dictionary [data-action="export"]').click();
    await t.sleep(40);
    const exported = window.FAKE.calls.filter(function (c) { return c[0] === 'spellDictionaryExport'; })[0];
    t.assert.ok(exported && exported[1].indexOf('ئالما') !== -1, 'the export did not get the words');

    // Import: the main process answers with the merged list and the counts.
    window.FAKE.importAnswer = { success: true, words: ['ئالما', '<b>x</b>', 'يېڭى'], added: 1, rejected: 2 };
    document.querySelector('#notes-dictionary [data-action="import"]').click();
    await t.sleep(80);
    t.assert.ok(wordsShown().indexOf('يېڭى') !== -1, 'the imported word is not listed');
    t.assert.ok(window.FAKE.settings.spell_user_words.split(',').indexOf('يېڭى') !== -1, 'the imported word was not stored');
    t.assert.ok(window.TOASTS.some(function (x) { return /1/.test(x[0]) && /2/.test(x[0]); }),
      'the writer was not told how many were added and refused');
  });
})();
