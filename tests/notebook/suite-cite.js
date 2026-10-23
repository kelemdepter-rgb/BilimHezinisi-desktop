// ============================================================================
// W11 — a quoted passage or verse says where it came from, and goes there.
//
// An inserted library passage ended with a grey «— title» line and a verse
// with nothing at all: the writer could not get back to the page they quoted.
// Both now end with a citation link on the app's own scheme —
// bh://book/<id>?o=<offset>&q=<word> and bh://quran/<sura>/<aya> — which the
// sanitizer keeps on a.bh-cite and nowhere else.
//
// Clicking any link in the note shows a small card (what it points to,
// «ئېچىش», «ئۇلىنىشنى ئېلىۋېتىش»); Ctrl+click opens it at once. Nothing in
// the note ever navigates the window. Ported from the web edition's
// lib/notes/insert.ts, lib/notes/links.ts and components/notes/link-popover.tsx.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  function citeIn(ed) { return ed.querySelector('a.bh-cite'); }
  function card() { return document.querySelector('.notes-link-card'); }
  function cardButton(action) {
    const c = card();
    return c ? c.querySelector('[data-action="' + action + '"]') : null;
  }

  /** A real click on an element, with modifier keys when asked. */
  function clickOn(el, extra) {
    const r = el.getBoundingClientRect();
    const ev = new MouseEvent('click', Object.assign({
      bubbles: true, cancelable: true, view: window,
      clientX: r.left + r.width / 2, clientY: r.top + r.height / 2
    }, extra || {}));
    el.dispatchEvent(ev);
    return ev;
  }

  /** setMode, openReader, quranGoToAya and window.open — recorded, not performed. */
  function stubNavigation() {
    const calls = [];
    const opened = window.open;
    window.setMode = function (m) { calls.push(['setMode', m]); window.S.mode = m; };
    window.openReader = function (id, hl, pos) { calls.push(['openReader', id, hl, pos]); };
    window.quranGoToAya = function (s, a) { calls.push(['quranGoToAya', s, a]); };
    window.open = function (url, target, features) { calls.push(['open', url, target, features]); return null; };
    return {
      calls: calls,
      of: function (name) { return calls.filter(function (c) { return c[0] === name; }); },
      restore: function () {
        delete window.setMode;
        delete window.openReader;
        delete window.quranGoToAya;
        window.open = opened;
        window.S.mode = 'notes';
      }
    };
  }

  const SNIP = encodeURIComponent('...§MARK_OPEN§كىتاب§MARK_CLOSE§ ئوقۇش پايدىلىق...');
  const WORD = encodeURIComponent('كىتاب');

  test('cite-insert-passage', async function (t) {
    let ed = await t.fresh({ html: '<p>ئالدى</p>' });
    t.caretToEnd();
    window.notesInsertRef(5, SNIP, 120, WORD);

    const quote = ed.querySelector('blockquote[data-ref-insert="1"]');
    t.assert.ok(quote, 'the passage was not inserted as a quotation');
    t.assert.excludes(quote.textContent, '§MARK', 'the snippet markers were inserted');
    const a = citeIn(quote);
    t.assert.ok(a, 'the passage ends without a citation link');
    t.assert.equal(a.getAttribute('href'), 'bh://book/5?o=120&q=' + WORD, 'the link does not point at the place quoted');
    t.assert.equal(a.textContent, '— سىناق كىتابى', 'the citation line does not name the book');

    // Saved and opened again, the link is still there: the sanitizer keeps
    // bh: on a citation.
    t.assert.equal(await window.notesFlush(), true, 'the note was not saved');
    t.assert.includes(window.FAKE.saves[window.FAKE.saves.length - 1].html, 'href="bh://book/5?o=120&amp;q=',
      'the saved note lost the citation address');
    await window.notesOpen(2);
    await window.notesOpen(1);
    ed = t.editor();
    t.assert.equal(citeIn(ed) && citeIn(ed).getAttribute('href'), 'bh://book/5?o=120&q=' + WORD,
      'the citation did not survive a reopen');

    // A snippet with an apostrophe still reaches the note whole: the panel
    // passes it inside a quoted onclick argument.
    t.caretToEnd();
    window.notesInsertRef(5, encodeURIComponent("it's").replace(/'/g, '%27'), null, '');
    t.assert.includes(ed.textContent, "it's", 'an apostrophe broke the inserted passage');
    const bare = Array.from(ed.querySelectorAll('a.bh-cite')).pop();
    t.assert.equal(bare.getAttribute('href'), 'bh://book/5', 'a passage without a place should point at the book');
  });

  test('cite-insert-verse', async function (t) {
    const cases = [['both', true, true], ['ar', true, false], ['ug', false, true], [true, true, true], [false, true, false]];
    for (const c of cases) {
      const ed = await t.fresh();
      t.caretToEnd();
      await window.notesInsertAya(2, 255, c[0]);
      const label = JSON.stringify(c[0]) + ': ';
      const a = citeIn(ed);
      t.assert.ok(a, label + 'the verse has no citation link');
      t.assert.equal(a.getAttribute('href'), 'bh://quran/2/255', label + 'the link does not point at the verse');
      t.assert.equal(a.textContent, '— قۇرئان كەرىم، 2:255', label + 'the citation line is wrong');
      t.assert.equal(!!ed.querySelector('[style*="UthmanicHafs"]'), c[1], label + 'the Arabic text is wrong');
      const tr = ed.querySelector('span[data-ref-insert="1"]');
      t.assert.equal(!!tr && tr.textContent.indexOf('ئاللاھنىڭ ئىسمى بىلەن') !== -1, c[2], label + 'the translation is wrong');
    }
  });

  test('cite-sanitizer-bh-only-on-cite', async function (t) {
    const S = window.SafeHTML.sanitize;
    t.assert.includes(S('<a class="bh-cite" href="bh://book/5?o=1&amp;q=x">— ك</a>'), 'href="bh://book/5?o=1&amp;q=x"',
      'a book citation lost its address');
    t.assert.includes(S('<a class="bh-cite" href="bh://quran/2/255">— ق</a>'), 'href="bh://quran/2/255"',
      'a verse citation lost its address');

    t.assert.excludes(S('<a href="bh://book/5">x</a>'), 'bh:', 'bh: survived on a link that is not a citation');
    t.assert.excludes(S('<a class="other" href="bh://book/5">x</a>'), 'bh:', 'bh: survived on another class');
    t.assert.excludes(S('<span class="bh-cite" href="bh://book/5">x</span>'), 'bh:', 'bh: survived on a span');
    t.assert.excludes(S('<a class="bh-cite" href="bh://settings/reset">x</a>'), 'bh:', 'a bh: address that is no citation survived');
    t.assert.excludes(S('<a class="bh-cite" href="bh://book/5/../../x">x</a>'), 'bh:', 'a malformed citation survived');
    t.assert.excludes(S('<a class="bh-cite" href="javascript:alert(1)">x</a>'), 'javascript', 'javascript: survived on a citation');

    // Ordinary links are unchanged.
    t.assert.includes(S('<a href="https://example.com/a">x</a>'), 'href="https://example.com/a"', 'an ordinary link lost its address');
    t.assert.includes(S('<a class="bh-cite" href="https://example.com/">x</a>'), 'href="https://example.com/"',
      'an http(s) address on a citation was dropped');
  });

  test('cite-describe', async function (t) {
    const C = window.NotesCite;
    t.assert.ok(C && typeof C.describe === 'function', 'window.NotesCite.describe is missing');

    let d = C.describe('bh://book/5?o=12&q=' + WORD, '— سىناق كىتابى');
    t.assert.equal(d.kind, 'book');
    t.assert.equal(d.label, 'كىتاب: «سىناق كىتابى»');
    t.assert.deepEqual(d.target, { bookId: 5, offset: 12, word: 'كىتاب' });

    // A book no longer in the library: the citation's own words name it.
    d = C.describe('bh://book/77', '— يوقالغان كىتاب');
    t.assert.equal(d.label, 'كىتاب: «يوقالغان كىتاب»');
    t.assert.deepEqual(d.target, { bookId: 77, offset: null, word: '' });

    d = C.describe('bh://quran/2/255', '— قۇرئان كەرىم، 2:255');
    t.assert.equal(d.kind, 'quran');
    t.assert.equal(d.label, 'قۇرئان: 2:255');
    t.assert.deepEqual(d.target, { sura: 2, aya: 255 });

    d = C.describe('https://example.com/a?b=1', 'بەت');
    t.assert.equal(d.kind, 'external');
    t.assert.equal(d.label, 'example.com');
    t.assert.equal(d.target.url, 'https://example.com/a?b=1');

    ['javascript:alert(1)', 'file:///C:/x', 'mailto:a@example.com', 'https://user:pw@evil.example/',
     'bh://quran/115/1', 'bh://quran/2/0', 'bh://book/x', 'bh://settings', ''].forEach(function (href) {
      const b = C.describe(href, 'x');
      t.assert.equal(b.kind, 'blocked', JSON.stringify(href) + ' would be opened');
      t.assert.equal(b.target, null, JSON.stringify(href) + ' has somewhere to go');
    });
    t.assert.equal(C.describe('x'.repeat(300), 'x').label.length, 201, 'a long blocked address is shown whole');

    t.assert.equal(C.bookHref(5, 120, 'كىتاب'), 'bh://book/5?o=120&q=' + WORD);
    t.assert.equal(C.bookHref(5, null, ''), 'bh://book/5');
    t.assert.equal(C.quranHref(2, 255), 'bh://quran/2/255');
  });

  test('cite-card-open-book', async function (t) {
    const ed = await t.fresh({ html: '<p>ئالدى</p>' });
    t.caretToEnd();
    window.notesInsertRef(5, SNIP, 120, WORD);
    t.assert.ok(window.S.notes.dirty, 'inserting did not mark the note changed');
    const nav = stubNavigation();
    try {
      const ev = clickOn(citeIn(ed));
      t.assert.ok(ev.defaultPrevented, 'a click on a link in the note was left to navigate');
      t.assert.ok(card(), 'no card for the link');
      t.assert.equal(card().dataset.kind, 'book');
      t.assert.includes(card().textContent, 'كىتاب: «سىناق كىتابى»', 'the card does not say where the link goes');
      t.assert.includes(card().textContent, '— سىناق كىتابى', 'the card does not show the link text');
      t.assert.ok(cardButton('unlink'), 'no «ئۇلىنىشنى ئېلىۋېتىش» in an editable note');

      cardButton('open').click();
      await t.sleep(40);
      t.assert.ok(!card(), 'the card stayed open');
      t.assert.ok(!window.S.notes.dirty, 'the note was not saved before the reader opened');
      t.assert.deepEqual(nav.of('setMode'), [['setMode', 'library']], 'the notebook was not left for the library');
      t.assert.deepEqual(nav.of('openReader'), [['openReader', 5, 'كىتاب', 120]],
        'the reader did not open at the place quoted');
    } finally { nav.restore(); }
  });

  test('cite-open-missing-book', async function (t) {
    const ed = await t.fresh({ html: '<p>ئالدى <a class="bh-cite" href="bh://book/77?o=3&amp;q=x">— يوقالغان</a></p>' });
    const nav = stubNavigation();
    try {
      clickOn(citeIn(ed));
      cardButton('open').click();
      await t.sleep(20);
      t.assert.equal(nav.of('openReader').length, 0, 'the reader was asked for a book that is not there');
      t.assert.ok(window.TOASTS.some(function (m) { return m[0] === 'بۇ كىتاب كۈتۈپخانىدا يوق' && m[1] === 'e'; }),
        'the writer was not told the book is gone');
    } finally { nav.restore(); }
  });

  test('cite-ctrl-click-opens', async function (t) {
    const ed = await t.fresh({ html: '<p>ئالدى</p>' });
    t.caretToEnd();
    await window.notesInsertAya(2, 255, 'both');
    const nav = stubNavigation();
    try {
      const ev = clickOn(citeIn(ed), { ctrlKey: true });
      await t.sleep(40);
      t.assert.ok(ev.defaultPrevented, 'Ctrl+click on a link was left to navigate');
      t.assert.ok(!card(), 'Ctrl+click showed the card instead of opening');
      t.assert.deepEqual(nav.of('setMode'), [['setMode', 'quran']], 'the Qur\'an was not opened');
      t.assert.deepEqual(nav.of('quranGoToAya'), [['quranGoToAya', 2, 255]], 'the Qur\'an did not open at the verse');
      t.assert.equal(window.S.quran.curSura, 2);
      t.assert.equal(window.S.quran.curAya, 255);
    } finally { nav.restore(); }
  });

  test('cite-card-unlink', async function (t) {
    const ed = await t.fresh({ html: '<p>ئالدى</p>' });
    t.caretToEnd();
    window.notesInsertRef(5, SNIP, 120, WORD);
    await window.notesFlush();
    t.assert.ok(!window.S.notes.dirty);

    clickOn(citeIn(ed));
    const unlink = cardButton('unlink');
    t.assert.ok(unlink, 'no «ئۇلىنىشنى ئېلىۋېتىش»');
    unlink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    unlink.click();
    t.assert.ok(!card(), 'the card stayed open');
    t.assert.equal(ed.querySelectorAll('a').length, 0, 'the link is still there');
    t.assert.includes(ed.textContent, '— سىناق كىتابى', 'the link\'s words went with it');
    t.assert.ok(window.S.notes.dirty, 'taking the link away was not saved');

    document.execCommand('undo');
    t.assert.ok(citeIn(ed), 'taking the link away cannot be undone');
  });

  test('cite-card-external-blocked-and-closing', async function (t) {
    const ed = await t.fresh({
      html: '<p>بۇ <a href="https://example.com/page">تور بېكەت</a> ۋە <a href="mailto:a@example.com">خەت</a> بار</p>'
    });
    const links = ed.querySelectorAll('a');
    const nav = stubNavigation();
    try {
      clickOn(links[0]);
      t.assert.equal(card() && card().dataset.kind, 'external');
      t.assert.includes(card().textContent, 'example.com');

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      t.assert.ok(!card(), 'Escape did not close the card');

      clickOn(links[0]);
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      t.assert.ok(!card(), 'a click outside did not close the card');

      clickOn(links[0]);
      cardButton('open').click();
      await t.sleep(20);
      t.assert.deepEqual(nav.of('open'), [['open', 'https://example.com/page', '_blank', 'noopener,noreferrer']],
        'an http(s) link was not handed to the main process');

      clickOn(links[1]);
      t.assert.equal(card().dataset.kind, 'blocked');
      t.assert.ok(!cardButton('open'), 'a link that cannot be opened offers «ئېچىش»');
      t.assert.includes(card().textContent, 'بۇ ئۇلىنىشنى ئاچقىلى بولمايدۇ.', 'the card does not say it cannot be opened');
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    } finally { nav.restore(); }
  });

  test('cite-card-read-only', async function (t) {
    const ed = await t.fresh({
      notes: {
        1: { id: 1, title: 'ئەخلەتتە', deleted_at: '2026-10-20T10:00:00.000Z', content_text: 'x',
             content_html: '<p>ئالدى <a class="bh-cite" href="bh://quran/1/1">— قۇرئان كەرىم، 1:1</a></p>' }
      }
    });
    t.assert.equal(ed.isContentEditable, false, 'a trashed note is editable');
    const nav = stubNavigation();
    try {
      const ev = clickOn(citeIn(ed));
      t.assert.ok(ev.defaultPrevented, 'a link in a read-only note was left to navigate');
      t.assert.ok(cardButton('open'), 'a read-only note\'s link cannot be opened');
      t.assert.ok(!cardButton('unlink'), 'a read-only note offers to change its link');
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
    } finally { nav.restore(); }
  });

  test('cite-card-follows-scroll', async function (t) {
    let html = '';
    for (let i = 0; i < 60; i++) html += '<p>قۇر ' + i + '</p>';
    html += '<p>ئاخىرى <a class="bh-cite" href="bh://quran/2/255">— قۇرئان كەرىم، 2:255</a></p>';
    for (let i = 0; i < 60; i++) html += '<p>كېيىن ' + i + '</p>';
    const ed = await t.fresh({ html: html });
    const a = citeIn(ed);
    a.scrollIntoView({ block: 'center' });

    // A hidden test window draws no frames, so the browser never gets round
    // to sending the scroll event a scroll makes. Sent here, as it would be.
    const scrolled = function () { ed.dispatchEvent(new Event('scroll')); };

    clickOn(a);
    t.assert.ok(card(), 'no card');
    const before = card().getBoundingClientRect().top;
    const linkBefore = a.getBoundingClientRect().top;
    ed.scrollTop += 40;
    scrolled();
    t.assert.ok(card(), 'a small scroll closed the card');
    const moved = a.getBoundingClientRect().top - linkBefore;
    t.assert.ok(Math.abs(moved) > 10, 'the editor did not scroll');
    const cardMoved = card().getBoundingClientRect().top - before;
    t.assert.ok(Math.abs(cardMoved - moved) <= 1,
      'the card did not follow its link (the link moved ' + moved + ' px, the card ' + cardMoved + ' px)');

    ed.scrollTop = 0;
    scrolled();
    t.assert.ok(!card(), 'the card stayed when its link scrolled out of sight');
  });
})();
