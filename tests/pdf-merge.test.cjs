const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
global.PDFLib = require('pdf-lib');
require('../pdf-engine.js');
const { PDFDocument, StandardFonts, degrees, rgb, PDFName, PDFString } = global.PDFLib;
const folder = path.resolve(__dirname, '../review/merge-fixtures');

async function makePdf(name, labels, landscape = false) {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  const image = await document.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=', 'base64'));
  labels.forEach((label, index) => {
    const page = document.addPage(landscape ? [842, 595] : [595, 842]);
    page.drawText(label, { x: 60, y: 400, size: 26, font, color: rgb(.1, .25, .6) });
    page.drawRectangle({ x: 60, y: 250, width: 170, height: 80, color: rgb(.2, .7, .3) });
    page.drawImage(image, { x: 250, y: 250, width: 70, height: 70 });
    if (index === 1 && !landscape) page.setRotation(degrees(90));
    if (index === 1 && landscape) page.setCropBox(20, 30, 700, 500);
  });
  const bytes = await document.save();
  return new File([bytes], name, { type: 'application/pdf' });
}

test('merges real pages in supplied order and preserves dimensions, rotation, crop boxes and original files', async () => {
  await fs.mkdir(folder, { recursive: true });
  const a = await makePdf('A.pdf', ['A FIRST', 'A SECOND']);
  const b = await makePdf('B.pdf', ['B FIRST', 'B SECOND'], true);
  const originals = await Promise.all([a.arrayBuffer(), b.arrayBuffer()]);
  const inspected = await PdfMerge.inspect([a, b]);
  assert.deepEqual(inspected.entries.map(entry => entry.pages), [2, 2]);
  const progress = [];
  const result = await PdfMerge.merge([b, a], event => progress.push(event));
  const output = await PDFDocument.load(result.bytes);
  assert.equal(result.pages, 4);
  assert.deepEqual(output.getPages().map(page => page.getSize()), [{ width: 842, height: 595 }, { width: 842, height: 595 }, { width: 595, height: 842 }, { width: 595, height: 842 }]);
  assert.deepEqual(output.getPages().map(page => page.getRotation().angle), [0, 0, 0, 90]);
  assert.deepEqual(output.getPage(1).getCropBox(), { x: 20, y: 30, width: 700, height: 500 });
  assert.deepEqual(Buffer.from(await a.arrayBuffer()), Buffer.from(originals[0]));
  assert.deepEqual(Buffer.from(await b.arrayBuffer()), Buffer.from(originals[1]));
  assert.equal(progress.at(-1).done, 2);
  await Promise.all([
    fs.writeFile(path.join(folder, 'A.pdf'), Buffer.from(originals[0])),
    fs.writeFile(path.join(folder, 'B.pdf'), Buffer.from(originals[1])),
    fs.writeFile(path.join(folder, 'merged-B-A.pdf'), result.bytes),
  ]);
});

test('reports individual unreadable, empty, encrypted and interactive-form PDFs without hiding valid files', async () => {
  await fs.mkdir(folder, { recursive: true });
  const bad = new File(['not a pdf'], 'broken.pdf');
  const emptyDoc = await PDFDocument.create();
  const empty = new File([await emptyDoc.save({ addDefaultPage: false })], 'empty.pdf');
  const formDoc = await PDFDocument.create();
  const page = formDoc.addPage();
  formDoc.getForm().createTextField('name').addToPage(page);
  const form = new File([await formDoc.save()], 'form.pdf');
  // A declared encryption dictionary verifies that encryption is never bypassed.
  const encryptedDoc = await PDFDocument.create();
  encryptedDoc.addPage();
  const encryption = encryptedDoc.context.obj({ Filter: 'Standard', V: 1, R: 2, Length: 40, P: -4 });
  encryption.set(PDFName.of('O'), PDFString.of('0'.repeat(32)));
  encryption.set(PDFName.of('U'), PDFString.of('0'.repeat(32)));
  encryptedDoc.context.trailerInfo.Encrypt = encryptedDoc.context.register(encryption);
  const encrypted = new File([await encryptedDoc.save()], 'encrypted-marker.pdf');
  const good = await makePdf('valid.pdf', ['VALID']);
  const inspected = await PdfMerge.inspect([bad, empty, encrypted, form, good]);
  assert.match(inspected.entries[0].error, /broken.pdf/);
  assert.match(inspected.entries[1].error, /没有可处理/);
  assert.match(inspected.entries[2].error, /已加密/);
  assert.match(inspected.entries[3].error, /交互表单/);
  assert.equal(inspected.entries[4].pages, 1);
  await assert.rejects(PdfMerge.merge([good, bad]), /broken.pdf/);
  await Promise.all([bad, empty, form, encrypted].map(async file => fs.writeFile(path.join(folder, file.name), Buffer.from(await file.arrayBuffer()))));
});

test('example files are real multi-page PDFs and merge into four pages', async () => {
  const { entries } = await PdfMerge.samples();
  const files = entries.map(entry => new File([entry.bytes], entry.name, { type: 'application/pdf' }));
  assert.deepEqual(entries.map(entry => entry.pages), [2, 1, 1]);
  const result = await PdfMerge.merge(files);
  assert.equal((await PDFDocument.load(result.bytes)).getPageCount(), 4);
});
