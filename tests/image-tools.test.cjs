const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
require('../image-engine.js');
const engine = global.ImageEngine;
function pixels(width, height, color) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data.set(color(x, y), (y * width + x) * 4);
  return { width, height, data };
}
test('resize bounds preserve ratio, allow explicit stretching, and reject invalid or excessive dimensions', () => {
  assert.deepEqual(engine.dimensions(4000, 3000, { width: 1200, height: 600 }), { width: 800, height: 600 });
  assert.deepEqual(engine.dimensions(4000, 3000, { width: 1200 }), { width: 1200, height: 900 });
  assert.deepEqual(engine.dimensions(4000, 3000, { width: 1200, height: 600, keepRatio: false }), { width: 1200, height: 600 });
  assert.throws(() => engine.dimensions(100, 100, { width: -1 }), /整数/);
  assert.throws(() => engine.dimensions(100, 100, { width: 10000 }), /3200/);
});
test('perspective mapping matches all four independently known destination corners and rejects crossed regions', () => {
  const corners = [{ x: .12, y: .18 }, { x: .9, y: .1 }, { x: .81, y: .88 }, { x: .2, y: .93 }];
  const matrix = engine.homography(corners);
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => {
    const p = engine.project(matrix, u, v); assert.ok(Math.abs(p.x - corners[i].x) < 1e-9); assert.ok(Math.abs(p.y - corners[i].y) < 1e-9);
  });
  assert.throws(() => engine.validateCorners([corners[0], corners[2], corners[1], corners[3]]), /交叉/);
  assert.throws(() => engine.validateCorners(corners.map(p => ({ ...p, x: -1 }))), /范围/);
});
test('rectification crops known source pixels, keeps identity pixels and composites alpha over white', () => {
  const source = pixels(9, 9, (x, y) => [x * 20, y * 20, 70, 255]);
  const identity = engine.warp(source, engine.fullCorners()); assert.deepEqual(identity, source);
  const result = engine.warp(source, [{ x: .25, y: .25 }, { x: .75, y: .25 }, { x: .75, y: .75 }, { x: .25, y: .75 }]);
  assert.equal(result.width, 5); assert.equal(result.height, 5);
  assert.deepEqual([...result.data.slice(0, 4)], [40, 40, 70, 255]);
  assert.deepEqual([...result.data.slice(-4)], [120, 120, 70, 255]);
  const transparent = engine.warp(pixels(4, 4, () => [0, 0, 0, 0]), engine.fullCorners()); assert.ok(transparent.data.every(n => n === 255));
});
test('scan filters retain neutral original, convert grayscale and produce only black/white pixels', () => {
  const original = pixels(40, 30, (x, y) => [x < 15 ? 30 : 230, y < 10 ? 50 : 200, 120, 255]);
  assert.deepEqual(engine.filter(structuredClone(original), 'original'), original);
  const gray = engine.filter(structuredClone(original), 'gray');
  const bw = engine.filter(structuredClone(original), 'bw');
  for (let i = 0; i < gray.data.length; i += 4) { assert.equal(gray.data[i], gray.data[i + 1]); assert.equal(gray.data[i], gray.data[i + 2]); assert.ok([0, 255].includes(bw.data[i])); assert.equal(bw.data[i], bw.data[i + 1]); }
  assert.ok(bw.data.some((v, i) => i % 4 !== 3 && v === 0));
});
test('best-effort paper detection finds a bright sheet and declines a uniform background', () => {
  const image = pixels(200, 150, (x, y) => x >= 30 && x <= 170 && y >= 20 && y <= 130 ? [240, 240, 235, 255] : [40, 45, 50, 255]);
  const corners = engine.detect(image); assert.ok(corners);
  assert.ok(Math.abs(corners[0].x - 30 / 199) < .01); assert.ok(Math.abs(corners[2].y - 130 / 149) < .01);
  assert.equal(engine.detect(pixels(50, 40, () => [255, 255, 255, 255])), null);
});
test('searchable PDF preserves page images and uses invisible text with a subset Unicode font', async () => {
  global.PDFLib = require('pdf-lib'); global.fontkit = require('@pdf-lib/fontkit'); require('../scan-pdf-engine.js');
  const image = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=', 'base64'));
  const layout = { blocks: [{ paragraphs: [{ lines: [{ text: '合同金额 12345.60 元', confidence: 65, bbox: { x0: 0, y0: 0, x1: 1, y1: 1 } }] }] }] };
  const result = await global.PdfScan.build([{ bytes: image, layout }, { bytes: image, layout }], () => {}, { searchable: true, pageSize: 'a4', fontBytes: await readFile('vendor/content/NotoSansSC-Regular.otf') });
  const { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream } = global.PDFLib;
  const document = await PDFDocument.load(result.bytes); assert.equal(document.getPageCount(), 2);
  assert.equal(result.report.characters, 30); assert.equal(result.report.lowConfidence, 2); assert.equal(result.report.skippedCharacters, 0);
  const page = document.getPage(0), contents = page.node.Contents();
  const stream = contents instanceof PDFArray ? contents.lookup(0, PDFRawStream) : contents;
  const operators = Buffer.from(decodePDFRawStream(stream).decode()).toString();
  assert.match(operators, /3 Tr/); assert.match(operators, /Tz/); assert.match(operators, /Do/); assert.match(operators, /Tj/);
  const raster = await global.PdfScan.build([{ bytes: image }], () => {}, { pageSize: 'fit' });
  const rasterDocument = await PDFDocument.load(raster.bytes); assert.equal(rasterDocument.getPage(0).getWidth(), .75);
});
