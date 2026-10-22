// The syntax gate on its own: `npm run check-syntax`.
// `npm test` runs the same check as its first suite.
'use strict';

const path = require('path');
const { checkAll } = require('./lib/syntax');

const root = path.join(__dirname, '..');
const result = checkAll(root);

if (result.errors.length) {
  process.stdout.write('FAIL syntax — ' + result.errors.length + ' of ' + result.checked + ' files do not parse\n');
  for (const err of result.errors) process.stdout.write('  ' + err + '\n');
  process.exit(1);
}

process.stdout.write('PASS syntax — ' + result.checked + ' files parse\n');
