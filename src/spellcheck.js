// ============================================================================
// Uyghur spell checker — renderer side.
//
// The engine itself is NOT here any more. It lives in the main process
// (src/spellcheck/) with the 2.2 MB binary dictionary, the learned edit weights
// and the morphology; this file is the thin half that talks to it and draws the
// result. What used to happen here — reading a 9.86 MB text file over IPC and
// building a symmetric-delete index over 441,322 words, 409 MB of heap and
// about ten seconds of it — is gone entirely.
//
// WHAT THE MAIN PROCESS ANSWERS
//   spellInit(words)   loads the artifacts once and reports { ready, words }
//   spellCheck(text)   takes the WHOLE flattened text and returns the
//                      misspelled words as [{ word, start, end }] offsets into
//                      that same string. The renderer deliberately does not
//                      tokenize: it cannot require() the engine's word rules
//                      (contextIsolation), and a second copy of WORD_PATTERN,
//                      normalizeForLookup and isCheckable that drifted by one
//                      character would put the underline on the wrong word.
//   spellSuggest(word) ranked corrections, best first
//   spellPersonal(ws)  the user's own dictionary, so both halves agree
//
// HOW THE UNDERLINE IS DRAWN. With the CSS Custom Highlight API, not with
// <span> elements. Wrapping words in spans was a real defect, not an
// inelegance: the note is saved as innerHTML, sanitize.js allowed the spans
// through, and they came back on the next open as dead red-underlined text with
// no click handler — un-removable by the writer. Highlights paint Ranges
// without touching the DOM, so there is nothing to save, nothing to disturb the
// caret, and no text node split through the middle of an Arabic word.
//
// The cost is that there is no element to click, so the popup is opened by
// hit-testing the pointer position back into the text — see hitTest below.
// ============================================================================

