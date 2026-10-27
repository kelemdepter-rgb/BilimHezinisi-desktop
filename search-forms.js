// ============================================================================
// Search that understands Uyghur suffixes (3.6 Phase 3).
//
// The library search finds any part of a word (the owner's 3.5 decision), so
// «كىتاب» already finds «كىتابلار». What it could not do: a word typed WITH a
// suffix found only that form («مەدرىسىلەردە» missed «مەدرىسە»), and a stem
// that changes before a suffix was missed the other way too («بالا» →
// «بالىلار», «ئاياق» → «ئايىغى», «يۈرەك» → «يۈرىكى»).
//
// Built on the spellcheck engine already in this process — its dictionary
// and its suffix lists — never a second copy:
//
//   1. THE BASE. Known inflectional suffixes (the engine's ACCEPT tier and the
//      possessives it lacks, longest first, up to three in a row) are taken
//      off down to a stem of MIN_STEM letters or more; the change a suffix
//      made to the stem is undone (…ى → …ا / …ە, …ىغ → …اق, …ىك → …ەك). A
//      stem counts only if it is a dictionary word. A dictionary word that
//      nothing comes off is its own base.
//   2. THE FORMS. The base, and its stem as a suffix changes it: the last
//      vowel ا / ە raised to ى, with ق → غ and ك → گ after it.
//   3. A MATCH. A form, at the START of a word, followed up to the end of
//      the word by nothing or by known suffixes only (one to three, the
//      engine's SUGGEST tier and the possessives). A first suffix that is a
//      word of its own (a noun such as «خانا») must be an inflection the
//      ACCEPT tier knows: «كىتابخانا» is not a form of «كىتاب». The plain
//      substring hit of the exact query is always kept, so the forms can
//      only add results, never take one away.
//
// Arabic words (letters the dictionary does not hold, vowel marks) and
// words under three letters get no forms: they are found as before.
// ============================================================================

'use strict';

const engine = require('./src/spellcheck/engine');
const { normalizeForLookup, isCheckable, hasWord } = require('./src/spellcheck/dictionary');
const { harmonyOf } = require('./src/spellcheck/morphology');
const { ACCEPT_SUFFIXES, SUGGEST_SUFFIXES, MIN_STEM, MAX_SUFFIX } = require('./src/spellcheck/suffixes.generated');

const VOWELS = new Set(['ا', 'ە', 'ې', 'و', 'ۇ', 'ۆ', 'ۈ', 'ى']);
// The possessives the generated lists cannot hold (they count tails of two
// letters or more): «ئايىغ» + «ى», «ئانى» + «سى», «بالا» + «م» / «ڭ».
const POSSESSIVES = ['ى', 'سى', 'م', 'ڭ'];
const ACCEPT = new Set(ACCEPT_SUFFIXES.map(rule => rule[0]));
/** What may come off a typed word on the way to its base: inflection only. */
const STRIP = new Set([...ACCEPT, ...POSSESSIVES]);
/** What may follow a form in a text. */
const TAIL = new Set([...SUGGEST_SUFFIXES, ...ACCEPT, ...POSSESSIVES]);
const MAX_CHAIN = 3;
const MAX_TAIL = MAX_SUFFIX * MAX_CHAIN;
const WORD_CHAR = /[\p{L}\p{M}]/u;
const SEPARATOR = /[\s\p{P}]/u;

function lastVowel(word) {
  for (let i = word.length - 1; i >= 0; i--) if (VOWELS.has(word[i])) return i;
  return -1;
}

/**
 * The stem a suffix changed, put back: «بالى» → «بالا», «مەدرىسى» →
 * «مەدرىسە», «ئايىغ» → «ئاياق», «يۈرىك» → «يۈرەك». Only a last vowel ى with at
 * most one letter after it, in a word of two syllables or more; the vowel the
 * word's harmony asks for is tried first.
 */
