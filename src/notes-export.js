// ============================================================================
// Exporting a note (W6, K8) — the renderer's half.
//
// «Word» used to send editor.innerText to the main process: every heading,
// quote, list, font, size, colour and alignment was lost, and a verse lost the
// Uthmani face it cannot be read without. Now the note is read into a plain
// DOCUMENT MODEL here — data only, nothing of the docx library — and the main
// process builds the Word file from it (note-export.js). Markdown and text are
// made here; the PDF is printed by the main process from the HTML this file
// prepares.
//
// The walk is the web edition's lib/notes/export-docx.ts (PROMPT-50), turned
// into data:
//
//   - every block is its own paragraph however deep it sits, words between two
//     blocks are a paragraph of their own, a <br> is a line break inside its
//     paragraph, and an empty line (<p><br></p>) stays an empty paragraph;
//   - lists: one paragraph per item at its nesting depth, bullets for <ul>,
//     numbers for <ol>, and every <ol> counting from 1 on its own numbering;
//   - tables keep their rows, cells and spans;
//   - a run carries only what is ON, and fonts are named by the family name
//     INSIDE the font file, which is the name Word looks fonts up by.
//
// The model:
//   { title, defaults: { font, size, lineHeight }, verse, credit, footnotes,
//     blocks: [ { type: 'paragraph', runs, heading?, quote?, list?, numbered?,
//                 align?, lineHeight?, firstLine?, spaced?, pre? }
//             | { type: 'table', rows: [[ { colSpan, rowSpan, blocks } ]] }
//             | { type: 'rule' } ] }
//   run: { text, bold?, italic?, underline?, strike?, sub?, sup?, font?,
//          size? (half-points), color?, highlight? (RRGGBB), link? }
//      | { br: true } | { footnote: n }
// ============================================================================

