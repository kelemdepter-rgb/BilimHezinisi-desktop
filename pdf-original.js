// ============================================================================
// Where a PDF book's original file is (3.6).
//
// The PDF is never copied into the library. At import its path, size, time
// and SHA-256 are recorded (database.js, migration step 7); later the app
// asks whether it is still there:
//
//   found    the file at the recorded path is the book (same size and time,
//            or, if those changed, the same SHA-256);
//   moved    a PDF was recorded, but the file at its path is gone or is
//            another file;
//   missing  no PDF was ever recorded — a book imported before 3.6.
//
// For moved and missing the owner points to the file. The same file (same
// SHA-256) is taken at once; any other file only after the owner confirms it
// is the same book — `confirmDifferent` is the question, a native dialog in
// main.js and a stand-in in the tests.
// ============================================================================

'use strict';

const fs = require('fs');
const crypto = require('crypto');

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(file)
      .on('error', reject)
      .on('data', chunk => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')));
  });
}

/** { path, size, mtime (ms, whole), sha256 } of a file; throws if it is not one. */
async function fileFacts(file) {
  const st = await fs.promises.stat(file);
  if (!st.isFile()) throw new Error('not a file: ' + file);
  return { path: file, size: st.size, mtime: Math.round(st.mtimeMs), sha256: await hashFile(file) };
}

/**
 * found | moved | missing for a book's recorded original
 * (database.getBookOriginal). Hashes the file only when its size or time
 * differ from what was recorded.
 */
async function originalStatus(original) {
  if (!original || !original.path || !original.sha256) return 'missing';
  let st;
  try { st = await fs.promises.stat(original.path); } catch (e) { return 'moved'; }
  if (!st.isFile()) return 'moved';
  if (st.size === original.size && Math.round(st.mtimeMs) === original.mtime) return 'found';
  if (st.size !== original.size) return 'moved';
  try {
    return (await hashFile(original.path)) === original.sha256 ? 'found' : 'moved';
  } catch (e) {
    return 'moved';
  }
}

/**
 * The owner points to `file` as book `bookId`'s PDF. The same file is
 * recorded at once; another — or any file for a book that never had one
 * recorded — only if `confirmDifferent(facts)` resolves true.
 *
 * @returns {Promise<{ok: boolean, same?: boolean, cancelled?: boolean, facts?: object}>}
 */
async function locateOriginal(database, bookId, file, confirmDifferent) {
  const facts = await fileFacts(file);
  const recorded = database.getBookOriginal(bookId);
  const same = !!recorded.sha256 && recorded.sha256 === facts.sha256;
  if (!same) {
    const yes = typeof confirmDifferent === 'function' ? await confirmDifferent(facts, recorded) : false;
    if (!yes) return { ok: false, cancelled: true };
  }
  database.setBookOriginal(bookId, facts);
  return { ok: true, same: same, facts: facts };
}

module.exports = { hashFile, fileFacts, originalStatus, locateOriginal };