function undoChange(stem) {
  const i = lastVowel(stem);
  if (i < 0 || stem[i] !== 'ى' || stem.length - 1 - i > 1) return [];
  const head = stem.slice(0, i);
  if (lastVowel(head) < 0) return [];
  const after = stem.slice(i + 1);
  const finals = after === 'غ' ? ['ق', 'غ'] : after === 'گ' ? ['ك', 'گ'] : [after];
  const vowels = harmonyOf(head) === 'front' ? ['ە', 'ا'] : ['ا', 'ە'];
  const out = [];
  for (const v of vowels) for (const f of finals) out.push(head + v + f);
  return out;
}

/** The changed stems of a base: the last ا / ە raised to ى, ق → غ and ك → گ after it. */
function raise(base) {
  const i = lastVowel(base);
  if (i < 0 || (base[i] !== 'ا' && base[i] !== 'ە') || base.length - 1 - i > 1) return [];
  const head = base.slice(0, i);
  if (lastVowel(head) < 0) return [];   // one syllable: nothing changes
  const after = base.slice(i + 1);
  const out = [head + 'ى' + after];
  if (after === 'ق') out.push(head + 'ىغ');
  if (after === 'ك') out.push(head + 'ىگ');
  return out;
}

/**
 * The base of a typed word, or null (see 1. above).
 *
 * A possessive the ACCEPT tier does not hold («ى», «سى», «م», «ڭ») comes off
 * a dictionary word only when that undoes a stem change («ئايىغى» →
 * «ئاياق»): taken off «ئىمام», «م» left «ئىما», a word of its own, and the
 * search found «ئىمان» (measured, Phase 3).
 */
function findBase(dict, word) {
  const isWord = hasWord(dict, word);
  const seen = new Set();
  let frontier = [word];
  for (let depth = 0; depth < MAX_CHAIN && frontier.length; depth++) {
    const next = [];
    for (const w of frontier) {
      for (let take = Math.min(MAX_SUFFIX, w.length - MIN_STEM); take >= 1; take--) {
        const piece = w.slice(w.length - take);
        if (!STRIP.has(piece)) continue;
        const stem = w.slice(0, w.length - take);
        if (seen.has(stem)) continue;
        seen.add(stem);
        for (const candidate of undoChange(stem)) if (hasWord(dict, candidate)) return candidate;
        if (isWord && !ACCEPT.has(piece)) continue;
        if (hasWord(dict, stem)) return stem;
        next.push(stem);
      }
    }
    frontier = next;
  }
  return isWord ? word : null;
}

/**
 * `{ word, base, forms }` for one typed word: the forms to look for, base
 * first. A word that gets none (Arabic, under three letters, no base the
 * dictionary knows) has `base: null, forms: []` — it is found as typed.
 */
function formsFor(typed) {
  const word = normalizeForLookup(typed);
  const none = { word: word, base: null, forms: [] };
  if (word.length < 3 || !isCheckable(word)) return none;
  const dict = engine.getDictionary();
  if (!dict) return none;
  const base = findBase(dict, word);
  if (!base) return none;
  const forms = [base];
  for (const r of raise(base)) if (forms.indexOf(r) === -1) forms.push(r);
  return { word: word, base: base, forms: forms };
}

// After a RAISED stem every suffix must be a noun's: a possessive, the
// plural, a case or a particle. Verbs raise too: «ئاتا» → «ئاتى» found
// «ئاتىغان», «ئاتىدى», «ئاتىماي» (ئات‑ / ئاتا‑), and «سۈرە» → «سۈرى» found
// «سۈرىتى» (سۈرەت) — measured on the library's own vocabulary, Phase 3.
const NOUN_SUFFIXES = new Set(['ى', 'سى', 'م', 'ىم', 'ڭ', 'ىڭ', 'ڭىز', 'ىڭىز', 'مىز', 'ىمىز', 'ڭلار', 'ىڭلار',
  'لار', 'لەر', 'لىرى', 'نى', 'نىڭ', 'غا', 'گە', 'قا', 'كە', 'دا', 'دە', 'تا', 'تە', 'دىن', 'تىن', 'دىكى',
  'تىكى', 'دەك', 'تەك', 'چە', 'غىچە', 'گىچە', 'قىچە', 'كىچە', 'غىمۇ', 'گىمۇ', 'قىمۇ', 'كىمۇ', 'مۇ', 'دۇر',
  'تۇر', 'چۇ']);
