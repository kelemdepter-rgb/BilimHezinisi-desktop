// ============================================================================
// W6, K8 — export that keeps the note's shape.
//
// «Word» used to send editor.innerText: every heading, quote, list, font, size,
// colour, alignment and the Uthmani face of a verse was lost. The renderer now
// reads the note into a plain document model (src/notes-export.js) that the
// main process turns into Word, and into Markdown and text right here. These
// tests pin the model; tests/main/note-export.js opens the Word file itself.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  /** Every paragraph of the model, tables' cells included, in order. */
  function paragraphs(blocks, out) {
    out = out || [];
    for (const b of blocks) {
      if (b.type === 'paragraph') out.push(b);
      else if (b.type === 'table') b.rows.forEach(function (row) {
        row.forEach(function (cell) { paragraphs(cell.blocks, out); });
      });
    }
    return out;
  }
  function textOf(p) {
    return p.runs.map(function (r) { return r.text || (r.br ? '\n' : '') || (r.footnote ? '[' + r.footnote + ']' : ''); }).join('');
  }
  function runWith(model, text) {
    for (const p of paragraphs(model.blocks)) {
      for (const r of p.runs) if (r.text && r.text.indexOf(text) !== -1) return r;
    }
    return null;
  }
  function paragraphWith(model, text) {
    return paragraphs(model.blocks).filter(function (p) { return textOf(p).indexOf(text) !== -1; })[0] || null;
  }

  const NOTE =
    '<h2>ماۋزۇ</h2>' +
    '<p style="text-align: center; line-height: 1.5; text-indent: 1cm">ئوتتۇرىدا <b>توم</b> <i>يانتۇ</i> <u>سىزىق</u> ' +
      '<strike>ئۆچۈرۈلگەن</strike> <font face="UKIJ Tuz Tom" size="5" color="#aa0000">چوڭ</font> ' +
      '<span style="background-color: rgb(255, 238, 0)">بەلگە</span> <a href="https://example.com/a">ئۇلىنىش</a></p>' +
    '<p style="text-align: right">بىرىنچى قۇر<br>ئىككىنچى قۇر</p>' +
    '<p><br></p>' +
    '<blockquote>نەقىل سۆزى</blockquote>' +
    '<ul><li>نۇقتا<ul><li>ئىچكى نۇقتا</li></ul></li></ul>' +
    '<ol><li>بىرىنچى نومۇر</li><li>ئىككىنچى نومۇر</li></ol>' +
    '<p>ئارىلىق</p>' +
    '<ol><li>يېڭى تىزىملىك</li></ol>' +
    '<table><tr><th colspan="2">جەدۋەل بېشى</th></tr><tr><td>بىر</td><td>ئىككى</td></tr></table>' +
    '<p dir="rtl"><span style="font-family:\'UthmanicHafs\',serif;font-size:18pt">ئايەت تېكىستى</span></p>';

  test('export-model-structure', async function (t) {
    t.assert.ok(window.NoteExport && typeof window.NoteExport.buildModel === 'function', 'src/notes-export.js is not loaded');
    const m = window.NoteExport.buildModel(NOTE, { title: 'سىناق' });

    t.assert.equal(m.title, 'سىناق');
    const heading = paragraphWith(m, 'ماۋزۇ');
    t.assert.equal(heading.heading, 2, 'the heading lost its level');

    const styled = paragraphWith(m, 'ئوتتۇرىدا');
    t.assert.equal(styled.align, 'center', 'the alignment was lost');
    t.assert.equal(styled.lineHeight, 1.5, 'the line height was lost');
    t.assert.equal(styled.firstLine, 567, 'a 1 cm first-line indent is not 567 twips');
    t.assert.ok(runWith(m, 'توم').bold, 'bold was lost');
    t.assert.ok(runWith(m, 'يانتۇ').italic, 'italic was lost');
    t.assert.ok(runWith(m, 'سىزىق').underline, 'underline was lost');
    t.assert.ok(runWith(m, 'ئۆچۈرۈلگەن').strike, 'strike-through was lost');
    const big = runWith(m, 'چوڭ');
    t.assert.equal(big.font, 'UKIJ Tuz Tom', 'the font face was lost');
    t.assert.equal(big.size, 36, 'size level 5 (24 px) is not 36 half-points');
    t.assert.equal(big.color, 'AA0000', 'the colour was lost');
    t.assert.equal(runWith(m, 'بەلگە').highlight, 'FFEE00', 'the highlight was lost');
    t.assert.ok(/^https:\/\/example\.com\/a/.test(runWith(m, 'ئۇلىنىش').link || ''), 'the link was lost');
    t.assert.ok(!runWith(m, 'ئوتتۇرىدا').bold, 'a plain run was written as bold');

    const lines = paragraphWith(m, 'بىرىنچى قۇر');
    t.assert.equal(lines.align, 'right', 'the right alignment was lost');
    t.assert.equal(textOf(lines), 'بىرىنچى قۇر\nئىككىنچى قۇر', 'a <br> is not a line break inside the paragraph');
    const index = m.blocks.indexOf(lines);
    t.assert.ok(m.blocks[index + 1] && m.blocks[index + 1].type === 'paragraph' && textOf(m.blocks[index + 1]) === '',
      'an empty line did not stay an empty paragraph');

    t.assert.equal(paragraphWith(m, 'نەقىل سۆزى').quote, 1, 'the quote was lost');

    const bullet = paragraphWith(m, 'نۇقتا');
    const inner = paragraphWith(m, 'ئىچكى نۇقتا');
    t.assert.equal(bullet.list.kind, 'bullet');
    t.assert.equal(bullet.list.level, 0);
    t.assert.equal(inner.list.level, 1, 'the nested item is not one level deeper');

    const one = paragraphWith(m, 'بىرىنچى نومۇر');
    const two = paragraphWith(m, 'ئىككىنچى نومۇر');
    const fresh = paragraphWith(m, 'يېڭى تىزىملىك');
    t.assert.equal(one.list.kind, 'number');
    t.assert.equal(one.list.id, two.list.id, 'one numbered list was split');
    t.assert.ok(fresh.list.id !== one.list.id, 'two numbered lists share one numbering — the second would count on');

    const table = m.blocks.filter(function (b) { return b.type === 'table'; })[0];
    t.assert.ok(table, 'the table was lost');
    t.assert.equal(table.rows[0][0].colSpan, 2, 'the column span was lost');
    t.assert.ok(runWith(m, 'جەدۋەل بېشى').bold, 'a header cell is not bold');
    t.assert.equal(table.rows[1].length, 2);

    const verse = runWith(m, 'ئايەت تېكىستى');
    t.assert.equal(verse.font, 'KFGQPC HafsEx1 Uthmanic Script',
      'the verse is not named by the family inside the bundled Uthmani font');
    t.assert.equal(verse.size, 36, '18 pt is not 36 half-points');
    t.assert.ok(m.verse, 'the model does not know a verse is quoted');
    t.assert.equal(m.credit.length, 2, 'the Qur\'an credit is missing');
  });

  const CITED =
    '<p>مېنىڭ سۆزۈم</p>' +
    '<blockquote class="notes-inserted-ref" data-ref-insert="1" dir="rtl"><span>كىتابتىن ئېلىنغان نەقىل</span>' +
      '<br><span style="font-size:0.85em;color:#888">— بىلىم كىتابى</span></blockquote><p><br></p>';

  test('export-model-footnotes', async function (t) {
    const off = window.NoteExport.buildModel(CITED, { title: 'ت' });
    t.assert.equal(off.footnotes.length, 0, 'footnotes were made without being asked for');
    t.assert.ok(paragraphWith(off, '— بىلىم كىتابى'), 'without footnotes the source line was lost');
    t.assert.ok(!off.verse && !off.credit, 'a note without a verse got the Qur\'an credit');
    const source = runWith(off, '— بىلىم');
    t.assert.ok(source.size && source.size < off.defaults.size,
      'the source line (0.85em) is not smaller than the note\'s text');

    const on = window.NoteExport.buildModel(CITED, { title: 'ت', footnotes: true });
    t.assert.deepEqual(on.footnotes, [{ label: 'بىلىم كىتابى', url: null }], 'the citation did not become a footnote');
    t.assert.ok(!paragraphWith(on, 'بىلىم كىتابى'), 'the source line stayed in the text');
    const quote = paragraphWith(on, 'كىتابتىن ئېلىنغان نەقىل');
    t.assert.equal(quote.runs[quote.runs.length - 1].footnote, 1, 'the footnote mark is not at the end of the quotation');
    t.assert.equal(textOf(quote), 'كىتابتىن ئېلىنغان نەقىل[1]', 'the line break before the source line was left behind');
  });

  test('export-text-and-markdown', async function (t) {
    const model = window.NoteExport.buildModel(NOTE + CITED, { title: 'سىناق', footnotes: true });
    const text = window.NoteExport.toText(model);
    t.assert.ok(text.indexOf('\n') === -1 || text.indexOf('\r\n') !== -1, 'the text is not CRLF');
    t.assert.excludes(text.replace(/\r\n/g, ''), '\n', 'a bare LF is left in the text');
    t.assert.includes(text, 'بىرىنچى قۇر\r\nئىككىنچى قۇر', 'a <br> did not end the line');
    t.assert.includes(text, 'ماۋزۇ\r\n\r\nئوتتۇرىدا', 'there is no blank line between paragraphs');
    t.assert.includes(text, '1. بىرىنچى نومۇر', 'a numbered item has no number');
    t.assert.includes(text, '1. يېڭى تىزىملىك', 'the second list did not count from 1');
    t.assert.includes(text, 'كىتابتىن ئېلىنغان نەقىل[1]', 'the footnote mark is missing');
    t.assert.includes(text, '[1] بىلىم كىتابى', 'the footnote is missing');
    t.assert.includes(text, 'Tanzil Project', 'the Qur\'an credit is missing');

    const md = window.NoteExport.toMarkdown(NOTE + CITED, { title: 'سىناق', footnotes: true });
    t.assert.includes(md, '# سىناق', 'the title is missing');
    t.assert.includes(md, '## ماۋزۇ', 'the heading is not a Markdown heading');
    t.assert.includes(md, '**توم**', 'bold is not Markdown bold');
    t.assert.includes(md, '> نەقىل سۆزى', 'the quote is not a Markdown quote');
    t.assert.includes(md, '[ئۇلىنىش](https://example.com/a)', 'the link is not a Markdown link');
    t.assert.includes(md, 'كىتابتىن ئېلىنغان نەقىل[^1]', 'the footnote mark is missing');
    t.assert.includes(md, '[^1]: بىلىم كىتابى', 'the footnote is missing');
    t.assert.includes(md, 'Tanzil Project', 'the Qur\'an credit is missing');
  });

  // The notebook's «چىقىرىش ▾»: four formats through one IPC, and the
  // footnote switch remembered. The old Word export (innerText) is not used.
  test('export-menu', async function (t) {
    await t.fresh({ html: CITED.replace('<p>مېنىڭ سۆزۈم</p>', '<h2>باب</h2><p>مېنىڭ سۆزۈم</p>') });
    t.assert.ok(document.getElementById('notes-export-menu'), 'there is no «چىقىرىش» menu');
    t.assert.equal(document.querySelectorAll('#notes-export-menu [data-format]').length, 4,
      'the menu does not offer Word, PDF, Markdown and text');

    for (const format of ['docx', 'pdf', 'md', 'txt']) await window.notesExport(format);
    const calls = window.FAKE.noteExports;
    t.assert.deepEqual(calls.map(function (c) { return c.format; }), ['docx', 'pdf', 'md', 'txt'],
      'not every format reached the main process');
    t.assert.equal(window.FAKE.exports.length, 0, 'the old text-only Word export was used');

    t.assert.equal(calls[0].payload.model.blocks[0].heading, 2, 'Word was not sent the document model');
    t.assert.equal(calls[0].payload.title, 'سىناق', 'the title was not sent');
    t.assert.includes(calls[1].payload.html, '<h2>', 'the PDF was not sent the note\'s HTML');
    t.assert.includes(calls[2].payload.text, '## باب', 'the Markdown was not made');
    t.assert.includes(calls[3].payload.text, 'باب\r\n', 'the text was not made');
    t.assert.includes(calls[3].payload.text, '— بىلىم كىتابى', 'with the switch off, the source line was not kept');

    // The switch, remembered, and used.
    const box = document.getElementById('notes-export-footnotes');
    t.assert.ok(box, 'there is no footnote switch');
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await t.sleep(20);
    t.assert.equal(window.FAKE.settings.notes_export_footnotes, 'on', 'the footnote switch is not remembered');
    await window.notesExport('docx');
    const last = window.FAKE.noteExports[window.FAKE.noteExports.length - 1];
    t.assert.deepEqual(last.payload.model.footnotes.map(function (f) { return f.label; }), ['بىلىم كىتابى'],
      'with the switch on, the citation did not become a footnote');
  });
})();
