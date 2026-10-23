// ============================================================================
// W17 — bookmarks in the Qur'an.
//
// Migration step 4 adds quran_bookmarks(sura, aya, note, created_at,
// UNIQUE(sura, aya)). A verse is bookmarked once; the list comes back in the
// order of the mushaf; a verse that cannot exist is refused. The renderer
// (src/quran.js) marks bookmarked verses, lists them in the sidebar, and
// remembers the last verse read.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

async function fresh(ctx, name, steps) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({ steps: steps, beforeFirst: async function () {} });
  return database;
}

function places(list) { return list.map(function (b) { return [b.sura, b.aya]; }); }

module.exports = function (suite, assert, ctx) {
  suite.test('quran-bookmarks-store', async function () {
    const database = await fresh(ctx, 'quran-bookmarks',
      require(path.join(ctx.root, 'database.js')).MIGRATIONS.filter(function (s) { return s.version <= 3; }));
    const r = await database.runMigrations({ beforeFirst: async function () {} });
    assert.ok(r.ran.indexOf(4) !== -1, 'the quran_bookmarks step did not run');

    assert.deepEqual(database.quranBookmarkAdd(2, 255), { ok: true, added: true });
    assert.deepEqual(database.quranBookmarkAdd(2, 255), { ok: true, added: false }, 'a verse was bookmarked twice');
    database.quranBookmarkAdd(1, 1);
    database.quranBookmarkAdd(114, 6);
    assert.deepEqual(places(database.quranBookmarkList()), [[1, 1], [2, 255], [114, 6]],
      'the list is not in the order of the mushaf');
    assert.ok(database.quranBookmarkList()[0].created_at, 'a bookmark has no date');

    assert.deepEqual(database.quranBookmarkRemove(2, 255), { ok: true, removed: true });
    assert.deepEqual(database.quranBookmarkRemove(2, 255), { ok: true, removed: false });
    assert.deepEqual(places(database.quranBookmarkList()), [[1, 1], [114, 6]]);
    database.close();
  });

  suite.test('quran-bookmarks-refuse-what-cannot-be', async function () {
    const database = await fresh(ctx, 'quran-bookmarks-refuse');
    [[0, 1], [115, 1], [2, 0], [2, 300], ['2', 1], [2.5, 1], [null, 1], [2, -1]].forEach(function (p) {
      assert.equal(database.quranBookmarkAdd(p[0], p[1]).ok, false, JSON.stringify(p) + ' was bookmarked');
    });
    assert.deepEqual(database.quranBookmarkList(), []);
    database.close();
  });
};
