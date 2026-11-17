// ============================================================================
// Images of real text for the offline OCR tests, drawn by Chromium.
//
// The main suites run in the test runner's Electron main process, which has
// no canvas; a hidden window draws each image and hands back its PNG.
// Latin capitals in a plain sans-serif face read reliably with the `eng`
// model, so a test can tell the images apart by what was read.
// ============================================================================

'use strict';

/**
 * @param {Array<{lines: string[], width?: number}>} specs one image each
 * @returns {Promise<Buffer[]>} PNGs, in the order of `specs`
 */
async function textPngs(specs) {
  const { BrowserWindow } = require('electron');
  const win = new BrowserWindow({ show: false, width: 400, height: 300, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  try {
    await win.loadURL('data:text/html;charset=utf-8,<!doctype html><html><body></body></html>');
    const urls = await win.webContents.executeJavaScript('(' + function (list) {
      return list.map(function (spec) {
        const w = spec.width || 900;
        const lh = 56;
        const c = document.createElement('canvas');
        c.width = w;
        c.height = 60 + spec.lines.length * lh;
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = '#000'; x.font = '40px Arial, sans-serif'; x.textBaseline = 'top';
        spec.lines.forEach(function (line, i) { x.fillText(line, 30, 30 + i * lh); });
        return c.toDataURL('image/png');
      });
    }.toString() + ')(' + JSON.stringify(specs) + ')');
    return urls.map(function (u) { return Buffer.from(u.replace(/^data:image\/png;base64,/, ''), 'base64'); });
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

module.exports = { textPngs };
