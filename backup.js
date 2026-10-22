// ============================================================================
// Backups of the library (audit §4.5) — file handling, kept out of main.js so
// tests/main/backup.js can run it on throwaway directories.
//
// The library database holds every book's text, every bookmark and every note,
// and before v3.5 there was no way to copy it out or put a copy back. Now:
//
//   - automatic: once a week at startup, JamiyKutupxana\backups\auto-<date>.db,
//     the newest three kept;
//   - manual: «ھازىر زاپاسلاش» writes BilimHezinisi-<date>-<time>.db wherever
//     the writer chooses;
//   - before the first schema migration of a run and before a restore, a copy
//     of the library as it was (main.js);
//   - restore: a file is checked before anything is touched, the current
//     library is backed up, and only then is library.db replaced.
//
// The copies themselves are made by database.backupTo() — SQLite's online
// backup, consistent while the app is running. The backups folder lives
// INSIDE JamiyKutupxana; nothing in that folder is renamed or moved.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

const AUTO_EVERY_DAYS = 7;
const AUTO_KEEP = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The tables every library has had since the first release. A file without
 * them is not a Bilim Hezinisi library, whatever its extension says. Tables
 * added later (note_documents, quran_*) are not required: an older backup is
 * still a valid library, and createTables() adds what it lacks on the next
 * start.
 */
const REQUIRED_TABLES = ['books', 'book_content', 'categories', 'bookmarks', 'notes', 'reading_progress', 'settings'];

const AUTO_PATTERN = /^auto-(\d{4})-(\d{2})-(\d{2})\.db$/;

function pad(n) { return String(n).padStart(2, '0'); }
function day(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

function autoName(d) { return 'auto-' + day(d) + '.db'; }
function manualName(d) { return 'BilimHezinisi-' + day(d) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.db'; }
function stamp(d) { return day(d) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()); }

/** The automatic backups in `dir`, newest first. */
function listAuto(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(f => AUTO_PATTERN.test(f)).sort().reverse();
}

function dateOfAuto(name) {
  const m = AUTO_PATTERN.exec(name);
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

/**
 * Back up to a temporary name and rename it into place, so a copy cut short
 * (a full disk, the app closed half-way) is never taken for a real backup.
 */
async function backupAtomically(database, file) {
  const tmp = file + '.tmp';
  try { fs.rmSync(tmp, { force: true }); } catch (e) { /* not there */ }
  try {
    await database.backupTo(tmp);
    fs.renameSync(tmp, file);
  } catch (e) {
    try { fs.rmSync(tmp, { force: true }); } catch (_) { /* best effort */ }
    throw e;
  }
  return file;
}

/** The weekly automatic backup, if it is due. Keeps the newest three. */
async function autoBackupIfDue(database, dir, now) {
  const when = now || new Date();
  const newest = listAuto(dir)[0];
  if (newest) {
    const today = new Date(when.getFullYear(), when.getMonth(), when.getDate());
    const days = Math.round((today - dateOfAuto(newest)) / DAY_MS);
    if (days < AUTO_EVERY_DAYS) return { made: false, removed: [] };
  }

  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, autoName(when));
  await backupAtomically(database, file);

  const removed = [];
  for (const old of listAuto(dir).slice(AUTO_KEEP)) {
    try { fs.rmSync(path.join(dir, old), { force: true }); removed.push(old); }
    catch (e) { /* tried again next week */ }
  }
  return { made: true, file: file, removed: removed };
}

/** What the settings dialog shows: how many files, how many bytes. */
function folderInfo(dir) {
  const info = { folder: dir, count: 0, bytes: 0, newestAuto: '' };
  if (!fs.existsSync(dir)) return info;
  for (const name of fs.readdirSync(dir)) {
    if (!/\.db$/i.test(name)) continue;
    try {
      const st = fs.statSync(path.join(dir, name));
      if (!st.isFile()) continue;
      info.count++;
      info.bytes += st.size;
    } catch (e) { /* vanished meanwhile */ }
  }
  const newest = listAuto(dir)[0];
  if (newest) info.newestAuto = day(dateOfAuto(newest));
  return info;
}

/**
 * Is `file` a library that can be restored? Opened read-only; nothing is
 * written to it.
 *
 * @returns {{ ok: boolean, reason?: 'missing'|'not-sqlite'|'damaged'|'missing-tables', counts?: object }}
 */
function validateLibraryFile(file) {
  if (!file || !fs.existsSync(file) || !fs.statSync(file).isFile()) return { ok: false, reason: 'missing' };

  const Database = require('better-sqlite3');
  let db = null;
  try {
    db = new Database(file, { readonly: true, fileMustExist: true });
    let rows;
    try {
      rows = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table'").all();
    } catch (e) {
      // SQLITE_NOTADB: the file is not a database at all.
      return { ok: false, reason: (e && /NOTADB|not a database/i.test(String(e.code) + e.message)) ? 'not-sqlite' : 'damaged' };
    }

    const tables = new Set(rows.map(r => r.name));
    if (!REQUIRED_TABLES.every(t => tables.has(t))) return { ok: false, reason: 'missing-tables' };

    // Table by table, not the whole file at once. MEASURED: a plain
    // `PRAGMA integrity_check` fails with "SQL logic error" on every library
    // this app has made — the bundled SQLite (3.49.2) also checks the FTS5
    // search tables, and book_fts is declared with content_rowid but no
    // external content table. Checking each ordinary table (the FTS5 shadow
    // tables included, which hold the search index) covers every b-tree of
    // the file without that.
    for (const row of rows) {
      if (/^\s*CREATE\s+VIRTUAL\b/i.test(row.sql || '')) continue;
      const result = db.pragma("integrity_check('" + row.name.replace(/'/g, "''") + "')", { simple: true });
      if (result !== 'ok') return { ok: false, reason: 'damaged' };
    }

    const count = (table) => tables.has(table) ? db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n : 0;
    return { ok: true, counts: { books: count('books'), notes: count('note_documents'), bookmarks: count('bookmarks') } };
  } catch (e) {
    return { ok: false, reason: (e && /NOTADB|not a database/i.test(String(e.code) + e.message)) ? 'not-sqlite' : 'damaged' };
  } finally {
    if (db) { try { db.close(); } catch (e) { /* closing a read-only handle */ } }
  }
}

/**
 * Put `src` in place of the library file at `dest`. The database must be
 * closed (and checkpointed) first. The copy goes to a temporary name before
 * anything is removed, so a failed copy leaves the library as it was; the
 * stale -wal and -shm files of the old library go, because SQLite would
 * otherwise replay the old WAL into the restored file.
 */
function replaceLibraryFile(src, dest) {
  const tmp = dest + '.restore-tmp';
  fs.copyFileSync(src, tmp);
  for (const suffix of ['-wal', '-shm']) {
    try { fs.rmSync(dest + suffix, { force: true }); } catch (e) { /* not there */ }
  }
  fs.renameSync(tmp, dest);
}

module.exports = {
  REQUIRED_TABLES,
  autoName, manualName, stamp,
  listAuto, backupAtomically, autoBackupIfDue, folderInfo,
  validateLibraryFile, replaceLibraryFile
};
