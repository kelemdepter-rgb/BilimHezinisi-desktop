// ============================================================================
// npm run check-package [-- <unpacked folder>]
//
// Checks a BUILT app before anything is published: run it after every
// `npm run dist-win` (default folder dist/win-unpacked), and on the Store
// build's unpacked folder before a Store package goes out.
//
// 3.6.0 shipped with an offline OCR that could not start: the worker script
// was unpacked without the packages it requires, so the engine never
// answered in the installed app — while `npm run dev`, where everything
// resolves, worked. OCR is therefore checked in the built app itself:
//
//   1. the four models (ukij, uig, eng, tur) in app.asar.unpacked/assets/ocr/tessdata;
//   2. the worker script in app.asar.unpacked/node_modules/tesseract.js, and
//      every package it needs found from there;
//   3. a real one-page OCR with the built engine: the built exe runs
//      scripts/check-package-probe.js with ELECTRON_RUN_AS_NODE=1, which
//      starts the engine exactly as main.js does.
//
// Prints OK or what is wrong; exit code 1 on any failure.
// ============================================================================

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { barPng } = require('../tests/lib/bar-png');

const ROOT = path.join(__dirname, '..');
const MODELS = ['ukij', 'uig', 'eng', 'tur'];
const OCR_TIMEOUT_MS = 60000;

const target = path.resolve(process.argv[2] || path.join(ROOT, 'dist', 'win-unpacked'));
const resources = path.join(target, 'resources');
const unpackedDir = path.join(resources, 'app.asar.unpacked');
const problems = [];

function say(line) { process.stdout.write(line + '\n'); }
function rel(p) { return path.relative(target, p) || '.'; }

say('check-package: ' + target);

if (!fs.existsSync(path.join(resources, 'app.asar'))) {
  say('FAIL  no resources/app.asar here — run «npm run dist-win» first, or name the unpacked folder.');
  process.exit(1);
}

// 1. The models.
const tessdata = path.join(unpackedDir, 'assets', 'ocr', 'tessdata');
for (const m of MODELS) {
  const file = path.join(tessdata, m + '.traineddata');
  let size = 0;
  try { size = fs.statSync(file).size; } catch (e) { size = 0; }
  if (size < 100 * 1024) problems.push('model ' + m + ' missing or empty: ' + rel(file) + ' — run «npm run fetch-ocr-models», then build again');
}
say((problems.length ? 'FAIL' : 'OK  ') + '  models: ' + MODELS.join(', '));

// 2. The worker script and what it needs, on disk. (Whether Node finds them
// from there is asked in the built app itself, step 3: plain Node from here
// would also look in the source folder's node_modules.)
const workerPath = path.join(unpackedDir, 'node_modules', 'tesseract.js', 'src', 'worker-script', 'node', 'index.js');
const before = problems.length;
if (!fs.existsSync(workerPath)) {
  problems.push('the OCR worker script is not unpacked: ' + rel(workerPath));
} else {
  const notThere = [];
  const seen = new Set();
  const queue = ['tesseract.js'];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    const pkgFile = path.join(unpackedDir, 'node_modules', name, 'package.json');
    if (!fs.existsSync(pkgFile)) { notThere.push(name); continue; }
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    for (const dep of Object.keys(pkg.dependencies || {})) queue.push(dep);
  }
  if (notThere.length) problems.push('not unpacked beside the worker: ' + notThere.join(', ') + ' — see build.asarUnpack');
}
say((problems.length > before ? 'FAIL' : 'OK  ') + '  worker script and its packages in app.asar.unpacked');

// 3. A real page through the built engine.
const exeName = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const named = pkg.build && pkg.build.productName ? pkg.build.productName + '.exe' : '';
    if (named && fs.existsSync(path.join(target, named))) return named;
  } catch (e) { /* look for it */ }
  return fs.readdirSync(target).find(f => /\.exe$/i.test(f) && !/^elevate/i.test(f)) || '';
})();
if (!exeName) {
  problems.push('no app .exe in ' + target);
  say('FAIL  OCR in the built app: no .exe found');
} else {
  const png = path.join(os.tmpdir(), 'bilim-check-package-' + process.pid + '.png');
  fs.writeFileSync(png, barPng(480, 160));
  const run = spawnSync(path.join(target, exeName), [
    path.join(__dirname, 'check-package-probe.js'),
    resources,
    path.join(ROOT, 'ocr-engine.js'),
    png,
    String(OCR_TIMEOUT_MS)
  ], {
    env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }),
    encoding: 'utf8',
    timeout: OCR_TIMEOUT_MS + 30000,
    windowsHide: true
  });
  try { fs.unlinkSync(png); } catch (e) { /* temp file */ }
  const line = String(run.stdout || '').split(/\r?\n/).find(l => l.indexOf('CHECK-PACKAGE ') === 0);
  let report = null;
  try { report = line ? JSON.parse(line.slice('CHECK-PACKAGE '.length)) : null; } catch (e) { report = null; }
  if (!report) {
    const why = run.error ? run.error.message : ('exit ' + run.status + ' ' + String(run.stderr || '').trim().split('\n').slice(-3).join(' | '));
    problems.push('the built app did not report: ' + why);
    say('FAIL  OCR in the built app: no report (' + why + ')');
  } else {
    if (report.missing && report.missing.length) {
      problems.push('the worker cannot find: ' + report.missing.join(', '));
    }
    const ocr = report.ocr || {};
    if (!ocr.answered) problems.push('OCR in the built app: ' + (ocr.error || 'no answer'));
    say((ocr.answered && !(report.missing && report.missing.length) ? 'OK  ' : 'FAIL') +
      '  OCR in the built app (Electron ' + report.electron + '): ' +
      (ocr.answered ? 'one page read in ' + ocr.ms + ' ms' : (ocr.error || 'no answer')) +
      (report.missing && report.missing.length ? '; the worker cannot find ' + report.missing.join(', ') : ''));
  }
}

say('');
if (problems.length) {
  say('check-package FAILED:');
  for (const p of problems) say('  - ' + p);
  process.exit(1);
}
say('check-package OK');
