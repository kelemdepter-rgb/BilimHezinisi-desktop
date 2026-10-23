// ============================================================================
// W12 — the writer looks for a source; they do not wait for one.
//
// «مەنبە» only ever listed what the reference scanner happened to find in
// what had been typed. A search box at the top now searches the library (the
// existing search IPC, then each book's own occurrences with their offsets)
// and the Qur'an (the existing quran-search), and inserts a result with its
// citation (W11). The automatic references stay below it.
//
// The «تەرجىمىسى بىلەن» checkbox becomes «ئەرەبچە / تەرجىمىسى / ئىككىلىسى»,
// remembered in the settings.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  const Q = 'ئىلىم';
  const ENC_Q = encodeURIComponent(Q);

  function place(before, pos) {
    return { snip: before + ' §MARK_OPEN§' + Q + '§MARK_CLOSE§ كېيىنكى سۆزلەر', pos: pos };
  }

  function fixture() {
    return {
      books: [
        { book: { id: 5, title: 'سىناق كىتابى' }, snip: '...<mark>' + Q + '</mark>...', pos: 40, inT: false, inA: false, inC: true },
        // Found by its title alone: there is no passage to quote.
        { book: { id: 6, title: 'ماۋزۇدىلا' }, snip: '', inT: true, inA: false, inC: false }
      ],
      snippets: {
        5: [
          place('بىرىنچى', 40),
          place('ئىككىنچى', 900),
          place('<img src="x" onerror="window.__srcPwned=1">', 1500),
          place('تۆتىنچى', 2000)
        ]
      },
      ayas: [
        { id: 262, sura: 2, aya: 255, text_ar: 'ٱللَّهُ لَآ إِلَٰهَ', text_ug: 'ئاللاھتىن باشقا ئىلاھ يوقتۇر',
          snip_ar: '', snip_ug: 'ئاللاھتىن <mark>باشقا</mark> ئىلاھ' }
      ]
    };
  }

  function box() { return document.getElementById('notes-src-results'); }
  function hits(kind) { return box().querySelectorAll('.notes-src-hit[data-kind="' + kind + '"]'); }
  function calls(name) { return window.FAKE.calls.filter(function (c) { return c[0] === name; }); }
  function citations(ed) { return Array.from(ed.querySelectorAll('a.bh-cite')).map(function (a) { return a.getAttribute('href'); }); }

  async function search(text) {
    const input = document.getElementById('notes-src-q');
    input.value = text;
    await window.notesSourceSearch();
  }

  test('source-search-library-and-quran', async function (t) {
    const ed = await t.fresh({ html: '<p>ئالدى</p>', search: fixture() });
    t.caretToEnd();
    window.notesSetTab('refs');
    t.assert.ok(document.getElementById('notes-src-q'), 'no search box in «مەنبە»');
    t.assert.ok(document.getElementById('notes-refs-content'), 'the automatic references are gone');

    await search('  ' + Q + ' ');
    t.assert.deepEqual(calls('dbSearch'), [['dbSearch', Q, 'all', { history: false }]],
      'the library was not searched, or the search went into the search history');
    t.assert.deepEqual(calls('quranSearch').map(function (c) { return c[1]; }), [Q], 'the Qur\'an was not searched');

    const books = hits('book');
    t.assert.equal(books.length, 3, 'a book shows its first three places');
    t.assert.includes(books[0].textContent, 'سىناق كىتابى', 'a place does not name its book');
    t.assert.equal(books[0].querySelector('mark') && books[0].querySelector('mark').textContent, Q, 'the word is not marked');
    t.assert.excludes(box().textContent, 'ماۋزۇدىلا', 'a title-only match was offered as a passage');
    t.assert.equal(box().querySelectorAll('img').length, 0, 'markup in a book became an element');
    t.assert.equal(window.__srcPwned, undefined, 'markup in a book ran');

    box().querySelector('[data-action="more"]').click();
    t.assert.equal(hits('book').length, 4, '«more» did not show the rest of the book\'s places');

    hits('book')[1].querySelector('[data-action="insert"]').click();
    const quote = ed.querySelector('blockquote[data-ref-insert="1"]');
    t.assert.ok(quote, 'the passage was not inserted');
    t.assert.includes(quote.textContent, 'ئىككىنچى ' + Q, 'the wrong passage was inserted');
    t.assert.deepEqual(citations(ed), ['bh://book/5?o=900&q=' + ENC_Q], 'the citation does not point at that place');

    t.assert.equal(hits('aya').length, 1, 'the verse was not listed');
    t.assert.includes(hits('aya')[0].textContent, '2:255', 'the verse does not say which it is');
    hits('aya')[0].querySelector('[data-action="insert"]').click();
    await t.sleep(30);
    t.assert.ok(citations(ed).indexOf('bh://quran/2/255') !== -1, 'the verse was not inserted with its citation');

    // «ئېچىش» goes to the book at that place, the note saved first.
    const opened = [];
    window.openReader = function (id, hl, pos) { opened.push([id, hl, pos]); };
    try {
      hits('book')[0].querySelector('[data-action="open"]').click();
      await t.sleep(40);
      t.assert.deepEqual(opened, [[5, Q, 40]], 'the book did not open at the place found');
      t.assert.ok(!window.S.notes.dirty, 'the note was not saved before the reader opened');
    } finally {
      delete window.openReader;
      window.S.mode = 'notes';
    }
  });

  test('source-search-fallback-and-messages', async function (t) {
    const fx = fixture();
    fx.snippets = { 5: [] };   // the words are in the book, but not side by side
    fx.books[0].snip = '...<mark>ئىلىم</mark> ۋە <mark>ھېكمەت</mark>...';
    const ed = await t.fresh({ html: '<p>ئالدى</p>', search: fx });
    t.caretToEnd();
    window.notesSetTab('refs');

    await search('ب');
    t.assert.equal(calls('dbSearch').length, 0, 'one letter was searched');
    t.assert.includes(box().textContent, 'كەم دېگەندە ئىككى ھەرپ يېزىڭ', 'a one-letter search was not explained');

    await search('ئىلىم ھېكمەت');
    t.assert.equal(hits('book').length, 1, 'the search\'s own snippet was not offered');
    t.assert.equal(hits('book')[0].querySelectorAll('mark').length, 2, 'the snippet lost its marks');
    hits('book')[0].querySelector('[data-action="insert"]').click();
    t.assert.deepEqual(citations(ed), ['bh://book/5'], 'a passage without a place should point at the book alone');
    t.assert.excludes(ed.textContent, '<mark>', 'the snippet\'s markup was inserted as text');

    window.FAKE.search = { books: [], snippets: {}, ayas: [] };
    await search('يوق نەرسە');
    t.assert.includes(box().textContent, 'ھېچنېمە تېپىلمىدى', 'an empty result said nothing');
  });

  test('source-aya-mode-remembered', async function (t) {
    await t.fresh({ settings: { notes_aya_mode: 'ug' } });
    t.assert.equal(window.S.notes.ayaMode, 'ug', 'the remembered choice was not read');
    const radio = function (v) { return document.querySelector('input[name="notes-aya-mode"][value="' + v + '"]'); };
    t.assert.ok(radio('ar') && radio('ug') && radio('both'), 'the three-way choice is missing');
    t.assert.ok(radio('ug').checked, 'the remembered choice is not shown');
    t.assert.ok(!document.getElementById('notes-q-tr'), 'the old checkbox is still there');

    document.getElementById('notes-q-sura').value = '2';
    document.getElementById('notes-q-aya').value = '255';
    await window.notesQuranPreview();
    const preview = document.getElementById('notes-q-preview');
    t.assert.ok(!preview.querySelector('.notes-quran-preview-ar'), '«تەرجىمىسى» previews the Arabic');
    t.assert.ok(preview.querySelector('.notes-quran-preview-ug'), '«تەرجىمىسى» does not preview the translation');

    t.caretToEnd();
    preview.querySelector('[data-action="insert"]').click();
    await t.sleep(30);
    const ed = t.editor();
    t.assert.ok(!ed.querySelector('[style*="UthmanicHafs"]'), '«تەرجىمىسى» inserted the Arabic');
    t.assert.includes(ed.textContent, 'ئاللاھنىڭ ئىسمى بىلەن', '«تەرجىمىسى» did not insert the translation');

    radio('ar').checked = true;
    radio('ar').dispatchEvent(new Event('change', { bubbles: true }));
    await t.sleep(30);
    t.assert.equal(window.FAKE.settings.notes_aya_mode, 'ar', 'the choice was not remembered');
    t.assert.ok(preview.querySelector('.notes-quran-preview-ar'), 'the preview did not follow the choice');
    t.assert.ok(!preview.querySelector('.notes-quran-preview-ug'), 'the preview did not follow the choice');

    await t.fresh({ settings: { notes_aya_mode: 'nonsense' } });
    t.assert.equal(window.S.notes.ayaMode, 'both', 'an unknown stored value was not read as «ئىككىلىسى»');
    t.assert.ok(radio('both').checked);
  });
})();
