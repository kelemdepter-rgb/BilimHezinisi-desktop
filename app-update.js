// ============================================================================
// «نەشرىنى يېڭىلاش» — finding a newer version and installing it (3.6.2).
//
// Where a copy came from decides how it is updated:
//
//   store      The Microsoft Store copy (Electron's process.windowsStore). The
//              Store alone updates it — Store policy, and the only way an MSIX
//              package can be replaced. The check and the install go through
//              Windows' own Store API (Windows.Services.Store.StoreContext),
//              called by a PowerShell child: a process the packaged app starts
//              runs inside its package, so the Store knows which app asks.
//              When the Store cannot install silently, its page for the app is
//              opened, where «Update» is one click.
//   installer  The copy installed by «Bilim Hezinisi Setup» (NSIS, per user).
//   portable   The portable .exe (electron-builder sets
//              PORTABLE_EXECUTABLE_FILE / _DIR).
//              The owner's rule (2026-11-17): a new version is one the
//              Microsoft Store has PUBLISHED — so these copies, too, ask the
//              Store first, through Microsoft's public product catalog
//              (displaycatalog.mp.microsoft.com, the package the Store serves
//              for 9N2T15L4DX86, «…_3.6.0.0_x64__…»). Only when that version
//              is newer than this copy is the GitHub release of the SAME
//              version read, its file downloaded, and started ONLY after its
//              size and its SHA-256 match what GitHub publishes for it: the
//              installer silently over the old copy («/S --updated
//              --force-run», the arguments electron-builder's own updater
//              uses), the new portable beside the old one. The notebook is
//              saved first, then the app quits.
//   dev        `npm run dev`: checks and downloads like the installer, and
//              never installs anything.
//
// The latest version on this computer: «سىز ئىشلىتىۋاتقىنى ئەڭ يېڭى نەشرى»,
// and nothing is downloaded.
//
// The network: displaycatalog.mp.microsoft.com (what the Store publishes),
// api.github.com (the release of that version) and github.com, which
// redirects a download to GitHub's file host — through Electron's net.fetch
// (main.js), so the system's certificates and proxy apply. The Store copy
// asks only the Store, through Windows. PRIVACY.md (3.4) says this.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const REPO = 'kelemdepter-rgb/BilimHezinisi-desktop';
const RELEASES_PAGE = 'https://github.com/' + REPO + '/releases/latest';
const DOWNLOAD_PREFIX = 'https://github.com/' + REPO + '/releases/download/';
const STORE_PRODUCT_ID = '9N2T15L4DX86';
const STORE_PAGE = 'ms-windows-store://pdp/?ProductId=' + STORE_PRODUCT_ID;
/** What the Store publishes for the app (Microsoft's public product catalog). */
const STORE_CATALOG_URL = 'https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=' + STORE_PRODUCT_ID + '&market=US&languages=en-US';
/** The GitHub release of one version. */
const releaseUrl = (version) => 'https://api.github.com/repos/' + REPO + '/releases/tags/v' + version;

/** Automatic checks at most this often; a check the owner asks for, always. */
const AUTO_CHECK_EVERY_MS = 30 * 60 * 1000;
const TIMEOUT_MS = 20000;
const RETRY_DELAYS = [1500, 4000];
/** A download that receives nothing for this long has stalled. */
const STALL_MS = 60000;

const SAY = {
  offline: 'تورغا ئۇلىنالمىدى — يېڭى نەشرنى تەكشۈرگىلى بولمىدى.',
  server: 'GitHub جاۋاب بەرمىدى — سەل تۇرۇپ قايتا سىناڭ.',
  refused: 'GitHub ھازىر جاۋاب بەرمەيدۇ — بىر سائەتتىن كېيىن قايتا سىناڭ.',
  noAsset: 'يېڭى نەشرنىڭ ھۆججىتى تېپىلمىدى — GitHub بېتىدىن چۈشۈرۈڭ.',
  digest: 'چۈشۈرۈلگەن ھۆججەت تەكشۈرۈشتىن ئۆتمىدى؛ قاچىلانمىدى. قايتا سىناڭ.',
  download: 'چۈشۈرۈش ئۈزۈلۈپ قالدى — تورنى تەكشۈرۈپ قايتا سىناڭ.',
  flush: 'خاتىرە ساقلانمىدى — يېڭىلاش توختىتىلدى. خاتىرىنى ساقلاپ قايتا سىناڭ.',
  store: 'Microsoft Store جاۋاب بەرمىدى',
  catalog: 'Microsoft Store دىكى نەشرنى بىلگىلى بولمىدى — سەل تۇرۇپ قايتا سىناڭ.',
  dev: 'سىناق نۇسخىسى (npm run dev): يېڭى نەشر چۈشۈرۈلدى ۋە تەكشۈرۈلدى، قاچىلانمىدى.'
};

