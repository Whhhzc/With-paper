const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const destination = path.join(root, 'vendor');
const pkg = name => path.join(root, 'node_modules', name);
async function build() {
  await esbuild.build({ entryPoints: [pkg('pdfjs-dist/build/pdf.mjs')], bundle: true, format: 'iife', globalName: 'PdfRenderer', platform: 'browser', target: 'es2022', minify: true, external: ['node:*'], outfile: path.join(destination, 'pdf-renderer.js') });
  const worker = await esbuild.build({ entryPoints: [pkg('pdfjs-dist/build/pdf.worker.mjs')], bundle: true, format: 'iife', platform: 'browser', target: 'es2022', minify: true, external: ['node:*'], write: false });
  fs.writeFileSync(path.join(destination, 'pdf-renderer-worker.js'), `window.pdfRendererSource=${JSON.stringify(worker.outputFiles[0].text)};\n`);
  for (const name of ['cmaps', 'standard_fonts', 'wasm', 'iccs']) fs.cpSync(pkg(`pdfjs-dist/${name}`), path.join(destination, 'pdfjs', name), { recursive: true });
  fs.copyFileSync(pkg('pdfjs-dist/LICENSE'), path.join(destination, 'pdfjs/LICENSE'));
  fs.mkdirSync(path.join(destination, 'ocr/lang'), { recursive: true });
  for (const file of ['tesseract.min.js', 'worker.min.js', 'worker.min.js.LICENSE.txt', 'tesseract.min.js.LICENSE.txt']) fs.copyFileSync(pkg(`tesseract.js/dist/${file}`), path.join(destination, 'ocr', file));
  for (const file of fs.readdirSync(pkg('tesseract.js-core')).filter(name => /-lstm\.wasm(?:\.js)?$/.test(name))) fs.copyFileSync(pkg(`tesseract.js-core/${file}`), path.join(destination, 'ocr', file));
  for (const file of fs.readdirSync(path.join(destination, 'ocr')).filter(name => /^tesseract-core(?:-simd|-relaxedsimd)?\.wasm(?:\.js)?$/.test(name))) fs.unlinkSync(path.join(destination, 'ocr', file));
  fs.copyFileSync(pkg('tesseract.js/LICENSE.md'), path.join(destination, 'ocr/LICENSE-tesseract.md'));
  fs.copyFileSync(pkg('tesseract.js-core/LICENSE'), path.join(destination, 'ocr/LICENSE-core'));
  for (const language of ['eng', 'chi_sim']) {
    fs.copyFileSync(pkg(`@tesseract.js-data/${language}/4.0.0_best_int/${language}.traineddata.gz`), path.join(destination, 'ocr/lang', `${language}.traineddata.gz`));
  }
  fs.copyFileSync(pkg('tesseract.js-core/LICENSE'), path.join(destination, 'ocr/lang/LICENSE-APACHE-2.0'));
  fs.writeFileSync(path.join(destination, 'ocr-worker-source.js'), `window.ocrWorkerSource=${JSON.stringify(fs.readFileSync(path.join(root, 'ocr-worker.js'), 'utf8'))};\n`);
  console.log('Built local PDF renderer, OCR core and language-model assets.');
}
build().catch(error => { console.error(error); process.exitCode = 1; });
