// ============================================================================
// K18 — where the app's window may go.
//
// setWindowOpenHandler handed ANY url to shell.openExternal — file:, a custom
// scheme, whatever a page or a pasted note contained — and nothing stopped the
// main window itself from navigating away from the app. The policy is two small
// functions in navigation.js; main.js only calls them.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function (suite, assert, ctx) {
  const nav = function () { return require(path.join(ctx.root, 'navigation.js')); };

  suite.test('external-links-http-only', function () {
    const ok = [
      'https://tanzil.net',
      'https://quranenc.com/en/browse/uyghur_saleh',
      'https://ai.google.dev/pricing',
      'http://example.com/a?b=1#c'
    ];
    ok.forEach(function (url) {
      assert.ok(nav().externalUrl(url), 'a real web link was refused: ' + url);
    });

    const refused = [
      'javascript:alert(1)',
      'file:///C:/Windows/System32/calc.exe',
      'data:text/html,<script>alert(1)</script>',
      'bh://book/5?o=120',
      'ms-settings:privacy',
      '\\\\server\\share\\x.exe',
      'not a url at all',
      '',
      null
    ];
    refused.forEach(function (url) {
      assert.equal(nav().externalUrl(url), null, 'handed to the system: ' + url);
    });
  });

  suite.test('navigation-app-page-only', function () {
    const index = path.join(ctx.root, 'src', 'index.html');
    const own = require('url').pathToFileURL(index).href;
    assert.ok(nav().isAppPage(own, index), 'the app\'s own page was refused');
    assert.ok(nav().isAppPage(own + '#reader', index), 'the app\'s own page with a hash was refused');
    assert.ok(!nav().isAppPage(require('url').pathToFileURL(path.join(ctx.root, 'src', 'other.html')).href, index),
      'another local page was allowed');
    assert.ok(!nav().isAppPage('https://example.com/', index), 'a web page was allowed');
    assert.ok(!nav().isAppPage('file:///C:/Users/Public/evil.html', index), 'a file elsewhere was allowed');
  });

  // main.js cannot be loaded by a test (it opens the window on require), so
  // this reads it: the policy is wired where it has to be.
  suite.test('window-hardening-wired', function () {
    const main = fs.readFileSync(path.join(ctx.root, 'main.js'), 'utf8');
    assert.ok(/on\(\s*'will-navigate'/.test(main), 'nothing stops the window navigating away from the app');
    const handler = main.slice(main.indexOf('setWindowOpenHandler'));
    assert.ok(main.indexOf('setWindowOpenHandler') >= 0, 'setWindowOpenHandler is gone');
    assert.ok(/externalUrl\(/.test(handler.slice(0, 600)),
      'setWindowOpenHandler opens addresses without checking them');

    const pdf = main.slice(main.indexOf("ipcMain.handle('export-as-pdf'"));
    const body = pdf.slice(0, pdf.indexOf('\nipcMain.handle(', 10));
    assert.ok(/finally\s*\{[\s\S]*pdfWin[\s\S]*destroy\(\)/.test(body),
      'export-as-pdf leaves its hidden window open when printing fails');
  });

  suite.test('no-unused-sqljs', function () {
    const pkg = JSON.parse(fs.readFileSync(path.join(ctx.root, 'package.json'), 'utf8'));
    assert.ok(!(pkg.dependencies && pkg.dependencies['sql.js']),
      'sql.js is still a dependency — nothing uses it, and it ships in the installer');
  });
};