// A consonant-final stem is raised only before a vowel: «نامىز» + «ى».
const NOUN_SUFFIXES_AFTER_CONSONANT = new Set(['ى', 'ىم', 'ىڭ', 'ىمىز', 'ىڭىز', 'ىڭلار']);

/**
 * Is `tail` nothing, or one to three known suffixes in a row? After a raised
 * stem (`raised`: the set its first suffix comes from) it cannot be empty,
 * and every suffix must be a noun's.
 */
function tailFits(dict, tail, raised) {
  if (!tail) return !raised;
  if (tail.length > MAX_TAIL) return false;
  if (!raised && dict && beginsWithWord(dict, tail)) return false;
  // reach[i]: tail.slice(0, i) splits into k suffixes (bit k set).
  const reach = new Uint8Array(tail.length + 1);
  reach[0] = 1;
  for (let i = 0; i < tail.length; i++) {
    if (!reach[i]) continue;
    for (let n = 1; n <= MAX_SUFFIX && i + n <= tail.length; n++) {
      const piece = tail.slice(i, i + n);
      if (!(raised ? (i === 0 ? raised : NOUN_SUFFIXES) : TAIL).has(piece)) continue;
      reach[i + n] |= (reach[i] << 1) & 0x0f;
    }
  }
  return (reach[tail.length] & 0x0e) !== 0;   // one to three pieces
}

/**
 * Does the tail begin with a word of its own — three letters or more, or
 * one with its stem change («خانى» is «خانا») — that the ACCEPT tier does
 * not know as a suffix? Then the form begins a compound, not an inflection:
 * «كىتابخانا» is not a form of «كىتاب», nor «بالاخانىنىڭ» of «بالا».
 */
function beginsWithWord(dict, tail) {
  for (let k = 3; k <= tail.length; k++) {
    const head = tail.slice(0, k);
    if (ACCEPT.has(head)) continue;
    if (hasWord(dict, head) || undoChange(head).some(w => hasWord(dict, w))) return true;
  }
  return false;
}

function isWordChar(ch) { return !!ch && WORD_CHAR.test(ch); }

function wordEndFrom(text, i) {
  while (i < text.length && isWordChar(text[i])) i++;
  return i;
}

/** The end of a form of `w` starting exactly at `at` (a word start), or -1. */
function formAt(dict, text, at, w) {
  let best = -1;
  const afterRaised = VOWELS.has(w.base[w.base.length - 1]) ? NOUN_SUFFIXES : NOUN_SUFFIXES_AFTER_CONSONANT;
  for (const form of w.forms) {
    if (!text.startsWith(form, at)) continue;
    const end = wordEndFrom(text, at + form.length);
    const first = form === w.base ? null : afterRaised;
    if (end > best && tailFits(dict, text.slice(at + form.length, end), first)) best = end;
  }
  return best;
}

/**
 * A search, compiled once: `findAll(text, limit)` gives the spans of every
 * hit in a LOWER-CASED text, in order, never overlapping — `{ start, end,
 * word }`, `word` true for a hit through the forms (it spans the whole word
 * found). `opts.forms === false` keeps only the exact query.
 */
