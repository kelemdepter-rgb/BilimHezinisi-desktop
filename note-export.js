// ============================================================================
// Exporting a note (W6, K8) — the main process's half.
//
// The renderer reads the note into a plain document model (src/notes-export.js);
// this builds the Word file from it with the docx library that was already
// here, and prints the PDF from the note's HTML in a hidden window. Kept out of
// main.js so tests/main/note-export.js can open what comes out.
//
// The Word rules are the web edition's lib/notes/export-docx.ts (PROMPT-50):
//
//   - every paragraph and every run is right-to-left;
//   - ALIGNMENT IS LOGICAL in a right-to-left paragraph. In the values every
//     Word reads (ECMA-376 1st edition) `left` is the paragraph's START — its
//     right side — and `right` its end; LibreOffice reads them the same way.
//     So CSS right/start → left, left/end → right, centre, justify → both;
//   - only what is ON is written to a run: an explicit «not bold» would undo a
//     heading's bold;
//   - fonts are NAMED, never embedded — the licences and the file size both
//     say no — by the family name inside the font file, for complex script as
//     well (w:cs), which is the font Word uses for Arabic script;
//   - the notebook's face, size and line height are the document's defaults;
//   - each numbered list has its own numbering definition, so the second
//     counts from 1;
//   - tables are right-to-left, spans kept;
//   - citations become footnotes when asked; the Qur'an credit closes a note
//     that quotes a verse.
// ============================================================================

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

/** A4 with one-inch margins: the width text may use, in twips. */
const TEXT_WIDTH = 11906 - 2 * 1440;
/** How far each list level and each quote steps in from the start side. */
const STEP = 720;
const HANGING = 360;
/** The ink headings are drawn in (the paper theme's --text). */
const INK = '2A2012';

function D() { return require('docx'); }

function alignmentOf(css) {
  const A = D().AlignmentType;
  return ({
    right: A.LEFT, start: A.LEFT,
    left: A.RIGHT, end: A.RIGHT,
    center: A.CENTER,
    justify: A.JUSTIFIED
  })[css];
}

function fontsOf(name) {
  return { ascii: name, hAnsi: name, cs: name, eastAsia: name };
}

/** One run. Only what is ON. */
function textRun(run) {
  const d = D();
  const options = { text: run.text, rightToLeft: true };
  if (run.bold) { options.bold = true; options.boldComplexScript = true; }
  if (run.italic) { options.italics = true; options.italicsComplexScript = true; }
  // docx wants an options object for underline; empty means single, automatic colour.
  if (run.underline) options.underline = {};
  if (run.strike) options.strike = true;
  if (run.sub) options.subScript = true;
  if (run.sup) options.superScript = true;
  if (run.color) options.color = run.color;
  if (run.font) options.font = fontsOf(run.font);
  if (run.size) { options.size = run.size; options.sizeComplexScript = run.size; }
  if (run.highlight) options.shading = { type: d.ShadingType.CLEAR, color: 'auto', fill: run.highlight };
  return new d.TextRun(options);
}

/** A paragraph's runs, with consecutive runs of one link kept inside one hyperlink. */
function childrenOf(runs) {
  const d = D();
  const out = [];
  let link = null;
  const close = () => {
    if (link) out.push(new d.ExternalHyperlink({ link: link.url, children: link.children }));
    link = null;
  };
  for (const run of runs || []) {
    if (run.br) { close(); out.push(new d.TextRun({ break: 1, rightToLeft: true })); }
    else if (run.footnote) { close(); out.push(new d.FootnoteReferenceRun(run.footnote)); }
    else if (run.link) {
      const r = textRun(run);
      if (link && link.url === run.link) link.children.push(r);
      else { close(); link = { url: run.link, children: [r] }; }
    } else {
      close();
      out.push(textRun(run));
    }
  }
  close();
  return out;
}

/** One numbering definition's nine levels. */
function levels(format) {
  const d = D();
  const bullets = ['●', '○', '■'];
  return Array.from({ length: 9 }, (_, level) => ({
    level: level,
    format: format,
    text: format === d.LevelFormat.BULLET ? bullets[level % bullets.length] : '%' + (level + 1) + '.',
    // The number at the start side, as `left` means in a right-to-left paragraph.
    alignment: d.AlignmentType.LEFT,
    start: 1,
    style: { paragraph: { indent: { left: STEP * (level + 1), hanging: HANGING } } }
  }));
}

