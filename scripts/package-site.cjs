const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');
// Deployment builds start from a fresh checkout. Copy only the runtime site, not review files.
fs.mkdirSync(output, { recursive: true });
for (const name of ['index.html', 'styles.css', 'image-tools.css', 'app.js', 'local-job.js', 'media.js', 'word-engine.js', 'word-converter.js', 'image-engine.js', 'image-worker.js', 'image-tools.js', 'merge.js', 'tools.js', 'editor.js', 'THIRD-PARTY.md']) {
  fs.copyFileSync(path.join(root, name), path.join(output, name));
}
fs.cpSync(path.join(root, 'vendor'), path.join(output, 'vendor'), { recursive: true });
if (fs.existsSync(path.join(root, 'assets'))) fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
console.log('Static website packaged in dist/.');