class UpdateError extends Error {
  constructor(message, code, status) {
    super(message);
    this.name = 'UpdateError';
    this.code = code;
    this.status = status || 0;
  }
}

/**
 * The version the Store publishes, from the product catalog's answer: the
 * highest «BilimHezinisi.BilimHezinisi_<version>.0_…» package. null if none.
 */
function storeVersionFromCatalog(json) {
  let best = null;
  const products = (json && Array.isArray(json.Products)) ? json.Products : [];
  for (const p of products) {
    for (const a of (p && p.DisplaySkuAvailabilities) || []) {
      const packages = (a && a.Sku && a.Sku.Properties && a.Sku.Properties.Packages) || [];
      for (const k of packages) {
        const m = /^BilimHezinisi\.BilimHezinisi_(\d+\.\d+\.\d+)(?:\.\d+)?_/.exec(String((k && k.PackageFullName) || ''));
        if (m && (!best || compareVersions(m[1], best) > 0)) best = m[1];
      }
    }
  }
  return best;
}

/** -1, 0, 1 — numeric parts, a leading «v» ignored, a missing part is 0. */
function compareVersions(a, b) {
  const parts = (v) => String(v || '').trim().replace(/^v/i, '').split(/[.+-]/).map((x) => parseInt(x, 10));
  const pa = parts(a);
  const pb = parts(b);
  if (!String(a || '').trim()) return String(b || '').trim() ? -1 : 0;
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = Number.isFinite(pa[i]) ? pa[i] : 0;
    const y = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

/** Where this copy came from: 'store' | 'portable' | 'installer' | 'dev'. */
function channelOf(o) {
  if (!o || !o.isPackaged) return 'dev';
  if (o.windowsStore) return 'store';
  if (o.portableFile) return 'portable';
  return 'installer';
}

/** The release file this copy takes (GitHub turns the spaces of a name into dots). */
function assetFor(release, channel) {
  const list = (release && Array.isArray(release.assets)) ? release.assets : [];
  let re = null;
  if (channel === 'installer' || channel === 'dev') re = /^Bilim[ .]Hezinisi[ .]Setup[ .][\d.]+\.exe$/i;
  else if (channel === 'portable') re = /^BilimHezinisi-Portable-[\d.]+\.exe$/i;
  if (!re) return null;
  const a = list.find((x) => x && re.test(String(x.name || '')));
  if (!a) return null;
  return { name: String(a.name), url: String(a.browser_download_url || ''), size: Number(a.size) || 0, digest: a.digest || null };
}

/**
 * The updater. Everything that touches the world is handed in, so the tests
 * run it on fakes:
 *   fetch(url, init) → Response   (main.js: Electron's net.fetch)
 *   store(action) → { ok, count, version, state, error }   (createStoreRunner)
 *   spawn(file, args)              start a program, detached
 *   beforeQuit() → Promise<true>   save the notebook (main.js asks the renderer)
 *   quit()                         end the app
 *   openExternal(url)
 */
function createUpdater(opts) {
  const o = opts || {};
  const delays = o.retryDelays || RETRY_DELAYS;
  const sleep = o.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = o.now || (() => Date.now());
  let lastAuto = 0;
  let lastAutoResult = null;
  let lastFound = null;     // what the last check found: install() takes it from here

  /**
   * GET `url` as JSON: 20 s each try, a network error or a 5xx retried twice,
   * a 4xx never. `refused` is the message for a 4xx.
   */
  async function getJson(url, accept, refused) {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), o.timeoutMs || TIMEOUT_MS);
      let res = null;
      try {
        res = await o.fetch(url, {
          headers: { 'Accept': accept || 'application/json', 'User-Agent': o.userAgent || 'BilimHezinisi-Desktop' },
          signal: controller.signal,
          cache: 'no-store'
        });
      } catch (e) {
        res = null;
      } finally {
        clearTimeout(timer);
      }
      if (res && res.status >= 400 && res.status < 500) throw new UpdateError(refused || SAY.refused, 'refused', res.status);
      if (res && res.ok) {
        try { return await res.json(); } catch (e) { res = null; }
      }
      if (attempt >= delays.length) throw new UpdateError(res ? SAY.server : SAY.offline, res ? 'server' : 'offline');
      await sleep(delays[attempt]);
    }
  }

  async function checkNow() {
    const current = o.currentVersion;
    if (o.channel === 'store') {
      const r = await o.store('check');
      if (!r || !r.ok) throw new UpdateError(SAY.store + ((r && r.error) ? ': ' + r.error : '.'), 'store');
      return { available: Number(r.count) > 0, version: r.version || current, current: current, channel: 'store', asset: null, page: STORE_PAGE };
    }
    // What the Store has published decides, for every copy (the owner's rule).
    const catalog = await getJson(STORE_CATALOG_URL, 'application/json', SAY.catalog);
    const storeVersion = storeVersionFromCatalog(catalog);
    if (!storeVersion) throw new UpdateError(SAY.catalog, 'catalog');
    const base = { available: false, version: storeVersion, storeVersion: storeVersion, current: current, channel: o.channel, asset: null, page: RELEASES_PAGE };
    if (compareVersions(storeVersion, current) <= 0) return base;
    // Published in the Store: the GitHub release of that same version carries the file.
    let rel;
    try {
      rel = await getJson(releaseUrl(storeVersion), 'application/vnd.github+json');
    } catch (e) {
      if (e && e.code === 'refused' && e.status === 404) return Object.assign(base, { waiting: true });
      throw e;
    }
    const asset = assetFor(rel, o.channel);
    if (!asset) return Object.assign(base, { waiting: true });
    return Object.assign(base, { available: true, asset: asset, page: (rel && rel.html_url) || RELEASES_PAGE });
  }

  /** Is there a newer version? Automatic checks are spaced; a manual one always goes. */
  async function check(req) {
    const manual = !!(req && req.manual);
    if (!manual && lastAutoResult && now() - lastAuto < AUTO_CHECK_EVERY_MS) return lastAutoResult;
    const r = await checkNow();
    if (!manual) { lastAuto = now(); lastAutoResult = r; }
    lastFound = r;
    return r;
  }

  /** Download `asset` into `dir`, checking its size and SHA-256 as it comes. */
  async function download(asset, dir, onProgress) {
    const m = /^sha256:([0-9a-f]{64})$/i.exec(String(asset.digest || ''));
    if (!m) throw new UpdateError(SAY.digest, 'digest');
    // Only this repository's release files, under a plain name.
    if (String(asset.url).indexOf(DOWNLOAD_PREFIX) !== 0 || !/^[\w.-]+\.exe$/i.test(String(asset.name))) {
      throw new UpdateError(SAY.noAsset, 'no-asset');
    }
    fs.mkdirSync(dir, { recursive: true });
    const final = path.join(dir, asset.name);
    const part = final + '.part';
    let res;
    try {
      res = await o.fetch(asset.url, { headers: { 'Accept': 'application/octet-stream', 'User-Agent': o.userAgent || 'BilimHezinisi-Desktop' }, cache: 'no-store' });
    } catch (e) {
      throw new UpdateError(SAY.download, 'download');
    }
    if (!res || !res.ok || !res.body) throw new UpdateError(SAY.download, 'download');
    const total = Number(res.headers && res.headers.get && res.headers.get('content-length')) || asset.size || 0;
    const hash = crypto.createHash('sha256');
    const fh = await fs.promises.open(part, 'w');
    const reader = res.body.getReader();
    let received = 0;
    let failure = null;
    try {
      for (;;) {
        let stall = null;
        const next = await Promise.race([
          reader.read(),
          new Promise((resolve) => { stall = setTimeout(() => resolve({ stalled: true }), STALL_MS); })
        ]);
        clearTimeout(stall);
        if (next.stalled) { failure = new UpdateError(SAY.download, 'download'); try { reader.cancel(); } catch (_) {} break; }
        if (next.done) break;
        const chunk = Buffer.from(next.value);
        hash.update(chunk);
        await fh.write(chunk);
        received += chunk.length;
        if (onProgress) { try { onProgress({ received: received, total: total }); } catch (_) { /* the caller's */ } }
      }
    } catch (e) {
      failure = failure || new UpdateError(SAY.download, 'download');
    } finally {
      await fh.close();
    }
    if (!failure && ((asset.size && received !== asset.size) || hash.digest('hex').toLowerCase() !== m[1].toLowerCase())) {
      failure = new UpdateError(SAY.digest, 'digest');
    }
    if (failure) {
      try { fs.unlinkSync(part); } catch (_) { /* never written */ }
      throw failure;
    }
    try { fs.unlinkSync(final); } catch (_) { /* no older copy */ }
    fs.renameSync(part, final);
    return final;
  }

  /** The notebook first: nothing is started while something typed is unsaved. */
  async function saveFirst() {
    const ok = o.beforeQuit ? await o.beforeQuit() : true;
    if (ok !== true) throw new UpdateError(SAY.flush, 'flush');
  }

  /**
   * Install what check() found. Resolves with
   *   { installing: true }   the installer / new portable started; the app quits
   *   { done: true }         the Store installed it (Windows closes the app)
   *   { openedStore: true }  the Store's page for the app was opened
   *   { dev: true }          npm run dev: downloaded and checked only
   * `info` defaults to what the last check found — main.js never takes a
   * file's address from the renderer.
   */
  async function install(info, req) {
    info = info || lastFound;
    const onProgress = req && req.onProgress;
    if (o.channel === 'store') {
      await saveFirst();
      const r = await o.store('install');
      if (r && r.ok && r.state === 'Completed') return { done: true };
      await o.openExternal(STORE_PAGE);
      return { openedStore: true, state: (r && (r.state || r.error)) || null };
    }
    const asset = info && info.asset;
    if (!asset || !asset.url) throw new UpdateError(SAY.noAsset, 'no-asset');
    if (o.channel === 'dev') {
      const file = await download(asset, o.tmpDir, onProgress);
      try { fs.unlinkSync(file); } catch (_) { /* gone */ }
      return { dev: true, message: SAY.dev };
    }
    let dir = o.tmpDir;
    if (o.channel === 'portable') {
      dir = o.portableDir || o.downloadsDir || o.tmpDir;
      try { fs.accessSync(dir, fs.constants.W_OK); } catch (e) { dir = o.downloadsDir || o.tmpDir; }
    }
    const file = await download(asset, dir, onProgress);
    await saveFirst();
    if (o.channel === 'portable') o.spawn(file, []);
    else o.spawn(file, ['/S', '--updated', '--force-run']);
    o.quit();
    return { installing: true, file: file };
  }

  return { check: check, install: install };
}

