// ============================================================================
// 3.6 Phase 1 — verse numbers that can be read, and a translation that
// carries its label wherever it goes.
//
// The mushaf's verse number was 14 px digits in a 36 px ring beside 28 px
// text. It is sized in em against the Arabic now, so it grows with it.
//
// After each translation comes its verse number in square brackets with
// Western digits: «… ئىگىسىدۇر. [4]». Verses the translator rendered as one
// sentence show it once, under the last verse of the group, ending
// «[2 _ 4]»; the earlier verses show a short line pointing to it. Copying,
// inserting into a note and search results carry the same label.
//
// The real src/quran.js and src/verse-label.js are loaded by the harness.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  const SURA = 99;
  const META = { number: SURA, name_ar: 'الزلزلة', name_ug: 'زەلزەلە', name_translit: 'Az-Zalzala', revelation: 'medinan', aya_count: 5 };

  // Verse 1 alone; 2–4 one translation whose FIRST text is the longest (as
  // 53:13's is); verse 5 alone.
  const LONG = 'ئۇزۇنراق ئورتاق تەرجىمە.';
  function rows() {
    return [
      { id: 1, sura: SURA, aya: 1, text_ar: 'آيَةٌ أُولَىٰ', text_ug: 'بىرىنچى ئايەتنىڭ تەرجىمىسى.', ug_from: 1, ug_to: 1 },
      { id: 2, sura: SURA, aya: 2, text_ar: 'آيَةٌ ثَانِيَةٌ', text_ug: LONG, ug_from: 2, ug_to: 4 },
      { id: 3, sura: SURA, aya: 3, text_ar: 'آيَةٌ ثَالِثَةٌ', text_ug: 'ئورتاق تەرجىمە.', ug_from: 2, ug_to: 4 },
      { id: 4, sura: SURA, aya: 4, text_ar: 'آيَةٌ رَابِعَةٌ', text_ug: 'ئورتاق تەرجىمە.', ug_from: 2, ug_to: 4 },
      { id: 5, sura: SURA, aya: 5, text_ar: 'آيَةٌ خَامِسَةٌ', text_ug: 'بەشىنچى ئايەتنىڭ تەرجىمىسى.', ug_from: 5, ug_to: 5 }
    ];
  }
  /** A row as quran-get-aya sends it: with its group's translation. */
  function asSent(row) {
    return Object.assign({}, row, { group_text_ug: row.ug_to > row.ug_from ? LONG : row.text_ug });
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function px(v) { return parseFloat(v); }

  /** The Qur'an view's content area, as renderQuranView lays it out, with a sura in it. */
  async function withSura(body) {
    const host = document.createElement('div');
    host.id = 'quran-test-host';
    host.style.cssText = 'position:fixed;top:0;left:0;width:800px;height:600px;overflow:auto;background:#fff';
    host.innerHTML = '<div class="quran-content" id="quran-content"><div class="quran-content-inner" id="quran-content-inner"></div></div>';
    document.body.appendChild(host);
    const saved = window.S.quran;
    window.S.quran = { suras: [META], curSura: SURA, curAya: 1, searchResults: null, searchQuery: '', bookmarks: [] };
    window.FAKE.quranRows = rows();
    try {
      await window.quranOpenSura(SURA);
      await body(host);
    } finally {
      host.remove();
      window.S.quran = saved;
      document.querySelectorAll('.quran-aya-menu').forEach(function (m) { m.remove(); });
    }
  }

  function verseEl(host, aya) { return host.querySelector('.quran-aya[data-aya="' + aya + '"]'); }
  function trEl(host, aya) { return verseEl(host, aya).querySelector('.quran-aya-ug'); }

  test('verse-label-format', async function (t) {
    const V = window.VerseLabel;
    t.assert.ok(V, 'src/verse-label.js is not loaded');
    t.assert.equal(V.label(7, 7), '[7]');
    t.assert.equal(V.label(4, 6), '[4 _ 6]');
    // Exactly «[» 4 « _ » 6 «]»: an underscore U+005F with one space on each
    // side, in logical order, no direction marks.
    t.assert.deepEqual(Array.from(V.label(4, 6)).map(function (c) { return c.charCodeAt(0); }),
      [0x5B, 0x34, 0x20, 0x5F, 0x20, 0x36, 0x5D]);
    t.assert.equal(V.withLabel('قىيامەت كۈنىنىڭ ئىگىسىدۇر.', 4, 4), 'قىيامەت كۈنىنىڭ ئىگىسىدۇر. [4]');
    t.assert.deepEqual(V.range({ aya: 9 }), { from: 9, to: 9 }, 'a row without a group is its own');

    const u = V.units(rows().map(asSent));
    t.assert.deepEqual(u.map(function (x) { return [x.from, x.to, x.ayas.length]; }), [[1, 1, 1], [2, 4, 3], [5, 5, 1]]);
    t.assert.equal(u[1].text, LONG, 'a group shows its longest text');
  });

  // The bundled Uthmani font draws Arabic-Indic digits as its own verse-end
  // medallion; its digits are 0.27 em tall and the medallion 0.89 em
  // (measured in the app, 3.6 Phase 1). The number is set at 1.75 em of the
  // verse text, so the digits come out at about 0.47 of it — what 0.75 em of
  // an ordinary face gives — and the medallion is the ring.
  let uthmani = null;
  async function loadUthmani() {
    if (!uthmani) {
      uthmani = new FontFace('UthmanicHafs', 'url(../../assets/fonts/UthmanicHafs1.otf)');
      document.fonts.add(uthmani);
    }
    await uthmani.load();
  }

  test('mushaf-verse-numbers-scale', async function (t) {
    await loadUthmani();
    await withSura(async function (host) {
      const ar = verseEl(host, 2).querySelector('.quran-aya-ar');
      const num = ar.querySelector('.quran-aya-num');
      t.assert.equal(num.textContent, '٢', 'the number is in Arabic-Indic digits');
      t.assert.includes(getComputedStyle(num).fontFamily, 'UthmanicHafs', 'the number is not in the Uthmani face');

      function measure() {
        const text = px(getComputedStyle(ar).fontSize);
        const size = px(getComputedStyle(num).fontSize);
        const box = num.getBoundingClientRect();
        return { text: text, size: size, ratio: size / text, h: box.height, w: box.width };
      }
      const at28 = measure();
      t.assert.ok(at28.ratio >= 1.6 && at28.ratio <= 1.9,
        'the number should be set at about 1.75 em of the verse text, got ' + at28.size + ' px beside ' + at28.text + ' px');
      // A plain Uthmani digit is under 0.3 em wide; the medallion is wider than 0.6 em.
      t.assert.ok(at28.w >= at28.size * 0.6, 'the font did not draw its verse-end medallion (width ' + at28.w + ' px at ' + at28.size + ' px)');

      // At another reading size the number follows the text.
      ar.style.fontSize = '44px';
      const at44 = measure();
      t.assert.ok(at44.ratio >= 1.6 && at44.ratio <= 1.9, 'the number did not follow a larger text: ' + at44.size + ' px');
      t.assert.ok(at44.h > at28.h && at44.w > at28.w, 'the medallion did not grow with the text');
    });
  });

  test('mushaf-labels-and-groups', async function (t) {
    await withSura(async function (host) {
      t.assert.ok(trEl(host, 1).textContent.trim().endsWith('بىرىنچى ئايەتنىڭ تەرجىمىسى. [1]'),
        'a verse on its own ends with its number: ' + trEl(host, 1).textContent);
      t.assert.ok(trEl(host, 5).textContent.trim().endsWith('[5]'));

      // The group: shown once, under its last verse, with the longest text.
      t.assert.ok(trEl(host, 4).textContent.trim().endsWith(LONG + ' [2 _ 4]'),
        'the group\'s translation is not under its last verse: ' + trEl(host, 4).textContent);
      [2, 3].forEach(function (aya) {
        const el = trEl(host, aya);
        t.assert.ok(el.classList.contains('quran-aya-ug-ref'), aya + ' should point to the translation, not repeat it');
        t.assert.equal(el.textContent.trim(), 'تەرجىمىسى 4-ئايەتنىڭ ئاستىدا [2 _ 4]');
      });
      t.assert.equal(host.textContent.split(LONG).length - 1, 1, 'the group\'s translation is shown more than once');

      // No left-to-right isolation around the label.
      const label = trEl(host, 4).querySelector('.quran-aya-label');
      t.assert.ok(label, 'the label has no element of its own to style');
      t.assert.equal(getComputedStyle(label).unicodeBidi, 'normal', 'the label is isolated');
      t.assert.equal(getComputedStyle(label).direction, 'rtl');
      t.assert.ok(!label.hasAttribute('dir') && !host.querySelector('bdi'), 'the label is isolated');

      // The pointer takes the reader to the translation and opens no menu.
      trEl(host, 2).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      await sleep(60);
      t.assert.ok(verseEl(host, 4).classList.contains('selected'), 'the pointer did not go to the last verse of the group');
      t.assert.ok(!document.querySelector('.quran-aya-menu'), 'the pointer opened the verse menu');
    });
  });

  test('quran-copy-carries-labels', async function (t) {
    const build = window.QuranCopy && window.QuranCopy.build;
    t.assert.ok(typeof build === 'function', 'QuranCopy.build is missing');
    const r = rows().map(asSent);

    // A run that covers the whole group writes its translation once.
    let out = build([r[0], r[1], r[2], r[3]], true);
    t.assert.equal(out.text,
      '﴿' + r[0].text_ar + '﴾ «' + r[0].text_ug + '» [1]\n\n' +
      '﴿' + r[1].text_ar + '﴾ ﴿' + r[2].text_ar + '﴾ ﴿' + r[3].text_ar + '﴾ «' + LONG + '» [2 _ 4]');
    t.assert.equal(out.html.split('[2 _ 4]').length - 1, 1, 'the group\'s label is written more than once');
    t.assert.equal(out.html.split(LONG).length - 1, 1, 'the group\'s translation is written more than once');

    // One verse inside a group carries the group's translation and label.
    out = build([r[2]], true);
    t.assert.equal(out.text, '﴿' + r[2].text_ar + '﴾ «' + LONG + '» [2 _ 4]');

    // The Arabic alone has no translation, so no label.
    out = build([r[0], r[1]], false);
    t.assert.equal(out.text, '﴿' + r[0].text_ar + '﴾\n\n﴿' + r[1].text_ar + '﴾');
  });

  test('verse-insert-carries-label', async function (t) {
    const quran = {};
    rows().forEach(function (row) { quran[row.sura + ':' + row.aya] = asSent(row); });
    const ed = await t.fresh({ quran: quran });

    t.caretToEnd();
    await window.notesInsertAya(SURA, 3, 'both');
    let tr = ed.querySelectorAll('span[data-ref-insert="1"]');
    t.assert.equal(tr.length, 1);
    t.assert.equal(tr[0].textContent, '«' + LONG + '» [2 _ 4]', 'a verse of a group carries the group\'s translation and label');

    t.caretToEnd();
    await window.notesInsertAya(SURA, 1, 'ug');
    tr = ed.querySelectorAll('span[data-ref-insert="1"]');
    t.assert.equal(tr[1].textContent, '«' + rows()[0].text_ug + '» [1]');

    t.caretToEnd();
    const before = ed.textContent;
    await window.notesInsertAya(SURA, 5, 'ar');
    t.assert.excludes(ed.textContent.slice(before.length), '[5]', 'the Arabic alone carries the translation\'s label');

    // What the preview shows is what is inserted.
    document.getElementById('notes-q-sura').value = String(SURA);
    document.getElementById('notes-q-aya').value = '2';
    window.S.notes.ayaMode = 'both';
    await window.notesQuranPreview();
    t.assert.equal(document.querySelector('#notes-q-preview .notes-quran-preview-ug').textContent, LONG + ' [2 _ 4]');
  });

  test('source-search-quran-labels', async function (t) {
    const group = { id: 4, sura: SURA, aya: 3, text_ar: 'آيَةٌ', text_ug: 'ئورتاق تەرجىمە.', ug_from: 2, ug_to: 4,
      group_text_ug: LONG, snip_ar: '', snip_ug: 'ئورتاق <mark>تەرجىمە</mark>.', verses: [{ aya: 2 }, { aya: 3 }, { aya: 4 }] };
    const arabic = { id: 1, sura: SURA, aya: 1, text_ar: 'آيَةٌ أُولَىٰ', text_ug: 'بىرىنچى', ug_from: 1, ug_to: 1,
      group_text_ug: 'بىرىنچى', snip_ar: '<mark>آيَةٌ</mark> أُولَىٰ', snip_ug: '', verses: [{ aya: 1 }] };
    await t.fresh({ search: { books: [], snippets: {}, ayas: [group, arabic] } });
    document.getElementById('notes-src-q').value = 'تەرجىمە';
    await window.notesSourceSearch();
    const hits = document.querySelectorAll('#notes-src-results .notes-src-hit[data-kind="aya"] .notes-src-snippet');
    t.assert.equal(hits.length, 2);
    t.assert.ok(hits[0].textContent.trim().endsWith('[2 _ 4]'), 'a translation found carries its label: ' + hits[0].textContent);
    t.assert.excludes(hits[1].textContent, '[1]', 'an Arabic snippet is not the translation');
  });

  test('quran-search-cards-once', async function (t) {
    await withSura(async function (host) {
      const group = { id: 3, sura: SURA, aya: 3, text_ar: 'آيَةٌ ثَالِثَةٌ', text_ug: 'ئورتاق تەرجىمە.', ug_from: 2, ug_to: 4,
        group_text_ug: LONG, snip_ar: '', snip_ug: 'ئورتاق <mark>تەرجىمە</mark>.',
        verses: [{ aya: 2, text_ar: 'آيَةٌ ثَانِيَةٌ', snip_ar: '' }, { aya: 3, text_ar: 'آيَةٌ ثَالِثَةٌ', snip_ar: '' }, { aya: 4, text_ar: 'آيَةٌ رَابِعَةٌ', snip_ar: '' }] };
      window.FAKE.search = { books: [], snippets: {}, ayas: [group] };
      window.S.quran.searchQuery = 'تەرجىمە';
      await window.quranRunSearchNow();
      const cards = host.querySelectorAll('.quran-search-result');
      t.assert.equal(cards.length, 1, 'a group is one card');
      t.assert.equal(cards[0].querySelectorAll('.quran-search-result-ar').length, 3, 'each verse found keeps its Arabic');
      const ug = cards[0].querySelector('.quran-search-result-ug');
      t.assert.ok(ug.textContent.trim().endsWith('[2 _ 4]'), 'the translation does not carry its label: ' + ug.textContent);
      t.assert.equal(host.querySelectorAll('.quran-search-result-ug').length, 1, 'the translation is shown once');
    });
  });
})();
