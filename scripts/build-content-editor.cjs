const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'vendor/content');
fs.mkdirSync(out, { recursive: true });

// Losslessly unpack the WOFF1 container into its original OpenType tables.
const woff = fs.readFileSync(path.join(root, 'node_modules/@fontsource/noto-sans-sc/files/noto-sans-sc-all-400-normal.woff'));
const tables = woff.readUInt16BE(12);
const font = Buffer.alloc(woff.readUInt32BE(16));
woff.copy(font, 0, 4, 8); font.writeUInt16BE(tables, 4);
const power = 2 ** Math.floor(Math.log2(tables));
font.writeUInt16BE(power * 16, 6); font.writeUInt16BE(Math.log2(power), 8); font.writeUInt16BE(tables * 16 - power * 16, 10);
let offset = 12 + tables * 16;
for (let index = 0; index < tables; index++) {
  const from = 44 + index * 20, to = 12 + index * 16;
  const dataOffset = woff.readUInt32BE(from + 4), compressed = woff.readUInt32BE(from + 8), length = woff.readUInt32BE(from + 12);
  const bytes = woff.subarray(dataOffset, dataOffset + compressed);
  const data = compressed === length ? bytes : zlib.inflateSync(bytes);
  woff.copy(font, to, from, from + 4); font.writeUInt32BE(woff.readUInt32BE(from + 16), to + 4);
  font.writeUInt32BE(offset, to + 8); font.writeUInt32BE(length, to + 12);
  data.copy(font, offset); offset += (length + 3) & ~3;
}
fs.writeFileSync(path.join(out, 'NotoSansSC-Regular.otf'), font);
fs.copyFileSync(path.join(root, 'node_modules/@embedpdf/pdfium/dist/pdfium.wasm'), path.join(out, 'pdfium.wasm'));
for (const file of ['LICENSE', 'LICENSE.pdfium']) fs.copyFileSync(path.join(root, 'node_modules/@embedpdf/pdfium', file), path.join(out, file));
// The upstream package declares MIT in its README/package metadata but ships no LICENSE file.
fs.copyFileSync(path.join(root, 'node_modules/@pdf-lib/fontkit/README.md'), path.join(out, 'fontkit-NOTICE.md'));
fs.copyFileSync(path.join(root, 'node_modules/@pdf-lib/fontkit/package.json'), path.join(out, 'fontkit-package.json'));
fs.copyFileSync(path.join(root, 'node_modules/@pdf-lib/fontkit/dist/fontkit.umd.min.js'), path.join(out, 'fontkit.umd.min.js'));
fs.copyFileSync(path.join(root, 'licenses/NotoSansSC-OFL.txt'), path.join(out, 'OFL-NotoSansSC.txt'));
if (fs.existsSync(path.join(root, 'content-worker.js'))) {
  esbuild.buildSync({ entryPoints: [path.join(root, 'content-worker.js')], bundle: true, format: 'esm', platform: 'browser', target: 'es2022', minify: true, outfile: path.join(out, 'worker.js') });
}
console.log(`Built PDFium and open Chinese font (${font.length} bytes).`);
