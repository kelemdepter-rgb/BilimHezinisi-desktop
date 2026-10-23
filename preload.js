const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // Database operations (new SQLite-based)
  dbGetBooks: () => ipcRenderer.invoke('db-get-books'),
  dbGetBooksByCategory: (cat) => ipcRenderer.invoke('db-get-books-by-category', cat),
  dbAddBook: (bookData) => ipcRenderer.invoke('db-add-book', bookData),
  dbAddBooksBatch: (booksArray) => ipcRenderer.invoke('db-add-books-batch', booksArray),
  dbUpdateBook: (id, data) => ipcRenderer.invoke('db-update-book', id, data),
  dbDeleteBook: (id) => ipcRenderer.invoke('db-delete-book', id),
  dbGetContent: (bookId) => ipcRenderer.invoke('db-get-content', bookId),
  dbSaveContent: (bookId, content) => ipcRenderer.invoke('db-save-content', bookId, content),
  dbSearch: (query, category, opts) => ipcRenderer.invoke('db-search', query, category, opts),
  dbGetAllSnippets: (bookId, query) => ipcRenderer.invoke('db-get-all-snippets', bookId, query),
  dbSearchHistory: () => ipcRenderer.invoke('db-search-history'),
  dbGetCategories: () => ipcRenderer.invoke('db-get-categories'),
  dbAddCategory: (name, parentId) => ipcRenderer.invoke('db-add-category', name, parentId),
  dbRenameCategory: (oldName, newName) => ipcRenderer.invoke('db-rename-category', oldName, newName),
  dbDeleteCategory: (name) => ipcRenderer.invoke('db-delete-category', name),
  dbGetBookmarks: (bookId) => ipcRenderer.invoke('db-get-bookmarks', bookId),
  dbAddBookmark: (bookId, name, position) => ipcRenderer.invoke('db-add-bookmark', bookId, name, position),
  dbDeleteBookmark: (id) => ipcRenderer.invoke('db-delete-bookmark', id),
  dbGetNotes: (bookId) => ipcRenderer.invoke('db-get-notes', bookId),
  dbAddNote: (bookId, text, position) => ipcRenderer.invoke('db-add-note', bookId, text, position),
  dbDeleteNote: (id) => ipcRenderer.invoke('db-delete-note', id),
  dbGetProgress: (bookId) => ipcRenderer.invoke('db-get-progress', bookId),
  dbSaveProgress: (bookId, position, page, charOffset) => ipcRenderer.invoke('db-save-progress', bookId, position, page, charOffset),
  dbAddRecent: (bookId) => ipcRenderer.invoke('db-add-recent', bookId),
  dbGetRecent: () => ipcRenderer.invoke('db-get-recent'),
  dbGetSetting: (key, defaultVal) => ipcRenderer.invoke('db-get-setting', key, defaultVal),
  dbSetSetting: (key, value) => ipcRenderer.invoke('db-set-setting', key, value),
  dbGetStats: () => ipcRenderer.invoke('db-get-stats'),
  computeHash: (content) => ipcRenderer.invoke('compute-hash', content),

  // Legacy operations (kept for backward compatibility)
  loadLibrary: () => ipcRenderer.invoke('load-library'),
  saveLibrary: (data) => ipcRenderer.invoke('save-library', data),
  // Backup and restore — the files are handled in the main process (backup.js).
  backupInfo: () => ipcRenderer.invoke('backup-info'),
  backupNow: () => ipcRenderer.invoke('backup-now'),
  backupOpenFolder: () => ipcRenderer.invoke('backup-open-folder'),
  backupRestore: () => ipcRenderer.invoke('backup-restore'),
  saveBookContent: (id, content) => ipcRenderer.invoke('save-book-content', id, content),
  loadBookContent: (id) => ipcRenderer.invoke('load-book-content', id),

  // File operations
  openFile: () => ipcRenderer.invoke('open-file'),
  readTxt: (filePath) => ipcRenderer.invoke('read-txt', filePath),
  readPdfBuffer: (filePath) => ipcRenderer.invoke('read-pdf-buffer', filePath),
  readDocx: (filePath) => ipcRenderer.invoke('read-docx', filePath),
  readDoc: (filePath) => ipcRenderer.invoke('read-doc', filePath),
  readMd: (filePath) => ipcRenderer.invoke('read-md', filePath),
  readHtml: (filePath) => ipcRenderer.invoke('read-html', filePath),
  fetchUrlHtml: (url) => ipcRenderer.invoke('fetch-url-html', url),
  saveFileDialog: (name, content) => ipcRenderer.invoke('save-file-dialog', name, content),
  exportAsDocx: (title, author, content) => ipcRenderer.invoke('export-as-docx', title, author, content),
  exportAsPdf: (title, author, content) => ipcRenderer.invoke('export-as-pdf', title, author, content),
  // The notebook's export: format is docx | pdf | md | txt (see note-export.js).
  exportNote: (format, payload) => ipcRenderer.invoke('export-note', format, payload),
  openFolder: () => ipcRenderer.invoke('open-folder'),
  readFolder: (folderPath) => ipcRenderer.invoke('read-folder', folderPath),
  // Offline OCR (main process runs tesseract.js; renderer ships base64 PNGs).
  ocrRecognize: (images, langs) => ipcRenderer.invoke('ocr-recognize', { images, langs }),
  // Online Gemini OCR (main process only; gated on AI enabled + key).
  ocrGemini: (images, opts) => ipcRenderer.invoke('ocr-gemini', images, opts),
  ocrCancel: () => ipcRenderer.invoke('ocr-cancel'),
  onOcrProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('ocr-progress', handler);
    // Return an unsubscribe so callers can detach between OCR sessions.
    return () => ipcRenderer.removeListener('ocr-progress', handler);
  },
  getVersion: () => ipcRenderer.invoke('get-version'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  getContentSize: () => ipcRenderer.invoke('get-content-size'),
  cleanupOrphans: () => ipcRenderer.invoke('cleanup-orphans'),
  bulkExport: (category) => ipcRenderer.invoke('bulk-export', category),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action)),

  // Quran API
  quranGetSuras: () => ipcRenderer.invoke('quran-get-suras'),
  quranGetAyas: (n) => ipcRenderer.invoke('quran-get-ayas', n),
  quranGetAya: (sura, aya) => ipcRenderer.invoke('quran-get-aya', sura, aya),
  quranSearch: (q, opts) => ipcRenderer.invoke('quran-search', q, opts),
  quranLookupSura: (input) => ipcRenderer.invoke('quran-lookup-sura', input),
  // Notes API (new documents module)
  notesGetAll: () => ipcRenderer.invoke('notes-get-all'),
  notesGet: (id) => ipcRenderer.invoke('notes-get', id),
  notesCreate: (title) => ipcRenderer.invoke('notes-create', title),
  notesUpdate: (id, title, html, text) => ipcRenderer.invoke('notes-update', id, title, html, text),
  notesDelete: (id) => ipcRenderer.invoke('notes-delete', id),   // to the trash
  notesRestore: (id) => ipcRenderer.invoke('notes-restore', id),
  notesTrashList: () => ipcRenderer.invoke('notes-trash-list'),
  notesDeleteForever: (id) => ipcRenderer.invoke('notes-delete-forever', id),
  notesEmptyTrash: () => ipcRenderer.invoke('notes-empty-trash'),
  notesSetPinned: (id, pinned) => ipcRenderer.invoke('notes-set-pinned', id, pinned),
  notesSearch: (query) => ipcRenderer.invoke('notes-search', query),
  notesDiscardEmpty: (id) => ipcRenderer.invoke('notes-discard-empty', id),
  // Earlier versions of a note (W1): kept in the background, listed, read back.
  notesVersionKeep: (noteId, reason, title, html, text) => ipcRenderer.invoke('notes-version-keep', noteId, reason, title, html, text),
  notesVersionList: (noteId) => ipcRenderer.invoke('notes-version-list', noteId),
  notesVersionGet: (id) => ipcRenderer.invoke('notes-version-get', id),
  // Whether the notebook holds anything unsaved, and the handshake that lets
  // closing the window wait for the save — see mainWindow.on('close').
  notesDirty: (dirty) => ipcRenderer.send('notes-dirty', !!dirty),
  onAppFlushRequest: (callback) => ipcRenderer.on('app-flush-request', () => callback()),
  appFlushDone: (ok) => ipcRenderer.send('app-flush-done', !!ok),
  // Ngram API
  ngramFindWord: (word) => ipcRenderer.invoke('ngram-find-word', word),
  bookContentSnippet: (bookId, needle, max, ctx) => ipcRenderer.invoke('book-content-snippet', bookId, needle, max, ctx),
  bookContentSnippetBatch: (requests, max, ctx) => ipcRenderer.invoke('book-content-snippet-batch', requests, max, ctx),
  quranContentSnippet: (needle, max, ctx) => ipcRenderer.invoke('quran-content-snippet', needle, max, ctx),
  // Spell check — the engine lives in the main process (src/spellcheck/).
  // spellCheck takes the whole flattened text and returns the misspelled words
  // as offsets INTO THAT STRING, so the renderer never needs its own copy of
  // the tokenizer or the word rules.
  spellInit: (words) => ipcRenderer.invoke('spell-init', words),
  spellCheck: (text) => ipcRenderer.invoke('spell-check', text),
  spellSuggest: (word) => ipcRenderer.invoke('spell-suggest', word),
  spellPersonal: (words) => ipcRenderer.invoke('spell-personal', words),
  // Guards «لۇغەتكە قوشۇش»: one word only, by the engine's own rules.
  spellValidateWord: (word) => ipcRenderer.invoke('spell-validate-word', word),
  // The personal-dictionary panel: glued-word hints, export, import (W8).
  spellGlued: (words) => ipcRenderer.invoke('spell-glued', words),
  spellDictionaryExport: (words) => ipcRenderer.invoke('spell-dictionary-export', words),
  spellDictionaryImport: (existing) => ipcRenderer.invoke('spell-dictionary-import', existing),

  // AI (Gemini) — all network happens in the main process (see ai.js).
  // The real API key never crosses into the renderer; only a masked form.
  aiHasKey: () => ipcRenderer.invoke('ai-has-key'),
  aiGetKeyMasked: () => ipcRenderer.invoke('ai-get-key-masked'),
  aiSetKey: (key) => ipcRenderer.invoke('ai-set-key', key),
  aiGetModel: () => ipcRenderer.invoke('ai-get-model'),
  aiSetModel: (name) => ipcRenderer.invoke('ai-set-model', name),
  aiIsEnabled: () => ipcRenderer.invoke('ai-is-enabled'),
  aiSetEnabled: (on) => ipcRenderer.invoke('ai-set-enabled', on),
  aiGetUsage: () => ipcRenderer.invoke('ai-get-usage'),
  aiTest: () => ipcRenderer.invoke('ai-test'),
  aiAsk: (opts) => ipcRenderer.invoke('ai-ask', opts),
  aiCancel: (requestId) => ipcRenderer.invoke('ai-cancel', requestId)
});

