// ============================================================================
// W20, K17 — the search history can be cleared.
//
// Every search the library made was kept (the last 50) and offered again
// under the search box, with no way to take it away: a shared computer showed
// the next person what the last one looked for. «تارىخنى تازىلاش» in the
// dropdown deletes it through the main process.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

module.exports = function (suite, assert, ctx) {
  suite.test('search-history-clear', async function () {
    const database = require(path.join(ctx.root, 'database.js'));
    database.close();
    const dir = path.join(ctx.tmpDir, 'search-history');
    fs.mkdirSync(dir, { recursive: true });
    await database.initDB(dir);

    database.addSearchHistory('ئىلىم', 3);
    database.addSearchHistory('تارىخ', 0);
    assert.equal(database.getSearchHistory(20).length, 2);

    assert.equal(database.clearSearchHistory(), 2, 'the number cleared is not reported');
    assert.deepEqual(database.getSearchHistory(20), [], 'the history is still there');
    assert.equal(database.clearSearchHistory(), 0);

    // It fills again from nothing, as before.
    database.addSearchHistory('يېڭى', 1);
    assert.deepEqual(database.getSearchHistory(20).map(function (h) { return h.query; }), ['يېڭى']);
    database.close();
  });
};
