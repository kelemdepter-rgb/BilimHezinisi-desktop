// Notes module (renderer-side). Offline rich-text editor with Quran quick-insert.
// Auto-reference matching is added in Prompt 6 — this file exposes a hook for it.
(function(){
  'use strict';

  // Ensure global state is reachable on window (index.html declares S as const)
  try { if (!window.S && typeof S !== 'undefined') window.S = S; } catch(e) {}

  function _s() { return window.S.notes; }

  let saveTimer = null;        // the three-second debounce after a keystroke
  let editorEl = null;

  // ========== SAVING (K3) ==========
  // What may never happen: something typed is not in the database and nobody
  // says so. Four rules follow, and this state serves them:
  //
  //   1. every edit bumps saveVersion; a write that finishes while the number
  //      has moved on has not saved what is on screen, so the note stays dirty;
  //   2. the newest text goes into curDoc the moment a write STARTS, so
  //      re-mounting the editor - leaving the notebook and coming back - always
  //      shows what is on screen, in flight or not;
  //   3. a failed write is retried (5 s, 15 s, 45 s, then every minute while
  //      the note is dirty) and «ساقلاندى» is never shown in the meantime;
  //   4. anything that replaces or leaves the editor flushes first and stops if
  //      the flush failed - see notesFlush().
  let saveVersion = 0;         // bumped by every edit
  let inFlight = null;         // the promise of the write that is running
  let lastSaveError = '';      // shown in the status line
  let retryTimer = null;
  let retryStep = 0;
  const RETRY_DELAYS = [5000, 15000, 45000];
  const RETRY_EVERY = 60000;

  // ========== SIDEBAR: THE LIST AND THE TRASH (W2, W3, K13) ==========
  // The list searched titles only, could not be sorted or pinned, deleted a note
  // for good after one confirm(), and kept every abandoned «يېڭى خاتىرە». Now:
  // three orders (remembered), titles in Uyghur order, pinned notes first, a
  // one-line preview, a search through titles AND text in the main process,
  // and «ئەخلەت ساندۇقى» at the bottom, where a deleted note waits 30 days.

  const DEFAULT_TITLE = 'يېڭى خاتىرە';
  const LIST_SORTS = ['updated', 'title', 'created'];

  window.renderNotesSidebar = function renderNotesSidebar() {
    const h = `<div class="notes-sidebar-inner">
      <div class="notes-sidebar-header">
        <span class="nl-title">خاتىرە دەپتىرىم</span>
        <button onclick="window.notesCreate()">${icon('plus')} يېڭى خاتىرە</button>
      </div>
      <div class="notes-search">${icon('search')}<input type="text" id="notes-list-search" placeholder="ماۋزۇ ۋە مەزمۇندىن ئىزدەش…" oninput="window.notesListFilter(this.value)"></div>
      <div class="notes-list-tools">
        <select id="notes-list-sort" title="تەرتىپ" onchange="window.notesSetListSort(this.value)">
          <option value="updated">يېڭىلانغان ۋاقىت</option>
          <option value="title">ماۋزۇ</option>
          <option value="created">ياسالغان ۋاقىت</option>
        </select>
      </div>
      <div class="notes-list" id="notes-list-inner">
        <div class="notes-sidebar-empty">يۈكلىنىۋاتىدۇ...</div>
      </div>
      <div class="notes-trash">
        <button type="button" class="notes-trash-toggle" id="notes-trash-toggle" onclick="window.notesToggleTrash()">${icon('trash', 'ic-sm')} ئەخلەت ساندۇقى</button>
        <div class="notes-trash-list" id="notes-trash-list" style="display:none"></div>
      </div>
    </div>`;
    // Trigger async refresh after the HTML is inserted
    setTimeout(refreshNotesList, 50);
    return h;
  };

  // ---- Uyghur order (the web edition's lib/notes/list-sort.ts) ----
  // Chromium has no Uyghur collation: left to itself it puts «ە», the second
  // letter, after «ب», and «ئۆ» before «ئۇ». Each Uyghur letter is mapped onto a
  // run of private-use characters in alphabet order — ئ first, then ا ە ب پ …
  // — and the keys are compared instead. Digits still compare as numbers.
  const UG_ALPHABET = 'ئاەبپتجچخدرزژسشغفقكگڭلمنھوۇۆۈۋېىي';
  const UG_FOLDED = { 'ث': 'س', 'ح': 'ھ', 'ذ': 'ز', 'ص': 'س', 'ض': 'ز', 'ط': 'ت', 'ظ': 'ز', 'ع': 'ا', 'ه': 'ھ', 'ة': 'ھ' };
  const UG_MARKS = /[\u064B-\u0670\u06D6-\u06ED\u08D3-\u08FF\u0640]/g;
  const UG_ALIFS = /[\u0671\u0622\u0623\u0625]/g;

  function uyghurSortKey(title) {
    const normal = String(title || '').replace(UG_MARKS, '').replace(UG_ALIFS, 'ا').replace(/\s+/g, ' ').trim().toLowerCase();
    let key = '';
    for (const ch of normal) {
      const index = UG_ALPHABET.indexOf(UG_FOLDED[ch] || ch);
      key += index >= 0 ? String.fromCharCode(0xE000 + index) : ch;
    }
    return key;
  }

  const rootCollator = new Intl.Collator(undefined, { numeric: true });
  function compareTitles(a, b) {
    return rootCollator.compare(uyghurSortKey(a), uyghurSortKey(b)) || (a < b ? -1 : (a > b ? 1 : 0));
  }

  /** The notes in the chosen order, pinned ones first under their own heading. */
  function sortDocs(docs, sort) {
    const newer = (a, b) => String(b || '').localeCompare(String(a || ''));
    const tie = (a, b) => newer(a.updated_at, b.updated_at) || (b.id - a.id);
    const order = sort === 'title' ? (a, b) => compareTitles(a.title || '', b.title || '') || tie(a, b)
      : sort === 'created' ? (a, b) => newer(a.created_at, b.created_at) || tie(a, b)
      : tie;
    const sorted = docs.slice().sort(order);
    return { pinned: sorted.filter(d => d.pinned), others: sorted.filter(d => !d.pinned) };
  }

  async function loadListSort() {
    if (_s().listSort) return _s().listSort;
    let value = 'updated';
    try {
      const r = await window.electron.dbGetSetting('notes_list_sort', 'updated');
      const v = (r && typeof r === 'object' && 'value' in r) ? r.value : r;
      if (LIST_SORTS.indexOf(v) !== -1) value = v;
    } catch (e) { /* the default */ }
    _s().listSort = value;
    return value;
  }

  async function refreshNotesList() {
    const list = document.getElementById('notes-list-inner');
    if (!list) return;
    const sort = await loadListSort();
    const menu = document.getElementById('notes-list-sort');
    if (menu) menu.value = sort;

    const query = String(_s().listQuery || '').trim();
    let docs;
    if (query.length >= 2) {
      // Titles AND text, in the main process (database.js, notesSearch).
      const r = await window.electron.notesSearch(query);
      if (String(_s().listQuery || '').trim() !== query) return;   // typed on meanwhile
      docs = (r && r.ok && Array.isArray(r.notes)) ? r.notes : [];
    } else {
      const r = await window.electron.notesGetAll();
      if (!r.success) {
        list.innerHTML = `<div class="notes-sidebar-empty" style="color:#A32D2D">خاتالىق: ${escHtml(r.error || '')}</div>`;
        return;
      }
      _s().docs = r.docs;
      docs = r.docs;
    }

    if (!docs.length) {
      list.innerHTML = query.length >= 2
        ? '<div class="notes-sidebar-empty">نەتىجە تېپىلمىدى</div>'
        : `<div class="notes-sidebar-empty">ھازىرغىچە خاتىرە يوق<br><br>«+ يېڭى خاتىرە» بىلەن باشلاڭ</div>`;
    } else {
      const groups = sortDocs(docs, sort);
      let h = '';
      if (groups.pinned.length) {
        h += '<div class="notes-list-group">مىقلانغانلار</div>' + buildNoteItems(groups.pinned);
        if (groups.others.length) h += '<div class="notes-list-group">باشقىلار</div>';
      }
      h += buildNoteItems(groups.others);
      list.innerHTML = h;
    }
    await refreshTrash();
  }
  window.notesRefreshList = refreshNotesList;

  function buildNoteItems(docs) {
    let h = '';
    for (const d of docs) {
      const active = (_s().curDoc && d.id === _s().curDoc.id) ? 'active' : '';
      const updated = formatDate(d.updated_at);
      const pinned = !!d.pinned;
      h += `<div class="notes-item ${active}" data-id="${Number(d.id)}" onclick="window.notesOpen(${Number(d.id)})">
        <div class="notes-item-title">${escHtml(d.title || DEFAULT_TITLE)}</div>
        ${d.preview ? `<div class="notes-item-preview">${escHtml(d.preview)}</div>` : ''}
        <div class="notes-item-meta">${updated} · ${Number(d.size) || 0} ھەرپ</div>
        <button class="notes-item-pin ${pinned ? 'on' : ''}" onclick="event.stopPropagation();window.notesTogglePin(${Number(d.id)})"
          title="${pinned ? 'مىقتىن ئېلىش' : 'تىزىملىكنىڭ بېشىغا مىقلاش'}">${icon('star', 'ic-sm')}</button>
        <button class="notes-item-delete" onclick="window.notesDelete(${Number(d.id)}, event)" title="ئەخلەت ساندۇقىغا">${icon('trash','ic-sm')}</button>
      </div>`;
    }
    return h;
  }

  // The search box: titles and text, 250 ms after typing stops.
  let listSearchTimer = null;
  window.notesListFilter = function (q) {
    _s().listQuery = String(q || '');
    clearTimeout(listSearchTimer);
    listSearchTimer = setTimeout(refreshNotesList, 250);
  };

  window.notesSetListSort = function (value) {
    if (LIST_SORTS.indexOf(value) === -1) return;
    _s().listSort = value;
    try { window.electron.dbSetSetting('notes_list_sort', value); } catch (e) { /* not remembered */ }
    refreshNotesList();
  };

  /** Pinning is not an edit: updated_at stays as it is (database.js). */
  window.notesTogglePin = async function (id) {
    const doc = (_s().docs || []).find(d => d.id === id);
    const next = !(doc && doc.pinned);
    let r = null;
    try { r = await window.electron.notesSetPinned(id, next); } catch (e) { r = null; }
    if (!r || !r.success) { toast('مىقلانمىدى', 'e'); return; }
    await refreshNotesList();
  };

  function formatDate(iso) {
    try {
      const raw = String(iso || '');
      // SQLite's datetime('now') has no zone and is UTC; the trash's ISO strings do.
      const d = new Date(/(Z|[+-]\d\d:?\d\d)$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString();
    } catch(e) { return ''; }
  }

  // ---- the trash ----

  async function refreshTrash() {
    const toggle = document.getElementById('notes-trash-toggle');
    const box = document.getElementById('notes-trash-list');
    if (!toggle && !box) return;
    let r = null;
    try { r = await window.electron.notesTrashList(); } catch (e) { r = null; }
    const docs = (r && r.success && Array.isArray(r.docs)) ? r.docs : [];
    if (toggle) toggle.innerHTML = `${icon('trash', 'ic-sm')} ئەخلەت ساندۇقى (${docs.length})`;
    if (!box) return;
    box.style.display = _s().trashOpen ? '' : 'none';
    if (!_s().trashOpen) return;
    if (!docs.length) {
      box.innerHTML = '<div class="notes-sidebar-empty">ئەخلەت ساندۇقى بوش.<br>ئۆچۈرۈلگەن خاتىرە 30 كۈن بۇ يەردە تۇرىدۇ.</div>';
      return;
    }
    box.innerHTML = '<div class="notes-trash-note">ئۆچۈرۈلگەن خاتىرە 30 كۈندىن كېيىن ئۆزلۈكىدىن يوقىتىلىدۇ.</div>' +
      docs.map(d => `<div class="notes-trash-item" data-id="${Number(d.id)}">
        <div class="notes-item-title" data-action="open">${escHtml(d.title || DEFAULT_TITLE)}</div>
        <div class="notes-item-meta">ئۆچۈرۈلگەن: ${escHtml(formatDate(d.deleted_at))}</div>
        <div class="notes-trash-actions">
          <button type="button" data-action="restore">قايتۇرۇش</button>
          <button type="button" data-action="forever">مەڭگۈلۈك ئۆچۈرۈش</button>
        </div>
      </div>`).join('') +
      '<button type="button" class="notes-trash-empty" id="notes-trash-empty">ئەخلەت ساندۇقىنى بوشىتىش</button>';

    box.querySelectorAll('.notes-trash-item').forEach(row => {
      const id = Number(row.dataset.id);
      row.querySelector('[data-action="open"]').addEventListener('click', () => window.notesOpen(id));
      row.querySelector('[data-action="restore"]').addEventListener('click', () => window.notesRestoreNote(id));
      const forever = row.querySelector('[data-action="forever"]');
      forever.addEventListener('click', () => twoStep(forever, 'يەنە بىر بېسىڭ — قايتۇرغىلى بولمايدۇ', async () => {
        const res = await window.electron.notesDeleteForever(id);
        if (!res || !res.success) { toast('ئۆچۈرۈلمىدى', 'e'); return; }
        if (_s().curDoc && _s().curDoc.id === id) { _s().curDoc = null; await window.renderNotesView(); }
        toast('مەڭگۈلۈك ئۆچۈرۈلدى', 'i');
        await refreshNotesList();
      }));
    });
    const empty = document.getElementById('notes-trash-empty');
    empty.addEventListener('click', () => twoStep(empty, 'يەنە بىر بېسىڭ — ھەممىسى مەڭگۈلۈك ئۆچىدۇ', async () => {
      const res = await window.electron.notesEmptyTrash();
      if (!res || !res.success) { toast('ئەخلەت ساندۇقى بوشىتىلمىدى', 'e'); return; }
      if (_s().curDoc && _s().curDoc.deleted_at) { _s().curDoc = null; await window.renderNotesView(); }
      toast('ئەخلەت ساندۇقى بوشىتىلدى', 'i');
      await refreshNotesList();
    }));
  }

  /**
   * An irreversible button asks once, inline: the first click arms it and
   * says what the second will do; the second runs it. Four seconds later it
   * disarms by itself. (No confirm() — the rule for new renderer code.)
   */
  function twoStep(button, question, run) {
    if (button.classList.contains('armed')) {
      clearTimeout(button._disarm);
      button.classList.remove('armed');
      run();
      return;
    }
    button.dataset.label = button.textContent;
    button.classList.add('armed');
    button.textContent = question;
    button._disarm = setTimeout(() => {
      button.classList.remove('armed');
      button.textContent = button.dataset.label;
    }, 4000);
  }

  window.notesToggleTrash = async function () {
    _s().trashOpen = !_s().trashOpen;
    await refreshTrash();
  };

  /** Back from the trash — from the toast, the trash list or the read-only banner. */
  window.notesRestoreNote = async function (id) {
    let r = null;
    try { r = await window.electron.notesRestore(id); } catch (e) { r = null; }
    if (!r || !r.success) { toast('قايتۇرۇلمىدى', 'e'); return; }
    if (_s().curDoc && _s().curDoc.id === id) {
      _s().curDoc.deleted_at = null;
      await window.renderNotesView();
    }
    toast('خاتىرە قايتۇرۇلدى', 's');
    await refreshNotesList();
  };

  /**
   * A new note left untouched — the default title and no text — is removed
   * when the writer leaves it, instead of piling up as «يېڭى خاتىرە» after
   * «يېڭى خاتىرە». The main process checks again before it deletes anything.
   */
  async function discardIfUntouched() {
    const doc = _s().curDoc;
    if (!doc || doc.deleted_at) return false;
    const title = String(doc.title || '').trim();
    const text = (editorEl && editorEl.isConnected) ? (editorEl.innerText || '') : (doc.content_text || '');
    if ((title && title !== DEFAULT_TITLE) || text.trim()) return false;
    let r = null;
    try { r = await window.electron.notesDiscardEmpty(doc.id); } catch (e) { r = null; }
    return !!(r && r.removed);
  }

  /** setMode() calls this when the writer leaves the notebook. */
  window.notesDiscardUntouched = async function () {
    if (await discardIfUntouched()) _s().curDoc = null;
  };

  // ========== MAIN VIEW ==========

  window.renderNotesView = async function renderNotesView() {
    const main = document.getElementById('main');
    if (!main) return;
    // Restore the persisted collapse state for the two side panels before
    // building the layout (Phase 2 — collapsible panels).
    await loadCollapseState();
    main.innerHTML = `<div class="notes-layout">
      <div class="notes-splitter" id="notes-splitter-side" data-target="side" title="كەڭلىكنى تەڭشەش"></div>
      ${renderNotesMainColumn()}
      <div class="notes-splitter" id="notes-splitter-panel" data-target="panel" title="كەڭلىكنى تەڭشەش"></div>
      ${renderRightPanel()}
    </div>
    <!-- Floating edge handles to re-open a collapsed panel (Claude-desktop style).
         RTL: notes list (#side) sits on the physical RIGHT, the قۇرئان/مەنبە/AI
         panel on the physical LEFT — so pick the edge + arrow by physical side. -->
    <div class="notes-edge-handle notes-edge-right" id="notes-edge-list"
      onclick="window.notesToggleList()" title="خاتىرىلەر تىزىملىكىنى ئېچىش (Ctrl+\\)">❮</div>
    <div class="notes-edge-handle notes-edge-left" id="notes-edge-panel"
      onclick="window.notesTogglePanel()" title="قۇرئان/مەنبە/AI تاختىسىنى ئېچىش (Ctrl+Shift+\\)">❯</div>`;
    applyCollapseState();
    if (_s().curDoc) {
      await mountEditor();
      if (_s().rightTab === 'history') loadHistory();
      else if (_s().rightTab === 'outline') refreshOutline();
      else if (_s().rightTab === 'dictionary') loadDictionaryPane();
    }
  };

  // ========== COLLAPSIBLE SIDE PANELS (Phase 2) ==========
  // Two panels collapse/expand with a smooth width animation: the notes list
  // (the GLOBAL #side sidebar, only while in notes mode) and the .notes-right-
  // panel (قۇرئان/مەنبە). State persists across restarts via the settings IPC.

  async function loadCollapseState() {
    const read = async (key) => {
      try {
        const r = await window.electron.dbGetSetting(key, '0');
        const v = (r && typeof r === 'object' && 'value' in r) ? r.value : r;
        return (v === '1' || v === 1 || v === true);
      } catch (e) { return false; }
    };
    const readNum = async (key) => {
      try {
        const r = await window.electron.dbGetSetting(key, '');
        const v = (r && typeof r === 'object' && 'value' in r) ? r.value : r;
        const n = parseInt(v, 10);
        return (Number.isFinite(n) && n >= 220 && n <= 560) ? n : null;
      } catch (e) { return null; }
    };
    _s().listCollapsed = await read('notes_list_collapsed');
    _s().panelCollapsed = await read('notes_panel_collapsed');
    _s().sideWidth = await readNum('notes_side_width');     // Phase 5 — persisted drag widths
    _s().panelWidth = await readNum('notes_panel_width');
  }

  function applyListCollapsed(collapsed) {
    const side = document.getElementById('side');
    if (side) side.classList.toggle('side-collapsed', !!collapsed);
    const handle = document.getElementById('notes-edge-list');
    if (handle) handle.style.display = collapsed ? 'flex' : 'none';
    const btn = document.getElementById('notes-collapse-list-btn');
    if (btn) btn.classList.toggle('active', !!collapsed);
    const sp = document.getElementById('notes-splitter-side');   // hide divider while collapsed
    if (sp) sp.style.display = collapsed ? 'none' : '';
  }

  function applyPanelCollapsed(collapsed) {
    const panel = document.querySelector('.notes-right-panel');
    if (panel) panel.classList.toggle('collapsed', !!collapsed);
    const handle = document.getElementById('notes-edge-panel');
    if (handle) handle.style.display = collapsed ? 'flex' : 'none';
    const btn = document.getElementById('notes-collapse-panel-btn');
    if (btn) btn.classList.toggle('active', !!collapsed);
    const sp = document.getElementById('notes-splitter-panel');
    if (sp) sp.style.display = collapsed ? 'none' : '';
  }

  // Apply persisted drag widths as inline styles. The collapse classes use
  // width:0 !important, so a collapsed panel still wins over these.
  function applyPanelWidths() {
    const side = document.getElementById('side');
    if (side && _s().sideWidth) side.style.width = _s().sideWidth + 'px';
    const panel = document.querySelector('.notes-right-panel');
    if (panel && _s().panelWidth) panel.style.width = _s().panelWidth + 'px';
  }

  function applyCollapseState() {
    applyListCollapsed(_s().listCollapsed);
    applyPanelCollapsed(_s().panelCollapsed);
    applyPanelWidths();
  }

  // ===== Draggable dividers (Phase 5) =====
  // RTL: #side is on the physical RIGHT, .notes-right-panel on the physical
  // LEFT, so dragging the same dx grows one and shrinks the other (opposite
  // signs). Widths clamp to [220, 560] and persist via the settings IPC.
  let _splitDrag = null;
  function onSplitterDown(e) {
    const sp = e.target && e.target.closest ? e.target.closest('.notes-splitter') : null;
    if (!sp) return;
    const target = sp.dataset.target;   // 'side' | 'panel'
    const el = (target === 'side') ? document.getElementById('side') : document.querySelector('.notes-right-panel');
    if (!el) return;
    _splitDrag = {
      target: target, el: el, sp: sp,
      startX: e.clientX,
      startW: el.getBoundingClientRect().width,
      sign: (target === 'side') ? -1 : 1
    };
    sp.classList.add('dragging');
    el.style.transition = 'none';
    document.body.style.userSelect = 'none';
    try { sp.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault();
  }
  function onSplitterMove(e) {
    if (!_splitDrag) return;
    const dx = e.clientX - _splitDrag.startX;
    let w = _splitDrag.startW + _splitDrag.sign * dx;
    w = Math.max(220, Math.min(560, w));
    _splitDrag.el.style.width = w + 'px';
  }
  function onSplitterUp() {
    if (!_splitDrag) return;
    const { target, el, sp } = _splitDrag;
    el.style.transition = '';
    if (sp) sp.classList.remove('dragging');
    document.body.style.userSelect = '';
    const w = parseInt(el.style.width, 10);
    if (Number.isFinite(w)) {
      if (target === 'side') _s().sideWidth = w; else _s().panelWidth = w;
      const key = (target === 'side') ? 'notes_side_width' : 'notes_panel_width';
      try { window.electron.dbSetSetting(key, String(w)); } catch (_) {}
    }
    _splitDrag = null;
  }
  // One set of delegated listeners (the splitter elements are re-rendered each
  // time the notes view mounts, but these document-level handlers persist).
  document.addEventListener('pointerdown', onSplitterDown);
  document.addEventListener('pointermove', onSplitterMove);
  document.addEventListener('pointerup', onSplitterUp);
  // Exposed so setMode() can re-apply the saved state when (re-)entering notes.
  window.notesApplyCollapseState = applyCollapseState;

  window.notesToggleList = function notesToggleList() {
    const st = _s();
    st.listCollapsed = !st.listCollapsed;
    applyListCollapsed(st.listCollapsed);
    try { window.electron.dbSetSetting('notes_list_collapsed', st.listCollapsed ? '1' : '0'); } catch (e) {}
  };

  window.notesTogglePanel = function notesTogglePanel() {
    const st = _s();
    st.panelCollapsed = !st.panelCollapsed;
    applyPanelCollapsed(st.panelCollapsed);
    try { window.electron.dbSetSetting('notes_panel_collapsed', st.panelCollapsed ? '1' : '0'); } catch (e) {}
  };

  function renderNotesMainColumn() {
    if (!_s().curDoc) {
      return `<div class="notes-main">
        <div class="notes-empty">
          <div class="notes-empty-icon">${icon('notebook-pen')}</div>
          <h3 style="font-size:16px;font-weight:600;color:var(--text2);margin-bottom:8px">خاتىرە يوق</h3>
          <p style="font-size:13px">يان تەرەپتىن بىر خاتىرە تاللاڭ<br>ياكى «+ يېڭى خاتىرە» بىلەن باشلاڭ</p>
        </div>
      </div>`;
    }

    const d = _s().curDoc;
    return `<div class="notes-main">
      <div class="notes-title-bar">
        <button class="notes-collapse-btn" id="notes-collapse-list-btn" type="button"
          onclick="window.notesToggleList()"
          title="خاتىرىلەر تىزىملىكىنى يىغىش/ئېچىش (Ctrl+\\)">◨</button>
        <input type="text" class="notes-title-input" id="notes-title" ${d.deleted_at ? 'readonly' : ''}
          value="${escAttr(d.title || '')}"
          placeholder="خاتىرە نامى..."
          oninput="window.notesOnTitleInput(this.value)">
        <span class="notes-status saved" id="notes-status">ساقلاندى</span>
        <button class="notes-collapse-btn" type="button" onclick="window.notesShowOutline()"
          title="خاتىرىدىكى ماۋزۇلار" style="width:auto;padding:0 10px;gap:6px">${icon('list')} مۇندەرىجە</button>
        <button class="notes-collapse-btn" type="button" onclick="window.notesShowHistory()"
          title="خاتىرىنىڭ ئىلگىرىكى نۇسخىلىرى" style="width:auto;padding:0 10px;gap:6px">${icon('clock')} نەشر تارىخى</button>
        <div class="notes-export-wrap" id="notes-export-wrap">
          <button class="notes-collapse-btn" type="button" onclick="window.notesExportMenu(event)"
            title="خاتىرىنى ھۆججەت قىلىپ چىقىرىش" style="width:auto;padding:0 10px;gap:6px">${icon('download')} چىقىرىش ▾</button>
          <div class="notes-export-menu" id="notes-export-menu">
            <button type="button" data-format="docx" onclick="window.notesExport('docx')">${icon('file-text')} Word (.docx)</button>
            <button type="button" data-format="pdf" onclick="window.notesExport('pdf')">${icon('file-text')} PDF</button>
            <button type="button" data-format="md" onclick="window.notesExport('md')">${icon('file-text')} Markdown (.md)</button>
            <button type="button" data-format="txt" onclick="window.notesExport('txt')">${icon('file-text')} تېكىست (.txt)</button>
            <label class="notes-export-option">
              <input type="checkbox" id="notes-export-footnotes" onchange="window.notesSetExportFootnotes(this.checked)">
              <span>مەنبەلەرنى ئاستى ئىزاھات قىلىش</span>
            </label>
          </div>
        </div>
        <button class="notes-savebtn" type="button" onclick="window.notesSaveNow()" title="ساقلاش (Ctrl+S)">${icon('save')} ساقلاش</button>
        <button class="notes-collapse-btn" id="notes-collapse-panel-btn" type="button"
          onclick="window.notesTogglePanel()"
          title="قۇرئان/مەنبە تاختىسىنى يىغىش/ئېچىش (Ctrl+Shift+\\)">◧</button>
      </div>
      ${renderToolbar()}
      <div class="notes-toggle-bar">
        <label class="notes-toggle-label">
          <input type="checkbox" id="notes-toggle-refscan" onchange="window.notesToggleRefScan(this.checked)">
          <span>كىتاب ئامبىرىدىن ئىزدەش (تورسىز)</span>
        </label>
        <label class="notes-toggle-label">
          <input type="checkbox" id="notes-toggle-spellcheck" onchange="window.notesToggleSpellCheck(this.checked)">
          <span>ئىملانى تەكشۈرۈش (تورسىز)</span>
        </label>
        <span class="notes-spell-tools">
          <button type="button" data-spell-step="-1" onmousedown="event.preventDefault()" onclick="window.notesSpellStep(-1)" title="ئالدىنقى ئىملا خاتالىقى (Shift+F7)">▲ ئالدىنقى</button>
          <button type="button" data-spell-step="1" onmousedown="event.preventDefault()" onclick="window.notesSpellStep(1)" title="كېيىنكى ئىملا خاتالىقى (F7)">▼ كېيىنكى خاتالىق</button>
          <button type="button" onclick="window.notesShowDictionary()" title="شەخسىي لۇغەت — لۇغەتكە قوشقان سۆزلىرىڭىز">${icon('book-marked', 'ic-sm')} لۇغەت</button>
        </span>
        <div class="notes-ai-menu-wrap" id="notes-ai-menu-wrap">
          <button type="button" class="notes-ai-trigger" id="notes-ai-trigger" onclick="window.naiToggleMenu(event)">${icon('sparkles')} سۈنئىي ئىدراك ئىقتىدارلىرى (Gemini API — تور ھالىتىدە) ▾</button>
          <div class="notes-ai-flyout" id="notes-ai-flyout">
            <div class="notes-ai-item notes-ai-has-sub">
              <span class="notes-ai-item-label">تەرجىمە قىلىش ◂</span>
              <div class="notes-ai-submenu">
                <button type="button" onclick="window.naiTranslate('uy','ar')">ئۇيغۇرچىدىن ئەرەبچىگە</button>
                <button type="button" onclick="window.naiTranslate('ar','uy')">ئەرەبچىدىن ئۇيغۇرچىگە</button>
                <button type="button" onclick="window.naiTranslate('uy','en')">ئۇيغۇرچىدىن ئىنگلىزچىگە</button>
                <button type="button" onclick="window.naiTranslate('en','uy')">ئىنگلىزچىدىن ئۇيغۇرچىگە</button>
                <button type="button" onclick="window.naiTranslate('uy','tr')">ئۇيغۇرچىدىن تۈركچىگە</button>
                <button type="button" onclick="window.naiTranslate('tr','uy')">تۈركچىدىن ئۇيغۇرچىگە</button>
              </div>
            </div>
            <button type="button" class="notes-ai-item" onclick="window.naiProofread()">تىنىش بەلگىلىرى ۋە ئىملانى توغرىلاش</button>
            <button type="button" class="notes-ai-item" onclick="window.naiChatOpen()">سۈنئىي ئىدراكتىن سوراش</button>
            <div class="notes-ai-item notes-ai-has-sub">
              <span class="notes-ai-item-label">كۆرۈنمە بەت ھەققىدە سوئال سوراش ◂</span>
              <div class="notes-ai-submenu">
                <button type="button" onclick="window.naiPageQA('summary')">خۇلاسىلەش</button>
                <button type="button" onclick="window.naiPageQA('explain')">ئاددىي چۈشەندۈرۈش</button>
                <button type="button" onclick="window.naiPageQA('central_idea')">مەركىزىي ئىدىيەسى</button>
                <button type="button" onclick="window.naiPageQA('other')">باشقا...</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="notes-find-bar" id="notes-find-bar" style="display:none">
        <input type="text" id="notes-find-input" placeholder="ئىزدەش..."
          onkeydown="window.notesFindKey(event)" oninput="window.notesFindRun()">
        <span class="notes-find-count" id="notes-find-count">0 / 0</span>
        <button type="button" onclick="window.notesFindPrev()" title="ئالدىنقى (Shift+Enter)">▲</button>
        <button type="button" onclick="window.notesFindNext()" title="كېيىنكى (Enter)">▼</button>
        <input type="text" id="notes-replace-input" placeholder="ئالماشتۇرۇش..." style="display:none">
        <button type="button" id="notes-replace-btn" onclick="window.notesReplaceOne()" style="display:none">ئالماشتۇرۇش</button>
        <button type="button" id="notes-replace-all-btn" onclick="window.notesReplaceAll()" style="display:none">ھەممىنى ئالماشتۇرۇش</button>
        <button type="button" id="notes-undo-all-btn" onclick="window.notesUndoReplaceAll()" style="display:none">ھەممىنى يېنىۋېلىش</button>
        <button type="button" onclick="window.notesFindClose()" title="تاقاش (Esc)">${icon('x','ic-sm')}</button>
      </div>
      ${d.deleted_at ? `<div class="notes-trashed-banner" id="notes-trashed-banner">
        ${icon('trash', 'ic-sm')} <span>بۇ خاتىرە ئەخلەت ساندۇقىدا — پەقەت ئوقۇشقا بولىدۇ.</span>
        <button type="button" data-action="restore" onclick="window.notesRestoreNote(${Number(d.id)})">قايتۇرۇش</button>
      </div>` : ''}
      <div class="notes-editor-wrap">
        <div class="notes-editor" id="notes-editor"
          contenteditable="${d.deleted_at ? 'false' : 'true'}" spellcheck="false"></div>
      </div>
      <div class="notes-wordcount" id="notes-wordcount">
        <span id="notes-wc-text">سۆز: 0 · ھەرپ: 0</span>
        <button type="button" id="notes-ocr-cleanup-btn" class="notes-wc-action" style="display:none"
          onclick="window.naiOcrCleanupNote()">${icon('sparkles')} OCR نەتىجىسىنى AI بىلەن تۈزىتىش (تور)</button>
      </div>
    </div>`;
  }

  function renderToolbar() {
    return `<div class="notes-toolbar">
      <div class="notes-toolbar-group">
        <button type="button" id="notes-undo-btn" onmousedown="event.preventDefault()" onclick="window.notesExec('undo')" title="يېنىۋېلىش (Ctrl+Z)">${icon('undo')}</button>
        <button type="button" id="notes-redo-btn" onmousedown="event.preventDefault()" onclick="window.notesExec('redo')" title="قايتىلاش (Ctrl+Y)">${icon('redo')}</button>
      </div>
      <div class="notes-toolbar-group">
        <select id="notes-block-style" title="تېكىست شەكلى" onmousedown="window.notesSaveSel()" onchange="window.notesSetBlockStyle(this.value)">
          <option value="normal">ئادەتتىكى تېكىست</option>
          <option value="h2">چوڭ ماۋزۇ</option>
          <option value="h3">كىچىك ماۋزۇ</option>
          <option value="quote">نەقىل</option>
        </select>
      </div>
      <div class="notes-toolbar-group">
        <button onclick="window.notesExec('bold')" title="توم (Ctrl+B)"><b>B</b></button>
        <button onclick="window.notesExec('italic')" title="يانتۇ (Ctrl+I)"><i>I</i></button>
        <button onclick="window.notesExec('underline')" title="ئاستى سىزىق (Ctrl+U)"><u>U</u></button>
      </div>
      <div class="notes-toolbar-group">
        <select onchange="window.notesSetFont(this.value);this.value=''" title="خەت نۇسخىسى">
          <option value="" disabled selected>فونت</option>
          <option value="UKIJ Ekran">UKIJ Ekran</option>
          <option value="UKIJ Tuz">UKIJ Tuz</option>
          <option value="UKIJ Tuz Tom">UKIJ Tuz Tom</option>
          <option value="UKIJ Tuz Kitab">UKIJ Tuz Kitab</option>
          <option value="UKIJ Esliye">UKIJ Esliye</option>
          <option value="UthmanicHafs">Uthmanic Hafs</option>
        </select>
        <select onchange="window.notesSetSize(this.value);this.value=''" title="خەت چوڭلۇقى">
          <option value="" disabled selected>چوڭلۇق</option>
          <option value="2">كىچىك</option>
          <option value="3">نورمال</option>
          <option value="4">چوڭ</option>
          <option value="5">ناھايىتى چوڭ</option>
          <option value="6">قاتتىق چوڭ</option>
        </select>
      </div>
      <div class="notes-toolbar-group">
        <button onclick="window.notesExec('insertUnorderedList')" title="نۇقتىلىق تىزىملىك">${icon('list')}</button>
        <button onclick="window.notesExec('insertOrderedList')" title="نومۇرلۇق تىزىملىك">${icon('list-ordered')}</button>
      </div>
      <div class="notes-toolbar-group">
        <button onclick="window.notesExec('justifyRight')" title="ئوڭغا">${icon('align-right')}</button>
        <button onclick="window.notesExec('justifyCenter')" title="ئوتتۇرىدا">${icon('align-center')}</button>
        <button onclick="window.notesExec('justifyLeft')" title="سولغا">${icon('align-left')}</button>
      </div>
      <div class="notes-toolbar-group">
        <label class="notes-color-ctl notes-color-fore" title="خەت رەڭگى">A<input type="color" id="notes-color-fore" value="#1A1208"
          onmousedown="window.notesSaveSel()" onchange="window.notesSetColor(this.value)"></label>
        <label class="notes-color-ctl notes-color-back" title="بەلگىلەش رەڭگى (Highlight)"><input type="color" id="notes-color-back" value="#FFF176"
          onmousedown="window.notesSaveSel()" onchange="window.notesSetHilite(this.value)"></label>
      </div>
      <div class="notes-toolbar-group">
        <input type="number" class="notes-num-ctl" id="notes-indent" min="0" max="5" step="0.1" placeholder="cm"
          title="ئابزاس بېشى كىرىش (cm)" onmousedown="window.notesSaveSel()" onchange="window.notesSetIndent(this.value)">
        <select class="notes-ls-ctl" id="notes-linespacing" title="قۇر ئارىلىقى"
          onmousedown="window.notesSaveSel()" onchange="window.notesSetLineHeight(this.value);this.selectedIndex=0">
          <option value="" disabled selected>قۇر ئارىلىقى</option>
          <option value="1">1.0</option>
          <option value="1.15">1.15</option>
          <option value="1.5">1.5</option>
          <option value="2">2.0</option>
        </select>
      </div>
      <div class="notes-toolbar-group">
        <button id="notes-fp-btn" type="button" onmousedown="window.notesFpPress(event)"
          title="فورمات سۈپۈرگىسى (Alt+Ctrl+C / Alt+Ctrl+V)">${icon('brush')}</button>
        <button type="button" onclick="window.notesImageOcr()"
          title="رەسىمدىن تېكىست (OCR، تورسىز)">${icon('camera')}</button>
      </div>
      <div class="notes-toolbar-group">
        <button onclick="window.notesExec('removeFormat')" title="فورماتنى ئۆچۈرۈش">${icon('eraser')}</button>
        <button onclick="window.notesSaveNow()" title="ھازىرلا ساقلاش (Ctrl+S)">${icon('save')}</button>
      </div>
    </div>`;
  }

  function renderRightPanel() {
    const tab = _s().rightTab || 'quran';
    const vis = (name) => (tab === name) ? '' : 'display:none';
    // Three panes (قۇرئان · مەنبە · AI), all kept in the DOM and toggled by
    // visibility (Phase 3). The AI tab is online; the other two are offline +
    // DB-backed and never affected by the AI tab's state.
    return `<div class="notes-right-panel">
      <div class="notes-right-panel-tabs">
        <div class="notes-right-panel-tab ${tab==='quran'?'active':''}" data-tab="quran" onclick="window.notesSetTab('quran')">${icon('book-open')} قۇرئان (تورسىز)</div>
        <div class="notes-right-panel-tab ${tab==='refs'?'active':''}" data-tab="refs" onclick="window.notesSetTab('refs')">${icon('link')} مەنبە (تورسىز)</div>
        <div class="notes-right-panel-tab ${tab==='ai'?'active':''}" data-tab="ai" onclick="window.notesSetTab('ai')">${icon('sparkles')} AI (تورلۇق)</div>
      </div>
      <div class="notes-right-panel-content" id="notes-right-content">
        <div class="notes-right-pane" data-pane="quran" style="${vis('quran')}">${renderQuranPicker()}</div>
        <div class="notes-right-pane" data-pane="refs" style="${vis('refs')}">${renderSourceSearch()}${renderRefsEmpty()}</div>
        <div class="notes-right-pane" data-pane="ai" style="${vis('ai')}">${renderAiTab()}</div>
        <div class="notes-right-pane" data-pane="history" style="${vis('history')}">${renderHistoryPane()}</div>
        <div class="notes-right-pane" data-pane="outline" style="${vis('outline')}">${renderOutlinePane()}</div>
        <div class="notes-right-pane" data-pane="dictionary" style="${vis('dictionary')}">${renderDictionaryPane()}</div>
      </div>
    </div>`;
  }

  // The AI output tab (Phase 3). Replaces the old floating #nai-panel; keeps the
  // SAME element IDs so the index.html nai* logic targets them unchanged. It
  // stays mounted (toggled with the other panes), so a running stream's target
  // (#nai-result) never disappears on a tab switch.
  function renderAiTab() {
    return `<div id="nai-tab">
      <div id="nai-title" class="nai-tab-title">${icon('sparkles')} سۈنئىي ئىدراك</div>
      <div id="nai-gate" class="nai-tab-gate" style="display:none">تەڭشەكتىن AI نى ئېچىڭ</div>
      <div id="nai-status"></div>
      <div id="nai-result"></div>
      <div id="nai-extra" style="display:none"></div>
      <div id="nai-actions" style="display:none"></div>
      <div id="nai-chatbar" style="display:none">
        <textarea id="nai-chat-input" rows="3" placeholder="سۈنئىي ئىدراكتىن خالىغان سوئالنى سوراڭ. مەزكۇر بەت مەزمۇنى بىلەن مۇناسىۋەتسىز"
          oninput="window.naiAutoGrow && window.naiAutoGrow(this)"
          onkeydown="if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();window.naiChatSend();}"></textarea>
        <button type="button" onclick="window.naiChatSend()">ئەۋەت</button>
      </div>
    </div>`;
  }

  function renderQuranPicker() {
    const sura = _s().quickSura || '';
    const aya = _s().quickAya || '';
    const mode = ayaMode(_s().ayaMode);
    return `<div>
      <div class="notes-quran-picker">
        <input type="number" id="notes-q-sura" min="1" max="114" placeholder="سۈرە" value="${sura}"
          onkeydown="if(event.key==='Enter')window.notesQuranPreview()">
        <span style="color:var(--text3);font-size:12px">:</span>
        <input type="number" id="notes-q-aya" min="1" placeholder="ئايەت" value="${aya}"
          onkeydown="if(event.key==='Enter')window.notesQuranPreview()">
        <button onclick="window.notesQuranPreview()">كۆرۈش</button>
      </div>
      <div class="notes-aya-mode" role="radiogroup" aria-label="ئايەتنى قانداق قىستۇرۇش">
        ${AYA_MODES.map(m => `<label><input type="radio" name="notes-aya-mode" value="${m}" ${m === mode ? 'checked' : ''}
          onchange="window.notesSetAyaMode(this.value)"><span>${AYA_MODE_LABELS[m]}</span></label>`).join('')}
      </div>
      <div id="notes-q-preview"></div>
    </div>`;
  }

  // The search box at the top of «مەنبە» (W12); the automatic references
  // (renderRefsEmpty, then renderRefsPanel) stay below it.
  function renderSourceSearch() {
    return `<div class="notes-src">
      <div class="notes-src-box">
        <input type="search" id="notes-src-q" dir="rtl" placeholder="كىتابلار ۋە قۇرئاندىن ئىزدەش"
          onkeydown="if(event.key==='Enter'){event.preventDefault();window.notesSourceSearch();}">
        <button type="button" onclick="window.notesSourceSearch()" title="ئىزدەش" aria-label="ئىزدەش">${icon('search')}</button>
      </div>
      <div id="notes-src-results"></div>
    </div>`;
  }

  function renderRefsEmpty() {
    return `<div id="notes-refs-content" class="notes-ref-list">
      <div class="notes-ref-empty">
        كىتابلاردىن تېپىلغان<br>
        مەنبىلەر بۇ يەردە كۆرۈنىدۇ<br><br>
        تەھرىرلىگۈچكە يازسىڭىز<br>ئاپتوماتىك چىقىدۇ
      </div>
    </div>`;
  }

  window.notesSetTab = function(tab) {
    _s().rightTab = tab;
    // Toggle visibility of the three panes (Phase 3) — never rebuild innerHTML,
    // so a streaming AI answer in #nai-result survives a tab switch.
    document.querySelectorAll('.notes-right-panel-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    document.querySelectorAll('.notes-right-pane').forEach(p => {
      p.style.display = (p.dataset.pane === tab) ? '' : 'none';
    });
    if (tab === 'refs' && typeof window.notesRenderRefsPanel === 'function') {
      window.notesRenderRefsPanel();
    }
    if (tab === 'ai' && typeof window.naiRefreshTab === 'function') {
      window.naiRefreshTab();
    }
  };

  // Open the AI tab (expanding the right panel if it was collapsed). Used by the
  // index.html nai* logic in place of the retired floating drawer.
  window.notesShowAiTab = function() {
    if (_s().panelCollapsed && typeof window.notesTogglePanel === 'function') {
      window.notesTogglePanel();
    }
    window.notesSetTab('ai');
  };

  // «ئەرەبچە / تەرجىمىسى / ئىككىلىسى», remembered in the settings (W12).
  window.notesSetAyaMode = async function(mode) {
    _s().ayaMode = ayaMode(mode);
    document.querySelectorAll('input[name="notes-aya-mode"]').forEach(r => { r.checked = (r.value === _s().ayaMode); });
    try { await window.electron.dbSetSetting('notes_aya_mode', _s().ayaMode); } catch(e) {}
    // A verse on show is shown again the way it would now be inserted.
    const preview = document.getElementById('notes-q-preview');
    if (preview && preview.firstElementChild && _s().quickSura && _s().quickAya) window.notesQuranPreview();
  };

  // ========== DOCUMENT CRUD ==========

  window.notesCreate = async function() {
    if (!await flushOrWarn()) return;
    await discardIfUntouched();

    const r = await window.electron.notesCreate('يېڭى خاتىرە');
    if (!r.success) {
      toast('ياساش مۇۋەپپەقىيەتسىز بولدى', 'e');
      return;
    }
    await refreshNotesList();
    await window.notesOpen(r.id);
  };

  window.notesOpen = async function(id) {
    if (!await flushOrWarn()) return;
    if (_s().curDoc && _s().curDoc.id !== id) await discardIfUntouched();

    const r = await window.electron.notesGet(id);
    if (!r.success || !r.doc) {
      toast('خاتىرە تېپىلمىدى', 'e');
      return;
    }

    _s().curDoc = r.doc;
    _s().dirty = false;
    _s().refsFilter = null;
    _s().matches = new Map();

    // Reset scanner state — without this, the new note's first scan is skipped
    // because lastScannedText still holds the previous note's text.
    lastScannedText = '\x00INIT\x00';
    if (scanTimer) { clearTimeout(scanTimer); scanTimer = null; }

    // Reset save coordination
    saveVersion = 0;
    lastSaveError = '';
    stopRetrying();
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    reportDirty(false);

    await window.renderNotesView();
    keepVersion('open');
    await refreshNotesList();
  };

  /**
   * Delete = to the trash, at once, no question (W2). The toast offers
   * «قايتۇرۇش» for 10 seconds; «ئەخلەت ساندۇقى» keeps the note for 30 days.
   */
  window.notesDelete = async function(id, ev) {
    if (ev) ev.stopPropagation();
    const open = !!(_s().curDoc && _s().curDoc.id === id);
    // Deleting the note that is open must not take unsaved writing with it.
    if (open && !await flushOrWarn()) return;

    let r = null;
    try { r = await window.electron.notesDelete(id); } catch (e) { r = null; }
    if (!r || !r.success) {
      toast('ئۆچۈرۈش مۇۋەپپەقىيەتسىز', 'e');
      return;
    }
    if (open) {
      _s().curDoc = null;
      _s().matches = new Map();
      await window.renderNotesView();
    }
    await refreshNotesList();
    toast('خاتىرە ئەخلەت ساندۇقىغا يۆتكەلدى', 'i', {
      ms: 10000,
      action: { label: 'قايتۇرۇش', run: () => window.notesRestoreNote(id) }
    });
  };

  window.notesOnTitleInput = function(val) {
    if (!_s().curDoc) return;
    _s().curDoc.title = val;
    markDirty();
  };

  // ========== EDITOR ==========

  /**
   * Replace the whole document in the editor — and the ONLY place in the app
   * that assigns the editor's innerHTML.
   *
   * Mounting a note, restoring an earlier version and applying an AI
   * correction all come through here, so sanitizing, unwrapping the transient
   * markup older versions saved, and re-reading the counts, the spelling and
   * the references happen in exactly one place and cannot be forgotten.
   * tests/main/static-checks.js fails if anything else writes innerHTML on the
   * editor.
   */
  function putDocument(html) {
    if (!editorEl) return;
    const safe = (window.SafeHTML && window.SafeHTML.sanitize)
      ? window.SafeHTML.sanitize(html || '')
      : (html || '');
    editorEl.innerHTML = safe || '<p><br></p>';
    unwrapLegacyMarkup();
    editorEl.normalize();
    updateWordCount();
    if (_s().spellCheckEnabled && typeof window.notesRunSpellCheck === 'function') {
      window.notesRunSpellCheck();
    }
    if (typeof window.notesScanReferences === 'function') window.notesScanReferences();
    scheduleOutline();
  }
  window.notesPutDocument = putDocument;

  /**
   * Markup that was never the writer's: spell-check underlines (v3.1.0 and
   * earlier), find hits and reference matches. All three used to be written
   * into the note as elements and saved with it, and came back on the next open
   * as dead markup the writer could not remove. They are painted on the
   * highlight layer now; this cleans up what the old versions stored, and the
   * next save writes the note back clean.
   */
  function unwrapLegacyMarkup() {
    if (!editorEl) return;
    editorEl.querySelectorAll('span.spell-error, span.ref-match')
      .forEach(el => el.replaceWith(...el.childNodes));
    editorEl.querySelectorAll('mark.notes-find-hit')
      .forEach(el => el.replaceWith(...el.childNodes));
  }

  async function mountEditor() {
    // Load toggle preferences (default: ref-scan ON, spell-check OFF)
    try {
      const refRes = await window.electron.dbGetSetting('notes_ref_scan', 'on');
      const refVal = (refRes && typeof refRes === 'object' && 'value' in refRes) ? refRes.value : refRes;
      _s().refScanEnabled = (refVal !== 'off');

      const spRes = await window.electron.dbGetSetting('notes_spell_check', 'off');
      const spVal = (spRes && typeof spRes === 'object' && 'value' in spRes) ? spRes.value : spRes;
      _s().spellCheckEnabled = (spVal === 'on');

      const amRes = await window.electron.dbGetSetting('notes_aya_mode', 'both');
      const amVal = (amRes && typeof amRes === 'object' && 'value' in amRes) ? amRes.value : amRes;
      _s().ayaMode = ayaMode(amVal);
    } catch (e) {
      _s().refScanEnabled = true;
      _s().spellCheckEnabled = false;
      _s().ayaMode = 'both';
    }

    // Reflect loaded prefs into the toggle-bar checkboxes (rendered with the main column)
    const refCb = document.getElementById('notes-toggle-refscan');
    if (refCb) refCb.checked = !!_s().refScanEnabled;
    const spCb = document.getElementById('notes-toggle-spellcheck');
    if (spCb) spCb.checked = !!_s().spellCheckEnabled;
    document.querySelectorAll('input[name="notes-aya-mode"]').forEach(r => { r.checked = (r.value === _s().ayaMode); });

    // Switching documents (re-mounting the editor) always disarms the format
    // painter (its captured format belonged to the previous editor) and aborts
    // any in-flight notebook AI stream that targeted the old drawer.
    fpDisarm();
    if (typeof window.naiAbort === 'function') window.naiAbort();
    resetEditorTools();

    editorEl = document.getElementById('notes-editor');
    if (!editorEl) return;
    putDocument(_s().curDoc.content_html || '');

    editorEl.addEventListener('input', () => { if (!inputSuspended) onEditorInput(); });
    // Initial word count for the loaded document.
    updateWordCount();

    editorEl.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveNow();
        return;
      }
      // Format painter (Word parity): Alt+Ctrl+C captures + arms (one-shot);
      // Alt+Ctrl+V applies the captured format to the selection. Legacy
      // Ctrl+Shift+C / Ctrl+Shift+V also accepted. Esc always disarms.
      const k = e.key.toLowerCase();
      const code = e.code || '';   // physical key — robust when Ctrl+Alt (AltGr) remaps e.key
      const fpMod = (e.ctrlKey || e.metaKey) && (e.altKey || e.shiftKey);
      if (fpMod && (code === 'KeyC' || k === 'c')) {
        e.preventDefault();
        fpFormat = fpCaptureFormat();
        fpArm(false);
        return;
      }
      if (fpMod && (code === 'KeyV' || k === 'v')) {
        e.preventDefault();
        if (!fpFormat) return;
        fpApplyFormat();
        if (!fpSticky) fpDisarm();
        return;
      }
      if (e.key === 'Escape' && fpArmed) {
        e.preventDefault();
        fpDisarm();
        return;
      }
      // F7 / Shift+F7: the next / previous spelling error (W7).
      if (e.key === 'F7' && typeof window.notesSpellStep === 'function') {
        e.preventDefault();
        window.notesSpellStep(e.shiftKey ? -1 : 1);
        return;
      }
      // Find / replace (Phase 5.3).
      if ((e.ctrlKey || e.metaKey) && k === 'f') { e.preventDefault(); openFindBar(false); return; }
      if ((e.ctrlKey || e.metaKey) && k === 'h') { e.preventDefault(); openFindBar(true); return; }
      if (e.key === 'Escape' && isFindOpen()) { e.preventDefault(); window.notesFindClose(); return; }
    });

    // One-shot paint: while armed, the next non-collapsed selection the user
    // makes in the editor receives the captured format, then disarms (unless
    // sticky). Deferred so the selection is finalized after mouseup.
    editorEl.addEventListener('mouseup', () => {
      if (!fpArmed) return;
      setTimeout(() => {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.anchorNode && editorEl.contains(sel.anchorNode)) {
          fpApplyFormat();
          if (!fpSticky) fpDisarm();
        }
      }, 0);
    });

    // Reference matches are painted, so their clicks and hovers are hit-tested
    // here rather than handled by elements.
    editorEl.addEventListener('click', onEditorRefClick);
    editorEl.addEventListener('mousemove', onEditorRefHover);
    editorEl.addEventListener('mouseleave', () => setRefHover(false));
    // Links — citations among them — show their card; nothing navigates (W11).
    editorEl.addEventListener('click', onEditorLinkClick);
    editorEl.addEventListener('auxclick', onEditorLinkAuxClick);

    // Sanitize pasted HTML — XSS defense-in-depth
    editorEl.addEventListener('paste', (e) => {
      // Pasted image with no text → offer offline OCR (Phase 5.1). Plain-text /
      // HTML paste behavior below is untouched.
      const cd = e.clipboardData;
      const hasText = cd && (cd.getData('text/plain') || cd.getData('text/html'));
      if (cd && !hasText) {
        const imgItem = Array.from(cd.items || []).find(it => it.type && it.type.indexOf('image/') === 0);
        if (imgItem) {
          e.preventDefault();
          const file = imgItem.getAsFile();
          if (file && confirm('چاپلانغان رەسىمنى تېكىستكە ئايلاندۇرامسىز؟ (تورسىز OCR)')) {
            ocrImageFileToEditor(file);
          }
          return;
        }
      }
      // Only intercept HTML clipboard data; plain text is already safe
      const html = e.clipboardData && e.clipboardData.getData('text/html');
      if (!html) return; // let the browser paste plain text normally

      e.preventDefault();
      const safeHtml = (window.SafeHTML && window.SafeHTML.sanitize)
        ? window.SafeHTML.sanitize(html)
        : '';

      if (safeHtml) {
        document.execCommand('insertHTML', false, safeHtml);
      } else {
        // Fall back to plain text
        const text = e.clipboardData.getData('text/plain') || '';
        document.execCommand('insertText', false, text);
      }
      markDirty();
    });

    // Focus at end of content
    placeCaretAtEnd(editorEl);
  }

  // Everything that follows an edit: the save, the references, the spelling,
  // the counts. A batch of editing commands - the format painter is one -
  // suspends it and runs it ONCE at the end, instead of once per command.
  let inputSuspended = false;

  function onEditorInput() {
    markDirty();
    if (typeof window.notesScanReferences === 'function') {
      window.notesScanReferences();
    }
    if (_s().spellCheckEnabled && typeof window.notesRunSpellCheck === 'function') {
      clearTimeout(_s()._spellTimer);
      _s()._spellTimer = setTimeout(() => window.notesRunSpellCheck(), 800);
    }
    scheduleWordCount();
    scheduleOutline();
  }

  /** Run a batch of editing commands as one edit. */
  function asOneEdit(run) {
    inputSuspended = true;
    try { run(); }
    finally {
      inputSuspended = false;
      onEditorInput();
    }
  }

  function placeCaretAtEnd(el) {
    try {
      el.focus();
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e) {}
  }

  window.notesExec = function(cmd, arg) {
    if (!editorEl) return;
    editorEl.focus();
    document.execCommand(cmd, false, arg);
    markDirty();
  };

  window.notesSetFont = function(font) {
    if (!editorEl || !font) return;
    editorEl.focus();
    document.execCommand('fontName', false, font);
    markDirty();
  };

  window.notesSetSize = function(size) {
    if (!editorEl || !size) return;
    editorEl.focus();
    document.execCommand('fontSize', false, size);
    markDirty();
  };

  // ========== FORMATTING CONTROLS (Task 4) ==========
  // Clicking a toolbar color picker / select moves focus off the editor, which
  // can collapse its selection. Save the range on the control's mousedown and
  // restore it before applying.
  let _savedSelRange = null;
  window.notesSaveSel = function notesSaveSel() {
    const sel = window.getSelection();
    if (sel && sel.rangeCount && editorEl && editorEl.contains(sel.anchorNode)) {
      _savedSelRange = sel.getRangeAt(0).cloneRange();
    }
  };
  function restoreSel() {
    if (!editorEl) return false;
    editorEl.focus();
    if (!_savedSelRange) return false;
    try {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(_savedSelRange);
      return true;
    } catch (_) { return false; }
  }

  // Text color — styleWithCSS so foreColor emits inline CSS (it sticks).
  window.notesSetColor = function notesSetColor(val) {
    if (!editorEl || !val) return;
    restoreSel();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editorEl.contains(sel.anchorNode)) return; // need a selection
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, val);
    document.execCommand('styleWithCSS', false, false);
    markDirty();
  };

  // Highlight / background color — styleWithCSS then hiliteColor.
  window.notesSetHilite = function notesSetHilite(val) {
    if (!editorEl || !val) return;
    restoreSel();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editorEl.contains(sel.anchorNode)) return; // need a selection
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, val);
    document.execCommand('styleWithCSS', false, false);
    markDirty();
  };

  // First-line indent in cm (Word-style) on every target paragraph; 0/empty clears it.
  // Works with just a caret in the paragraph (no text selection required).
  window.notesSetIndent = function notesSetIndent(cm) {
    if (!editorEl) return;
    restoreSel();
    const blocks = selectedBlocks();
    if (!blocks.length) return;
    const v = parseFloat(cm);
    const val = (Number.isFinite(v) && v > 0) ? (v + 'cm') : '';
    for (const b of blocks) b.style.textIndent = val;
    markDirty();
  };

  // Line spacing (1.0 / 1.15 / 1.5 / 2.0) on every target paragraph.
  window.notesSetLineHeight = function notesSetLineHeight(val) {
    if (!editorEl || !val) return;
    restoreSel();
    const blocks = selectedBlocks();
    if (!blocks.length) return;
    for (const b of blocks) b.style.lineHeight = String(val);
    markDirty();
  };

  // «ساقلاش» / Ctrl+S: write now, which also retries a failed save at once
  // instead of waiting for the next step of the ladder.
  window.notesSaveNow = function() { return saveNow(); };

  // ========== FORMAT PAINTER (Phase 3) — Word's «سۈپۈرگە» ==========
  // Capture the formatting at the caret/selection, then paint it onto the next
  // selection. One-shot by default; double-click the toolbar button for sticky
  // mode. State is module-local and resets on doc switch / leaving notes.

  let fpArmed = false;     // paint mode active
  let fpSticky = false;    // keep painting until Esc / button click
  let fpFormat = null;     // captured format descriptor
  let fpPressTimer = null; // single- vs double-click discrimination

  // The toolbar's size levels, in the pixel sizes the engine gives them
  // (measured in Electron 28 — tests/notebook/suite-engine.js). A source size
  // in pixels is painted as the nearest level, because <font size> is what the
  // size control writes and two ways of saying a size would fight each other.
  const SIZE_LEVEL_PX = [10, 13, 16, 18, 24, 32, 48];
  const BLOCK_TAG = /^(P|DIV|H[1-6]|LI|BLOCKQUOTE|PRE|TD|TH)$/;

  function fpIsTransparent(c) {
    const s = String(c || '').replace(/\s/g, '');
    return !s || s === 'transparent' || /rgba\(\d+,\d+,\d+,0(\.0+)?\)/.test(s);
  }

  function fpIsBoldWeight(weight) {
    if (!weight) return false;
    if (weight === 'bold' || weight === 'bolder') return true;
    const n = parseInt(weight, 10);
    return Number.isFinite(n) && n >= 600;
  }

  /** The first family of a font-family list, without its quotes. */
  function fpFirstFamily(list) {
    return String(list || '').split(',')[0].replace(/^["\']|["\']$/g, '').trim();
  }

  function fpLevelForPx(px) {
    if (!Number.isFinite(px) || px <= 0) return 0;
    let best = 0;
    let bestGap = Infinity;
    for (let i = 0; i < SIZE_LEVEL_PX.length; i++) {
      const gap = Math.abs(SIZE_LEVEL_PX[i] - px);
      if (gap < bestGap) { bestGap = gap; best = i + 1; }
    }
    return best;
  }

  /**
   * The format at the caret — the formatting that is actually SET there.
   *
   * It used to be read from the computed style, which cannot tell formatting
   * from inheritance: the theme's own ink was captured as a text colour, so
   * text painted in the dark theme came out near-invisible on the light
   * theme's paper (audit §2). This walks from the source text node up to the
   * editor root instead - never into it - and takes the first element that
   * actually sets each property. Nothing set by the editor, the theme or the
   * stylesheet is picked up at all.
   */
  function fpCaptureFormat() {
    if (!editorEl) return null;
    const sel = window.getSelection();
    const node = (sel && sel.rangeCount) ? sel.getRangeAt(0).startContainer : null;
    let el = (node && node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
    if (!el || !editorEl.contains(el)) return null;

    const f = {
      bold: false, italic: false, underline: false, strike: false,
      fontFamily: '', sizeLevel: 0, color: '', background: '',
      align: '', lineHeight: '', textIndent: ''
    };

    for (let p = el; p && p !== editorEl; p = p.parentElement) {
      const tag = p.tagName || '';
      const st = p.style || {};
      const deco = st.textDecorationLine || st.textDecoration || '';

      // A heading is bold, which is why painting one makes the target bold.
      if (!f.bold && (tag === 'B' || tag === 'STRONG' || /^H[1-6]$/.test(tag) ||
                      fpIsBoldWeight(st.fontWeight))) f.bold = true;
      if (!f.italic && (tag === 'I' || tag === 'EM' ||
                        st.fontStyle === 'italic' || st.fontStyle === 'oblique')) f.italic = true;
      if (!f.underline && (tag === 'U' || /underline/.test(deco))) f.underline = true;
      if (!f.strike && (tag === 'S' || tag === 'STRIKE' || tag === 'DEL' ||
                        /line-through/.test(deco))) f.strike = true;

      if (!f.fontFamily) {
        const family = (tag === 'FONT' && p.getAttribute('face')) || st.fontFamily || '';
        if (family) f.fontFamily = fpFirstFamily(family);
      }
      if (!f.sizeLevel) {
        const level = (tag === 'FONT') ? parseInt(p.getAttribute('size'), 10) : NaN;
        if (Number.isFinite(level) && level >= 1 && level <= 7) f.sizeLevel = level;
        else if (st.fontSize) f.sizeLevel = fpLevelForPx(parseFloat(window.getComputedStyle(p).fontSize));
      }
      if (!f.color) {
        const color = (tag === 'FONT' && p.getAttribute('color')) || st.color || '';
        if (color) f.color = color;
      }
      if (!f.background) {
        const bg = st.backgroundColor || '';
        if (bg && !fpIsTransparent(bg)) f.background = bg;
      }

      // Paragraph metrics belong to the source's own block, and only when they
      // are set on it. Margins are no longer copied at all: they were the
      // visible half of «the painter moves my paragraphs around».
      if (BLOCK_TAG.test(tag)) {
        if (!f.align && st.textAlign) f.align = st.textAlign;
        if (!f.lineHeight && st.lineHeight) f.lineHeight = st.lineHeight;
        if (!f.textIndent && st.textIndent) f.textIndent = st.textIndent;
      }
    }
    return f;
  }

  // Collect every block element that intersects the current selection. Used by
  // the paragraph controls (Task 4).
  // Falls back to the caret's containing block when nothing intersects.
  function selectedBlocks() {
    if (!editorEl) return [];
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return [];
    const range = sel.getRangeAt(0);
    const SEL = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote';
    const blocks = Array.from(editorEl.querySelectorAll(SEL)).filter(b => {
      try { return range.intersectsNode(b); } catch (_) { return false; }
    });
    if (blocks.length) return blocks;
    let node = range.startContainer;
    let el = (node && node.nodeType === Node.TEXT_NODE) ? node.parentElement : node;
    while (el && el !== editorEl && !/^(P|DIV|H[1-6]|LI|BLOCKQUOTE)$/.test(el.tagName || '')) {
      el = el.parentElement;
    }
    return (el && el !== editorEl) ? [el] : [];
  }

  /** The blocks a range covers ENTIRELY — the only ones that get its metrics. */
  function blocksFullyInside(range) {
    if (!editorEl) return [];
    const SEL = 'p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,td,th';
    return Array.from(editorEl.querySelectorAll(SEL)).filter(b => {
      try {
        if (!range.intersectsNode(b)) return false;
        const whole = document.createRange();
        whole.selectNodeContents(b);
        return range.compareBoundaryPoints(Range.START_TO_START, whole) <= 0 &&
               range.compareBoundaryPoints(Range.END_TO_END, whole) >= 0;
      } catch (_) { return false; }
    });
  }

  /**
   * The parts of a range that are the writer's own text: the range minus every
   * stretch of quoted material in it (QUOTED_SELECTOR — verses, citation links,
   * inserted passages). Painting a verse would restyle the Qur'an, and a
   * citation is somebody else's words in somebody else's format.
   */
  function fpWritablePieces(target) {
    const TM = window.TextMap;
    if (!TM || !editorEl) return [];
    const map = TM.readTextMap(editorEl);
    const start = TM.offsetAtPoint(map, target.startContainer, target.startOffset);
    const end = TM.offsetAtPoint(map, target.endContainer, target.endOffset);
    if (!(end > start)) return [];

    const runs = [];
    let cursor = start;
    for (const span of TM.quotedSpans(map, editorEl)) {
      if (span[1] <= cursor) continue;
      if (span[0] >= end) break;
      if (span[0] > cursor) runs.push([cursor, span[0]]);
      cursor = Math.max(cursor, span[1]);
    }
    if (cursor < end) runs.push([cursor, end]);

    return runs
      .map(run => TM.rangeFor(map, run[0], run[1]))
      .filter(range => range && range.toString().trim());
  }

  /** How many paragraphs (leaf blocks) a range has text in. */
  function fpBlocksTouched(range) {
    const TM = window.TextMap;
    if (!TM || !editorEl) return 0;
    const blocks = new Set();
    for (const node of TM.readTextMap(editorEl).nodes) {
      try { if (range.intersectsNode(node)) blocks.add(TM.blockOf(node)); } catch (_) {}
    }
    return blocks.size;
  }

  /** Run a toggle only when the range does not already have it. */
  function fpToggle(command, wanted) {
    if (!wanted) return;        // removeFormat has already cleared it
    let state = false;
    try { state = document.queryCommandState(command); } catch (_) {}
    // A heading is bold through its own tag; queryCommandState says so, and
    // skipping the toggle is what keeps the command from UN-bolding it.
    if (!state) document.execCommand(command);
  }

  /** Give one range the captured character format, with editing commands only. */
  function fpPaintRange(range, f) {
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    // Word's override semantics: the painted text takes the source's format,
    // so whatever it had goes first. Measured in Electron 28: removeFormat
    // keeps blocks, <br>, links, classes and data attributes.
    document.execCommand('removeFormat');

    if (f.fontFamily) document.execCommand('fontName', false, f.fontFamily);
    if (f.sizeLevel) document.execCommand('fontSize', false, String(f.sizeLevel));
    fpToggle('bold', f.bold);
    fpToggle('italic', f.italic);
    fpToggle('underline', f.underline);
    fpToggle('strikeThrough', f.strike);
    if (f.color) {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('foreColor', false, f.color);
      document.execCommand('styleWithCSS', false, false);
    }
    if (f.background && !fpIsTransparent(f.background)) {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand('hiliteColor', false, f.background);
      document.execCommand('styleWithCSS', false, false);
    }
  }

  /** Alignment, line height and first-line indent, per whole block. */
  function fpPaintBlocks(blocks, f) {
    if (!blocks.length) return;
    const command = !f.align ? ''
      : (f.align === 'center' ? 'justifyCenter'
      : (f.align === 'justify' ? 'justifyFull'
      : ((f.align === 'left' || f.align === 'end') ? 'justifyLeft' : 'justifyRight')));
    const sel = window.getSelection();
    for (const b of blocks) {
      if (command) {
        // Through the command, so Ctrl+Z takes it back. Per block, because the
        // selection has moved on by now.
        try {
          const range = document.createRange();
          range.selectNodeContents(b);
          sel.removeAllRanges();
          sel.addRange(range);
          document.execCommand(command);
        } catch (_) {}
      }
      // There is no command for these two, so they are set directly and are
      // not part of the browser's undo history (recorded in CLAUDE.md).
      if (f.lineHeight && f.lineHeight !== 'normal') b.style.lineHeight = f.lineHeight;
      if (f.textIndent) b.style.textIndent = f.textIndent;
    }
  }

  /**
   * Paint the captured format onto the current selection.
   *
   * The owner's bug 1. This used to take the selection as plain text
   * (sel.toString()) and write it back inside ONE span: three painted
   * paragraphs became one, every line break turned into a space, and the bold,
   * the links and the inline formatting inside them were gone. Four paragraphs
   * came back as two, and Ctrl+Z restored the paragraphs but not the line
   * spacing the painter had set.
   *
   * Now nothing is rebuilt: the selection is split into the parts that are the
   * writer's own text, and each part is given the format with editing commands
   * over its own Range. The structure is never addressed at all, so it cannot
   * be damaged.
   */
  function fpApplyFormat() {
    if (!editorEl || !fpFormat) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.anchorNode || !editorEl.contains(sel.anchorNode)) return;

    const target = sel.getRangeAt(0).cloneRange();
    const blocks = blocksFullyInside(target);
    const pieces = fpWritablePieces(target);
    if (!pieces.length) {
      toast('ئايەت ۋە نەقىلگە سۈپۈرگە ئىشلىمەيدۇ', 'i');
      return;
    }
    // Over more than one paragraph, a paint is a change worth taking back:
    // the note is kept first (W1). Inside one paragraph, Ctrl+Z is enough.
    if (fpBlocksTouched(target) > 1) keepVersion('before-paint');

    const f = fpFormat;
    editorEl.focus();
    // One edit: the autosave, the counts, the spelling and the reference scan
    // run once at the end rather than after every command.
    asOneEdit(() => {
      for (const piece of pieces) fpPaintRange(piece, f);
      fpPaintBlocks(blocks, f);
    });
  }
  function fpArm(sticky) {
    if (!editorEl || !fpFormat) return;
    fpArmed = true;
    fpSticky = !!sticky;
    editorEl.classList.add('fp-armed');
    const btn = document.getElementById('notes-fp-btn');
    if (btn) btn.classList.add('active');
    if (typeof window.toast === 'function') {
      window.toast(sticky ? 'سۈپۈرگە: ئۈزلۈكسىز (Esc توختىتىدۇ)' : 'سۈپۈرگە: بىر قېتىملىق', 'i');
    }
  }

  function fpDisarm() {
    fpArmed = false;
    fpSticky = false;
    if (editorEl) editorEl.classList.remove('fp-armed');
    const btn = document.getElementById('notes-fp-btn');
    if (btn) btn.classList.remove('active');
  }

  // Toolbar button press (mousedown, default-prevented so the editor keeps its
  // selection). One press = one-shot (or toggle off if already armed); two
  // quick presses = sticky.
  window.notesFpPress = function notesFpPress(ev) {
    if (ev) ev.preventDefault();
    if (!editorEl) return;
    if (fpPressTimer) {                       // second press → sticky
      clearTimeout(fpPressTimer); fpPressTimer = null;
      fpFormat = fpCaptureFormat();
      fpArm(true);
      return;
    }
    const captured = fpCaptureFormat();
    fpPressTimer = setTimeout(() => {
      fpPressTimer = null;
      if (fpArmed) { fpDisarm(); return; }    // armed → clicking again disarms
      fpFormat = captured;
      fpArm(false);
    }, 220);
  };

  // Exposed so setMode() can disarm when leaving notes mode.
  window.notesDisarmFormatPainter = fpDisarm;

  function markDirty() {
    // A note in the trash is read-only; nothing of it is ever written.
    if (!_s().curDoc || _s().curDoc.deleted_at) return;
    _s().dirty = true;
    saveVersion++;
    setStatus('saving', 'ساقلىنىۋاتىدۇ...');
    reportDirty(true);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { saveTimer = null; saveNow(); }, 3000);
  }

  /** Tell the main process, so closing the window can wait for us. */
  function reportDirty(dirty) {
    try {
      if (window.electron && typeof window.electron.notesDirty === 'function') {
        window.electron.notesDirty(!!dirty);
      }
    } catch (e) { /* the window is going away anyway */ }
  }

  /**
   * Write the editor to the database.
   *
   * Resolves TRUE only when the database has confirmed the newest edit on
   * screen — which is what the callers below rely on before they replace the
   * editor. While a write is in flight a second call waits for it and then,
   * if anything was typed meanwhile, writes again.
   */
  function saveNow() {
    if (inFlight) {
      return inFlight.then(() => (_s().dirty ? saveNow() : true), () => false);
    }
    if (!_s().curDoc || !editorEl) return Promise.resolve(true);
    if (!_s().dirty) return Promise.resolve(true);
    inFlight = writeOnce();
    return inFlight;
  }

  async function writeOnce() {
    const doc = _s().curDoc;
    const docId = doc.id;
    const versionAtStart = saveVersion;
    clearTimeout(saveTimer); saveTimer = null;
    clearTimeout(retryTimer); retryTimer = null;   // this IS the retry

    // Snapshot and sanitize BEFORE the await, so what goes to the database is
    // the text that was on screen when the save started...
    const rawHtml = snapshotHtml();
    const html = (window.SafeHTML && window.SafeHTML.sanitize)
      ? window.SafeHTML.sanitize(rawHtml)
      : rawHtml;
    const text = editorEl.innerText || '';

    // ...and the same snapshot goes into curDoc at once. Re-mounting the editor
    // reads curDoc, so leaving the notebook and coming back during the write
    // shows the newest text rather than the text of the last confirmed save.
    doc.content_html = html;
    doc.content_text = text;

    let result = null;
    try {
      result = await window.electron.notesUpdate(docId, doc.title, html, text);
    } catch (e) {
      console.error('[notes] save failed:', e);
      result = { success: false, error: (e && e.message) || 'IPC failed' };
    } finally {
      inFlight = null;
    }

    const ok = !!(result && result.success);

    // The writer moved to another note, or closed this one, while the write was
    // running: the answer still matters to whoever is waiting for it, but there
    // is no status line of this note's to update any more.
    if (!_s().curDoc || _s().curDoc.id !== docId) return ok;

    if (ok) {
      lastSaveError = '';
      retryStep = 0;
      // Only after the database confirmed it — and the main process keeps it
      // at most every five minutes (W1).
      sendVersion(docId, 'auto', doc.title, html, text);
      if (saveVersion === versionAtStart) {
        _s().dirty = false;
        reportDirty(false);
        setStatus('saved', 'ساقلاندى');
        return true;
      }
      // Typed while the write was running: still dirty, so write again rather
      // than wait three seconds and call it saved in the meantime.
      setStatus('saving', 'ساقلىنىۋاتىدۇ...');
      return saveNow();
    }

    lastSaveError = (result && result.error) || '';
    setStatus('error', 'ساقلاش خاتالىقى' + (lastSaveError ? ' — ' + lastSaveError : ''));
    scheduleRetry();
    return false;
  }

  /** 5 s, 15 s, 45 s, then every minute while the note is dirty. */
  function scheduleRetry() {
    clearTimeout(retryTimer);
    const delay = (retryStep < RETRY_DELAYS.length) ? RETRY_DELAYS[retryStep] : RETRY_EVERY;
    retryStep++;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      if (_s().dirty && _s().curDoc) saveNow();
    }, delay);
  }

  function stopRetrying() {
    clearTimeout(retryTimer);
    retryTimer = null;
    retryStep = 0;
  }

  /**
   * Everything written is in the database — or it is not, and the caller must
   * not go ahead. Cancels the debounce, waits for a write in flight, writes if
   * anything is dirty, and resolves what the database said.
   *
   * setMode() calls this before it replaces #main: a note typed into and left
   * within the three-second debounce used to be lost from the screen and from
   * the database both (K3a).
   */
  window.notesFlush = async function notesFlush() {
    if (!_s().curDoc || !editorEl) return true;
    clearTimeout(saveTimer); saveTimer = null;
    clearTimeout(retryTimer); retryTimer = null;
    const ok = await saveNow();
    return ok;
  };

  /**
   * Flush before leaving the note, and say so when it did not work.
   *
   * Returning false means: stay where you are. Opening another note while the
   * save had failed used to drop what was written silently, with «ساقلاندى»
   * still on the screen (K3b).
   */
  async function flushOrWarn() {
    const ok = await window.notesFlush();
    if (!ok) {
      setStatus('error', 'ساقلاش خاتالىقى' + (lastSaveError ? ' — ' + lastSaveError : ''));
      toast('خاتىرە ساقلانمىدى — قايتا سىناڭ', 'e');
    }
    return ok;
  }

  function setStatus(cls, text) {
    const el = document.getElementById('notes-status');
    if (!el) return;
    el.className = 'notes-status ' + cls;
    el.textContent = text;
  }

  // ========== QURAN QUICK-INSERT ==========

  window.notesQuranPreview = async function() {
    const suraEl = document.getElementById('notes-q-sura');
    const ayaEl = document.getElementById('notes-q-aya');
    const sura = parseInt(suraEl ? suraEl.value : '', 10);
    const aya = parseInt(ayaEl ? ayaEl.value : '', 10);
    const mode = ayaMode(_s().ayaMode);

    if (!sura || sura < 1 || sura > 114 || !aya || aya < 1) {
      toast('توغرا سۈرە/ئايەت نومۇرى كىرگۈزۈڭ', 'e');
      return;
    }
    _s().quickSura = sura;
    _s().quickAya = aya;

    const r = await window.electron.quranGetAya(sura, aya);
    const preview = document.getElementById('notes-q-preview');
    if (!preview) return;

    if (!r.success || !r.aya) {
      preview.innerHTML = `<div style="padding:10px;color:#A32D2D;font-size:12px">بۇ ئايەت تېپىلمىدى</div>`;
      return;
    }
    const a = r.aya;
    // What is shown is what «قىستۇرۇش» inserts (notesInsertAya).
    const showAr = mode !== 'ug' || !a.text_ug;
    const showUg = mode !== 'ar' && a.text_ug;
    preview.innerHTML = `
      <div class="notes-quran-preview">
        ${showAr ? `<div class="notes-quran-preview-ar">${escHtml(a.text_ar)}</div>` : ''}
        ${showUg ? `<div class="notes-quran-preview-ug">${escHtml(a.text_ug)}</div>` : ''}
        <div class="notes-quran-preview-actions">
          <button data-action="insert" onclick="window.notesInsertAya(${sura}, ${aya}, '${mode}')">${icon('plus')} قىستۇرۇش</button>
          <button data-action="copy" onclick="window.notesCopyAya(${sura}, ${aya}, '${mode}')">${icon('copy')} كۆچۈرۈش</button>
        </div>
      </div>`;
  };

  /**
   * How a verse goes into a note: «ئەرەبچە» 'ar', «تەرجىمىسى» 'ug' or
   * «ئىككىلىسى» 'both'. The old checkbox passed true / false, which still
   * means what it meant.
   */
  const AYA_MODES = ['ar', 'ug', 'both'];
  const AYA_MODE_LABELS = { ar: 'ئەرەبچە', ug: 'تەرجىمىسى', both: 'ئىككىلىسى' };
  function ayaMode(mode) {
    if (mode === true) return 'both';
    if (mode === false) return 'ar';
    return AYA_MODES.indexOf(mode) !== -1 ? mode : 'both';
  }

  window.notesInsertAya = async function(sura, aya, mode) {
    if (!editorEl) {
      toast('تەھرىرلىگۈچ ئېچىلمىغان', 'e');
      return;
    }
    const r = await window.electron.quranGetAya(sura, aya);
    if (!r.success || !r.aya) return;
    const a = r.aya;
    mode = ayaMode(mode);

    const AR_STYLE = "font-family:'UthmanicHafs',serif;font-size:18pt;line-height:1.9";
    const UG_STYLE = "font-family:'UKIJ Ekran',sans-serif;font-size:13pt;line-height:1.7;color:#555";

    // The translation is marked as quoted, like the verse (the Uthmani face)
    // and the citation (a link): none of it is the writer's to spell-check,
    // paint or send to the AI. The marker sits on the span, not on the
    // paragraph — Enter at the end of a paragraph copies its attributes into
    // the next one, and the writer's own next line would be «quoted» too.
    const lines = [];
    if (mode !== 'ug' || !a.text_ug) {
      lines.push(`<span style="${AR_STYLE}">\uFD3F${escHtml(a.text_ar)}\uFD3E</span>`);
    }
    if (mode !== 'ar' && a.text_ug) {
      lines.push(`<span data-ref-insert="1" style="${UG_STYLE}">\u00AB${escHtml(a.text_ug)}\u00BB</span>`);
    }
    lines.push(citeLinkHtml(quranHref(sura, aya), 'قۇرئان كەرىم، ' + Number(sura) + ':' + Number(aya)));
    const insertHtml = `<p dir="rtl">` + lines.join('<br>') + `</p><p><br></p>`;

    editorEl.focus();
    const safeInsert = (window.SafeHTML && window.SafeHTML.sanitize)
      ? window.SafeHTML.sanitize(insertHtml)
      : insertHtml;
    document.execCommand('insertHTML', false, safeInsert);
    markDirty();
    toast('ئايەت قىستۇرۇلدى', 's');
  };

  window.notesCopyAya = async function(sura, aya, mode) {
    mode = ayaMode(mode);
    const r = await window.electron.quranGetAya(sura, aya);
    if (!r.success || !r.aya) return;
    let ok = false;
    if (mode === 'ug' && r.aya.text_ug) {
      // The translation alone, with the verse it translates.
      try {
        await navigator.clipboard.writeText('«' + r.aya.text_ug + '» (' + Number(sura) + ':' + Number(aya) + ')');
        ok = true;
      } catch(e) { ok = false; }
    } else {
      if (!window.QuranCopy || typeof window.QuranCopy.copyAyaToClipboard !== 'function') {
        toast('كۆچۈرۈش مودۇلى تېپىلمىدى', 'e');
        return;
      }
      ok = await window.QuranCopy.copyAyaToClipboard([r.aya], mode === 'both');
    }
    toast(ok ? 'كۆچۈرۈلدى' : 'كۆچۈرۈش مۇۋەپپەقىيەتسىز', ok ? 's' : 'e');
  };

  // ========== HELPERS ==========

  function escHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, c => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
  }
  function escAttr(s) { return escHtml(s); }

  // ========== REFERENCE SCANNING (Prompt 6) ==========

  let scanTimer = null;
  let lastScannedText = '';

  function scheduleScan() {
    if (!_s().refScanEnabled) return;
    clearTimeout(scanTimer);
    scanTimer = setTimeout(runScan, 400);
  }

  window.notesToggleRefScan = async function(checked) {
    _s().refScanEnabled = !!checked;
    try { await window.electron.dbSetSetting('notes_ref_scan', checked ? 'on' : 'off'); } catch(e) {}
    if (!checked) {
      _s().matches = new Map();
      clearRefMatches();
      if (_s().rightTab === 'refs') renderRefsPanel();
    } else {
      lastScannedText = '';
      scheduleScan();
    }
  };

  window.notesToggleSpellCheck = async function(checked) {
    _s().spellCheckEnabled = !!checked;
    try { await window.electron.dbSetSetting('notes_spell_check', checked ? 'on' : 'off'); } catch(e) {}
    if (checked && typeof window.notesRunSpellCheck === 'function') {
      // The engine loads its binary dictionary in about 30 ms, so this toast
      // is normally gone before it is read. It stays for the one case that is
      // still slow: a cold disk cache on a spinning drive.
      const sc = window.SpellCheck;
      const ready = sc && typeof sc.isReady === 'function' && sc.isReady();
      if (!ready) toast('ئىملا لۇغىتى يۈكلىنىۋاتىدۇ...', 'i');
      window.notesRunSpellCheck();
    } else if (!checked && typeof window.notesClearSpellCheck === 'function') {
      window.notesClearSpellCheck();
    }
  };

  // The hook that notes.js editor input listener calls
  window.notesScanReferences = scheduleScan;

  // The text the scanner reads: the whole note through the shared text map,
  // with quoted material — inserted passages, verses, citation links — blanked
  // out. Those words came FROM the library, so matching them against it again
  // would only find the source they were copied from. QUOTED_SELECTOR includes
  // the .notes-inserted-ref class because notes saved before v3.5 lost
  // data-ref-insert to the sanitizer (K6) and kept only the class.
  function getScannableText() {
    const TM = window.TextMap;
    if (!editorEl || !TM) return '';
    const map = TM.readTextMap(editorEl);
    return TM.maskSpans(map.text, TM.quotedSpans(map, editorEl));
  }

  async function runScan() {
    if (!editorEl || !window.NGram) return;
    const text = getScannableText();
    if (text === lastScannedText) return;
    lastScannedText = text;

    if (!text.trim() || text.length < 10) {
      _s().matches = new Map();
      clearRefMatches();
      if (_s().rightTab === 'refs') renderRefsPanel();
      return;
    }

    const candidates = window.NGram.extractCandidates(text);
    if (!candidates.length) {
      _s().matches = new Map();
      clearRefMatches();
      if (_s().rightTab === 'refs') renderRefsPanel();
      return;
    }

    try {
      const matches = await window.NGram.findReferences(candidates, {
        perWordSnippets: 3,
        maxBooks: 10
      });
      // If the user edited during the async scan, our results may be stale.
      // Check again before applying.
      if (getScannableText() !== lastScannedText) return;
      _s().matches = matches;
      paintRefMatches();
      if (_s().rightTab === 'refs') renderRefsPanel();
    } catch(e) {
      console.error('[notes] reference scan failed:', e);
    }
  }

  /** Painted by the ::highlight() rule in notes.css. */
  const REF_HIGHLIGHT = 'bh-ref-match';

  // [{ word, range }]. The Ranges are live, so they follow the text while the
  // writer types; the next scan, 400 ms after typing stops, paints afresh.
  let refMarks = [];

  /**
   * Show where the scanner's words occur — on the highlight layer.
   *
   * This used to wrap every occurrence in a <span class="ref-match">,
   * replacing the very text nodes the writer's caret sat in. The caret jumped
   * to the start of the paragraph, the next word typed landed there, and the
   * spans were saved with the note (K2). Painting Ranges touches nothing, so
   * there is no caret to move and nothing to save.
   *
   * A match is still found inside one text node at a time, earliest first and
   * the longer one on a tie, with overlaps dropped — as before.
   */
  function paintRefMatches() {
    const TM = window.TextMap;
    refMarks = [];
    if (!editorEl || !TM) return;
    const words = _s().matches ? Array.from(_s().matches.keys()) : [];
    if (!words.length) { clearRefMatches(); return; }

    const map = TM.readTextMap(editorEl);
    const quoted = TM.quotedSpans(map, editorEl);
    // Room for at least a bigram (≈ MIN_WORD_LEN * 2 + 1 characters).
    const minLength = ((window.NGram && window.NGram.MIN_WORD_LEN) || 2) * 2 + 1;

    for (let i = 0; i < map.nodes.length; i++) {
      const data = map.nodes[i].data;
      if (data.length < minLength) continue;

      const found = [];
      for (const w of words) {
        let at = 0;
        while ((at = data.indexOf(w, at)) !== -1) {
          found.push({ start: at, end: at + w.length, word: w });
          at += w.length;
        }
      }
      if (!found.length) continue;
      found.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

      const base = map.starts[i];
      let lastEnd = 0;
      for (const m of found) {
        if (m.start < lastEnd) continue;
        lastEnd = m.end;
        if (TM.overlapsAny(quoted, base + m.start, base + m.end)) continue;
        const range = document.createRange();
        range.setStart(map.nodes[i], m.start);
        range.setEnd(map.nodes[i], m.end);
        refMarks.push({ word: m.word, range: range });
      }
    }
    TM.setHighlight(REF_HIGHLIGHT, refMarks.map(m => m.range));
  }

  function clearRefMatches() {
    refMarks = [];
    if (window.TextMap) window.TextMap.clearHighlight(REF_HIGHLIGHT);
    setRefHover(false);
  }

  /**
   * The matched word under a screen point, if it is still there.
   *
   * There is no element to click any more, so the point is hit-tested back
   * into the text (textmap.js, pointAt) — as the spellchecker does. A match
   * the writer has since edited into something else is not a match.
   */
  function refMarkAt(x, y) {
    if (!refMarks.length || !window.TextMap) return null;
    const point = window.TextMap.pointAt(x, y);
    if (!point || !editorEl || !editorEl.contains(point.node)) return null;
    for (const mark of refMarks) {
      const range = mark.range;
      if (range.collapsed || range.toString() !== mark.word) continue;
      try {
        if (range.isPointInRange(point.node, point.offset)) return mark;
      } catch (e) { /* a point in another tree */ }
    }
    return null;
  }

  // A click places the caret as usual AND opens the word's sources — what
  // clicking the old span did.
  function onEditorRefClick(e) {
    const mark = refMarkAt(e.clientX, e.clientY);
    if (mark) window.notesShowRefFor(mark.word);
  }

  // The old span carried a help cursor and a tooltip. Without an element they
  // move to the editor while the pointer is over a match — at most once a
  // frame.
  let refHoverFrame = 0;
  function onEditorRefHover(e) {
    if (!refMarks.length) { setRefHover(false); return; }
    if (refHoverFrame) return;
    const x = e.clientX;
    const y = e.clientY;
    refHoverFrame = requestAnimationFrame(() => {
      refHoverFrame = 0;
      setRefHover(!!refMarkAt(x, y));
    });
  }

  function setRefHover(on) {
    if (!editorEl) return;
    editorEl.classList.toggle('ref-hover', !!on);
    if (on) editorEl.title = 'كىتابلاردىن تېپىلدى — چېكىپ مەنبىلەرنى كۆرۈڭ';
    else if (editorEl.hasAttribute('title')) editorEl.removeAttribute('title');
  }

  // ========== REFS PANEL RENDERING ==========

  function renderRefsPanel() {
    const container = document.getElementById('notes-refs-content');
    if (!container) return;

    const matches = _s().matches || new Map();
    const filter = _s().refsFilter || null;

    if (!matches.size) {
      container.innerHTML = `<div class="notes-ref-empty">
        ھازىرچە مەنبە يوق<br><br>
        تەھرىرلىگۈچكە يازسىڭىز<br>ئاپتوماتىك چىقىدۇ
      </div>`;
      return;
    }

    const entries = (filter && matches.has(filter))
      ? [[filter, matches.get(filter)]]
      : Array.from(matches.entries());

    const header = filter
      ? `<div style="padding:6px 10px;background:var(--bg);border-radius:var(--radius2);margin-bottom:10px;font-size:11px;color:var(--text3);font-family:sans-serif;display:flex;justify-content:space-between;align-items:center;gap:8px">
           <span>فىلتر: <b style="color:var(--am)">${escHtml(filter)}</b></span>
           <button onclick="window.notesClearRefFilter()" style="background:none;border:0.5px solid var(--border2);color:var(--text2);border-radius:var(--radius2);padding:2px 10px;font-family:var(--jf);cursor:pointer;font-size:11px;white-space:nowrap">ھەممىسىنى كۆرۈش</button>
         </div>`
      : `<div style="padding:4px 2px;margin-bottom:8px;font-size:11px;color:var(--text3);font-family:sans-serif">${entries.length} سۆز ئۈچۈن مەنبە تېپىلدى</div>`;

    let i = 0;
    let html = header;
    for (const [word, books] of entries) {
      for (const bm of books) {
        const isQuran = bm.isQuran || bm.bookId === -1 || bm.bookId === -2;
        let bookTitle;
        if (isQuran) {
          bookTitle = 'قۇرئان كەرىم';
        } else {
          const book = (window.S.books || []).find(b => b.id === bm.bookId);
          bookTitle = book ? book.title : `كىتاب #${bm.bookId}`;
        }
        for (const sn of bm.snippets) {
          // Snippet comes with §MARK_OPEN§ / §MARK_CLOSE§ markers from database.js
          const snipHtml = String(sn.snip || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/§MARK_OPEN§/g, '<mark>')
            .replace(/§MARK_CLOSE§/g, '</mark>');
          // Pass raw snippet (with markers) to insert; we'll strip markers there.
          // An apostrophe would end the quoted onclick argument: encArg.
          const encSnip = encArg(sn.snip || '');
          const posArg = (typeof sn.pos === 'number' && sn.pos >= 0) ? sn.pos : 'null';
          const verseArgs = (isQuran && sn.sura && sn.aya) ? `, ${sn.sura | 0}, ${sn.aya | 0}` : '';
          const itemId = `ref_${bm.bookId}_${(sn.pos|0)}_${i++}`;

          // "Go to" button: Quran → switch to Quran mode at sura:aya; Book → openReader
          let gotoBtn;
          if (isQuran && sn.sura && sn.aya) {
            gotoBtn = `<button class="notes-ref-act notes-ref-goto"
              onclick="window.notesGoToQuranAya(${sn.sura}, ${sn.aya})">${icon('book-open')}ئايەتكە بېرىش (${sn.sura}:${sn.aya})</button>`;
          } else {
            gotoBtn = `<button class="notes-ref-act notes-ref-goto"
              onclick="window.notesGoToBook(${bm.bookId}, '${encodeURIComponent(word)}')">${icon('book-open')}كىتابقا بېرىش</button>`;
          }

          // Source label includes sura:aya for Quran
          const sourceLabel = isQuran
            ? `${icon('book-open')}${escHtml(bookTitle)}${(sn.sura && sn.aya) ? ` · ${sn.sura}:${sn.aya}` : ''}${sn.lang === 'ar' ? ' (عربي)' : ''}`
            : `${icon('book-open')}${escHtml(bookTitle)}`;

          html += `<div class="notes-ref-item" id="${itemId}">
            <div class="notes-ref-word">${escHtml(word)}</div>
            <div class="notes-ref-source">${sourceLabel}</div>
            <div class="notes-ref-snippet" data-snip-id="${itemId}">${snipHtml}</div>
            <div class="notes-ref-actions">
              <button class="notes-ref-act notes-ref-expand" title="تولۇق ئابزاسنى كۆرۈش"
                onclick="window.notesToggleSnippet('${itemId}')">＋</button>
              ${gotoBtn}
              <button class="notes-ref-act notes-ref-insert"
                onclick="window.notesInsertRef(${bm.bookId}, '${encSnip}', ${posArg}, '${encArg(word)}'${verseArgs})">${icon('plus')} قىستۇرۇش</button>
            </div>
          </div>`;
        }
      }
    }
    container.innerHTML = html;
  }

  window.notesToggleSnippet = function (itemId) {
    const el = document.querySelector(`.notes-ref-snippet[data-snip-id="${itemId}"]`);
    if (!el) return;
    const expanded = el.classList.toggle('expanded');
    const btn = document.querySelector(`#${itemId} .notes-ref-expand`);
    if (btn) btn.textContent = expanded ? '－' : '＋';
  };

  // targetPos: a character offset into the book's content — the reader picks
  // the occurrence of the highlight that starts there (updateMatchNav).
  window.notesGoToBook = async function (bookId, encodedHighlight, targetPos) {
    if (!await flushOrWarn()) return;
    let highlight = '';
    try { highlight = decodeURIComponent(encodedHighlight || ''); } catch(e) {}
    if (typeof window.openReader === 'function') {
      // Switch back to library mode first so the reader UI is mounted.
      if (typeof window.setMode === 'function' && window.S.mode !== 'library') {
        window.setMode('library');
      }
      window.openReader(bookId, highlight, (typeof targetPos === 'number' && targetPos >= 0) ? targetPos : null);
    }
  };

  window.notesGoToQuranAya = async function (sura, aya) {
    if (!await flushOrWarn()) return;
    // Update Quran state so the view opens at the requested aya
    if (window.S && window.S.quran) {
      window.S.quran.curSura = sura;
      window.S.quran.curAya = aya;
      // Clear any active search so the sura view (not the search list) renders
      window.S.quran.searchResults = null;
      window.S.quran.searchQuery = '';
    }
    if (typeof window.setMode === 'function') {
      window.setMode('quran');
    }
    // If the dedicated nav helper exists, prefer it
    if (typeof window.quranGoToAya === 'function') {
      window.quranGoToAya(sura, aya);
    } else if (typeof window.renderQuranView === 'function') {
      window.renderQuranView();
    }
  };

  // Exposed for the tab-switch handler in Prompt 5
  window.notesRenderRefsPanel = renderRefsPanel;

  window.notesShowRefFor = function(word) {
    _s().refsFilter = word;
    // Switch to the refs pane (kept mounted; #notes-refs-content lives in it).
    window.notesSetTab('refs');
    renderRefsPanel();
  };

  window.notesClearRefFilter = function() {
    _s().refsFilter = null;
    renderRefsPanel();
  };

  /**
   * Insert a library passage as a quotation that ends with its citation.
   *
   * pos is the snippet's character offset into the book's content
   * (database.js, getAllSnippetsForBook) and encodedWord the word it was
   * found by, so the citation opens the reader at that very occurrence. The
   * n-gram index answers for the Qur'an too, as two «books» (-1, -2,
   * database.js QURAN_BOOK_ID_UG / _AR): then sura and aya say which verse.
   */
  window.notesInsertRef = function(bookId, encodedSnip, pos, encodedWord, sura, aya) {
    if (!editorEl) return;
    let snip = '';
    try { snip = decodeURIComponent(encodedSnip); } catch(e) {}
    // Strip internal markers (we keep plain text in the inserted blockquote)
    snip = snip.replace(/§MARK_OPEN§|§MARK_CLOSE§/g, '');
    let word = '';
    try { word = decodeURIComponent(encodedWord || ''); } catch(e) {}

    let cite = '';
    if (bookId === -1 || bookId === -2) {
      if (sura > 0 && aya > 0) cite = citeLinkHtml(quranHref(sura, aya), 'قۇرئان كەرىم، ' + Number(sura) + ':' + Number(aya));
    } else {
      const book = (window.S.books || []).find(b => b.id === bookId);
      if (book) cite = citeLinkHtml(bookHref(bookId, pos, word), book.title);
    }

    const insertHtml = `<blockquote class="notes-inserted-ref" data-ref-insert="1" dir="rtl">` +
      `<span>${escHtml(snip)}</span>` +
      (cite ? `<br>${cite}` : '') +
    `</blockquote><p><br></p>`;

    editorEl.focus();
    const safeInsert = (window.SafeHTML && window.SafeHTML.sanitize)
      ? window.SafeHTML.sanitize(insertHtml)
      : insertHtml;
    document.execCommand('insertHTML', false, safeInsert);
    markDirty();
    toast('مەنبە قىستۇرۇلدى', 's');
  };

  // ========== CITATIONS AND THE LINK CARD (W11) ==========
  // An inserted passage or verse ends with a link back to where it came from:
  // bh://book/<id>?o=<offset>&q=<word> or bh://quran/<sura>/<aya>. The scheme
  // is the app's own and goes nowhere by itself — the sanitizer keeps it only
  // on a.bh-cite (src/sanitize.js) — and nothing in the note ever navigates
  // the window: a click on any link shows a small card anchored to it, and
  // «ئېچىش» opens the reader or the Qur'an here, or hands an http(s) address
  // to the main process. Ported from the web edition's lib/notes/insert.ts,
  // lib/notes/links.ts, components/notes/link-popover.tsx and anchored.ts.

  const CITE_STYLE = 'font-size:0.85em;color:#888';
  const BOOK_CITE = /^bh:\/\/book\/([1-9]\d{0,8})(?:\?([^#\s]*))?$/;
  const QURAN_CITE = /^bh:\/\/quran\/([1-9]\d{0,2})\/([1-9]\d{0,2})$/;
  /** A blocked address is shown, not opened — but a page of it helps nobody. */
  const SHOWN_CHARS = 200;

  /** For a value inside a quoted onclick argument: encodeURIComponent leaves ' alone. */
  function encArg(s) {
    return encodeURIComponent(String(s == null ? '' : s)).replace(/'/g, '%27');
  }

  function bookHref(bookId, offset, word) {
    const params = [];
    if (Number.isInteger(offset) && offset >= 0) params.push('o=' + offset);
    const w = String(word || '').trim();
    if (w) params.push('q=' + encodeURIComponent(w));
    return 'bh://book/' + Number(bookId) + (params.length ? '?' + params.join('&') : '');
  }

  function quranHref(sura, aya) {
    return 'bh://quran/' + Number(sura) + '/' + Number(aya);
  }

  /** The «— source» line, as a citation link. */
  function citeLinkHtml(href, label) {
    return `<a class="bh-cite" href="${escAttr(href)}" style="${CITE_STYLE}">— ${escHtml(label)}</a>`;
  }

  /** The book a citation names in its own words: «— title» (or a «…» in them). */
  function citedTitle(text) {
    const plain = String(text || '').replace(/\s+/g, ' ').replace(/^\s*—\s*/, '').trim();
    const quoted = /«([^«»]+)»/.exec(plain);
    return (quoted ? quoted[1].trim() : plain) || null;
  }

  /**
   * What a link in the note points to, and whether it may be opened:
   * { kind: 'book' | 'quran' | 'external' | 'blocked', label, target }.
   * Only a citation of a book or a verse, or an http(s) address without a
   * user name in it, has a target; everything else is shown as written.
   */
  function describeLink(href, text) {
    const written = String(href || '').trim();
    const blocked = {
      kind: 'blocked',
      label: written.length > SHOWN_CHARS ? written.slice(0, SHOWN_CHARS) + '…' : written,
      target: null
    };

    let m = BOOK_CITE.exec(written);
    if (m) {
      const bookId = Number(m[1]);
      const params = new URLSearchParams(m[2] || '');
      const o = params.get('o') || '';
      const book = ((window.S && window.S.books) || []).find(b => b.id === bookId);
      const title = book ? book.title : citedTitle(text);
      return {
        kind: 'book',
        label: title ? 'كىتاب: «' + title + '»' : 'كىتاب',
        target: { bookId: bookId, offset: /^\d{1,10}$/.test(o) ? Number(o) : null, word: (params.get('q') || '').trim() }
      };
    }

    m = QURAN_CITE.exec(written);
    if (m) {
      const sura = Number(m[1]);
      const aya = Number(m[2]);
      if (sura > 114) return blocked;
      return { kind: 'quran', label: 'قۇرئان: ' + sura + ':' + aya, target: { sura: sura, aya: aya } };
    }

    let url;
    try { url = new URL(written); } catch (e) { return blocked; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return blocked;
    // https://bilimhezinisi.com@elsewhere.example/ goes to elsewhere.example.
    if (url.username || url.password || !url.hostname) return blocked;
    return { kind: 'external', label: url.hostname, target: { url: url.href } };
  }

  /** Go where a described link points. The note is saved first (notesGoTo*). */
  async function openLink(where) {
    if (!where || !where.target) return false;
    closeLinkCard();
    const target = where.target;
    if (where.kind === 'book') {
      if (!((window.S && window.S.books) || []).some(b => b.id === target.bookId)) {
        toast('بۇ كىتاب كۈتۈپخانىدا يوق', 'e');
        return false;
      }
      await window.notesGoToBook(target.bookId, encodeURIComponent(target.word || ''), target.offset);
      return true;
    }
    if (where.kind === 'quran') {
      await window.notesGoToQuranAya(target.sura, target.aya);
      return true;
    }
    if (where.kind === 'external') {
      // The main process gives a parsed http(s) address to the system browser
      // (setWindowOpenHandler → navigation.externalUrl) and opens no window.
      window.open(target.url, '_blank', 'noopener,noreferrer');
      return true;
    }
    return false;
  }

  /** The link a click inside the editor landed on, if it landed on one. */
  function linkAt(target) {
    const el = target && (target.nodeType === 1 ? target : target.parentElement);
    const link = el && el.closest ? el.closest('a[href]') : null;
    return (link && editorEl && link !== editorEl && editorEl.contains(link)) ? link : null;
  }

  // Ctrl+click opens at once; a click shows the card. Either way the browser
  // is not allowed to follow the link — in a read-only (trashed) note it
  // otherwise would.
  function onEditorLinkClick(e) {
    const link = linkAt(e.target);
    if (!link) return;
    e.preventDefault();
    const where = describeLink(link.getAttribute('href'), link.textContent);
    if (e.ctrlKey || e.metaKey) {
      closeLinkCard();
      openLink(where);
      return;
    }
    // The end of a drag that selected text is not a click on the link.
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed && editorEl.contains(sel.anchorNode)) return;
    showLinkCard(link, where);
  }

  function onEditorLinkAuxClick(e) {
    if (linkAt(e.target)) e.preventDefault();
  }

  // { el, link, editor, onMove, onDown, onKey } while a card is open.
  let linkCard = null;
  const CARD_EDGE = 8;
  const CARD_GAP = 6;

  function closeLinkCard() {
    const c = linkCard;
    if (!c) return;
    linkCard = null;
    window.removeEventListener('scroll', c.onMove, true);
    window.removeEventListener('resize', c.onMove);
    document.removeEventListener('pointerdown', c.onDown, true);
    document.removeEventListener('keydown', c.onKey, true);
    c.editor.removeEventListener('input', closeLinkCard);
    c.el.remove();
  }

  /**
   * Put the card under its link — above it when there is no room below —
   * inside the window. It goes when the link has left the part of the editor
   * that can be seen, or the page.
   */
  function placeLinkCard() {
    const c = linkCard;
    if (!c) return;
    const box = c.link.isConnected ? c.link.getBoundingClientRect() : null;
    const area = c.editor.isConnected ? c.editor.getBoundingClientRect() : null;
    if (!box || !area || (box.width === 0 && box.height === 0) ||
        box.bottom <= area.top || box.top >= area.bottom) {
      closeLinkCard();
      return;
    }
    const size = c.el.getBoundingClientRect();
    const viewH = window.innerHeight;
    const viewW = window.innerWidth;
    let top = box.bottom + CARD_GAP;
    if (top + size.height > viewH - CARD_EDGE) {
      const above = box.top - CARD_GAP - size.height;
      top = above >= CARD_EDGE ? above : Math.max(CARD_EDGE, viewH - CARD_EDGE - size.height);
    }
    // Centred on the link, pulled inside the window. Physical left: this is a
    // window coordinate, not a text direction.
    let left = box.left + box.width / 2 - size.width / 2;
    left = Math.min(Math.max(left, CARD_EDGE), Math.max(CARD_EDGE, viewW - size.width - CARD_EDGE));
    c.el.style.top = Math.round(top) + 'px';
    c.el.style.left = Math.round(left) + 'px';
    c.el.style.visibility = 'visible';
  }

  function cardButton(action, iconName, label, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'nlc-row';
    b.dataset.action = action;
    b.innerHTML = icon(iconName);
    const span = document.createElement('span');
    span.textContent = label;
    b.appendChild(span);
    // The note keeps its focus and its selection.
    b.addEventListener('mousedown', ev => ev.preventDefault());
    b.addEventListener('click', onClick);
    return b;
  }

  function showLinkCard(link, where) {
    closeLinkCard();
    if (!editorEl) return;
    const editable = editorEl.isContentEditable;

    const el = document.createElement('div');
    el.className = 'notes-link-card';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'ئۇلىنىش');
    el.setAttribute('dir', 'rtl');
    el.dataset.kind = where.kind;
    el.style.position = 'fixed';
    el.style.top = '-9999px';
    el.style.left = '0';
    el.style.visibility = 'hidden';

    const head = document.createElement('div');
    head.className = 'nlc-head';
    const words = document.createElement('div');
    words.className = 'nlc-words';
    const text = document.createElement('div');
    text.className = 'nlc-text';
    text.textContent = (link.textContent || '').replace(/\s+/g, ' ').trim() || '—';
    const whereEl = document.createElement('div');
    whereEl.className = 'nlc-where';
    whereEl.textContent = where.label;
    // An address shown as written reads left to right; a description is Uyghur.
    if (where.kind === 'blocked' || where.kind === 'external') whereEl.setAttribute('dir', 'ltr');
    words.appendChild(text);
    words.appendChild(whereEl);
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'nlc-close';
    close.setAttribute('aria-label', 'تاقاش');
    close.innerHTML = icon('x');
    close.addEventListener('click', closeLinkCard);
    head.appendChild(words);
    head.appendChild(close);
    el.appendChild(head);

    if (!where.target) {
      const note = document.createElement('div');
      note.className = 'nlc-blocked';
      note.textContent = 'بۇ ئۇلىنىشنى ئاچقىلى بولمايدۇ.';
      el.appendChild(note);
    } else {
      el.appendChild(cardButton('open', where.kind === 'external' ? 'globe' : 'book-open', 'ئېچىش', () => openLink(where)));
    }
    if (editable) {
      el.appendChild(cardButton('unlink', 'scissors', 'ئۇلىنىشنى ئېلىۋېتىش', () => unlinkLink(link)));
    }

    document.body.appendChild(el);
    const c = {
      el: el, link: link, editor: editorEl,
      // A scroll or a resize moves the link: follow it. Chromium sends both
      // events at most once a frame already, so no frame of our own is needed.
      onMove: () => { if (linkCard === c) placeLinkCard(); },
      onDown: (ev) => { if (!el.contains(ev.target)) closeLinkCard(); },
      onKey: (ev) => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        ev.stopPropagation();
        closeLinkCard();
      }
    };
    linkCard = c;
    window.addEventListener('scroll', c.onMove, true);
    window.addEventListener('resize', c.onMove);
    document.addEventListener('pointerdown', c.onDown, true);
    document.addEventListener('keydown', c.onKey, true);
    // An edit can move or remove the link the card describes.
    editorEl.addEventListener('input', closeLinkCard);
    placeLinkCard();
  }

  /** Take the link away and keep its words — one editing command, so Ctrl+Z puts it back. */
  function unlinkLink(link) {
    closeLinkCard();
    if (!editorEl || !editorEl.isContentEditable || !link.isConnected || !editorEl.contains(link)) return;
    editorEl.focus();
    const range = document.createRange();
    range.selectNode(link);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    document.execCommand('unlink');
    if (sel.rangeCount) sel.collapseToEnd();
    markDirty();
  }

  window.NotesCite = {
    describe: describeLink,
    bookHref: bookHref,
    quranHref: quranHref,
    open: openLink,
    closeCard: closeLinkCard
  };

  // ========== MANUAL SOURCE SEARCH (W12) ==========
  // The writer can look for a source instead of waiting for the scanner to
  // find one. The library goes through the reader's own search (db-search,
  // kept out of the search history, which is the reader's), then through each
  // book's own occurrences with their offsets (db-get-all-snippets), so a
  // citation opens at that very place; the Qur'an through quran-search. A
  // book found by its title alone has no passage to quote and is left out.

  const SRC_BOOKS = 10;        // books looked into
  const SRC_PLACES = 3;        // places a book shows before «يەنە»
  const SRC_MAX_PLACES = 20;   // places a book can show at all
  const SRC_AYAS = 10;
  let srcSeq = 0;              // a newer search makes an older answer stale
  let srcHits = [];            // what the result buttons act on, by index
  let srcMore = new Map();     // bookId -> the places not shown yet

  /** FTS5's snippet() marks a hit with <mark>; the snippet IPC with §MARK_…§. */
  function ftsMarks(s) {
    return String(s || '').replace(/<mark>/g, '§MARK_OPEN§').replace(/<\/mark>/g, '§MARK_CLOSE§');
  }

  /** Book text as text: escaped first, and only then the marks made real. */
  function markedSnippet(s) {
    return escHtml(s).replace(/§MARK_OPEN§/g, '<mark>').replace(/§MARK_CLOSE§/g, '</mark>');
  }

  function srcMessage(box, text) {
    box.innerHTML = `<div class="notes-src-msg">${escHtml(text)}</div>`;
  }

  function srcHitHtml(hit) {
    const index = srcHits.push(hit) - 1;
    const title = hit.kind === 'book'
      ? escHtml(hit.title)
      : 'قۇرئان كەرىم، ' + (hit.sura | 0) + ':' + (hit.aya | 0);
    return `<div class="notes-src-hit" data-kind="${hit.kind}">
      <div class="notes-src-title">${icon('book-open')}${title}</div>
      <div class="notes-src-snippet"${hit.arabic ? ' lang="ar"' : ''}>${markedSnippet(hit.snip)}</div>
      <div class="notes-ref-actions">
        <button type="button" class="notes-ref-act" data-action="open" data-index="${index}">${icon('book-open')} ئېچىش</button>
        <button type="button" class="notes-ref-act" data-action="insert" data-index="${index}">${icon('plus')} قىستۇرۇش</button>
      </div>
    </div>`;
  }

  function bindSourceButtons(root) {
    root.querySelectorAll('button[data-action]:not([data-bound])').forEach(b => {
      b.setAttribute('data-bound', '1');
      b.addEventListener('click', onSourceAction);
    });
  }

  function onSourceAction(e) {
    const btn = e.currentTarget;
    const action = btn.dataset.action;
    if (action === 'more') {
      const rest = srcMore.get(Number(btn.dataset.book)) || [];
      srcMore.delete(Number(btn.dataset.book));
      btn.insertAdjacentHTML('beforebegin', rest.map(srcHitHtml).join(''));
      const parent = btn.parentElement;
      btn.remove();
      if (parent) bindSourceButtons(parent);
      return;
    }
    const hit = srcHits[Number(btn.dataset.index)];
    if (!hit) return;
    if (hit.kind === 'book') {
      if (action === 'insert') window.notesInsertRef(hit.bookId, encodeURIComponent(hit.snip), hit.pos, encodeURIComponent(hit.word));
      else window.notesGoToBook(hit.bookId, encodeURIComponent(hit.word), hit.pos);
    } else if (action === 'insert') {
      window.notesInsertAya(hit.sura, hit.aya, _s().ayaMode);
    } else {
      window.notesGoToQuranAya(hit.sura, hit.aya);
    }
  }

  window.notesSourceSearch = async function () {
    const input = document.getElementById('notes-src-q');
    const box = document.getElementById('notes-src-results');
    if (!input || !box) return;
    const q = input.value.replace(/\s+/g, ' ').trim();
    const seq = ++srcSeq;
    srcHits = [];
    srcMore = new Map();
    if (q.length < 2) { srcMessage(box, 'كەم دېگەندە ئىككى ھەرپ يېزىڭ'); return; }
    srcMessage(box, 'ئىزدەۋاتىدۇ...');

    const answers = await Promise.all([
      Promise.resolve().then(() => window.electron.dbSearch(q, 'all', { history: false })).catch(() => null),
      Promise.resolve().then(() => window.electron.quranSearch(q, { limit: SRC_AYAS })).catch(() => null)
    ]);
    if (seq !== srcSeq) return;
    const lib = answers[0];
    const quran = answers[1];
    if ((!lib || !lib.success) && (!quran || !quran.success)) { srcMessage(box, 'ئىزدەش مەغلۇپ بولدى'); return; }

    const found = ((lib && lib.success && lib.results) || [])
      .filter(r => r && r.inC && r.book && r.book.id != null)
      .slice(0, SRC_BOOKS);
    const places = await Promise.all(found.map(r =>
      Promise.resolve().then(() => window.electron.dbGetAllSnippets(r.book.id, q))
        .then(res => (res && res.success && Array.isArray(res.snippets)) ? res.snippets : [], () => [])));
    if (seq !== srcSeq) return;

    let html = '';
    let books = '';
    found.forEach((r, i) => {
      let list = places[i].slice(0, SRC_MAX_PLACES).map(s => ({
        kind: 'book', bookId: r.book.id, title: r.book.title || '', snip: s.snip || '',
        pos: (typeof s.pos === 'number' && s.pos >= 0) ? s.pos : null, word: q
      }));
      // Every word was found, but not side by side: the search's own snippet,
      // citing the book alone.
      if (!list.length && r.snip) {
        list = [{ kind: 'book', bookId: r.book.id, title: r.book.title || '', snip: ftsMarks(r.snip), pos: null, word: '' }];
      }
      if (!list.length) return;
      books += list.slice(0, SRC_PLACES).map(srcHitHtml).join('');
      if (list.length > SRC_PLACES) {
        srcMore.set(r.book.id, list.slice(SRC_PLACES));
        books += `<button type="button" class="notes-src-more" data-action="more" data-book="${r.book.id}">يەنە ${list.length - SRC_PLACES} ئورۇن</button>`;
      }
    });
    if (books) html += `<div class="notes-src-head">كىتابلار</div>${books}`;

    const ayas = ((quran && quran.success && quran.results) || []).slice(0, SRC_AYAS);
    if (ayas.length) {
      html += '<div class="notes-src-head">قۇرئان</div>';
      html += ayas.map(a => {
        // The column the words were found in — FTS5 snippets the other one too.
        const inUg = !!a.snip_ug && a.snip_ug.indexOf('<mark>') !== -1;
        const inAr = !!a.snip_ar && a.snip_ar.indexOf('<mark>') !== -1;
        const snip = inUg ? a.snip_ug : inAr ? a.snip_ar : (a.text_ug || a.text_ar || '');
        const arabic = !inUg && (inAr || !a.text_ug);
        return srcHitHtml({ kind: 'aya', sura: a.sura, aya: a.aya, snip: ftsMarks(snip), arabic: arabic });
      }).join('');
    }

    if (!html) { srcMessage(box, 'ھېچنېمە تېپىلمىدى'); return; }
    box.innerHTML = html;
    bindSourceButtons(box);
  };

  // ========== QUALITY EXTRAS (Phase 5) ==========

  // --- 5.3 word/char count -----------------------------------------------------
  let _wcTimer = null;
  function scheduleWordCount() { clearTimeout(_wcTimer); _wcTimer = setTimeout(updateWordCount, 300); }
  function updateWordCount() {
    const el = document.getElementById('notes-wordcount'); if (!el) return;
    const txtEl = document.getElementById('notes-wc-text') || el;
    const text = (editorEl ? (editorEl.innerText || '') : '').trim();
    const words = text ? (text.match(/\S+/g) || []).length : 0;
    const chars = text.replace(/\s/g, '').length;
    txtEl.textContent = 'سۆز: ' + words + ' · ھەرپ: ' + chars;
  }

  // Clean snapshot for saving. Nothing transient is written into the note any
  // more — spelling, find hits and reference matches are all painted — and
  // putDocument() unwraps what older versions stored. This is the safety net
  // behind both: if any of that markup is in the editor, it is not saved.
  function snapshotHtml() {
    if (!editorEl) return '';
    if (!editorEl.querySelector('mark.notes-find-hit, span.spell-error, span.ref-match')) return editorEl.innerHTML;
    const clone = editorEl.cloneNode(true);
    clone.querySelectorAll('mark.notes-find-hit').forEach(mk => mk.replaceWith(document.createTextNode(mk.textContent)));
    clone.querySelectorAll('span.spell-error, span.ref-match').forEach(sp => sp.replaceWith(...sp.childNodes));
    return clone.innerHTML;
  }

  // --- find & replace (K1) ----------------------------------------------------
  // Three things carry this section.
  //
  // NOTHING IS WRITTEN INTO THE NOTE TO SHOW A MATCH. Every hit used to be
  // wrapped in a <mark>, which snapshotHtml() then had to remember to strip
  // again before saving. The hits are painted with the CSS Custom Highlight
  // API instead — the spellchecker already proved it here — so there is nothing
  // in the note to save, nothing to move the caret, and no text node split
  // through the middle of an Arabic word.
  //
  // A MATCH NEVER CROSSES A TEXT NODE. Occurrences are found inside one text
  // node at a time, so a phrase can never straddle two paragraphs.
  //
  // A REPLACEMENT TOUCHES ONLY ITS OWN HIT, written over that hit's Range with
  // one insertText, last hit first. Writing the whole document back instead
  // (`selectAll` + `insertHTML`) put everything after the note's first block
  // INSIDE it: a note that began with a quote ended up entirely inside that
  // quote, and three seconds later the wreckage was saved (K1).

  /** Painted by the ::highlight() rules in notes.css. */
  const FIND_HIGHLIGHT = 'bh-find-hit';
  const FIND_CURRENT = 'bh-find-current';

  let findState = { hits: [], idx: -1, map: null, query: '' };
  let findUndo = null;        // { html, steps } — the note before a replace-all

  function isFindOpen() { const b = document.getElementById('notes-find-bar'); return !!(b && b.style.display !== 'none'); }

  function openFindBar(withReplace) {
    const bar = document.getElementById('notes-find-bar'); if (!bar) return;
    bar.style.display = 'flex';
    ['notes-replace-input', 'notes-replace-btn', 'notes-replace-all-btn'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = withReplace ? '' : 'none';
    });
    showUndoAll(!!findUndo);
    const inp = document.getElementById('notes-find-input');
    if (inp) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && editorEl && editorEl.contains(sel.anchorNode) && sel.toString().trim()) {
        inp.value = sel.toString().trim();
      }
      inp.focus(); inp.select();
    }
    window.notesFindRun();
  }

  function showUndoAll(on) {
    const btn = document.getElementById('notes-undo-all-btn');
    if (btn) btn.style.display = on ? '' : 'none';
  }

  function clearFindHighlights() {
    const TM = window.TextMap;
    if (TM) { TM.clearHighlight(FIND_HIGHLIGHT); TM.clearHighlight(FIND_CURRENT); }
    findState.hits = []; findState.idx = -1; findState.map = null;
    // Notes saved before v3.5 can still carry the old <mark> hits.
    if (editorEl) {
      const legacy = editorEl.querySelectorAll('mark.notes-find-hit');
      if (legacy.length) {
        legacy.forEach(m => m.replaceWith(...m.childNodes));
        editorEl.normalize();
      }
    }
  }

  function updateFindCount() {
    const c = document.getElementById('notes-find-count');
    if (c) c.textContent = (findState.hits.length ? (findState.idx + 1) : 0) + ' / ' + findState.hits.length;
  }

  /** Paint the hits, the current one in its own colour, and scroll to it. */
  function paintFind() {
    const TM = window.TextMap;
    if (!TM) return;
    if (!findState.map) { TM.clearHighlight(FIND_HIGHLIGHT); TM.clearHighlight(FIND_CURRENT); return; }
    const others = [];
    const current = [];
    findState.hits.forEach((hit, i) => {
      const range = TM.rangeFor(findState.map, hit.start, hit.end);
      if (!range) return;
      if (i === findState.idx) current.push(range); else others.push(range);
    });
    TM.setHighlight(FIND_HIGHLIGHT, others);
    TM.setHighlight(FIND_CURRENT, current);
    if (current.length && editorEl) scrollRangeIntoView(current[0]);
  }

  // There is no element to call scrollIntoView() on any more, so the editor is
  // scrolled by the difference itself.
  function scrollRangeIntoView(range) {
    try {
      const r = range.getBoundingClientRect();
      if (!r || (!r.height && !r.width)) return;
      const box = editorEl.getBoundingClientRect();
      if (r.top >= box.top && r.bottom <= box.bottom) return;
      editorEl.scrollTop += (r.top - box.top) - (box.height / 2) + (r.height / 2);
    } catch (e) { /* a detached range */ }
  }

  window.notesFindRun = function () {
    if (!editorEl) return;
    const TM = window.TextMap;
    clearFindHighlights();
    const inp = document.getElementById('notes-find-input');
    const q = (((inp && inp.value) || '')).trim();
    findState.query = q;
    if (!q || !TM) { updateFindCount(); return; }

    const map = TM.readTextMap(editorEl);
    const needle = q.toLowerCase();
    const hits = [];
    for (let i = 0; i < map.nodes.length; i++) {
      const lower = map.nodes[i].data.toLowerCase();
      let at = 0;
      while ((at = lower.indexOf(needle, at)) !== -1) {
        hits.push({ start: map.starts[i] + at, end: map.starts[i] + at + q.length });
        at += q.length;
      }
    }
    findState.map = map;
    findState.hits = hits;
    findState.idx = hits.length ? 0 : -1;
    paintFind();
    updateFindCount();
  };

  window.notesFindNext = function () {
    if (!findState.hits.length) return;
    findState.idx = (findState.idx + 1) % findState.hits.length;
    paintFind(); updateFindCount();
  };
  window.notesFindPrev = function () {
    if (!findState.hits.length) return;
    findState.idx = (findState.idx - 1 + findState.hits.length) % findState.hits.length;
    paintFind(); updateFindCount();
  };
  window.notesFindKey = function (e) {
    if (e.key === 'Enter') { e.preventDefault(); if (e.shiftKey) window.notesFindPrev(); else window.notesFindNext(); }
    else if (e.key === 'Escape') { e.preventDefault(); window.notesFindClose(); }
  };
  window.notesFindClose = function () {
    clearFindHighlights();
    updateFindCount();
    const bar = document.getElementById('notes-find-bar'); if (bar) bar.style.display = 'none';
    if (editorEl) editorEl.focus();
  };

  /**
   * Replace the current hit, or all of them.
   *
   * Every hit gets a live Range before anything is written, and the writes run
   * from the last hit to the first — so a replacement can never move a hit
   * still waiting its turn, and the Ranges follow the document as it changes.
   * Each one is a single insertText, which the browser can undo and which
   * leaves the markup around the hit alone.
   */
  function applyReplacement(all) {
    const TM = window.TextMap;
    if (!editorEl || !TM || !findState.hits.length || !findState.map) return 0;
    const repl = (document.getElementById('notes-replace-input') || {}).value || '';
    const chosen = all
      ? findState.hits.slice()
      : (findState.idx >= 0 ? [findState.hits[findState.idx]] : []);
    if (!chosen.length) return 0;

    const needle = findState.query.toLowerCase();
    const before = snapshotHtml();
    if (all) keepVersion('before-replace-all', before);
    const ranges = chosen.map(hit => TM.rangeFor(findState.map, hit.start, hit.end));

    editorEl.focus();
    const selection = window.getSelection();
    let written = 0;
    for (let i = ranges.length - 1; i >= 0; i--) {
      const range = ranges[i];
      // The hit has to still be there, and still be the hit.
      if (!range || !editorEl.contains(range.startContainer)) continue;
      if (range.toString().toLowerCase() !== needle) continue;
      selection.removeAllRanges();
      selection.addRange(range);
      document.execCommand('insertText', false, repl);
      written++;
    }
    if (!written) return 0;

    markDirty();
    // One offer to take the whole batch back. The browser's own undo would do
    // it in `written` steps; if the note still differs after those, the
    // snapshot is written back instead.
    if (all && written > 1) {
      findUndo = { html: before, steps: written };
      showUndoAll(true);
    }
    window.notesFindRun();
    return written;
  }

  window.notesReplaceOne = function () {
    const n = applyReplacement(false);
    if (n) toast(n + ' ئورۇن ئالماشتۇرۇلدى', 'i');
  };
  window.notesReplaceAll = function () {
    const n = applyReplacement(true);
    toast((n || 0) + ' ئورۇن ئالماشتۇرۇلدى', n ? 's' : 'i');
  };

  /** Take a whole «ھەممىنى ئالماشتۇرۇش» back in one go. */
  window.notesUndoReplaceAll = function () {
    if (!findUndo || !editorEl) return;
    editorEl.focus();
    for (let i = 0; i < findUndo.steps; i++) document.execCommand('undo');
    if (snapshotHtml() !== findUndo.html) putDocument(findUndo.html);
    findUndo = null;
    showUndoAll(false);
    markDirty();
    window.notesFindRun();
    toast('ئالماشتۇرۇش يېنىۋالىندى', 's');
  };

  // --- 5.3 DOCX export ---------------------------------------------------------
  // --- export (W6, K8) ---------------------------------------------------------
  // «چىقىرىش ▾»: Word, PDF, Markdown, text. This used to send editor.innerText
  // to a Word writer, and every heading, quote, list, face and colour was lost.
  // The note is now read into a document model (src/notes-export.js); the
  // main process writes the file (note-export.js).

  const EXPORT_FOOTNOTES_KEY = 'notes_export_footnotes';

  async function exportFootnotesOn() {
    try {
      const r = await window.electron.dbGetSetting(EXPORT_FOOTNOTES_KEY, 'off');
      const v = (r && typeof r === 'object' && 'value' in r) ? r.value : r;
      return v === 'on';
    } catch (e) { return false; }
  }

  window.notesSetExportFootnotes = function (on) {
    try { window.electron.dbSetSetting(EXPORT_FOOTNOTES_KEY, on ? 'on' : 'off'); } catch (e) { /* not remembered */ }
  };

  function closeExportMenu() {
    const menu = document.getElementById('notes-export-menu');
    if (menu) menu.classList.remove('on');
  }

  window.notesExportMenu = async function (ev) {
    if (ev) ev.stopPropagation();
    const menu = document.getElementById('notes-export-menu');
    if (!menu) return;
    const opening = !menu.classList.contains('on');
    menu.classList.toggle('on', opening);
    if (opening) {
      const box = document.getElementById('notes-export-footnotes');
      if (box) box.checked = await exportFootnotesOn();
    }
  };
  // A click anywhere outside closes it.
  document.addEventListener('click', (e) => {
    const wrap = document.getElementById('notes-export-wrap');
    if (wrap && !wrap.contains(e.target)) closeExportMenu();
  });

  window.notesExport = async function (format) {
    closeExportMenu();
    if (!_s().curDoc || !editorEl) { toast('خاتىرە يوق', 'e'); return; }
    if (!(editorEl.innerText || '').trim()) { toast('خاتىرە قۇرۇق', 'e'); return; }
    const NE = window.NoteExport;
    if (!NE) { toast('چىقىرىش بۆلىكى يۈكلەنمىدى', 'e'); return; }

    const raw = snapshotHtml();
    const html = (window.SafeHTML && window.SafeHTML.sanitize) ? window.SafeHTML.sanitize(raw) : raw;
    const title = ((_s().curDoc.title || '').trim()) || 'خاتىرە';
    const footnotes = await exportFootnotesOn();

    let payload;
    try {
      if (format === 'docx') payload = { title: title, model: NE.buildModel(html, { title: title, footnotes: footnotes }) };
      else if (format === 'pdf') {
        const body = NE.toPdfBody(html, { footnotes: footnotes });
        payload = { title: title, html: body.html, credit: body.credit };
      }
      else if (format === 'md') payload = { title: title, text: NE.toMarkdown(html, { title: title, footnotes: footnotes }) };
      else if (format === 'txt') payload = { title: title, text: NE.toText(NE.buildModel(html, { title: title, footnotes: footnotes })) };
      else return;
    } catch (e) {
      console.error('[notes] export failed:', e);
      toast('چىقىرىش مەغلۇپ بولدى', 'e');
      return;
    }

    if (format === 'pdf') toast('PDF تەييارلىنىۋاتىدۇ...', 'i');
    let r = null;
    try { r = await window.electron.exportNote(format, payload); }
    catch (e) { r = { success: false, error: e && e.message }; }
    if (r && r.success) toast('ساقلاندى: ' + r.name, 's');
    else if (r && !r.canceled) toast('چىقىرىش خاتالىقى' + (r.error ? ' — ' + r.error : ''), 'e');
  };

  // The old name, for anything that still calls it.
  window.notesExportDocx = function () { return window.notesExport('docx'); };

  // --- 5.1 image → text (offline OCR) ------------------------------------------
  function insertPlainParagraphs(text) {
    if (!editorEl) return;
    editorEl.focus();
    const sel = window.getSelection();
    if (!sel.rangeCount || !editorEl.contains(sel.anchorNode)) placeCaretAtEnd(editorEl);
    // Insert as plain paragraphs (newlines → line breaks within the caret block).
    document.execCommand('insertText', false, String(text || ''));
  }
  let _ocrFileInput = null;
  window.notesImageOcr = function () {
    if (!editorEl) return;
    if (!_ocrFileInput) {
      _ocrFileInput = document.createElement('input');
      _ocrFileInput.type = 'file';
      _ocrFileInput.accept = 'image/png,image/jpeg,image/bmp,image/tiff,.png,.jpg,.jpeg,.bmp,.tif,.tiff';
      _ocrFileInput.style.display = 'none';
      document.body.appendChild(_ocrFileInput);
      _ocrFileInput.addEventListener('change', () => {
        const f = _ocrFileInput.files && _ocrFileInput.files[0];
        _ocrFileInput.value = '';
        if (f) ocrImageFileToEditor(f);
      });
    }
    _ocrFileInput.click();
  };
  async function ocrImageFileToEditor(file) {
    if (!editorEl || !file) return;
    const dataUrl = await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => res(null);
      fr.readAsDataURL(file);
    });
    if (!dataUrl) { if (window.toast) window.toast('رەسىم ئوقۇغىلى بولمىدى', 'e'); return; }
    if (window.toast) window.toast('OCR ئىجرا بولۇۋاتىدۇ...', 'i');
    let r;
    try { r = await window.electron.ocrRecognize([dataUrl], 'ukij+uig'); }
    catch (e) { if (window.toast) window.toast('OCR مەغلۇپ بولدى', 'e'); return; }
    if (!r || !r.success) { if (window.toast) window.toast('OCR خاتالىقى: ' + ((r && r.error) || ''), 'e'); return; }
    const text = (r.pages || []).join('\n\n').trim();
    if (!text) { if (window.toast) window.toast('تېكىست چىقمىدى', 'e'); return; }
    insertPlainParagraphs(text);
    markDirty();
    if (window.toast) window.toast('OCR تامام', 's');
    // 5.2 — offer optional AI cleanup of the OCR output (online), if available.
    if (typeof window.naiOfferOcrCleanup === 'function') window.naiOfferOcrCleanup();
  }

  // Reset transient editor tools when (re-)mounting a document.
  function resetEditorTools() {
    clearRefMatches();
    closeLinkCard();
    findState = { hits: [], idx: -1, map: null, query: '' };
    findUndo = null;
    showUndoAll(false);
    if (window.TextMap) {
      window.TextMap.clearHighlight(FIND_HIGHLIGHT);
      window.TextMap.clearHighlight(FIND_CURRENT);
    }
    const bar = document.getElementById('notes-find-bar'); if (bar) bar.style.display = 'none';
    const btn = document.getElementById('notes-ocr-cleanup-btn'); if (btn) btn.style.display = 'none';
  }
  window.notesResetEditorTools = resetEditorTools;

  // ========== EARLIER VERSIONS (W1) ==========
  // A replace-all, an AI correction, a paint over several paragraphs or a
  // restore is permanent the moment autosave writes it. Each keeps the note
  // as it was first; «نەشر تارىخى» lists them and puts any one back. The
  // rules (no duplicates, auto every five minutes, 30 per note) are in the
  // main process — database.js, noteVersionKeep.

  const VERSION_LABELS = {
    open: 'ئاچقاندا',
    auto: 'ئۆزلۈكىدىن',
    'before-replace-all': 'ئالماشتۇرۇشتىن بۇرۇن',
    'before-paint': 'سۈپۈرگىدىن بۇرۇن',
    'before-ai': 'AI تۈزىتىشتىن بۇرۇن',
    'before-restore': 'ئەسلىگە قايتۇرۇشتىن بۇرۇن'
  };

  /** Fire and forget: a version must never hold up, or break, an edit. */
  function sendVersion(noteId, reason, title, html, text) {
    try {
      if (!window.electron || typeof window.electron.notesVersionKeep !== 'function') return;
      const p = window.electron.notesVersionKeep(noteId, reason, title || '', html || '', text || '');
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch (e) { /* the edit goes ahead regardless */ }
  }

  /**
   * Keep the note as it is on screen NOW — before a destructive change. The
   * snapshot is taken synchronously, so the IPC is on its way before the
   * change starts, and the main process handles it before the save that
   * follows.
   */
  function keepVersion(reason, rawHtml) {
    const doc = _s().curDoc;
    if (!doc || !editorEl) return;
    const raw = (rawHtml != null) ? rawHtml : snapshotHtml();
    const html = (window.SafeHTML && window.SafeHTML.sanitize) ? window.SafeHTML.sanitize(raw) : raw;
    sendVersion(doc.id, reason, doc.title, html, editorEl.innerText || '');
  }
  window.notesKeepVersion = keepVersion;

  // The AI tab's «يېنىۋېلىش» (W13): the note as it was right before an AI
  // change — kept as a «AI تۈزىتىشتىن بۇرۇن» version, and held here to be
  // put back in one click. It belongs to its note: another note never gets it.
  let aiUndo = null;   // { noteId, html }

  window.notesBeforeAi = function () {
    const doc = _s().curDoc;
    if (!doc || !editorEl || !editorEl.isContentEditable) return false;
    const html = snapshotHtml();
    keepVersion('before-ai', html);
    aiUndo = { noteId: doc.id, html: html };
    return true;
  };

  window.notesCanUndoAi = function () {
    const doc = _s().curDoc;
    return !!(aiUndo && doc && editorEl && editorEl.isContentEditable && aiUndo.noteId === doc.id);
  };

  /** Put the note back as it was before the AI change — itself a restore, so the corrected note is kept first. */
  window.notesUndoAi = function () {
    if (!window.notesCanUndoAi()) return false;
    const html = aiUndo.html;
    aiUndo = null;
    keepVersion('before-restore');
    putDocument(html);
    markDirty();
    return true;
  };

  function pad2(n) { return String(n).padStart(2, '0'); }

  /** «بۈگۈن 15:40», «تۈنۈگۈن 09:12», otherwise «2026-10-07 15:40» — local time. */
  function versionTime(iso, now) {
    const when = new Date(iso);
    if (isNaN(when.getTime())) return '';
    const clock = pad2(when.getHours()) + ':' + pad2(when.getMinutes());
    const today = new Date(now);
    const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (same(when, today)) return 'بۈگۈن ' + clock;
    // The calendar's yesterday, not 24 hours ago.
    if (same(when, new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))) return 'تۈنۈگۈن ' + clock;
    return when.getFullYear() + '-' + pad2(when.getMonth() + 1) + '-' + pad2(when.getDate()) + ' ' + clock;
  }

  function renderHistoryPane() {
    return `<div id="notes-history" class="notes-side-pane">
      <div class="notes-side-pane-head">${icon('clock')} نەشر تارىخى</div>
      <div class="notes-side-pane-note">خاتىرە ئېچىلغاندا، ھەر 5 مىنۇتتا ۋە چوڭ ئۆزگەرتىشتىن بۇرۇن ئۆزلۈكىدىن ساقلىنىدۇ (ھەر خاتىرىگە 30 گىچە).</div>
      <div id="notes-history-body"></div>
    </div>`;
  }

  let historyChosen = null;    // the version being previewed

  async function loadHistory() {
    const body = document.getElementById('notes-history-body');
    if (!body || !_s().curDoc) return;
    historyChosen = null;
    const noteId = _s().curDoc.id;
    body.innerHTML = '<div class="notes-ref-empty">يۈكلىنىۋاتىدۇ...</div>';
    let r = null;
    try { r = await window.electron.notesVersionList(noteId); } catch (e) { r = null; }
    if (!_s().curDoc || _s().curDoc.id !== noteId) return;
    if (!r || !r.success) {
      body.innerHTML = '<div class="notes-ref-empty">نەشر تارىخى ئوقۇلمىدى</div>';
      return;
    }
    if (!r.versions.length) {
      body.innerHTML = '<div class="notes-ref-empty">تېخى نۇسخا يوق.<br>يازغانسېرى بۇ يەردە ئۆزلۈكىدىن پەيدا بولىدۇ.</div>';
      return;
    }
    const now = Date.now();
    body.innerHTML = r.versions.map(v => `<button type="button" class="notes-history-item" data-id="${Number(v.id)}">
        <span class="nh-label">${escHtml(VERSION_LABELS[v.reason] || v.reason)}</span>
        <span class="nh-time">${escHtml(versionTime(v.created_at, now))}</span>
        <span class="nh-first">${escHtml(v.first_line || '—')}</span>
      </button>`).join('');
    body.querySelectorAll('.notes-history-item').forEach(b => {
      b.addEventListener('click', () => previewVersion(Number(b.dataset.id)));
    });
  }

  /** A sanitized, read-only preview — nothing changes until «ئەسلىگە قايتۇرۇش». */
  async function previewVersion(id) {
    const body = document.getElementById('notes-history-body');
    if (!body) return;
    let r = null;
    try { r = await window.electron.notesVersionGet(id); } catch (e) { r = null; }
    if (!r || !r.success || !r.version) { toast('بۇ نۇسخا ئوقۇلمىدى', 'e'); return; }
    historyChosen = r.version;
    const v = r.version;
    body.innerHTML = `<div class="nh-preview-head">
        <span class="nh-label">${escHtml(VERSION_LABELS[v.reason] || v.reason)}</span>
        <span class="nh-time">${escHtml(versionTime(v.created_at, Date.now()))}</span>
      </div>
      <div class="notes-history-preview"></div>
      <div class="nh-actions">
        <button type="button" class="notes-ref-act" data-action="restore">بۇ نۇسخىنى ئەسلىگە قايتۇرۇش</button>
        <button type="button" class="notes-ref-act" data-action="back">تىزىملىككە قايتىش</button>
      </div>`;
    const preview = body.querySelector('.notes-history-preview');
    preview.innerHTML = (window.SafeHTML && window.SafeHTML.sanitize)
      ? window.SafeHTML.sanitize(v.content_html || '')
      : '';
    body.querySelector('[data-action="restore"]').addEventListener('click', restoreChosenVersion);
    body.querySelector('[data-action="back"]').addEventListener('click', loadHistory);
  }

  /** Keep the note as it is, put the version back, and save it like an edit. */
  function restoreChosenVersion() {
    const v = historyChosen;
    if (!v || !editorEl || !_s().curDoc || v.note_id !== _s().curDoc.id) return;
    keepVersion('before-restore');
    putDocument(v.content_html || '');
    markDirty();
    toast('ئەسلىگە قايتۇرۇلدى. ئالدىنقى ھالىتى «نەشر تارىخى» دا ساقلاندى.', 's');
    loadHistory();
  }

  window.notesShowHistory = async function () {
    if (_s().panelCollapsed) window.notesTogglePanel();
    window.notesSetTab('history');
    await loadHistory();
  };

  // ========== OUTLINE (W5) ==========
  // «مۇندەرىجە» lists the note's h1–h4 so a long note can be crossed in one
  // click — indented from the note's highest heading, empty ones left out (a
  // heading being written this very moment has nothing to show yet). Ported
  // from the web edition's lib/notes/outline.ts.

  function outlineHeadings() {
    if (!editorEl) return [];
    return Array.from(editorEl.querySelectorAll('h1, h2, h3, h4'))
      .filter(h => (h.textContent || '').replace(/\s+/g, ' ').trim() !== '');
  }

  function renderOutlinePane() {
    return `<div id="notes-outline" class="notes-side-pane">
      <div class="notes-side-pane-head">${icon('list')} مۇندەرىجە</div>
      <div id="notes-outline-body"></div>
    </div>`;
  }

  function refreshOutline() {
    const body = document.getElementById('notes-outline-body');
    if (!body) return;
    const headings = outlineHeadings();
    if (!headings.length) {
      body.innerHTML = '<div class="notes-ref-empty">بۇ خاتىرىدە ماۋزۇ يوق.<br>«ئادەتتىكى تېكىست» تىزىملىكىدىن «چوڭ ماۋزۇ» نى تاللاڭ.</div>';
      return;
    }
    const levels = headings.map(h => Number(h.tagName.slice(1)));
    const top = Math.min.apply(null, levels);
    body.innerHTML = headings.map((h, i) => {
      const depth = levels[i] - top;
      return `<button type="button" class="notes-outline-item" data-index="${i}" data-depth="${depth}"
        style="padding-inline-start:${10 + depth * 16}px">${escHtml(h.textContent.replace(/\s+/g, ' ').trim())}</button>`;
    }).join('');
    body.querySelectorAll('.notes-outline-item').forEach(b => {
      b.addEventListener('click', () => goToHeading(Number(b.dataset.index)));
    });
  }

  // Re-read 300 ms after a change — only while the outline is showing.
  let outlineTimer = null;
  function scheduleOutline() {
    if (_s().rightTab !== 'outline') return;
    clearTimeout(outlineTimer);
    outlineTimer = setTimeout(refreshOutline, 300);
  }

  /** Scroll the heading to just below the toolbar and put the caret at its start. */
  function goToHeading(index) {
    const heading = outlineHeadings()[index];
    if (!heading || !editorEl) return;
    const box = editorEl.getBoundingClientRect();
    const rect = heading.getBoundingClientRect();
    editorEl.scrollTop += (rect.top - box.top) - 8;
    editorEl.focus();
    const range = document.createRange();
    range.setStart(heading, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  window.notesShowOutline = function () {
    if (_s().panelCollapsed) window.notesTogglePanel();
    window.notesSetTab('outline');
    refreshOutline();
  };

  // ========== THE PERSONAL DICTIONARY (W8, K12) ==========
  // The words added with «لۇغەتكە قوشۇش» could never be seen or removed.
  // This lists them with a filter, deletes, exports and imports them (a JSON
  // array, the web edition's file), and marks the ones that look like two
  // words glued together — what the owner's bug 2 could store. A hint only.
  // Every word goes on screen through textContent: an imported file is
  // untrusted, and an old entry can be anything.

  let dictWords = [];
  let dictGlued = new Set();

  function renderDictionaryPane() {
    return `<div id="notes-dictionary" class="notes-side-pane">
      <div class="notes-side-pane-head">${icon('book-marked')} شەخسىي لۇغەت</div>
      <div class="notes-side-pane-note">«لۇغەتكە قوشۇش» بىلەن قوشقان سۆزلىرىڭىز. «چاپلاشقان بولۇشى مۇمكىن» دەپ بەلگىلەنگەن سۆزنى تەكشۈرۈڭ — ئىككى سۆز قوشۇلۇپ قالغان بولسا ئۆچۈرۈڭ.</div>
      <input type="text" id="notes-dict-filter" class="notes-dict-filter" placeholder="سۆز ئىزدەش…">
      <div class="nh-actions" style="margin:8px 0">
        <button type="button" class="notes-ref-act" data-action="export">${icon('download', 'ic-sm')} چىقىرىش</button>
        <button type="button" class="notes-ref-act" data-action="import">${icon('folder', 'ic-sm')} كىرگۈزۈش</button>
      </div>
      <div id="notes-dict-count" class="notes-side-pane-note"></div>
      <div id="notes-dict-list"></div>
    </div>`;
  }

  function wireDictionaryPane() {
    const pane = document.getElementById('notes-dictionary');
    if (!pane || pane.dataset.wired) return;
    pane.dataset.wired = '1';
    document.getElementById('notes-dict-filter').addEventListener('input', renderDictionaryList);
    pane.querySelector('[data-action="export"]').addEventListener('click', exportDictionary);
    pane.querySelector('[data-action="import"]').addEventListener('click', importDictionary);
  }

  async function loadDictionaryPane() {
    wireDictionaryPane();
    if (!window.SpellCheck || typeof window.SpellCheck.personalWords !== 'function') return;
    dictWords = (await window.SpellCheck.personalWords()).slice().sort(compareTitles);
    dictGlued = new Set();
    renderDictionaryList();
    try {
      const r = await window.electron.spellGlued(dictWords);
      if (r && r.success && Array.isArray(r.glued)) dictGlued = new Set(r.glued);
    } catch (e) { /* no hints, the list still works */ }
    renderDictionaryList();
  }

  function renderDictionaryList() {
    const list = document.getElementById('notes-dict-list');
    const count = document.getElementById('notes-dict-count');
    if (!list) return;
    const filterEl = document.getElementById('notes-dict-filter');
    const q = filterEl ? filterEl.value.trim() : '';
    const shown = q ? dictWords.filter(w => w.indexOf(q) !== -1) : dictWords;
    if (count) {
      count.textContent = dictWords.length + ' سۆز' + (dictGlued.size ? ' · ' + dictGlued.size + ' سى چاپلاشقان بولۇشى مۇمكىن' : '');
    }
    list.textContent = '';
    if (!shown.length) {
      const empty = document.createElement('div');
      empty.className = 'notes-ref-empty';
      empty.textContent = dictWords.length ? 'تېپىلمىدى' : 'لۇغەت بوش. ئىملا تاختىسىدىكى «لۇغەتكە قوشۇش» بىلەن سۆز قوشۇلىدۇ.';
      list.appendChild(empty);
      return;
    }
    for (const word of shown) {
      const row = document.createElement('div');
      row.className = 'nd-row';
      const text = document.createElement('span');
      text.className = 'nd-word';
      text.textContent = word;
      row.appendChild(text);
      if (dictGlued.has(word)) {
        const hint = document.createElement('span');
        hint.className = 'nd-glued';
        hint.textContent = 'چاپلاشقان بولۇشى مۇمكىن';
        row.appendChild(hint);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'nd-del';
      del.title = 'لۇغەتتىن ئۆچۈرۈش';
      del.textContent = '×';
      del.addEventListener('click', async () => {
        await window.SpellCheck.removePersonal(word);
        toast('لۇغەتتىن ئۆچۈرۈلدى', 'i');
        await loadDictionaryPane();
      });
      row.appendChild(del);
      list.appendChild(row);
    }
  }

  async function exportDictionary() {
    let r = null;
    try { r = await window.electron.spellDictionaryExport(dictWords); } catch (e) { r = null; }
    if (r && r.success) toast('لۇغەت ساقلاندى: ' + r.name, 's');
    else if (!r || !r.canceled) toast('لۇغەت چىقىرىلمىدى', 'e');
  }

  const IMPORT_REFUSALS = {
    not_json: 'بۇ ھۆججەت JSON ئەمەس',
    not_array: 'بۇ ھۆججەتتە سۆز تىزىملىكى يوق',
    too_big: 'ھۆججەت بەك چوڭ'
  };

  async function importDictionary() {
    let r = null;
    try { r = await window.electron.spellDictionaryImport(dictWords); } catch (e) { r = null; }
    if (!r || r.canceled) return;
    if (!r.success) { toast('لۇغەت كىرگۈزۈلمىدى — ' + (IMPORT_REFUSALS[r.reason] || r.error || ''), 'e'); return; }
    await window.SpellCheck.replacePersonal(r.words);
    toast(r.added + ' سۆز قوشۇلدى' + (r.rejected ? '، ' + r.rejected + ' سى قوبۇل قىلىنمىدى' : ''), 's');
    await loadDictionaryPane();
  }

  window.notesShowDictionary = async function () {
    if (_s().panelCollapsed) window.notesTogglePanel();
    window.notesSetTab('dictionary');
    await loadDictionaryPane();
  };

  // ========== BLOCK STYLE (W4, K11) ==========
  // One menu that shows what the caret is in and turns it into normal text, a
  // big or small heading, or a quote. K11: a quote could not be turned back
  // — pressing the quote button again, or «فورماتنى ئۆچۈرۈش», left it a
  // quote — and there was no heading at all. The commands follow the web
  // edition's lib/notes/blocks.ts, re-measured in Electron 28
  // (block-style-transitions), with one change: normal text is a <p> here,
  // because that is what Enter makes in this editor and what the notebook's
  // paragraph spacing is styled for.

  function blockStyleAt(node) {
    for (let cur = node; cur && cur !== editorEl; cur = cur.parentNode) {
      if (cur.nodeType !== 1) continue;
      if (/^H[1-6]$/.test(cur.tagName)) return { style: cur.tagName.toLowerCase(), element: cur };
      if (cur.tagName === 'BLOCKQUOTE') return { style: 'quote', element: cur };
    }
    return { style: 'normal', element: null };
  }

  /** What the menu shows: h1/h2 as the big heading, h3–h6 as the small one. */
  function menuValueFor(style) {
    if (style === 'quote') return 'quote';
    if (/^h[12]$/.test(style)) return 'h2';
    if (/^h[3-6]$/.test(style)) return 'h3';
    return 'normal';
  }

  function syncBlockStyleMenu() {
    const menu = document.getElementById('notes-block-style');
    if (!menu || !editorEl) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorEl.contains(sel.anchorNode)) return;
    menu.value = menuValueFor(blockStyleAt(sel.anchorNode).style);
  }
  document.addEventListener('selectionchange', syncBlockStyleMenu);

  window.notesSetBlockStyle = function (value) {
    if (!editorEl) return;
    restoreSel();
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !editorEl.contains(sel.anchorNode)) { syncBlockStyleMenu(); return; }
    const at = blockStyleAt(sel.anchorNode);

    if (value === 'normal') {
      if (at.style === 'quote') {
        // Over the quote's whole content, so a quote of several lines goes as
        // one. A quote of text lines becomes one paragraph with formatBlock; a
        // quote of blocks (as pasted) ignores formatBlock and needs outdent.
        const holdsBlocks = Array.from(at.element.children)
          .some(c => window.TextMap && window.TextMap.BLOCK_TAGS.has(c.localName));
        const range = document.createRange();
        range.selectNodeContents(at.element);
        sel.removeAllRanges();
        sel.addRange(range);
        if (holdsBlocks) document.execCommand('outdent');
        else document.execCommand('formatBlock', false, '<p>');
      } else if (at.style !== 'normal') {
        // A heading: formatBlock is the only command that undoes it —
        // removeFormat and outdent leave it as it is.
        document.execCommand('formatBlock', false, '<p>');
      }
    } else if (value === 'h2' || value === 'h3') {
      document.execCommand('formatBlock', false, '<' + value + '>');
    } else if (value === 'quote') {
      document.execCommand('formatBlock', false, '<blockquote>');
    }
    markDirty();
    scheduleOutline();
    syncBlockStyleMenu();
  };

  // ========== CLOSING THE WINDOW ==========
  // The main process asks before it closes: it prevented the close, so the
  // answer decides whether the window goes. Saving with fire-and-forget IPC
  // from beforeunload was never a guarantee — the renderer can be gone before
  // the message is handled (K3d).
  try {
    if (window.electron && typeof window.electron.onAppFlushRequest === 'function') {
      window.electron.onAppFlushRequest(async () => {
        let ok = true;
        try { ok = await window.notesFlush(); } catch (e) { ok = false; }
        try { window.electron.appFlushDone(!!ok); } catch (e) { /* closing */ }
      });
    }
  } catch (e) { /* older preload: beforeunload is still the last resort */ }

  // Expose internals for Prompt 6
  window.NotesInternal = {
    getEditor: () => editorEl,
    getState: _s,
    markDirty,
    escHtml
  };
  window.notesMarkDirty = markDirty;
})();