class DocxWriter {
  constructor(model) {
    this.model = model;
    this.body = (model.defaults && model.defaults.size) || 23;
    this.numbering = [];
    this.references = new Set();
  }

  /** The numbering reference for a list id, made the first time it is met. */
  reference(list) {
    const d = D();
    const reference = 'ug-' + list.id;
    if (!this.references.has(reference)) {
      this.references.add(reference);
      this.numbering.push({
        reference: reference,
        levels: levels(list.kind === 'number' ? d.LevelFormat.DECIMAL : d.LevelFormat.BULLET)
      });
    }
    return reference;
  }

  blocks(blocks) {
    const out = [];
    for (const b of blocks || []) {
      if (b.type === 'paragraph') out.push(this.paragraph(b));
      else if (b.type === 'table') out.push(this.table(b));
      else if (b.type === 'rule') out.push(this.rule());
    }
    return out;
  }

  rule() {
    const d = D();
    return new d.Paragraph({
      bidirectional: true,
      border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'auto', space: 1 } },
      children: []
    });
  }

  paragraph(b) {
    const d = D();
    const options = { bidirectional: true, children: childrenOf(b.runs) };
    if (b.heading) options.heading = d.HeadingLevel['HEADING_' + Math.min(Math.max(b.heading, 1), 6)];
    const alignment = b.align ? alignmentOf(b.align) : undefined;
    if (alignment) options.alignment = alignment;

    const numbered = !!(b.list && b.numbered);
    if (numbered) options.numbering = { reference: this.reference(b.list), level: Math.min(b.list.level || 0, 8) };

    let start = (b.quote || 0) * STEP;
    if (b.list) start += STEP * ((b.list.level || 0) + 1);
    if (start > 0 && (!numbered || b.quote)) {
      options.indent = numbered ? { left: start, hanging: HANGING } : { left: start };
    }
    if (b.firstLine && !(options.indent && options.indent.hanging)) {
      options.indent = Object.assign({}, options.indent || {}, { firstLine: b.firstLine });
    }

    const spacing = {};
    // CSS line-height is a line box of size × height; «at least» that never
    // clips a larger run, where Word's «multiple» would scale the font's own
    // taller line gap.
    if (b.lineHeight) { spacing.line = Math.round(this.body * b.lineHeight * 10); spacing.lineRule = d.LineRuleType.AT_LEAST; }
    // `.notes-editor p { margin: 0 0 0.6em }`, in twips.
    if (b.spaced) spacing.after = Math.round(this.body * 0.6 * 10);
    if (Object.keys(spacing).length) options.spacing = spacing;
    return new d.Paragraph(options);
  }

  /**
   * A right-to-left Word table. Cells are written like the note itself; spans
   * survive as gridSpan and vMerge, and short rows are filled out to the grid.
   */
  table(t) {
    const d = D();
    const rows = (t.rows || []).filter(r => r.length);
    const carried = [];
    const covered = [];
    rows.forEach((row, index) => {
      const below = rows.length - index;
      let column = 0;
      for (const cell of row) {
        while ((carried[column] || 0) > 0) column++;
        const span = Math.min(Math.max(cell.colSpan || 1, 1), 63);
        const down = Math.min(Math.max(cell.rowSpan || 1, 1), below);
        for (let k = 0; k < span; k++) carried[column + k] = down;
        column += span;
      }
      covered.push(carried.filter(left => left > 0).length);
      for (let k = 0; k < carried.length; k++) if ((carried[k] || 0) > 0) carried[k] -= 1;
    });
    const width = Math.max(1, ...covered);
    const columnWidth = Math.floor(TEXT_WIDTH / width);

    const tableRows = rows.map((row, index) => {
      const below = rows.length - index;
      const cells = row.map(cell => {
        const span = Math.min(Math.max(cell.colSpan || 1, 1), 63);
        const down = Math.min(Math.max(cell.rowSpan || 1, 1), below);
        const children = this.blocks(cell.blocks);
        const options = {
          children: children.length ? children : [new d.Paragraph({ bidirectional: true, children: [] })],
          width: { size: columnWidth * span, type: d.WidthType.DXA }
        };
        if (span > 1) options.columnSpan = span;
        if (down > 1) options.rowSpan = down;
        return new d.TableCell(options);
      });
      for (let k = covered[index]; k < width; k++) {
        cells.push(new d.TableCell({
          children: [new d.Paragraph({ bidirectional: true, children: [] })],
          width: { size: columnWidth, type: d.WidthType.DXA }
        }));
      }
      return new d.TableRow({ children: cells });
    });

    return new d.Table({
      rows: tableRows,
      visuallyRightToLeft: true,
      width: { size: columnWidth * width, type: d.WidthType.DXA },
      columnWidths: Array.from({ length: width }, () => columnWidth)
    });
  }
}

