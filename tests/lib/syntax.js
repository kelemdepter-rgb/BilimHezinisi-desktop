// ============================================================================
// The syntax gate.
//
// The app is not transpiled: src/*.js and the inline <script> of
// src/index.html are what Electron parses at startup, so a syntax error is not
// a build failure — it ships, and the window comes up blank. Every changed file
// goes through `node --check` before anything else runs.
//
// Under Electron the runner is not node, so it re-launches itself as node
// (ELECTRON_RUN_AS_NODE) to get the same parser. Under plain node it just uses
// itself.
// ============================================================================

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '_to_delete', 'prompts', 'tests/tmp'];
const EXTS = ['.js', '.mjs', '.cjs'];

function shouldSkip(rel) {
  const unix = rel.replace(/\\/g, '/');
  return SKIP_DIRS.some(function (dir) { return unix === dir || unix.indexOf(dir + '/') === 0; });
}

/** Every JS file in the tree, repo-relative, sorted. */
function listJsFiles(root) {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(root, full);
      if (shouldSkip(rel)) continue;
      if (entry.isDirectory()) walk(full);
      else if (EXTS.indexOf(path.extname(entry.name).toLowerCase()) !== -1) out.push(rel);
    }
  })(root);
  return out.sort();
}

/** The inline <script> blocks of an HTML file: [{ line, code }]. */
function inlineScripts(html) {
  const blocks = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    if (/\bsrc\s*=/i.test(m[1])) continue;        // an external file, checked on its own
    const before = html.slice(0, m.index);
    blocks.push({ line: before.split('\n').length, code: m[2] });
  }
  return blocks;
}

function nodeCheck(file) {
  const env = Object.assign({}, process.env);
  if (process.versions && process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', env: env });
  if (res.error) return 'could not run node --check: ' + res.error.message;
  if (res.status === 0) return null;
  return String(res.stderr || res.stdout || 'exit ' + res.status).trim();
}

/**
 * Check every JS file plus the inline scripts of src/index.html.
 * @returns {{ checked: number, errors: string[] }}
 */
function checkAll(root) {
  const errors = [];
  const files = listJsFiles(root);
  for (const rel of files) {
    const err = nodeCheck(path.join(root, rel));
    if (err) errors.push(rel + '\n    ' + err.split('\n').join('\n    '));
  }

  let checked = files.length;
  const htmlFiles = ['src/index.html'];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bilim-syntax-'));
  try {
    for (const rel of htmlFiles) {
      const full = path.join(root, rel);
      if (!fs.existsSync(full)) continue;
      const blocks = inlineScripts(fs.readFileSync(full, 'utf8'));
      blocks.forEach(function (block, i) {
        const file = path.join(tmp, 'inline-' + i + '.js');
        // Pad with newlines so node's line numbers match the HTML's.
        fs.writeFileSync(file, '\n'.repeat(block.line - 1) + block.code, 'utf8');
        checked++;
        const err = nodeCheck(file);
        if (err) {
          errors.push(rel + ' (inline <script> at line ' + block.line + ')\n    ' +
                      err.split('\n').join('\n    '));
        }
      });
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* temp dir */ }
  }

  return { checked: checked, errors: errors };
}

module.exports = { checkAll: checkAll, listJsFiles: listJsFiles, inlineScripts: inlineScripts };