function compile(query, opts) {
  const useForms = !(opts && opts.forms === false);
  const exact = String(query == null ? '' : query).toLowerCase().replace(/\s+/g, ' ').trim();
  const words = exact ? exact.split(' ').map(w => useForms ? formsFor(w) : { word: w, base: null, forms: [] }) : [];
  const withForms = words.some(w => w.forms.length);
  const dict = withForms ? engine.getDictionary() : null;

  function exactHits(text, out, limit) {
    if (!exact) return;
    let i = text.indexOf(exact);
    while (i !== -1 && out.length < limit) {
      out.push({ start: i, end: i + exact.length, word: false });
      i = text.indexOf(exact, i + exact.length);
    }
  }

  /** The end of words[k] at `at`, by its forms or as typed; -1 if neither. */
  function wordAt(text, at, k) {
    const w = words[k];
    const viaForm = w.forms.length ? formAt(dict, text, at, w) : -1;
    if (viaForm !== -1) return viaForm;
    return text.startsWith(w.word, at) ? at + w.word.length : -1;
  }

  /** A phrase of all the words from `at`, separated only by spaces and punctuation. */
  function phraseAt(text, at) {
    let end = wordAt(text, at, 0);
    for (let k = 1; k < words.length && end !== -1; k++) {
      let p = end;
      while (p < text.length && SEPARATOR.test(text[p])) p++;
      if (p === end) return -1;
      end = wordAt(text, p, k);
    }
    return end;
  }

  function formHits(text, out, limit) {
    if (!withForms) return;
    // Every place the first word can begin through a form or as typed — at
    // the start of a word. Each lead is walked in order and stops at `limit`
    // hits: the first `limit` of all of them are among those.
    const seen = new Set();
    const leads = words[0].forms.length ? words[0].forms.concat([words[0].word]) : [words[0].word];
    for (const lead of leads) {
      let found = 0;
      let i = text.indexOf(lead);
      while (i !== -1 && found < limit) {
        if (!isWordChar(text[i - 1]) && !seen.has(i)) {
          seen.add(i);
          const end = phraseAt(text, i);
          if (end !== -1) { out.push({ start: i, end: end, word: true }); found++; }
        }
        i = text.indexOf(lead, i + 1);
      }
    }
  }

  function findAll(text, limit) {
    const max = limit || Infinity;
    const hits = [];
    exactHits(text, hits, max);
    formHits(text, hits, max);
    hits.sort((a, b) => a.start - b.start || b.end - a.end);
    const out = [];
    for (const h of hits) {
      const last = out[out.length - 1];
      if (last && h.start < last.end) continue;
      out.push(h);
      if (out.length >= max) break;
    }
    return out;
  }

  /**
   * The full-text index query that finds every book where a hit through the
   * forms can be: each word's forms (or the word itself) at the start of a
   * token. null when no word has forms — then only the exact query is looked
   * for, in every book, as before.
   */
  function ftsQuery() {
    if (!withForms) return null;
    const quote = s => '"' + s.replace(/"/g, '""') + '"*';
    return words.map(w => '(' + (w.forms.length ? w.forms.concat([w.word]) : [w.word]).map(quote).join(' OR ') + ')').join(' AND ');
  }

  /**
   * Every different word the forms found in `text` (lower-cased), as it is
   * written there — what the reader marks besides the query as typed.
   */
  function foundWords(text, source, limit) {
    const out = [];
    for (const span of findAll(text, limit || 20000)) {
      if (!span.word) continue;
      const w = (source || text).slice(span.start, span.end);
      if (out.indexOf(w) === -1) out.push(w);
    }
    return out;
  }

  // The forms beyond what was typed, for «ئىزدەلگەن شەكىللەر».
  const added = [];
  for (const w of words) for (const f of w.forms) if (f !== w.word && added.indexOf(f) === -1) added.push(f);

  return { query: exact, words: words, forms: added, withForms: withForms, findAll: findAll, foundWords: foundWords, ftsQuery: ftsQuery };
}

/**
 * A text the way a search compares it: lower-cased — but only when it holds
 * a letter that has a lower case at all. Uyghur and Arabic have none, and
 * lower-casing 100 MB of them took 0.6 s for nothing (measured, Phase 3).
 */
const CASED = /[A-ZÀ-ɏͰ-ԯḀ-῿]/;
function lowered(text) {
  const s = String(text == null ? '' : text);
  return CASED.test(s) ? s.toLowerCase() : s;
}

module.exports = { formsFor, compile, lowered, tailFits, undoChange, raise };