(function () {
  'use strict';

  /**
   * The credit the licences of the bundled Qur'an texts require, word for word
   * as the sura footer says it (src/quran.js). Every format ends with it when a
   * verse is quoted. tests/main/note-export.js keeps the two in step.
   */
  const QURAN_CREDIT = [
    'ئەرەبچە ئەسلى تېكىست: Tanzil Project (CC BY 3.0) — تېكىست ھېچ ئۆزگەرتىلمىگەن',
    'ئۇيغۇرچە تەرجىمە: شەيخ مۇھەممەد سالىھ — QuranEnc.com نەشرى، نەشر نومۇرى v1.0.2-xml.1'
  ];

  /**
   * CSS family names this app gives its fonts that no font file carries. Word
   * finds a face by the family name inside the file — read from the name
   * tables of assets/fonts/*: the UKIJ files carry the names the app already
   * uses, while UthmanicHafs1.otf calls itself «KFGQPC HafsEx1 Uthmanic Script»
   * (not «KFGQPC Uthmanic Script HAFS», which is what the web edition's own
   * Uthmani file says).
   */
  const FONT_FILE_NAMES = {
    'uthmanichafs': 'KFGQPC HafsEx1 Uthmanic Script',
    'uthmanic hafs': 'KFGQPC HafsEx1 Uthmanic Script'
  };
  const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']);

  /**
   * The notebook's own type (.notes-editor in notes.css): UKIJ Ekran at
   * 15.5 px — 11.625 pt, 23 half-points — with a line height of 2.
   */
  const DEFAULTS = { font: 'UKIJ Ekran', size: 23, lineHeight: 2 };

  /** The toolbar's size levels in px (measured: tests/notebook/suite-engine.js). */
  const SIZE_LEVEL_PX = [10, 13, 16, 18, 24, 32, 48];

  const VERSE_SELECTOR = '[style*="UthmanicHafs"], [style*="Uthmanic Hafs"]';
  const CITATION_SELECTOR = 'blockquote.notes-inserted-ref, blockquote[data-ref-insert="1"], a.bh-cite';
  /** Where footnote N's mark goes. No note can contain this element. */
  const FOOTNOTE_TAG = 'bh-footnote';

  const BLOCK_TAGS = (window.TextMap && window.TextMap.BLOCK_TAGS) || new Set([
    'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote', 'pre',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'
  ]);
  const ALIGNMENTS = new Set(['right', 'left', 'center', 'justify', 'start', 'end']);

  // ------------------------------------------------------------- reading HTML

  /**
   * The note as a tree to read, in a document of its own: nothing in an inert
   * document loads or runs, whatever the markup says.
   */
  function parseNote(html) {
    const doc = document.implementation.createHTMLDocument('');
    const root = doc.createElement('div');
    root.innerHTML = String(html || '');
    return root;
  }

  function isElement(node) { return node && node.nodeType === 1; }
  function isBlock(node) { return isElement(node) && BLOCK_TAGS.has(node.localName); }

  /** An inline element holding a block — <b><p>…</p></b> from a paste — is walked like a block. */
  function holdsBlock(el) {
    for (const tag of BLOCK_TAGS) if (el.getElementsByTagName(tag).length) return true;
    return false;
  }

  function lastMeaningful(parent) {
    for (let c = parent.lastChild; c; c = c.previousSibling) {
      if (c.nodeType === 1) return c;
      if (c.nodeType === 3 && (c.textContent || '').trim()) return c;
    }
    return null;
  }
  function previousMeaningful(node) {
    for (let c = node.previousSibling; c; c = c.previousSibling) {
      if (c.nodeType === 1) return c;
      if (c.nodeType === 3 && (c.textContent || '').trim()) return c;
    }
    return null;
  }

  // ----------------------------------------------------------------- values

  // A live probe, for the colour names a <font color> may carry: an inert
  // document computes no styles.
  let colourProbe = null;
  function namedColour(css) {
    try {
      if (!colourProbe) {
        colourProbe = document.createElement('span');
        colourProbe.style.display = 'none';
        document.body.appendChild(colourProbe);
      }
      colourProbe.style.color = '';
      colourProbe.style.color = css;
      return colourProbe.style.color ? window.getComputedStyle(colourProbe).color : '';
    } catch (e) { return ''; }
  }

  /** CSS colour → RRGGBB, or undefined (transparent included). */
  function toHex(css) {
    let value = String(css || '').trim();
    if (!value || value === 'transparent' || value === 'inherit' || value === 'initial') return undefined;
    if (!/^(#|rgb)/i.test(value)) value = namedColour(value);
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i.exec(value);
    if (rgb) {
      if (rgb[4] !== undefined && Number(rgb[4]) === 0) return undefined;
      return [rgb[1], rgb[2], rgb[3]].map(p => Math.min(255, Number(p)).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
    if (!hex) return undefined;
    const d = hex[1];
    return (d.length === 3 ? d.split('').map(c => c + c).join('') : d).toUpperCase();
  }

  /** The first family of a stack Word can find, named as its file names it. */
  function familyFor(stack) {
    for (const part of String(stack || '').split(',')) {
      const name = part.trim().replace(/^['"]|['"]$/g, '').trim();
      if (!name) continue;
      const lower = name.toLowerCase();
      if (FONT_FILE_NAMES[lower]) return FONT_FILE_NAMES[lower];
      if (GENERIC_FAMILIES.has(lower)) continue;
      return name;
    }
    return undefined;
  }

  /** A CSS size → half-points, relative to the size it inherits. */
  function halfPoints(css, inherited) {
    const m = /^(\d+(?:\.\d+)?)(px|pt|em|rem|%)$/i.exec(String(css || '').trim());
    if (!m) return undefined;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    let hp;
    if (unit === 'px') hp = n * 0.75 * 2;
    else if (unit === 'pt') hp = n * 2;
    else if (unit === '%') hp = (inherited || DEFAULTS.size) * n / 100;
    else hp = (unit === 'rem' ? DEFAULTS.size : (inherited || DEFAULTS.size)) * n;
    return hp > 0 ? Math.round(hp) : undefined;
  }

  /** text-indent → twips, from cm, mm, in, pt, px or em. */
  function twipsOf(css, sizeHp) {
    const m = /^(-?\d+(?:\.\d+)?)(cm|mm|in|pt|px|em)$/i.exec(String(css || '').trim());
    if (!m) return undefined;
    const n = Number(m[1]);
    const per = { cm: 567, mm: 56.7, in: 1440, pt: 20, px: 15 }[m[2].toLowerCase()];
    const twips = per ? n * per : n * (sizeHp || DEFAULTS.size) * 10;
    return twips > 0 ? Math.round(twips) : undefined;
  }

  // ------------------------------------------------------------ inline style

  const PLAIN = {};

  /** The formatting an element adds to what it inherits. */
  function inlineStyle(el, inherited) {
    const tag = el.localName;
    const st = el.style || {};
    const deco = (st.textDecorationLine || st.textDecoration || '');
    const weight = String(st.fontWeight || '');
    const own = {
      bold: inherited.bold || tag === 'b' || tag === 'strong' || tag === 'th' ||
            weight === 'bold' || weight === 'bolder' || Number(weight) >= 600,
      italic: inherited.italic || tag === 'i' || tag === 'em' || st.fontStyle === 'italic' || st.fontStyle === 'oblique',
      underline: inherited.underline || tag === 'u' || /underline/.test(deco),
      strike: inherited.strike || tag === 's' || tag === 'strike' || tag === 'del' || /line-through/.test(deco),
      sub: inherited.sub || tag === 'sub',
      sup: inherited.sup || tag === 'sup',
      color: inherited.color,
      font: inherited.font,
      size: inherited.size,
      highlight: inherited.highlight
    };
    const colour = (st.color && toHex(st.color)) || (tag === 'font' && el.getAttribute('color') && toHex(el.getAttribute('color')));
    if (colour) own.color = colour;
    const face = (st.fontFamily && familyFor(st.fontFamily)) || (tag === 'font' && el.getAttribute('face') && familyFor(el.getAttribute('face')));
    if (face) own.font = face;
    let size = st.fontSize ? halfPoints(st.fontSize, inherited.size) : undefined;
    if (!size && tag === 'font' && el.getAttribute('size')) {
      const level = parseInt(el.getAttribute('size'), 10);
      if (level >= 1 && level <= 7) size = Math.round(SIZE_LEVEL_PX[level - 1] * 1.5);
    }
    if (size) own.size = size;
    const back = st.backgroundColor && toHex(st.backgroundColor);
    if (back) own.highlight = back;
    return own;
  }

  /** A run with only what is ON in it. */
  function runOf(text, style, link) {
    const run = { text: text };
    ['bold', 'italic', 'underline', 'strike', 'sub', 'sup'].forEach(k => { if (style[k]) run[k] = true; });
    ['color', 'font', 'size', 'highlight'].forEach(k => { if (style[k]) run[k] = style[k]; });
    if (link) run.link = link;
    return run;
  }

  /** Only an http(s) address is written into a file as a link. */
  function exportUrl(href) {
    try {
      const url = new URL(String(href || ''));
      return (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname ? url.href : null;
    } catch (e) { return null; }
  }

  // -------------------------------------------------------------- citations

  /**
   * Take each citation out of the note, leave footnote N's mark where it was,
   * and return the citations in order.
   *
   * A citation is the «— source» line an inserted library passage ends with
   * (notesInsertRef in notes.js), or a citation link (a.bh-cite). The line
   * break that set the source on a line of its own goes with it, so the mark
   * ends the quotation's last line.
   */
  function takeCitations(root) {
    const found = [];
    const doc = root.ownerDocument;
    for (const el of Array.from(root.querySelectorAll(CITATION_SELECTOR))) {
      if (!root.contains(el)) continue;   // inside a citation already taken
      const line = el.localName === 'a' ? el : lastMeaningful(el);
      if (!line || line.nodeType !== 1) continue;
      const text = (line.textContent || '').replace(/\s+/g, ' ').trim();
      if (el.localName !== 'a' && !/^—/.test(text)) continue;
      found.push({
        label: text.replace(/^—\s*/, ''),
        url: el.localName === 'a' ? exportUrl(el.getAttribute('href')) : null
      });
      const mark = doc.createElement(FOOTNOTE_TAG);
      mark.setAttribute('data-n', String(found.length));
      mark.textContent = String(found.length);   // not empty: an empty element is dropped by turndown
      const before = previousMeaningful(line);
      if (before && before.nodeType === 1 && before.localName === 'br') before.remove();
      line.replaceWith(mark);
    }
    return found;
  }

  // ------------------------------------------------------------------- walk

  class Walk {
    constructor() {
      this.lists = 0;
    }

    /** The children of `parent`: blocks in turn, the words between them gathered into paragraphs. */
    blocks(parent, ctx, out) {
      let inline = [];
      const flush = () => {
        if (inline.length) this.paragraph(inline, ctx, out);
        inline = [];
      };
      for (const child of Array.from(parent.childNodes)) {
        if (isBlock(child)) {
          flush();
          this.block(child, ctx, out);
        } else if (isElement(child) && child.localName !== FOOTNOTE_TAG && holdsBlock(child)) {
          flush();
          this.blocks(child, Object.assign({}, ctx, { style: inlineStyle(child, ctx.style) }), out);
        } else {
          inline.push(child);
        }
      }
      flush();
    }

    block(el, ctx, out) {
      const tag = el.localName;
      const st = el.style || {};
      const own = Object.assign({}, ctx, { style: inlineStyle(el, ctx.style), spaced: tag === 'p' });
      const align = String(st.textAlign || el.getAttribute('align') || '').trim().toLowerCase();
      if (ALIGNMENTS.has(align)) own.align = align;
      const lh = String(st.lineHeight || '').trim();
      if (/^\d+(\.\d+)?$/.test(lh) && Number(lh) > 0) own.lineHeight = Number(lh);
      const indent = st.textIndent ? twipsOf(st.textIndent, own.style.size) : undefined;
      if (indent) own.firstLine = indent;

      if (tag === 'ul' || tag === 'ol') this.list(el, own, out);
      else if (tag === 'table') out.push(this.table(el, own));
      else if (tag === 'hr') out.push({ type: 'rule' });
      else if (tag === 'blockquote') this.blocks(el, Object.assign({}, own, { quote: ctx.quote + 1 }), out);
      else if (/^h[1-6]$/.test(tag)) this.blocks(el, Object.assign({}, own, { heading: Number(tag.slice(1)) }), out);
      else if (tag === 'pre') this.blocks(el, Object.assign({}, own, { pre: true }), out);
      else this.blocks(el, own, out);
    }

    /**
     * One list. Its items are one level deeper than the item it sits in; a list
     * met directly inside a list (what execCommand('indent') writes) deeper
     * still. Every <ol> gets its own id, so it counts from 1 whatever came
     * before: two numberings over one definition carry on each other's count
     * in Word.
     */
    list(el, ctx, out) {
      const level = ctx.item ? Math.min(ctx.item.level + 1, 8) : 0;
      const id = el.localName === 'ol' ? 'number-' + (++this.lists) : 'bullet';
      const kind = el.localName === 'ol' ? 'number' : 'bullet';
      const item = (numbered) => ({ id: id, kind: kind, level: level, numbered: numbered });
      const inner = Object.assign({}, ctx, { spaced: false, heading: undefined });
      let loose = [];
      const flush = () => {
        if (loose.length) this.paragraph(loose, Object.assign({}, inner, { item: item(true) }), out);
        loose = [];
      };
      for (const child of Array.from(el.childNodes)) {
        if (isElement(child) && child.localName === 'li') {
          flush();
          const li = Object.assign({}, inner, { style: inlineStyle(child, inner.style), item: item(false) });
          const align = String((child.style && child.style.textAlign) || '').trim().toLowerCase();
          if (ALIGNMENTS.has(align)) li.align = align;
          this.blocks(child, li, out);
        } else if (isElement(child) && (child.localName === 'ul' || child.localName === 'ol')) {
          flush();
          this.list(child, Object.assign({}, inner, { item: item(true) }), out);
        } else if (isBlock(child)) {
          flush();
          this.block(child, Object.assign({}, inner, { item: item(true) }), out);
        } else {
          loose.push(child);
        }
      }
      flush();
    }

    /** A table: rows of cells, each cell walked like the note itself. */
    table(el, ctx) {
      const rows = [];
      for (const row of Array.from(el.querySelectorAll('tr'))) {
        if (row.closest('table') !== el) continue;   // a nested table's rows are its own
        const cells = [];
        for (const cell of Array.from(row.children)) {
          if (cell.localName !== 'td' && cell.localName !== 'th') continue;
          const blocks = [];
          const cellCtx = {
            style: inlineStyle(cell, PLAIN), quote: 0, item: null, pre: false, spaced: false
          };
          const align = String((cell.style && cell.style.textAlign) || '').trim().toLowerCase();
          if (ALIGNMENTS.has(align)) cellCtx.align = align;
          this.blocks(cell, cellCtx, blocks);
          cells.push({
            colSpan: Math.min(Math.max(parseInt(cell.getAttribute('colspan'), 10) || 1, 1), 63),
            rowSpan: Math.max(parseInt(cell.getAttribute('rowspan'), 10) || 1, 1),
            blocks: blocks
          });
        }
        if (cells.length) rows.push(cells);
      }
      return { type: 'table', rows: rows };
    }

    /** Inline nodes → segments, carrying formatting and the link they sit in. */
    segments(node, style, link, pre) {
      if (node.nodeType === 3) {
        const raw = node.textContent || '';
        if (!pre) {
          const text = raw.replace(/[ \t\n\r\f]+/g, ' ');
          return text ? [{ kind: 'text', text: text, style: style, link: link }] : [];
        }
        const out = [];
        raw.split('\n').forEach((line, i) => {
          if (i > 0) out.push({ kind: 'break' });
          if (line) out.push({ kind: 'text', text: line, style: style, link: link });
        });
        return out;
      }
      if (!isElement(node)) return [];
      const tag = node.localName;
      if (tag === 'br') return [{ kind: 'break' }];
      if (tag === FOOTNOTE_TAG) return [{ kind: 'footnote', n: Number(node.getAttribute('data-n')) }];
      let own = inlineStyle(node, style);
      let url = link;
      if (tag === 'a') {
        url = exportUrl(node.getAttribute('href'));
        if (url) own = Object.assign({}, own, { underline: true, color: own.color || '1155CC' });
      }
      return Array.from(node.childNodes).reduce((all, child) => all.concat(this.segments(child, own, url, pre)), []);
    }

    /** Gathered inline nodes → one paragraph, or none when they hold nothing at all. */
    paragraph(nodes, ctx, out) {
      const raw = [];
      for (const node of nodes) {
        for (const seg of this.segments(node, ctx.style, null, ctx.pre)) {
          const prev = raw[raw.length - 1];
          // Collapse a space that ends one run and starts the next, as the browser does.
          if (seg.kind === 'text' && !ctx.pre && prev && prev.kind === 'text' &&
              /\s$/.test(prev.text) && /^\s/.test(seg.text)) {
            const text = seg.text.slice(1);
            if (text) raw.push(Object.assign({}, seg, { text: text }));
          } else {
            raw.push(seg);
          }
        }
      }
      const segs = trimSegments(raw, ctx.pre);
      // Words, or a line held open by a <br>: anything else draws nothing.
      if (!segs.length && !raw.some(s => s.kind === 'break')) return;

      const runs = [];
      for (const seg of segs) {
        if (seg.kind === 'break') runs.push({ br: true });
        else if (seg.kind === 'footnote') runs.push({ footnote: seg.n });
        else {
          const run = runOf(seg.text, seg.style, seg.link);
          const last = runs[runs.length - 1];
          if (last && last.text !== undefined && sameRunStyle(last, run)) last.text += run.text;
          else runs.push(run);
        }
      }

      const p = { type: 'paragraph', runs: runs };
      if (ctx.heading) p.heading = ctx.heading;
      if (ctx.quote) p.quote = ctx.quote;
      if (ctx.align) p.align = ctx.align;
      if (ctx.lineHeight) p.lineHeight = ctx.lineHeight;
      if (ctx.firstLine) p.firstLine = ctx.firstLine;
      if (ctx.spaced) p.spaced = true;
      if (ctx.pre) p.pre = true;
      if (ctx.item) {
        p.list = { id: ctx.item.id, kind: ctx.item.kind, level: ctx.item.level };
        // The first paragraph of an item carries its number or bullet; the rest
        // line up under its text.
        if (!ctx.item.numbered) { p.numbered = true; ctx.item.numbered = true; }
      }
      out.push(p);
    }
  }

  function sameRunStyle(a, b) {
    const keys = ['bold', 'italic', 'underline', 'strike', 'sub', 'sup', 'color', 'font', 'size', 'highlight', 'link'];
    return keys.every(k => a[k] === b[k]);
  }

  /** Drop what only holds a line open: edge whitespace, and one final <br>. */
  function trimSegments(segments, pre) {
    const out = segments.slice();
    const blank = s => s && s.kind === 'text' && !pre && !s.text.trim();
    while (blank(out[out.length - 1])) out.pop();
    if (out.length && out[out.length - 1].kind === 'break') out.pop();
    while (blank(out[out.length - 1])) out.pop();
    while (blank(out[0])) out.shift();
    if (!pre) {
      if (out[0] && out[0].kind === 'text') out[0] = Object.assign({}, out[0], { text: out[0].text.replace(/^\s+/, '') });
      const last = out[out.length - 1];
      if (last && last.kind === 'text') out[out.length - 1] = Object.assign({}, last, { text: last.text.replace(/\s+$/, '') });
    }
    return out;
  }

  // ---------------------------------------------------------------- the API

  /**
   * The note's HTML (already sanitized) → the document model.
   * @param {string} html
   * @param {{ title?: string, footnotes?: boolean }} options
   */
  function buildModel(html, options) {
    const opts = options || {};
    const root = parseNote(html);
    const verse = !!root.querySelector(VERSE_SELECTOR);
    const footnotes = opts.footnotes ? takeCitations(root) : [];
    const blocks = [];
    new Walk().blocks(root, { style: PLAIN, quote: 0, item: null, pre: false, spaced: false }, blocks);
    return {
      title: String(opts.title || '').trim() || 'خاتىرە',
      defaults: Object.assign({}, DEFAULTS),
      verse: verse,
      credit: verse ? QURAN_CREDIT.slice() : null,
      footnotes: footnotes,
      blocks: blocks
    };
  }

  function runsText(runs) {
    return runs.map(r => r.br ? '\n' : (r.footnote ? '[' + r.footnote + ']' : (r.text || ''))).join('');
  }

  /**
   * Plain text: block edges and <br> end lines, a blank line between
   * paragraphs (not between the items of one list), CRLF. The BOM is added by
   * the main process when the file is written.
   */
  function toText(model) {
    const out = [model.title, ''];
    const counters = {};
    let lastList = null;
    const emit = (blocks) => {
      for (const b of blocks) {
        if (b.type === 'rule') { out.push('—————', ''); lastList = null; continue; }
        if (b.type === 'table') {
          for (const row of b.rows) {
            out.push(row.map(cell => cell.blocks.filter(x => x.type === 'paragraph').map(x => runsText(x.runs).replace(/\n/g, ' ')).join(' ')).join(' | '));
          }
          out.push('');
          lastList = null;
          continue;
        }
        let text = runsText(b.runs);
        if (b.list) {
          const key = b.list.id + ':' + b.list.level;
          if (b.numbered) {
            Object.keys(counters).forEach(k => {
              if (k.indexOf(b.list.id + ':') === 0 && Number(k.split(':')[1]) > b.list.level) delete counters[k];
            });
            counters[key] = (counters[key] || 0) + 1;
            text = (b.list.kind === 'number' ? counters[key] + '. ' : '• ') + text;
          } else {
            text = '   ' + text;
          }
          text = '   '.repeat(b.list.level) + text;
          // Items of one list follow each other without a blank line.
          if (lastList === b.list.id && out[out.length - 1] === '') out.pop();
          lastList = b.list.id;
        } else {
          lastList = null;
        }
        out.push(text, '');
      }
    };
    emit(model.blocks);
    if (model.footnotes && model.footnotes.length) {
      out.push('—————');
      model.footnotes.forEach((f, i) => out.push('[' + (i + 1) + '] ' + f.label + (f.url ? ' — ' + f.url : '')));
      out.push('');
    }
    if (model.credit) {
      out.push('—————');
      model.credit.forEach(line => out.push(line));
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    return out.join('\n').replace(/\r?\n/g, '\r\n') + '\r\n';
  }

  /** Markdown, through the vendored turndown. Footnotes as [^n]. */
  function toMarkdown(html, options) {
    const opts = options || {};
    if (typeof window.TurndownService !== 'function') throw new Error('turndown is not loaded');
    const root = parseNote(html);
    const verse = !!root.querySelector(VERSE_SELECTOR);
    const notes = opts.footnotes ? takeCitations(root) : [];
    const td = new window.TurndownService({
      headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced',
      emDelimiter: '_', strongDelimiter: '**'
    });
    td.addRule('footnote', {
      filter: node => node.nodeName === FOOTNOTE_TAG.toUpperCase(),
      replacement: (content, node) => '[^' + node.getAttribute('data-n') + ']'
    });
    td.addRule('strike', {
      filter: ['s', 'strike', 'del'],
      replacement: content => content.trim() ? '~~' + content + '~~' : content
    });
    // A link Markdown cannot follow (bh:, a path on this machine) keeps its words only.
    td.addRule('localLink', {
      filter: node => node.nodeName === 'A' && !exportUrl(node.getAttribute('href')),
      replacement: content => content
    });
    const title = String(opts.title || '').trim() || 'خاتىرە';
    let md = '# ' + title + '\n\n' + td.turndown(root).trim() + '\n';
    if (notes.length) {
      md += '\n' + notes.map((f, i) => '[^' + (i + 1) + ']: ' + f.label + (f.url ? ' — ' + f.url : '')).join('\n') + '\n';
    }
    if (verse) md += '\n---\n\n' + QURAN_CREDIT.join('  \n') + '\n';
    return md;
  }

  /**
   * The body the main process prints to PDF: the note, footnote marks as
   * superscript numbers with the sources listed at the end, and whether the
   * Qur'an credit is owed.
   */
  function toPdfBody(html, options) {
    const opts = options || {};
    const root = parseNote(html);
    const verse = !!root.querySelector(VERSE_SELECTOR);
    const notes = opts.footnotes ? takeCitations(root) : [];
    const doc = root.ownerDocument;
    for (const mark of Array.from(root.querySelectorAll(FOOTNOTE_TAG))) {
      const sup = doc.createElement('sup');
      sup.textContent = mark.getAttribute('data-n');
      mark.replaceWith(sup);
    }
    if (notes.length) {
      const list = doc.createElement('ol');
      list.className = 'bh-footnotes';
      for (const f of notes) {
        const li = doc.createElement('li');
        li.textContent = f.label + (f.url ? ' — ' + f.url : '');
        list.appendChild(li);
      }
      root.appendChild(list);
    }
    return { html: root.innerHTML, credit: verse ? QURAN_CREDIT.slice() : null };
  }

  window.NoteExport = {
    QURAN_CREDIT: QURAN_CREDIT.slice(),
    buildModel: buildModel,
    toText: toText,
    toMarkdown: toMarkdown,
    toPdfBody: toPdfBody
  };
})();
