// ============================================================================
// npm test — the app's own test runner.
//
// It is an Electron main-process script, so everything runs on the engine the
// app ships with (Electron 28 / Chromium 120) rather than on whatever Chromium
// or Node happens to be installed:
//
//   1. the syntax gate — node --check over every .js and the inline scripts;
//   2. the main-process suites (tests/main/*.js) against a FRESH TEMP DIRECTORY,
//      never %USERPROFILE%\JamiyKutupxana and never the DEV library;
//   3. the notebook suites (tests/notebook/suite-*.js) in a hidden window that
//      loads the REAL renderer files from src/.
//
// One line per test, and exit code 1 if anything failed.
//
//   npm test                  everything
//   npm test -- spell-enter   only the named tests
// ============================================================================

'use strict';

const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createSuite, assert } = require('./lib/tiny');
const { checkAll } = require('./lib/syntax');

const ROOT = path.join(__dirname, '..');
const only = process.argv.slice(2).filter(function (a) { return a && a[0] !== '-'; });

function say(line) { process.stdout.write(line + '\n'); }

function report(results) {
  let failed = 0;
  for (const r of results) {
    if (r.ok) {
      say('PASS ' + r.name);
    } else {
      failed++;
      say('FAIL ' + r.name + ' — ' + r.detail);
    }
  }
  return failed;
}

// ------------------------------------------------------------------ 1. syntax
function syntaxResults() {
  if (only.length && only.indexOf('syntax') === -1) return [];
  const started = Date.now();
  const result = checkAll(ROOT);
  return [{
    name: 'syntax',
    ok: result.errors.length === 0,
    detail: result.errors.length
      ? result.errors.length + ' of ' + result.checked + ' files do not parse:\n  ' +
        result.errors.join('\n  ')
      : '',
    ms: Date.now() - started
  }];
}

// ------------------------------------------------------------ 2. main process
async function mainResults(ctx) {
  const dir = path.join(__dirname, 'main');
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter(function (f) { return f.endsWith('.js'); }).sort();
  let results = [];
  for (const file of files) {
    const suite = createSuite(file.replace(/\.js$/, ''));
    require(path.join(dir, file))(suite, assert, ctx);
    results = results.concat(await suite.run(ctx, only));
  }
  return results;
}

// ---------------------------------------------------------------- 3. renderer
async function rendererResults() {
  const win = new BrowserWindow({
    width: 1100,
    height: 850,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  const notes = [];
  win.webContents.on('console-message', function (_e, level, message, line, source) {
    if (level >= 3) notes.push('console error: ' + message + ' (' + source + ':' + line + ')');
  });
  win.webContents.on('did-fail-load', function (_e, code, desc, url) {
    notes.push('load failed (' + code + ' ' + desc + '): ' + url);
  });

  let results = [];
  try {
    await win.loadFile(path.join(__dirname, 'notebook', 'harness.html'));
    const ready = await win.webContents.executeJavaScript('!!(window.BH && window.BH.run)');
    if (!ready) {
      results = [{
        name: 'notebook-harness',
        ok: false,
        detail: 'the harness page did not load its scripts. ' + notes.join(' | '),
        ms: 0
      }];
    } else {
      results = await win.webContents.executeJavaScript(
        'window.BH.run(' + JSON.stringify(only) + ')', true);
    }
  } catch (e) {
    results = [{
      name: 'notebook-harness',
      ok: false,
      detail: (e && e.message ? e.message : String(e)) + ' ' + notes.join(' | '),
      ms: 0
    }];
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }

  return { results: results, notes: notes };
}

// --------------------------------------------------------------------- driver

// A suite may open a window of its own and close it again (the PDF export
// does). When that window is the only one, Electron's default answer to
// 'window-all-closed' is to quit — and the next page the runner loads fails
// with ERR_FAILED. The runner decides when it ends: app.exit() below.
app.on('window-all-closed', function () { /* stay alive */ });

app.whenReady().then(async function () {
  const started = Date.now();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bilim-test-'));
  const ctx = { root: ROOT, tmpDir: tmpDir };
  let failed = 0;

  try {
    say('— syntax —');
    failed += report(syntaxResults());

    say('— main process —   (' + tmpDir + ')');
    failed += report(await mainResults(ctx));

    say('— notebook —');
    const renderer = await rendererResults();
    failed += report(renderer.results);
    for (const note of renderer.notes) say('NOTE ' + note);
  } catch (e) {
    failed++;
    say('FAIL runner — ' + (e && e.stack ? e.stack : e));
  }

  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* temp dir */ }

  say('');
  say(failed ? (failed + ' failed') : 'all green');
  say(((Date.now() - started) / 1000).toFixed(1) + ' s');
  app.exit(failed ? 1 : 0);
});

process.on('unhandledRejection', function (reason) {
  say('FAIL runner — unhandled rejection: ' + (reason && reason.stack ? reason.stack : reason));
  app.exit(1);
});
