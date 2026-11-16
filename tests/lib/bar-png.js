// ============================================================================
// A white PNG with a black bar, RGB, written by hand (no image library) — an
// image the offline OCR engine can read in a test or a package check without
// the network or a canvas. Used by tests/main/ocr-engine.js,
// tests/main/ocr-unpacked.js and scripts/check-package.js.
// ============================================================================

'use strict';

const zlib = require('zlib');

function barPng(w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    if (y > h / 2 - 5 && y < h / 2 + 5) {
      for (let x = 20; x < w - 20; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = raw[i + 1] = raw[i + 2] = 0; }
    }
  }
  const table = [];
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(w, 0); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

module.exports = { barPng };