/**
 * The document model → .docx bytes.
 * @returns {Promise<Buffer>}
 */
async function buildDocx(model) {
  const d = D();
  if (!model || !Array.isArray(model.blocks)) throw new Error('not a note model');
  const writer = new DocxWriter(model);
  const defaults = model.defaults || {};
  const face = defaults.font || 'UKIJ Ekran';
  const body = writer.body;
  const scaled = em => Math.round(body * em);
  const twips = em => Math.round(body * em * 10);

  const children = [
    new d.Paragraph({
      bidirectional: true,
      heading: d.HeadingLevel.TITLE,
      children: [new d.TextRun({ text: String(model.title || 'خاتىرە'), rightToLeft: true })]
    })
  ];
  for (const block of writer.blocks(model.blocks)) children.push(block);
  // An empty note still has to be a file Word opens with a body.
  if (children.length === 1) children.push(new d.Paragraph({ bidirectional: true, children: [] }));

  // The credit the Qur'an's sources require: once, at the end, and only when
  // a verse is actually in the note.
  if (Array.isArray(model.credit) && model.credit.length) {
    children.push(new d.Paragraph({ bidirectional: true, children: [] }));
    for (const line of model.credit) {
      children.push(new d.Paragraph({
        bidirectional: true,
        children: [new d.TextRun({ text: line, rightToLeft: true, size: scaled(0.72), sizeComplexScript: scaled(0.72) })]
      }));
    }
  }

  const footnotes = {};
  (model.footnotes || []).forEach((f, i) => {
    const runs = [new d.TextRun({ text: f.label, rightToLeft: true })];
    if (f.url) {
      runs.push(new d.TextRun({ text: ' — ', rightToLeft: true }));
      runs.push(new d.ExternalHyperlink({ link: f.url, children: [new d.TextRun({ text: f.url, style: 'Hyperlink' })] }));
    }
    footnotes[i + 1] = { children: [new d.Paragraph({ bidirectional: true, children: runs })] };
  });

  const heading = em => ({
    run: { size: scaled(em), sizeComplexScript: scaled(em), bold: true, boldComplexScript: true, color: INK },
    paragraph: { spacing: { before: twips(1.2), after: twips(0.5) } }
  });

  const document = new d.Document({
    styles: {
      default: {
        document: {
          run: { font: fontsOf(face), size: body, sizeComplexScript: body },
          paragraph: { spacing: { line: twips(defaults.lineHeight || 2), lineRule: d.LineRuleType.AT_LEAST } }
        },
        title: {
          run: { font: fontsOf(face), size: scaled(1.75), sizeComplexScript: scaled(1.75), bold: true, boldComplexScript: true, color: INK },
          paragraph: { spacing: { after: twips(0.85) } }
        },
        // The browser's heading sizes in the notebook, none smaller than the text.
        heading1: heading(2),
        heading2: heading(1.5),
        heading3: heading(1.17),
        heading4: heading(1),
        heading5: heading(1),
        heading6: heading(1),
        footnoteText: { run: { size: scaled(0.8), sizeComplexScript: scaled(0.8) } }
      }
    },
    numbering: { config: writer.numbering },
    footnotes: footnotes,
    sections: [{ properties: {}, children: children }]
  });

  return d.Packer.toBuffer(document);
}

// ===================================================================== PDF

