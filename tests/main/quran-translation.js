// ============================================================================
// 3.6 Phase 1 — the Uyghur translation of the Qur'an: markers out, words
// untouched, and every verse knows the group its translation belongs to.
//
// The bundled QuranEnc file (assets/seed/uyghur_saleh_v1.0.2-xml.1.xml) ends
// each translation with its verse number in parentheses: «…ئىگىسىدۇر(4).».
// 185 runs of consecutive verses carry the SAME translation — the translator
// rendered them as one sentence and the file repeats it under each verse —
// and their marker is a range: «(160ـ161)», separated by a tatweel (U+0640),
// a hyphen, sometimes backwards («(56- 55)»). The 3.5 cleaner knew only digits,
// commas, spaces and hyphens, so about 430 verses still showed «(160ـ161)»
// inside the translation.
//
// These tests read the XML themselves, so they do not lean on the parser
// they check.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

// A parenthesised group holding nothing but digits and separators — the
// definition the work order gives. A group with a letter in it is text.
const MARKER = /\(([\s0-9٠-٩\-–ـ،,‌‍]*)\)/g;
function hasDigit(s) { return /[0-9٠-٩]/.test(s); }
function markersOf(text) {
  return Array.from(String(text).matchAll(MARKER)).filter(function (m) { return hasDigit(m[1]); });
}
function squeeze(s) { return String(s).replace(/\s+/g, ''); }

let RAW = null;
/** Every verse of the bundled XML, as the file has it: [{ sura, aya, text }]. */
function rawVerses(ctx) {
  if (RAW) return RAW;
  const { parse } = require(path.join(ctx.root, 'node_modules', 'node-html-parser'));
  const xml = fs.readFileSync(path.join(ctx.root, 'assets', 'seed', 'uyghur_saleh_v1.0.2-xml.1.xml'), 'utf8');
  const out = [];
  for (const s of parse(xml).querySelectorAll('sura')) {
    for (const a of s.querySelectorAll('aya')) {
      const text = a.querySelector('translation').text.trim().replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
      out.push({ sura: Number(s.getAttribute('number')), aya: Number(a.getAttribute('number')), text: text });
    }
  }
  RAW = out;
  return out;
}

