// ============================================================================
// Glyph codepoints, folded back into letters (W18, K15). Main process.
//
// Unicode carries two blocks of Arabic PRESENTATION FORMS: one codepoint per
// drawn shape of a letter, so ق has four, depending on where it stands in the
// word. They exist so legacy encodings can round-trip; text is meant to be
// stored as letters and shaped when it is drawn. Some Word installations save
// Uyghur that way regardless, and the result looks perfect on screen and is a
// different string to every program that reads it: invisible to search, its
// own author in the list, useless when a reader copies it out.
//
// Ported from the web edition: lib/books/presentation-forms.ts (the fold) and
// scripts/normalize-presentation-forms.mjs (the checks a repair must pass
// before it is written). database.js applies `normalizeImportedText` at every
// way text enters the library, and «كىتابلارنى تەكشۈرۈش» repairs what is already
// stored (database.js, presentationFormsFix).
//
// THE ONE THING NOT TO DO HERE is run normalize('NFKC') over a whole string.
// NFKC also expands the religious ligatures — ﷲ (U+FDF2) into four letters,
// ﷺ (U+FDFA) into the eighteen-character phrase it stands for — and those are
// content. So the fold goes character by character, and only over the two
// LETTER ranges: U+FDF0–U+FDFD is never touched, by construction.
// ============================================================================

'use strict';

/** Arabic Presentation Forms-B: every Arabic letter, one codepoint per shape. */
const FORMS_B_FIRST = 0xFE70;
const FORMS_B_LAST = 0xFEFF;

/**
 * Arabic Presentation Forms-A, the LETTER range. The block goes on past
 * U+FBFF into word ligatures and, at U+FDF0–U+FDFD, the religious ones;
 * neither belongs in a letter fold.
 */
const FORMS_A_FIRST = 0xFB50;
const FORMS_A_LAST = 0xFBFF;

/** The lam-alef ligatures: one codepoint, two letters. */
const LAM_ALEF_FIRST = 0xFEF5;
const LAM_ALEF_LAST = 0xFEFC;

/**
 * The Uyghur hamza ligatures — ئا ئە ئو ئۇ ئۆ ئۈ ئې ئى as one codepoint each
 * (YEH WITH HAMZA ABOVE WITH ALEF … ALEF MAKSURA). They fold to exactly the
 * two letters a Uyghur keyboard types. The web edition's repair allows only
 * lam-alef, because its one damaged book held no others; a Uyghur library can
 * hold these, and refusing them would leave such a book unrepairable. Any
 * other form that folds to more than one character still refuses its book.
 */
const HAMZA_LIGATURE_FIRST = 0xFBEA;
const HAMZA_LIGATURE_LAST = 0xFBFB;

/** A form allowed to fold to two letters. */
function isTwoLetterForm(codePoint) {
  return (codePoint >= LAM_ALEF_FIRST && codePoint <= LAM_ALEF_LAST) ||
    (codePoint >= HAMZA_LIGATURE_FIRST && codePoint <= HAMZA_LIGATURE_LAST);
}

/** The religious ligatures: never folded, and counted before and after a repair. */
const SACRED_FIRST = 0xFDF0;
const SACRED_LAST = 0xFDFD;

/** ARABIC LETTER AE — the Uyghur vowel «ە». */
const AE = 'ە';

/**
 * The heh forms that are really an AE. AE has forms of its own (U+FBEC,
 * U+FBED), but the encoders that produce this text write the HEH forms, which
 * look the same alone and at the end of a word — and NFKC hands those back as
 * ه (U+0647), a letter not in the Uyghur alphabet: «دۆلەت» would come back as
 * «دۆلهت». AE joins backwards only, so it can only ever be the isolated or the
 * final heh form; the initial and medial ones are a real heh and stay ه.
 */
const AE_FROM_HEH_FORM = {
  'ﻩ': AE,   // ARABIC LETTER HEH ISOLATED FORM
  'ﻪ': AE    // ARABIC LETTER HEH FINAL FORM
};

/**
 * How much of a row must be glyph codepoints before a repair rewrites it —
 * the web edition's measured threshold. A healthy book can hold a form on
 * purpose (a book about the letters' shapes); a damaged one is 80–90% forms.
 */
const CANDIDATE_SHARE = 0.2;

/** Both letter ranges, for a fast first look and a fast count. */
const ANY_FORM = /[ﭐ-ﯿﹰ-﻿]/;
const EVERY_FORM = /[ﭐ-ﯿﹰ-﻿]/g;

/** Is this codepoint a drawn shape of a letter rather than the letter itself? */
function isPresentationForm(codePoint) {
  return (codePoint >= FORMS_B_FIRST && codePoint <= FORMS_B_LAST) ||
    (codePoint >= FORMS_A_FIRST && codePoint <= FORMS_A_LAST);
}

/**
 * Every glyph codepoint replaced with the letter (or letters) it stands for;
 * everything else copied through untouched. The lam-alef and hamza ligatures
 * fold to two letters each (and a few spacing forms of vowel marks to a mark
 * with a space or tatweel — verifyFold refuses a book that holds those).
 */