// window.AIBridge — the IPC half of the mobile app's window.AI shape.
// contextBridge-exposed objects are frozen (non-writable, non-configurable),
// so the renderer cannot attach the pure helpers (detectType / typeLabel /
// MAX_CONTEXT_CHARS / example chips) onto this object directly. Instead,
// src/ai-client.js composes the final window.AI = bridge methods + pure
// helpers, giving ported mobile code the exact window.AI surface it expects.
// getApiKey deliberately returns the MASKED key — the real key lives only
// in the main process.
contextBridge.exposeInMainWorld('AIBridge', {
  hasApiKey: () => ipcRenderer.invoke('ai-has-key'),
  getApiKey: () => ipcRenderer.invoke('ai-get-key-masked'),
  setApiKey: (key) => ipcRenderer.invoke('ai-set-key', key),
  // Backup keys: masked array out, raw array in, plus a per-slot test
  // (0 = primary, 1..3 = backups). The real keys stay in the main process.
  getBackupKeys: () => ipcRenderer.invoke('ai-get-backup-keys'),
  setBackupKeys: (arr) => ipcRenderer.invoke('ai-set-backup-keys', arr),
  testKeySlot: (index) => ipcRenderer.invoke('ai-test-key-slot', index),
  testAllKeys: () => ipcRenderer.invoke('ai-test-all-keys'),
  // Which slot is serving requests / last worked (for the small indicator).
  getKeyStatus: () => ipcRenderer.invoke('ai-key-status'),
  getModel: () => ipcRenderer.invoke('ai-get-model'),
  setModel: (name) => ipcRenderer.invoke('ai-set-model', name),
  // Settings-dialog model load: performs the one-time retired-ID migration
  // and reports it back as { model, migratedFrom } so the dialog can say so.
  loadModelSettings: () => ipcRenderer.invoke('ai-load-model-settings'),
  ackModelMigration: () => ipcRenderer.invoke('ai-ack-model-migration'),
  isEnabled: () => ipcRenderer.invoke('ai-is-enabled'),
  setEnabled: (on) => ipcRenderer.invoke('ai-set-enabled', on),
  getTodayUsage: () => ipcRenderer.invoke('ai-get-usage'),
  test: () => ipcRenderer.invoke('ai-test'),
  ask: (opts) => ipcRenderer.invoke('ai-ask', opts),

  // Streaming ask with the mobile callback contract:
  //   onChunk(delta), onDone(fullText, model, usage), onError(resultObj)
  // Returns { abort } just like mobile. The requestId + per-request channels
  // ('ai-chunk-<id>' / 'ai-done-<id>' / 'ai-error-<id>') are wired here so
  // the renderer never needs raw ipcRenderer access.
  askStream: (opts, onChunk, onDone, onError, onReset) => {
    const requestId = 'ai' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const chunkCh = 'ai-chunk-' + requestId;
    const doneCh = 'ai-done-' + requestId;
    const errCh = 'ai-error-' + requestId;
    const resetCh = 'ai-reset-' + requestId;

    const onChunkWrap = (event, delta) => {
      try { if (onChunk) onChunk(delta); } catch (_) {}
    };
    // The main process failed over to another key AFTER text had already
    // been rendered: drop it and continue from textSoFar (usually '').
    // Splicing two half-answers together would produce nonsense.
    const onResetWrap = (event, textSoFar) => {
      try { if (onReset) onReset(String(textSoFar || '')); } catch (_) {}
    };
    const cleanup = () => {
      ipcRenderer.removeListener(chunkCh, onChunkWrap);
      ipcRenderer.removeListener(resetCh, onResetWrap);
      ipcRenderer.removeAllListeners(doneCh);
      ipcRenderer.removeAllListeners(errCh);
    };
    ipcRenderer.on(chunkCh, onChunkWrap);
    ipcRenderer.on(resetCh, onResetWrap);
    ipcRenderer.once(doneCh, (event, result) => {
      cleanup();
      try { if (onDone) onDone(result && result.text, result && result.model, result && result.usage, result || {}); } catch (_) {}
    });
    ipcRenderer.once(errCh, (event, err) => {
      cleanup();
      try { if (onError) onError(err); } catch (_) {}
    });

    ipcRenderer.invoke('ai-ask-stream', requestId, opts).then((res) => {
      // The handler refused to start (e.g. bad requestId) — surface it.
      if (res && res.ok === false) {
        cleanup();
        try { if (onError) onError(res); } catch (_) {}
      }
    }).catch((err) => {
      cleanup();
      try { if (onError) onError({ ok: false, error: String((err && err.message) || err) }); } catch (_) {}
    });

    return {
      // Abort fires no callback (mobile contract) — clean the per-request
      // listeners here so cancelled streams don't leave them registered.
      abort: () => {
        cleanup();
        ipcRenderer.invoke('ai-cancel', requestId).catch(() => {});
      }
    };
  },

  // Free-form notebook chat (Phase 4). Same callback contract + per-request
  // channels as askStream, but sends a `messages` array and hits
  // 'ai-chat-stream'. Cancellation reuses 'ai-cancel'.
  chatStream: (messages, onChunk, onDone, onError, onReset) => {
    const requestId = 'ch' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    const chunkCh = 'ai-chunk-' + requestId;
    const doneCh = 'ai-done-' + requestId;
    const errCh = 'ai-error-' + requestId;
    const resetCh = 'ai-reset-' + requestId;

    const onChunkWrap = (event, delta) => {
      try { if (onChunk) onChunk(delta); } catch (_) {}
    };
    // The main process failed over to another key AFTER text had already
    // been rendered: drop it and continue from textSoFar (usually '').
    // Splicing two half-answers together would produce nonsense.
    const onResetWrap = (event, textSoFar) => {
      try { if (onReset) onReset(String(textSoFar || '')); } catch (_) {}
    };
    const cleanup = () => {
      ipcRenderer.removeListener(chunkCh, onChunkWrap);
      ipcRenderer.removeListener(resetCh, onResetWrap);
      ipcRenderer.removeAllListeners(doneCh);
      ipcRenderer.removeAllListeners(errCh);
    };
    ipcRenderer.on(chunkCh, onChunkWrap);
    ipcRenderer.on(resetCh, onResetWrap);
    ipcRenderer.once(doneCh, (event, result) => {
      cleanup();
      try { if (onDone) onDone(result && result.text, result && result.model, result && result.usage, result || {}); } catch (_) {}
    });
    ipcRenderer.once(errCh, (event, err) => {
      cleanup();
      try { if (onError) onError(err); } catch (_) {}
    });

    ipcRenderer.invoke('ai-chat-stream', requestId, messages).then((res) => {
      if (res && res.ok === false) {
        cleanup();
        try { if (onError) onError(res); } catch (_) {}
      }
    }).catch((err) => {
      cleanup();
      try { if (onError) onError({ ok: false, error: String((err && err.message) || err) }); } catch (_) {}
    });

    return {
      abort: () => {
        cleanup();
        ipcRenderer.invoke('ai-cancel', requestId).catch(() => {});
      }
    };
  }
});
