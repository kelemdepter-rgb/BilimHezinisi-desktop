// HTML sanitizer for Notes module — defense-in-depth XSS protection.
// Loaded as a regular <script> in index.html (provides window.SafeHTML).
(function () {
  'use strict';

  // We require DOMPurify via a path that works both in dev (node_modules)
  // and packaged (asar). DOMPurify ships a UMD build that attaches to
  // window when loaded as a <script>. We load the file via a require()
  // resolved at runtime by the Electron preload's exposed loader, OR
  // by a direct require() if available.
  let purify = null;

  function getPurify() {
    if (purify) return purify;
    if (typeof window !== 'undefined' && window.DOMPurify) {
      purify = window.DOMPurify;
      return purify;
    }
    // Fall back: try to require it (only works if Node integration is on,
    // which it isn't here — so this is a defensive no-op)
    try {
      // eslint-disable-next-line
      const dp = require('dompurify');
      purify = dp.default || dp;
      return purify;
    } catch (e) {
      return null;
    }
  }

  // THE LISTS ARE THE LISTS THAT ARE APPLIED (K6). This used to pass
  // USE_PROFILES to DOMPurify as well, and a profile REPLACES ALLOWED_TAGS and
  // ALLOWED_ATTR: data-ref-insert — the marker that says «this passage is
  // quoted» — was stripped, while <img> and any CSS at all (position: fixed
  // included) went through, and ALLOWED_CSS_PROPS was never read. So: no
  // profile, and every tag, attribute and CSS property is named here.

  // Tags allowed in Note HTML.
  const ALLOWED_TAGS = [
    'p', 'span', 'div', 'br', 'hr',
    'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'mark',
    // strikeThrough writes <strike>; del/ins/small come in with pasted text.
    'strike', 'del', 'ins', 'small',
    'ul', 'ol', 'li',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote',
    'code', 'pre',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a',
    'font' // legacy execCommand uses <font> for size/color; we keep it
    // No <img>: a note is text, and an image URL would reach the network.
  ];

  // Attributes we keep. data-* are named one by one (ALLOW_DATA_ATTR is off).
  const ALLOWED_ATTR = [
    'style', 'class', 'dir', 'lang',
    'data-ref-insert', 'data-ref-word',
    'href', 'title',
    'colspan', 'rowspan',
    'face', 'size', 'color' // legacy <font> attrs
  ];

  // CSS properties allowed in style="..." attributes, enforced declaration by
  // declaration in filterStyle() below.
  const ALLOWED_CSS_PROPS = new Set([
    'color', 'background-color', 'background',
    'font-family', 'font-size', 'font-weight', 'font-style',
    'text-align', 'text-decoration', 'line-height', 'text-indent',
    'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
    'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
    'border', 'border-radius', 'border-color',
    'direction', 'unicode-bidi', 'list-style-type',
    'display', 'width', 'max-width'
  ]);

  // A value that could fetch something, run something, or hide either behind
  // a CSS escape. The renderer never talks to the network (CSP connect-src
  // 'self'), and a note must not be the way around that.
  const UNSAFE_CSS_VALUE = /url\s*\(|image-set\s*\(|expression\s*\(|javascript:|@import|\\|[<>]/i;

  /**
   * Keep only the allowed declarations of a style attribute.
   * @param {string} value
   * @returns {string} the kept declarations, '' when none is left
   */
  function filterStyle(value) {
    const kept = [];
    for (const declaration of String(value || '').split(';')) {
      const at = declaration.indexOf(':');
      if (at < 1) continue;
      const property = declaration.slice(0, at).trim().toLowerCase();
      const val = declaration.slice(at + 1).trim();
      if (!val || !ALLOWED_CSS_PROPS.has(property) || UNSAFE_CSS_VALUE.test(val)) continue;
      kept.push(property + ': ' + val);
    }
    return kept.join('; ');
  }

  // The app's own scheme, for a citation's way back to what it quotes
  // (src/notes.js, W11): a book at a place, or a verse. Kept on a.bh-cite in
  // exactly these two shapes and nowhere else, so a pasted or imported note
  // cannot dress anything else up as one.
  const CITATION_HREF = /^bh:\/\/(?:book\/[1-9]\d{0,8}(?:\?[^#\s"'<>\\]*)?|quran\/[1-9]\d{0,2}\/[1-9]\d{0,2})$/;

  function isCitationLink(node) {
    return node.localName === 'a' &&
      String(node.getAttribute('class') || '').split(/\s+/).indexOf('bh-cite') !== -1;
  }

  // DOMPurify's hook for each attribute. Added for the duration of OUR call
  // only — the web-page import calls DOMPurify directly and is not filtered.
  function onAttribute(node, data) {
    if (data.attrName === 'href') {
      if (/^\s*bh:/i.test(data.attrValue) &&
          !(isCitationLink(node) && CITATION_HREF.test(data.attrValue))) data.keepAttr = false;
      return;
    }
    if (data.attrName !== 'style') return;
    const kept = filterStyle(data.attrValue);
    if (kept) data.attrValue = kept;
    else data.keepAttr = false;
  }

  /**
   * Sanitize note HTML. Strips <script>, event handlers (onerror, onclick, etc),
   * javascript: URLs, and any tag not in ALLOWED_TAGS.
   * @param {string} html
   * @returns {string} safe HTML
   */
  function sanitize(html) {
    if (!html) return '';
    const dp = getPurify();
    if (!dp) {
      // Fallback: strip all tags. Pessimistic but safe.
      console.warn('[sanitize] DOMPurify not available, stripping all HTML');
      const div = document.createElement('div');
      div.textContent = String(html).replace(/<[^>]*>/g, ' ');
      return div.innerHTML;
    }

    dp.addHook('uponSanitizeAttribute', onAttribute);
    try {
      return dp.sanitize(String(html), {
        ALLOWED_TAGS,
        ALLOWED_ATTR,
        FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'link', 'style', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'img'],
        FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onmouseout', 'onfocus', 'onblur', 'onsubmit', 'onchange', 'onkeydown', 'onkeyup', 'onkeypress'],
        ALLOW_DATA_ATTR: false,
        ADD_DATA_URI_TAGS: [],
        // bh: passes here only to meet onAttribute, which keeps it on a
        // citation and drops it everywhere else.
        ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|bh):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
        KEEP_CONTENT: true,
        RETURN_DOM: false,
        RETURN_DOM_FRAGMENT: false
      });
    } finally {
      dp.removeHook('uponSanitizeAttribute', onAttribute);
    }
  }

  /**
   * Extract plain text from HTML safely (does NOT use innerHTML).
   * @param {string} html
   * @returns {string}
   */
  function htmlToText(html) {
    if (!html) return '';
    const safe = sanitize(html);
    const div = document.createElement('div');
    div.innerHTML = safe;
    return div.innerText || div.textContent || '';
  }

  window.SafeHTML = { sanitize, htmlToText };
})();
