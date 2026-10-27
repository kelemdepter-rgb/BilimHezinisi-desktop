/**
 * SQLite Database Layer for Bilim Hezinisi
 * Uses better-sqlite3 (native, synchronous, WAL mode).
 * Migrated from sql.js for ~100x performance and instant disk writes.
 */
const path = require('path');
const fs = require('fs');
const textNormalize = require('./text-normalize');

/**
 * Text as the library stores it: letters, never glyph codepoints (W18, K15).
 * Every write of a book's title, author, description or text goes through
 * this, whichever way it came in — import, edit, the renderer's whole-library
 * save, the reader's page fix.
 */
function letters(value) {
  return textNormalize.normalizeImportedText(value);
}

let db = null;
// Columns and tables that migration steps add, looked up once per library:
// the code keeps working on a library whose step could not run.
const schemaCache = new Map();
let hasFTS5 = false;
let hasQuranFTS = false;

const DB_FILENAME = 'library.db';

/**
 * Normalize Arabic text for search: strip diacritics, unify alif variants,
 * unify hamza, normalize ya/alif maqsura, ta marbuta. Mirrors the same
 * normalization that stripTashkil() in scripts/seed-quran.js applies to
 * the indexed text_ar_simple column.
 */
function normalizeArabicQuery(text) {
  if (!text) return '';
  return String(text)
    // Remove all Arabic diacritics, marks, and tatweel
    .replace(/[ً-ٰٟۖ-ۭ࣓-ࣿـ]/g, '')
    // Alif variants → plain alif
    .replace(/[ٱآأإ]/g, 'ا')
    // Alif maqsura → ya (helpful for cross-region spellings)
    // Note: keep this CONSISTENT with seed normalization. Currently seed
    // does NOT do this, so we shouldn't either. Comment kept for reference.
    // .replace(/ى/g, 'ي')
    // Ta marbuta → ha is debatable. Saleh translation has both. Skip.
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detect whether a query is Arabic-script. Used to decide whether to
 * apply Arabic normalization. Uyghur uses Arabic script too, but with
 * additional letters; we detect those to differentiate.
 */
function isArabicScript(text) {
  if (!text) return false;
  // Has any Arabic-script char
  if (!/[؀-ۿ]/.test(text)) return false;
  // If it has Uyghur-specific chars, treat as Uyghur (not pure Arabic)
  // ې=06D0 ە=06D5 ۆ=06C6 ۇ=06C7 ۈ=06C8 ۋ=06CB ڭ=06AD گ=06AF پ=067E چ=0686 ك=06A9 ھ=06BE
  if (/[ېەۆۇۈۋڭگپچکھ]/.test(text)) {
    return false;
  }
  return true;
}

// Virtual book IDs for Quran (used by the Notes auto-reference scanner).
const QURAN_BOOK_ID_UG = -1;
const QURAN_BOOK_ID_AR = -2;

/**
 * Initialize the database
 * @param {string} dataDir - Directory to store the database
 * @returns {Promise<void>}
 */
async function initDB(dataDir) {
  if (db) return; // Already initialized

  let Database;
  try {
    Database = require('better-sqlite3');
  } catch (e) {
    throw new Error(
      'better-sqlite3 is not loaded. The native module may need rebuilding for Electron. ' +
      'Run: npx electron-rebuild -f -w better-sqlite3\nOriginal error: ' + e.message
    );
  }

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, DB_FILENAME);
  db = new Database(dbPath);

  // Performance pragmas
  db.pragma('journal_mode = WAL');         // Write-Ahead Log: faster + crash-safe
  db.pragma('synchronous = NORMAL');       // Safe with WAL, ~2x faster than FULL
  db.pragma('cache_size = -65536');        // 64 MB page cache (negative = KB)
  db.pragma('temp_store = MEMORY');        // Temp tables in RAM
  db.pragma('mmap_size = 268435456');      // 256 MB memory-mapped I/O
  db.pragma('foreign_keys = ON');

  createTables();
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT DEFAULT '',
      category TEXT DEFAULT '',
      format TEXT DEFAULT 'TXT',
      date TEXT DEFAULT '',
      description TEXT DEFAULT '',
      file_hash TEXT DEFAULT '',
      original_path TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      parent_id INTEGER DEFAULT NULL,
      sort_order INTEGER DEFAULT 0,
      icon TEXT DEFAULT '',
      FOREIGN KEY (parent_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      name TEXT DEFAULT '',
      position REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      text TEXT NOT NULL,
      position REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reading_progress (
      book_id INTEGER PRIMARY KEY,
      position REAL DEFAULT 0,
      page INTEGER DEFAULT 1,
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS recent_reads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      book_id INTEGER NOT NULL,
      read_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS book_content (
      book_id INTEGER PRIMARY KEY,
      content TEXT DEFAULT '',
      FOREIGN KEY (book_id) REFERENCES books(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      result_count INTEGER DEFAULT 0,
      searched_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS quran_suras (
      number INTEGER PRIMARY KEY,
      name_ar TEXT NOT NULL,
      name_ug TEXT NOT NULL,
      name_translit TEXT DEFAULT '',
      revelation TEXT DEFAULT 'meccan',
      aya_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quran_ayas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sura INTEGER NOT NULL,
      aya INTEGER NOT NULL,
      text_ar TEXT NOT NULL,
      text_ar_simple TEXT NOT NULL,
      text_ug TEXT NOT NULL DEFAULT '',
      UNIQUE(sura, aya),
      FOREIGN KEY(sura) REFERENCES quran_suras(number)
    );

    CREATE INDEX IF NOT EXISTS idx_quran_sura ON quran_ayas(sura);

    CREATE TABLE IF NOT EXISTS note_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL DEFAULT 'يېڭى خاتىرە',
      content_html TEXT NOT NULL DEFAULT '',
      content_text TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_note_updated ON note_documents(updated_at DESC);
  `);

  // Book FTS5. Libraries made before 3.5 have this table declared with
  // content_rowid='book_id' and no content table, which FTS5 cannot read
  // back; migration step 5 rebuilds it in this shape.
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS book_fts USING fts5(
        title, author, content,
        tokenize='unicode61'
      )
    `);
    hasFTS5 = true;
    console.log('FTS5 full-text search enabled');
  } catch (e) {
    hasFTS5 = false;
    console.log('FTS5 not available, using LIKE-based search fallback');
  }

  // Quran FTS5
  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS quran_fts USING fts5(
        text_ar_simple, text_ug,
        content='quran_ayas', content_rowid='id',
        tokenize='unicode61 remove_diacritics 2'
      );
      CREATE TRIGGER IF NOT EXISTS quran_fts_ai AFTER INSERT ON quran_ayas BEGIN
        INSERT INTO quran_fts(rowid, text_ar_simple, text_ug)
        VALUES (new.id, new.text_ar_simple, new.text_ug);
      END;
      CREATE TRIGGER IF NOT EXISTS quran_fts_ad AFTER DELETE ON quran_ayas BEGIN
        INSERT INTO quran_fts(quran_fts, rowid, text_ar_simple, text_ug)
        VALUES ('delete', old.id, old.text_ar_simple, old.text_ug);
      END;
    `);
    hasQuranFTS = true;
    console.log('Quran FTS5 enabled');
  } catch (e) {
    hasQuranFTS = false;
    console.log('Quran FTS5 not available, using LIKE fallback');
  }

  // LEGACY: book_ngrams table is no longer used. Drop it if it exists.
  try {
    db.exec('DROP TABLE IF EXISTS book_ngrams');
    db.exec('DROP INDEX IF EXISTS idx_ngram_gram');
  } catch (e) {
    console.warn('[migration] could not drop book_ngrams:', e.message);
  }
}

/**
 * No-op kept for backward compatibility.
 * better-sqlite3 with WAL writes immediately; no manual flush needed.
 */
function saveDB(dataDir) {
  // Intentionally empty
  return;
}

function vacuum() {
  if (!db) return;
  try {
    db.exec('VACUUM');
  } catch (e) {
    console.warn('[vacuum] failed:', e.message);
  }
}

function close() {
  if (db) {
    try {
      db.close();
    } catch (e) {
      console.warn('[close] failed:', e.message);
    }
    db = null;
  }
  // Cached text belongs to the library it was read from (a restore, or the
  // tests, open another one).
  contentCache.clear();
  schemaCache.clear();
}

// ========== SCHEMA MIGRATIONS ==========
// Every schema change from v3.5 on is a numbered step here, run in order at
// startup; PRAGMA user_version records the last one applied. createTables()
// stays as the baseline every library already has. The rules:
//
//   - additive only — new tables, new columns. User data is never dropped,
//     renamed or rewritten by a step;
//   - each step runs in its own transaction and user_version moves with it,
//     so a step that fails leaves nothing behind and nothing after it runs;
//   - before the FIRST pending step of a run, main.js backs the library up to
//     JamiyKutupxana\backups\ (beforeFirst). If that backup fails, no step
//     runs at all.
const MIGRATIONS = [
  {
    // W1 — earlier versions of a note (Phase 3.1). AUTOINCREMENT, so an id is
    // never reused after an eviction and the highest id is always the newest.
    version: 1,
    name: 'note_versions',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS note_versions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          note_id INTEGER NOT NULL REFERENCES note_documents(id) ON DELETE CASCADE,
          reason TEXT NOT NULL,
          title TEXT,
          content_html TEXT,
          content_text TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_note_versions_note ON note_versions(note_id, created_at);
      `);
    }
  },
  {
    // W2, W3 — the trash and pinning (Phase 5). Neither ever touches
    // updated_at: moving a note to the trash and back, or pinning it, is not
    // an edit of the note.
    version: 2,
    name: 'note_trash_and_pin',
    up(db) {
      db.exec(`
        ALTER TABLE note_documents ADD COLUMN deleted_at TEXT;
        ALTER TABLE note_documents ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
        CREATE INDEX IF NOT EXISTS idx_note_deleted ON note_documents(deleted_at);
      `);
    }
  },
  {
    // K5, W16 — a bookmark, an in-book note and the reading position keep
    // their PLACE: the character offset where their paragraph begins in the
    // book's text (src/reader-places.js). Rows from before stay NULL — the
    // reader lists them as old ones whose place was never kept.
    version: 3,
    name: 'annotation_offsets',
    up(db) {
      db.exec(`
        ALTER TABLE bookmarks ADD COLUMN char_offset INTEGER;
        ALTER TABLE notes ADD COLUMN char_offset INTEGER;
        ALTER TABLE reading_progress ADD COLUMN char_offset INTEGER;
      `);
    }
  },
  {
    // W17 — bookmarks in the Qur'an: one per verse.
    version: 4,
    name: 'quran_bookmarks',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS quran_bookmarks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sura INTEGER NOT NULL,
          aya INTEGER NOT NULL,
          note TEXT DEFAULT '',
          created_at TEXT DEFAULT (datetime('now')),
          UNIQUE(sura, aya)
        );
      `);
    }
  },
  {
    // The book search index, built right. book_fts was declared with
    // content_rowid='book_id' and no external content table, so FTS5 read its
    // own content through a column that does not exist: a row could not be
    // deleted or counted, snippet() failed, and every book whose text or
    // title changed kept its OLD words in the index. The index is derived
    // data — it is dropped and built again, and no user data is touched (the
    // library is backed up before the step).
    //
    // The step only lays the table down and leaves a marker: indexing takes
    // about 12 s per 90 MB of text (measured), a large library a minute, and
    // the window must not wait for that. main.js fills the index afterwards,
    // a little at a time (ftsRebuildStep).
    version: 5,
    name: 'book_fts_rebuild',
    up(db) {
      if (!hasFTS5) return;
      db.exec(`
        DROP TABLE IF EXISTS book_fts;
        CREATE VIRTUAL TABLE book_fts USING fts5(title, author, content, tokenize='unicode61');
      `);
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(FTS_FILL_KEY, '0');
    }
  },
  {
    // 3.6 — which verses share one translation, and the translation without
    // its verse markers. 185 runs of consecutive verses carry the same
    // sentence in the bundled QuranEnc file, with a range marker such as
    // «(160ـ161)»; the 3.5 cleaner did not know the tatweel, so about 430
    // verses showed that marker inside the translation. Both come from the
    // bundled XML, the source of truth (scripts/seed-quran.js), never from
    // the cleaned column. This is bundled text, not the writer's: the step
    // rewrites text_ug from the file, after the usual backup.
    //
    // A library not seeded yet gets the columns only; the seed, which runs
    // after the steps, writes both.
    version: 6,
    name: 'quran_translation_groups',
    up(db) {
      db.exec(`
        ALTER TABLE quran_ayas ADD COLUMN ug_from INTEGER;
        ALTER TABLE quran_ayas ADD COLUMN ug_to INTEGER;
      `);
      if (!db.prepare('SELECT COUNT(*) AS n FROM quran_ayas').get().n) return;
      const rows = require('./scripts/seed-quran').uyghurTranslationRows(__dirname);
      const update = db.prepare('UPDATE quran_ayas SET text_ug=?, ug_from=?, ug_to=? WHERE sura=? AND aya=?');
      for (const r of rows) update.run(r.text_ug, r.ug_from, r.ug_to, r.sura, r.aya);
      db.exec('UPDATE quran_ayas SET ug_from = aya, ug_to = aya WHERE ug_from IS NULL OR ug_to IS NULL');
      // quran_fts indexes quran_ayas through insert and delete triggers only;
      // after an UPDATE it would still hold the old words.
      if (hasQuranFTS) db.exec("INSERT INTO quran_fts(quran_fts) VALUES('rebuild')");
    }
  },
  {
    // 3.6 — a PDF book remembers where each of its PDF pages lies in its
    // text, [start, end) in the stored text, and where the PDF itself is:
    // the path (the old, never-filled original_path), size, time and
    // SHA-256 — the PDF is never copied. Books from before have neither.
    // "end" is quoted: END is an SQL keyword.
    version: 7,
    name: 'pdf_pages_and_original',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS book_page_map (
          book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
          page_no INTEGER NOT NULL,
          start INTEGER NOT NULL,
          "end" INTEGER NOT NULL,
          PRIMARY KEY (book_id, page_no)
        );
        ALTER TABLE books ADD COLUMN original_size INTEGER;
        ALTER TABLE books ADD COLUMN original_mtime INTEGER;
        ALTER TABLE books ADD COLUMN original_sha256 TEXT;
      `);
      const cols = db.prepare('PRAGMA table_info(books)').all().map(c => c.name);
      if (cols.indexOf('original_path') === -1) db.exec("ALTER TABLE books ADD COLUMN original_path TEXT DEFAULT ''");
    }
  }
];

