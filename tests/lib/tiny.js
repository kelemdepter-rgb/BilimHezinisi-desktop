// ============================================================================
// The main-process half of the test framework. CommonJS, no dependency.
//
// A main suite is a module that exports a function (suite, assert, ctx). It can
// require() anything the app's main process can — better-sqlite3 included,
// because the whole runner is Electron, so the native module is the build the
// app itself loads.
//
// ctx.tmpDir is a fresh directory per run. The real library and the DEV library
// are never opened by a test; run.js refuses to start if a suite points at one.
// ============================================================================

'use strict';

function fail(msg, extra) {
  throw new Error(extra ? (msg + ' — ' + extra) : msg);
}

const assert = {
  ok: function (cond, msg) {
    if (!cond) fail(msg || 'expected a truthy value');
  },
  equal: function (actual, expected, msg) {
    if (actual !== expected) {
      fail(msg || 'values differ',
           'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    }
  },
  deepEqual: function (actual, expected, msg) {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(expected);
    if (a !== b) fail(msg || 'values differ', 'expected ' + b + ', got ' + a);
  },
  includes: function (haystack, needle, msg) {
    if (String(haystack).indexOf(needle) === -1) {
      fail(msg || 'substring missing', JSON.stringify(needle) + ' not found');
    }
  },
  excludes: function (haystack, needle, msg) {
    if (String(haystack).indexOf(needle) !== -1) {
      fail(msg || 'substring present', JSON.stringify(needle) + ' found');
    }
  },
  throws: function (fn, msg) {
    try { fn(); } catch (e) { return e; }
    fail(msg || 'expected a throw');
  }
};

function createSuite(name) {
  const tests = [];
  return {
    name: name,
    test: function (testName, fn) { tests.push({ name: testName, fn: fn }); },
    run: async function (ctx, only) {
      const results = [];
      for (const item of tests) {
        if (only && only.length && only.indexOf(item.name) === -1) continue;
        const started = Date.now();
        let ok = true;
        let detail = '';
        try {
          await item.fn(ctx);
        } catch (e) {
          ok = false;
          detail = (e && e.message) ? e.message : String(e);
        }
        results.push({ name: item.name, ok: ok, detail: detail, ms: Date.now() - started });
      }
      return results;
    }
  };
}

module.exports = { createSuite: createSuite, assert: assert };
