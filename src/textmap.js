// ============================================================================
// Where things are in a live contentEditable: one flat view of the note's
// text, and the way back into the DOM.
//
// Ported from the web edition's lib/spellcheck/marks.ts (commits 31f76d6,
// ec9f78a) — the same reasoning, rewritten as a plain renderer module. The
// spellchecker, find & replace and the reference scanner all read the note
// through THIS file, so they can never disagree about where a word is.
//
// WHY NOT WRAP WORDS IN ELEMENTS. Putting a <span> around a marked word is the
// obvious way to underline it, and the wrong one here for three reasons:
//
//   1. the note is saved as innerHTML, so anything inserted is stored inside
//      the writer's note and comes back on the next open — the checker would
//      be editing the document it is checking;
//   2. mutating a contentEditable moves the caret (that is K2: the reference
//      scanner wrapped words and the caret jumped to the start of the line);
//   3. splitting a text node mid-word breaks Arabic shaping — «قالدۇر» in two
//      nodes loses the join between them.
//
// The CSS Custom Highlight API paints Ranges without touching the DOM at all.
// The cost is that there is no element to click, so a click is hit-tested from
// the pointer's position back into the text (hitTest below).
//
// WHERE A LINE ENDS, THE MAP SAYS SO. The flattened string is what the
// tokenizer reads, so it has to break wherever the reader sees a break. It
// used to be the bare concatenation of every text node, and that glued the
// last word of one line to the first of the next: «مەنىڭ», Enter,
// «چۈشەنمىگەن» arrived as one word «مەنىڭچۈشەنمىگەن», was underlined as one
// wrong word, and accepting a suggestion replaced a Range running from the
// first paragraph into the second — deleting the next paragraph's word and the
// paragraph break with it (the owner's bug 2, audit §2).
//
// So the map puts one virtual LINE_SEPARATOR between two text nodes whenever,
// walking from the first to the second in document order, it
//
//   - enters or leaves a block element (BLOCK_TAGS) — which covers every pair
//     of nodes whose nearest block differs, and an empty block between two
//     runs of text, which the browser draws as a line break too; or
//   - passes a <br> (or an <hr>, which is a block).
//
// At most one separator stands between two nodes, and none before the first.
// Inline elements — b, span, a, font — never break anything: a word half in
// bold is still one word.
//
// A separator belongs to no text node. starts[i] is still where nodes[i]
// begins; the gaps between one node's end and the next one's start are the
// separators; and an offset that falls on a separator resolves to the END of
// the node before it, so a word that ends a line gets a Range that ends inside
// its own block. Empty text nodes are left out: they hold no character an
// offset could address, and one sitting just before a separator would
// otherwise claim that offset ahead of the node holding the word.
// ============================================================================