// ========== FILLING THE BOOK SEARCH INDEX (migration step 5) ==========

/** The settings key that says the index is still being filled: books after this id. */
const FTS_FILL_KEY = 'fts_fill_after';
/** Characters of book text indexed per step — about a tenth of a second. */
const FTS_FILL_CHARS = 500000;

/** Is the index still waiting to be filled (after step 5, or after a close part-way)? */
function ftsRebuildPending() {
  return !!db.prepare('SELECT 1 FROM settings WHERE key=?').get(FTS_FILL_KEY);
}

/**
 * Index the next books, in id order, until about `maxChars` of text — at
 * least one book — in one transaction that also moves the marker on, so a
 * close part-way resumes where it stopped. Each book is indexed as it is NOW
 * (its row deleted and written again), so one changed meanwhile, already
 * indexed by its own write, comes out right; a deleted one is simply not
 * found.
 *
 * @returns {{done: boolean, indexed: number}}
 */
function ftsRebuildStep(maxChars) {
  const marker = db.prepare('SELECT value FROM settings WHERE key=?').get(FTS_FILL_KEY);
  if (!marker) return { done: true, indexed: 0 };
  const limit = Math.max(1, maxChars || FTS_FILL_CHARS);
  const next = db.prepare(`
    SELECT b.id, b.title, b.author, c.content FROM books b
    LEFT JOIN book_content c ON c.book_id = b.id
    WHERE b.id > ? ORDER BY b.id LIMIT 1
  `);
  let after = Number(marker.value) || 0;
  let indexed = 0;
  let done = false;
  db.transaction(() => {
    let chars = 0;
    while (chars < limit) {
      const book = next.get(after);
      if (!book) { done = true; break; }
      if (hasFTS5) {
        db.prepare('DELETE FROM book_fts WHERE rowid=?').run(book.id);
        if (book.content) {
          db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
            .run(book.id, book.title || '', book.author || '', book.content);
          chars += book.content.length;
        }
      }
      after = book.id;
      indexed++;
    }
    if (done) db.prepare('DELETE FROM settings WHERE key=?').run(FTS_FILL_KEY);
    else db.prepare('UPDATE settings SET value=? WHERE key=?').run(String(after), FTS_FILL_KEY);
  })();
  return { done: done, indexed: indexed };
}

/** The last migration step applied to this library (0: none yet). */
function schemaVersion() {
  return db.pragma('user_version', { simple: true });
}

/**
 * Apply the pending steps. `opts.steps` replaces MIGRATIONS (the tests use it);
 * `opts.beforeFirst(from, to)` runs — and is awaited — before the first one.
 * @returns {Promise<{from: number, to: number, ran: number[]}>}
 */
async function runMigrations(opts) {
  const options = opts || {};
  const steps = (options.steps || MIGRATIONS).slice().sort((a, b) => a.version - b.version);
  steps.forEach((step, i) => {
    if (!Number.isInteger(step.version) || step.version < 1 ||
        (i > 0 && step.version === steps[i - 1].version) || typeof step.up !== 'function') {
      throw new Error('migration steps need distinct positive versions and an up() function');
    }
  });

  const from = schemaVersion();
  const pending = steps.filter(step => step.version > from);
  if (!pending.length) return { from: from, to: from, ran: [] };
  const to = pending[pending.length - 1].version;

  if (typeof options.beforeFirst === 'function') await options.beforeFirst(from, to);

  const ran = [];
  try {
    for (const step of pending) {
      db.transaction(() => {
        step.up(db);
        db.pragma('user_version = ' + step.version);
      })();
      ran.push(step.version);
      console.log('[migration] ' + step.version + ' ' + (step.name || '') + ' applied');
    }
  } finally {
    schemaCache.clear(); // a step may have added columns
  }
  return { from: from, to: to, ran: ran };
}

// ========== BACKUP ==========

/**
 * A consistent copy of the open library at `file`, made with SQLite's online
 * backup — safe while the app is using the database, WAL included.
 */
async function backupTo(file) {
  if (!db) throw new Error('the database is not open');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await db.backup(file);
  return file;
}

/** Does this library have the column (a table that does not exist has none)? */
function hasColumn(table, column) {
  const key = table + '.' + column;
  if (!schemaCache.has(key)) {
    const cols = db.prepare('PRAGMA table_info(' + table + ')').all().map(c => c.name);
    schemaCache.set(key, cols.indexOf(column) !== -1);
  }
  return schemaCache.get(key);
}

/** Fold the WAL back into the main file — before the file is replaced. */
function checkpoint() {
  if (db) db.pragma('wal_checkpoint(TRUNCATE)');
}

// ========== BOOKS ==========

// ========== PDF PAGES AND THE ORIGINAL FILE (3.6, migration step 7) ==========

/**
 * Where each PDF page lies in the stored text: page n is ranges[n - 1],
 * [start, end). An empty page has an empty range at its place.
 */
function writePageMap(bookId, ranges) {
  if (!hasColumn('book_page_map', 'book_id')) return;
  db.prepare('DELETE FROM book_page_map WHERE book_id=?').run(bookId);
  if (!Array.isArray(ranges) || !ranges.length) return;
  const insert = db.prepare('INSERT INTO book_page_map (book_id, page_no, start, "end") VALUES (?, ?, ?, ?)');
  ranges.forEach((r, i) => insert.run(bookId, i + 1, r[0], r[1]));
}

/** The book's page map, in page order: [{ page_no, start, end }]. */
function getPageMap(bookId) {
  if (!hasColumn('book_page_map', 'book_id')) return [];
  return db.prepare('SELECT page_no, start, "end" AS "end" FROM book_page_map WHERE book_id=? ORDER BY page_no').all(bookId);
}

function wholeOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** Record where the book's PDF is: { path, size, mtime (ms), sha256 } (pdf-original.js). */
function setBookOriginal(bookId, facts) {
  if (!facts || !hasColumn('books', 'original_sha256')) return false;
  db.prepare('UPDATE books SET original_path=?, original_size=?, original_mtime=?, original_sha256=? WHERE id=?')
    .run(String(facts.path || ''), wholeOrNull(facts.size), wholeOrNull(facts.mtime),
      facts.sha256 ? String(facts.sha256) : null, bookId);
  return true;
}

/** Where the book's PDF was recorded to be; every field null when nothing was. */
function getBookOriginal(bookId) {
  const none = { path: null, size: null, mtime: null, sha256: null };
  if (!hasColumn('books', 'original_sha256')) return none;
  const row = db.prepare('SELECT original_path, original_size, original_mtime, original_sha256 FROM books WHERE id=?').get(bookId);
  if (!row) return none;
  return { path: row.original_path || null, size: row.original_size, mtime: row.original_mtime, sha256: row.original_sha256 };
}

