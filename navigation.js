// ============================================================================
// Where the app's windows may go (K18).
//
// Two rules, used by main.js and tested in tests/main/navigation.js:
//
//   - the main window never leaves the app: the only page it may navigate to
//     is its own src/index.html (a reload is fine; a dropped file, a link in a
//     note or anything a page smuggles in is not);
//   - a link that asks for a new window goes to the system browser only if it
//     is a real http(s) address. file:, javascript:, data:, custom schemes and
//     UNC paths are dropped — shell.openExternal would hand them to Windows,
//     which runs programs.
// ============================================================================

'use strict';

const { pathToFileURL } = require('url');

/** The http(s) address to give the system browser, normalised — or null. */
function externalUrl(raw) {
  if (raw === null || raw === undefined) return null;
  let url;
  try { url = new URL(String(raw)); } catch (e) { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!url.hostname) return null;
  return url.href;
}

/** Is `raw` the app's own page, whatever its hash or query? */
function isAppPage(raw, indexFile) {
  let url;
  try { url = new URL(String(raw || '')); } catch (e) { return false; }
  if (url.protocol !== 'file:') return false;
  const own = pathToFileURL(indexFile);
  // Windows paths are case-insensitive, and the drive letter's case varies.
  return decodeURIComponent(url.pathname).toLowerCase() ===
         decodeURIComponent(own.pathname).toLowerCase();
}

module.exports = { externalUrl, isAppPage };
