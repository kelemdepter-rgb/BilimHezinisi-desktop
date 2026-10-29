// ============================================================================
// A text PDF made by hand, for the tests: one page per string, each set in
// Helvetica. Bytes «A».. «Z» of the second font map to Arabic presentation
// forms through a ToUnicode CMap, so a test can put glyph codepoints in a
// page's text layer: the way some real PDFs reach the importer.
//
// Loaded as a <script> by the notebook test page (window.MakePdf) and
// required by the main-process tests and probes.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MakePdf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // «A» → ﻻ (lam-alef, folds to two letters), «B» → ﺑ, «C» → ﺎ, «D» → ﻟ.
  const FORMS = { A: 0xFEFB, B: 0xFE91, C: 0xFE8E, D: 0xFEDF };

  function pdfString(s) {
    return '(' + String(s).replace(/[\\()]/g, function (c) { return '\\' + c; }) + ')';
  }

  /**
   * @param {Array<string|{latin: string, forms: string}>} pages one entry per
   *   page: Latin text, or { latin, forms } where `forms` uses the letters A–D
   * @returns {Uint8Array}
   */
  function make(pages) {
    const objects = [];          // index = object number - 1
    function add(body) { objects.push(body); return objects.length; }

    const catalog = add(null);
    const pagesObj = add(null);
    const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    let cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
      '/CMapName /Forms def\n/CMapType 2 def\n1 begincodespacerange\n<00> <FF>\nendcodespacerange\n' +
      Object.keys(FORMS).length + ' beginbfchar\n';
    Object.keys(FORMS).forEach(function (k) {
      cmap += '<' + k.charCodeAt(0).toString(16).toUpperCase() + '> <' + FORMS[k].toString(16).toUpperCase() + '>\n';
    });
    cmap += 'endbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    const toUnicode = add('<< /Length ' + cmap.length + ' >>\nstream\n' + cmap + '\nendstream');
    const formsFont = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode ' + toUnicode + ' 0 R >>');

    // Lines of at most 90 characters, broken at spaces: pdf.js leaves out
    // text set beyond the page's edge, as a real PDF never has it.
    function lines(text) {
      const out = [];
      let line = '';
      String(text).split(' ').forEach(function (word) {
        if (line && (line + ' ' + word).length > 90) { out.push(line); line = word; }
        else line = line ? line + ' ' + word : word;
      });
      if (line) out.push(line);
      return out;
    }

    const kids = [];
    pages.forEach(function (p) {
      const latin = typeof p === 'string' ? p : p.latin;
      const forms = typeof p === 'string' ? '' : p.forms;
      let ops = 'BT /F1 10 Tf 12 TL 40 800 Td ' + lines(latin).map(pdfString).join(' Tj T* ') + ' Tj ET';
      if (forms) ops += '\nBT /F2 12 Tf 40 60 Td ' + pdfString(forms) + ' Tj ET';
      const content = add('<< /Length ' + ops.length + ' >>\nstream\n' + ops + '\nendstream');
      kids.push(add('<< /Type /Page /Parent ' + pagesObj + ' 0 R /MediaBox [0 0 595 842] ' +
        '/Resources << /Font << /F1 ' + font + ' 0 R /F2 ' + formsFont + ' 0 R >> >> /Contents ' + content + ' 0 R >>'));
    });
    objects[catalog - 1] = '<< /Type /Catalog /Pages ' + pagesObj + ' 0 R >>';
    objects[pagesObj - 1] = '<< /Type /Pages /Kids [' + kids.map(function (k) { return k + ' 0 R'; }).join(' ') + '] /Count ' + kids.length + ' >>';

    // Every byte here is ASCII, so string length is byte length.
    let out = '%PDF-1.4\n';
    const offsets = [];
    objects.forEach(function (body, i) {
      offsets.push(out.length);
      out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
    });
    const xref = out.length;
    out += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
    offsets.forEach(function (o) { out += String(o).padStart(10, '0') + ' 00000 n \n'; });
    out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root ' + catalog + ' 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';

    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i);
    return bytes;
  }

  return { make: make, FORMS: FORMS };
});
