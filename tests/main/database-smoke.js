// ============================================================================
// Infrastructure check, not a bug test: the main-process suites really can open
// the app's own database module against a throwaway directory.
//
// It proves three things the later phases depend on: better-sqlite3 loads under
// the runner (the native module is built for Electron's ABI), the schema is
// created from scratch, and the library under test is a temporary directory —
// never %USERPROFILE%\JamiyKutupxana and never the DEV one.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function (suite, assert, ctx) {
  suite.test('db-temp-dir', async function () {
    assert.excludes(ctx.tmpDir, 'JamiyKutupxana', 'a test is pointing at the real library');

    const database = require(path.join(ctx.root, 'database.js'));
    await database.initDB(ctx.tmpDir);

    assert.ok(fs.existsSync(path.join(ctx.tmpDir, 'library.db')), 'the database file was not created');
    assert.equal(database.getAllBooks().length, 0, 'a fresh database is not empty');

    const id = database.addBook('سىناق كىتابى', 'ئاپتور', 'باشقا', 'TXT',
                                '2026-10-22', '', 'كىتابنىڭ مەزمۇنى', 'hash-1');
    assert.ok(id > 0, 'the book was not inserted');
    assert.equal(database.getAllBooks().length, 1, 'the inserted book is not there');
    assert.equal(database.getBookContent(id), 'كىتابنىڭ مەزمۇنى', 'the content did not come back');

    database.close();
  });
};
