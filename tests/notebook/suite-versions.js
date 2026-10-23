// ============================================================================
// W1 — earlier versions, the renderer's half.
//
// The rules of the store (dedupe, relabel, eviction, the five-minute auto) are
// tested in tests/main/note-versions.js. What is tested here is that the
// notebook keeps a version at the right moments — BEFORE each destructive
// change, with what was on screen — and that «نەشر تارىخى» puts one back.
// ============================================================================

(function () {
  'use strict';
  const test = window.BH.test;

  function calls(reason) {
    return window.FAKE.versionCalls.filter(function (c) { return c.reason === reason; });
  }

  test('versions-kept-at-the-right-moments', async function (t) {
    const ed = await t.fresh({ html: '<p>بىرىنچى سۆز</p><p>ئىككىنچى سۆز</p>' });

    // Opening a note keeps it as it was opened.
    t.assert.equal(calls('open').length, 1, 'opening a note did not keep a version');
    t.assert.includes(calls('open')[0].html, 'بىرىنچى سۆز', 'the open version is not the note as opened');

    // A save the database confirmed may keep an automatic one, with what was saved.
    t.caretIn(t.lastText(ed.children[1]), t.lastText(ed.children[1]).data.length);
    t.type(' يېڭى');
    await window.notesSaveNow();
    await t.sleep(30);
    t.assert.equal(calls('auto').length, 1, 'a confirmed save did not offer an automatic version');
    t.assert.includes(calls('auto')[0].html, 'يېڭى', 'the automatic version is not what was saved');

    // ...but not after a failed one.
    window.FAKE.failSave = true;
    t.type(' يەنە');
    await window.notesSaveNow();
    await t.sleep(30);
    t.assert.equal(calls('auto').length, 1, 'a failed save offered an automatic version');
    window.FAKE.failSave = false;

    // Replace-all keeps the note as it was BEFORE the words changed.
    ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'h', ctrlKey: true, bubbles: true, cancelable: true }));
    await t.sleep(20);
    document.getElementById('notes-find-input').value = 'سۆز';
    window.notesFindRun();
    document.getElementById('notes-replace-input').value = 'گەپ';
    window.notesReplaceAll();
    await t.sleep(40);
    window.notesFindClose();
    t.assert.equal(calls('before-replace-all').length, 1, 'replace-all did not keep a version first');
    t.assert.includes(calls('before-replace-all')[0].html, 'سۆز', 'the version was taken after the replacement');
    t.assert.excludes(calls('before-replace-all')[0].html, 'گەپ', 'the version was taken after the replacement');
  });

  test('versions-before-paint', async function (t) {
    const ed = await t.fresh({
      html: '<p><span style="font-family:\'UKIJ Tuz Tom\';font-size:24px">مەنبە</span></p>' +
            '<p>بىرىنچى ئابزاس</p><p>ئىككىنچى ئابزاس</p>'
    });
    async function paint(fromBlock, toBlock) {
      t.caretIn(t.firstText(ed.children[0]), 1);
      document.getElementById('notes-fp-btn').dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      await t.sleep(300);
      t.select(t.firstText(ed.children[fromBlock]), 0,
               t.lastText(ed.children[toBlock]), t.lastText(ed.children[toBlock]).data.length);
      ed.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      await t.sleep(80);
    }

    await paint(1, 1);
    t.assert.equal(calls('before-paint').length, 0, 'a paint inside one paragraph kept a version');

    const before = ed.innerHTML;
    await paint(1, 2);
    t.assert.equal(calls('before-paint').length, 1, 'a paint over two paragraphs did not keep a version');
    t.assert.equal(calls('before-paint')[0].html, window.SafeHTML.sanitize(before),
      'the version is not the note as it was before the paint');
  });

  test('versions-restore', async function (t) {
    const ed = await t.fresh({
      html: '<p>ھازىرقى مەزمۇن</p>',
      versionRows: [{
        id: 7, note_id: 1, reason: 'before-ai', title: 'سىناق',
        created_at: '2025-06-01T08:05:00.000Z', first_line: 'كونا مەزمۇن', chars: 11,
        content_html: '<p>كونا <b>مەزمۇن</b></p><p onclick="alert(1)">ئىككىنچى</p>',
        content_text: 'كونا مەزمۇن\nئىككىنچى'
      }]
    });

    t.assert.ok(typeof window.notesShowHistory === 'function', 'there is no «نەشر تارىخى»');
    await window.notesShowHistory();
    await t.sleep(60);

    const item = document.querySelector('#notes-history .notes-history-item');
    t.assert.ok(item, 'the version is not listed');
    t.assert.includes(item.textContent, 'AI تۈزىتىشتىن بۇرۇن', 'the list does not say why the version was kept');
    t.assert.includes(item.textContent, 'كونا مەزمۇن', 'the list does not show the first line');
    t.assert.includes(item.textContent, '2025-06-01', 'the list does not say when');

    item.click();
    await t.sleep(60);
    const preview = document.querySelector('#notes-history .notes-history-preview');
    t.assert.ok(preview && preview.querySelector('b'), 'the preview does not show the version');
    t.assert.ok(!preview.querySelector('[onclick]'), 'the preview is not sanitized');
    t.assert.equal(ed.textContent, 'ھازىرقى مەزمۇن', 'previewing changed the note');

    document.querySelector('#notes-history [data-action="restore"]').click();
    await t.sleep(80);

    t.assert.includes(ed.innerHTML, '<b>مەزمۇن</b>', 'the version was not put back');
    t.assert.ok(!ed.querySelector('[onclick]'), 'the version was put back without the sanitizer');
    const kept = calls('before-restore');
    t.assert.equal(kept.length, 1, 'the note was not kept before the restore');
    t.assert.includes(kept[0].html, 'ھازىرقى مەزمۇن', 'the version kept before the restore is not the note as it was');

    await window.notesSaveNow();
    await t.sleep(30);
    const saved = window.FAKE.saves[window.FAKE.saves.length - 1];
    t.assert.ok(saved && saved.html.indexOf('كونا') !== -1, 'the restored note was not saved like an edit');
  });
})();
