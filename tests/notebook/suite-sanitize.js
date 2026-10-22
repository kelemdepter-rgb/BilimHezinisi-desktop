// ============================================================================
// The sanitizer: K6 — its settings are ignored.
//
// sanitize.js passes USE_PROFILES to DOMPurify, and DOMPurify then ignores
// ALLOWED_TAGS and ALLOWED_ATTR entirely. So the marker that says «this is a
// quoted passage» is stripped (the spellchecker and the scanner can no longer
// skip it), while <img> and any CSS — position: fixed included — are kept.
//
// The allow lists have to be the lists that are actually applied.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  test('sanitize-keeps-markers', async function (t) {
    t.assert.ok(window.SafeHTML && window.SafeHTML.sanitize, 'SafeHTML is not loaded');

    const quoted = window.SafeHTML.sanitize(
      '<blockquote class="notes-inserted-ref" data-ref-insert="1" dir="rtl">نەقىل تېكىستى</blockquote>');
    t.assert.includes(quoted, 'data-ref-insert',
      'the inserted-reference marker was stripped, so quoted text cannot be recognised');
    t.assert.includes(quoted, 'notes-inserted-ref', 'the inserted-reference class was stripped');
    t.assert.includes(quoted, 'نەقىل تېكىستى', 'the quoted text itself was lost');

    const img = window.SafeHTML.sanitize('<p>ئاۋال<img src="https://example.com/a.png">كېيىن</p>');
    t.assert.excludes(img, '<img', 'an image survived the sanitizer');
    t.assert.includes(img, 'ئاۋال', 'the surrounding text was lost');

    const css = window.SafeHTML.sanitize('<p style="text-indent:1cm;position:fixed">ئابزاس</p>');
    t.assert.includes(css, 'text-indent', 'an allowed CSS property was dropped');
    t.assert.excludes(css, 'position', 'position: fixed survived the sanitizer');
  });

  test('sanitize-tables-urls-styles', async function (t) {
    const S = window.SafeHTML.sanitize;

    const table = S('<table><thead><tr><th colspan="2">ماۋزۇ</th></tr></thead>' +
                    '<tbody><tr><td>بىر</td><td rowspan="1">ئىككى</td></tr></tbody></table>');
    ['<table', '<thead', '<tbody', '<tr', '<th', '<td', 'colspan="2"'].forEach(function (part) {
      t.assert.includes(table, part, 'a table lost ' + part);
    });

    const link = S('<p><a href="javascript:alert(1)">بىر</a> <a href="https://example.com">ئىككى</a></p>');
    t.assert.excludes(link, 'javascript:', 'a javascript: link survived');
    t.assert.includes(link, 'href="https://example.com"', 'an ordinary link lost its address');

    // Only the listed properties, and no value that could reach the network.
    const styled = S('<p style="color: rgb(160, 0, 0); background: url(https://example.com/x.png); ' +
                     'behavior: url(x.htc); width: expression(alert(1)); text-align: center">ئابزاس</p>');
    t.assert.includes(styled, 'color: rgb(160, 0, 0)', 'an allowed colour was dropped');
    t.assert.includes(styled, 'text-align: center', 'an allowed alignment was dropped');
    t.assert.excludes(styled, 'url(', 'a url() survived in a style');
    t.assert.excludes(styled, 'expression', 'a CSS expression survived');
    t.assert.excludes(styled, 'behavior', 'a property outside the list survived');

    // What the notebook writes itself must come through whole: the verse face
    // with its fallback, the size in pt, the line height, the RTL properties.
    const verse = S('<p dir="rtl" style="direction: rtl; unicode-bidi: plaintext; text-indent: 1cm">' +
                    '<span style="font-family:\'UthmanicHafs\',serif;font-size:18pt;line-height:1.9">آية</span></p>' +
                    '<ol style="list-style-type: arabic-indic"><li>بىر</li></ol>');
    // Compared through the CSS parser, so spacing and quoting do not matter.
    const box = document.createElement('div');
    box.innerHTML = verse;
    const declared = function (property) {
      return Array.from(box.querySelectorAll('[style]')).map(function (el) {
        return el.style.getPropertyValue(property);
      }).filter(Boolean);
    };
    const expect = function (property, value) {
      const probe = document.createElement('span');
      probe.style.setProperty(property, value);
      t.assert.ok(declared(property).indexOf(probe.style.getPropertyValue(property)) !== -1,
        'the sanitizer dropped what the notebook writes: ' + property + ': ' + value + ' — got ' + verse);
    };
    expect('font-family', "'UthmanicHafs', serif");
    expect('font-size', '18pt');
    expect('line-height', '1.9');
    expect('direction', 'rtl');
    expect('unicode-bidi', 'plaintext');
    expect('text-indent', '1cm');
    expect('list-style-type', 'arabic-indic');

    // The style hook belongs to the notebook's sanitizer only: the web-page
    // import calls DOMPurify directly and must not have its styles filtered.
    const plain = window.DOMPurify.sanitize('<p style="behavior: x">p</p>');
    t.assert.includes(plain, 'behavior', 'the notebook\'s style filter leaked into every DOMPurify call');
  });

  // Every toolbar command, one per paragraph, then the whole note through the
  // sanitizer: nothing the editor itself produces may be lost on the next open.
  // This is what removing USE_PROFILES could break without anyone noticing —
  // <strike> from strikeThrough, <font> from the size and face controls.
  test('sanitize-keeps-editor-output', async function (t) {
    const LINES = ['توم', 'يانتۇ', 'ئاستى سىزىق', 'ئۆچۈرۈلگەن', 'خەت نۇسخىسى', 'چوڭلۇق', 'رەڭ', 'بەلگە',
                   'نومۇرلۇق', 'نۇقتىلىق', 'نەقىل', 'ئوتتۇرىدا', 'ئابزاس بېشى', 'قۇر ئارىلىقى'];
    const ed = await t.fresh({ html: LINES.map(function (w) { return '<p>' + w + ' تېكىستى</p>'; }).join('') });

    function onBlock(i, run) {
      const node = t.firstText(ed.children[i]);
      t.select(node, 0, node, node.data.length);
      run();
    }
    function cmd(name, value) { return function () { document.execCommand(name, false, value); }; }
    function css(name, value) {
      return function () {
        document.execCommand('styleWithCSS', false, true);
        document.execCommand(name, false, value);
        document.execCommand('styleWithCSS', false, false);
      };
    }
    // Last block first, so the list and quote commands cannot shift the others.
    const steps = [
      cmd('bold'), cmd('italic'), cmd('underline'), cmd('strikeThrough'),
      cmd('fontName', 'UKIJ Tuz Tom'), cmd('fontSize', '5'), css('foreColor', '#aa0000'), css('hiliteColor', '#ffee00'),
      cmd('insertOrderedList'), cmd('insertUnorderedList'), cmd('formatBlock', 'blockquote'), cmd('justifyCenter'),
      function () { window.notesSaveSel(); window.notesSetIndent('1'); },
      function () { window.notesSaveSel(); window.notesSetLineHeight('1.5'); }
    ];
    for (let i = steps.length - 1; i >= 0; i--) onBlock(i, steps[i]);
    await t.sleep(30);

    // A structural signature: every element, its attributes, styles normalised
    // through the CSS parser, and the text.
    function signature(html) {
      const box = document.createElement('div');
      box.innerHTML = html;
      const out = [];
      box.querySelectorAll('*').forEach(function (el) {
        const attrs = Array.from(el.attributes).map(function (a) {
          if (a.name !== 'style') return a.name + '=' + a.value;
          const probe = document.createElement('span');
          probe.setAttribute('style', a.value);
          return 'style=' + probe.style.cssText;
        }).sort();
        out.push(el.localName + '[' + attrs.join(',') + ']');
      });
      return out.join(' ') + ' | ' + box.textContent;
    }

    const before = ed.innerHTML;
    const after = window.SafeHTML.sanitize(before);
    t.assert.equal(signature(after), signature(before),
      'the sanitizer changes what the editor itself wrote — before: ' + before + ' — after: ' + after);
  });
})();
