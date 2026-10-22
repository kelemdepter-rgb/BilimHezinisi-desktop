// ============================================================================
// load-library / save-library — the renderer's whole-library round trip,
// made unable to delete anything by omission (K4).
//
// The renderer keeps the library in memory (S.books, S.bookmarks, …) and sends
// it back on every change. What used to make that dangerous:
//
//   - save-library synced the book list by DELETING every book that was not in
//     it, with its text, bookmarks, notes and reading position;
//   - load-library read its eight parts in one try block, so if any one of
//     them failed it returned `books: []` — and the next save, a theme change
//     or a page turn, deleted every book in the library.
//
// So, here:
//
//   - a book is deleted ONLY by db-delete-book. Syncing never deletes;
//   - each part is read on its own, and the parts that failed are reported
//     (loadErrors) instead of being replaced by empty values;
//   - a part that has never loaded in this session is never written back: what
//     the renderer holds for it is its own fallback, not the user's data;
//   - an empty book list is refused while the database holds books.
//
// Kept out of main.js so tests/main/library-safety.js can run it against the
// real database module on a throwaway directory.
// ============================================================================

'use strict';

/** Main-process memory of which parts have loaded at least once. */
function createState() {
  return { loaded: new Set() };
}

/**
 * Read the library for the renderer. Every part is read on its own; a part
 * that fails is left out and named in `loadErrors`.
 */
function loadLibrary(database, state, log) {
  const report = log || console;
  const out = { loadErrors: [] };
  const read = (part, fn) => {
    try {
      out[part] = fn();
      if (state) state.loaded.add(part);
    } catch (e) {
      out.loadErrors.push(part);
      report.error('[load-library] could not read ' + part + ':', e && e.message ? e.message : e);
    }
  };

  read('books', () => database.getAllBooks());
  read('cats', () => database.getCategoryNames());
  read('theme', () => database.getSetting('theme', 'light'));
  read('nid', () => database.getMaxBookId() + 1);
  read('bookmarks', () => database.getAllBookmarksGrouped());
  read('notes', () => database.getAllNotesGrouped());
  read('readPos', () => database.getAllReadingProgress());
  read('recent', () => database.getRecentForFrontend());
  return out;
}

/**
 * Write back what the renderer sent — only the parts that may be written.
 * @returns {{ synced: string[], refused: string[], failed: string[] }}
 */
function saveLibrary(database, data, state, log) {
  const report = log || console;
  const result = { synced: [], refused: [], failed: [] };
  if (!data || typeof data !== 'object') return result;

  const write = (part, present, fn) => {
    if (!present) return;
    if (state && !state.loaded.has(part)) {
      result.refused.push(part);
      report.error('[save-library] refused to write ' + part + ': it never loaded in this session');
      return;
    }
    try {
      if (fn() === false) return;
      result.synced.push(part);
    } catch (e) {
      result.failed.push(part);
      report.error('[save-library] could not write ' + part + ':', e && e.message ? e.message : e);
    }
  };

  write('theme', !!data.theme, () => database.setSetting('theme', data.theme));

  write('books', Array.isArray(data.books), () => {
    const held = database.getBookCount();
    if (data.books.length === 0 && held > 0) {
      result.refused.push('books');
      report.error('[save-library] refused an empty book list while the library holds ' + held + ' books');
      return false;
    }
    database.syncBooks(data.books);
  });

  write('cats', Array.isArray(data.cats), () => database.syncCategories(data.cats));
  write('bookmarks', !!data.bookmarks, () => database.syncBookmarks(data.bookmarks));
  write('notes', !!data.notes, () => database.syncNotes(data.notes));
  write('readPos', !!data.readPos, () => database.syncReadingProgress(data.readPos));
  write('recent', Array.isArray(data.recent), () => database.syncRecent(data.recent));
  write('nid', !!data.nid, () => database.setSetting('nid', data.nid));

  return result;
}

module.exports = { createState, loadLibrary, saveLibrary };
