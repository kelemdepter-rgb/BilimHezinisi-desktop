// ============================================================================
// A verse's translation and its label: «… ئىگىسىدۇر. [4]» (3.6).
//
// The Uyghur translation renders some runs of consecutive verses as one
// sentence; database.js gives every verse the group it belongs to (ug_from,
// ug_to — a verse on its own is its own group) and, from quran-get-aya, the
// group's translation (group_text_ug). Wherever a translation leaves the
// mushaf — copied, inserted into a note, listed as a search result — it
// carries its label: «[7]», or «[4 _ 6]» for a group. The label is written
// exactly «[» from « _ » to «]», Western digits, an underscore with one space
// on each side, in that logical order and with no left-to-right isolation:
// inside a right-to-left paragraph a reader meets 4 first.
//
// Pure functions, no DOM: loaded as a <script> by index.html (window.VerseLabel)
// and by the notebook test page, and required by the main-process tests.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.VerseLabel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** «[7]» or «[4 _ 6]». */
  function label(from, to) {
    const a = Number(from);
    const b = Number(to == null ? from : to);
    return b > a ? '[' + a + ' _ ' + b + ']' : '[' + a + ']';
  }

  /** The group a verse row belongs to; a row without one is its own. */
  function range(row) {
    const aya = Number(row && row.aya);
    const from = Number(row && row.ug_from) || aya;
    const to = Number(row && row.ug_to) || aya;
    return to >= from ? { from: from, to: to } : { from: aya, to: aya };
  }

  /** Does this verse share its translation with others? */
  function inGroup(row) {
    const r = range(row);
    return r.to > r.from;
  }

  /**
   * The translation a group shows, from the rows on hand: the longest of its
   * verses' texts (they are identical but for 53:13–14, where 53:14's is a
   * shortened copy of 53:13's).
   */
  function groupText(rows, sura, from, to) {
    let best = '';
    (rows || []).forEach(function (r) {
      if (Number(r.sura) === Number(sura) && r.aya >= from && r.aya <= to && String(r.text_ug || '').length > best.length) {
        best = String(r.text_ug || '');
      }
    });
    return best;
  }

  /** A verse row's translation: its group's, when the reader sent it along. */
  function translation(row) {
    return String((row && (row.group_text_ug || row.text_ug)) || '');
  }

  /** The translation followed by its label, or '' when there is none. */
  function withLabel(text, from, to) {
    const t = String(text || '').trim();
    return t ? t + ' ' + label(from, to) : '';
  }

  /**
   * A run of verses as it is copied or inserted: consecutive rows of the
   * same sura and the same group make ONE unit, so a group's translation is
   * written once, after the last of its verses in the run.
   *
   * @param {Array} rows verse rows in mushaf order
   * @returns {Array<{sura: number, from: number, to: number, ayas: Array, text: string}>}
   */
  function units(rows) {
    const out = [];
    (rows || []).forEach(function (row) {
      const r = range(row);
      const prev = out[out.length - 1];
      if (prev && prev.sura === Number(row.sura) && prev.from === r.from && prev.to === r.to) {
        prev.ayas.push(row);
        if (translation(row).length > prev.text.length) prev.text = translation(row);
        return;
      }
      out.push({ sura: Number(row.sura), from: r.from, to: r.to, ayas: [row], text: translation(row) });
    });
    return out;
  }

  return { label: label, range: range, inGroup: inGroup, groupText: groupText, translation: translation, withLabel: withLabel, units: units };
});
