// ============================================================================
// 3.6 Phase 5 — «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش».
//
// web-library.js (main) reads what the website already publishes: its
// catalog (Supabase `books` and `categories`, published books only under the
// site's row-level security), its download gate (/api/books/<id>/download,
// which refuses drafts and limits each address), and a book's pages in
// batches of 100, one request at a time. Nothing here touches the network:
// every test hands the client a fetch of its own.
// ============================================================================

'use strict';

const fs = require('fs');
const path = require('path');

/** A Response-like object, as fetch resolves it. */
function reply(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    json: async function () { return typeof body === 'string' ? JSON.parse(body) : body; },
    text: async function () { return typeof body === 'string' ? body : JSON.stringify(body); }
  };
}

function jwt(payload) {
  const b64 = function (o) { return Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_'); };
  return b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64(payload) + '.c2lnbmF0dXJl';
}

/**
 * A fake website: `books` (id → { meta, pages }), the gate's answers, and a
 * log of every request with how many were in flight at once.
 */
function site(opts) {
  const o = opts || {};
  const log = [];
  let inFlight = 0;
  let maxInFlight = 0;
  const fetch = async function (url, init) {
    log.push({ url: url, headers: (init && init.headers) || {}, signal: init && init.signal });
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    try {
      await new Promise(function (r) { setTimeout(r, 1); });
      if (o.fail && o.fail(url, log.length)) throw new TypeError('fetch failed');
      const u = new URL(url);
      if (u.pathname.indexOf('/api/books/') === 0) {
        const id = Number(u.pathname.split('/')[3]);
        if (o.gate && o.gate[id]) return reply(o.gate[id][0], o.gate[id][1]);
        const b = (o.books || {})[id];
        if (!b) return reply(404, { ok: false, reason: 'not-published', message: 'بۇ كىتاب تېخى ئېلان قىلىنمىغان، شۇڭا چۈشۈرگىلى بولمايدۇ.' });
        return reply(200, { ok: true, title: b.title, author: b.author || '', pageCount: b.pages.length, contentFormat: b.format || 'text' });
      }
      if (u.pathname === '/rest/v1/book_pages') {
        const id = Number(u.searchParams.get('book_id').slice(3));
        const pageNos = u.searchParams.getAll('page_no');
        const from = Number(pageNos.find(function (p) { return p.indexOf('gte.') === 0; }).slice(4));
        const to = Number(pageNos.find(function (p) { return p.indexOf('lte.') === 0; }).slice(4));
        const rows = [];
        (o.books[id].pages || []).forEach(function (content, i) {
          const no = i + 1;
          if (no >= from && no <= to && !(o.missing || []).includes(no)) rows.push({ page_no: no, content: content });
        });
        rows.reverse();   // the client must put them in order itself
        return reply(200, rows);
      }
      if (u.pathname === '/rest/v1/books') {
        const offset = Number(u.searchParams.get('offset') || 0);
        const limit = Number(u.searchParams.get('limit') || 1000);
        return reply(200, (o.catalog || []).slice(offset, offset + limit));
      }
      if (u.pathname === '/rest/v1/categories') return reply(200, o.categories || []);
      return reply(404, {});
    } finally {
      inFlight--;
    }
  };
  return { fetch: fetch, log: log, maxInFlight: function () { return maxInFlight; } };
}

function client(ctx, s, extra) {
  const W = require(path.join(ctx.root, 'web-library.js'));
  return W.createClient(Object.assign({ fetch: s.fetch, userAgent: 'BilimHezinisi-Desktop/3.6.0', retryDelays: [1, 1], timeoutMs: 2000 }, extra || {}));
}

async function rejects(promise) {
  try { await promise; } catch (e) { return e; }
  throw new Error('expected a rejection');
}

async function freshDb(ctx, name) {
  const database = require(path.join(ctx.root, 'database.js'));
  database.close();
  const dir = path.join(ctx.tmpDir, name);
  fs.mkdirSync(dir, { recursive: true });
  await database.initDB(dir);
  await database.runMigrations({ beforeFirst: async function () {} });
  return database;
}

module.exports = function (suite, assert, ctx) {
  const W = function () { return require(path.join(ctx.root, 'web-library.js')); };

  suite.test('web-key-is-public', function () {
    const w = W();
    assert.ok(w.checkPublicKey(w.SUPABASE_ANON_KEY), 'the bundled key must be the public one');
    assert.ok(w.checkPublicKey(jwt({ role: 'anon', iss: 'supabase' })));
    assert.ok(w.checkPublicKey('sb_publishable_abc123'));
    assert.ok(!w.checkPublicKey(jwt({ role: 'service_role', iss: 'supabase' })), 'a service-role key was taken');
    assert.ok(!w.checkPublicKey('sb_secret_abc123'), 'a secret key was taken');
    assert.ok(!w.checkPublicKey('nonsense'));
    assert.ok(/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(w.SUPABASE_URL));
    assert.equal(w.SITE_ORIGIN, 'https://bilimhezinisi.com');
  });

  suite.test('web-catalog', async function () {
    const many = [];
    for (let i = 1; i <= 1003; i++) many.push({ id: i, title: 'كىتاب ' + i, author: '', category_id: i % 2 ? 1 : null, description: 'ت', page_count: 3, content_format: 'text', status: 'published', published_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' });
    many.push({ id: 2000, title: 'قارالما', status: 'draft' });   // never shown, should the server ever send it
    const s = site({ catalog: many, categories: [{ id: 1, parent_id: null, name: 'تارىخ', sort_order: 1 }] });
    const c = await client(ctx, s).catalog();
    assert.equal(c.books.length, 1003, 'the catalog is read past the 1,000-row page');
    assert.equal(c.books[0].categoryName, 'تارىخ');
    assert.equal(c.books[1].categoryName, '');
    assert.deepEqual(c.categories, [{ id: 1, parentId: null, name: 'تارىخ', order: 1 }]);
    const first = s.log.find(function (r) { return r.url.indexOf('/rest/v1/books') !== -1; });
    assert.includes(first.url, 'status=eq.published');
    assert.equal(s.log.filter(function (r) { return r.url.indexOf('/rest/v1/books') !== -1; }).length, 2, 'two pages of the catalog');
    assert.equal(first.headers['User-Agent'], 'BilimHezinisi-Desktop/3.6.0', 'the app names itself');
    assert.ok(first.headers.apikey, 'the public key goes with the request');
    assert.ok(first.signal, 'every request can time out');
  });

  suite.test('web-gate-refusals', async function () {
    const s = site({ books: {}, gate: { 7: [429, { ok: false, reason: 'rate-limited', message: 'بىر قانچە كىتابنى ئارقىمۇئارقا چۈشۈردىڭىز. سەل تۇرۇپ قايتا سىناڭ.' }] } });
    const c = client(ctx, s);
    let e = await rejects(c.download(7));
    assert.equal(e.message, 'بىر قانچە كىتابنى ئارقىمۇئارقا چۈشۈردىڭىز. سەل تۇرۇپ قايتا سىناڭ.', 'the site\'s own message, as it is');
    assert.equal(s.log.length, 1, 'a 4xx is never retried');
    e = await rejects(c.download(8));
    assert.equal(e.message, 'بۇ كىتاب تېخى ئېلان قىلىنمىغان، شۇڭا چۈشۈرگىلى بولمايدۇ.');
    assert.ok(!s.log.some(function (r) { return r.url.indexOf('book_pages') !== -1; }), 'pages were read after a refusal');
  });

  suite.test('web-offline-and-retry', async function () {
    // Two network failures, then it works: retried twice.
    let s = site({ books: { 3: { title: 'ب', pages: ['بىر'] } }, fail: function (url, n) { return n <= 2; } });
    const ok = await client(ctx, s).download(3);
    assert.equal(ok.text, 'بىر');
    // Always failing: «تورغا ئۇلىنالمىدى» after three tries.
    s = site({ books: { 3: { title: 'ب', pages: ['بىر'] } }, fail: function () { return true; } });
    const e = await rejects(client(ctx, s).download(3));
    assert.equal(e.message, 'تورغا ئۇلىنالمىدى');
    assert.equal(s.log.length, 3);
  });

  suite.test('web-pages-in-batches', async function () {
    const pages = [];
    for (let i = 1; i <= 250; i++) pages.push('بەت ' + i);
    const s = site({ books: { 5: { title: 'ئۇزۇن', pages: pages } }, missing: [120] });
    const seen = [];
    const r = await client(ctx, s).download(5, { onProgress: function (done, total) { seen.push([done, total]); } });
    const reqs = s.log.filter(function (x) { return x.url.indexOf('book_pages') !== -1; });
    assert.equal(reqs.length, 3, 'pages 1–100, 101–200, 201–250');
    assert.equal(s.maxInFlight(), 1, 'one request at a time');
    const expected = pages.filter(function (p, i) { return i + 1 !== 120; }).join('\n\n');
    assert.equal(r.text, expected, 'in order, joined with a blank line as the website joins them, a missing page skipped');
    assert.deepEqual(seen[seen.length - 1], [249, 250]);
    assert.equal(r.meta.pageCount, 250);
  });

  suite.test('web-markdown-like-md-import', async function () {
    const MT = require(path.join(ctx.root, 'src', 'markdown-text.js'));
    const md = ['# سەرلەۋھە\n\n**قويۇق** سۆز [ئۇلانما](https://x.y)', '- بىرىنچى\n- ئىككىنچى'];
    const s = site({ books: { 9: { title: 'م', format: 'markdown', pages: md } } });
    const r = await client(ctx, s).download(9);
    assert.equal(r.text, MT.toPlain(md.join('\n\n')), 'the same converter as a .md import');
    assert.equal(r.text, 'سەرلەۋھە\n\nقويۇق سۆز ئۇلانما\n\nبىرىنچى\nئىككىنچى');
    // index.html's .md import goes through the same module.
    const html = fs.readFileSync(path.join(ctx.root, 'src', 'index.html'), 'utf8');
    assert.ok(/function markdownToPlainText\(md\) \{\s*return window\.MarkdownText\.toPlain\(md\);\s*\}/.test(html), 'index.html keeps a second copy of the converter');
  });

  suite.test('web-import-and-duplicates', async function () {
    const database = await freshDb(ctx, 'web-import');
    const w = W();
    const s = site({ books: { 11: { title: 'تور كىتابى', author: 'ئاپتور', pages: ['بىرىنچى بەت', 'ئىككىنچى بەت'] } } });
    const c = client(ctx, s);
    const catalogBook = { id: 11, title: 'تور كىتابى', author: 'ئاپتور', description: 'چۈشەندۈرۈش', updatedAt: '2026-10-20T10:00:00Z' };
    const r = await w.importBook(database, c, catalogBook, { category: 'تارىخ' });
    assert.ok(r.ok && r.id, 'the book was not added');
    const b = database.getBook(r.id);
    assert.deepEqual([b.title, b.author, b.category, b.description], ['تور كىتابى', 'ئاپتور', 'تارىخ', 'چۈشەندۈرۈش']);
    assert.deepEqual([b.source, Number(b.source_id), b.source_updated_at], ['bilimhezinisi.com', 11, '2026-10-20T10:00:00Z']);
    assert.equal(database.getBookContent(r.id), 'بىرىنچى بەت\n\nئىككىنچى بەت');
    // The same book again: refused before anything is downloaded.
    const before = s.log.length;
    const again = await w.importBook(database, c, catalogBook, { category: 'تارىخ' });
    assert.ok(!again.ok && again.duplicate && Number(again.id) === Number(r.id));
    assert.equal(s.log.length, before, 'a book already here was downloaded again');
    assert.equal(database.getAllBooks().length, 1);
    // What the catalog shows for it.
    const local = database.getBookSources('bilimhezinisi.com');
    assert.deepEqual(local.map(function (x) { return [Number(x.id), Number(x.source_id)]; }), [[Number(r.id), 11]]);
    assert.equal(w.isUpdated(catalogBook, local[0]), false);
    assert.equal(w.isUpdated(Object.assign({}, catalogBook, { updatedAt: '2026-10-25T08:00:00Z' }), local[0]), true, 'the «updated» badge');
    database.close();
  });

  suite.test('web-cancel-leaves-no-half-book', async function () {
    const database = await freshDb(ctx, 'web-cancel');
    const w = W();
    const pages = [];
    for (let i = 1; i <= 300; i++) pages.push('بەت ' + i);
    const s = site({ books: { 12: { title: 'ئۇزۇن', pages: pages } } });
    const controller = new AbortController();
    const c = client(ctx, s);
    const e = await rejects(w.importBook(database, c, { id: 12, title: 'ئۇزۇن', updatedAt: '2026-10-20T00:00:00Z' }, {
      category: 'باشقا', signal: controller.signal,
      onProgress: function (done) { if (done >= 100) controller.abort(); }
    }));
    assert.ok(e.cancelled, 'the download should report it was stopped');
    assert.equal(database.getAllBooks().length, 0, 'a half book was added');
    assert.ok(s.log.filter(function (x) { return x.url.indexOf('book_pages') !== -1; }).length < 3, 'it went on after the stop');
    database.close();
  });

  suite.test('web-update-keeps-places', async function () {
    const database = await freshDb(ctx, 'web-update');
    const w = W();
    let s = site({ books: { 13: { title: 'ي', pages: ['ئاۋۋال ' + 'ب'.repeat(200)] } } });
    const r = await w.importBook(database, client(ctx, s), { id: 13, title: 'ي', updatedAt: '2026-10-20T00:00:00Z' }, { category: 'باشقا' });
    const marks = {};
    marks[r.id] = [{ name: 'ئاخىرى', pos: 0, off: 150 }, { name: 'باشى', pos: 0, off: 4 }];
    database.syncBookmarks(marks);
    // The website's book changed and is shorter now.
    s = site({ books: { 13: { title: 'ي', pages: ['يېڭى تېكىست'] } } });
    const u = await w.updateBook(database, client(ctx, s), r.id, { updatedAt: '2026-10-26T00:00:00Z' });
    assert.ok(u.ok);
    assert.equal(database.getBookContent(r.id), 'يېڭى تېكىست');
    assert.equal(database.getBook(r.id).source_updated_at, '2026-10-26T00:00:00Z');
    const offs = (database.getAllBookmarksGrouped()[r.id] || []).map(function (b) { return b.off; }).sort(function (a, b) { return a - b; });
    assert.deepEqual(offs, [4, 'يېڭى تېكىست'.length], 'places keep their offset, clamped to the new length');
    database.close();
  });
};
