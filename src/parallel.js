// ============================================================================
// «يانمۇيان ئوقۇش» — two books side by side (3.6 Phase 6).
//
// The reader's own book stays on the right. A second book opens on the left
// in a pane of its own: its own pages (the reader's cut, ReaderPlaces), page
// navigation, font size and search in the book. The pane draws with the
// reader's paragraph renderer and its smart Arabic/Uyghur font switching,
// handed in by index.html — there is no second renderer here.
//
// The pane keeps nothing: bookmarks, in-book notes, the AI panel and the
// reading position stay with the right-hand book, as they always have. What
// is remembered is the pair and the divider («ئاخىرقى قېتىمقى جۈپ»), through
// `remember`.
//
// «بىللە سىيرىلىش» (off whenever the pane opens) is approximate: a scroll
// moves the other side to the same proportion of its page, a page turn turns
// the other to the page at the same proportion of its book.
//
// The reader is reached through an adapter (`reader`): book(), content(),
// page(), pages(), searching(), turn(page), open(book, page). index.html
// tells the session when the reader drew a page (mainTurned) or scrolled
// (mainScrolled).
//
// Loaded as a <script> by index.html (window.Parallel) and by the notebook
// test page (tests/notebook/suite-parallel.js).
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Parallel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const RATIO_MIN = 0.2;
  const RATIO_MAX = 0.8;
  const FS_MIN = 13;
  const FS_MAX = 26;
  const SYNC_TIP = 'تەخمىنىي: بىر تەرەپنى سىيرىسىڭىز ياكى ۋاراقلىسىڭىز، يەنە بىر تەرەپ ئۆز بېتى ياكى ئۆز كىتابىنىڭ ئوخشاش نىسبەتتىكى يېرىگە بارىدۇ — جۈملىمۇ جۈملە ماس كەلمەيدۇ';

  /** The page at the same proportion of a book of `otherPages` as `page` is of `pages`. */
  function pageAtSameProportion(page, pages, otherPages) {
    if (!(otherPages > 1) || !(pages > 1)) return 1;
    const f = (page - 1) / (pages - 1);
    return Math.max(1, Math.min(otherPages, Math.round(f * (otherPages - 1)) + 1));
  }

  function clampRatio(r) {
    const n = Number(r);
    if (!Number.isFinite(n)) return 0.5;
    return Math.round(Math.max(RATIO_MIN, Math.min(RATIO_MAX, n)) * 1000) / 1000;
  }

  /** How far down its content a scroll area is, 0 to 1. */
  function scrollFraction(el) {
    const max = el.scrollHeight - el.clientHeight;
    return max > 0 ? Math.max(0, Math.min(1, el.scrollTop / max)) : 0;
  }

  function createSession(o) {
    const wrapper = o.wrapper;
    const mainEl = o.mainEl;
    const reader = o.reader;
    const icon = o.icon || function () { return ''; };

    const st = {
      book: null, content: '', pages: [''], starts: [0], page: 1,
      fs: 17, query: '', searching: false, marks: [], markIdx: 0,
      sync: false, ratio: o.ratio == null ? 0.5 : clampRatio(o.ratio)
    };
    let mounted = false;
    let mainStyle = null;
    let lastMain = 0;
    let busy = false;          // the session itself is moving one side
    let searchTimer = null;
    let drag = null;
    const pending = new Map(); // a scroll the session made, not the owner

    // --- the pane's elements ------------------------------------------------
    const divider = document.createElement('div');
    divider.className = 'par-divider';
    divider.title = 'كەڭلىكنى تەڭشەش';

    const pane = document.createElement('div');
    pane.className = 'par-pane';
    pane.id = 'rp';
    pane.innerHTML =
      '<div class="par-bar">' +
        '<div class="par-title"></div>' +
        '<div class="rsc">' + icon('search') +
          '<input type="text" class="par-q" placeholder="كىتاب ئىچىدىن ئىزدەش...">' +
        '</div>' +
        '<span class="par-count"></span>' +
        '<button type="button" class="hbtn par-prevm" style="display:none">↑</button>' +
        '<button type="button" class="hbtn par-nextm" style="display:none">↓</button>' +
        '<button type="button" class="hbtn par-fs" data-d="-2" title="خەت كىچىكلىتىش">A-</button>' +
        '<button type="button" class="hbtn par-fs" data-d="2" title="خەت چوڭايتىش">A+</button>' +
        '<label class="par-sync" title="' + SYNC_TIP + '"><input type="checkbox" class="par-sync-box"> بىللە سىيرىلىش</label>' +
        '<button type="button" class="hbtn icob par-swap" title="ئورنىنى ئالماشتۇرۇش">' + icon('swap') + '</button>' +
        '<button type="button" class="hbtn icob par-close" title="تاقاش">' + icon('x') + '</button>' +
      '</div>' +
      '<div class="par-scroll"><div class="inner">' +
        '<div class="par-text"></div>' +
        '<div class="par-nav"></div>' +
      '</div></div>';

    const el = {
      pane: pane,
      divider: divider,
      title: pane.querySelector('.par-title'),
      q: pane.querySelector('.par-q'),
      count: pane.querySelector('.par-count'),
      prevm: pane.querySelector('.par-prevm'),
      nextm: pane.querySelector('.par-nextm'),
      syncBox: pane.querySelector('.par-sync-box'),
      scroller: pane.querySelector('.par-scroll'),
      text: pane.querySelector('.par-text'),
      nav: pane.querySelector('.par-nav')
    };

    // --- drawing ------------------------------------------------------------
    function drawPage() {
      el.text.style.fontSize = st.fs + 'px';
      el.text.innerHTML = o.render(st.pages[st.page - 1] || '', st.starts[st.page - 1] || 0);
      el.scroller.scrollTop = 0;
      drawNav();
    }

    function drawNav() {
      const n = st.pages.length;
      if (n <= 1 || st.searching) { el.nav.style.display = 'none'; el.nav.innerHTML = ''; return; }
      el.nav.style.display = '';
      el.nav.innerHTML =
        '<button type="button" class="hbtn" data-go="prev"' + (st.page <= 1 ? ' disabled' : '') + '>→ ئالدىنقى بەت</button>' +
        '<span class="par-pg"><input type="number" class="par-pgin" min="1" max="' + n + '" value="' + st.page + '"> / ' + n + '</span>' +
        '<button type="button" class="hbtn" data-go="next"' + (st.page >= n ? ' disabled' : '') + '>كېيىنكى بەت ←</button>';
    }

    function applyRatio() {
      mainEl.style.flex = st.ratio + ' 1 0px';
      mainEl.style.minWidth = '0';
      pane.style.flex = (1 - st.ratio) + ' 1 0px';
    }

    function remember() {
      if (!mounted || !st.book || typeof o.remember !== 'function') return;
      const b = reader.book();
      if (!b) return;
      try { o.remember({ main: b.id, side: st.book.id, ratio: st.ratio }); } catch (_) {}
    }

    // --- turning and syncing ------------------------------------------------
    /** The pane to page `page`; the owner's turn moves the reader too when synced. */
    function turnTo(page, byOwner) {
      if (!mounted) return;
      const n = st.pages.length;
      const p = Math.max(1, Math.min(n, Math.round(Number(page)) || 1));
      const wasSearching = st.searching;
      if (wasSearching) leaveSearch();
      if (p !== st.page || wasSearching) { st.page = p; drawPage(); }
      else drawNav();
      if (byOwner === false || !st.sync || busy || reader.searching()) return;
      const target = pageAtSameProportion(st.page, n, reader.pages());
      if (target !== reader.page()) {
        busy = true;
        try { reader.turn(target); } finally { busy = false; }
      }
      lastMain = reader.page();
    }

    /** The reader drew a page: with «بىللە سىيرىلىش» the pane follows a turn. */
    function mainTurned() {
      if (!mounted) return;
      const p = reader.page();
      const turned = p !== lastMain;
      lastMain = p;
      if (!turned || busy || !st.sync || st.searching || reader.searching()) return;
      busy = true;
      try { turnTo(pageAtSameProportion(p, reader.pages(), st.pages.length), false); } finally { busy = false; }
    }

    /** Was this scroll one the session made? It is used up either way. */
    function ours(area) {
      if (!pending.has(area)) return false;
      const want = pending.get(area);
      pending.delete(area);
      return Math.abs(area.scrollTop - want) <= 1;
    }

    function follow(from, to) {
      if (ours(from)) return;
      if (!mounted || !st.sync || busy || st.searching || reader.searching()) return;
      const max = to.scrollHeight - to.clientHeight;
      if (max <= 0) return;
      const top = Math.round(scrollFraction(from) * max);
      if (Math.abs(to.scrollTop - top) < 1) return;
      pending.set(to, top);
      to.scrollTop = top;
    }

    function mainScrolled() { follow(mainEl, el.scroller); }

    // --- search in the pane's book -------------------------------------------
    function search(q) {
      if (!mounted) return;
      const query = String(q || '').trim();
      if (el.q.value.trim() !== query) el.q.value = query;
      if (!query) { leaveSearch(); drawPage(); return; }
      st.query = query;
      st.searching = true;
      const re = o.searchRe(query);
      el.text.style.fontSize = st.fs + 'px';
      el.text.innerHTML = o.highlight(o.render(st.content, 0), re);
      st.marks = Array.prototype.slice.call(el.text.querySelectorAll('mark'));
      st.markIdx = 0;
      drawNav();
      if (st.marks.length) {
        el.count.textContent = st.marks.length > 1 ? '1/' + st.marks.length : '1 دانە';
        el.prevm.style.display = st.marks.length > 1 ? '' : 'none';
        el.nextm.style.display = st.marks.length > 1 ? '' : 'none';
        showMark();
      } else {
        el.count.textContent = 'تېپىلمىدى';
        el.prevm.style.display = 'none';
        el.nextm.style.display = 'none';
      }
    }

    function showMark() {
      const m = st.marks[st.markIdx];
      if (!m) return;
      const top = m.getBoundingClientRect().top - el.scroller.getBoundingClientRect().top;
      el.scroller.scrollTop += top - el.scroller.clientHeight / 2;
    }

    function stepMark(d) {
      if (!st.marks.length) return;
      st.markIdx = (st.markIdx + d + st.marks.length) % st.marks.length;
      el.count.textContent = (st.markIdx + 1) + '/' + st.marks.length;
      showMark();
    }

    function leaveSearch() {
      st.searching = false;
      st.query = '';
      st.marks = [];
      el.q.value = '';
      el.count.textContent = '';
      el.prevm.style.display = 'none';
      el.nextm.style.display = 'none';
    }

    // --- the pane's own controls --------------------------------------------
    el.q.addEventListener('input', function () {
      clearTimeout(searchTimer);
      const v = el.q.value;
      searchTimer = setTimeout(function () { search(v); }, 200);
    });
    el.q.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && st.searching) { e.preventDefault(); stepMark(e.shiftKey ? -1 : 1); }
    });
    el.prevm.addEventListener('click', function () { stepMark(-1); });
    el.nextm.addEventListener('click', function () { stepMark(1); });
    pane.querySelectorAll('.par-fs').forEach(function (b) {
      b.addEventListener('click', function () { fontSize(Number(b.dataset.d)); });
    });
    el.syncBox.addEventListener('change', function () { setSync(el.syncBox.checked); });
    pane.querySelector('.par-swap').addEventListener('click', function () { swap(); });
    pane.querySelector('.par-close').addEventListener('click', function () { close(); });
    el.nav.addEventListener('click', function (e) {
      const b = e.target && e.target.closest ? e.target.closest('[data-go]') : null;
      if (!b || b.disabled) return;
      turnTo(st.page + (b.dataset.go === 'next' ? 1 : -1));
    });
    el.nav.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || !e.target.classList.contains('par-pgin')) return;
      turnTo(parseInt(e.target.value, 10));
    });
    el.scroller.addEventListener('scroll', function () { follow(el.scroller, mainEl); }, { passive: true });

    // The divider: the reader's share of the width the two panes have.
    divider.addEventListener('pointerdown', function (e) {
      const a = mainEl.getBoundingClientRect();
      const b = pane.getBoundingClientRect();
      drag = { left: Math.min(a.left, b.left), right: Math.max(a.right, b.right), mainRight: a.left >= b.left };
      divider.classList.add('dragging');
      document.body.style.userSelect = 'none';
      try { divider.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    divider.addEventListener('pointermove', function (e) {
      if (!drag) return;
      const w = drag.right - drag.left;
      if (w <= 0) return;
      setRatio(drag.mainRight ? (drag.right - e.clientX) / w : (e.clientX - drag.left) / w, true);
    });
    function endDrag() {
      if (!drag) return;
      drag = null;
      divider.classList.remove('dragging');
      document.body.style.userSelect = '';
      remember();
    }
    divider.addEventListener('pointerup', endDrag);
    divider.addEventListener('pointercancel', endDrag);

    // --- the session --------------------------------------------------------
    function mount() {
      if (mounted) return;
      mainStyle = mainEl.getAttribute('style');
      mainEl.insertAdjacentElement('afterend', divider);
      divider.insertAdjacentElement('afterend', pane);
      wrapper.classList.add('par-on');
      applyRatio();
      mounted = true;
    }

    /** Show `book` in the pane at `page` — its text in hand. */
    function show(book, content, page) {
      st.book = book;
      st.content = String(content || '');
      const cut = o.paginate(st.content);
      st.pages = cut.pages && cut.pages.length ? cut.pages : [''];
      st.starts = cut.starts && cut.starts.length ? cut.starts : [0];
      st.page = Math.max(1, Math.min(st.pages.length, page || 1));
      leaveSearch();
      el.title.textContent = book.title || '';
      el.title.title = [book.title, book.author].filter(Boolean).join(' — ');
      drawPage();
    }

    /** Open `book` on the left. The reader's own book stays where it is. */
    async function open(book, page) {
      const content = await o.loadContent(book.id);
      const fresh = !mounted;
      if (fresh) {
        st.fs = typeof o.fontSize === 'function' ? o.fontSize() : (o.fontSize || 17);
        setSync(false);
      }
      mount();
      show(book, content, page);
      lastMain = reader.page();
      remember();
    }

    /** The two books change places; each keeps the page it is on. */
    async function swap() {
      if (!mounted || busy || !st.book) return;
      const right = { book: reader.book(), content: reader.content(), page: reader.page() };
      const left = { book: st.book, page: st.page };
      if (!right.book) return;
      busy = true;
      try {
        await reader.open(left.book, left.page);
      } catch (_) {
        return false;     // the reader could not take it: both sides stay as they are
      } finally {
        busy = false;
      }
      show(right.book, right.content, right.page);
      lastMain = reader.page();
      remember();
      return true;
    }

    /** The pane goes; the reader is as it was before it opened. */
    function close() {
      if (!mounted) return;
      clearTimeout(searchTimer);
      endDrag();
      pane.remove();
      divider.remove();
      if (mainStyle === null) mainEl.removeAttribute('style');
      else mainEl.setAttribute('style', mainStyle);
      pane.style.flex = '';
      wrapper.classList.remove('par-on');
      pending.clear();
      mounted = false;
      leaveSearch();
      st.book = null;
      st.content = '';
      st.pages = [''];
      st.starts = [0];
      st.page = 1;
      el.text.innerHTML = '';
    }

    function setSync(on) {
      st.sync = !!on;
      el.syncBox.checked = st.sync;
      lastMain = reader.page();
      pending.clear();
    }

    /** The reader's share of the width, kept between 20 % and 80 %. */
    function setRatio(r, dragging) {
      st.ratio = clampRatio(r);
      if (mounted) applyRatio();
      if (!dragging && mounted) remember();
      return st.ratio;
    }

    function fontSize(d) {
      st.fs = Math.max(FS_MIN, Math.min(FS_MAX, st.fs + (Number(d) || 0)));
      el.text.style.fontSize = st.fs + 'px';
      return st.fs;
    }

    return {
      open: open,
      swap: swap,
      close: close,
      isOpen: function () { return mounted; },
      state: function () {
        return { book: st.book, page: st.page, pages: st.pages.length, fs: st.fs, sync: st.sync, ratio: st.ratio, searching: st.searching };
      },
      elements: function () { return el; },
      turnTo: function (p) { turnTo(p, true); },
      next: function () { turnTo(st.page + 1, true); },
      prev: function () { turnTo(st.page - 1, true); },
      search: search,
      setSync: setSync,
      setRatio: function (r) { return setRatio(r, false); },
      fontSize: fontSize,
      mainTurned: mainTurned,
      mainScrolled: mainScrolled
    };
  }

  return { pageAtSameProportion: pageAtSameProportion, clampRatio: clampRatio, createSession: createSession, SYNC_TIP: SYNC_TIP };
});