(function () {
  'use strict';

  /** The name the ::highlight() rule in notes.css paints. */
  const HIGHLIGHT_NAME = 'bh-spell-error';
  /** Arabic tatweel, stripped before comparing words — mirrors the engine. */
  const SOZGHUCH = 'ـ';

  let ready = false;              // set when spellInit resolves; isReady() is sync
  let loadingPromise = null;
  let userWords = new Set();      // the personal dictionary, persisted
  const ignored = new Set();      // "skip this word", for this session only

  let marks = [];                 // [{ word, start, end }] currently underlined
  let currentMap = null;          // the TextMap those offsets belong to
  let boundEditor = null;         // the editor element our listeners are on

  // dbGetSetting returns {success, value} in this app — unwrap.
  function unwrapSetting(res, fallback) {
    if (res == null) return fallback;
    if (typeof res === 'object' && 'value' in res) return res.value != null ? res.value : fallback;
    return res;
  }

  function normalizeForLookup(word) {
    return String(word || '').split(SOZGHUCH).join('').trim().toLowerCase();
  }

  // ==========================================================================
  // Positions: a flat view of the editor's text, and the way back
  // (ported from the web edition's lib/spellcheck/marks.ts)
  // ==========================================================================

  /**
   * Flatten a subtree's text. Nodes are visited in document order, so the
   * string reads the way the page does.
   *
   * The filter skips exactly what the old checker skipped: the popup's own
   * text, and inserted Qur'an references, which must never be spell-checked.
   * Filtering HERE rather than after the fact is what keeps the offsets honest —
   * the map and the string handed to the engine are then the same thing.
   */
  function readTextMap(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (parent && (parent.closest('.spell-popup') || parent.closest('[data-ref-insert="1"]'))) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    const starts = [];
    let text = '';
    let node = walker.nextNode();
    while (node) {
      starts.push(text.length);
      nodes.push(node);
      text += node.data;
      node = walker.nextNode();
    }
    return { text, nodes, starts };
  }

  /**
   * Which text node holds a flattened offset, and where inside it.
   *
   * An offset sitting exactly on a boundary belongs to the node that STARTS
   * there, so a range built from [start, end) never begins at the tail of the
   * previous node — which would place the underline one node too early.
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
    // A trailing offset can land one past the end of an empty or exhausted node.
    return { node, offset: Math.min(Math.max(within, 0), node.data.length) };
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

  /** The flattened offset of a DOM position, or null when it is outside the map. */
  function offsetOf(map, node, offset) {
    const index = map.nodes.indexOf(node);
    if (index >= 0) return map.starts[index] + offset;
    // The point landed on an element rather than a text node — normal when a
    // click hits padding between nodes. Fall back to the nearest text node that
    // the element contains.
    for (let i = 0; i < map.nodes.length; i++) {
      if (node && typeof node.contains === 'function' && node.contains(map.nodes[i])) return map.starts[i];
    }
    return null;
  }

  /** The marked word covering an offset, if any. Marks never overlap. */
  function wordAtOffset(list, offset) {
    for (const mark of list) {
      // Inclusive of `end` so a click at the very end of a word still opens it.
      if (offset >= mark.start && offset <= mark.end) return mark;
    }
    return null;
  }

  /**
   * The marked word under a screen position.
   *
   * Two APIs do the same job under different names: `caretPositionFromPoint` is
   * the standard one, `caretRangeFromPoint` is WebKit's older spelling. Chromium
   * 120 — which is what Electron 28 is — has only the second, so that branch is
   * the one that actually runs here; both are kept because the first is what
   * every browser is moving to.
   */
  function hitTest(map, list, x, y) {
    let node = null;
    let offset = 0;
    if (typeof document.caretPositionFromPoint === 'function') {
      const position = document.caretPositionFromPoint(x, y);
      if (position) { node = position.offsetNode; offset = position.offset; }
    } else if (typeof document.caretRangeFromPoint === 'function') {
      const range = document.caretRangeFromPoint(x, y);
      if (range) { node = range.startContainer; offset = range.startOffset; }
    }
    if (!node) return null;
    const flat = offsetOf(map, node, offset);
    return flat === null ? null : wordAtOffset(list, flat);
  }

  /**
   * Re-point marks after an edit, without re-checking anything.
   *
   * Typing shifts every offset after the caret. Re-running the whole checker on
   * each keystroke would be both slow and visually noisy — the underlines would
   * flicker off and back on. Instead the marks that sit entirely before the edit
   * keep their offsets, the ones after are shifted by the length delta, and the
   * one being typed inside is dropped: the writer is fixing it, and telling them
   * it is still wrong mid-word is exactly the wrong moment.
   */
  function shiftMarks(list, editAt, delta) {
    const out = [];
    for (const mark of list) {
      if (mark.end < editAt) out.push(mark);
      else if (mark.start > editAt) out.push({ word: mark.word, start: mark.start + delta, end: mark.end + delta });
      // Straddling the edit: dropped on purpose, see above.
    }
    return out;
  }

  /** Is the Custom Highlight API usable here? Chromium 120 says yes. */
  function canHighlight() {
    return typeof CSS !== 'undefined' &&
           typeof CSS.highlights === 'object' && CSS.highlights !== null &&
           typeof Highlight === 'function';
  }

  // ==========================================================================
  // Loading
  // ==========================================================================

  async function loadDictionary() {
    if (ready) return;
    if (loadingPromise) return loadingPromise;
    loadingPromise = (async () => {
      try {
        const raw = await window.electron.dbGetSetting('spell_user_words', '');
        const stored = unwrapSetting(raw, '') || '';
        userWords = new Set(String(stored).split(',').map(s => s.trim()).filter(Boolean));

        const info = await window.electron.spellInit(Array.from(userWords));
        ready = !!(info && info.ready);
        if (ready) {
          console.log('[spellcheck] ready — ' + info.words + ' words, ' +
                      (info.corrections || 0) + ' corrections, ' + info.loadMs + ' ms');
        } else {
          console.error('[spellcheck] engine not ready:', info && info.reason);
        }
      } catch (e) {
        ready = false;
        console.error('[spellcheck] init failed:', e);
      } finally {
        loadingPromise = null;
      }
    })();
    return loadingPromise;
  }

  // ==========================================================================
  // Painting
  // ==========================================================================

  function clearHighlight() {
    if (canHighlight()) {
      try { CSS.highlights.delete(HIGHLIGHT_NAME); } catch (e) { /* nothing painted */ }
    }
    clearFallbackSpans();
  }

  /**
   * Fallback for a renderer without CSS.highlights. Electron 28 is Chromium
   * 120, which has it, so this never runs here — but leaving misspellings
   * unmarked would be worse than a span, and snapshotHtml() strips these so
   * they still cannot reach the saved note.
   */
  function paintFallbackSpans(map, list) {
    // Back to front, so the offsets of the marks still to come stay valid as
    // earlier text nodes are split.
    for (let i = list.length - 1; i >= 0; i--) {
      const range = rangeFor(map, list[i].start, list[i].end);
      if (!range) continue;
      const span = document.createElement('span');
      span.className = 'spell-error';
      try { range.surroundContents(span); } catch (e) { /* word straddles nodes */ }
    }
  }

  function clearFallbackSpans() {
    const editor = document.getElementById('notes-editor');
    if (!editor) return;
    const spans = editor.querySelectorAll('span.spell-error');
    if (!spans.length) return;
    spans.forEach(span => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
    });
    editor.normalize();
  }

  function paint() {
    if (!currentMap) return;
    if (!canHighlight()) {
      clearFallbackSpans();
      paintFallbackSpans(currentMap, marks);
      return;
    }
    if (!marks.length) {
      try { CSS.highlights.delete(HIGHLIGHT_NAME); } catch (e) {}
      return;
    }
    const highlight = new Highlight();
    for (const mark of marks) {
      const range = rangeFor(currentMap, mark.start, mark.end);
      if (range) highlight.add(range);
    }
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);
  }

  // ==========================================================================
  // Scanning
  // ==========================================================================

  window.notesRunSpellCheck = async function () {
    if (!window.S || !window.S.notes || !window.S.notes.spellCheckEnabled) return;
    await loadDictionary();
    if (!ready) return;

    const editor = document.getElementById('notes-editor');
    if (!editor) return;
    bindEditor(editor);

    const map = readTextMap(editor);
    let found;
    try {
      found = await window.electron.spellCheck(map.text);
    } catch (e) {
      console.error('[spellcheck] check failed:', e);
      return;
    }
    if (!Array.isArray(found)) return;

    // The writer may have typed while the check was in flight, which would make
    // every offset stale. Drop this result rather than underline the wrong
    // words — the input handler has already scheduled another pass.
    const now = readTextMap(editor);
    if (now.text !== map.text) return;

    currentMap = now;
    marks = found.filter(mark => !ignored.has(normalizeForLookup(mark.word)));
    paint();
  };

  window.notesClearSpellCheck = function () {
    marks = [];
    currentMap = null;
    clearHighlight();
    closePopup();
  };

  // ==========================================================================
  // Editor listeners — one set, however often the notes view is rebuilt
  // ==========================================================================

  function bindEditor(editor) {
    if (boundEditor === editor) return;
    boundEditor = editor;

    // mousedown, not click: contenteditable claims click for caret placement
    // before a handler on the editor would run.
    editor.addEventListener('mousedown', onEditorMouseDown);

    // Keep the existing underlines pointing at the right text while typing,
    // instead of letting them flicker off and back on at every scan.
    editor.addEventListener('input', () => {
      if (!currentMap || !marks.length) return;
      const next = readTextMap(editor);
      const delta = next.text.length - currentMap.text.length;
      const selection = window.getSelection();
      let caret = null;
      if (selection && selection.rangeCount > 0) {
        caret = offsetOf(next, selection.focusNode, selection.focusOffset);
      }
      if (caret === null) { marks = []; currentMap = next; clearHighlight(); return; }
      // An insertion of `delta` characters ENDS at the caret, so it began that
      // many characters earlier; a deletion happened at the caret itself.
      const editAt = delta > 0 ? caret - delta : caret;
      marks = shiftMarks(marks, editAt, delta);
      currentMap = next;
      paint();
    });
  }

  function onEditorMouseDown(event) {
    if (!marks.length || !currentMap) return;
    const mark = hitTest(currentMap, marks, event.clientX, event.clientY);
    // No mark under the pointer: do nothing at all, and in particular do NOT
    // preventDefault — the caret must land normally or the editor is unusable.
    if (!mark) return;
    event.preventDefault();
    event.stopPropagation();
    openPopup(mark);
  }

  // ==========================================================================
  // Popup — same markup, classes, strings and RTL placement as before
  // ==========================================================================

  let activePopup = null;
  let activeOutsideHandler = null;

  function closePopup() {
    if (activePopup && activePopup.parentNode) activePopup.parentNode.removeChild(activePopup);
    activePopup = null;
    if (activeOutsideHandler) {
      document.removeEventListener('mousedown', activeOutsideHandler, true);
      activeOutsideHandler = null;
    }
  }

  async function openPopup(mark) {
    closePopup();
    const word = mark.word;

    let suggestions = [];
    try {
      suggestions = await window.electron.spellSuggest(word);
    } catch (e) {
      console.error('[spellcheck] suggest failed:', e);
    }
    if (!Array.isArray(suggestions)) suggestions = [];

    const popup = document.createElement('div');
    popup.className = 'spell-popup';
    popup.setAttribute('dir', 'rtl');

    let html = `<div class="spell-popup-header">«${escHtml(word)}» ئۈچۈن تەۋسىيە:</div>`;
    if (suggestions.length) {
      for (const sug of suggestions) {
        html += `<div class="spell-popup-item" data-correction="${escAttr(sug)}">${escHtml(sug)}</div>`;
      }
    } else {
      html += `<div class="spell-popup-empty">تەۋسىيە تېپىلمىدى</div>`;
    }
    html += `<div class="spell-popup-item spell-popup-ignore" data-action="ignore">بۇ سۆزنى ئاتلاش</div>`;
    html += `<div class="spell-popup-item spell-popup-addword" data-action="addword">لۇغەتكە قوشۇش</div>`;
    popup.innerHTML = html;

    // Position: fixed, anchored to the bottom-right of the word for RTL. The
    // word has no element of its own any more, so the rectangle comes from its
    // Range instead of from a span.
    const range = rangeFor(currentMap, mark.start, mark.end);
    const rect = range ? range.getBoundingClientRect() : { bottom: 0, right: window.innerWidth };
    popup.style.position = 'fixed';
    popup.style.top = (rect.bottom + 4) + 'px';
    popup.style.right = Math.max(8, window.innerWidth - rect.right) + 'px';
    document.body.appendChild(popup);
    activePopup = popup;

    popup.addEventListener('mousedown', ev => ev.stopPropagation());

    popup.querySelectorAll('.spell-popup-item').forEach(item => {
      item.addEventListener('mousedown', async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const action = item.getAttribute('data-action');
        const correction = item.getAttribute('data-correction');

        if (correction) applyCorrection(mark, correction);
        else if (action === 'ignore') ignoreWord(word);
        else if (action === 'addword') await addToDictionary(word);

        closePopup();
      });
    });

    activeOutsideHandler = function (ev) {
      if (!popup.contains(ev.target)) closePopup();
    };
    setTimeout(() => {
      if (activeOutsideHandler) document.addEventListener('mousedown', activeOutsideHandler, true);
    }, 10);
  }

  /**
   * Replace the marked word with the chosen correction.
   *
   * Through the selection and execCommand rather than by writing to the DOM,
   * because that is what keeps the browser's own undo stack intact: Ctrl+Z now
   * undoes a spelling fix, which swapping the text of a span never allowed.
   */
  function applyCorrection(mark, correction) {
    const range = rangeFor(currentMap, mark.start, mark.end);
    if (!range) return;
    const editor = document.getElementById('notes-editor');
    if (editor) editor.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    document.execCommand('insertText', false, correction);
    if (typeof window.notesMarkDirty === 'function') window.notesMarkDirty();
    rescan();
  }

  /** Skip this word for the rest of the session. Deliberately not persisted. */
  function ignoreWord(word) {
    ignored.add(normalizeForLookup(word));
    dropWord(word);
  }

  /** Add to the user's own dictionary — persisted, and told to the engine. */
  async function addToDictionary(word) {
    const normalized = normalizeForLookup(word);
    if (!normalized) return;
    userWords.add(normalized);
    try {
      await window.electron.dbSetSetting('spell_user_words', Array.from(userWords).join(','));
    } catch (e) { /* persistence is best-effort */ }
    try {
      await window.electron.spellPersonal(Array.from(userWords));
    } catch (e) { /* the next spellInit will carry it over anyway */ }
    dropWord(word);
  }

  /** Un-underline every occurrence of a word without a full re-check. */
  function dropWord(word) {
    const normalized = normalizeForLookup(word);
    marks = marks.filter(mark => normalizeForLookup(mark.word) !== normalized);
    paint();
  }

  function rescan() {
    if (typeof window.notesRunSpellCheck === 'function') {
      setTimeout(() => window.notesRunSpellCheck(), 0);
    }
  }

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function escAttr(s) { return escHtml(s); }

  // ==========================================================================
  // Public surface — unchanged for notes.js, which calls isReady() only
  // ==========================================================================

  /** Synchronous on purpose: notes.js checks it before showing a toast. */
  function isReady() { return ready; }

  /** Now async — the answer comes from the main process. */
  async function isCorrect(word) {
    await loadDictionary();
    if (!ready) return true;
    const found = await window.electron.spellCheck(String(word || ''));
    return !(Array.isArray(found) && found.length > 0);
  }

  /** Now async — the answer comes from the main process. */
  async function getSuggestions(word) {
    await loadDictionary();
    if (!ready) return [];
    const list = await window.electron.spellSuggest(String(word || ''));
    return Array.isArray(list) ? list : [];
  }

  window.SpellCheck = { loadDictionary, isCorrect, getSuggestions, isReady };
})();