/**
 * Add a book. `extra` (3.6), for a PDF: `pages`, each page's [start, end) in
 * `content` as it was extracted — mapped through the normalisation, so the
 * stored map is true for the stored text — and `original`, the PDF's facts.
 */
function addBook(title, author, category, format, date, description, content, fileHash, extra) {
  title = letters(title);
  author = letters(author);
  description = letters(description);
  const mapped = textNormalize.normalizeWithRanges(content, extra && extra.pages);
  content = mapped.text;
  return db.transaction(() => {
    const stmt = db.prepare(`
      INSERT INTO books (title, author, category, format, date, description, file_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      title,
      author || '',
      category || '',
      format || 'TXT',
      date || new Date().toISOString().slice(0, 10),
      description || '',
      fileHash || ''
    );
    const bookId = info.lastInsertRowid;

    if (content) {
      db.prepare('INSERT OR REPLACE INTO book_content (book_id, content) VALUES (?, ?)')
        .run(bookId, content);

      if (hasFTS5) {
        try {
          db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
            .run(bookId, title, author || '', content);
        } catch (e) { /* ignore FTS5 errors */ }
      }
    }
    if (mapped.ranges) writePageMap(bookId, mapped.ranges);
    if (extra && extra.original) setBookOriginal(bookId, extra.original);

    return bookId;
  })();
}

/**
 * Batch insert multiple books in a single transaction.
 * Returns { added: [{ id, title }], skipped: [{ title, reason }] }
 *
 * @param {Array<{title, author, category, format, date, description, content, fileHash}>} books
 */
function addBooksBatch(books) {
  if (!Array.isArray(books) || books.length === 0) {
    return { added: [], skipped: [] };
  }

  // Pre-load all existing hashes for fast duplicate check
  const existingHashes = new Set();
  try {
    const rows = db.prepare(`SELECT file_hash FROM books WHERE file_hash != ''`).all();
    for (const row of rows) existingHashes.add(row.file_hash);
  } catch (e) { /* ignore */ }

  const insertBook = db.prepare(`
    INSERT INTO books (title, author, category, format, date, description, file_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const insertContent = db.prepare(
    'INSERT OR REPLACE INTO book_content (book_id, content) VALUES (?, ?)'
  );
  const insertFts = hasFTS5
    ? db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
    : null;

  const added = [];
  const skipped = [];
  // Track hashes added in this batch so we don't accept duplicates within
  // the same import.
  const batchHashes = new Set();

  const tx = db.transaction(() => {
    for (const b of books) {
      const title = letters(String(b.title || '').trim());
      const author = letters(b.author);
      const mapped = textNormalize.normalizeWithRanges(b.content, b.pages);
      const content = mapped.text;
      if (!title) {
        skipped.push({ title: b.title || '(empty)', reason: 'empty_title' });
        continue;
      }

      const fileHash = b.fileHash || '';
      if (fileHash) {
        if (existingHashes.has(fileHash) || batchHashes.has(fileHash)) {
          skipped.push({ title, reason: 'duplicate' });
          continue;
        }
        batchHashes.add(fileHash);
      }

      const date = b.date || new Date().toISOString().slice(0, 10);
      try {
        const info = insertBook.run(
          title,
          author,
          b.category || '',
          b.format || 'TXT',
          date,
          letters(b.description),
          fileHash
        );
        const bookId = info.lastInsertRowid;

        if (content) {
          insertContent.run(bookId, content);
          if (insertFts) {
            try {
              insertFts.run(bookId, title, author, content);
            } catch (e) { /* skip FTS insert error per book */ }
          }
        }
        if (mapped.ranges) writePageMap(bookId, mapped.ranges);
        if (b.original) setBookOriginal(bookId, b.original);

        added.push({ id: bookId, title });
      } catch (e) {
        skipped.push({ title, reason: e.message || 'insert_failed' });
      }
    }
  });

  tx();
  return { added, skipped };
}

function updateBook(id, title, author, category, description) {
  title = letters(title);
  author = letters(author);
  description = letters(description);
  db.prepare(`
    UPDATE books SET title=?, author=?, category=?, description=?, updated_at=datetime('now')
    WHERE id=?
  `).run(title, author || '', category || '', description || '', id);

  if (hasFTS5) {
    try {
      db.prepare('DELETE FROM book_fts WHERE rowid=?').run(id);
      const content = getBookContent(id);
      if (content) {
        db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
          .run(id, title, author || '', content);
      }
    } catch (e) { /* ignore */ }
  }
}

function deleteBook(id) {
  contentCache.delete(id);
  if (hasFTS5) {
    try { db.prepare('DELETE FROM book_fts WHERE rowid=?').run(id); } catch (e) {}
  }
  db.prepare('DELETE FROM book_content WHERE book_id=?').run(id);
  db.prepare('DELETE FROM bookmarks WHERE book_id=?').run(id);
  db.prepare('DELETE FROM notes WHERE book_id=?').run(id);
  db.prepare('DELETE FROM reading_progress WHERE book_id=?').run(id);
  db.prepare('DELETE FROM recent_reads WHERE book_id=?').run(id);
  db.prepare('DELETE FROM books WHERE id=?').run(id);
}

function getBook(id) {
  const row = db.prepare('SELECT * FROM books WHERE id=?').get(id);
  if (!row) return null;
  return rowToBook(row);
}

function getAllBooks() {
  const rows = db.prepare('SELECT * FROM books ORDER BY date DESC').all();
  return rows.map(rowToBook);
}

function getBooksByCategory(category) {
  const rows = db.prepare('SELECT * FROM books WHERE category=? ORDER BY date DESC').all(category);
  return rows.map(rowToBook);
}

function rowToBook(row) {
  // better-sqlite3 returns plain objects
  const book = { ...row };
  book.desc = book.description || '';
  return book;
}

// ========== BOOK CONTENT (LRU-cached) ==========

const contentCache = new Map();
const CACHE_MAX = 20;

function getBookContent(bookId) {
  if (contentCache.has(bookId)) {
    const v = contentCache.get(bookId);
    contentCache.delete(bookId);
    contentCache.set(bookId, v);
    return v;
  }
  const row = db.prepare('SELECT content FROM book_content WHERE book_id=?').get(bookId);
  const content = row ? (row.content || '') : '';

  if (contentCache.size >= CACHE_MAX) {
    const firstKey = contentCache.keys().next().value;
    contentCache.delete(firstKey);
  }
  contentCache.set(bookId, content);
  return content;
}

function saveBookContent(bookId, content) {
  content = letters(content);
  // A page map is true only for the text it was made for: a whole text
  // written over it (the reader's page fix rebuilds it from its pages) drops
  // it. The PDF page view's own edits keep it, shifting it with the edit.
  if (hasColumn('book_page_map', 'book_id') &&
      db.prepare('SELECT 1 FROM book_page_map WHERE book_id=? LIMIT 1').get(bookId)) {
    const old = db.prepare('SELECT content FROM book_content WHERE book_id=?').get(bookId);
    if (!old || old.content !== content) writePageMap(bookId, null);
  }
  contentCache.delete(bookId);
  db.prepare('INSERT OR REPLACE INTO book_content (book_id, content) VALUES (?, ?)')
    .run(bookId, content);

  if (hasFTS5) {
    try {
      db.prepare('DELETE FROM book_fts WHERE rowid=?').run(bookId);
      const book = getBook(bookId);
      if (book) {
        db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
          .run(bookId, book.title || '', book.author || '', content);
      }
    } catch (e) { /* ignore */ }
  }
}

function checkDuplicateHash(hash) {
  if (!hash) return false;
  const row = db.prepare('SELECT id FROM books WHERE file_hash=?').get(hash);
  return !!row;
}

// ========== BOOKS STORED AS GLYPH CODEPOINTS (W18, K15) ==========
// «كىتابلارنى تەكشۈرۈش» in the settings. Text that comes in now is folded on
// the way (letters() above); these repair what was stored before that.

/** A book's four text fields as stored now. */
function bookTextFields(id) {
  const book = db.prepare('SELECT title, author, description FROM books WHERE id=?').get(id);
  if (!book) return null;
  const row = db.prepare('SELECT content FROM book_content WHERE book_id=?').get(id);
  return {
    title: book.title || '',
    author: book.author || '',
    description: book.description || '',
    content: row ? (row.content || '') : '',
    hasContent: !!row
  };
}

/**
 * Read-only. `candidates`: books with a field that is CANDIDATE_SHARE or more
 * glyph codepoints — damaged, and what a repair rewrites (only those fields).
 * `nearMisses`: books with a stray form or two, left alone — a book about the
 * letters' shapes may hold them on purpose.
 */
function presentationFormsScan() {
  const candidates = [];
  const nearMisses = [];
  const ids = db.prepare('SELECT id FROM books ORDER BY id').all().map(r => r.id);
  for (const id of ids) {
    const fields = bookTextFields(id);
    if (!fields) continue;
    let forms = 0;
    const damaged = [];
    for (const name of ['title', 'author', 'description', 'content']) {
      const share = textNormalize.presentationFormShare(fields[name]);
      if (!share.forms) continue;
      forms += share.forms;
      if (share.share >= textNormalize.CANDIDATE_SHARE) damaged.push(name);
    }
    if (!forms) continue;
    (damaged.length ? candidates : nearMisses).push({ id: id, title: fields.title, forms: forms, fields: damaged });
  }
  return { candidates: candidates, nearMisses: nearMisses };
}

/**
 * Repair every candidate. `opts.beforeFirst()` is awaited before anything is
 * written — main.js backs the library up there, and if that fails, nothing
 * is. Each book is folded in its own transaction and only after its fold
 * passes the web repair script's checks (text-normalize.js, verifyFold); a
 * book that fails is skipped and listed with the reasons. Its search row is
 * rebuilt with it. `opts.fold` replaces the fold (the tests use it to make a
 * repair fail its checks).
 *
 * @returns {Promise<{fixed: Array, skipped: Array}>}
 */
async function presentationFormsFix(opts) {
  const options = opts || {};
  const fold = options.fold || textNormalize.foldPresentationForms;
  const scan = presentationFormsScan();
  const fixed = [];
  const skipped = [];
  if (!scan.candidates.length) return { fixed: fixed, skipped: skipped };
  if (typeof options.beforeFirst === 'function') await options.beforeFirst(scan.candidates.length);

  for (const candidate of scan.candidates) {
    const current = bookTextFields(candidate.id);
    if (!current) continue;
    const next = Object.assign({}, current);
    const problems = [];
    for (const name of candidate.fields) {
      next[name] = fold(current[name]);
      for (const problem of textNormalize.verifyFold(current[name], next[name])) problems.push(name + ': ' + problem);
    }
    if (problems.length) {
      skipped.push({ id: candidate.id, title: current.title, problems: problems });
      continue;
    }
    try {
      db.transaction(() => {
        db.prepare(`UPDATE books SET title=?, author=?, description=?, updated_at=datetime('now') WHERE id=?`)
          .run(next.title, next.author, next.description, candidate.id);
        if (current.hasContent) {
          db.prepare('UPDATE book_content SET content=? WHERE book_id=?').run(next.content, candidate.id);
          if (next.content !== current.content) writePageMap(candidate.id, null);
        }
        if (hasFTS5) {
          db.prepare('DELETE FROM book_fts WHERE rowid=?').run(candidate.id);
          if (next.content) {
            db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
              .run(candidate.id, next.title, next.author, next.content);
          }
        }
      })();
    } catch (e) {
      skipped.push({ id: candidate.id, title: current.title, problems: [e.message] });
      continue;
    }
    contentCache.delete(candidate.id);
    fixed.push({ id: candidate.id, title: next.title, author: next.author, description: next.description, forms: candidate.forms });
  }
  return { fixed: fixed, skipped: skipped };
}

// ========== SEARCH ==========

/**
 * Search the library: every book whose title, author or text holds `query`
 * anywhere, a part of a word included («كتاب» finds «الكتاب»), without regard
 * to case.
 *
 * The owner's decision (2026-10-23, Phase 7): search finds what it has always
 * found. It used to try the full-text index first; snippet() failed on the
 * index as it was declared, and a search that found anything fell back to
 * this. One that found nothing in the index came back empty — so a word only
 * in a book's changed text was never found. The index is built right now
 * (migration step 5) and serves the notebook's reference scan (ngramFindWord);
 * a ranked word search on it would find less, and is a decision of its own.
 */
function searchBooks(query, category) {
  return searchBooksSimple(query, category);
}

function searchBooksSimple(query, category) {
  const results = [];
  const lq = query.toLowerCase();

  let sql = 'SELECT * FROM books';
  const params = [];
  if (category && category !== 'all') {
    sql += ' WHERE category = ?';
    params.push(category);
  }

  const rows = db.prepare(sql).all(...params);
  for (const row of rows) {
    const book = rowToBook(row);
    const inT = (book.title || '').toLowerCase().includes(lq);
    const inA = (book.author || '').toLowerCase().includes(lq);

    let inC = false;
    let snip = '';
    let pos = null;
    const content = getBookContent(book.id);
    if (content) {
      const lcContent = content.toLowerCase();
      const idx = lcContent.indexOf(lq);
      if (idx !== -1) {
        inC = true;
        pos = idx;
        const s = Math.max(0, idx - 60);
        const e = Math.min(content.length, idx + query.length + 60);
        snip = content.slice(s, e).replace(/\n/g, ' ');
      }
    }

    if (inT || inA || inC) {
      results.push({ book, snip, pos, inT, inA, inC });
    }
  }
  return results;
}

/**
 * Pure JS string-scan: returns marked snippets for every occurrence of `query`
 * in the book content. Used by the Notes auto-reference scanner.
 */
function getAllSnippetsForBook(bookId, query, maxResults, ctx) {
  const MAX = Math.max(1, Math.min(1000, maxResults || 200));
  const CTX = Math.max(10, Math.min(400, ctx || 70));

  const content = getBookContent(bookId);
  if (!content || !query) return [];

  // Strip FTS5 operators so we have a clean needle for substring search.
  // User types: مىسۋاك  →  FTS5 sends: مىسۋاك*  →  here we want: مىسۋاك
  // Also tolerate quoted phrases: "مىسۋاكلارنى"  →  مىسۋاكلارنى
  let needle = String(query).trim().replace(/^"(.*)"$/, '$1').replace(/\*/g, '').trim();
  if (!needle) return [];

  const lcNeedle  = needle.toLowerCase();
  const lcContent = content.toLowerCase();
  const nLen = needle.length;

  const snippets = [];
  let cursor = 0;
  while (snippets.length < MAX) {
    const hit = lcContent.indexOf(lcNeedle, cursor);
    if (hit === -1) break;

    // Expand context outward to the nearest whitespace/newline for a clean cut.
    let start = Math.max(0, hit - CTX);
    let end   = Math.min(content.length, hit + nLen + CTX);
    while (start > 0 && !/\s/.test(content[start - 1]) && hit - start < CTX + 20) start--;
    while (end < content.length && !/\s/.test(content[end]) && end - (hit + nLen) < CTX + 20) end++;

    const before = content.slice(start, hit);
    const match  = content.slice(hit, hit + nLen);
    const after  = content.slice(hit + nLen, end);

    let snip = (before + '§MARK_OPEN§' + match + '§MARK_CLOSE§' + after)
      .replace(/\s+/g, ' ')
      .trim();
    if (start > 0) snip = '...' + snip;
    if (end < content.length) snip = snip + '...';

    snippets.push({ snip, pos: hit });
    cursor = hit + nLen;
  }

  return snippets;
}

// ========== QURAN ==========

function quranSuraExists() {
  const row = db.prepare('SELECT COUNT(*) AS cnt FROM quran_suras').get();
  return row && row.cnt > 0;
}

function quranSeedBulk(suras, ayas) {
  if (!Array.isArray(suras) || !Array.isArray(ayas)) {
    throw new Error('quranSeedBulk: suras and ayas must be arrays');
  }

  const groups = hasQuranGroups();
  const insertSura = db.prepare(
    `INSERT INTO quran_suras (number, name_ar, name_ug, name_translit, revelation, aya_count) VALUES (?,?,?,?,?,?)`
  );
  const insertAya = groups
    ? db.prepare(`INSERT INTO quran_ayas (sura, aya, text_ar, text_ar_simple, text_ug, ug_from, ug_to) VALUES (?,?,?,?,?,?,?)`)
    : db.prepare(`INSERT INTO quran_ayas (sura, aya, text_ar, text_ar_simple, text_ug) VALUES (?,?,?,?,?)`);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM quran_ayas').run();
    db.prepare('DELETE FROM quran_suras').run();

    for (const s of suras) {
      insertSura.run(s.number, s.name_ar, s.name_ug, s.name_translit || '', s.revelation || 'meccan', s.aya_count);
    }
    for (const a of ayas) {
      if (groups) {
        insertAya.run(a.sura, a.aya, a.text_ar, a.text_ar_simple, a.text_ug || '', a.ug_from || a.aya, a.ug_to || a.aya);
      } else {
        insertAya.run(a.sura, a.aya, a.text_ar, a.text_ar_simple, a.text_ug || '');
      }
    }
  });

  tx();
  return { suras: suras.length, ayas: ayas.length };
}

// ========== QURAN TRANSLATION GROUPS (3.6) ==========
// Verses the translator rendered as one sentence share one translation;
// ug_from / ug_to (migration step 6) name the group each verse belongs to —
// a verse on its own has ug_from = ug_to = aya. A library whose step 6 could
// not run reads every verse as its own group.

function hasQuranGroups() {
  return hasColumn('quran_ayas', 'ug_from') && hasColumn('quran_ayas', 'ug_to');
}

/** The two group columns, for a SELECT over quran_ayas aliased `alias`. */
function quranGroupSql(alias) {
  const p = alias ? alias + '.' : '';
  return hasQuranGroups()
    ? `COALESCE(${p}ug_from, ${p}aya) AS ug_from, COALESCE(${p}ug_to, ${p}aya) AS ug_to`
    : `${p}aya AS ug_from, ${p}aya AS ug_to`;
}

/**
 * The translation a group shows: the longest of its verses' texts. They are
 * identical but for 53:13–14, where 53:14's is a shortened copy of 53:13's.
 */
function quranGroupText(sura, from, to) {
  const row = db.prepare(`
    SELECT text_ug FROM quran_ayas WHERE sura=? AND aya BETWEEN ? AND ?
    ORDER BY length(text_ug) DESC, aya LIMIT 1
  `).get(sura, from, to);
  return row ? row.text_ug : '';
}

/**
 * One search result per translation group: the verses of a group share one
 * translation, which would otherwise come back once per verse. A card keeps
 * the place of its best-ranked hit and lists, in order, every verse of the
 * group that was found, each with its own Arabic.
 */
function collapseQuranGroups(rows) {
  const cards = [];
  const byGroup = new Map();
  for (const r of rows) {
    const from = r.ug_from || r.aya;
    const to = r.ug_to || r.aya;
    const key = r.sura + ':' + from;
    let card = byGroup.get(key);
    if (!card) {
      card = Object.assign({}, r, { ug_from: from, ug_to: to, verses: [] });
      byGroup.set(key, card);
      cards.push(card);
    }
    card.verses.push({ aya: r.aya, text_ar: r.text_ar, snip_ar: r.snip_ar || '' });
  }
  for (const card of cards) {
    card.verses.sort((a, b) => a.aya - b.aya);
    card.group_text_ug = card.ug_to > card.ug_from ? quranGroupText(card.sura, card.ug_from, card.ug_to) : card.text_ug;
  }
  return cards;
}

function quranGetSuras() {
  return db.prepare(`
    SELECT number, name_ar, name_ug, name_translit, revelation, aya_count
    FROM quran_suras ORDER BY number
  `).all();
}

function quranGetAyas(suraNumber) {
  return db.prepare(`
    SELECT id, sura, aya, text_ar, text_ar_simple, text_ug, ${quranGroupSql('')}
    FROM quran_ayas WHERE sura=? ORDER BY aya
  `).all(suraNumber);
}

/** One verse, with its group and the group's translation (group_text_ug). */
function quranGetAya(sura, aya) {
  const row = db.prepare(`
    SELECT id, sura, aya, text_ar, text_ar_simple, text_ug, ${quranGroupSql('')}
    FROM quran_ayas WHERE sura=? AND aya=?
  `).get(sura, aya);
  if (!row) return null;
  row.group_text_ug = row.ug_to > row.ug_from ? quranGroupText(row.sura, row.ug_from, row.ug_to) : row.text_ug;
  return row;
}

// ========== QURAN BOOKMARKS (W17) ==========

/** The longest sura has 286 verses; a seeded library knows each sura's own count. */
const LONGEST_SURA = 286;

/** Is (sura, aya) a verse that can exist? */
function isVerse(sura, aya) {
  if (!Number.isInteger(sura) || !Number.isInteger(aya) || sura < 1 || sura > 114 || aya < 1) return false;
  const row = db.prepare('SELECT aya_count FROM quran_suras WHERE number=?').get(sura);
  return aya <= (row && row.aya_count ? row.aya_count : LONGEST_SURA);
}

/** Every bookmarked verse, in the order of the mushaf. */
function quranBookmarkList() {
  return db.prepare('SELECT id, sura, aya, note, created_at FROM quran_bookmarks ORDER BY sura, aya').all();
}

function quranBookmarkAdd(sura, aya) {
  if (!isVerse(sura, aya)) return { ok: false };
  const info = db.prepare('INSERT OR IGNORE INTO quran_bookmarks (sura, aya) VALUES (?, ?)').run(sura, aya);
  return { ok: true, added: info.changes > 0 };
}

function quranBookmarkRemove(sura, aya) {
  if (!isVerse(sura, aya)) return { ok: false };
  const info = db.prepare('DELETE FROM quran_bookmarks WHERE sura=? AND aya=?').run(sura, aya);
  return { ok: true, removed: info.changes > 0 };
}

/**
 * One-shot migration: strips the duplicated basmala prefix from ayah 1 of
 * every Sura except Al-Fatiha. Idempotent — safe to run on already-fixed DBs
 * (the prefix detector simply won't match anything).
 *
 * Returns the number of rows actually modified.
 */
function migrationStripBasmalaAyah1() {
  if (!db) return 0;
  // Lazy require to avoid circulars at module load time.
  const { stripBasmalaPrefix, stripTashkil: stripTashkilSeed } = require('./scripts/seed-quran');

  const rows = db.prepare(
    `SELECT id, sura, aya, text_ar FROM quran_ayas WHERE aya = 1 AND sura != 1`
  ).all();
  if (!rows.length) return 0;

  const update = db.prepare(
    `UPDATE quran_ayas SET text_ar = ?, text_ar_simple = ? WHERE id = ?`
  );
  let fixed = 0;
  const tx = db.transaction(() => {
    for (const r of rows) {
      const newAr = stripBasmalaPrefix(r.text_ar);
      if (newAr && newAr !== r.text_ar) {
        update.run(newAr, stripTashkilSeed(newAr), r.id);
        fixed++;
      }
    }
  });
  tx();

  // Refresh the FTS index — the existing triggers cover INSERT/DELETE only,
  // not UPDATE, so we rebuild from the (now-corrected) content table.
  if (fixed > 0 && hasQuranFTS) {
    try {
      db.exec(`INSERT INTO quran_fts(quran_fts) VALUES('rebuild')`);
    } catch (e) {
      console.warn('[migration] quran_fts rebuild failed:', e.message);
    }
  }
  console.log(`[migration] basmala-ayah1: cleaned ${fixed}/${rows.length} rows`);
  return fixed;
}

/**
 * Resolve a sura by name (Arabic or Uyghur) or by number.
 * Returns the matching sura row or null. Matching strategies, in order:
 *   1. Numeric input (1-114)
 *   2. Exact match (after Arabic normalization for AR / lowercase for UG)
 *   3. Unique startsWith match
 *   4. Unique substring match
 */
function quranLookupSura(input) {
  if (!db || !input) return null;
  const raw = String(input).trim();
  if (!raw) return null;

  const asNum = parseInt(raw, 10);
  if (Number.isFinite(asNum) && String(asNum) === raw && asNum >= 1 && asNum <= 114) {
    return db.prepare(
      `SELECT number, name_ar, name_ug, name_translit, revelation, aya_count
       FROM quran_suras WHERE number = ?`
    ).get(asNum) || null;
  }

  const isAr = isArabicScript(raw);
  const needle = isAr ? normalizeArabicQuery(raw) : raw.toLowerCase();
  if (!needle) return null;

  const allSuras = db.prepare(
    `SELECT number, name_ar, name_ug, name_translit, revelation, aya_count
     FROM quran_suras`
  ).all();

  const norm = (s) => isAr
    ? normalizeArabicQuery(s || '')
    : String(s || '').toLowerCase();

  // Exact
  for (const s of allSuras) {
    const candidate = isAr ? s.name_ar : s.name_ug;
    if (norm(candidate) === needle) return s;
  }

  // StartsWith — only return if unique
  const prefixHits = allSuras.filter(s => {
    const candidate = isAr ? s.name_ar : s.name_ug;
    return norm(candidate).startsWith(needle);
  });
  if (prefixHits.length === 1) return prefixHits[0];

  // Substring — only return if unique
  const substrHits = allSuras.filter(s => {
    const candidate = isAr ? s.name_ar : s.name_ug;
    return norm(candidate).includes(needle);
  });
  if (substrHits.length === 1) return substrHits[0];

  return null;
}

function quranSearch(query, opts) {
  opts = opts || {};
  const lang = opts.lang || 'auto';
  const limit = Math.max(1, Math.min(500, opts.limit || 200));
  if (!query || !String(query).trim()) return [];
  const q = String(query).trim();

  // Normalize Arabic queries to match the seeded text_ar_simple normalization
  const isAr = isArabicScript(q);
  const qForArabicCols = isAr ? normalizeArabicQuery(q) : q;
  const qForUyghurCol = q; // Uyghur is not normalized at seed time

  if (hasQuranFTS) {
    try {
      // Use Arabic-normalized query for Arabic search; raw query for Uyghur
      const qToTokenize = (lang === 'ar' || (lang === 'auto' && isAr)) ? qForArabicCols : qForUyghurCol;
      const tokens = qToTokenize.split(/\s+/).map(w => w.replace(/["'*:]/g, '')).filter(Boolean);
      if (!tokens.length) return [];
      const ftsQuery = tokens.map(t => t + '*').join(' ');

      let sql;
      if (lang === 'ar') {
        sql = `SELECT a.id, a.sura, a.aya, a.text_ar, a.text_ug, ${quranGroupSql('a')},
               snippet(quran_fts, 0, '<mark>', '</mark>', '...', 10) AS snip_ar,
               '' AS snip_ug
               FROM quran_fts JOIN quran_ayas a ON a.id=quran_fts.rowid
               WHERE quran_fts.text_ar_simple MATCH ? ORDER BY rank LIMIT ?`;
      } else if (lang === 'ug') {
        sql = `SELECT a.id, a.sura, a.aya, a.text_ar, a.text_ug, ${quranGroupSql('a')},
               '' AS snip_ar,
               snippet(quran_fts, 1, '<mark>', '</mark>', '...', 10) AS snip_ug
               FROM quran_fts JOIN quran_ayas a ON a.id=quran_fts.rowid
               WHERE quran_fts.text_ug MATCH ? ORDER BY rank LIMIT ?`;
      } else {
        sql = `SELECT a.id, a.sura, a.aya, a.text_ar, a.text_ug, ${quranGroupSql('a')},
               snippet(quran_fts, 0, '<mark>', '</mark>', '...', 10) AS snip_ar,
               snippet(quran_fts, 1, '<mark>', '</mark>', '...', 10) AS snip_ug
               FROM quran_fts JOIN quran_ayas a ON a.id=quran_fts.rowid
               WHERE quran_fts MATCH ? ORDER BY rank LIMIT ?`;
      }
      return collapseQuranGroups(db.prepare(sql).all(ftsQuery, limit));
    } catch (e) {
      console.log('Quran FTS5 query failed, using LIKE fallback:', e.message);
    }
  }

  return quranSearchSimple(q, lang, limit);
}

function quranSearchSimple(q, lang, limit) {
  const isAr = isArabicScript(q);
  const qAr = isAr ? normalizeArabicQuery(q) : q;
  const qUg = q;

  let sql, params;
  if (lang === 'ar') {
    sql = `SELECT id, sura, aya, text_ar, text_ug, ${quranGroupSql('')} FROM quran_ayas
           WHERE text_ar_simple LIKE ? OR text_ar LIKE ? LIMIT ?`;
    params = ['%' + qAr + '%', '%' + qAr + '%', limit];
  } else if (lang === 'ug') {
    sql = `SELECT id, sura, aya, text_ar, text_ug, ${quranGroupSql('')} FROM quran_ayas
           WHERE text_ug LIKE ? LIMIT ?`;
    params = ['%' + qUg + '%', limit];
  } else {
    sql = `SELECT id, sura, aya, text_ar, text_ug, ${quranGroupSql('')} FROM quran_ayas
           WHERE text_ar_simple LIKE ? OR text_ar LIKE ? OR text_ug LIKE ? LIMIT ?`;
    params = ['%' + qAr + '%', '%' + qAr + '%', '%' + qUg + '%', limit];
  }
  const rows = db.prepare(sql).all(...params);
  return collapseQuranGroups(rows.map(r => ({ ...r, snip_ar: '', snip_ug: '' })));
}

// ========== NOTES (DOCUMENTS) ==========

// The first 120 characters of a note's text on one line — computed here, so the
// list never carries every note's whole text across the IPC.
const NOTE_PREVIEW_SQL = "substr(trim(replace(replace(replace(substr(content_text, 1, 240), char(13), ' '), char(10), ' '), char(9), ' ')), 1, 120)";

/** The notes in the list (not the trash), newest edit first. */
function notesGetAll() {
  return db.prepare(`
    SELECT id, title, created_at, updated_at, pinned, length(content_text) AS size,
           ${NOTE_PREVIEW_SQL} AS preview
    FROM note_documents WHERE deleted_at IS NULL ORDER BY updated_at DESC
  `).all();
}

function notesGet(id) {
  return db.prepare(`
    SELECT id, title, content_html, content_text, created_at, updated_at, deleted_at, pinned
    FROM note_documents WHERE id=?
  `).get(id) || null;
}

function notesCreate(title) {
  const info = db.prepare('INSERT INTO note_documents (title) VALUES (?)').run(title || 'يېڭى خاتىرە');
  return info.lastInsertRowid;
}

/** Write a note. A note in the trash is read-only: 0 rows are written. */
function notesUpdate(id, title, contentHtml, contentText) {
  return db.prepare(`
    UPDATE note_documents
    SET title=?, content_html=?, content_text=?, updated_at=datetime('now')
    WHERE id=? AND deleted_at IS NULL
  `).run(title || 'يېڭى خاتىرە', contentHtml || '', contentText || '', id).changes;
}

/**
 * Remove a note for good — with its versions (ON DELETE CASCADE) and the
 * words ignored in it. Only ever reached from the trash, an emptied trash,
 * the 30-day purge, or an untouched new note.
 */
function notesDelete(id) {
  db.transaction(() => {
    db.prepare('DELETE FROM note_documents WHERE id=?').run(id);
    db.prepare('DELETE FROM settings WHERE key=?').run('spell_ignore_note_' + id);
  })();
}

// ========== THE TRASH (W2) AND THE LIST (W3) ==========
// Deleting a note used to be one confirm() and gone. It now goes to the
// trash, from where it can be restored, is deleted for ever only from there,
// and is purged after 30 days. None of this, nor pinning, changes updated_at.

const NOTE_TRASH_DAYS = 30;
const DEFAULT_NOTE_TITLE = 'يېڭى خاتىرە';

/** Move a note to the trash. `now` (ms) is for the tests. */
function notesTrash(id, now) {
  const when = new Date(Number.isFinite(now) ? now : Date.now()).toISOString();
  return db.prepare('UPDATE note_documents SET deleted_at=? WHERE id=? AND deleted_at IS NULL').run(when, id).changes > 0;
}

function notesRestore(id) {
  return db.prepare('UPDATE note_documents SET deleted_at=NULL WHERE id=? AND deleted_at IS NOT NULL').run(id).changes > 0;
}

function notesTrashList() {
  return db.prepare(`
    SELECT id, title, created_at, updated_at, deleted_at, length(content_text) AS size,
           ${NOTE_PREVIEW_SQL} AS preview
    FROM note_documents WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC
  `).all();
}

/** Delete for ever — only a note that is already in the trash. */
function notesDeleteForever(id) {
  const row = db.prepare('SELECT deleted_at FROM note_documents WHERE id=?').get(id);
  if (!row || !row.deleted_at) return false;
  notesDelete(id);
  return true;
}

/** Empty the trash; returns how many notes were removed. */
function notesEmptyTrash() {
  const rows = db.prepare('SELECT id FROM note_documents WHERE deleted_at IS NOT NULL').all();
  for (const row of rows) notesDelete(row.id);
  return rows.length;
}

/** At startup: whatever has been in the trash for more than 30 days. */
function notesPurgeTrash(now) {
  const cutoff = new Date((Number.isFinite(now) ? now : Date.now()) - NOTE_TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const rows = db.prepare('SELECT id FROM note_documents WHERE deleted_at IS NOT NULL AND deleted_at < ?').all(cutoff);
  for (const row of rows) notesDelete(row.id);
  return rows.length;
}

function notesSetPinned(id, pinned) {
  return db.prepare('UPDATE note_documents SET pinned=? WHERE id=?').run(pinned ? 1 : 0, id).changes > 0;
}

/**
 * Search titles AND text: a literal phrase (instr, so % and _ are just
 * characters), case-insensitive for the letters that have case, 2–100
 * characters, at most 50 results, pinned first, never the trash.
 */
function notesSearch(query) {
  const q = String(query == null ? '' : query).trim();
  if (q.length < 2 || q.length > 100) return { ok: false, reason: 'length', notes: [] };
  const notes = db.prepare(`
    SELECT id, title, created_at, updated_at, pinned, length(content_text) AS size,
           ${NOTE_PREVIEW_SQL} AS preview
    FROM note_documents
    WHERE deleted_at IS NULL AND (instr(lower(title), lower(?)) > 0 OR instr(lower(content_text), lower(?)) > 0)
    ORDER BY pinned DESC, updated_at DESC, id DESC
    LIMIT 50
  `).all(q, q);
  return { ok: true, notes: notes };
}

/**
 * A new note the writer opened and left untouched — the default title and no
 * text — is removed when they leave it, instead of piling up in the list.
 * Checked here, not trusted from the renderer.
 */
function notesDiscardIfEmpty(id) {
  const row = db.prepare('SELECT title, content_text FROM note_documents WHERE id=?').get(id);
  if (!row) return false;
  const title = String(row.title || '').trim();
  if ((title && title !== DEFAULT_NOTE_TITLE) || String(row.content_text || '').trim()) return false;
  notesDelete(id);
  return true;
}

// ========== NOTE VERSIONS (W1) ==========
// A replace-all, an AI correction, a format paint over several paragraphs or
// a restore is permanent the moment autosave writes it. Each of them first
// keeps the note as it was, and «نەشر تارىخى» puts any version back. The
// rules come from the web edition's lib/notes/history.ts:
//
//   - a version identical to the note's newest is never stored twice; a
//     before-* reason relabels an identical newest open/auto instead, so a
//     note opened and at once replaced-all is found under the name the
//     writer will look for;
//   - auto at most every five minutes per note (and only after a save the
//     database confirmed — the renderer's side);
//   - at most 30 per note: the oldest auto goes first, then the oldest of any
//     reason, and never the newest.

const NOTE_VERSION_REASONS = ['open', 'auto', 'before-replace-all', 'before-paint', 'before-ai', 'before-restore'];
const MAX_NOTE_VERSIONS = 30;
const AUTO_VERSION_EVERY_MS = 5 * 60 * 1000;

/**
 * Keep the note as it is now, for `reason`. `now` (ms) is for the tests.
 * @returns {'kept'|'same'|'recent'|'refused'}
 */
function noteVersionKeep(noteId, reason, title, html, text, now) {
  const id = Number(noteId);
  if (NOTE_VERSION_REASONS.indexOf(reason) === -1 || !Number.isInteger(id) || id < 1) return 'refused';
  const when = Number.isFinite(now) ? now : Date.now();
  const t = String(title == null ? '' : title);
  const h = String(html == null ? '' : html);

  return db.transaction(() => {
    if (!db.prepare('SELECT 1 FROM note_documents WHERE id=?').get(id)) return 'refused';

    if (reason === 'auto') {
      const last = db.prepare('SELECT created_at FROM note_versions WHERE note_id=? AND reason=\'auto\' ORDER BY id DESC LIMIT 1').get(id);
      const lastAt = last ? Date.parse(last.created_at) : NaN;
      if (Number.isFinite(lastAt) && when - lastAt < AUTO_VERSION_EVERY_MS) return 'recent';
    }

    const newest = db.prepare('SELECT id, reason, title, content_html FROM note_versions WHERE note_id=? ORDER BY id DESC LIMIT 1').get(id);
    if (newest && newest.title === t && newest.content_html === h) {
      if (reason.indexOf('before-') === 0 && (newest.reason === 'open' || newest.reason === 'auto')) {
        db.prepare('UPDATE note_versions SET reason=? WHERE id=?').run(reason, newest.id);
      }
      return 'same';
    }

    db.prepare('INSERT INTO note_versions (note_id, reason, title, content_html, content_text, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, reason, t, h, String(text == null ? '' : text), new Date(when).toISOString());
    trimNoteVersions(id);
    return 'kept';
  })();
}

/** Over 30: the oldest auto first, then the oldest of any reason — never the newest. */
function trimNoteVersions(noteId) {
  const rows = db.prepare('SELECT id, reason FROM note_versions WHERE note_id=? ORDER BY id ASC').all(noteId);
  let excess = rows.length - MAX_NOTE_VERSIONS;
  if (excess <= 0) return;
  const candidates = rows.slice(0, -1);
  const order = candidates.filter(r => r.reason === 'auto').concat(candidates.filter(r => r.reason !== 'auto'));
  const remove = db.prepare('DELETE FROM note_versions WHERE id=?');
  for (const victim of order) {
    if (excess <= 0) break;
    remove.run(victim.id);
    excess--;
  }
}

function firstLine(text) {
  const line = String(text || '').split('\n').map(s => s.trim()).find(Boolean) || '';
  return line.length > 120 ? line.slice(0, 120) + '…' : line;
}

/** One note's versions, newest first — without their HTML, which only a preview needs. */
function noteVersionList(noteId) {
  return db.prepare(`
    SELECT id, note_id, reason, title, created_at,
           substr(content_text, 1, 400) AS head, length(content_text) AS chars
    FROM note_versions WHERE note_id=? ORDER BY id DESC
  `).all(Number(noteId)).map(r => ({
    id: r.id, note_id: r.note_id, reason: r.reason, title: r.title,
    created_at: r.created_at, first_line: firstLine(r.head), chars: r.chars || 0
  }));
}

function noteVersionGet(id) {
  return db.prepare('SELECT * FROM note_versions WHERE id=?').get(Number(id)) || null;
}

// ========== N-GRAM (legacy: now FTS5-backed; index funcs are no-ops) ==========

function hasNgramIndex(bookId) {
  // n-gram index removed; FTS5 covers this use case
  return true;
}

function ngramIndexBook(bookId, text) {
  // n-gram index removed; FTS5 covers this use case
  return;
}

function ngramRemoveBook(bookId) {
  // n-gram index removed; FTS5 covers this use case
  return;
}

function ngramIndexQuran() {
  // n-gram index removed; FTS5 covers this use case
  return;
}

function ngramFindWord(word) {
  word = String(word || '').trim();
  if (word.length < 2) return [];

  const results = [];
  const seenIds = new Set();

  if (hasFTS5) {
    try {
      const rows = db.prepare(
        'SELECT DISTINCT rowid AS id FROM book_fts WHERE book_fts MATCH ? LIMIT 100'
      ).all(word + '*');
      for (const row of rows) {
        if (!seenIds.has(row.id)) {
          seenIds.add(row.id);
          results.push({ bookId: row.id, positions: [] });
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (!results.length) {
    try {
      const rows = db.prepare(
        'SELECT DISTINCT book_id FROM book_content WHERE content LIKE ? LIMIT 100'
      ).all('%' + word + '%');
      for (const row of rows) {
        if (!seenIds.has(row.book_id)) {
          seenIds.add(row.book_id);
          results.push({ bookId: row.book_id, positions: [] });
        }
      }
    } catch (e) { /* ignore */ }
  }

  if (hasQuranFTS) {
    try {
      const row = db.prepare('SELECT 1 AS x FROM quran_fts WHERE quran_fts MATCH ? LIMIT 1')
        .get(word + '*');
      if (row) {
        results.push({ bookId: QURAN_BOOK_ID_UG, positions: [] });
        results.push({ bookId: QURAN_BOOK_ID_AR, positions: [] });
      }
    } catch (e) { /* ignore */ }
  } else {
    try {
      const row = db.prepare(
        'SELECT 1 AS x FROM quran_ayas WHERE text_ug LIKE ? OR text_ar_simple LIKE ? LIMIT 1'
      ).get('%' + word + '%', '%' + word + '%');
      if (row) {
        results.push({ bookId: QURAN_BOOK_ID_UG, positions: [] });
        results.push({ bookId: QURAN_BOOK_ID_AR, positions: [] });
      }
    } catch (e) { /* ignore */ }
  }

  return results;
}

function quranContentSnippet(needle, maxResults, ctx) {
  const MAX = Math.max(1, Math.min(50, maxResults || 5));
  const CTX = Math.max(10, Math.min(400, ctx || 90));
  const cleanNeedle = String(needle || '').trim();
  if (!cleanNeedle) return [];

  if (hasQuranFTS) {
    try {
      // Apply Arabic normalization for queries searching the Arabic FTS column
      const isAr = isArabicScript(cleanNeedle);
      const ftsNeedle = isAr ? normalizeArabicQuery(cleanNeedle) : cleanNeedle;
      const tokens = ftsNeedle.split(/\s+/).filter(t => t.length >= 2);
      if (!tokens.length) return [];
      const ftsQuery = tokens.length > 1
        ? '"' + tokens.join(' ') + '"'
        : tokens[0] + '*';

      const rows = db.prepare(`
        SELECT a.sura, a.aya, a.text_ug, a.text_ar_simple, ${quranGroupSql('a')},
               snippet(quran_fts, 0, '§MARK_OPEN§', '§MARK_CLOSE§', '...', 12) AS snip_ar,
               snippet(quran_fts, 1, '§MARK_OPEN§', '§MARK_CLOSE§', '...', 12) AS snip_ug
        FROM quran_fts
        JOIN quran_ayas a ON a.id = quran_fts.rowid
        WHERE quran_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      `).all(ftsQuery, MAX);

      const out = [];
      const groupsSeen = new Set();   // a shared translation is listed once
      for (const row of rows) {
        if (row.snip_ug && row.snip_ug.indexOf('§MARK_OPEN§') !== -1) {
          const key = row.sura + ':' + row.ug_from;
          if (groupsSeen.has(key)) continue;
          groupsSeen.add(key);
          out.push({
            snip: String(row.snip_ug).replace(/\s+/g, ' ').trim(),
            pos: 0, sura: row.sura, aya: row.aya, lang: 'ug'
          });
        } else if (row.snip_ar && row.snip_ar.indexOf('§MARK_OPEN§') !== -1) {
          out.push({
            snip: String(row.snip_ar).replace(/\s+/g, ' ').trim(),
            pos: 0, sura: row.sura, aya: row.aya, lang: 'ar'
          });
        }
      }
      if (out.length) return out;
    } catch (e) { /* fall through */ }
  }

  // Fallback substring scan
  // For Arabic columns: also try the normalized form so "إيمان" matches "ايمان"
  const lcNeedle = cleanNeedle.toLowerCase();
  const lcArNeedle = isArabicScript(cleanNeedle)
    ? normalizeArabicQuery(cleanNeedle).toLowerCase()
    : lcNeedle;
  const snippets = [];
  const groupsSeen = new Set();   // a shared translation is listed once

  function scanColumn(col, langTag) {
    if (snippets.length >= MAX) return;
    const rows = db.prepare(`SELECT sura, aya, ${col} AS txt, ${quranGroupSql('')} FROM quran_ayas ORDER BY sura, aya`).all();
    for (const row of rows) {
      if (snippets.length >= MAX) break;
      const text = row.txt || '';
      if (!text) continue;
      const lcText = text.toLowerCase();
      // Use Arabic-normalized needle for Arabic columns
      const needle = (langTag === 'ar') ? lcArNeedle : lcNeedle;
      const hit = lcText.indexOf(needle);
      if (hit === -1) continue;
      if (langTag === 'ug') {
        if (groupsSeen.has(row.sura + ':' + row.ug_from)) continue;
        groupsSeen.add(row.sura + ':' + row.ug_from);
      }

      const start = Math.max(0, hit - CTX);
      const end = Math.min(text.length, hit + needle.length + CTX);
      const before = text.slice(start, hit);
      const match = text.slice(hit, hit + needle.length);
      const after = text.slice(hit + needle.length, end);

      let snip = before + '§MARK_OPEN§' + match + '§MARK_CLOSE§' + after;
      if (start > 0) snip = '...' + snip;
      if (end < text.length) snip = snip + '...';

      snippets.push({
        snip: snip.replace(/\s+/g, ' ').trim(),
        pos: hit, sura: row.sura, aya: row.aya, lang: langTag
      });
    }
  }

  scanColumn('text_ug', 'ug');
  scanColumn('text_ar_simple', 'ar');
  return snippets;
}

// ========== CATEGORIES ==========

function getCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
}

function getCategoryNames() {
  return db.prepare('SELECT name FROM categories ORDER BY sort_order, id').all().map(r => r.name);
}

function addCategory(name, parentId) {
  const max = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM categories').get();
  const order = (max ? max.m : 0) + 1;
  db.prepare('INSERT OR IGNORE INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)')
    .run(name, parentId || null, order);
}

function renameCategory(oldName, newName) {
  const tx = db.transaction(() => {
    db.prepare('UPDATE categories SET name=? WHERE name=?').run(newName, oldName);
    db.prepare('UPDATE books SET category=? WHERE category=?').run(newName, oldName);
  });
  tx();
}

function deleteCategory(name) {
  db.prepare('DELETE FROM categories WHERE name=?').run(name);
}

function ensureDefaultCategories(defaultCats) {
  const existing = new Set(getCategoryNames());
  const stmt = db.prepare('INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)');
  defaultCats.forEach((cat, i) => {
    if (!existing.has(cat)) stmt.run(cat, i);
  });
}

// ========== BOOKMARKS / NOTES (book annotations) ==========

function getBookmarks(bookId) {
  return db.prepare('SELECT * FROM bookmarks WHERE book_id=? ORDER BY position').all(bookId);
}

function addBookmark(bookId, name, position) {
  const info = db.prepare('INSERT INTO bookmarks (book_id, name, position) VALUES (?, ?, ?)')
    .run(bookId, name, position);
  return info.lastInsertRowid;
}

function deleteBookmark(id) {
  db.prepare('DELETE FROM bookmarks WHERE id=?').run(id);
}

function getNotes(bookId) {
  return db.prepare('SELECT * FROM notes WHERE book_id=? ORDER BY created_at DESC').all(bookId);
}

function addNoteDB(bookId, text, position) {
  const info = db.prepare('INSERT INTO notes (book_id, text, position) VALUES (?, ?, ?)')
    .run(bookId, text, position);
  return info.lastInsertRowid;
}

function deleteNoteDB(id) {
  db.prepare('DELETE FROM notes WHERE id=?').run(id);
}

// ========== READING PROGRESS / RECENT / SETTINGS ==========

function getReadingProgress(bookId) {
  const row = db.prepare('SELECT * FROM reading_progress WHERE book_id=?').get(bookId);
  return row || { position: 0, page: 1 };
}

/** A place (K5): a whole, non-negative character offset — anything else is none. */
function placeOrNull(value) {
  return (typeof value === 'number' && Number.isInteger(value) && value >= 0) ? value : null;
}

/**
 * Does this library keep places yet (migration step 3)? It always does once
 * the app has started — unless the backup before the step failed, and then
 * the step did not run. Bookmarks and the reading position must still save in
 * that library, the way they did before.
 */
function keepsPlaces() {
  return db.prepare('PRAGMA table_info(reading_progress)').all().some(c => c.name === 'char_offset');
}

function saveReadingProgress(bookId, position, page, charOffset) {
  if (!keepsPlaces()) {
    db.prepare(`
      INSERT OR REPLACE INTO reading_progress (book_id, position, page, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).run(bookId, position, page || 1);
    return;
  }
  db.prepare(`
    INSERT OR REPLACE INTO reading_progress (book_id, position, page, char_offset, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(bookId, position, page || 1, placeOrNull(charOffset));
}

function addRecentRead(bookId) {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM recent_reads WHERE book_id=?').run(bookId);
    db.prepare('INSERT INTO recent_reads (book_id) VALUES (?)').run(bookId);
    db.prepare(`
      DELETE FROM recent_reads
      WHERE id NOT IN (SELECT id FROM recent_reads ORDER BY read_at DESC LIMIT 20)
    `).run();
  });
  tx();
}

function getRecentReads() {
  return db.prepare(`
    SELECT r.*, b.title, b.author, b.category, b.format
    FROM recent_reads r JOIN books b ON b.id = r.book_id
    ORDER BY r.read_at DESC LIMIT 20
  `).all();
}

function getSetting(key, defaultValue) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return defaultValue;
  try { return JSON.parse(row.value); }
  catch (e) { return row.value; }
}

function setSetting(key, value) {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, JSON.stringify(value));
}

function addSearchHistory(query, resultCount) {
  const tx = db.transaction(() => {
    db.prepare('INSERT INTO search_history (query, result_count) VALUES (?, ?)')
      .run(query, resultCount);
    db.prepare(`
      DELETE FROM search_history
      WHERE id NOT IN (SELECT id FROM search_history ORDER BY searched_at DESC LIMIT 50)
    `).run();
  });
  tx();
}

function getSearchHistory(limit) {
  return db.prepare('SELECT * FROM search_history ORDER BY searched_at DESC LIMIT ?').all(limit || 20);
}

/** «تارىخنى تازىلاش» (W20, K17): every search kept is deleted. Returns how many. */
function clearSearchHistory() {
  return db.prepare('DELETE FROM search_history').run().changes;
}

// ========== STATS ==========

function getStats() {
  const total = db.prepare('SELECT COUNT(*) AS c FROM books').get();
  const catCounts = db.prepare(`
    SELECT category, COUNT(*) AS cnt FROM books GROUP BY category ORDER BY cnt DESC
  `).all();
  const formatCounts = db.prepare(`
    SELECT format, COUNT(*) AS cnt FROM books GROUP BY format ORDER BY cnt DESC
  `).all();
  return {
    total: total ? total.c : 0,
    catBars: catCounts.map(r => ({ name: r.category, count: r.cnt })),
    formatBars: formatCounts.map(r => ({ format: r.format, count: r.cnt }))
  };
}

// ========== JSON MIGRATION (one-time, from legacy library.json) ==========

function migrateFromJSON(jsonData, contentDir) {
  if (!jsonData || !jsonData.books || jsonData.books.length === 0) return false;
  const existing = db.prepare('SELECT COUNT(*) AS c FROM books').get();
  if (existing.c > 0) return false;

  console.log('Migrating', jsonData.books.length, 'books from JSON to SQLite...');

  const tx = db.transaction(() => {
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)');
    (jsonData.cats || []).forEach((cat, i) => insertCat.run(cat, i));

    const insertBook = db.prepare(`
      INSERT INTO books (id, title, author, category, format, date, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertContent = db.prepare('INSERT OR REPLACE INTO book_content (book_id, content) VALUES (?, ?)');
    const insertFts = hasFTS5
      ? db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
      : null;

    for (const book of jsonData.books) {
      insertBook.run(
        book.id, book.title, book.author || '', book.category || '',
        book.format || 'TXT', book.date || '', book.desc || ''
      );
      if (contentDir) {
        const cp = path.join(contentDir, `${book.id}.txt`);
        if (fs.existsSync(cp)) {
          try {
            const content = fs.readFileSync(cp, 'utf-8');
            insertContent.run(book.id, content);
            if (insertFts) {
              try { insertFts.run(book.id, book.title, book.author || '', content); } catch (e) {}
            }
          } catch (e) {}
        }
      }
    }

    if (jsonData.theme) setSetting('theme', jsonData.theme);
    if (jsonData.darkMode !== undefined) setSetting('darkMode', jsonData.darkMode);

    if (jsonData.readPos) {
      const stmt = db.prepare('INSERT OR REPLACE INTO reading_progress (book_id, position) VALUES (?, ?)');
      for (const k of Object.keys(jsonData.readPos)) stmt.run(parseInt(k), jsonData.readPos[k]);
    }

    if (jsonData.bookmarks) {
      const stmt = db.prepare('INSERT INTO bookmarks (book_id, name, position) VALUES (?, ?, ?)');
      for (const k of Object.keys(jsonData.bookmarks)) {
        for (const bm of (jsonData.bookmarks[k] || [])) {
          stmt.run(parseInt(k), bm.name || '', bm.pos || 0);
        }
      }
    }

    if (jsonData.notes) {
      const stmt = db.prepare('INSERT INTO notes (book_id, text, position, created_at) VALUES (?, ?, ?, ?)');
      for (const k of Object.keys(jsonData.notes)) {
        for (const note of (jsonData.notes[k] || [])) {
          stmt.run(parseInt(k), note.text || '', note.pos || 0, note.date || new Date().toISOString());
        }
      }
    }

    if (jsonData.recent) {
      const stmt = db.prepare('INSERT INTO recent_reads (book_id, read_at) VALUES (?, ?)');
      for (const r of jsonData.recent.slice().reverse()) {
        stmt.run(r.id, r.time || new Date().toISOString());
      }
    }

    if (jsonData.nid) {
      try {
        db.prepare(`UPDATE sqlite_sequence SET seq=? WHERE name='books'`).run(jsonData.nid);
      } catch (e) {}
    }
  });

  tx();
  console.log('Migration complete!');
  return true;
}

// ========== UPSERT / SYNC (frontend compatibility) ==========

function upsertBook(id, title, author, category, format, date, description) {
  // The renderer sends the title it holds, which may be the one it imported
  // before the fold existed: it is stored as letters all the same.
  title = letters(title);
  author = letters(author);
  description = letters(description);
  const existing = getBook(id);
  if (existing) {
    db.prepare(`
      UPDATE books SET title=?, author=?, category=?, format=?, date=?, description=?, updated_at=datetime('now')
      WHERE id=?
    `).run(title, author || '', category || '', format || 'TXT', date || '', description || '', id);
  } else {
    db.prepare(`
      INSERT INTO books (id, title, author, category, format, date, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, title, author || '', category || '', format || 'TXT', date || '', description || '');
  }
  if (hasFTS5) {
    try {
      db.prepare('DELETE FROM book_fts WHERE rowid=?').run(id);
      const content = getBookContent(id);
      if (content) {
        db.prepare('INSERT INTO book_fts (rowid, title, author, content) VALUES (?, ?, ?, ?)')
          .run(id, title, author || '', content);
      }
    } catch (e) { /* ignore */ }
  }
}

/**
 * Write the renderer's book metadata. It NEVER deletes: a book missing from
 * the list is left alone (K4). Deleting is db-delete-book's job and nobody
 * else's — this used to delete every book the list did not mention, and one
 * failed read at startup sent an empty list.
 */
function syncBooks(books) {
  if (!Array.isArray(books)) return;
  const tx = db.transaction(() => {
    for (const b of books) {
      upsertBook(b.id, b.title, b.author, b.category, b.format, b.date, b.desc || b.description || '');
    }
  });
  tx();
}

function syncCategories(catNames) {
  if (!Array.isArray(catNames)) return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM categories').run();
    const stmt = db.prepare('INSERT OR IGNORE INTO categories (name, sort_order) VALUES (?, ?)');
    catNames.forEach((name, i) => stmt.run(name, i));
  });
  tx();
}

function syncBookmarks(bookmarksObj) {
  if (!bookmarksObj || typeof bookmarksObj !== 'object') return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM bookmarks').run();
    const places = keepsPlaces();
    const stmt = places
      ? db.prepare('INSERT INTO bookmarks (book_id, name, position, created_at, char_offset) VALUES (?, ?, ?, ?, ?)')
      : db.prepare('INSERT INTO bookmarks (book_id, name, position, created_at) VALUES (?, ?, ?, ?)');
    for (const bookIdStr of Object.keys(bookmarksObj)) {
      const bookId = parseInt(bookIdStr);
      for (const bm of (bookmarksObj[bookIdStr] || [])) {
        const row = [bookId, bm.name || '', bm.pos || 0, bm.date || new Date().toISOString()];
        if (places) row.push(placeOrNull(bm.off));
        stmt.run(...row);
      }
    }
  });
  tx();
}

function syncNotes(notesObj) {
  if (!notesObj || typeof notesObj !== 'object') return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM notes').run();
    const places = keepsPlaces();
    const stmt = places
      ? db.prepare('INSERT INTO notes (book_id, text, position, created_at, char_offset) VALUES (?, ?, ?, ?, ?)')
      : db.prepare('INSERT INTO notes (book_id, text, position, created_at) VALUES (?, ?, ?, ?)');
    for (const bookIdStr of Object.keys(notesObj)) {
      const bookId = parseInt(bookIdStr);
      for (const note of (notesObj[bookIdStr] || [])) {
        const row = [bookId, note.text || '', note.pos || 0, note.date || new Date().toISOString()];
        if (places) row.push(placeOrNull(note.off));
        stmt.run(...row);
      }
    }
  });
  tx();
}

// The percentages saveData() sends with the whole library. A book whose
// percentage is unchanged keeps its page and its exact place (K5) — this used
// INSERT OR REPLACE, which reset both on every theme change. A changed one
// makes the old place stale.
function syncReadingProgress(readPos) {
  if (!readPos || typeof readPos !== 'object') return;
  if (!keepsPlaces()) {
    const tx = db.transaction(() => {
      for (const bookIdStr of Object.keys(readPos)) saveReadingProgress(parseInt(bookIdStr), readPos[bookIdStr], 1);
    });
    tx();
    return;
  }
  const stmt = db.prepare(`
    INSERT INTO reading_progress (book_id, position, page, char_offset, updated_at)
    VALUES (?, ?, 1, NULL, datetime('now'))
    ON CONFLICT(book_id) DO UPDATE SET
      char_offset = CASE WHEN reading_progress.position = excluded.position THEN reading_progress.char_offset ELSE NULL END,
      updated_at = CASE WHEN reading_progress.position = excluded.position THEN reading_progress.updated_at ELSE excluded.updated_at END,
      position = excluded.position
  `);
  const tx = db.transaction(() => {
    for (const bookIdStr of Object.keys(readPos)) {
      stmt.run(parseInt(bookIdStr), readPos[bookIdStr]);
    }
  });
  tx();
}

function syncRecent(recent) {
  if (!Array.isArray(recent)) return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM recent_reads').run();
    const stmt = db.prepare('INSERT INTO recent_reads (book_id, read_at) VALUES (?, ?)');
    for (const r of recent) {
      stmt.run(r.id, r.time || new Date().toISOString());
    }
  });
  tx();
}

function getAllBookmarksGrouped() {
  const rows = db.prepare('SELECT * FROM bookmarks ORDER BY position').all();
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.book_id]) grouped[row.book_id] = [];
    grouped[row.book_id].push({
      id: String(row.id), name: row.name || '',
      pos: row.position || 0, off: placeOrNull(row.char_offset),
      date: row.created_at || new Date().toISOString()
    });
  }
  return grouped;
}

