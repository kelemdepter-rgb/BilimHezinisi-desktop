// ============================================================================
// Static checks over the source — the cheapest kind of regression test.
//
// K7: fifteen calls to a function that does not exist. The renderer has
// toast(); showToast() was never defined anywhere, so «خاتىرە ياساش مەغلۇپ
// بولدى», «ئۆچۈرۈش مەغلۇپ بولدى», «ئايەت قىستۇرۇلدى» and the rest are thrown
// away silently — and each call sits behind `typeof showToast === 'function'`,
// so nothing even logs.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

/** Every file under `dir` whose extension is in `exts`, recursively. */
function walk(dir, exts, out) {
  out = out || [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, exts, out);
    else if (exts.indexOf(path.extname(entry.name).toLowerCase()) !== -1) out.push(full);
  }
  return out;
}

/** Lines matching `re`, as "relative/path:line". */
function grep(files, re, root) {
  const hits = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      re.lastIndex = 0;
      if (re.test(lines[i])) hits.push(path.relative(root, file).replace(/\\/g, '/') + ':' + (i + 1));
    }
  }
  return hits;
}

module.exports = function (suite, assert, ctx) {
  suite.test('toasts', function () {
    const files = walk(path.join(ctx.root, 'src'), ['.js', '.html']);
    assert.ok(files.length > 0, 'no source files were scanned');
    const hits = grep(files, /\bshowToast\b/, ctx.root);
    assert.equal(hits.length, 0,
      'showToast() does not exist in this app, so these messages are never shown: ' + hits.join(', '));
  });
};
