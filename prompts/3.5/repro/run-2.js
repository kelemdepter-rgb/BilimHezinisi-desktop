// Reference only — see README.md. Ran with Playwright 1.56 / Chromium 141 on 2026-10-22.
const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const path = require('path');
const URL = 'file://' + path.join(__dirname, 'harness.html');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function fresh(browser, html, good) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
  page.on('pageerror', e => console.log('  [pageerror]', e.message));
  await page.goto(URL);
  await page.evaluate(({ html, good }) => { window.NOTE_HTML = html; window.GOOD = new Set(good || []); }, { html, good });
  await page.evaluate(async () => { await window.notesOpen(1); });
  await sleep(150);
  return page;
}
const ed = (p) => p.evaluate(() => document.getElementById('notes-editor').innerHTML);
(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  console.log('\n=== A: Shift+Enter (line break) + spellcheck ===');
  {
    const p = await fresh(browser, '<p><br></p>', ['بىرىنچى', 'قۇر', 'ئىككىنچى']);
    await p.click('#notes-editor');
    await p.keyboard.type('بىرىنچى قۇر');
    await p.keyboard.press('Shift+Enter');
    await p.keyboard.type('ئىككىنچى قۇر');
    await p.evaluate(async () => { await window.notesRunSpellCheck(); });
    const u = await p.evaluate(() => { const h = CSS.highlights.get('bh-spell-error'); return h ? Array.from(h).map(r => r.toString()) : []; });
    console.log('  DOM:', await ed(p), '\n  underlined:', JSON.stringify(u));
    await p.close();
  }

  console.log('\n=== B: quote button pressed twice — can a quote become normal text again? ===');
  {
    const p = await fresh(browser, '<p>ئادەتتىكى ئابزاس</p>');
    await p.click('#notes-editor');
    await p.evaluate(() => window.notesExec('formatBlock', 'blockquote'));
    const once = await ed(p);
    await p.evaluate(() => window.notesExec('formatBlock', 'blockquote'));
    const twice = await ed(p);
    await p.evaluate(() => window.notesExec('removeFormat'));
    const cleared = await ed(p);
    console.log('  once   :', once, '\n  twice  :', twice, '\n  removeFormat:', cleared);
    await p.close();
  }

  console.log('\n=== C: Ctrl+Z after the format painter ===');
  {
    const html = '<p><span style="font-size: 26px;">مەنبە</span></p><p>بىرىنچى</p><p>ئىككىنچى</p>';
    const p = await fresh(browser, html);
    await p.evaluate(() => {
      const t = document.querySelector('#notes-editor span').firstChild;
      const r = document.createRange(); r.setStart(t, 1); r.collapse(true);
      getSelection().removeAllRanges(); getSelection().addRange(r);
    });
    await p.dispatchEvent('#notes-fp-btn', 'mousedown'); await sleep(350);
    await p.evaluate(() => {
      const ps = document.querySelectorAll('#notes-editor p');
      const r = document.createRange(); r.setStart(ps[1].firstChild, 0); r.setEnd(ps[2].firstChild, ps[2].firstChild.length);
      getSelection().removeAllRanges(); getSelection().addRange(r);
      document.getElementById('notes-editor').dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await sleep(100);
    console.log('  painted :', await ed(p));
    await p.click('#notes-editor', { position: { x: 30, y: 30 } });
    await p.keyboard.press('Control+z');
    await sleep(50);
    console.log('  Ctrl+Z  :', await ed(p));
    await p.close();
  }

  console.log('\n=== D: Ctrl+Z after paragraph indent / line spacing ===');
  {
    const p = await fresh(browser, '<p>ئابزاس</p>');
    await p.click('#notes-editor');
    await p.evaluate(() => { window.notesSaveSel(); window.notesSetIndent('1'); window.notesSetLineHeight('2'); });
    const set = await ed(p);
    await p.keyboard.press('Control+z'); await sleep(50);
    console.log('  set    :', set, '\n  Ctrl+Z :', await ed(p));
    await p.close();
  }
  await browser.close();
})();
