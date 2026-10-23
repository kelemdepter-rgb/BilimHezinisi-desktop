// ============================================================================
// AI proofreading that keeps the note's shape (W13, K9).
//
// The notebook used to send the whole note as plain lines and write the
// answer back by rebuilding the editor as one <div> per line
// (naiSetEditorBlocks in index.html), after a confirm() warning that it
// would. Headings, lists, bold words, links and verses in the Uthmani face
// were all lost. Worse, verses and quoted passages were sent to be
// "corrected" with everything else.
//
// Ported from the web edition's lib/ai/note-blocks.ts and lib/ai/proofread.ts
// — the reasoning, rewritten as a plain renderer module over the notebook's
// one text map (src/textmap.js):
//
//   - A UNIT is the block a line belongs to (a paragraph, a heading, a list
//     item, a cell), or the editor itself for text typed straight into it.
//     A LINE is what the writer sees as one: the text between two line ends
//     of the text map, so a <br> inside a paragraph keeps its line.
//   - A unit holding quoted material — a verse, an inserted passage, a
//     citation, any link (TextMap.QUOTED_SELECTOR) — is NEVER SENT, and
//     neither is a line inside quoted material. Correcting a verse, or a
//     passage quoted word for word, would be an error, not a fix.
//   - Lines go out numbered ⟦N⟧ in batches that fit the model's OUTPUT
//     budget, and an answer is accepted only with the same numbers in the
//     same order: anything else is refused whole, never half applied.
//   - Only what CHANGED is written back, and only the part of the line that
//     changed — the common start and end are left alone — through a Range
//     and insertText. So everything around it keeps its markup, and every
//     change is one undo step. A change that would run across formatting (a
//     bold word, a font) is flagged for the writer to see first.
//   - A line the writer edited while the model worked is left alone.
// ============================================================================

