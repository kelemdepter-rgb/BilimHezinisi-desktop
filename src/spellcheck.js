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
// hit-testing the pointer position back into the text — see hitTest in
// src/textmap.js.
//
// WHERE THE WORDS ARE. src/textmap.js, shared with find & replace and the
// reference scanner. This file used to hold its own copy of the offset map,
// and that copy concatenated text nodes with nothing between them — so the
// last word of one paragraph and the first of the next arrived at the engine
// as one word, and accepting a suggestion for it deleted a word out of the
// next paragraph (the owner's bug 2, audit §2).
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
  // «بۇ خاتىرىدە سەل قارا» (W9): words accepted in ONE note, kept in the
  // settings table under spell_ignore_note_<id>. A name, a quoted spelling or a
  // dialect form is often right in one note and a real mistake anywhere else.
  const MAX_IGNORED_PER_NOTE = 500;
  let noteIgnored = new Set();
  let noteIgnoredId = null;       // the note noteIgnored belongs to

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
  // Positions — src/textmap.js holds all of this now
  //
  // The map, the offsets, the hit test and the same-block check are shared with
  // find & replace and the reference scanner, so the three can never disagree
  // about where a word is or where a line ends.
  // ==========================================================================

  const TM = window.TextMap;
  if (!TM) {
    console.error('[spellcheck] src/textmap.js must be loaded before this file');
    return;
  }
  const readTextMap = TM.readTextMap;
  const rangeFor = TM.rangeFor;
  const offsetOf = TM.offsetOf;
  const hitTest = TM.hitTest;
  const canHighlight = TM.canHighlight;

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
    TM.clearHighlight(HIGHLIGHT_NAME);
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
    const ranges = [];
    for (const mark of marks) {
      const range = rangeFor(currentMap, mark.start, mark.end);
      if (range) ranges.push(range);
    }
    TM.setHighlight(HIGHLIGHT_NAME, ranges);
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

    // The map holds EVERYTHING, quotations included, so the words on either
    // side of a verse are not glued together. What the ENGINE sees has the
    // quoted spans blanked out character for character, so every offset it
    // answers with still addresses the same text (maskSpans in textmap.js).
    // Dropping those nodes from the map instead — what this file used to do —
    // is what glued the words on either side of a quotation.
    await loadNoteIgnored();
    const map = readTextMap(editor);
    const quoted = TM.quotedSpans(map, editor);
    let found;
    try {
      found = await window.electron.spellCheck(TM.maskSpans(map.text, quoted));
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
    marks = found.filter(mark =>
      !ignored.has(normalizeForLookup(mark.word)) &&
      !noteIgnored.has(normalizeForLookup(mark.word)) &&
      !TM.overlapsAny(quoted, mark.start, mark.end));
    paint();
  };

  /** The words ignored in the open note — read once per note. */
  async function loadNoteIgnored() {
    const doc = window.S && window.S.notes && window.S.notes.curDoc;
    const id = doc ? doc.id : null;
    if (id === noteIgnoredId) return;
    noteIgnoredId = id;
    noteIgnored = new Set();
    if (id == null) return;
    try {
      const raw = unwrapSetting(await window.electron.dbGetSetting('spell_ignore_note_' + id, ''), '');
      const list = raw ? JSON.parse(raw) : [];
      if (Array.isArray(list)) {
        list.filter(w => typeof w === 'string' && w).slice(0, MAX_IGNORED_PER_NOTE)
          .forEach(w => noteIgnored.add(normalizeForLookup(w)));
      }
    } catch (e) { /* an unreadable list is an empty one */ }
    // Another note may have been opened while this was read.
    const now = window.S && window.S.notes && window.S.notes.curDoc;
    if ((now ? now.id : null) !== id) { noteIgnoredId = null; noteIgnored = new Set(); }
  }

  // ==========================================================================
  // One error at a time (W7)
  // ==========================================================================

  /**
   * «كېيىنكى خاتالىق» / «ئالدىنقى», and F7: the first error after the caret
   * (before it, going back), wrapping round at the ends. The word is scrolled
   * into view, the caret put just after it — so the next step goes on from
   * there — and its suggestions opened.
   */
  window.notesSpellStep = async function (direction) {
    const editor = document.getElementById('notes-editor');
    if (!editor) return;
    if (!window.S || !window.S.notes || !window.S.notes.spellCheckEnabled) {
      if (typeof window.toast === 'function') window.toast('ئاۋۋال «ئىملانى تەكشۈرۈش» نى ئېچىڭ', 'i');
      return;
    }
    if (!currentMap || !marks.length) await window.notesRunSpellCheck();
    if (!marks.length || !currentMap) {
      closePopup();
      if (typeof window.toast === 'function') window.toast('ئىملا خاتالىقى قالمىدى', 's');
      return;
    }

    const sel = window.getSelection();
    let caret = 0;
    if (sel && sel.rangeCount && editor.contains(sel.focusNode)) {
      caret = TM.offsetAtPoint(currentMap, sel.focusNode, sel.focusOffset);
    }
    const ordered = marks.slice().sort((a, b) => a.start - b.start);
    const target = direction < 0
      ? (ordered.slice().reverse().find(m => m.end < caret) || ordered[ordered.length - 1])
      : (ordered.find(m => m.start >= caret) || ordered[0]);

    const range = rangeFor(currentMap, target.start, target.end);
    if (!range) return;
    editor.focus();
    const after = range.cloneRange();
    after.collapse(false);
    sel.removeAllRanges();
    sel.addRange(after);
    scrollIntoEditor(editor, range);
    await openPopup(target);
  };

  function scrollIntoEditor(editor, range) {
    try {
      const r = range.getBoundingClientRect();
      const box = editor.getBoundingClientRect();
      if (r.top >= box.top && r.bottom <= box.bottom) return;
      editor.scrollTop += (r.top - box.top) - (box.height / 2) + (r.height / 2);
    } catch (e) { /* a detached range */ }
  }

  window.notesClearSpellCheck = function () {
    marks = [];
    currentMap = null;
    noteIgnoredId = null;          // read again on the next check
    noteIgnored = new Set();
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
    html += `<div class="spell-popup-item spell-popup-ignore" data-action="ignore-note">بۇ خاتىرىدە سەل قارا</div>`;
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
        else if (action === 'ignore-note') await ignoreInNote(word);
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
   *
   * The Range comes from a FRESH map through wordRange(), which refuses unless
   * the note still holds exactly that word there and both ends sit in the same
   * block. Without it, a mark that spanned a paragraph break was replaced
   * wholesale and took the next paragraph's first word with it. On refusal
   * nothing is written at all: the underlines are dropped and the note is
   * checked again.
   */
  function applyCorrection(mark, correction) {
    const editor = document.getElementById('notes-editor');
    if (!editor) return;
    const range = TM.wordRange(readTextMap(editor), mark);
    if (!range) {
      marks = [];
      currentMap = null;
      clearHighlight();
      rescan();
      return;
    }
    editor.focus();
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

  /** Accept this word in the open note only — stored with the note (W9). */
  async function ignoreInNote(word) {
    const doc = window.S && window.S.notes && window.S.notes.curDoc;
    const normalized = normalizeForLookup(word);
    if (!doc || !normalized) return;
    await loadNoteIgnored();
    if (!noteIgnored.has(normalized)) {
      if (noteIgnored.size >= MAX_IGNORED_PER_NOTE) {
        if (typeof window.toast === 'function') window.toast('بۇ خاتىرىدە سەل قارىلىدىغان سۆز بەك كۆپ (500)', 'e');
        return;
      }
      noteIgnored.add(normalized);
      try {
        await window.electron.dbSetSetting('spell_ignore_note_' + doc.id, JSON.stringify(Array.from(noteIgnored)));
      } catch (e) { /* it still holds for this session */ }
    }
    dropWord(word);
  }

  /**
   * Add to the writer's own dictionary — persisted, and told to the engine.
   *
   * Only something that is a single word by the engine's OWN rules gets in.
   * Two words glued together by the old text map could be added this way, and
   * once in the personal dictionary they made a real misspelling look correct
   * for ever. The check runs in the main process, against the same
   * WORD_PATTERN and isCheckable the checker tokenizes with, so this file
   * never holds a second copy of the word rules.
   */
  async function addToDictionary(word) {
    const normalized = normalizeForLookup(word);
    if (!normalized) return;

    let answer = null;
    try {
      answer = await window.electron.spellValidateWord(normalized);
    } catch (e) {
      console.error('[spellcheck] word validation failed:', e);
    }
    if (!answer || !answer.ok) {
      const reason = answer && answer.reason;
      if (typeof window.toast === 'function') {
        window.toast(reason === 'length'
          ? 'لۇغەتكە 2–64 ھەرپلىك بىر سۆزلا قوشۇلىدۇ'
          : 'بۇ بىر سۆز ئەمەس — لۇغەتكە قوشۇلمىدى', 'e');
      }
      return;
    }

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
