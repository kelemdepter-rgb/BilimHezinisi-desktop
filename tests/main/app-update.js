// ============================================================================
// 3.6.2 — «نەشرىنى يېڭىلاش»: the app finds a newer version and installs it.
//
// Where a copy came from decides how it is updated:
//   - the Microsoft Store copy (process.windowsStore) is updated by the Store
//     only — the check and the install go through Windows' own Store API
//     (a PowerShell child, which runs inside the app's package), and when a
//     silent install is not possible the Store's page for the app is opened;
//   - the installed copy (NSIS «Setup») and the portable copy follow what the
//     Store has PUBLISHED (the owner's rule): Microsoft's product catalog says
//     which version the Store serves; only if it is newer is the GitHub
//     release of that same version read, its file downloaded, checked against
//     the SHA-256 GitHub publishes for it, and only then started: the
//     installer silently over the old one, the new portable beside the old
//     one. The latest version on the computer downloads nothing;
//   - `npm run dev` downloads and checks, and never installs.
// Nothing is ever started that did not pass its checksum.
// ============================================================================

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

/** A GitHub "latest release" answer, as the API gives it (spaces become dots). */
function release(tag, files) {
  return {
    tag_name: tag,
    html_url: 'https://github.com/kelemdepter-rgb/BilimHezinisi-desktop/releases/tag/' + tag,
    assets: files.map(function (f) {
      return {
        name: f.name,
        size: f.bytes.length,
        digest: f.digest === undefined ? 'sha256:' + sha256(f.bytes) : f.digest,
        browser_download_url: 'https://github.com/kelemdepter-rgb/BilimHezinisi-desktop/releases/download/' + tag + '/' + f.name
      };
    })
  };
}

/** A fake transport: `routes[url]` is a function returning a Response. */
function fakeFetch(routes, log) {
  return async function (url, init) {
    log.push(url);
    const r = routes[url];
    if (!r) throw new Error('net::ERR_INTERNET_DISCONNECTED');
    return r(init);
  };
}

function jsonResponse(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status: status || 200, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) });
}

/** A download in several chunks, so the progress has steps. */
function fileResponse(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 4096) chunks.push(bytes.subarray(i, Math.min(bytes.length, i + 4096)));
  const stream = new ReadableStream({
    pull(controller) {
      const c = chunks.shift();
      if (c) controller.enqueue(c); else controller.close();
    }
  });
  return new Response(stream, { status: 200, headers: { 'content-length': String(bytes.length) } });
}

const CATALOG = 'https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=9N2T15L4DX86&market=US&languages=en-US';
const TAG = (v) => 'https://api.github.com/repos/kelemdepter-rgb/BilimHezinisi-desktop/releases/tags/v' + v;

/** Microsoft's catalog answer for the app, in its own shape (trimmed). */
function catalog(version) {
  const pkg = { PackageFullName: 'BilimHezinisi.BilimHezinisi_' + version + '.0_x64__mmvytst8m9mqm', PackageFormat: 'Appx' };
  return { Products: [{ ProductId: '9N2T15L4DX86', LocalizedProperties: [{ ProductTitle: 'بىلىم خەزىنىسى' }],
    DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [pkg] } } }, { Sku: { Properties: { Packages: [pkg] } } }] }] };
}

