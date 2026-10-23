// ============================================================================
// W6, K8 — the files themselves.
//
// note-export.js turns the renderer's document model into a Word file and the
// note's HTML into a PDF. The Word file is opened here with the jszip that docx
// already depends on (no new dependency) and its XML read: right-to-left
// paragraphs and runs, logical alignment, the fonts by the names inside their
// files, each numbered list on its own numbering, footnotes, the credit.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

const CREDIT = [
  'ئەرەبچە ئەسلى تېكىست: Tanzil Project (CC BY 3.0) — تېكىست ھېچ ئۆزگەرتىلمىگەن',
  'ئۇيغۇرچە تەرجىمە: شەيخ مۇھەممەد سالىھ — QuranEnc.com نەشرى، نەشر نومۇرى v1.0.2-xml.1'
];

function cell(text, extra) {
  return Object.assign({ colSpan: 1, rowSpan: 1, blocks: [{ type: 'paragraph', runs: [{ text: text }] }] }, extra || {});
}

const MODEL = {
  title: 'سىناق خاتىرە',
  defaults: { font: 'UKIJ Ekran', size: 23, lineHeight: 2 },
  verse: true,
  credit: CREDIT,
  footnotes: [{ label: 'بىلىم كىتابى', url: null }],
  blocks: [
    { type: 'paragraph', heading: 2, runs: [{ text: 'باب ماۋزۇسى' }] },
    { type: 'paragraph', align: 'right', runs: [{ text: 'ئوڭغا تىزىلغان' }] },
    { type: 'paragraph', align: 'center', runs: [{ text: 'ئوتتۇرىدا', bold: true }] },
    { type: 'paragraph', align: 'left', lineHeight: 1.5, firstLine: 567, runs: [{ text: 'سولغا تىزىلغان' }] },
    { type: 'paragraph', runs: [{ text: 'ئايەت', font: 'KFGQPC HafsEx1 Uthmanic Script', size: 36 }] },
    { type: 'paragraph', list: { id: 'number-1', kind: 'number', level: 0 }, numbered: true, runs: [{ text: 'بىرىنچى تىزىملىك' }] },
    { type: 'paragraph', list: { id: 'number-2', kind: 'number', level: 0 }, numbered: true, runs: [{ text: 'ئىككىنچى تىزىملىك' }] },
    { type: 'paragraph', list: { id: 'bullet', kind: 'bullet', level: 1 }, numbered: true, runs: [{ text: 'نۇقتا' }] },
    { type: 'paragraph', quote: 1, runs: [{ text: 'نەقىل' }, { br: true }, { text: 'ئىككىنچى قۇر' }, { footnote: 1 }] },
    { type: 'paragraph', runs: [{ text: 'رەڭلىك', color: 'AA0000', highlight: 'FFEE00', italic: true, underline: true, strike: true }] },
    { type: 'paragraph', runs: [{ text: 'ئۇلىنىش', link: 'https://example.com/a' }] },
    { type: 'paragraph', runs: [] },
    { type: 'table', rows: [[cell('باش', { colSpan: 2 })], [cell('بىر'), cell('ئىككى')]] }
  ]
};

/** Every <w:p> of a part, as XML strings. */
function paragraphsOf(xml) {
  return xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) || [];
}
function paragraphWith(xml, text) {
  return paragraphsOf(xml).filter(function (p) { return p.indexOf(text) !== -1; })[0] || '';
}

