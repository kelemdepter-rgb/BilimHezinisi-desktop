// ============================================================================
// «بىلىم خەزىنىسى تور بېتىدىن چۈشۈرۈش» — the website's published books, read
// from what the website already publishes (3.6 Phase 5). Main process only:
// the renderer never touches the network (CSP connect-src 'self').
//
// The website (BilimHezinisi-website, never changed from here) serves:
//   - its catalog through Supabase's REST API: `books` and `categories`,
//     readable by anyone for PUBLISHED books only (row-level security), at
//     most 1,000 rows a request for an anonymous reader;
//   - /api/books/<id>/download, the gate it calls itself before a whole-book
//     download: it refuses drafts and limits each address (20 downloads in
//     10 minutes), answering with a Uyghur `message` that is shown as it is;
//   - a book's pages from `book_pages`, read in batches of 100 and joined
//     with a blank line (lib/books/download.ts, lib/books/export-book.ts).
//
// The site runs on free tiers (5 GB of database egress a month), so this is
// a polite client: one request at a time, the gate first, the catalog once a
// session, 20 s timeouts, a network error retried twice with a pause and a
// 4xx never, and a User-Agent that names the app.
// ============================================================================

'use strict';

const crypto = require('crypto');
const MarkdownText = require('./src/markdown-text');

const SITE_ORIGIN = 'https://bilimhezinisi.com';
const SOURCE = 'bilimhezinisi.com';

// PUBLIC BY DESIGN: the website's Supabase address and anon key — the same
// two values every visitor's browser receives. What they can read is decided
// by the website's row-level security: published books, their pages and the
// categories, nothing else. checkPublicKey() refuses anything that is not an
// anon / publishable key.
const SUPABASE_URL = 'https://jmnaqaeqolrtktvpbtci.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImptbmFxYWVxb2xydGt0dnBidGNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU5MTc3MjgsImV4cCI6MjEwMTQ5MzcyOH0.zHe_E1kYCbWcgVawxKePrELONOPUP1BpTU8pViQnMfw';

const PAGE_BATCH = 100;
const CATALOG_PAGE = 1000;
const TIMEOUT_MS = 20000;
const RETRY_DELAYS = [1500, 4000];

const OFFLINE = 'تورغا ئۇلىنالمىدى';
const SERVER = 'تور بېتى ھازىر جاۋاب بەرمىدى. سەل تۇرۇپ قايتا سىناڭ.';
const REFUSED = 'كىتابنى چۈشۈرگىلى بولمىدى. سەل تۇرۇپ قايتا سىناڭ.';

class WebLibraryError extends Error {
  constructor(message, kind, status) {
    super(message);
    this.kind = kind;            // 'refused' | 'offline' | 'server' | 'cancelled'
    this.status = status || 0;
    this.cancelled = kind === 'cancelled';
  }
}

function cancelled() { return new WebLibraryError('توختىتىلدى', 'cancelled'); }

/**
 * Is this the PUBLIC key — an anon JWT or a publishable key? A service-role
 * JWT or a secret key must never be in this app.
 */
function checkPublicKey(key) {
  const k = String(key || '');
  if (k.indexOf('sb_publishable_') === 0) return true;
  if (k.indexOf('sb_secret_') === 0) return false;
  const parts = k.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return payload && payload.role === 'anon';
  } catch (e) {
    return false;
  }
}

/**
 * A client of the website. `opts.fetch` is the transport (main.js passes
 * Electron's net.fetch; the tests their own), `opts.userAgent` names the app.
 */
