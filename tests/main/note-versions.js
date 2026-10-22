// ============================================================================
// W1 — earlier versions of a note.
//
// A replace-all, an AI correction, a format paint over several paragraphs or a
// restore is permanent the moment autosave writes it. Each of them first keeps
// the note as it was, and «نەشر تارىخى» puts any version back. The rules come
// from the web edition's lib/notes/history.ts; here they live in database.js
// (table note_versions, migration step 1) and are tested on a throwaway library.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

const MIN = 60 * 1000;
const T0 = Date.UTC(2026, 9, 22, 9, 0, 0);

async function fresh(ctx, name) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({ beforeFirst: async function () {} });
  return database;
}

function reasons(list) { return list.map(function (v) { return v.reason; }); }

module.exports = function (suite, assert, ctx) {
  suite.test('versions-migration', async function () {
    const database = require(path.join(ctx.root, 'database.js'));
    database.close();
    const dir = path.join(ctx.tmpDir, 'versions-migration');
    fs.mkdirSync(dir, { recursive: true });
    await database.initDB(dir);
    assert.equal(database.schemaVersion(), 0, 'a fresh library is not at schema 0');

    let backups = 0;
    const r = await database.runMigrations({ beforeFirst: async function () { backups++; } });
    assert.equal(backups, 1, 'the library was not backed up before the first step');
    assert.ok(r.ran.indexOf(1) !== -1, 'the note_versions step did not run');
    assert.ok(database.schemaVersion() >= 1, 'user_version did not move');

    const id = Number(database.notesCreate('سىناق'));
    assert.equal(database.noteVersionKeep(id, 'open', 'سىناق', '<p>a</p>', 'a', T0), 'kept',
      'the new table does not take a version');
    database.close();
  });

  suite.test('versions-dedupe-relabel', async function () {
    const database = await fresh(ctx, 'versions-dedupe');
    const id = Number(database.notesCreate('خاتىرە'));
    const A = '<p>بىرىنچى نۇسخا</p>';

    assert.equal(database.noteVersionKeep(id, 'open', 'خاتىرە', A, 'بىرىنچى نۇسخا', T0), 'kept');
    assert.equal(database.noteVersionKeep(id, 'auto', 'خاتىرە', A, 'بىرىنچى نۇسخا', T0 + 6 * MIN), 'same',
      'a version identical to the newest was stored twice');
    assert.deepEqual(reasons(database.noteVersionList(id)), ['open'], 'an identical version was added');

    // Opened and at once replaced-all: found under the name the writer will look for.
    assert.equal(database.noteVersionKeep(id, 'before-replace-all', 'خاتىرە', A, 'بىرىنچى نۇسخا', T0 + 7 * MIN), 'same');
    assert.deepEqual(reasons(database.noteVersionList(id)), ['before-replace-all'],
      'an identical open version was not relabelled to before-replace-all');

    // Only open/auto give way: a before-* label stays what it is.
    database.noteVersionKeep(id, 'before-ai', 'خاتىرە', A, 'بىرىنچى نۇسخا', T0 + 8 * MIN);
    assert.deepEqual(reasons(database.noteVersionList(id)), ['before-replace-all'],
      'a before-* label was overwritten by another');

    assert.equal(database.noteVersionKeep(id, 'before-ai', 'خاتىرە', '<p>ئىككىنچى</p>', 'ئىككىنچى', T0 + 9 * MIN), 'kept');
    assert.deepEqual(reasons(database.noteVersionList(id)), ['before-ai', 'before-replace-all'],
      'the list is not newest first');
    database.close();
  });

  suite.test('versions-auto-every-5-min', async function () {
    const database = await fresh(ctx, 'versions-auto');
    const id = Number(database.notesCreate('خاتىرە'));
    assert.equal(database.noteVersionKeep(id, 'auto', 't', '<p>1</p>', '1', T0), 'kept');
    assert.equal(database.noteVersionKeep(id, 'auto', 't', '<p>2</p>', '2', T0 + 2 * MIN), 'recent',
      'an automatic version was taken two minutes after the last');
    // Other reasons are never held back by the clock.
    assert.equal(database.noteVersionKeep(id, 'before-ai', 't', '<p>2</p>', '2', T0 + 3 * MIN), 'kept');
    assert.equal(database.noteVersionKeep(id, 'auto', 't', '<p>3</p>', '3', T0 + 6 * MIN), 'kept',
      'no automatic version six minutes after the last');
    assert.equal(database.noteVersionKeep(id, 'nonsense', 't', '<p>4</p>', '4', T0 + 20 * MIN), 'refused',
      'an unknown reason was stored');
    database.close();
  });

  suite.test('versions-eviction', async function () {
    const database = await fresh(ctx, 'versions-eviction');
    const id = Number(database.notesCreate('خاتىرە'));
    // 30 versions: auto at 0, 10, 20; before-ai everywhere else.
    for (let i = 0; i < 30; i++) {
      const reason = (i % 10 === 0) ? 'auto' : 'before-ai';
      database.noteVersionKeep(id, reason, 't', '<p>' + i + '</p>', String(i), T0 + i * 10 * MIN);
    }
    assert.equal(database.noteVersionList(id).length, 30, 'the fixture did not store 30 versions');

    database.noteVersionKeep(id, 'before-ai', 't', '<p>30</p>', '30', T0 + 300 * MIN);
    let texts = database.noteVersionList(id).map(function (v) { return v.first_line; });
    assert.equal(texts.length, 30, 'more than 30 versions are kept');
    assert.ok(texts.indexOf('0') === -1, 'the oldest automatic version was not the one evicted');
    assert.ok(texts.indexOf('1') !== -1, 'a before-* version went while an automatic one was left');

    // Two more: the autos at 10 and 20 go, still nothing else.
    database.noteVersionKeep(id, 'before-ai', 't', '<p>31</p>', '31', T0 + 310 * MIN);
    database.noteVersionKeep(id, 'before-ai', 't', '<p>32</p>', '32', T0 + 320 * MIN);
    texts = database.noteVersionList(id).map(function (v) { return v.first_line; });
    assert.ok(texts.indexOf('10') === -1 && texts.indexOf('20') === -1, 'automatic versions were not evicted first');
    assert.ok(texts.indexOf('1') !== -1, 'a before-* version went while an automatic one was left');

    // No autos left: the oldest of any reason goes — never the newest.
    database.noteVersionKeep(id, 'before-ai', 't', '<p>33</p>', '33', T0 + 330 * MIN);
    texts = database.noteVersionList(id).map(function (v) { return v.first_line; });
    assert.ok(texts.indexOf('1') === -1, 'the oldest version was not evicted once no automatic one was left');
    assert.equal(texts[0], '33', 'the newest version was evicted');
    assert.equal(texts.length, 30, 'more than 30 versions are kept');
    database.close();
  });

  suite.test('versions-list-get-cascade', async function () {
    const database = await fresh(ctx, 'versions-cascade');
    const id = Number(database.notesCreate('خاتىرە'));
    database.noteVersionKeep(id, 'open', 'ماۋزۇ', '<p>بىرىنچى قۇر</p><p>ئىككىنچى قۇر</p>',
      'بىرىنچى قۇر\nئىككىنچى قۇر', T0);

    const list = database.noteVersionList(id);
    assert.equal(list.length, 1);
    assert.equal(list[0].first_line, 'بىرىنچى قۇر', 'the list does not show the first line');
    assert.ok(list[0].created_at, 'the list has no time');
    assert.ok(!('content_html' in list[0]), 'the list carries every version\'s whole text');

    const one = database.noteVersionGet(list[0].id);
    assert.equal(one.content_html, '<p>بىرىنچى قۇر</p><p>ئىككىنچى قۇر</p>', 'a version did not come back whole');
    assert.equal(one.note_id, id, 'a version does not say which note it belongs to');

    database.notesDelete(id);
    assert.equal(database.noteVersionList(id).length, 0, 'deleting a note left its versions behind');
    assert.ok(!database.noteVersionGet(list[0].id), 'deleting a note left its versions behind');
    database.close();
  });
};
