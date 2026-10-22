'use strict';

// ============================================================================
// Personal-dictionary entries that look like two words stuck together (W8).
//
// Ported from the web edition's lib/spellcheck/glued.ts. Before v3.5 a line
// end was not a word boundary (the owner's bug 2): «لۇغەتكە قوشۇش» on the
// last word of a paragraph stored it glued to the first word of the next —
// «مەنىڭچۈشەنمىگەن» — and from then on a real misspelling looked correct.
// The dictionary panel marks such entries so the writer can find them.
// ============================================================================

const { hasWord, normalizeForLookup } = require('./dictionary');
const { isCorrect } = require('./check');

/** Long enough that two real words could be in it. */
const GLUED_MIN_LETTERS = 8;
/** Each half at least this long, so a suffix alone never counts as a word. */
const GLUED_MIN_PART = 3;

/**
 * 8 letters or more, not a word the checker accepts on its own, and
 * splittable into two dictionary words of 3 letters or more. Uyghur writes
 * real compounds this way too, so this is a hint for the writer, never a
 * reason to remove anything; a hyphen is the writer's own join and is never
 * questioned.
 */
function looksGlued(dictionary, word) {
  const normalized = normalizeForLookup(word);
  if (normalized.indexOf('-') !== -1) return false;
  const letters = Array.from(normalized);
  if (letters.length < GLUED_MIN_LETTERS) return false;
  if (isCorrect(dictionary, normalized)) return false;
  for (let cut = GLUED_MIN_PART; cut <= letters.length - GLUED_MIN_PART; cut++) {
    if (hasWord(dictionary, letters.slice(0, cut).join('')) && hasWord(dictionary, letters.slice(cut).join(''))) {
      return true;
    }
  }
  return false;
}

module.exports = { looksGlued, GLUED_MIN_LETTERS, GLUED_MIN_PART };