function createClient(opts) {
  const o = opts || {};
  const doFetch = o.fetch;
  const timeoutMs = o.timeoutMs || TIMEOUT_MS;
  const delays = o.retryDelays || RETRY_DELAYS;
  const sleep = o.sleep || (ms => new Promise(r => setTimeout(r, ms)));
  if (typeof doFetch !== 'function') throw new Error('web-library: no fetch');
  if (!checkPublicKey(SUPABASE_ANON_KEY)) throw new Error('web-library: the Supabase key is not the public one');

  function headers(withKey) {
    const h = { 'Accept': 'application/json', 'User-Agent': o.userAgent || 'BilimHezinisi-Desktop' };
    if (withKey) {
      h.apikey = SUPABASE_ANON_KEY;
      if (SUPABASE_ANON_KEY.indexOf('sb_') !== 0) h.Authorization = 'Bearer ' + SUPABASE_ANON_KEY;
    }
    return h;
  }

  /**
   * GET `url` as JSON: 20 s each try, a network error or a 5xx retried
   * twice, a 4xx never (its body, when it has a `message`, is the answer).
   * `signal` stops it at once.
   */
  async function getJson(url, withKey, signal) {
    for (let attempt = 0; ; attempt++) {
      if (signal && signal.aborted) throw cancelled();
      const controller = new AbortController();
      const stop = () => controller.abort();
      if (signal) signal.addEventListener('abort', stop);
      const timer = setTimeout(stop, timeoutMs);
      let res = null;
      let failure = null;
      try {
        res = await doFetch(url, { headers: headers(withKey), signal: controller.signal, cache: 'no-store' });
      } catch (e) {
        failure = e;
      } finally {
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', stop);
      }
      if (signal && signal.aborted) throw cancelled();
      if (res && res.status >= 400 && res.status < 500) {
        const body = await res.json().catch(() => null);
        throw new WebLibraryError((body && typeof body.message === 'string' && body.message) || REFUSED, 'refused', res.status);
      }
      if (res && res.ok) {
        try { return await res.json(); } catch (e) { failure = e; res = null; }
      }
      if (attempt >= delays.length) {
        throw res ? new WebLibraryError(SERVER, 'server', res.status) : new WebLibraryError(OFFLINE, 'offline');
      }
      await sleep(delays[attempt]);
    }
  }

  const rest = (table, query) => SUPABASE_URL + '/rest/v1/' + table + '?' + query;

  /**
   * The published books and the categories: { books, categories }. A book:
   * { id, title, author, categoryId, categoryName, description, pageCount,
   *   contentFormat, publishedAt, updatedAt }.
   */
  async function catalog(signal) {
    const cats = await getJson(rest('categories', 'select=id,parent_id,name,sort_order&order=sort_order.asc,id.asc&limit=1000'), true, signal);
    const categories = (Array.isArray(cats) ? cats : []).map(c => ({
      id: Number(c.id), parentId: c.parent_id == null ? null : Number(c.parent_id), name: String(c.name || ''), order: Number(c.sort_order) || 0
    }));
    const byId = new Map(categories.map(c => [c.id, c.name]));
    const books = [];
    for (let offset = 0; ; offset += CATALOG_PAGE) {
      const rows = await getJson(rest('books',
        'select=id,title,author,category_id,description,page_count,content_format,status,published_at,updated_at' +
        '&status=eq.published&order=id.asc&limit=' + CATALOG_PAGE + '&offset=' + offset), true, signal);
      const list = Array.isArray(rows) ? rows : [];
      for (const r of list) {
        if (r.status !== 'published') continue;
        books.push({
          id: Number(r.id),
          title: String(r.title || ''),
          author: String(r.author || ''),
          categoryId: r.category_id == null ? null : Number(r.category_id),
          categoryName: r.category_id == null ? '' : (byId.get(Number(r.category_id)) || ''),
          description: String(r.description || ''),
          pageCount: Number(r.page_count) || 0,
          contentFormat: r.content_format === 'markdown' ? 'markdown' : 'text',
          publishedAt: r.published_at || null,
          updatedAt: r.updated_at || null
        });
      }
      if (list.length < CATALOG_PAGE) break;
    }
    return { books: books, categories: categories };
  }

  /** The website's gate: { title, author, pageCount, contentFormat }, or its refusal. */
  async function gate(bookId, signal) {
    const body = await getJson(SITE_ORIGIN + '/api/books/' + Number(bookId) + '/download', false, signal);
    if (!body || body.ok !== true) throw new WebLibraryError((body && body.message) || REFUSED, 'refused');
    return {
      title: String(body.title || ''),
      author: String(body.author || ''),
      pageCount: Number(body.pageCount) || 0,
      contentFormat: body.contentFormat === 'markdown' ? 'markdown' : 'text'
    };
  }

  /**
   * The book's text: the gate, then the pages in batches of 100, one
   * request at a time, in order (a page the website does not have is left
   * out, as the website leaves it out), joined with a blank line; a
   * Markdown book as plain prose (src/markdown-text.js, as a .md import).
   * `onProgress(done, total)` after each batch; `signal` stops it.
   */
  async function download(bookId, opts2) {
    const p = opts2 || {};
    const meta = await gate(bookId, p.signal);
    const pages = new Map();
    for (let from = 1; from <= meta.pageCount; from += PAGE_BATCH) {
      if (p.signal && p.signal.aborted) throw cancelled();
      const to = Math.min(from + PAGE_BATCH - 1, meta.pageCount);
      const rows = await getJson(rest('book_pages',
        'select=page_no,content&book_id=eq.' + Number(bookId) + '&page_no=gte.' + from + '&page_no=lte.' + to + '&order=page_no.asc'), true, p.signal);
      for (const r of (Array.isArray(rows) ? rows : [])) {
        if (typeof r.content === 'string') pages.set(Number(r.page_no), r.content);
      }
      if (typeof p.onProgress === 'function') p.onProgress(pages.size, meta.pageCount);
    }
    const ordered = [];
    for (let no = 1; no <= meta.pageCount; no++) if (pages.has(no)) ordered.push(pages.get(no));
    const joined = ordered.join('\n\n');
    return { meta: meta, text: meta.contentFormat === 'markdown' ? MarkdownText.toPlain(joined) : joined };
  }

  return { catalog: catalog, gate: gate, download: download };
}

