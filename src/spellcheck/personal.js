'use strict';

// ============================================================================
// The personal dictionary's rules (W8, K12) — main process.
//
// The writer's own words live in the settings table (spell_user_words) and are
// told to the engine; until v3.5 they could be added but never seen, deleted,
// backed up or moved. The panel in the notebook now lists them, and exports and
// imports them as a JSON array — the same file the web edition makes
// (lib/spellcheck/personal.ts), so a dictionary moves between the two.
//
// An imported file is UNTRUSTED input. Nothing in it is executed or rendered as
// HTML: it is parsed as JSON, and only strings that are exactly one word by the
// engine's own rules survive. «Exactly one word» is decided here, with the same
// tokenizer the checker uses, so the renderer never holds a second copy.
// ============================================================================

const { tokenize, isCheckable } = require('./dictionary');

const MAX_PERSONAL_WORDS = 5000;
const MIN_WORD_CHARS = 2;
const MAX_WORD_CHARS = 64;
/** A full dictionary of 64-character words is ~1.3 MB; anything larger is not one. */
const MAX_IMPORT_BYTES = 2000000;
const EXPORT_FILE_NAME = 'bilim-hezinisi-lughet.json';

/**
 * Is this one word, by the checker's own rules, of 2–64 characters?
 * @returns {{ ok: boolean, reason?: 'length'|'not-one-word'|'not-checkable'|'not-text', word?: string }}
 */
function validatePersonalWord(value) {
  if (typeof value !== 'string') return { ok: false, reason: 'not-text' };
  const text = value.trim();
  const length = Array.from(text).length;
  if (length < MIN_WORD_CHARS || length > MAX_WORD_CHARS) return { ok: false, reason: 'length' };
  const tokens = tokenize(text);
  if (tokens.length !== 1 || tokens[0].word !== text) return { ok: false, reason: 'not-one-word' };
  if (!isCheckable(text)) return { ok: false, reason: 'not-checkable' };
  return { ok: true, word: text };
}

/**
 * A chosen file's text merged into `existing`. Every entry that is not one
 * word of 2–64 characters is refused; a word already there, or twice in the
 * file, is simply dropped; whatever would take the dictionary past 5,000 words
 * is refused too, so the count the writer is told adds up.
 */
function mergeImport(existing, text) {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) return { ok: false, reason: 'too_big' };
  let parsed;
  try { parsed = JSON.parse(text); } catch (e) { return { ok: false, reason: 'not_json' }; }
  if (!Array.isArray(parsed)) return { ok: false, reason: 'not_array' };

  const words = Array.isArray(existing) ? existing.slice() : [];
  const present = new Set(words);
  let added = 0;
  let rejected = 0;
  for (const entry of parsed) {
    const checked = validatePersonalWord(entry);
    if (!checked.ok) { rejected++; continue; }
    if (present.has(checked.word)) continue;
    if (words.length >= MAX_PERSONAL_WORDS) { rejected++; continue; }
    present.add(checked.word);
    words.push(checked.word);
    added++;
  }
  return { ok: true, words: words, added: added, rejected: rejected };
}

/** The file «چىقىرىش» writes: a JSON array of strings, one word a line. */
function exportPersonal(words) {
  return JSON.stringify(Array.isArray(words) ? words.filter(w => typeof w === 'string') : [], null, 2) + '\n';
}

module.exports = {
  MAX_PERSONAL_WORDS, MIN_WORD_CHARS, MAX_WORD_CHARS, MAX_IMPORT_BYTES, EXPORT_FILE_NAME,
  validatePersonalWord, mergeImport, exportPersonal
};
