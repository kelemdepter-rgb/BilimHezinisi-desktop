// ============================================================================
// 3.6.2 — «نەشرىنى يېڭىلاش» in the window (src/update-ui.js).
//
// The header button beside «تەڭشەكلەر»; when a newer version is found — at
// start, when the computer comes online, every six hours — a notice «يېڭى
// نەشرى بار، نەشرىنى يېڭىلاڭ» with the button's action and a dot on the
// button; a click shows «نەشرى يېڭىلىنىۋاتىدۇ، توردىن ئۈزۈۋەتمەڭ...» and
// installs. Main is faked here; app-update.js has its own suite.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  function fixture(answers) {
    const box = document.createElement('div');
    box.innerHTML =
      '<button id="t-updBtn" title="نەشرىنى يېڭىلاش"><span class="upd-dot"></span></button>' +
      '<div id="t-updov"><div id="t-updMsg"></div><div id="t-updDetail"></div>' +
      '<div><div id="t-updBar" style="width:0"></div></div><button id="t-updClose" style="display:none"></button></div>';
    document.body.appendChild(box);
    const calls = { check: [], install: 0, toasts: [] };
    let progress = null;
    const listeners = {};
    const api = {
      check: function (opts) { calls.check.push(!!(opts && opts.manual)); return Promise.resolve(answers.check(opts)); },
      install: function () {
        calls.install++;
        if (progress) { progress({ received: 25 * 1048576, total: 100 * 1048576 }); progress({ received: 50 * 1048576, total: 100 * 1048576 }); }
        return Promise.resolve(answers.install());
      },
      onProgress: function (cb) { progress = cb; return function () { progress = null; }; }
    };
    const win = {
      online: true,
      addEventListener: function (name, fn) { listeners[name] = fn; },
      fire: function (name) { if (listeners[name]) listeners[name](); }
    };
    const ui = window.UpdateUi.create({
      api: api,
      toast: function (msg, type, opts) { calls.toasts.push({ msg: msg, type: type, action: opts && opts.action }); },
      els: {
        button: box.querySelector('#t-updBtn'), overlay: box.querySelector('#t-updov'), message: box.querySelector('#t-updMsg'),
        detail: box.querySelector('#t-updDetail'), bar: box.querySelector('#t-updBar'), close: box.querySelector('#t-updClose')
      },
      online: function () { return win.online; },
      win: win,
      setTimeout: function () { return 0; },
      setInterval: function () { return 0; }
    });
    return { box: box, ui: ui, calls: calls, win: win, els: ui.els };
  }

  const AVAILABLE = { success: true, available: true, version: '3.6.3', current: '3.6.2', channel: 'installer' };
  const LATEST = { success: true, available: false, version: '3.6.2', current: '3.6.2', channel: 'installer' };

  test('update-ui-notice-and-badge', async function (t) {
    t.assert.ok(window.UpdateUi && typeof window.UpdateUi.create === 'function', 'src/update-ui.js is not loaded');
    const f = fixture({ check: function () { return AVAILABLE; }, install: function () { return { success: true, installing: true }; } });
    try {
      await f.ui.check(false);
      t.assert.equal(f.calls.toasts.length, 1, 'no notice for a newer version');
      t.assert.equal(f.calls.toasts[0].msg, 'يېڭى نەشرى بار (3.6.3)، نەشرىنى يېڭىلاڭ');
      t.assert.equal(f.calls.toasts[0].action && f.calls.toasts[0].action.label, 'نەشرىنى يېڭىلاش', 'the notice has no update action');
      t.assert.ok(f.els.button.classList.contains('has-update'), 'the button does not show that a version is waiting');
      t.assert.includes(f.els.button.title, '3.6.3');
      await f.ui.check(false);
      t.assert.equal(f.calls.toasts.length, 1, 'the same version was announced twice');

      // Offline: the automatic check does not even ask.
      f.win.online = false;
      const asked = f.calls.check.length;
      await f.ui.check(false);
      t.assert.equal(f.calls.check.length, asked, 'an automatic check ran while offline');

      // Coming online checks.
      f.win.online = true;
      f.ui.init();
      const before = f.calls.check.length;
      f.win.fire('online');
      await new Promise(function (r) { setTimeout(r, 0); });
      t.assert.equal(f.calls.check.length, before + 1, 'coming online did not check');
      t.assert.equal(f.calls.check[f.calls.check.length - 1], false, 'the online check was not an automatic one');
    } finally { f.box.remove(); }
  });

  test('update-ui-click-installs', async function (t) {
    t.assert.ok(window.UpdateUi, 'src/update-ui.js is not loaded');
    let release;
    const f = fixture({
      check: function () { return AVAILABLE; },
      install: function () { return { success: true, installing: true }; }
    });
    try {
      await f.ui.check(false);
      const done = f.ui.click();
      t.assert.ok(f.els.overlay.classList.contains('on'), 'the update window did not open');
      t.assert.equal(f.els.message.textContent, 'نەشرى يېڭىلىنىۋاتىدۇ، توردىن ئۈزۈۋەتمەڭ...');
      t.assert.equal(f.els.close.style.display, 'none', 'the window can be closed while it updates');
      await done;
      t.assert.equal(f.calls.install, 1);
      t.assert.equal(f.els.bar.style.width, '50%', 'the download progress is not shown');
      t.assert.includes(f.els.detail.textContent, 'دېتال', 'the owner is not told the app will close and open again');
    } finally { f.box.remove(); }
  });

  test('update-ui-click-when-latest', async function (t) {
    t.assert.ok(window.UpdateUi, 'src/update-ui.js is not loaded');
    const f = fixture({ check: function () { return LATEST; }, install: function () { return { success: true }; } });
    try {
      await f.ui.click();
      t.assert.deepEqual(f.calls.check, [true], 'a click did not check at once');
      t.assert.equal(f.calls.install, 0, 'a click installed with nothing newer');
      const last = f.calls.toasts[f.calls.toasts.length - 1];
      t.assert.equal(last.msg, 'سىز ئىشلىتىۋاتقىنى ئەڭ يېڭى نەشرى', 'the latest version is not said in the owner\'s words');

      // A click that finds a newer version goes straight on to install it.
      const g = fixture({ check: function () { return AVAILABLE; }, install: function () { return { success: true, installing: true }; } });
      try {
        await g.ui.click();
        t.assert.equal(g.calls.install, 1, 'a click that found a newer version did not install it');
      } finally { g.box.remove(); }

      // Published in the Store, its file not ready for this copy: said, not "latest".
      const w = fixture({ check: function () { return { success: true, available: false, waiting: true, version: '3.6.3', current: '3.6.2', channel: 'installer' }; }, install: function () { return { success: true }; } });
      try {
        await w.ui.click();
        t.assert.equal(w.calls.install, 0);
        const said = w.calls.toasts[w.calls.toasts.length - 1].msg;
        t.assert.includes(said, '3.6.3', 'the Store\'s version is not named');
        t.assert.excludes(said, 'ئەڭ يېڭى نەشرى', 'an older copy was told it is the latest');
      } finally { w.box.remove(); }

      // Offline: said at once.
      f.win.online = false;
      await f.ui.click();
      t.assert.equal(f.calls.check.length, 1, 'a click checked while offline');
      t.assert.includes(f.calls.toasts[f.calls.toasts.length - 1].msg, 'تور');
    } finally { f.box.remove(); }
  });

  test('update-ui-says-what-happened', async function (t) {
    t.assert.ok(window.UpdateUi, 'src/update-ui.js is not loaded');
    let next = { success: false, error: 'چۈشۈرۈلگەن ھۆججەت تەكشۈرۈشتىن ئۆتمىدى؛ قاچىلانمىدى. قايتا سىناڭ.' };
    const f = fixture({ check: function () { return AVAILABLE; }, install: function () { return next; } });
    try {
      await f.ui.check(false);
      await f.ui.click();
      t.assert.equal(f.els.message.textContent, next.error, 'the failure is not said');
      t.assert.equal(f.els.close.style.display, '', 'the window cannot be closed after a failure');
      f.els.close.click();
      t.assert.ok(!f.els.overlay.classList.contains('on'), 'closing did not close it');

      next = { success: true, openedStore: true };
      await f.ui.click();
      t.assert.equal(f.els.message.textContent, 'Microsoft Store ئېچىلدى — ئۇ يەردە «يېڭىلاش» نى بېسىڭ.');

      next = { success: true, dev: true, message: 'سىناق نۇسخىسى (npm run dev): يېڭى نەشر چۈشۈرۈلدى ۋە تەكشۈرۈلدى، قاچىلانمىدى.' };
      await f.ui.click();
      t.assert.equal(f.els.message.textContent, next.message);
      t.assert.equal(f.els.close.style.display, '');
    } finally { f.box.remove(); }
  });
})();