/** The app's faces, from the files that ship — the same set src/index.html declares. */
const FONT_FACES = [
  ['UKIJ Ekran', 'assets/ukijekran.ttf', 'normal'],
  ['UthmanicHafs', 'assets/fonts/UthmanicHafs1.otf', 'normal'],
  ['UthmanicHafs', 'assets/fonts/UthmanicHafs1B.otf', 'bold'],
  ['UKIJ Esliye', 'assets/fonts/UKIJEsliye.ttf', 'normal'],
  ['UKIJ Esliye', 'assets/fonts/UKIJEsliyeBold.ttf', 'bold'],
  ['UKIJ Tuz', 'assets/fonts/UKIJTuz.ttf', 'normal'],
  ['UKIJ Tuz', 'assets/fonts/UKIJTuzBold.ttf', 'bold'],
  ['UKIJ Tuz Kitab', 'assets/fonts/UKIJTuzKitab.ttf', 'normal'],
  ['UKIJ Tuz Kitab', 'assets/fonts/UKIJTuzKitabBold.ttf', 'bold'],
  ['UKIJ Tuz Tom', 'assets/fonts/UKIJTuzTom.ttf', 'normal']
];

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * The page the PDF is printed from. Its CSP lets nothing load but the app's
 * own font files and lets no script run; the note's HTML was sanitized by the
 * renderer before it came here.
 */
function pdfDocument(job) {
  const faces = FONT_FACES.map(([family, file, weight]) =>
    "@font-face{font-family:'" + family + "';src:url('" + pathToFileURL(path.join(__dirname, file)).href +
    "');font-weight:" + weight + ';font-display:block;}').join('\n');
  const credit = Array.isArray(job.credit) && job.credit.length
    ? '<div class="bh-credit">' + job.credit.map(line => '<div>' + escHtml(line) + '</div>').join('') + '</div>'
    : '';
  return '<!DOCTYPE html><html lang="ug" dir="rtl"><head><meta charset="UTF-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; font-src file:">' +
    '<style>' + faces + '\n' +
    // The page margins are printToPDF's; an @page margin here would override them.
    '@page { size: A4; }' +
    'body { margin: 0; font-family: \'UKIJ Ekran\', serif; font-size: 15.5px; line-height: 2; color: #1A1208;' +
    ' direction: rtl; text-align: right; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
    'h1.bh-title { font-size: 26px; text-align: center; margin: 0 0 18px; line-height: 1.5; }' +
    'p { margin: 0 0 0.6em 0; }' +
    'h1, h2, h3, h4, h5, h6 { line-height: 1.5; margin: 1em 0 0.4em; }' +
    'blockquote { margin: 0.8em 0; padding: 0.3em 12px; border-right: 3px solid #BA7517; background: #F4EFE6; color: #4A3F2E; }' +
    'ul, ol { padding-right: 24px; padding-left: 0; margin: 0.4em 0; }' +
    'table { border-collapse: collapse; margin: 0.6em 0; } th, td { border: 1px solid #C9BBA1; padding: 4px 8px; }' +
    'a { color: #1155CC; }' +
    '.bh-footnotes { margin-top: 2em; padding-top: 0.6em; border-top: 1px solid #C9BBA1; font-size: 12px; }' +
    '.bh-credit { margin-top: 2em; font-size: 11px; color: #555; line-height: 1.8; }' +
    '</style></head><body>' +
    '<h1 class="bh-title">' + escHtml(job.title || 'خاتىرە') + '</h1>' +
    String(job.html || '') + credit +
    '</body></html>';
}

/**
 * Print a note to PDF from a temporary HTML file, in a hidden window that is
 * destroyed however printing ends.
 * @param {{ title: string, html: string, credit?: string[] }} job
 * @returns {Promise<Buffer>}
 */
async function renderPdf(job) {
  const { BrowserWindow } = require('electron');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bilim-pdf-'));
  const file = path.join(dir, 'note.html');
  fs.writeFileSync(file, pdfDocument(job || {}), 'utf8');
  let win = null;
  try {
    win = new BrowserWindow({
      show: false,
      width: 900,
      height: 1200,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false }
    });
    // Nothing on that page may take the window anywhere.
    win.webContents.on('will-navigate', (event) => event.preventDefault());
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    await win.loadFile(file);
    // The faces must have loaded, or Chromium prints the fallback.
    try { await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)'); } catch (e) { /* print anyway */ }
    return await win.webContents.printToPDF({
      pageSize: 'A4',
      printBackground: true,
      margins: { top: 0.7, bottom: 0.7, left: 0.6, right: 0.6 }
    });
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* the temp folder */ }
  }
}

/** A file name from the note's title — what Windows allows, at most 80 characters. */
function fileNameFor(title, extension) {
  const base = String(title || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'خاتىرە';
  return base + '.' + extension;
}

module.exports = { buildDocx, renderPdf, pdfDocument, fileNameFor };