/** The 3.5 seeder's two steps, frozen here: what a library made before 3.6 holds. */
function cleanedBy35(text) {
  return text.replace(/\(\d+\)[.。]?\s*$/, '').trim()
    .replace(/\([\d،,\s\-]+\)/g, '')
    .replace(/\[[\d،,\s\-]+\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fresh(ctx, name, steps) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({ steps: steps, beforeFirst: async function () {} });
  return database;
}

/** A second connection to a test library (WAL lets both work). */
function raw(ctx, name) {
  const Sqlite = require(path.join(ctx.root, 'node_modules', 'better-sqlite3'));
  return new Sqlite(path.join(ctx.tmpDir, name, 'library.db'));
}

/** A library seeded the way 3.5 seeded it (the Arabic does not matter here). */
function seedAs35(ctx, name) {
  const seed = require(path.join(ctx.root, 'scripts', 'seed-quran.js'));
  const db = raw(ctx, name);
  db.transaction(function () {
    for (const s of seed.SURA_META) {
      db.prepare('INSERT INTO quran_suras (number, name_ar, name_ug, name_translit, revelation, aya_count) VALUES (?,?,?,?,?,?)')
        .run(s.n, s.ar, s.ug, s.tr, s.rev, s.count);
    }
    const ins = db.prepare('INSERT INTO quran_ayas (sura, aya, text_ar, text_ar_simple, text_ug) VALUES (?,?,?,?,?)');
    for (const v of rawVerses(ctx)) ins.run(v.sura, v.aya, 'آية ' + v.aya, 'اية ' + v.aya, cleanedBy35(v.text));
  })();
  db.close();
}

function verse(rows, sura, aya) {
  return rows.find(function (r) { return r.sura === sura && r.aya === aya; });
}

module.exports = function (suite, assert, ctx) {
  suite.test('quran-cleaner-markers-out-words-untouched', function () {
    const seed = require(path.join(ctx.root, 'scripts', 'seed-quran.js'));
    const verses = rawVerses(ctx);
    assert.equal(verses.length, 6236, 'the bundled file does not hold 6,236 verses');

    const left = [];
    const changed = [];
    for (const v of verses) {
      const clean = seed.cleanUyghurTranslation(v.text);
      if (markersOf(clean).length) left.push(v.sura + ':' + v.aya + ' ' + markersOf(clean)[0][0]);
      // What was removed is only marker groups (and the space around them):
      // every other character is there, in the same order.
      const expected = squeeze(v.text.replace(MARKER, function (m, inner) { return hasDigit(inner) ? '' : m; }));
      if (squeeze(clean) !== expected) changed.push(v.sura + ':' + v.aya);
    }
    assert.deepEqual(left.slice(0, 5), [], left.length + ' translations still carry a verse marker');
    assert.deepEqual(changed.slice(0, 5), [], changed.length + ' translations lost or changed more than their markers');

    function cleanOf(s, a) { return seed.cleanUyghurTranslation(verse(verses, s, a).text); }
    assert.equal(cleanOf(1, 4), 'قىيامەت كۈنىنىڭ ئىگىسىدۇر.', 'the sentence lost its full stop with the marker');
    assert.includes(cleanOf(58, 4), '(60 مىسكىنگە بىر ۋاخ تاماق بېرىشى لازىم)', 'words in parentheses are translation text');
    assert.includes(cleanOf(2, 203), '(تەشرىق كۈنلىرى يەنى قۇربان ھېيتنىڭ 1 – 2 – 3 كۈنلىرىدە)', 'words in parentheses are translation text');
    assert.excludes(cleanOf(23, 55), '55', 'a backwards range «(56- 55)» was left');
    assert.excludes(cleanOf(38, 88), '88', 'a marker holding a zero-width joiner was left');
    assert.equal(cleanOf(89, 2).indexOf('(زۇلھەججىنىڭ دەسلەپكى)'), 0, 'a marker at the start took the words after it');
    assert.excludes(cleanOf(15, 97), '(97)', 'a marker in the middle of the text was left');
  });

  suite.test('quran-groups-from-the-bundled-text', function () {
    const seed = require(path.join(ctx.root, 'scripts', 'seed-quran.js'));
    const verses = rawVerses(ctx);

    // The data as the work order measured it.
    const runs = {};
    let i = 0;
    let runCount = 0;
    while (i < verses.length) {
      let j = i;
      while (j + 1 < verses.length && verses[j + 1].sura === verses[i].sura && verses[j + 1].text === verses[i].text) j++;
      if (j > i) { runs[j - i + 1] = (runs[j - i + 1] || 0) + 1; runCount++; }
      i = j + 1;
    }
    assert.equal(runCount, 185, 'runs of identical translations');
    assert.deepEqual(runs, { 2: 149, 3: 24, 4: 6, 5: 3, 6: 2, 7: 1 }, 'sizes of the identical runs');

    const map = {};
    for (const v of verses) { (map[v.sura] = map[v.sura] || {})[v.aya] = v.text; }
    const groups = seed.uyghurGroups(map);

    // Every verse has a group that holds it, and the group is the same for
    // each of its verses.
    let multi = 0;
    const sizes = {};
    for (const v of verses) {
      const g = groups[v.sura] && groups[v.sura][v.aya];
      assert.ok(g && g.from <= v.aya && v.aya <= g.to, v.sura + ':' + v.aya + ' has no group that holds it');
      for (let a = g.from; a <= g.to; a++) {
        assert.deepEqual(groups[v.sura][a], g, v.sura + ':' + a + ' disagrees with ' + v.sura + ':' + v.aya);
      }
      if (g.to > g.from) {
        multi++;
        if (v.aya === g.to) sizes[g.to - g.from + 1] = (sizes[g.to - g.from + 1] || 0) + 1;
      }
    }
    // The identical runs, and 53:13–14: «(13ـ14)» on two different texts.
    assert.deepEqual(sizes, { 2: 150, 3: 24, 4: 6, 5: 3, 6: 2, 7: 1 }, 'group sizes');
    assert.equal(multi, 430, 'verses whose translation is shared');
    assert.deepEqual(groups[53][13], { from: 13, to: 14 }, '53:13–14 is one group');
    assert.deepEqual(groups[53][14], { from: 13, to: 14 }, '53:13–14 is one group');
    assert.deepEqual(groups[23][55], { from: 55, to: 56 }, '«(56- 55)» is 55–56');
    assert.deepEqual(groups[20][29], { from: 29, to: 30 }, '«(30 ـ 29)» is 29–30');
    // 6:5 repeats 6:4's sentence with its marker «(4)» before its own «(5)»;
    // the two texts differ, so 6:5 stands alone.
    assert.deepEqual(groups[6][5], { from: 5, to: 5 }, '6:5 is a verse of its own');
    assert.deepEqual(groups[6][4], { from: 4, to: 4 }, '6:4 is a verse of its own');
    assert.deepEqual(groups[1][4], { from: 4, to: 4 });
  });

  suite.test('quran-step-recleans-and-groups', async function () {
    const database = require(path.join(ctx.root, 'database.js'));
    const step = database.MIGRATIONS.find(function (s) { return s.name === 'quran_translation_groups'; });
    assert.ok(step, 'there is no migration step for the translation groups');

    await fresh(ctx, 'quran-groups-step', database.MIGRATIONS.filter(function (s) { return s.version < step.version; }));
    seedAs35(ctx, 'quran-groups-step');
    const before = database.quranGetAyas(37);
    assert.ok(before.some(function (r) { return markersOf(r.text_ug).length; }), 'the 3.5 library should show markers in sura 37');

    const r = await database.runMigrations({ beforeFirst: async function () {} });
    assert.ok(r.ran.indexOf(step.version) !== -1, 'the step did not run');

    const db = raw(ctx, 'quran-groups-step');
    const rows = db.prepare('SELECT sura, aya, text_ug, ug_from, ug_to FROM quran_ayas').all();
    assert.equal(rows.length, 6236);
    const marked = rows.filter(function (row) { return markersOf(row.text_ug).length; });
    assert.equal(marked.length, 0, marked.length + ' translations still carry a marker, e.g. ' +
      (marked[0] ? marked[0].sura + ':' + marked[0].aya : ''));
    assert.equal(rows.filter(function (row) { return row.ug_from == null || row.ug_to == null; }).length, 0, 'a verse has no group');
    assert.equal(rows.filter(function (row) { return row.ug_to > row.ug_from; }).length, 430);

    const v534 = verse(rows, 58, 4);
    assert.includes(v534.text_ug, '(60 مىسكىنگە بىر ۋاخ تاماق بېرىشى لازىم)');
    assert.equal(verse(rows, 1, 4).text_ug, 'قىيامەت كۈنىنىڭ ئىگىسىدۇر.');
    assert.deepEqual([verse(rows, 53, 13).ug_from, verse(rows, 53, 13).ug_to], [13, 14]);
    assert.deepEqual([verse(rows, 53, 14).ug_from, verse(rows, 53, 14).ug_to], [13, 14]);

    // The readers give the group with each verse, and its translation: the
    // longer of 53:13–14's two.
    const a = database.quranGetAya(53, 14);
    assert.deepEqual([a.ug_from, a.ug_to], [13, 14]);
    assert.equal(a.group_text_ug, verse(rows, 53, 13).text_ug, 'the group shows the longer of the two texts');
    const sura = database.quranGetAyas(23);
    assert.deepEqual([verse(sura, 23, 55).ug_from, verse(sura, 23, 55).ug_to], [55, 56]);

    // quran_fts has no update trigger: the step rebuilt it, so the index
    // agrees with the text it indexes, and a search finds a re-cleaned verse.
    db.prepare("INSERT INTO quran_fts(quran_fts, rank) VALUES('integrity-check', 1)").run();
    const old = db.prepare('SELECT COUNT(*) AS n FROM quran_fts WHERE quran_fts MATCH ?').get('"160ـ161"').n;
    assert.equal(old, 0, 'the index still holds a marker the text no longer has');
    const found = database.quranSearch('سىدرەتۇلمۇنتەھا', { lang: 'ug' })
      .filter(function (h) { return h.sura === 53 && h.aya >= 13 && h.aya <= 14; });
    assert.equal(found.length, 1, 'the group 53:13–14 should be found once, not once per verse');
    assert.deepEqual([found[0].sura, found[0].ug_from, found[0].ug_to], [53, 13, 14]);
    db.close();
    database.close();
  });

  suite.test('quran-search-lists-a-group-once', async function () {
    const database = require(path.join(ctx.root, 'database.js'));
    await fresh(ctx, 'quran-groups-search', database.MIGRATIONS.filter(function (s) { return s.version <= 5; }));
    seedAs35(ctx, 'quran-groups-search');
    await database.runMigrations({ beforeFirst: async function () {} });

    // 37:151–152 share one sentence; a word of it is found once, labelled
    // with the whole group.
    const g = database.quranGetAya(37, 151);
    assert.ok(g.ug_to > g.ug_from, '37:151 should be part of a group');
    const word = g.text_ug.split(/\s+/).filter(function (w) { return w.length > 5; })[0].replace(/[.،!؟»«]/g, '');
    const hits = database.quranSearch(word, { lang: 'ug' }).filter(function (h) { return h.sura === 37 && h.aya >= g.ug_from && h.aya <= g.ug_to; });
    assert.equal(hits.length, 1, 'the group came back ' + hits.length + ' times for «' + word + '»');
    assert.deepEqual([hits[0].ug_from, hits[0].ug_to], [g.ug_from, g.ug_to]);
    assert.ok(Array.isArray(hits[0].verses) && hits[0].verses.length === g.ug_to - g.ug_from + 1,
      'the card should carry each verse of the group that was found');
    assert.equal(hits[0].group_text_ug, g.text_ug);

    // The reference scanner's verses (the notebook): one per group too.
    const snips = database.quranContentSnippet(word, 20, 90).filter(function (s) { return s.sura === 37 && s.aya >= g.ug_from && s.aya <= g.ug_to; });
    assert.equal(snips.length, 1, 'the reference scanner listed the group ' + snips.length + ' times');
    database.close();
  });

  suite.test('quran-seed-writes-groups', async function () {
    const database = await fresh(ctx, 'quran-groups-seed');
    const seed = require(path.join(ctx.root, 'scripts', 'seed-quran.js'));
    await seed.seedQuran(ctx.root, database);
    const db = raw(ctx, 'quran-groups-seed');
    const rows = db.prepare('SELECT sura, aya, text_ug, ug_from, ug_to FROM quran_ayas').all();
    db.close();
    assert.equal(rows.length, 6236);
    assert.equal(rows.filter(function (row) { return markersOf(row.text_ug).length; }).length, 0, 'the seed left markers');
    assert.equal(rows.filter(function (row) { return row.ug_to > row.ug_from; }).length, 430, 'the seed did not write the groups');
    assert.equal(verse(rows, 1, 4).text_ug, 'قىيامەت كۈنىنىڭ ئىگىسىدۇر.');
    database.close();
  });
};