function foldPresentationForms(input) {
  if (!input) return '';
  // Nearly every book has none: one native scan, and it is copied as it is.
  if (!ANY_FORM.test(input)) return String(input);
  let out = '';
  for (const character of String(input)) {
    if (!isPresentationForm(character.codePointAt(0))) {
      out += character;
      continue;
    }
    out += AE_FROM_HEH_FORM[character] || character.normalize('NFKC');
  }
  return out;
}

/**
 * What the library stores: letters, composed (NFC, after the fold, so what
 * the fold emits is composed too). Ordinary text comes back unchanged.
 */
function normalizeImportedText(input) {
  if (!input) return '';
  return foldPresentationForms(input).normalize('NFC');
}

/**
 * The stored text, and ranges in the extracted text (a PDF's pages, 3.6)
 * mapped onto it. Folding can change the length — a lam-alef glyph is two
 * letters — so each range, and each gap between them, is normalised on its
 * own. That gives the same text as normalising the whole: the fold works per
 * character, and NFC cannot reach across the line ends that join pages. The
 * result is checked against the whole all the same; ranges that are out of
 * order, out of the text, or do not come out exactly are dropped (null),
 * never stored half-true.
 *
 * @param {string} input
 * @param {Array<[number, number]>} ranges [start, end) in `input`, in order
 * @returns {{text: string, ranges: Array<[number, number]>|null}}
 */
function normalizeWithRanges(input, ranges) {
  const source = String(input || '');
  const whole = normalizeImportedText(source);
  if (!Array.isArray(ranges) || !ranges.length) return { text: whole, ranges: null };
  let at = 0;
  let out = '';
  const mapped = [];
  for (const r of ranges) {
    const start = r && r[0];
    const end = r && r[1];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < at || end < start || end > source.length) {
      return { text: whole, ranges: null };
    }
    out += normalizeImportedText(source.slice(at, start));
    const from = out.length;
    out += normalizeImportedText(source.slice(start, end));
    mapped.push([from, out.length]);
    at = end;
  }
  out += normalizeImportedText(source.slice(at));
  return out === whole ? { text: whole, ranges: mapped } : { text: whole, ranges: null };
}

/**
 * How many of a text's characters are glyph codepoints — counted with native
 * scans, because the repair tool looks through every book in the library.
 * Characters, not UTF-16 units: a surrogate pair is one.
 */
function presentationFormShare(input) {
  const text = String(input || '');
  const forms = (text.match(EVERY_FORM) || []).length;
  const total = text.length - (text.match(/[\uDC00-\uDFFF]/g) || []).length;
  return { forms: forms, total: total, share: total === 0 ? 0 : forms / total };
}

function countSacredLigatures(text) {
  let n = 0;
  for (const character of String(text || '')) {
    const codePoint = character.codePointAt(0);
    if (codePoint >= SACRED_FIRST && codePoint <= SACRED_LAST) n += 1;
  }
  return n;
}

/**
 * Prove a repair before it is written: the web repair script's checks. Each
 * is a reason to REFUSE the row — the fold is per character, so a surprise
 * means its assumption broke, and a book is not where to find that out after.
 *
 * @returns {string[]} what is wrong; empty when the repair may be written
 */
function verifyFold(before, after) {
  const problems = [];
  const beforeChars = Array.from(String(before || ''));
  const afterChars = Array.from(String(after || ''));

  const survivors = afterChars.filter(ch => isPresentationForm(ch.codePointAt(0)));
  if (survivors.length) problems.push(survivors.length + ' glyph codepoints are still there after folding');

  const expansions = beforeChars.filter(ch => Array.from(foldPresentationForms(ch)).length > 1);
  const unexpected = expansions.filter(ch =>
    !isTwoLetterForm(ch.codePointAt(0)) || Array.from(foldPresentationForms(ch)).length !== 2);
  if (unexpected.length) {
    const named = Array.from(new Set(unexpected))
      .map(ch => 'U+' + ch.codePointAt(0).toString(16).toUpperCase()).join(', ');
    problems.push('characters expand to more than one letter and are not lam-alef or a hamza ligature: ' + named);
  }

  const expected = beforeChars.length + expansions.length;
  if (afterChars.length !== expected) {
    problems.push('length is ' + afterChars.length + ', expected ' + expected +
      ' (' + beforeChars.length + ' characters plus ' + expansions.length + ' ligature expansions)');
  }

  const sacredBefore = countSacredLigatures(before);
  const sacredAfter = countSacredLigatures(after);
  if (sacredBefore !== sacredAfter) problems.push('religious ligatures went from ' + sacredBefore + ' to ' + sacredAfter);

  if (String(before || '').trim() && !String(after || '').trim()) problems.push('the repair emptied the row');
  return problems;
}

module.exports = {
  CANDIDATE_SHARE,
  LAM_ALEF_FIRST,
  LAM_ALEF_LAST,
  HAMZA_LIGATURE_FIRST,
  HAMZA_LIGATURE_LAST,
  SACRED_FIRST,
  SACRED_LAST,
  isPresentationForm,
  foldPresentationForms,
  normalizeImportedText,
  normalizeWithRanges,
  presentationFormShare,
  countSacredLigatures,
  verifyFold
};