// ---------------------------------------------------------------------------
// The Store half: Windows.Services.Store through Windows PowerShell 5.1.
// ASCII only — Windows PowerShell reads a file without a BOM as ANSI.
// One JSON line out: { ok, count, version, state } or { ok: false, error }.
// ---------------------------------------------------------------------------
const STORE_SCRIPT = [
  'param([string]$Action = \'check\')',
  '$ErrorActionPreference = \'Stop\'',
  '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
  'function Say($o) { [Console]::Out.WriteLine((ConvertTo-Json $o -Compress)) }',
  'try {',
  '  Add-Type -AssemblyName System.Runtime.WindowsRuntime',
  '  $null = [Windows.Services.Store.StoreContext, Windows.Services.Store, ContentType = WindowsRuntime]',
  '  $methods = [System.WindowsRuntimeSystemExtensions].GetMethods()',
  '  $asTask1 = $methods | Where-Object { $_.Name -eq \'AsTask\' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq \'IAsyncOperation`1\' } | Select-Object -First 1',
  '  $asTask2 = $methods | Where-Object { $_.Name -eq \'AsTask\' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq \'IAsyncOperationWithProgress`2\' } | Select-Object -First 1',
  '  $ctx = [Windows.Services.Store.StoreContext]::GetDefault()',
  '  $listType = [System.Collections.Generic.IReadOnlyList[Windows.Services.Store.StorePackageUpdate]]',
  '  $task = $asTask1.MakeGenericMethod($listType).Invoke($null, @($ctx.GetAppAndOptionalStorePackageUpdatesAsync()))',
  '  if (-not $task.Wait(60000)) { throw \'the Store did not answer in 60 s\' }',
  '  $updates = $task.Result',
  '  $count = 0; if ($updates) { $count = $updates.Count }',
  '  $version = $null',
  '  if ($count -gt 0) { $v = $updates[0].Package.Id.Version; $version = \'\' + $v.Major + \'.\' + $v.Minor + \'.\' + $v.Build }',
  '  if ($Action -ne \'install\') { Say @{ ok = $true; count = $count; version = $version }; exit 0 }',
  '  if ($count -eq 0) { Say @{ ok = $true; count = 0; state = \'none\' }; exit 0 }',
  '  if (-not $ctx.CanSilentlyDownloadStorePackageUpdates) { Say @{ ok = $true; count = $count; version = $version; state = \'needs-store\' }; exit 0 }',
  '  $op = $ctx.TrySilentDownloadAndInstallStorePackageUpdatesAsync($updates)',
  '  $task2 = $asTask2.MakeGenericMethod([Windows.Services.Store.StorePackageUpdateResult], [Windows.Services.Store.StorePackageUpdateStatus]).Invoke($null, @($op))',
  '  if (-not $task2.Wait(900000)) { throw \'the Store did not finish in 15 minutes\' }',
  '  Say @{ ok = $true; count = $count; version = $version; state = $task2.Result.OverallState.ToString() }',
  '  exit 0',
  '} catch {',
  '  $e = $_.Exception',
  '  while ($e.InnerException) { $e = $e.InnerException }',
  '  Say @{ ok = $false; error = (\'\' + $e.Message).Trim() }',
  '  exit 1',
  '}',
  ''
].join('\r\n');