module.exports = function (suite, assert, ctx) {
  const exporter = function () { return require(path.join(ctx.root, 'note-export.js')); };

  suite.test('docx-writer', async function () {
    const JSZip = require('jszip');
    const buffer = await exporter().buildDocx(MODEL);
    assert.ok(Buffer.isBuffer(buffer) && buffer.length > 1000, 'no Word file came out');
    const zip = await JSZip.loadAsync(buffer);
    const doc = await zip.file('word/document.xml').async('string');
    const styles = await zip.file('word/styles.xml').async('string');
    const numbering = await zip.file('word/numbering.xml').async('string');
    const footnotes = await zip.file('word/footnotes.xml').async('string');

    // Right to left, paragraphs and runs.
    assert.includes(paragraphWith(doc, 'ئوڭغا تىزىلغان'), '<w:bidi/>', 'a paragraph is not right-to-left');
    assert.includes(paragraphWith(doc, 'ئوڭغا تىزىلغان'), '<w:rtl/>', 'a run is not right-to-left');

    // Alignment is LOGICAL in a right-to-left paragraph (ECMA-376 1st edition,
    // as the web edition found and LibreOffice reads it): right = start = left.
    assert.includes(paragraphWith(doc, 'ئوڭغا تىزىلغان'), '<w:jc w:val="left"/>', 'right was not written as the start');
    assert.includes(paragraphWith(doc, 'سولغا تىزىلغان'), '<w:jc w:val="right"/>', 'left was not written as the end');
    assert.includes(paragraphWith(doc, 'ئوتتۇرىدا'), '<w:jc w:val="center"/>', 'centre was lost');

    // Paragraph metrics.
    const left = paragraphWith(doc, 'سولغا تىزىلغان');
    assert.ok(/<w:ind [^>]*w:firstLine="567"/.test(left), 'the first-line indent was lost');
    assert.ok(/<w:spacing [^>]*w:line="345"/.test(left), 'the line height (1.5 × 23 half-points) was lost');

    // Heading.
    assert.includes(paragraphWith(doc, 'باب ماۋزۇسى'), 'w:val="Heading2"', 'the heading lost its level');

    // Fonts by the name inside their files, for complex script too; the note's
    // default face and size as the document's defaults.
    const verse = paragraphWith(doc, 'ئايەت');
    assert.ok(/<w:rFonts [^>]*w:cs="KFGQPC HafsEx1 Uthmanic Script"/.test(verse), 'the verse face is not set for complex script');
    assert.ok(/<w:szCs w:val="36"\/>/.test(verse), 'the verse size is not set for complex script');
    assert.ok(/<w:rFonts [^>]*w:cs="UKIJ Ekran"/.test(styles), 'the note\'s face is not the document default');
    assert.ok(/<w:szCs w:val="23"\/>/.test(styles), 'the note\'s size is not the document default');

    // Only what is ON is written to a run.
    const plain = paragraphWith(doc, 'ئوڭغا تىزىلغان');
    assert.excludes(plain, '<w:b ', 'a plain run carries a bold setting');
    assert.excludes(plain, '<w:b/>', 'a plain run is bold');
    assert.includes(paragraphWith(doc, 'ئوتتۇرىدا'), '<w:b/>', 'bold was lost');
    const colour = paragraphWith(doc, 'رەڭلىك');
    ['<w:i/>', '<w:strike/>', 'w:color w:val="AA0000"', 'w:fill="FFEE00"', '<w:u '].forEach(function (part) {
      assert.includes(colour, part, 'a run lost ' + part);
    });

    // Each numbered list on its own numbering, so the second counts from 1.
    const numId = function (text) {
      const m = /<w:numId w:val="(\d+)"\/>/.exec(paragraphWith(doc, text));
      return m ? m[1] : null;
    };
    assert.ok(numId('بىرىنچى تىزىملىك') && numId('ئىككىنچى تىزىملىك'), 'a list item is not numbered');
    assert.ok(numId('بىرىنچى تىزىملىك') !== numId('ئىككىنچى تىزىملىك'), 'two numbered lists share one numbering');
    assert.includes(paragraphWith(doc, 'نۇقتا'), '<w:ilvl w:val="1"/>', 'the nested item lost its depth');
    assert.includes(numbering, 'w:val="decimal"', 'there is no decimal numbering');
    assert.includes(numbering, 'w:val="bullet"', 'there is no bullet numbering');

    // A line break, a footnote, a link, an empty paragraph.
    const quote = paragraphWith(doc, 'نەقىل');
    assert.includes(quote, '<w:br/>', 'the line break was lost');
    assert.includes(quote, 'w:footnoteReference', 'the footnote mark was lost');
    assert.includes(footnotes, 'بىلىم كىتابى', 'the footnote text is missing');
    assert.includes(doc, 'w:hyperlink', 'the link was lost');

    // A right-to-left table, spans kept.
    assert.includes(doc, '<w:bidiVisual/>', 'the table is not right-to-left');
    assert.includes(doc, '<w:gridSpan w:val="2"/>', 'the column span was lost');

    // The credit, once, at the end.
    CREDIT.forEach(function (line) {
      assert.includes(doc, line, 'the Qur\'an credit is missing');
    });
    assert.ok(doc.lastIndexOf(CREDIT[0]) > doc.lastIndexOf('ئىككى'), 'the credit is not at the end');

    // The title is the first paragraph.
    assert.includes(paragraphsOf(doc)[0], 'سىناق خاتىرە', 'the title is not the first paragraph');
  });

  // The PDF is printed by Chromium from the note's HTML with the app's own
  // @font-face rules — the check is that the Uyghur and the Uthmani faces were
  // really embedded, not a fallback.
  suite.test('pdf-writer', async function () {
    const buffer = await exporter().renderPdf({
      title: 'سىناق',
      html: '<p>ئۇيغۇرچە تېكىست بىلىم خەزىنىسى</p>' +
            '<p dir="rtl"><span style="font-family:\'UthmanicHafs\',serif;font-size:18pt">بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ</span></p>',
      credit: CREDIT
    });
    assert.ok(Buffer.isBuffer(buffer) && buffer.slice(0, 5).toString('latin1') === '%PDF-', 'no PDF came out');
    const raw = buffer.toString('latin1');
    assert.ok(/UKIJ/.test(raw), 'the UKIJ face was not embedded in the PDF');
    assert.ok(/HafsEx1|Uthmanic/i.test(raw), 'the Uthmani face was not embedded in the PDF');
  });

  // The credit is required by the licences of the bundled texts, and the sura
  // footer (src/quran.js) is where its wording lives. The export repeats it; this
  // keeps the two word for word.
  suite.test('export-credit-matches-footer', function () {
    const quran = fs.readFileSync(path.join(ctx.root, 'src', 'quran.js'), 'utf8');
    const block = quran.slice(quran.indexOf('class="quran-source-note"'));
    const lines = (block.slice(0, block.indexOf('</div>`')).match(/<div>([\s\S]*?)<\/div>/g) || [])
      .map(function (div) { return div.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); });
    assert.equal(lines.length, 2, 'the sura footer was not found');
    const source = fs.readFileSync(path.join(ctx.root, 'src', 'notes-export.js'), 'utf8');
    lines.forEach(function (line) {
      assert.includes(source, line, 'the export\'s Qur\'an credit differs from the sura footer');
    });
  });
};
