// Reference only — see README.md. Ran with Playwright 1.56 / Chromium 141 on 2026-10-22.
// Reproduces the desktop notebook defects in Chromium, against the real
// src/notes.js + src/spellcheck.js + src/sanitize.js (copied unchanged).
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');

const URL = 'file://' + path.join(__dirname, 'harness.html');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fresh(browser, html, opts = {}) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on('pageerror', e => console.log('  [pageerror]', e.message));
  await page.goto(URL);
  await page.evaluate(({ html, good, refscan }) => {
    window.NOTE_HTML = html;
    window.GOOD = new Set(good || []);
    window.REFSCAN = refscan || 'off';
  }, { html, good: opts.good, refscan: opts.refscan });
  if (opts.ngram) await page.evaluate(opts.ngram);
  await page.evaluate(async () => { await window.notesOpen(1); });
  await sleep(150);
  return page;
}
const editorHtml = (page) => page.evaluate(() => document.getElementById('notes-editor').innerHTML);

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' }).catch(async () => chromium.launch());

  // ------------------------------------------------------------------ 1
  console.log('\n=== TEST 1: Enter between two words + spellcheck (user bug #2) ===');
  {
    const words1 = ['ياخشى', 'ئۇسۇللارنى', 'ماڭا', 'تەۋسىيە', 'قىلغىن', 'مەنىڭ'];
    const words2 = ['چۈشەنمىگەن', 'ئىككىلىنىپ', 'قالغان'];
    const page = await fresh(browser, '<p><br></p>', { good: [...words1, ...words2] });
    await page.click('#notes-editor');
    await page.keyboard.type(words1.join(' '));
    await page.keyboard.press('Enter');
    await page.keyboard.type(words2.join(' '));
    await page.evaluate(async () => { await window.notesRunSpellCheck(); });
    await sleep(100);
    const info = await page.evaluate(() => {
      const h = CSS.highlights.get('bh-spell-error');
      return {
        html: document.getElementById('notes-editor').innerHTML,
        checked: window.LAST_CHECKED,
        underlined: h ? Array.from(h).map(r => r.toString()) : []
      };
    });
    console.log('  editor DOM after typing + Enter :', info.html);
    console.log('  text the checker received      :', JSON.stringify(info.checked));
    console.log('  underlined (every word is correct!):', JSON.stringify(info.underlined));

    // Now click the underlined "word" and accept the first suggestion.
    const rect = await page.evaluate(() => {
      const h = CSS.highlights.get('bh-spell-error');
      const r = Array.from(h)[0].getClientRects()[0];
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(rect.x, rect.y);
    await sleep(150);
    const header = await page.evaluate(() => { const p = document.querySelector('.spell-popup-header'); return p && p.textContent; });
    console.log('  popup header                   :', header);
    await page.click('.spell-popup-item[data-correction]');
    await sleep(150);
    console.log('  editor DOM after taking suggestion:', await editorHtml(page));
    await page.close();
  }

  // ------------------------------------------------------------------ 2
  console.log('\n=== TEST 2: format painter over several paragraphs (user bug #1) ===');
  {
    const html =
      '<p><span style="font-family: serif; font-size: 26px; color: rgb(160, 0, 0);">مەنبە ئابزاس</span></p>' +
      '<p>بىرىنچى ئابزاس <b>توم سۆز</b> بار</p>' +
      '<p>ئىككىنچى ئابزاس</p>' +
      '<p>ئۈچىنچى ئابزاس</p>';
    const page = await fresh(browser, html);
    const before = await page.evaluate(() => document.querySelectorAll('#notes-editor p').length);
    // caret inside the source text, then one press on the brush (one-shot mode)
    await page.evaluate(() => {
      const ed = document.getElementById('notes-editor');
      const t = ed.querySelector('span').firstChild;
      const r = document.createRange(); r.setStart(t, 2); r.collapse(true);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    });
    await page.dispatchEvent('#notes-fp-btn', 'mousedown');
    await sleep(350);
    // drag-select from the start of paragraph 2 to the end of paragraph 4, like a user
    const pts = await page.evaluate(() => {
      const ps = document.querySelectorAll('#notes-editor p');
      const a = ps[1].getBoundingClientRect(), b = ps[3].getBoundingClientRect();
      return { x1: a.right - 2, y1: a.top + a.height / 2, x2: b.left + 2, y2: b.top + b.height / 2 };
    });
    await page.mouse.move(pts.x1, pts.y1);
    await page.mouse.down();
    await page.mouse.move(pts.x2, pts.y2, { steps: 8 });
    await page.mouse.up();
    await sleep(200);
    const after = await page.evaluate(() => document.querySelectorAll('#notes-editor p').length);
    console.log('  paragraphs before:', before, ' after:', after);
    console.log('  editor DOM after painting:', await editorHtml(page));
    await page.close();
  }

  // ------------------------------------------------------------------ 3
  console.log('\n=== TEST 3: find & «replace all» when the note starts with a quote ===');
  {
    const html = '<blockquote>نەقىل سۆز</blockquote><p>بىرىنچى سۆز</p><p>ئىككىنچى سۆز</p>';
    const page = await fresh(browser, html);
    await page.click('#notes-editor');
    await page.keyboard.press('Control+h');
    await page.fill('#notes-find-input', 'سۆز');
    await page.evaluate(() => window.notesFindRun());
    await page.fill('#notes-replace-input', 'گەپ');
    await page.evaluate(() => window.notesReplaceAll());
    await sleep(100);
    await page.evaluate(() => window.notesFindClose());
    console.log('  before:', html);
    console.log('  after :', await editorHtml(page));
    await page.close();
  }

  // ------------------------------------------------------------------ 4
  console.log('\n=== TEST 4: what the note sanitizer really keeps ===');
  {
    const page = await fresh(browser, '<p><br></p>');
    const out = await page.evaluate(() => ({
      refInsert: SafeHTML.sanitize('<blockquote class="notes-inserted-ref" data-ref-insert="1">x</blockquote>'),
      refMatch: SafeHTML.sanitize('<span class="ref-match" data-ref-word="w" title="t">w</span>'),
      img: SafeHTML.sanitize('<img src="https://example.com/a.png"><table><tr><td>t</td></tr></table>'),
      indent: SafeHTML.sanitize('<p style="text-indent: 1cm; position: fixed">p</p>')
    }));
    for (const [k, v] of Object.entries(out)) console.log('  ' + k.padEnd(9), '→', v);
    // insert a library passage the way the refs panel does, and look at the result
    await page.evaluate(() => { window.S.books = [{ id: 5, title: 'كىتاب' }]; window.notesInsertRef(5, encodeURIComponent('نەقىل تېكىستى')); });
    console.log('  inserted reference in editor →', await editorHtml(page));
    await page.close();
  }

  // ------------------------------------------------------------------ 5
  console.log('\n=== TEST 5: reference scan (ON by default) while typing ===');
  {
    const ngram = () => {
      window.NGram = {
        MIN_WORD_LEN: 2,
        extractCandidates: (t) => ['ئابزاس'],
        findReferences: async () => new Map([['ئابزاس', [{ bookId: 5, snippets: [{ snip: 'ئابزاس', pos: 1 }] }]]])
      };
    };
    const page = await fresh(browser, '<p><br></p>', { refscan: 'on', ngram, good: [] });
    await page.click('#notes-editor');
    await page.keyboard.type('بۇ بىر ئابزاس ھەققىدە يېزىلغان جۈملە');
    await sleep(900);                     // the scan runs 400 ms after typing stops
    await page.keyboard.type('XYZ');      // keep typing where the caret should be (the end)
    await sleep(50);
    const t = await page.evaluate(() => document.getElementById('notes-editor').innerText);
    console.log('  text after typing XYZ at the end:', JSON.stringify(t));
    await page.evaluate(() => window.notesSaveNow());
    await sleep(100);
    const saved = await page.evaluate(() => window.SAVES[window.SAVES.length - 1]);
    console.log('  saved HTML                       :', saved && saved.html);
    await page.close();
  }

  // ------------------------------------------------------------------ 6
  console.log('\n=== TEST 6: switch away (Ctrl+2) and straight back (Ctrl+3) within 3 s ===');
  {
    const page = await fresh(browser, '<p>كونا مەزمۇن</p>');
    await page.click('#notes-editor');
    await page.keyboard.press('End');
    await page.keyboard.type(' يېڭى يېزىلغان مۇھىم جۈملە');
    // setMode('quran') replaces #main; setMode('notes') calls renderNotesView()
    await page.evaluate(async () => { document.getElementById('main').innerHTML = '<div>quran</div>'; await new Promise(r => setTimeout(r, 800)); await window.renderNotesView(); });
    await sleep(3500);
    const r = await page.evaluate(() => ({ shown: document.getElementById('notes-editor').innerText, saves: window.SAVES.map(s => s.text) }));
    console.log('  on screen after returning:', JSON.stringify(r.shown));
    console.log('  what was saved           :', JSON.stringify(r.saves));
    await page.close();
  }

  // ------------------------------------------------------------------ 7
  console.log('\n=== TEST 7: the database refuses a save, then the writer opens a note ===');
  {
    const page = await fresh(browser, '<p>كونا مەزمۇن</p>');
    await page.evaluate(() => { window.FAIL_SAVE = true; });
    await page.click('#notes-editor');
    await page.keyboard.press('End');
    await page.keyboard.type(' يېڭى جۈملە');
    await page.evaluate(async () => { await window.notesOpen(1); });
    await sleep(3500);
    const r = await page.evaluate(() => ({ shown: document.getElementById('notes-editor').innerText, toasts: window.TOASTS, status: document.getElementById('notes-status').textContent }));
    console.log('  on screen:', JSON.stringify(r.shown), ' status:', r.status, ' toasts:', JSON.stringify(r.toasts));
    await page.close();
  }

  await browser.close();
})();
