// ============================================================================
// «نەشرىنى يېڭىلاش» in the window (3.6.2).
//
// The header button beside «تەڭشەكلەر». A newer version found — at start,
// when the computer comes online, every six hours (main spaces them and
// honours the Settings switch) — is announced once: «يېڭى نەشرى بار (3.6.3)،
// نەشرىنى يېڭىلاڭ», with the update as the notice's action, and a dot on the
// button. A click shows «نەشرى يېڭىلىنىۋاتىدۇ، توردىن ئۈزۈۋەتمەڭ...» with the
// download's progress, and installs; with nothing known yet it checks first,
// and goes on if it finds one. How each copy is installed is main's
// (app-update.js); this module only asks and says what happened.
//
// Loaded as a <script> by index.html (window.UpdateUi) and by the notebook
// test page.
// ============================================================================

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.UpdateUi = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SAY = {
    available: (v) => 'يېڭى نەشرى بار (' + v + ')، نەشرىنى يېڭىلاڭ',
    action: 'نەشرىنى يېڭىلاش',
    title: 'نەشرىنى يېڭىلاش',
    titleAvailable: (v) => 'يېڭى نەشرى بار (' + v + ') — نەشرىنى يېڭىلاش',
    checking: 'يېڭى نەشر تەكشۈرۈلۈۋاتىدۇ…',
    latest: (v) => 'سىزدە ئەڭ يېڭى نەشرى بار (' + v + ')',
    offline: 'تورغا ئۇلانمىغان — تورغا ئۇلىنىپ قايتا سىناڭ.',
    failed: 'يېڭى نەشرنى تەكشۈرگىلى بولمىدى.',
    updating: 'نەشرى يېڭىلىنىۋاتىدۇ، توردىن ئۈزۈۋەتمەڭ...',
    downloading: (pct, done, total) => 'چۈشۈرۈلۈۋاتىدۇ: ' + pct + '%' + (total ? ' (' + done + ' / ' + total + ' MB)' : ''),
    installing: 'قاچىلىنىۋاتىدۇ — دېتال تاقىلىپ، يېڭى نەشرى ئۆزلۈكىدىن ئېچىلىدۇ.',
    storeDone: 'Microsoft Store يېڭىلىدى — دېتال تاقىلىدۇ؛ ئاندىن قايتا ئېچىڭ.',
    openedStore: 'Microsoft Store ئېچىلدى — ئۇ يەردە «يېڭىلاش» نى بېسىڭ.'
  };

  const FIRST_CHECK_MS = 8000;
  const EVERY_MS = 6 * 60 * 60 * 1000;

  /**
   * @param {object} o
   *   api: { check(opts) → Promise, install() → Promise, onProgress(cb) → unsubscribe }
   *   toast(msg, type, opts)
   *   els: { button, overlay, message, detail, bar, close }
   *   online() → boolean, win (addEventListener), setTimeout, setInterval
   */
  function create(o) {
    const els = o.els;
    const st = { info: null, busy: false, notified: '' };
    const online = typeof o.online === 'function' ? o.online : () => true;

    function mark(info) {
      const has = !!(info && info.available);
      els.button.classList.toggle('has-update', has);
      els.button.title = has ? SAY.titleAvailable(info.version) : SAY.title;
    }

    function show(on) {
      els.overlay.classList.toggle('on', !!on);
    }

    function canClose(yes) {
      els.close.style.display = yes ? '' : 'none';
    }

    /** Ask main. `quiet`: no notice (a click goes straight on). */
    async function check(manual, quiet) {
      if (!manual && !online()) return null;
      let r;
      try { r = await o.api.check({ manual: !!manual }); } catch (e) { r = { success: false, error: (e && e.message) || '' }; }
      if (!r || !r.success) {
        if (manual) o.toast((r && r.error) || SAY.failed, 'e');
        return r;
      }
      if (r.skipped) return r;
      st.info = r;
      mark(r);
      if (r.available && !quiet && st.notified !== r.version) {
        st.notified = r.version;
        o.toast(SAY.available(r.version), 'i', { action: { label: SAY.action, run: () => { start(); } }, ms: 20000 });
      }
      return r;
    }

    /** Install what main found, saying each step. */
    async function start() {
      if (st.busy) { show(true); return null; }
      st.busy = true;
      els.message.textContent = SAY.updating;
      els.detail.textContent = '';
      els.bar.style.width = '0';
      canClose(false);
      show(true);
      const unsubscribe = o.api.onProgress((p) => {
        if (!p || !p.total) return;
        const pct = Math.max(0, Math.min(100, Math.round((p.received / p.total) * 100)));
        els.bar.style.width = pct + '%';
        els.detail.textContent = SAY.downloading(pct, Math.round(p.received / 1048576), Math.round(p.total / 1048576));
      });
      let r;
      try { r = await o.api.install(); } catch (e) { r = { success: false, error: (e && e.message) || '' }; }
      try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (_) { /* gone */ }
      if (!r || !r.success) {
        els.message.textContent = (r && r.error) || SAY.failed;
        st.busy = false;
        canClose(true);
        return r;
      }
      if (r.installing) {
        els.detail.textContent = SAY.installing;           // the app quits now
      } else if (r.done) {
        els.detail.textContent = SAY.storeDone;            // Windows closes the app
      } else {
        els.message.textContent = r.openedStore ? SAY.openedStore : (r.message || SAY.latest(''));
        st.busy = false;
        canClose(true);
      }
      return r;
    }

    /** The header button. */
    async function click() {
      if (st.busy) { show(true); return null; }
      if (st.info && st.info.available) return start();
      if (!online()) { o.toast(SAY.offline, 'e'); return null; }
      o.toast(SAY.checking, 'i');
      const r = await check(true, true);
      if (!r || !r.success || r.skipped) return r;
      if (r.available) {
        st.notified = r.version;
        return start();
      }
      o.toast(SAY.latest(r.current || r.version || ''), 's');
      return r;
    }

    /** Check at start, when the computer comes online, and every six hours. */
    function init() {
      const later = o.setTimeout || setTimeout;
      const every = o.setInterval || setInterval;
      later(() => { check(false); }, FIRST_CHECK_MS);
      every(() => { check(false); }, EVERY_MS);
      if (o.win && o.win.addEventListener) o.win.addEventListener('online', () => { check(false); });
    }

    els.close.addEventListener('click', () => { if (!st.busy) show(false); });

    return { check: check, click: click, start: start, init: init, els: els, state: () => st };
  }

  return { create: create, SAY: SAY };
});
