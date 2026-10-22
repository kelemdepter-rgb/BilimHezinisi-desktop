// ============================================================================
// Tiny test framework for the notebook suites (renderer side).
//
// It runs inside tests/notebook/harness.html, which loads the REAL renderer
// files unchanged. tests/run.js drives it from the Electron main process with
// webContents.executeJavaScript('window.BH.run()') and prints what comes back.
//
// No dependency, no node integration: the harness page is an ordinary file://
// document, exactly like src/index.html.
// ============================================================================

(function () {
  'use strict';

  const registered = [];

  /** Register one test. `fn` receives the helper object `t`. */
  function test(name, fn) {
    registered.push({ name: name, fn: fn });
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  // --- assertions ----------------------------------------------------------
  // Every failure throws, so the first broken expectation ends that test and
  // its message becomes the FAIL line's detail.

  function fail(msg, extra) {
    throw new Error(extra ? (msg + ' — ' + extra) : msg);
  }

  const assert = {
    ok: function (cond, msg) {
      if (!cond) fail(msg || 'expected a truthy value');
    },
    equal: function (actual, expected, msg) {
      if (actual !== expected) {
        fail(msg || 'values differ', 'expected ' + JSON.stringify(expected) +
                                     ', got ' + JSON.stringify(actual));
      }
    },
    deepEqual: function (actual, expected, msg) {
      const a = JSON.stringify(actual);
      const b = JSON.stringify(expected);
      if (a !== b) fail(msg || 'values differ', 'expected ' + b + ', got ' + a);
    },
    includes: function (haystack, needle, msg) {
      if (String(haystack).indexOf(needle) === -1) {
        fail(msg || 'substring missing', JSON.stringify(needle) + ' not in ' +
                                         JSON.stringify(String(haystack)));
      }
    },
    excludes: function (haystack, needle, msg) {
      if (String(haystack).indexOf(needle) !== -1) {
        fail(msg || 'substring present', JSON.stringify(needle) + ' found in ' +
                                         JSON.stringify(String(haystack)));
      }
    }
  };

  // --- the editor, driven the way the UI drives it -------------------------

  function editor() {
    return document.getElementById('notes-editor');
  }

  /** Put the caret inside a text node and type, through the editing command. */
  function type(text) {
    editor().focus();
    document.execCommand('insertText', false, text);
  }

  /** Enter. */
  function enter() {
    editor().focus();
    document.execCommand('insertParagraph');
  }

  /** Shift+Enter. */
  function lineBreak() {
    editor().focus();
    document.execCommand('insertLineBreak');
  }

  /** Collapse the caret at the end of the editor's content. */
  function caretToEnd() {
    const ed = editor();
    ed.focus();
    const range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Collapse the caret inside a text node. */
  function caretIn(node, offset) {
    editor().focus();
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  /** Select from one DOM point to another, the way a drag does. */
  function select(startNode, startOffset, endNode, endOffset) {
    editor().focus();
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return range;
  }

  /** The first text node inside an element (depth first). */
  function firstText(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    return walker.nextNode();
  }

  /** The last text node inside an element. */
  function lastText(el) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    let last = null;
    let node = walker.nextNode();
    while (node) { last = node; node = walker.nextNode(); }
    return last;
  }

  /**
   * A real mouse event at a real point. The spellchecker hit-tests the pointer
   * position with caretRangeFromPoint, so a synthetic event without usable
   * coordinates would never find the word under it.
   */
  function mouse(target, kind, x, y) {
    target.dispatchEvent(new MouseEvent(kind, {
      bubbles: true, cancelable: true, view: window,
      clientX: x, clientY: y
    }));
  }

  /** Click the middle of a rectangle (a Range's or an element's). */
  function clickRect(target, rect, kind) {
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    mouse(target, kind || 'mousedown', x, y);
    return { x: x, y: y };
  }

  /** The ranges a CSS custom highlight currently paints, as strings. */
  function highlighted(name) {
    const h = (typeof CSS !== 'undefined' && CSS.highlights) ? CSS.highlights.get(name) : null;
    if (!h) return [];
    return Array.from(h).map(function (r) { return r.toString(); });
  }

  /** The Ranges themselves, for rectangles. */
  function highlightRanges(name) {
    const h = (typeof CSS !== 'undefined' && CSS.highlights) ? CSS.highlights.get(name) : null;
    return h ? Array.from(h) : [];
  }

  /** The editor's block children as tag names — the structure a test asserts. */
  function blockTags() {
    return Array.from(editor().children).map(function (el) { return el.tagName; });
  }

  const t = {
    assert: assert,
    sleep: sleep,
    editor: editor,
    type: type,
    enter: enter,
    lineBreak: lineBreak,
    caretToEnd: caretToEnd,
    caretIn: caretIn,
    select: select,
    firstText: firstText,
    lastText: lastText,
    mouse: mouse,
    clickRect: clickRect,
    highlighted: highlighted,
    highlightRanges: highlightRanges,
    blockTags: blockTags,
    fresh: function (opts) { return window.BH.fresh(opts); }
  };

  /** Run every registered test in order. Never throws; the report says all. */
  async function run(only) {
    const results = [];
    for (const item of registered) {
      if (only && only.length && only.indexOf(item.name) === -1) continue;
      const started = Date.now();
      let ok = true;
      let detail = '';
      try {
        await item.fn(t);
      } catch (e) {
        ok = false;
        detail = (e && e.message) ? e.message : String(e);
      }
      results.push({ name: item.name, ok: ok, detail: detail, ms: Date.now() - started });
    }
    return results;
  }

  window.BH = window.BH || {};
  window.BH.test = test;
  window.BH.run = run;
  window.BH.t = t;
  window.BH.names = function () { return registered.map(function (i) { return i.name; }); };
})();
