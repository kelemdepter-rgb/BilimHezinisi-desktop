/**
 * The spellchecker as the main process sees it.
 *
 * WHY IT LIVES HERE AND NOT IN A WORKER. The web edition runs this engine in a
 * Web Worker. The renderer here is loaded with `mainWindow.loadFile(...)`, so
 * its origin is `file://` and Chromium refuses to start a dedicated Worker from
 * a file:// script; the ways around that are relaxing the CSP to allow
 * `worker-src blob:` or moving the whole app to a custom protocol, both of them
 * risk for no benefit. The main process is already a separate OS process from
 * the renderer, so running the engine here keeps typing off the critical path
 * just as well.
 *
 * Measured on this machine with the shipped artifact: loading is 36 ms,
 * checking a 5,000-word note is 11 ms, and one suggestion is about 5 ms — 103 ms
 * for a pathological 35-character token. The check runs on a debounce and the
 * suggestion runs on a click, so both are comfortable.
 *
 * EVERYTHING HERE FAILS OPEN. If the artifact is missing or corrupt, every
 * function answers "spelled correctly" and logs once. A spellchecker that
 * cannot load must never be able to break the notebook.
 */
const fs = require('fs');
const path = require('path');

const {
  UYGHUR_LETTERS,
  normalizeForLookup,
  tokenize,
  unpackDictionary
} = require('./dictionary');
const { isCorrect, suggest: suggestFor } = require('./check');
const { looksGlued } = require('./glued');

const ASSETS = path.join(__dirname, '..', '..', 'assets', 'spellcheck');
const DICT_PATH = path.join(ASSETS, 'uyghur-dict.bin');
const CORRECTIONS_PATH = path.join(ASSETS, 'uyghur_corrections.json');

let dictionary = null;
let corrections = new Map();
let personal = new Set();
let loadFailed = false;
let loadMs = 0;

/**
 * Read the artifacts. Lazy — nothing happens until spell check is switched on —
 * and idempotent, so the renderer can call it on every toggle.
 */
function load() {
  if (dictionary || loadFailed) return;
  const started = Date.now();
  try {
    const buffer = fs.readFileSync(DICT_PATH);
    // unpackDictionary wants a real ArrayBuffer. A Node Buffer is a VIEW into a
    // shared pool, so handing over `buffer.buffer` would read whatever else
    // happens to live in that pool — slice out exactly this file's bytes.
    const bytes = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    dictionary = unpackDictionary(bytes);

    corrections = new Map();
    try {
      const table = JSON.parse(fs.readFileSync(CORRECTIONS_PATH, 'utf-8'));
      for (const wrong of Object.keys(table)) corrections.set(wrong, table[wrong]);
    } catch (e) {
      // The corrections table is an optimisation, not a requirement: without it
      // the checker still works, it just loses the hand-collected pairs.
      console.warn('[spellcheck] corrections table unreadable:', e && e.message);
    }

    loadMs = Date.now() - started;
    console.log('[spellcheck] ' + dictionary.size + ' words + ' + corrections.size +
                ' corrections in ' + loadMs + ' ms');
  } catch (e) {
    loadFailed = true;
    dictionary = null;
    console.error('[spellcheck] dictionary unavailable — spell check disabled:', e && e.message);
  }
}

function isReady() {
  return dictionary !== null;
}

/** Words the user added to their personal dictionary, sent over from the renderer. */
function setPersonal(words) {
  personal = new Set(
    (Array.isArray(words) ? words : [])
      .map((word) => normalizeForLookup(word))
      .filter(Boolean)
  );
  return { ok: true, words: personal.size };
}

/** Load (once) and report what happened, so the UI can say something true. */
function init(personalWords) {
  if (Array.isArray(personalWords)) setPersonal(personalWords);
  load();
  if (!dictionary) return { ready: false, reason: 'dictionary-unavailable' };
  return { ready: true, words: dictionary.size, corrections: corrections.size, loadMs };
}

/**
 * Every misspelled word of a text, as offsets into THAT SAME STRING.
 *
 * The renderer sends the flattened text rather than a word list on purpose. It
 * cannot require() anything (contextIsolation is on), so tokenizing there would
 * mean a second copy of WORD_PATTERN, UYGHUR_LETTERS, normalizeForLookup and
 * isCheckable — four constants that must agree exactly with these or the
 * offsets drift and the underline lands on the wrong word. One source of truth
 * instead: the text goes out, the positions come back.
 */
function checkText(text) {
  load();
  if (!dictionary) return [];
  const source = String(text == null ? '' : text);
  const out = [];
  for (const token of tokenize(source)) {
    if (isCorrect(dictionary, token.word, personal)) continue;
    out.push({ word: token.word, start: token.start, end: token.end });
  }
  return out;
}

/** Ranked corrections for one word, best first. */
function suggest(word) {
  load();
  if (!dictionary) return [];
  return suggestFor(dictionary, String(word == null ? '' : word), {
    alphabet: UYGHUR_LETTERS,
    corrections
  });
}

/** Is this one word spelled correctly? Kept for parity with the old renderer API. */
function check(word) {
  load();
  if (!dictionary) return true;
  return isCorrect(dictionary, String(word == null ? '' : word), personal);
}

/**
 * Which of `words` look like two words glued together (glued.js) — the
 * personal-dictionary panel marks them. A hint only: nothing is removed.
 */
function glued(words) {
  load();
  if (!dictionary || !Array.isArray(words)) return [];
  return words.filter((word) => typeof word === 'string' && looksGlued(dictionary, word));
}

module.exports = { init, isReady, setPersonal, checkText, suggest, check, glued };