(function () {
  'use strict';

  /**
   * Characters of segment text per request, as the web edition and the old
   * desktop code had it. A proofread answer is as long as what was sent, so
   * the limit that bites is the model's output, not its context.
   */
  const BATCH_CHARS = 6000;
  /** Marker overhead per segment: `⟦123⟧ ` and a newline. */
  const MARKER_COST = 8;

  function TM() { return window.TextMap; }

  function isHighSurrogate(code) { return code >= 0xD800 && code <= 0xDBFF; }
  function isLowSurrogate(code) { return code >= 0xDC00 && code <= 0xDFFF; }

  /**
   * A line as it is sent — every run of white space one space, the ends
   * trimmed — with, for each character kept, where it stands in the line as
   * written. That is how a correction to the sent text finds its place in
   * the note.
   */
  function normalize(raw) {
    let text = '';
    const at = [];
    let space = -1;
    for (let i = 0; i < raw.length; i++) {
      if (/\s/.test(raw[i])) {
        if (text.length && space < 0) space = i;
        continue;
      }
      if (space >= 0) { text += ' '; at.push(space); space = -1; }
      text += raw[i];
      at.push(i);
    }
    return { text: text, at: at };
  }

  /**
   * Where position k of the sent text falls in the line as written. A
   * collapsed space stands for its whole run, so a boundary before it is
   * the run's start, and one after it is where the next character is.
   */
  function rawBoundary(at, k) {
    if (k < at.length) return at[k];
    return at.length ? at[at.length - 1] + 1 : 0;
  }

  /** Does node i of the map follow node i - 1 on the same line (no line end between)? */
  function followsOn(map, i) {
    return map.starts[i] === map.starts[i - 1] + map.nodes[i - 1].data.length;
  }

  /** [start, end) of the whole line holding `offset` in the map. */
  function lineBounds(map, offset) {
    if (!map.nodes.length) return [0, 0];
    let low = 0;
    let high = map.starts.length - 1;
    let i = 0;
    while (low <= high) {
      const mid = (low + high) >> 1;
      if (map.starts[mid] <= offset) { i = mid; low = mid + 1; }
      else high = mid - 1;
    }
    let a = i;
    while (a > 0 && followsOn(map, a)) a--;
    let b = i;
    while (b + 1 < map.nodes.length && followsOn(map, b + 1)) b++;
    return [map.starts[a], map.starts[b] + map.nodes[b].data.length];
  }

  /** The block a text node's line belongs to, inside `editor` — or null for the editor itself. */
  function unitOf(editor, node) {
    const block = TM().blockOf(node);
    return (block && block !== editor && editor.contains(block)) ? block : null;
  }

  /**
   * Every line of the note, in order, as the text map draws them, with
   * those that may be sent numbered from 1.
   *
   * @returns {{map, lines: Array, quoted: number}} `lines` holds only what
   *   may be sent; `quoted` counts the units left out, so the AI tab can say
   *   so honestly.
   */
  function collect(editor) {
    const tm = TM();
    const map = tm.readTextMap(editor);
    const quotedSpans = tm.quotedSpans(map, editor);
    const lines = [];
    const quotedUnits = new Set();
    let quotedLoose = 0;

    let first = 0;
    for (let i = 0; i <= map.nodes.length; i++) {
      // A line ends where the next node does not follow on directly — the
      // map put a line end between them — or where the nodes run out.
      const breaks = i === map.nodes.length || (i > first && !followsOn(map, i));
      if (!breaks) continue;
      if (i > first) {
        const start = map.starts[first];
        const end = map.starts[i - 1] + map.nodes[i - 1].data.length;
        const raw = map.text.slice(start, end);
        const nodes = map.nodes.slice(first, i);
        const unit = unitOf(editor, nodes[0]);
        const sel = tm.QUOTED_SELECTOR;
        const quoted = (unit && (unit.matches(sel) || unit.querySelector(sel))) ||
          tm.overlapsAny(quotedSpans, start, end);
        if (quoted) {
          if (raw.trim()) {
            if (unit) quotedUnits.add(unit);
            else quotedLoose++;
          }
        } else if (raw.trim()) {
          const n = normalize(raw);
          const holder = unit || editor;
          lines.push({
            num: lines.length + 1,
            text: n.text,
            at: n.at,
            raw: raw,
            start: start,
            unit: unit,
            // Inline markup on this line: what a change across it would flatten.
            formatted: nodes.some(node => node.parentElement !== holder),
            // Live: it follows the text while the writer types elsewhere.
            range: tm.rangeFor(map, start, end)
          });
        }
      }
      first = i;
    }
    return { map: map, lines: lines, quoted: quotedUnits.size + quotedLoose };
  }

  /** Split segments into batches no bigger than the output budget; an oversized one goes alone. */
  function buildBatches(segments, budget) {
    const limit = budget || BATCH_CHARS;
    const batches = [];
    let current = [];
    let length = 0;
    for (const segment of segments) {
      const cost = segment.text.length + MARKER_COST;
      if (current.length && length + cost > limit) {
        batches.push(current);
        current = [];
        length = 0;
      }
      current.push(segment);
      length += cost;
    }
    if (current.length) batches.push(current);
    return batches;
  }

  /** `⟦1⟧ text` per line — exactly the shape the prompt describes (ai.js). */
  function formatBatch(batch) {
    return batch.map(segment => '⟦' + segment.num + '⟧ ' + segment.text).join('\n');
  }

  /** The answer's segments, in the order the markers came. */
  function parseSegments(reply) {
    const text = String(reply || '');
    const pattern = /⟦(\d+)⟧/g;
    const marks = [];
    let m;
    while ((m = pattern.exec(text)) !== null) {
      marks.push({ num: parseInt(m[1], 10), start: m.index, end: pattern.lastIndex });
    }
    return marks.map((mark, i) => ({
      num: mark.num,
      text: text.slice(mark.end, i + 1 < marks.length ? marks[i + 1].start : text.length).trim()
    }));
  }

  /**
   * Is this answer safe to apply to the batch that was sent? The same
   * numbers in the same order, or it is refused whole — a retry is a small
   * annoyance, half an answer applied is a silent corruption.
   */
  function checkBatch(sent, reply) {
    const got = parseSegments(reply);
    if (!got.length) return { ok: false, reason: 'empty' };
    if (got.length < sent.length) return { ok: false, reason: 'missing' };
    if (got.length > sent.length) return { ok: false, reason: 'extra' };
    for (let i = 0; i < sent.length; i++) {
      if (got[i].num !== sent[i].num) return { ok: false, reason: 'reordered' };
    }
    return { ok: true, segments: got };
  }

  function malformedMessage(reason) {
    const detail = {
      missing: 'بىر قىسىم بۆلەكلەر قايتىپ كەلمىدى',
      extra: 'ئارتۇق بۆلەك قايتىپ كەلدى',
      reordered: 'بۆلەكلەرنىڭ تەرتىپى ئۆزگىرىپ كەتتى',
      empty: 'جاۋاب بوش كەلدى'
    }[reason] || reason;
    return 'جاۋاب فورماتى خاتا (' + detail + '). خاتىرىڭىزگە ھېچقانداق ئۆزگەرتىش قىلىنمىدى — قايتا سىناڭ.';
  }

  /**
   * What would change: for each line the answer corrected, the smallest
   * stretch that differs — `p` characters in, `s` from the end — and where
   * that stretch is in the line as written.
   *
   * `corrected` maps a line's number to its corrected text. An answer that
   * empties a line is never planned: applying it would delete the line.
   */
  function planChanges(collected, corrected) {
    const tm = TM();
    const changes = [];
    for (const line of collected.lines) {
      const answer = corrected.get(line.num);
      if (typeof answer !== 'string') continue;
      const after = answer.replace(/\s+/g, ' ').trim();
      const before = line.text;
      if (!after || after === before) continue;

      const most = Math.min(before.length, after.length);
      let p = 0;
      while (p < most && before[p] === after[p]) p++;
      let s = 0;
      while (s < most - p && before[before.length - 1 - s] === after[after.length - 1 - s]) s++;
      // Never cut a character in two.
      if (p > 0 && isHighSurrogate(before.charCodeAt(p - 1))) p--;
      if (s > 0 && isLowSurrogate(before.charCodeAt(before.length - s))) s--;

      const from = rawBoundary(line.at, p);
      const to = rawBoundary(line.at, before.length - s);
      let flattens = false;
      if (to > from && line.formatted) {
        const range = tm.rangeFor(collected.map, line.start + from, line.start + to);
        flattens = !!range && range.startContainer !== range.endContainer;
      }
      changes.push({
        num: line.num,
        line: line,
        before: before,
        after: after,
        p: p,
        s: s,
        from: from,
        to: to,
        insert: after.slice(p, after.length - s),
        flattens: flattens
      });
    }
    return changes;
  }

  /**
   * Write the changes into the note, last first, each through an editing
   * command — so each is one undo step and nothing around it is touched.
   * A line that no longer reads as it did when it was sent is skipped.
   *
   * @returns {{applied: number, skipped: number}}
   */
  function applyChanges(editor, changes) {
    const tm = TM();
    let applied = 0;
    let skipped = 0;
    const ordered = changes.slice().sort((a, b) => b.num - a.num);
    if (ordered.length) editor.focus();
    const selection = window.getSelection();
    for (const change of ordered) {
      const line = change.line;
      const live = line.range;
      if (!live || !editor.contains(live.startContainer) || live.toString() !== line.raw) { skipped++; continue; }
      // The whole line, end to end: text typed at either end of it is outside
      // the live Range (a Range does not grow at its boundary), but it is
      // still the writer's change to this line.
      const map = tm.readTextMap(editor);
      const start = tm.offsetAtPoint(map, live.startContainer, live.startOffset);
      const bounds = lineBounds(map, start);
      if (bounds[0] !== start || map.text.slice(bounds[0], bounds[1]) !== line.raw) { skipped++; continue; }
      const range = tm.rangeFor(map, start + change.from, start + change.to);
      if (!range) { skipped++; continue; }
      selection.removeAllRanges();
      selection.addRange(range);
      if (change.insert) document.execCommand('insertText', false, change.insert);
      else document.execCommand('delete');
      applied++;
    }
    return { applied: applied, skipped: skipped };
  }

  // ----------------------------------------------------------- OCR cleanup
  // OCR cleanup rejoins a paragraph's broken lines and words, so it cannot go
  // line by line: it replaces what it was given, as one editing command —
  // insertText, whose newlines the editor makes into paragraphs, so one
  // Ctrl+Z takes it all back (measured, Electron 28). It works on the
  // selection, or on the whole note only when the note is plain paragraphs:
  // replacing a heading, a list, a table, a quotation or a verse with plain
  // paragraphs would destroy them.

  const STRUCTURE = 'h1, h2, h3, h4, h5, h6, ul, ol, li, table, blockquote';

  function intersectsQuoted(editor, range) {
    return Array.from(editor.querySelectorAll(TM().QUOTED_SELECTOR)).some(el => {
      try { return range.intersectsNode(el); } catch (e) { return true; }
    });
  }

  function wholeRange(editor) {
    const range = document.createRange();
    range.selectNodeContents(editor);
    return range;
  }

  /**
   * The paragraphs between two map offsets: one per block (a list of lines
   * broken by <br> is one paragraph, rejoined), in order, empty ones left out.
   */
  function paragraphsIn(editor, map, start, end) {
    const out = [];
    let current = null;
    let unit;
    for (let i = 0; i < map.nodes.length; i++) {
      const s = map.starts[i];
      const e = s + map.nodes[i].data.length;
      if (e <= start || s >= end) continue;
      const u = unitOf(editor, map.nodes[i]);
      if (current === null || u !== unit) {
        if (current !== null) out.push(current);
        current = '';
        unit = u;
      } else if (!followsOn(map, i)) {
        current += ' ';
      }
      current += map.text.slice(Math.max(s, start), Math.min(e, end));
    }
    if (current !== null) out.push(current);
    return out.map(p => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  /**
   * What OCR cleanup may work on: the selection, when there is one in the
   * editor, or else the whole note.
   *
   * @returns {{ok: true, whole, range, text, paragraphs} | {ok: false, reason: 'structure' | 'quoted'}}
   *   `range` is live, `text` is what the map read in it — together they say
   *   later whether the writer changed it meanwhile.
   */
  function ocrScope(editor, selection) {
    const tm = TM();
    let range = null;
    if (selection && selection.rangeCount && !selection.isCollapsed) {
      const r = selection.getRangeAt(0);
      if (editor.contains(r.commonAncestorContainer)) range = r.cloneRange();
    }
    const whole = !range;
    if (whole) {
      if (editor.querySelector(tm.QUOTED_SELECTOR) || editor.querySelector(STRUCTURE)) return { ok: false, reason: 'structure' };
      range = wholeRange(editor);
    } else if (intersectsQuoted(editor, range)) {
      return { ok: false, reason: 'quoted' };
    }
    const map = tm.readTextMap(editor);
    const start = whole ? 0 : tm.offsetAtPoint(map, range.startContainer, range.startOffset);
    const end = whole ? map.text.length : tm.offsetAtPoint(map, range.endContainer, range.endOffset);
    return {
      ok: true,
      whole: whole,
      range: range,
      text: map.text.slice(start, end),
      paragraphs: paragraphsIn(editor, map, start, end)
    };
  }

  /** The scope's Range now — or null when what it holds is no longer what was sent. */
  function intactRange(editor, scope) {
    const tm = TM();
    if (!scope || !scope.ok) return null;
    const map = tm.readTextMap(editor);
    if (scope.whole) {
      if (map.text !== scope.text || editor.querySelector(STRUCTURE) || editor.querySelector(tm.QUOTED_SELECTOR)) return null;
      return wholeRange(editor);
    }
    const range = scope.range;
    if (!range || !editor.contains(range.commonAncestorContainer)) return null;
    const start = tm.offsetAtPoint(map, range.startContainer, range.startOffset);
    const end = tm.offsetAtPoint(map, range.endContainer, range.endOffset);
    if (map.text.slice(start, end) !== scope.text || intersectsQuoted(editor, range)) return null;
    return range;
  }

  function scopeIntact(editor, scope) {
    return intactRange(editor, scope) !== null;
  }

  /**
   * Put the cleaned paragraphs in place of the scope — unless what it holds
   * is no longer what was sent. Then nothing is written, and false says so.
   */
  function replaceScope(editor, scope, paragraphs) {
    const range = intactRange(editor, scope);
    if (!range) return false;
    const text = (paragraphs || []).map(p => String(p).replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n');
    if (!text) return false;
    editor.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('insertText', false, text);
    return true;
  }

  window.NoteUnits = {
    BATCH_CHARS: BATCH_CHARS,
    ocrScope: ocrScope,
    scopeIntact: scopeIntact,
    replaceScope: replaceScope,
    collect: collect,
    buildBatches: buildBatches,
    formatBatch: formatBatch,
    parseSegments: parseSegments,
    checkBatch: checkBatch,
    malformedMessage: malformedMessage,
    planChanges: planChanges,
    applyChanges: applyChanges
  };
})();