/** Did the website change this book after it was downloaded? */
function isUpdated(catalogBook, localBook) {
  if (!catalogBook || !localBook || !catalogBook.updatedAt || !localBook.source_updated_at) return false;
  const a = Date.parse(catalogBook.updatedAt);
  const b = Date.parse(localBook.source_updated_at);
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}

/**
 * Download a catalog book into the library, through the ordinary add-book
 * path (letters, the search index, the duplicate check by the text's hash),
 * with where it came from. A book already downloaded is refused BEFORE
 * anything is read from the website. Nothing is added unless the whole book
 * arrived: a stop or an error leaves the library as it was.
 *
 * @returns {Promise<{ok: boolean, id?: number, duplicate?: boolean}>}
 */
async function importBook(database, client, book, opts) {
  const o = opts || {};
  const here = database.findBookBySource(SOURCE, book.id);
  if (here) return { ok: false, duplicate: true, id: here.id };
  const got = await client.download(book.id, { signal: o.signal, onProgress: o.onProgress });
  if (o.signal && o.signal.aborted) throw cancelled();
  const text = got.text;
  const hash = text ? crypto.createHash('sha256').update(text).digest('hex') : '';
  if (hash && database.checkDuplicateHash(hash)) return { ok: false, duplicate: true, id: null };
  const id = database.addBook(
    book.title || got.meta.title, book.author || got.meta.author, o.category || 'باشقا', 'TXT',
    new Date().toISOString().slice(0, 10), book.description || '', text, hash,
    { source: { source: SOURCE, id: book.id, updatedAt: book.updatedAt || null } });
  return { ok: true, id: Number(id) };
}

/**
 * «يېڭىلاش»: the website's newer text in place of the downloaded one. Places
 * keep their offsets, clamped to the new length (database.replaceBookText).
 */
async function updateBook(database, client, localBookId, opts) {
  const o = opts || {};
  const row = database.getBook(localBookId);
  if (!row || row.source !== SOURCE || row.source_id == null) return { ok: false, notFromWebsite: true };
  const got = await client.download(row.source_id, { signal: o.signal, onProgress: o.onProgress });
  if (o.signal && o.signal.aborted) throw cancelled();
  database.replaceBookText(localBookId, got.text, { sourceUpdatedAt: o.updatedAt || null });
  return { ok: true, id: Number(localBookId) };
}

module.exports = {
  SITE_ORIGIN, SOURCE, SUPABASE_URL, SUPABASE_ANON_KEY,
  WebLibraryError, checkPublicKey, createClient, isUpdated, importBook, updateBook
};
