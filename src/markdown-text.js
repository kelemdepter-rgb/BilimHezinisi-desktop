// ============================================================================
// Markdown source as plain prose — the one converter (3.6: moved here from
// src/index.html unchanged).
//
// Option-B markdown cleanup: turn markdown SOURCE into clean plain prose.
// Strips #, *, _, **, __, backticks, >, list markers and horizontal rules;
// [text](url) becomes text with the url DROPPED; bare URLs are dropped too.
// Paragraph structure is preserved. Used for .md file imports, as the last
// step of the web/HTML article pipeline, and for the website's Markdown books
// (web-library.js), so stored content stays in the same safe plain-text path
// as TXT/DOCX books.
//
// Pure: loaded as a <script> by index.html (window.MarkdownText) and required
// by the main process and its tests.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MarkdownText = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function toPlain(md) {
    if (!md) return '';
    let t = String(md).replace(/\r\n/g, '\n');
    // fenced code blocks: drop the ``` / ~~~ fence lines, keep the inner text
    t = t.replace(/^[ \t]*(```|~~~)[^\n]*$/gm, '');
    // images: ![alt](url) → alt ; links: [text](url) → text (url dropped)
    t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
    t = t.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
    // reference-style links: definition lines dropped, [text][id] → text
    t = t.replace(/^[ \t]*\[[^\]]+\]:[ \t]+\S.*$/gm, '');
    t = t.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1');
    // autolinks <https://…> and bare URLs → dropped entirely
    t = t.replace(/<https?:\/\/[^>\s]+>/g, '');
    t = t.replace(/https?:\/\/\S+/g, '');
    // headings, blockquotes, list markers, horizontal rules
    t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
    t = t.replace(/^[ \t]{0,3}>[ \t]?/gm, '');
    t = t.replace(/^[ \t]*[-*+][ \t]+/gm, '');
    t = t.replace(/^[ \t]*\d+[.)][ \t]+/gm, '');
    t = t.replace(/^[ \t]*([-*_][ \t]*){3,}$/gm, '');
    // emphasis and inline code: keep the text, drop the markers
    t = t.replace(/(\*\*\*|___)([\s\S]*?)\1/g, '$2');
    t = t.replace(/(\*\*|__)([\s\S]*?)\1/g, '$2');
    t = t.replace(/(\*|_)([^*_\n]+)\1/g, '$2');
    t = t.replace(/`([^`\n]*)`/g, '$1');
    // markdown backslash-escapes: \* → *
    t = t.replace(/\\([\\`*_{}\[\]()#+\-.!>])/g, '$1');
    // collapse 3+ blank lines into one paragraph break
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  return { toPlain: toPlain };
});