module.exports = function (suite, assert, ctx) {
  const mod = function () { return require(path.join(ctx.root, 'app-update.js')); };

  function setup(name, extra) {
    const dir = path.join(ctx.tmpDir, 'update-' + name);
    fs.mkdirSync(dir, { recursive: true });
    const setupBytes = crypto.randomBytes(20000);
    const portableBytes = crypto.randomBytes(15000);
    const files = [
      { name: 'Bilim.Hezinisi.Setup.3.6.2.exe', bytes: setupBytes },
      { name: 'BilimHezinisi-Portable-3.6.2.exe', bytes: portableBytes }
    ];
    const rel = release('v3.6.2', files);
    const log = [];
    const routes = {};
    routes[CATALOG] = () => jsonResponse(catalog((extra && extra.storeVersion) || '3.6.2'));
    routes[TAG('3.6.2')] = () => jsonResponse(rel);
    rel.assets.forEach(function (a, i) { routes[a.browser_download_url] = () => fileResponse(files[i].bytes); });
    const calls = { spawn: [], quit: 0, open: [], beforeQuit: 0, order: [] };
    const o = Object.assign({
      fetch: fakeFetch(routes, log),
      userAgent: 'BilimHezinisi-Desktop/test',
      currentVersion: '3.6.1',
      channel: 'installer',
      tmpDir: dir,
      portableDir: path.join(dir, 'portable'),
      downloadsDir: path.join(dir, 'downloads'),
      retryDelays: [1, 1],
      sleep: () => Promise.resolve(),
      spawn: (file, args) => { calls.order.push('spawn'); calls.spawn.push({ file: file, args: args, exists: fs.existsSync(file) }); },
      beforeQuit: () => { calls.order.push('flush'); calls.beforeQuit++; return Promise.resolve(true); },
      quit: () => { calls.order.push('quit'); calls.quit++; },
      openExternal: (url) => { calls.open.push(url); return Promise.resolve(); }
    }, extra || {});
    delete o.storeVersion;
    fs.mkdirSync(o.portableDir, { recursive: true });
    return { dir: dir, files: files, rel: rel, routes: routes, log: log, calls: calls, o: o };
  }

  suite.test('update-version-compare', function () {
    const m = mod();
    assert.equal(m.compareVersions('3.6.2', '3.6.1'), 1);
    assert.equal(m.compareVersions('v3.6.1', '3.6.1'), 0);
    assert.equal(m.compareVersions('3.6.10', '3.6.9'), 1, '3.6.10 is newer than 3.6.9');
    assert.equal(m.compareVersions('3.7', '3.6.9'), 1);
    assert.equal(m.compareVersions('3.6.1', '3.6.2'), -1);
    assert.equal(m.compareVersions('3.6.1.0', '3.6.1'), 0, 'the Store\'s four-part number equals the three-part one');
    assert.equal(m.compareVersions('', '3.6.1'), -1, 'no number is never newer');
  });

  suite.test('update-channel-and-asset', function () {
    const m = mod();
    assert.equal(m.channelOf({ isPackaged: true, windowsStore: true }), 'store');
    assert.equal(m.channelOf({ isPackaged: true, windowsStore: false, portableFile: 'D:\\x\\BilimHezinisi-Portable-3.6.1.exe' }), 'portable');
    assert.equal(m.channelOf({ isPackaged: true, windowsStore: false }), 'installer');
    assert.equal(m.channelOf({ isPackaged: false, windowsStore: false }), 'dev');
    const s = setup('channel');
    assert.equal(m.assetFor(s.rel, 'installer').name, 'Bilim.Hezinisi.Setup.3.6.2.exe');
    assert.equal(m.assetFor(s.rel, 'dev').name, 'Bilim.Hezinisi.Setup.3.6.2.exe', 'the dev copy checks the installer');
    assert.equal(m.assetFor(s.rel, 'portable').name, 'BilimHezinisi-Portable-3.6.2.exe');
    assert.equal(m.assetFor(s.rel, 'store'), null, 'the Store copy never takes a file from GitHub');
    assert.equal(m.assetFor({ assets: [{ name: 'Bilim.Hezinisi.Setup.3.6.2.exe.blockmap' }] }, 'installer'), null, 'a blockmap is not the installer');
  });

  suite.test('update-store-catalog-version', function () {
    const m = mod();
    assert.equal(m.storeVersionFromCatalog(catalog('3.6.0')), '3.6.0');
    const two = catalog('3.6.0');
    two.Products[0].DisplaySkuAvailabilities[1].Sku.Properties.Packages[0].PackageFullName = 'BilimHezinisi.BilimHezinisi_3.6.10.0_x64__mmvytst8m9mqm';
    assert.equal(m.storeVersionFromCatalog(two), '3.6.10', 'not the highest package');
    assert.equal(m.storeVersionFromCatalog({ Products: [] }), null);
    assert.equal(m.storeVersionFromCatalog({ Products: [{ DisplaySkuAvailabilities: [{ Sku: { Properties: { Packages: [{ PackageFullName: 'Other.App_9.9.9.0_x64__abc' }] } } }] }] }), null, 'another app\'s package was taken');
  });

  suite.test('update-check-follows-the-store', async function () {
    const m = mod();
    // The Store publishes 3.6.2; this copy is 3.6.1: the 3.6.2 release's file.
    let s = setup('check');
    let u = m.createUpdater(s.o);
    const r = await u.check({ manual: true });
    assert.equal(r.available, true, 'a version the Store publishes was not seen: ' + JSON.stringify(r));
    assert.equal(r.version, '3.6.2');
    assert.equal(r.current, '3.6.1');
    assert.equal(r.channel, 'installer');
    assert.equal(r.asset.name, 'Bilim.Hezinisi.Setup.3.6.2.exe');
    assert.deepEqual(s.log, [CATALOG, TAG('3.6.2')], 'the Store was not asked first, or the release asked was not the Store\'s version');

    // The latest version on this computer: nothing to download, GitHub not asked.
    s = setup('check-same', { currentVersion: '3.6.2' });
    u = m.createUpdater(s.o);
    const same = await u.check({ manual: true });
    assert.equal(same.available, false, 'the latest version was offered again');
    assert.deepEqual(s.log, [CATALOG], 'GitHub was asked although the Store has nothing newer');

    // GitHub already has a newer release, the Store not yet: nothing.
    s = setup('check-github-ahead', { currentVersion: '3.6.2', storeVersion: '3.6.2' });
    s.routes[TAG('3.6.3')] = () => jsonResponse(release('v3.6.3', s.files));
    u = m.createUpdater(s.o);
    assert.equal((await u.check({ manual: true })).available, false, 'a version the Store has not published was offered');
    assert.ok(s.log.indexOf(TAG('3.6.3')) === -1, 'GitHub\'s newer release was even looked at');

    // Published in the Store, its release not on GitHub (yet): nothing to install.
    s = setup('check-no-release', { storeVersion: '3.6.3' });
    s.routes[TAG('3.6.3')] = () => jsonResponse({ message: 'Not Found' }, 404);
    u = m.createUpdater(s.o);
    const waiting = await u.check({ manual: true });
    assert.equal(waiting.available, false);
    assert.equal(waiting.waiting, true);
    assert.equal(waiting.version, '3.6.3');

    // Automatic checks are spaced (half an hour); one asked for is not.
    s = setup('check-throttle', { currentVersion: '3.6.2' });
    u = m.createUpdater(s.o);
    await u.check({ manual: false });
    await u.check({ manual: false });
    assert.equal(s.log.length, 1, 'a second automatic check within half an hour went online');
    await u.check({ manual: true });
    assert.equal(s.log.length, 2, 'a check the owner asked for did not go online');

    // Offline: tried three times, then said in Uyghur.
    s = setup('check-offline');
    delete s.routes[CATALOG];
    u = m.createUpdater(s.o);
    let err = null;
    try { await u.check({ manual: true }); } catch (e) { err = e; }
    assert.ok(err, 'an offline check did not fail');
    assert.equal(err.code, 'offline');
    assert.includes(err.message, 'تور', 'the offline message is not the Uyghur one: ' + err.message);
    assert.equal(s.log.length, 3, 'the check was not tried three times');

    // The catalog without the app's package: said, nothing offered.
    s = setup('check-catalog-empty');
    s.routes[CATALOG] = () => jsonResponse({ Products: [] });
    u = m.createUpdater(s.o);
    err = null;
    try { await u.check({ manual: true }); } catch (e) { err = e; }
    assert.ok(err && err.code === 'catalog', 'an empty catalog answer was not said');

    // GitHub's hourly limit: said, not retried.
    s = setup('check-limit');
    s.routes[TAG('3.6.2')] = () => jsonResponse({ message: 'API rate limit exceeded' }, 403, { 'x-ratelimit-remaining': '0' });
    u = m.createUpdater(s.o);
    err = null;
    try { await u.check({ manual: true }); } catch (e) { err = e; }
    assert.ok(err && err.code === 'refused', 'a 403 was not refused: ' + (err && err.code));
    assert.equal(s.log.filter(function (x) { return x === TAG('3.6.2'); }).length, 1, 'a 403 was retried');
  });

  suite.test('update-install-checks-before-it-starts', async function () {
    const m = mod();
    let s = setup('install');
    let u = m.createUpdater(s.o);
    const info = await u.check({ manual: true });
    const progress = [];
    const done = await u.install(info, { onProgress: function (p) { progress.push(p); } });
    assert.equal(done.installing, true, JSON.stringify(done));
    const file = path.join(s.dir, 'Bilim.Hezinisi.Setup.3.6.2.exe');
    assert.ok(fs.existsSync(file), 'the installer was not kept where it was started from');
    assert.equal(sha256(fs.readFileSync(file)), sha256(s.files[0].bytes), 'the file on disk is not the one published');
    assert.equal(s.calls.spawn.length, 1);
    assert.equal(s.calls.spawn[0].file, file);
    assert.deepEqual(s.calls.spawn[0].args, ['/S', '--updated', '--force-run'], 'the installer is not run silently over the old one');
    assert.deepEqual(s.calls.order, ['flush', 'spawn', 'quit'], 'the notebook was not saved before the installer started, or the app did not quit');
    assert.ok(progress.length >= 3, 'the download said nothing as it went');
    assert.equal(progress[progress.length - 1].received, s.files[0].bytes.length);
    for (let i = 1; i < progress.length; i++) assert.ok(progress[i].received >= progress[i - 1].received, 'the progress went backwards');

    // A file that is not the one published is never started, and not kept.
    s = setup('install-bad');
    s.rel.assets[0].digest = 'sha256:' + sha256(Buffer.from('something else'));
    u = m.createUpdater(s.o);
    let err = null;
    try { await u.install(await u.check({ manual: true })); } catch (e) { err = e; }
    assert.ok(err && err.code === 'digest', 'a wrong checksum was not refused: ' + (err && err.message));
    assert.equal(s.calls.spawn.length, 0, 'a file that failed its checksum was started');
    assert.equal(s.calls.quit, 0);
    assert.ok(!fs.existsSync(path.join(s.dir, 'Bilim.Hezinisi.Setup.3.6.2.exe')) && !fs.existsSync(path.join(s.dir, 'Bilim.Hezinisi.Setup.3.6.2.exe.part')), 'the bad file was left behind');

    // No checksum published: refused as well.
    s = setup('install-nodigest');
    s.rel.assets[0].digest = null;
    u = m.createUpdater(s.o);
    err = null;
    try { await u.install(await u.check({ manual: true })); } catch (e) { err = e; }
    assert.ok(err && err.code === 'digest', 'a file without a checksum was not refused');
    assert.equal(s.calls.spawn.length, 0);

    // A file from anywhere but this repository's releases is never taken.
    s = setup('install-elsewhere');
    s.rel.assets[0].browser_download_url = 'https://example.com/Bilim.Hezinisi.Setup.3.6.2.exe';
    s.routes['https://example.com/Bilim.Hezinisi.Setup.3.6.2.exe'] = () => fileResponse(s.files[0].bytes);
    u = m.createUpdater(s.o);
    err = null;
    try { await u.install(await u.check({ manual: true })); } catch (e) { err = e; }
    assert.ok(err && err.code === 'no-asset', 'a file from another host was taken');
    assert.equal(s.calls.spawn.length, 0);
    assert.ok(s.log.indexOf('https://example.com/Bilim.Hezinisi.Setup.3.6.2.exe') === -1, 'the other host was even contacted');

    // The notebook could not be saved: nothing is started, the app stays.
    s = setup('install-noflush', { beforeQuit: () => Promise.resolve(false) });
    u = m.createUpdater(s.o);
    err = null;
    try { await u.install(await u.check({ manual: true })); } catch (e) { err = e; }
    assert.ok(err && err.code === 'flush', 'an unsaved note did not stop the update');
    assert.equal(s.calls.spawn.length, 0);
    assert.equal(s.calls.quit, 0);
  });

  suite.test('update-install-portable-and-dev', async function () {
    const m = mod();
    let s = setup('portable', { channel: 'portable' });
    let u = m.createUpdater(s.o);
    await u.check({ manual: false });
    // main.js passes nothing: install takes what the last check found.
    const done = await u.install(null);
    const file = path.join(s.o.portableDir, 'BilimHezinisi-Portable-3.6.2.exe');
    assert.equal(done.installing, true);
    assert.ok(fs.existsSync(file), 'the new portable is not beside the old one');
    assert.equal(sha256(fs.readFileSync(file)), sha256(s.files[1].bytes));
    assert.deepEqual(s.calls.spawn.map(function (c) { return [c.file, c.args.length]; }), [[file, 0]], 'the new portable was not started');
    assert.deepEqual(s.calls.order, ['flush', 'spawn', 'quit']);

    // npm run dev: downloaded and checked, never installed.
    s = setup('dev', { channel: 'dev' });
    u = m.createUpdater(s.o);
    const dev = await u.install(await u.check({ manual: true }));
    assert.equal(dev.dev, true, JSON.stringify(dev));
    assert.equal(s.calls.spawn.length, 0, 'the dev copy started an installer');
    assert.equal(s.calls.quit, 0);
    assert.ok(!fs.existsSync(path.join(s.dir, 'Bilim.Hezinisi.Setup.3.6.2.exe')), 'the dev copy left the download behind');
  });

  suite.test('update-store-channel', async function () {
    const m = mod();
    const answers = { check: { ok: true, count: 1, version: '3.6.3' }, install: { ok: true, count: 1, state: 'Completed' } };
    const asked = [];
    const s = setup('store', { channel: 'store', store: async function (action) { asked.push(action); return answers[action]; } });
    let u = m.createUpdater(s.o);
    const info = await u.check({ manual: true });
    assert.equal(info.available, true);
    assert.equal(info.version, '3.6.3');
    assert.equal(s.log.length, 0, 'the Store copy asked GitHub');
    assert.equal((await u.install(info)).done, true);
    assert.deepEqual(asked, ['check', 'install']);
    assert.equal(s.calls.beforeQuit, 1, 'the notebook was not saved before the Store installed');

    // The Store cannot install it silently: its page for the app is opened.
    answers.install = { ok: true, count: 1, state: 'needs-store' };
    u = m.createUpdater(s.o);
    const opened = await u.install(await u.check({ manual: true }));
    assert.equal(opened.openedStore, true);
    assert.deepEqual(s.calls.open, ['ms-windows-store://pdp/?ProductId=9N2T15L4DX86']);

    // No update in the Store; and the Store's own error, said.
    answers.check = { ok: true, count: 0 };
    assert.equal((await m.createUpdater(s.o).check({ manual: true })).available, false);
    answers.check = { ok: false, error: 'This operation requires a packaged app' };
    let err = null;
    try { await m.createUpdater(s.o).check({ manual: true }); } catch (e) { err = e; }
    assert.ok(err && err.code === 'store', 'a Store error was not reported');
  });

  // The PowerShell half, on this machine: it parses, and outside a package it
  // answers with an error at once instead of hanging.
  suite.test('update-store-script-answers', async function () {
    if (process.platform !== 'win32') return;
    const m = mod();
    const dir = path.join(ctx.tmpDir, 'update-ps');
    fs.mkdirSync(dir, { recursive: true });
    assert.ok(/^[\x09\x0a\x0d\x20-\x7e]*$/.test(m.STORE_SCRIPT), 'the PowerShell script is not plain ASCII (Windows PowerShell reads a file without BOM as ANSI)');
    const run = m.createStoreRunner({ spawn: require('child_process').spawn, tmpDir: dir, timeoutMs: 60000 });
    const started = Date.now();
    const r = await run('check');
    assert.ok(r && typeof r.ok === 'boolean', 'the script did not answer with one JSON line: ' + JSON.stringify(r));
    assert.equal(r.ok, false, 'outside the Store\'s package the check cannot succeed: ' + JSON.stringify(r));
    assert.ok(r.error, 'the failure has no reason');
    assert.ok(Date.now() - started < 60000);
  });

  suite.test('update-wired', function () {
    const main = fs.readFileSync(path.join(ctx.root, 'main.js'), 'utf8');
    assert.ok(/ipcMain\.handle\('update-check'/.test(main), 'there is no update-check');
    assert.ok(/ipcMain\.handle\('update-install'/.test(main), 'there is no update-install');
    assert.ok(/process\.windowsStore/.test(main), 'the Store copy is not told apart');
    assert.ok(/update_auto_check/.test(main), 'the automatic check has no setting');
    const preload = fs.readFileSync(path.join(ctx.root, 'preload.js'), 'utf8');
    ['updateCheck:', 'updateInstall:', 'onUpdateProgress:'].forEach(function (k) { assert.includes(preload, k, 'preload has no ' + k); });
    const pkg = JSON.parse(fs.readFileSync(path.join(ctx.root, 'package.json'), 'utf8'));
    assert.ok(pkg.build.files.indexOf('app-update.js') !== -1, 'app-update.js is not in build.files');
    const html = fs.readFileSync(path.join(ctx.root, 'src', 'index.html'), 'utf8');
    const upd = html.indexOf('id="updBtn"');
    const settings = html.indexOf('onclick="showSettings()" style="-webkit-app-region:no-drag" title="تەڭشەكلەر"');
    assert.ok(upd > 0 && settings > upd && settings - upd < 600, 'the update button is not beside the settings button');
    const button = html.slice(upd, html.indexOf('</button>', upd) + '</button>'.length);
    assert.includes(button, '>نەشرىنى يېڭىلاش<', 'the button does not say «نەشرىنى يېڭىلاش» in words');
    assert.excludes(button, '<svg', 'the button is still a picture');
    assert.includes(html, '<script src="update-ui.js"></script>');
  });
};
