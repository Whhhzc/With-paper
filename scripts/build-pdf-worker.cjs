const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const library = path.dirname(require.resolve('pdf-lib/package.json'));
const source = [
  fs.readFileSync(path.join(library, 'dist/pdf-lib.min.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'node_modules/fflate/umd/index.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'pdf-engine.js'), 'utf8'),
  fs.readFileSync(path.join(root, 'pdf-worker.js'), 'utf8'),
].join('\n');
fs.mkdirSync(path.join(root, 'vendor'), { recursive: true });
fs.writeFileSync(path.join(root, 'vendor/pdf-worker-source.js'), `/* Built from pdf-lib 1.17.1 (MIT) and local PDF worker sources. */\nwindow.pdfWorkerSource = ${JSON.stringify(source)};\n`);
fs.copyFileSync(path.join(library, 'LICENSE.md'), path.join(root, 'vendor/pdf-lib-LICENSE.md'));
fs.copyFileSync(path.join(root, 'node_modules/fflate/LICENSE'), path.join(root, 'vendor/fflate-LICENSE'));
console.log('Built local PDF worker; no CDN or worker network requests required.');
