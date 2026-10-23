// ============================================================================
// Stand-ins for everything src/index.html normally provides to the notebook.
//
// Loaded BEFORE the real renderer files, so notes.js and spellcheck.js find
// window.electron, window.S, icon() and toast() exactly where they expect
// them. Nothing here is a copy of app code: the app's own files are loaded
// unchanged, and these are only the edges around them.
//
// The fake database is in memory and really stores what it is told to store,
// so re-opening a note returns what was saved — the behaviour the save tests
// depend on. FAKE.failSave makes it refuse, which is the other half.
// ============================================================================

(function () {
  'use strict';

  // ---------------------------------------------------------------- recorders
  const FAKE = {
    notes: {},              // id -> { id, title, content_html, content_text }
    settings: {},           // the settings table
    saves: [],              // every accepted notesUpdate, in order
    calls: [],              // list and trash IPC calls, in order
    versionCalls: [],       // every notesVersionKeep, in order
    versionRows: [],        // what notesVersionList / notesVersionGet answer
    dirtyReports: [],       // what the renderer told main about unsaved writing
    flushAnswers: [],       // what it answered to an app-flush-request
    flushRequest: null,     // the listener the renderer registered for one
    personal: [],           // the words handed to spellPersonal
    exports: [],            // the old exportAsDocx calls (innerText only)
    noteExports: [],        // export-note calls: { format, payload }
    good: new Set(),        // words the fake engine accepts
    suggest: [],            // what spellSuggest answers
    failSave: false,        // make the database refuse every write
    lastChecked: '',        // the exact string the engine last received
    forceMarks: null,       // see spellCheck below
    validateWord: null,     // override the one-word check
    ngramWords: [],         // the words the fake n-gram matcher "finds"
    search: null,           // what dbSearch / dbGetAllSnippets / quranSearch answer
    nextId: 3
  };
  window.FAKE = FAKE;

  // Arabic script, the way the engine's own WORD_PATTERN reads it. A line
  // separator is NOT part of a word — which is the whole point of the
  // spell-enter tests.
  const WORD = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]+/g;

  function freshNotesState() {
    return {
      docs: [], curDoc: null, dirty: false, matches: new Map(),
      rightTab: 'quran', quickSura: null, quickAya: null, ayaMode: 'both',
      refsFilter: null
    };
  }

  // ----------------------------------------------------------- index.html-isms
  window.icon = function (name, extra) {
    return '<svg class="ic ' + (extra || '') + '" aria-hidden="true"><use href="#i-' +
           (name || 'book') + '"></use></svg>';
  };

  window.TOASTS = [];
  window.toast = function (msg, type, opts) {
    window.TOASTS.push([msg, type || 'i', opts || null]);
    const tc = document.getElementById('toast');
    if (!tc) return;
    const tk = document.createElement('div');
    tk.className = 'tk ' + (type || 'i');
    tk.textContent = msg;
    tc.appendChild(tk);
  };

  window.S = {
    books: [{ id: 5, title: 'سىناق كىتابى' }],
    mode: 'notes',
    quran: { suras: [], curSura: 1, curAya: 1, searchResults: null, searchQuery: '' },
    notes: freshNotesState()
  };

  // -------------------------------------------------------------- fake preload
  function setting(key, def) {
    const has = Object.prototype.hasOwnProperty.call(FAKE.settings, key);
    return { success: true, value: has ? FAKE.settings[key] : def };
  }

  function docRow(d) {
    return {
      id: d.id,
      title: d.title,
      created_at: d.created_at || '2026-10-01 09:00:00',
      updated_at: d.updated_at || '2026-10-22 09:00:00',
      deleted_at: d.deleted_at || null,
      pinned: d.pinned ? 1 : 0,
      size: (d.content_text || '').length,
      preview: String(d.content_text || '').replace(/\s+/g, ' ').trim().slice(0, 120)
    };
  }

  /** The list: not the trash. Order is the renderer's business. */
  function docList() {
    return Object.keys(FAKE.notes).map(function (id) { return FAKE.notes[id]; })
      .filter(function (d) { return !d.deleted_at; })
      .map(docRow);
  }

  window.electron = {
    dbGetSetting: async function (key, def) { return setting(key, def); },
    dbSetSetting: async function (key, value) { FAKE.settings[key] = value; return { success: true }; },

    notesGetAll: async function () { return { success: true, docs: docList() }; },
    notesGet: async function (id) {
      const d = FAKE.notes[id];
      if (!d) return { success: false, error: 'not found' };
      // A copy: the renderer owns curDoc and mutates it.
      return {
        success: true,
        doc: { id: d.id, title: d.title, content_html: d.content_html, content_text: d.content_text,
               deleted_at: d.deleted_at || null, pinned: d.pinned ? 1 : 0 }
      };
    },
    notesUpdate: async function (id, title, html, text) {
      if (FAKE.failSave) return { success: false, error: 'disk' };
      const d = FAKE.notes[id];
      if (!d) return { success: false, error: 'not found' };
      if (d.deleted_at) return { success: false, error: 'in the trash' };
      d.title = title;
      d.content_html = html;
      d.content_text = text;
      FAKE.saves.push({ id: id, title: title, html: html, text: text });
      return { success: true };
    },
    notesCreate: async function (title) {
      const id = FAKE.nextId++;
      FAKE.notes[id] = { id: id, title: title || 'يېڭى خاتىرە', content_html: '<p><br></p>', content_text: '' };
      return { success: true, id: id };
    },
    // The trash (W2): delete moves a note there; only the trash deletes for good.
    notesDelete: async function (id) {
      FAKE.calls.push(['notesDelete', id]);
      const d = FAKE.notes[id];
      if (!d || d.deleted_at) return { success: false };
      d.deleted_at = '2026-10-22T10:00:00.000Z';
      return { success: true };
    },
    notesRestore: async function (id) {
      FAKE.calls.push(['notesRestore', id]);
      const d = FAKE.notes[id];
      if (!d || !d.deleted_at) return { success: false };
      d.deleted_at = null;
      return { success: true };
    },
    notesTrashList: async function () {
      return { success: true, docs: Object.keys(FAKE.notes).map(function (id) { return FAKE.notes[id]; })
        .filter(function (d) { return d.deleted_at; }).map(docRow) };
    },
    notesDeleteForever: async function (id) {
      FAKE.calls.push(['notesDeleteForever', id]);
      const d = FAKE.notes[id];
      if (!d || !d.deleted_at) return { success: false };
      delete FAKE.notes[id];
      return { success: true };
    },
    notesEmptyTrash: async function () {
      FAKE.calls.push(['notesEmptyTrash']);
      let removed = 0;
      Object.keys(FAKE.notes).forEach(function (id) {
        if (FAKE.notes[id].deleted_at) { delete FAKE.notes[id]; removed++; }
      });
      return { success: true, removed: removed };
    },
    notesSetPinned: async function (id, pinned) {
      const d = FAKE.notes[id];
      if (!d) return { success: false };
      d.pinned = !!pinned;
      return { success: true };
    },
    notesSearch: async function (query) {
      FAKE.calls.push(['notesSearch', query]);
      const q = String(query || '').trim().toLowerCase();
      if (q.length < 2 || q.length > 100) return { success: true, ok: false, notes: [] };
      return { success: true, ok: true, notes: docList().filter(function (d) {
        const full = FAKE.notes[d.id];
        return (full.title || '').toLowerCase().indexOf(q) !== -1 || (full.content_text || '').toLowerCase().indexOf(q) !== -1;
      }) };
    },
    notesDiscardEmpty: async function (id) {
      FAKE.calls.push(['notesDiscardEmpty', id]);
      const d = FAKE.notes[id];
      if (!d) return { success: true, removed: false };
      const title = String(d.title || '').trim();
      if ((title && title !== 'يېڭى خاتىرە') || String(d.content_text || '').trim()) return { success: true, removed: false };
      delete FAKE.notes[id];
      return { success: true, removed: true };
    },

    // Earlier versions (W1). The rules live in the main process and are tested
    // there; here every keep is recorded, and FAKE.versionRows is the store.
    notesVersionKeep: async function (noteId, reason, title, html, text) {
      FAKE.versionCalls.push({ noteId: noteId, reason: reason, title: title, html: html, text: text });
      return { success: true, outcome: 'kept' };
    },
    notesVersionList: async function (noteId) {
      return {
        success: true,
        versions: FAKE.versionRows.filter(function (v) { return v.note_id === noteId; }).map(function (v) {
          return { id: v.id, note_id: v.note_id, reason: v.reason, title: v.title,
                   created_at: v.created_at, first_line: v.first_line, chars: v.chars };
        })
      };
    },
    notesVersionGet: async function (id) {
      const v = FAKE.versionRows.find(function (r) { return r.id === id; });
      return v ? { success: true, version: v } : { success: false, error: 'not found' };
    },

    // The close-the-window handshake. FAKE.dirtyReports records what the
    // renderer told the main process; FAKE.flushRequest fires the request the
    // main process would send on close.
    notesDirty: function (dirty) { FAKE.dirtyReports.push(!!dirty); },
    onAppFlushRequest: function (callback) { FAKE.flushRequest = callback; },
    appFlushDone: function (ok) { FAKE.flushAnswers.push(!!ok); },

    spellInit: async function (words) {
      FAKE.personal = (words || []).slice();
      return { ready: true, words: FAKE.good.size, loadMs: 1 };
    },
    /**
     * The engine's contract: it receives the WHOLE flattened text and answers
     * with offsets into that same string.
     *
     * FAKE.forceMarks makes it answer with offsets of our choosing, text or no
     * text. That is not a convenience — it is the case the renderer has to
     * survive: a mark whose range no longer holds the word (a stale map, an
     * engine that disagrees about word boundaries) must change nothing.
     */
    spellCheck: async function (text) {
      FAKE.lastChecked = text;
      if (FAKE.forceMarks) {
        return FAKE.forceMarks.map(function (m) {
          return { word: m.word, start: m.start, end: m.end };
        });
      }
      const out = [];
      let m;
      WORD.lastIndex = 0;
      while ((m = WORD.exec(text))) {
        if (!FAKE.good.has(m[0])) out.push({ word: m[0], start: m.index, end: m.index + m[0].length });
      }
      return out;
    },
    spellSuggest: async function () { return FAKE.suggest.slice(); },
    // The personal-dictionary panel (W8): the rules are tested in the main suite.
    spellGlued: async function (words) {
      return { success: true, glued: (words || []).filter(function (w) { return FAKE.glued.indexOf(w) !== -1; }) };
    },
    spellDictionaryExport: async function (words) {
      FAKE.calls.push(['spellDictionaryExport', (words || []).slice()]);
      return { success: true, name: 'bilim-hezinisi-lughet.json' };
    },
    spellDictionaryImport: async function (existing) {
      FAKE.calls.push(['spellDictionaryImport', (existing || []).slice()]);
      return FAKE.importAnswer || { success: false, canceled: true };
    },
    spellPersonal: async function (words) { FAKE.personal = (words || []).slice(); return { ok: true }; },
    /**
     * One word only, by the engine's own rules. The real check is in the main
     * process (spell-validate-word); the stand-in answers the same shape, and
     * FAKE.validateWord lets a test make it refuse.
     */
    spellValidateWord: async function (word) {
      if (FAKE.validateWord) return FAKE.validateWord(word);
      const text = String(word || '').trim();
      if (text.length < 2 || text.length > 64) return { ok: false, reason: 'length' };
      if (/\s/.test(text)) return { ok: false, reason: 'not-one-word' };
      return { ok: true, word: text };
    },

    quranGetAya: async function (sura, aya) {
      return {
        success: true,
        aya: { sura: sura, aya: aya, text_ar: 'بِسْمِ ٱللَّهِ', text_ug: 'ئاللاھنىڭ ئىسمى بىلەن' }
      };
    },
    // The «مەنبە» search box (W12): FAKE.search holds what the library and
    // the Qur'an "find"; every call is recorded.
    dbSearch: async function (query, category, opts) {
      FAKE.calls.push(['dbSearch', query, category, opts || null]);
      return { success: true, results: FAKE.search.books.slice() };
    },
    dbGetAllSnippets: async function (bookId, query) {
      FAKE.calls.push(['dbGetAllSnippets', bookId, query]);
      return { success: true, snippets: (FAKE.search.snippets[bookId] || []).slice() };
    },
    quranSearch: async function (query, opts) {
      FAKE.calls.push(['quranSearch', query, opts || null]);
      return { success: true, results: FAKE.search.ayas.slice() };
    },
    exportNote: async function (format, payload) {
      FAKE.noteExports.push({ format: format, payload: payload });
      return { success: true, name: 'خاتىرە.' + format };
    },
    exportAsDocx: async function (title, author, content) {
      FAKE.exports.push({ title: title, author: author, content: content });
      return { success: true };
    },
    ocrRecognize: async function () { return { success: true, pages: ['OCR'] }; }
  };

  // ---------------------------------------------------------- fake n-gram index
  window.NGram = {
    MIN_WORD_LEN: 2,
    extractCandidates: function () { return FAKE.ngramWords.slice(); },
    findReferences: async function (candidates) {
      const map = new Map();
      for (const word of candidates) {
        map.set(word, [{ bookId: 5, snippets: [{ snip: word, pos: 1 }] }]);
      }
      return map;
    }
  };

  // ------------------------------------------------------------------ fixtures
  window.BH = window.BH || {};

  /** A fresh note, a fresh editor and fresh recorders. Every test starts here. */
  window.BH.fresh = async function (opts) {
    opts = opts || {};

    // Stop whatever the previous test left running. The debounced spell pass is
    // the one that would otherwise repaint in the middle of the next test.
    try { clearTimeout(window.S.notes._spellTimer); } catch (e) {}
    if (typeof window.notesClearSpellCheck === 'function') window.notesClearSpellCheck();
    try { if (typeof CSS !== 'undefined' && CSS.highlights) CSS.highlights.clear(); } catch (e) {}
    window.S.notes.dirty = false;
    window.S.notes.curDoc = null;

    FAKE.notes = opts.notes || {
      1: { id: 1, title: opts.title || 'سىناق', content_html: opts.html || '<p><br></p>', content_text: '' },
      2: {
        id: 2, title: 'ئىككىنچى خاتىرە',
        content_html: '<p>ئىككىنچى خاتىرىنىڭ مەزمۇنى</p>',
        content_text: 'ئىككىنچى خاتىرىنىڭ مەزمۇنى'
      }
    };
    FAKE.nextId = 100;
    FAKE.calls = [];
    FAKE.settings = Object.assign({
      notes_spell_check: opts.spell ? 'on' : 'off',
      notes_ref_scan: opts.refscan ? 'on' : 'off'
    }, opts.settings || {});
    FAKE.saves = [];
    FAKE.glued = opts.glued || [];
    FAKE.importAnswer = null;
    FAKE.versionCalls = [];
    FAKE.versionRows = opts.versionRows || [];
    FAKE.dirtyReports = [];
    FAKE.flushAnswers = [];
    FAKE.personal = [];
    FAKE.exports = [];
    FAKE.noteExports = [];
    FAKE.good = new Set(opts.good || []);
    FAKE.suggest = opts.suggest || ['تۈزىتىلگەن'];
    FAKE.failSave = false;
    FAKE.lastChecked = '';
    FAKE.forceMarks = opts.forceMarks || null;
    FAKE.validateWord = opts.validateWord || null;
    FAKE.ngramWords = opts.ngramWords || [];
    FAKE.search = opts.search || { books: [], snippets: {}, ayas: [] };
    window.TOASTS = [];

    window.S.notes = freshNotesState();
    await window.notesOpen(opts.id || 1);
    await new Promise(function (r) { setTimeout(r, 20); });
    return document.getElementById('notes-editor');
  };

  /**
   * What setMode() does when the writer leaves the notebook, in that order.
   * The flush hook is called when it exists — Phase 1 adds it to setMode, and
   * from then on this helper and the app agree.
   */
  window.BH.leaveNotebook = async function () {
    let flushed = null;
    if (typeof window.notesFlush === 'function') flushed = await window.notesFlush();
    if (typeof window.notesDisarmFormatPainter === 'function') window.notesDisarmFormatPainter();
    const main = document.getElementById('main');
    if (main) main.innerHTML = '<div id="other-view">قۇرئان</div>';
    return flushed;
  };

  /** ...and what it does on the way back in. */
  window.BH.returnToNotebook = async function () {
    await window.renderNotesView();
    await new Promise(function (r) { setTimeout(r, 20); });
  };

  /** Mount the sidebar once, as renderSide() does in index.html. */
  window.BH.boot = function () {
    const side = document.getElementById('side');
    if (side && typeof window.renderNotesSidebar === 'function') {
      side.innerHTML = window.renderNotesSidebar();
    }
  };
})();