function getAllNotesGrouped() {
  const rows = db.prepare('SELECT * FROM notes ORDER BY created_at DESC').all();
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.book_id]) grouped[row.book_id] = [];
    grouped[row.book_id].push({
      id: String(row.id), text: row.text || '',
      pos: row.position || 0, off: placeOrNull(row.char_offset),
      date: row.created_at || new Date().toISOString()
    });
  }
  return grouped;
}

function getAllReadingProgress() {
  const rows = db.prepare('SELECT * FROM reading_progress').all();
  const out = {};
  for (const row of rows) out[row.book_id] = row.position || 0;
  return out;
}

function getRecentForFrontend() {
  return db.prepare(`
    SELECT r.book_id, r.read_at FROM recent_reads r
    JOIN books b ON b.id = r.book_id
    ORDER BY r.read_at DESC LIMIT 20
  `).all().map(r => ({ id: r.book_id, time: r.read_at || new Date().toISOString() }));
}

function getBookCount() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM books').get();
  return row ? row.n : 0;
}

function getMaxBookId() {
  const row = db.prepare('SELECT MAX(id) AS m FROM books').get();
  return row && row.m !== null ? row.m : 0;
}

module.exports = {
  initDB, saveDB, vacuum, close,
  // Schema migrations and backup
  MIGRATIONS, schemaVersion, runMigrations, backupTo, checkpoint,
  ftsRebuildPending, ftsRebuildStep,
  normalizeArabicQuery, isArabicScript,
  addBook, addBooksBatch, updateBook, deleteBook, getBook, getAllBooks, getBooksByCategory,
  getBookContent, saveBookContent, checkDuplicateHash,
  // A PDF's pages in the text, and where the PDF is (3.6)
  getPageMap, getBookOriginal, setBookOriginal,
  // Books stored as glyph codepoints (W18, K15)
  presentationFormsScan, presentationFormsFix,
  searchBooks, getAllSnippetsForBook,
  getCategories, getCategoryNames, addCategory, renameCategory, deleteCategory, ensureDefaultCategories,
  getBookmarks, addBookmark, deleteBookmark,
  getNotes, addNoteDB, deleteNoteDB,
  getReadingProgress, saveReadingProgress,
  addRecentRead, getRecentReads,
  getSetting, setSetting,
  addSearchHistory, getSearchHistory, clearSearchHistory,
  getStats, migrateFromJSON,
  // Sync functions for frontend compatibility
  upsertBook, syncBooks, syncCategories, syncBookmarks, syncNotes,
  syncReadingProgress, syncRecent,
  getAllBookmarksGrouped, getAllNotesGrouped, getAllReadingProgress,
  getRecentForFrontend, getMaxBookId, getBookCount,
  // Quran
  quranSuraExists, quranSeedBulk, quranGetSuras, quranGetAyas, quranGetAya, quranSearch, quranLookupSura,
  quranBookmarkList, quranBookmarkAdd, quranBookmarkRemove,
  migrationStripBasmalaAyah1,
  // Notes (documents)
  notesGetAll, notesGet, notesCreate, notesUpdate, notesDelete,
  // The trash and the list (W2, W3)
  notesTrash, notesRestore, notesTrashList, notesDeleteForever, notesEmptyTrash, notesPurgeTrash,
  notesSetPinned, notesSearch, notesDiscardIfEmpty,
  // Note versions (W1)
  NOTE_VERSION_REASONS, noteVersionKeep, noteVersionList, noteVersionGet,
  // Ngram
  hasNgramIndex, ngramIndexBook, ngramRemoveBook, ngramFindWord,
  // Quran ngram (virtual books)
  ngramIndexQuran, quranContentSnippet, QURAN_BOOK_ID_UG, QURAN_BOOK_ID_AR
};