/**
 * Run STORE_SCRIPT with `action` ('check' | 'install') and resolve with its
 * one JSON line — or { ok: false, error } when it did not answer in time.
 */
function createStoreRunner(opts) {
  const o = opts || {};
  return function run(action) {
    const file = path.join(o.tmpDir, 'bilim-hezinisi-store-update.ps1');
    fs.mkdirSync(o.tmpDir, { recursive: true });
    fs.writeFileSync(file, STORE_SCRIPT, 'ascii');
    const timeoutMs = o.timeoutMs || (action === 'install' ? 16 * 60000 : 90000);
    return new Promise((resolve) => {
      let out = '';
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      };
      let child;
      try {
        child = o.spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', file, '-Action', action === 'install' ? 'install' : 'check'], { windowsHide: true });
      } catch (e) {
        resolve({ ok: false, error: 'PowerShell: ' + ((e && e.message) || e) });
        return;
      }
      const timer = setTimeout(() => {
        try { child.kill(); } catch (_) { /* gone */ }
        finish({ ok: false, error: 'no answer in ' + Math.round(timeoutMs / 1000) + ' s' });
      }, timeoutMs);
      if (child.stdout) child.stdout.on('data', (d) => { out += d.toString('utf8'); });
      child.on('error', (e) => finish({ ok: false, error: 'PowerShell: ' + ((e && e.message) || e) }));
      child.on('close', () => {
        const line = out.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.charAt(0) === '{').pop();
        let r = null;
        try { r = line ? JSON.parse(line) : null; } catch (e) { r = null; }
        finish(r || { ok: false, error: 'no answer from the Store script' });
      });
    });
  };
}

module.exports = {
  REPO, RELEASES_PAGE, STORE_PRODUCT_ID, STORE_PAGE, STORE_CATALOG_URL, AUTO_CHECK_EVERY_MS,
  UpdateError, compareVersions, channelOf, assetFor, storeVersionFromCatalog, releaseUrl, createUpdater,
  STORE_SCRIPT, createStoreRunner
};