(function () {
  'use strict';

  /** What the map puts where a line ends. No word pattern ever matches it. */
  const LINE_SEPARATOR = '\n';

  /**
   * The block-level tags a note can contain (src/sanitize.js holds the closed
   * list). Entering or leaving one ends a line.
   */
  const BLOCK_TAGS = new Set([
    'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li', 'blockquote', 'pre',
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr'
  ]);

  /**
   * What in a note is quoted material rather than the writer's own words:
   * nothing here is the writer's spelling to fix, the format painter's to
   * repaint, or the AI's to correct.
   *
   * A citation is anchored by a link, and the Uthmani face is only ever applied
   * to an inserted verse, so both are exact tests rather than guesses. The
   * desktop inserts verses with the family alias `UthmanicHafs`, written
   * WITHOUT a space (src/notes.js, notesInsertAya) — the web edition's
   * selector alone would miss every one of them. `data-ref-insert="1"` marks an
   * inserted library passage, and the class is needed next to it because the
   * sanitizer used to strip that attribute (K6), so notes written before v3.5
   * carry only the class.
   */
  const QUOTED_SELECTOR =
    'a[href], [style*="UthmanicHafs"], [style*="Uthmanic Hafs"], [data-ref-insert="1"], .notes-inserted-ref';

  /**
   * Flatten a subtree's text. Nodes are visited in document order, so the
   * string reads the way the page does, and a line end between two of them
   * becomes a LINE_SEPARATOR — see the comment at the top of this file.
   *
   * @param {Node} root
   * @returns {{text: string, nodes: Text[], starts: number[]}}
   */
  function readTextMap(root) {
    const nodes = [];
    const starts = [];
    let text = '';
    // A line end has been passed since the last text node. A flag, not a
    // count, which is what keeps it to one separator however many boundaries
    // there are.
    let lineEnded = false;

    (function visit(parent) {
      for (let child = parent.firstChild; child; child = child.nextSibling) {
        if (child.nodeType === Node.TEXT_NODE) {
          if (child.data.length === 0) continue;
          if (lineEnded && nodes.length > 0) text += LINE_SEPARATOR;
          lineEnded = false;
          starts.push(text.length);
          nodes.push(child);
          text += child.data;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.localName;
          if (tag === 'br') { lineEnded = true; continue; }
          const block = BLOCK_TAGS.has(tag);
          if (block) lineEnded = true;
          visit(child);
          if (block) lineEnded = true;
        }
      }
    })(root);

    return { text: text, nodes: nodes, starts: starts };
  }

  /**
   * Which text node holds a flattened offset, and where inside it.
   *
   * An offset sitting exactly on a boundary between two adjacent nodes belongs
   * to the node that STARTS there, so a range built from [start, end) never
   * begins at the tail of the previous node — which would place the underline
   * one node too early. An offset on a separator belongs to no node and
   * resolves to the end of the one before it.
   */
  function locate(map, offset) {
    if (map.nodes.length === 0) return null;

    let low = 0;
    let high = map.starts.length - 1;
    let found = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (map.starts[mid] <= offset) { found = mid; low = mid + 1; }
      else high = mid - 1;
    }

    const node = map.nodes[found];
    const within = offset - map.starts[found];
    // A trailing offset can land one past the end of an exhausted node, and a
    // node can have shortened since the map was read.
    return { node: node, offset: Math.min(Math.max(within, 0), node.data.length) };
  }

  /** A live Range covering [start, end) of the flattened text. */
  function rangeFor(map, start, end) {
    const from = locate(map, start);
    const to = locate(map, end);
    if (!from || !to) return null;
    try {
      const range = document.createRange();
      range.setStart(from.node, from.offset);
      range.setEnd(to.node, to.offset);
      return range;
    } catch (e) { return null; }
  }

  /** The nearest block around a node — the element its line belongs to. */
  function blockOf(node) {
    const start = (node && node.nodeType === Node.ELEMENT_NODE) ? node : (node && node.parentElement);
    for (let element = start; element; element = element.parentElement) {
      if (BLOCK_TAGS.has(element.localName)) return element;
    }
    return null;
  }

  /**
   * The Range of a marked word in the document as it is NOW, or null when the
   * document no longer holds exactly that word there.
   *
   * `map` must be freshly read: a mark's offsets are only meaningful against
   * the text they were found in, and anything typed since moves them. Three
   * checks, each of which alone would have stopped the owner's bug 2 from
   * deleting a word out of the next paragraph:
   *
   *   - the flattened text at the mark is exactly the word — any edit that
   *     moved it, and any line separator inside it, fails here;
   *   - the Range reads back as exactly the word;
   *   - the Range starts and ends in the same block, so replacing it can never
   *     merge two lines.
   */
  function wordRange(map, mark) {
    if (!mark) return null;
    if (map.text.slice(mark.start, mark.end) !== mark.word) return null;
    const range = rangeFor(map, mark.start, mark.end);
    if (!range || range.toString() !== mark.word) return null;
    if (blockOf(range.startContainer) !== blockOf(range.endContainer)) return null;
    return range;
  }

  /** The flattened offset of a DOM position, or null when it is outside the map. */
  function offsetOf(map, node, offset) {
    const index = map.nodes.indexOf(node);
    if (index >= 0) return map.starts[index] + offset;

    // The point landed on an element rather than a text node — normal when a
    // click hits padding between nodes. Fall back to the nearest text node the
    // element contains.
    for (let i = 0; i < map.nodes.length; i++) {
      if (node && typeof node.contains === 'function' && node.contains(map.nodes[i])) return map.starts[i];
    }
    return null;
  }

  /**
   * The flattened offset of ANY point in the document: a text node and an
   * offset in it, or an element and a child index — where a caret can sit after
   * an edit restructured the nodes around it. A point between two text nodes
   * resolves to the start of the next one; a point after the last, to the end
   * of the text. Unlike offsetOf, never null, and never the start of a whole
   * block for a point in the middle of it.
   */
  function offsetAtPoint(map, node, offset) {
    const index = map.nodes.indexOf(node);
    if (index >= 0) {
      return map.starts[index] + Math.min(Math.max(offset, 0), map.nodes[index].data.length);
    }
    if (map.nodes.length === 0) return 0;

    const point = document.createRange();
    try { point.setStart(node, offset); } catch (e) { return 0; }

    // The first text node that starts at or after the point. Nodes are in
    // document order, so the answer is a binary search away.
    let low = 0;
    let high = map.nodes.length - 1;
    let found = map.nodes.length;
    while (low <= high) {
      const mid = (low + high) >> 1;
      let side;
      try { side = point.comparePoint(map.nodes[mid], 0); } catch (e) { return 0; }
      if (side >= 0) { found = mid; high = mid - 1; }
      else low = mid + 1;
    }
    return found < map.nodes.length ? map.starts[found] : map.text.length;
  }

  /**
   * Where quoted material lies in the map's text: every text node inside an
   * element under `root` that matches `selector`, as [start, end) runs in
   * order, with neighbouring runs joined.
   */
  function quotedSpans(map, root, selector) {
    const sel = selector || QUOTED_SELECTOR;
    const spans = [];
    for (let index = 0; index < map.nodes.length; index++) {
      const parent = map.nodes[index].parentElement;
      const holder = parent ? parent.closest(sel) : null;
      if (!holder || holder === root || !root.contains(holder)) continue;
      const start = map.starts[index];
      const end = start + map.nodes[index].data.length;
      const last = spans[spans.length - 1];
      // Touching, or only a line end apart: one run.
      if (last && start - last[1] <= 1) last[1] = end;
      else spans.push([start, end]);
    }
    return spans;
  }

  /** Does [start, end) overlap any of `spans` (sorted, as quotedSpans gives them)? */
  function overlapsAny(spans, start, end) {
    let low = 0;
    let high = spans.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const span = spans[mid];
      if (span[1] <= start) low = mid + 1;
      else if (span[0] >= end) high = mid - 1;
      else return true;
    }
    return false;
  }

  /**
   * The same text with `spans` blanked out, character for character.
   *
   * The engine must not see quoted material — an Arabic verse would be
   * reported as a page of misspellings — but it must still receive the WHOLE
   * text, because every offset it answers with is an offset into what it was
   * given. Replacing a span with spaces of exactly its length keeps the two in
   * step, and a space is a word boundary everywhere, so nothing on either side
   * of a quotation is glued to it.
   */
  function maskSpans(text, spans) {
    if (!spans || !spans.length) return text;
    let out = '';
    let cursor = 0;
    for (const span of spans) {
      const start = Math.max(cursor, span[0]);
      const end = Math.min(text.length, span[1]);
      if (end <= start) continue;
      out += text.slice(cursor, start) + ' '.repeat(end - start);
      cursor = end;
    }
    return out + text.slice(cursor);
  }

  /** The marked word covering an offset, if any. Marks never overlap. */
  function wordAtOffset(marks, offset) {
    for (const mark of marks) {
      // Inclusive of `end` so a click at the very end of a word still opens
      // it. A word that ends a line ends on a separator, so the first offset
      // of the next line is never mistaken for the end of this one.
      if (offset >= mark.start && offset <= mark.end) return mark;
    }
    return null;
  }

  /**
   * The text position under a screen point, as { node, offset }, or null.
   *
   * Two APIs do the same job under different names: caretPositionFromPoint is
   * the standard one, caretRangeFromPoint is WebKit's older spelling. Chromium
   * 120 — which is what Electron 28 is — has only the second, so that branch
   * is the one that actually runs here (measured, Phase 0); both are kept
   * because the first is what every engine is moving to.
   */
  function pointAt(x, y) {
    if (typeof document.caretPositionFromPoint === 'function') {
      const position = document.caretPositionFromPoint(x, y);
      return position ? { node: position.offsetNode, offset: position.offset } : null;
    }
    if (typeof document.caretRangeFromPoint === 'function') {
      const range = document.caretRangeFromPoint(x, y);
      return range ? { node: range.startContainer, offset: range.startOffset } : null;
    }
    return null;
  }

  /** The marked word under a screen position. */
  function hitTest(map, marks, x, y) {
    const point = pointAt(x, y);
    if (!point) return null;
    const flat = offsetOf(map, point.node, point.offset);
    return flat === null ? null : wordAtOffset(marks, flat);
  }

  /** Is the Custom Highlight API usable here? Chromium 120 says yes. */
  function canHighlight() {
    return typeof CSS !== 'undefined' &&
           typeof CSS.highlights === 'object' && CSS.highlights !== null &&
           typeof Highlight === 'function';
  }

  /**
   * Paint `ranges` under `name`, or remove that highlight when there are none.
   * Three features draw this way now, so the registry is touched in one place.
   */
  function setHighlight(name, ranges) {
    if (!canHighlight()) return false;
    try {
      if (!ranges || !ranges.length) { CSS.highlights.delete(name); return true; }
      const highlight = new Highlight();
      for (const range of ranges) if (range) highlight.add(range);
      CSS.highlights.set(name, highlight);
      return true;
    } catch (e) { return false; }
  }

  /** Stop painting `name`. */
  function clearHighlight(name) {
    if (!canHighlight()) return;
    try { CSS.highlights.delete(name); } catch (e) { /* nothing painted */ }
  }

  window.TextMap = {
    LINE_SEPARATOR: LINE_SEPARATOR,
    BLOCK_TAGS: BLOCK_TAGS,
    QUOTED_SELECTOR: QUOTED_SELECTOR,
    readTextMap: readTextMap,
    locate: locate,
    rangeFor: rangeFor,
    blockOf: blockOf,
    wordRange: wordRange,
    offsetOf: offsetOf,
    offsetAtPoint: offsetAtPoint,
    quotedSpans: quotedSpans,
    overlapsAny: overlapsAny,
    maskSpans: maskSpans,
    wordAtOffset: wordAtOffset,
    pointAt: pointAt,
    hitTest: hitTest,
    canHighlight: canHighlight,
    setHighlight: setHighlight,
    clearHighlight: clearHighlight
  };
})();
