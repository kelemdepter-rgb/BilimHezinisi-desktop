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

  // One writer of the whole document: putDocument() in src/notes.js. Everything
  // else edits over Ranges with the editing commands. Writing the editor's
  // innerHTML anywhere else skips the sanitizer, leaves the transient markup
  // older notes carry, loses the counts and the spelling, and - the reason the
  // rule exists - rebuilding a selection as HTML destroyed paragraphs, line
  // breaks, links and inline formatting (the owner's bug 1, K1, K9).
  suite.test('one-document-writer', function () {
    const files = walk(path.join(ctx.root, 'src'), ['.js', '.html']);
    const writes = grep(files, /\b(editorEl|editor|ed|naiEd)\.innerHTML\s*=[^=]/, ctx.root)
      .concat(grep(files, /notes-editor['"]\s*\)\s*\.innerHTML\s*=[^=]/, ctx.root));
    assert.equal(writes.length, 1,
      'only putDocument() may assign the editor\'s innerHTML — found ' +
      writes.length + ': ' + writes.join(', '));
    assert.includes(writes[0], 'src/notes.js:',
      'the one assignment is not in src/notes.js: ' + writes[0]);

    // ...and that one line is the one inside putDocument.
    const lines = fs.readFileSync(path.join(ctx.root, 'src', 'notes.js'), 'utf8').split(/\r?\n/);
    const opens = lines.findIndex(function (line) { return /function putDocument\(/.test(line); });
    assert.ok(opens >= 0, 'putDocument() is gone');
    const at = parseInt(writes[0].split(':')[1], 10) - 1;
    assert.ok(at > opens && at - opens < 12,
      'the one innerHTML assignment is not inside putDocument() (putDocument at line ' +
      (opens + 1) + ', assignment at line ' + (at + 1) + ')');
  });
};
