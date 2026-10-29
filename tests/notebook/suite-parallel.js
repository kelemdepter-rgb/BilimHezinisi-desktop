// ============================================================================
// 3.6 Phase 6 — two books side by side («يانمۇيان ئوقۇش»).
//
// The reader's own book stays on the right; a second book opens on the left
// in a pane with its own pages, page navigation, font size and search. The
// pane saves nothing — bookmarks, notes, the AI and the reading position stay
// with the right-hand book — and closing it leaves the reader as it was.
//
// The real src/parallel.js and src/reader-places.js are loaded by the
// harness. The reader itself lives in index.html, which the harness does not
// load: here it is a small stand-in with the same adapter the app hands to
// Parallel.createSession (book, content, page, pages, searching, turn, open).
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;
  const RP = window.ReaderPlaces;

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // The renderer the app hands in is index.html's textToParagraphs; this one
  // keeps the same contract: paragraphs with data-off from `base`.
  function render(text, base) {
    return RP.paragraphs(text, base).map(function (p) {
      return '<p data-off="' + p.off + '">' + esc(p.text) + '</p>';
    }).join('');
  }
  function highlight(html, re) {
    if (!re) return html;
    return html.replace(/(^|>)([^<]+)/g, function (all, gt, words) {
      return gt + words.replace(re, function (m) { return '<mark>' + m + '</mark>'; });
    });
  }

  /** A book of `n` paragraphs of about 400 characters, each saying where it is. */
  function bookText(tag, n) {
    const out = [];
    for (let i = 1; i <= n; i++) {
      out.push(tag + ' ' + i + ' ' + 'سۆز ئابزاس مەزمۇن '.repeat(22).trim() + (i === 37 ? ' ئىزدەلگەن' : ''));
    }
    return out.join('\n\n');
  }
  const BOOKS = {
    1: { id: 1, title: 'ئوڭدىكى كىتاب', author: 'A', content: bookText('بىرىنچى', 20) },
    2: { id: 2, title: 'سولدىكى كىتاب', author: 'B', content: bookText('ئىككىنچى', 75) }
  };

  /** The reader's stand-in: the adapter, over its own scroll area. */
  function fakeReader(el) {
    const r = { book: null, content: '', pages: [''], starts: [0], page: 1, turns: 0, opens: [] };
    function draw() {
      el.querySelector('.fake-rt').innerHTML = render(r.pages[r.page - 1], r.starts[r.page - 1]);
      el.scrollTop = 0;
    }
    function load(book) {
      r.book = book; r.content = book.content;
      const p = RP.paginate(book.content, RP.PER_PAGE);
      r.pages = p.pages; r.starts = p.starts;
    }
    return {
      state: r,
      load: load,
      draw: draw,
      adapter: {
        book: function () { return r.book; },
        content: function () { return r.content; },
        page: function () { return r.page; },
        pages: function () { return r.pages.length; },
        searching: function () { return false; },
        turn: function (p) { r.turns++; r.page = p; draw(); },
        open: async function (book, page) {
          if (r.failOpen) throw new Error('the reader could not open it');
          r.opens.push([book.id, page]);
          load(BOOKS[book.id]);
          r.page = Math.max(1, Math.min(r.pages.length, page));
          draw();
        }
      }
    };
  }

  async function withReader(body) {
    const wrap = document.createElement('div');
    wrap.id = 'par-test-wrapper';
    wrap.dir = 'rtl';
    wrap.style.cssText = 'position:fixed;top:0;left:0;width:900px;height:500px;display:flex;overflow:hidden;background:#fff;z-index:9';
    wrap.innerHTML =
      '<div id="par-test-rc" style="flex:1;overflow-y:auto;padding:10px"><div class="inner"><div class="fake-rt"></div></div></div>' +
      '<div class="reader-splitter"></div>' +
      '<div class="par-test-panel" style="width:330px;flex-shrink:0">panel</div>';
    document.body.appendChild(wrap);
    const rc = wrap.querySelector('#par-test-rc');
    const reader = fakeReader(rc);
    reader.load(BOOKS[1]);
    reader.draw();
    const remembered = [];
    const loads = [];
    const session = window.Parallel.createSession({
      wrapper: wrap,
      mainEl: rc,
      reader: reader.adapter,
      render: render,
      highlight: highlight,
      searchRe: function (q) { return RP.searchRe(q, []); },
      paginate: function (c) { return RP.paginate(c, RP.PER_PAGE); },
      loadContent: async function (id) { loads.push(id); return BOOKS[id].content; },
      fontSize: function () { return 17; },
      remember: function (pair) { remembered.push(pair); },
      icon: window.icon
    });
    try {
      await body({ wrap: wrap, rc: rc, reader: reader, session: session, remembered: remembered, loads: loads });
    } finally {
      try { session.close(); } catch (_) {}
      wrap.remove();
    }
  }

  function firstOff(el) {
    const p = el.querySelector('p[data-off]');
    return p ? Number(p.dataset.off) : null;
  }

  test('parallel-panes-paginate-apart', async function (t) {
    if (!window.Parallel) throw new Error('window.Parallel is missing (src/parallel.js)');
    await withReader(async function (r) {
      const s = r.session;
      const pagesB = RP.paginate(BOOKS[2].content, RP.PER_PAGE);
      t.assert.ok(pagesB.pages.length >= 8, 'the left book is long enough to need pages: ' + pagesB.pages.length);
      await s.open(BOOKS[2]);
      t.assert.ok(s.isOpen(), 'the pane is open');
      t.assert.equal(s.state().pages, pagesB.pages.length, 'the pane cut its own book');
      t.assert.equal(r.reader.adapter.pages(), RP.paginate(BOOKS[1].content, RP.PER_PAGE).pages.length, 'the reader keeps its own pages');

      s.next(); s.next();
      t.assert.equal(s.state().page, 3, 'the pane turned twice');
      t.assert.equal(r.reader.state.page, 1, 'the reader did not turn');
      t.assert.equal(r.reader.state.turns, 0, 'the pane never asked the reader to turn (sync is off by default)');
      t.assert.equal(firstOff(s.elements().text), pagesB.starts[2], 'the pane shows its page 3, placed in its own book');

      r.reader.adapter.turn(2);
      s.mainTurned();
      t.assert.equal(s.state().page, 3, 'the reader turned; the pane stayed');

      s.fontSize(2);
      t.assert.equal(s.elements().text.style.fontSize, '19px', 'the pane has its own font size');
      t.assert.equal(r.rc.querySelector('.fake-rt').style.fontSize, '', 'the reader\'s font size is untouched');

      t.assert.equal(r.remembered.length, 1, 'the pair is remembered once, when it opened — the pane saves nothing else');
      t.assert.deepEqual(r.remembered[0], { main: 1, side: 2, ratio: 0.5 }, 'what is remembered');
    });
  });

  test('parallel-swap-keeps-each-page', async function (t) {
    if (!window.Parallel) throw new Error('window.Parallel is missing (src/parallel.js)');
    await withReader(async function (r) {
      const s = r.session;
      const startsA = RP.paginate(BOOKS[1].content, RP.PER_PAGE).starts;
      const startsB = RP.paginate(BOOKS[2].content, RP.PER_PAGE).starts;
      r.reader.adapter.turn(2);
      await s.open(BOOKS[2]);
      s.turnTo(7);
      await s.swap();
      t.assert.deepEqual(r.reader.state.opens, [[2, 7]], 'the reader opened the left book at its page');
      t.assert.equal(r.reader.state.book.id, 2, 'the left book is on the right now');
      t.assert.equal(firstOff(r.rc), startsB[6], 'the right pane shows page 7 of it');
      t.assert.equal(s.state().book.id, 1, 'the right book is on the left now');
      t.assert.equal(s.state().page, 2, 'at the page it was on');
      t.assert.equal(firstOff(s.elements().text), startsA[1], 'the left pane shows page 2 of it');
      t.assert.deepEqual(r.loads, [2], 'the old right book came from the reader, not from another read');
      t.assert.deepEqual(r.remembered[r.remembered.length - 1], { main: 2, side: 1, ratio: 0.5 }, 'the swapped pair is remembered');

      // A book the reader cannot open: nothing moves.
      r.reader.state.failOpen = true;
      const kept = r.remembered.length;
      t.assert.equal(await s.swap(), false, 'the swap says it did not happen');
      t.assert.equal(r.reader.state.book.id, 2, 'the right side is unchanged');
      t.assert.equal(s.state().book.id, 1, 'the left side is unchanged');
      t.assert.equal(s.state().page, 2, 'at its page');
      t.assert.equal(r.remembered.length, kept, 'nothing new remembered');
    });
  });

  test('parallel-close-restores-the-reader', async function (t) {
    if (!window.Parallel) throw new Error('window.Parallel is missing (src/parallel.js)');
    await withReader(async function (r) {
      const s = r.session;
      const before = r.wrap.innerHTML;
      const styleBefore = r.rc.getAttribute('style');
      await s.open(BOOKS[2]);
      t.assert.ok(r.wrap.querySelector('.par-pane'), 'the pane is in the reader');
      t.assert.ok(r.wrap.querySelector('.par-divider'), 'with its divider');
      t.assert.ok(r.rc.nextElementSibling.classList.contains('par-divider'), 'the divider comes right after the reader\'s own area');
      s.setRatio(0.3);
      s.setSync(true);
      s.search('ئىزدەلگەن');
      s.close();
      t.assert.ok(!s.isOpen(), 'closed');
      t.assert.equal(r.wrap.innerHTML, before, 'the reader is exactly as it was');
      t.assert.equal(r.rc.getAttribute('style'), styleBefore, 'its own area\'s style is back');
      t.assert.ok(!r.wrap.classList.contains('par-on'), 'the side-by-side class is gone');

      await s.open(BOOKS[2]);
      t.assert.equal(s.state().sync, false, '«بىللە سىيرىلىش» is off again when the pane opens again');
      t.assert.equal(s.state().ratio, 0.3, 'the divider keeps its place');
    });
  });

  test('parallel-pane-search', async function (t) {
    if (!window.Parallel) throw new Error('window.Parallel is missing (src/parallel.js)');
    await withReader(async function (r) {
      const s = r.session;
      await s.open(BOOKS[2]);
      s.turnTo(4);
      s.search('ئىزدەلگەن');
      t.assert.ok(s.state().searching, 'searching the left book');
      t.assert.equal(s.elements().text.querySelectorAll('mark').length, 1, 'the one place found is marked');
      t.assert.includes(s.elements().count.textContent, '1', 'and counted');
      t.assert.equal(r.rc.querySelectorAll('mark').length, 0, 'nothing marked in the reader');
      s.search('');
      t.assert.ok(!s.state().searching, 'the search is left');
      t.assert.equal(s.state().page, 4, 'back at the page it was on');
      t.assert.equal(s.elements().text.querySelectorAll('mark').length, 0, 'no marks left');
    });
  });

  test('parallel-sync-moves-the-other-pane', async function (t) {
    if (!window.Parallel) throw new Error('window.Parallel is missing (src/parallel.js)');
    const P = window.Parallel;
    t.assert.equal(P.pageAtSameProportion(1, 10, 3), 1, 'first to first');
    t.assert.equal(P.pageAtSameProportion(10, 10, 3), 3, 'last to last');
    t.assert.equal(P.pageAtSameProportion(7, 10, 3), 2, 'page 7 of 10 → page 2 of 3');
    t.assert.equal(P.pageAtSameProportion(2, 3, 10), 6, 'page 2 of 3 → page 6 of 10 (the middle, rounded)');
    t.assert.equal(P.pageAtSameProportion(5, 9, 1), 1, 'a one-page book stays on its page');
    await withReader(async function (r) {
      const s = r.session;
      await s.open(BOOKS[2]);
      const n = s.state().pages;
      t.assert.equal(s.state().sync, false, 'off by default');
      s.setSync(true);
      s.turnTo(n);
      t.assert.equal(r.reader.state.page, r.reader.adapter.pages(), 'the pane\'s last page turned the reader to its last');
      r.reader.adapter.turn(1);
      s.mainTurned();
      t.assert.equal(s.state().page, 1, 'the reader\'s first page turned the pane to its first');

      // Scrolling: the other pane goes to the same proportion of its page.
      const sc = s.elements().scroller;
      const max = sc.scrollHeight - sc.clientHeight;
      const rmax = r.rc.scrollHeight - r.rc.clientHeight;
      t.assert.ok(max > 50 && rmax > 50, 'both pages scroll (' + max + ', ' + rmax + ')');
      sc.scrollTop = Math.round(max / 2);
      sc.dispatchEvent(new Event('scroll'));
      t.assert.ok(Math.abs(r.rc.scrollTop - rmax / 2) <= 2, 'the reader followed to the middle: ' + r.rc.scrollTop + ' of ' + rmax);
      // Its own scroll event, the one that follows, does not move the pane back.
      r.rc.dispatchEvent(new Event('scroll'));
      s.mainScrolled();
      t.assert.ok(Math.abs(sc.scrollTop - Math.round(max / 2)) <= 1, 'no echo back into the pane');
      r.rc.scrollTop = 0;
      s.mainScrolled();
      t.assert.equal(sc.scrollTop, 0, 'the reader at its top takes the pane to its top');

      s.setSync(false);
      sc.scrollTop = max;
      sc.dispatchEvent(new Event('scroll'));
      t.assert.equal(r.rc.scrollTop, 0, 'with «بىللە سىيرىلىش» off nothing follows');
    });
  });

  test('parallel-narrow-window-never-overlaps', async function (t) {
    if (!window.Parallel) throw new Error('window.Parallel is missing (src/parallel.js)');
    await withReader(async function (r) {
      const s = r.session;
      await s.open(BOOKS[2]);
      for (const ratio of [0.2, 0.5, 0.8]) {
        s.setRatio(ratio);
        const a = r.rc.getBoundingClientRect();
        const d = s.elements().divider.getBoundingClientRect();
        const b = s.elements().pane.getBoundingClientRect();
        const panel = r.wrap.querySelector('.par-test-panel').getBoundingClientRect();
        t.assert.ok(a.left >= d.right - 0.5 && d.left >= b.right - 0.5 && b.left >= panel.right - 0.5,
          'right to left: reader, divider, pane, panel — at ' + ratio + ': ' + [a.left, a.right, d.left, d.right, b.left, b.right, panel.right].map(Math.round).join(','));
        t.assert.ok(a.width >= 80 && b.width >= 80, 'both panes keep a width at ' + ratio + ': ' + Math.round(a.width) + ', ' + Math.round(b.width));
        t.assert.ok(r.wrap.scrollWidth <= r.wrap.clientWidth + 1, 'nothing spills out of the reader at ' + ratio);
      }
      t.assert.equal(s.setRatio(0.95), 0.8, 'the divider stops at 80 %');
      t.assert.equal(s.setRatio(0.01), 0.2, 'and at 20 %');
    });
  });
})();
