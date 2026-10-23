import { connect, check, folder } from './browser-session.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
const out = path.join(folder, 'image-tools-results'); await mkdir(out, { recursive: true });
const b = await connect(), checks = [];
async function verify(expression, label) { check(await b.evaluate(expression), label); checks.push(label); }
async function save(name, selector = '.output-row a[download]') { const dest = path.join(out, name); await b.saveBlob(selector, dest); return readFile(dest); }
async function run() { await b.click('[data-im="run"]'); await b.until('state.phase==="result"', 120); }
async function back() { await b.click('[data-im="back"]'); }
async function clear() { await b.click('[data-im="clear"]'); }
async function fixture(name, expression) {
  const bytes = await b.evaluate(`(async()=>{const blob=await(${expression});return Array.from(new Uint8Array(await blob.arrayBuffer()))})()`);
  const filename = path.join(out, name); await writeFile(filename, new Uint8Array(bytes)); return filename;
}
try {
  await verify('tools.length===17&&new Set(tools.map(t=>t.icon)).size===17&&new Set(tools.map(t=>fileBadge(t))).size===17', 'All 17 catalog tools have distinct SVG icons');
  const noise = await fixture('noise.jpg', `(async()=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const x=c.getContext('2d'),p=x.createImageData(c.width,c.height);let seed=17;for(let i=0;i<p.data.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)|0;p.data[i]=seed&255;p.data[i+1]=(seed>>>8)&255;p.data[i+2]=(seed>>>16)&255;p.data[i+3]=255}x.putImageData(p,0,0);return Media.blob(c,'image/jpeg',.98)})()`);
  const alpha = await fixture('transparent.png', `(async()=>{const c=document.createElement('canvas');c.width=120;c.height=80;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(60,0,60,80);return Media.blob(c)})()`);
  const paper = await fixture('paper.png', `(async()=>{const sample=await Media.sampleImage(),bitmap=await createImageBitmap(sample),c=document.createElement('canvas');c.width=1500;c.height=1100;const x=c.getContext('2d');x.fillStyle='#303946';x.fillRect(0,0,c.width,c.height);x.drawImage(bitmap,150,150);bitmap.close();return Media.blob(c)})()`);
  const second = path.join(out, 'second-page.png'); await writeFile(second, await readFile(paper));
  await b.navigate('image-tools');
  await verify('document.querySelector("#run-button").disabled&&document.querySelector("[data-im=preview]").disabled', 'Empty image workspace disables processing and preview');
  await b.upload([noise]); await b.until('state.files.length===1');
  await b.input('#im-width', '800'); await b.input('#im-quality', '75'); await b.click('[data-im="preview"]');
  await b.until('!!document.querySelector(".image-comparison figure:nth-child(2) img")');
  await verify('document.querySelector(".image-comparison").textContent.includes("800 × 600")', 'Compression preview reports actual proportional output dimensions');
  await run(); await save('compressed.jpg');
  await verify(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob(),m=await createImageBitmap(blob);return blob.type==='image/jpeg'&&m.width===800&&m.height===600&&blob.size<state.files[0].file.size})()`, 'Actual JPG output has requested dimensions and reduced bytes');
  await back(); await b.input('#im-width', ''); await b.input('#im-target', '50'); await run(); await save('target-50kb.jpg');
  await verify(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob();return blob.size<=50*1024})()`, 'Target-size compression produces an actual file within 50 KB');
  await back(); await b.input('#im-width', '-1'); await b.click('[data-im="run"]'); await b.until('state.phase==="select"&&!!document.querySelector("#file-feedback").textContent'); checks.push('Negative dimensions are rejected');
  await b.input('#im-width', ''); await b.input('#im-target', ''); await clear(); await b.upload([alpha]); await b.until('state.files.length===1');
  await b.input('#im-format', 'png'); await run(); await save('alpha.png');
  await verify(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob(),m=await createImageBitmap(blob),c=new OffscreenCanvas(m.width,m.height),x=c.getContext('2d');x.drawImage(m,0,0);return blob.type==='image/png'&&x.getImageData(5,5,1,1).data[3]===0})()`, 'PNG conversion retains true transparent pixels');
  await back(); await b.input('#im-format', 'jpg'); await b.input('#im-background', '#00ff00'); await run(); await save('alpha-green.jpg');
  await verify(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob(),m=await createImageBitmap(blob),c=new OffscreenCanvas(m.width,m.height),x=c.getContext('2d');x.drawImage(m,0,0);const p=x.getImageData(5,5,1,1).data;return p[1]>230&&p[0]<30&&p[2]<30&&p[3]===255})()`, 'Transparent pixels use the selected background on JPG export');
  await back(); await b.input('#im-format', 'webp'); await run(); await save('converted.webp');
  await verify(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob();return blob.type==='image/webp'&&document.querySelector('.output-row a[download]').download.endsWith('.webp')})()`, 'WebP output has correct actual MIME and filename');
  await back(); await clear(); await b.upload([paper, second]); await b.until('state.files.length===2'); await b.input('#im-format', 'png'); await run();
  await verify(`document.querySelectorAll('.output-row').length===2&&!!document.querySelector('a[download$=".zip"]')`, 'Batch image conversion offers per-file downloads and ZIP');
  check(Object.keys(unzipSync(await save('images.zip', 'a[download$=".zip"]'))).length === 2, 'ZIP contains both processed images'); checks.push('Generated ZIP has two valid entries');
  await b.shot('image-tools-desktop.png');
  await b.navigate('scan-document'); await b.upload([paper, second]); await b.until('state.files.length===2');
  await verify('document.querySelectorAll("[data-corner]").length===4&&document.querySelector("#camera-input").getAttribute("capture")==="environment"', 'Scanner supports four-corner editing and native phone capture input');
  await b.click('[data-im="detect"]'); await b.until('state.phase==="select"&&document.querySelectorAll("[data-corner]").length===4');
  await verify(`(()=>{const p=Array.from(document.querySelector('.scan-stage polygon').points).map(p=>({x:p.x,y:p.y}));return p[0].x>8&&p[0].x<13&&p[0].y>10&&p[0].y<16&&p[2].x>87&&p[2].x<92})()`, 'Automatic paper detection locates a real bright sheet on a dark background');
  // Use exact known paper edges for independent output/OCR assertions.
  for (const [point, x, y] of [[0,10,150/11],[1,90,150/11],[2,90,950/11],[3,10,950/11]]) {
    await b.input(`[data-point="${point}"][data-axis="x"]`, x); await b.input(`[data-point="${point}"][data-axis="y"]`, y);
  }
  await b.input('#scan-filter', 'original'); await b.click('[data-im="preview"]'); await b.until('!!document.querySelector(".scan-result-preview")'); await b.shot('scan-document-desktop.png');
  await verify('document.querySelector(".scan-result-preview").naturalWidth>1150&&document.querySelector(".scan-result-preview").naturalWidth<1250', 'Rectified preview crops the expected paper width');
  await b.evaluate(`document.querySelector('[data-corner="0"]').focus()`);
  const before = await b.evaluate('document.querySelector(".scan-stage polygon").points[0].x');
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight' }); await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight' });
  check(await b.evaluate('document.querySelector(".scan-stage polygon").points[0].x') > before, 'Keyboard moves crop point'); checks.push('Keyboard arrow adjustment works');
  await b.input('[data-point="0"][data-axis="x"]', '10');
  const point = await b.evaluate(`(()=>{const r=document.querySelector('[data-corner="0"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await b.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x+6, y: point.y+4, button: 'left', buttons: 1 });
  await b.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x+6, y: point.y+4, button: 'left', clickCount: 1 });
  await verify('document.querySelector(".scan-stage polygon").points[0].x>10', 'Real pointer dragging changes the crop corner');
  await b.input('[data-point="0"][data-axis="x"]', '10'); await b.input('[data-point="0"][data-axis="y"]', 150/11);
  await b.click('[data-im="move"][data-index="0"][data-direction="1"]');
  await verify('state.files[0].name==="second-page.png"&&document.querySelector(".image-current-title").textContent.includes("paper.png")', 'Page reordering preserves the selected page and its crop');
  await b.click('[data-im="select"][data-index="0"]'); await b.click('[data-im="rotate"]'); await b.until('state.phase==="select"&&document.querySelector(".image-current-title").textContent.includes("1100 × 1500")'); checks.push('Rotation swaps real source dimensions');
  await b.click('[data-im="remove"][data-index="0"]');
  await b.input('#scan-output', 'png'); await run(); await save('scan-original.png');
  await back(); await b.input('#scan-filter', 'bw'); await run(); await save('scan-bw.png');
  await verify(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob(),m=await createImageBitmap(blob),c=new OffscreenCanvas(m.width,m.height),x=c.getContext('2d');x.drawImage(m,0,0);const p=x.getImageData(0,0,m.width,m.height).data;for(let i=0;i<p.length;i+=4)if(![0,255].includes(p[i])||p[i]!==p[i+1]||p[i]!==p[i+2])return false;return true})()`, 'Black-and-white scan exports true binary grayscale pixels');
  await back(); await b.input('#scan-filter', 'original'); await b.input('#scan-output', 'pdf'); await b.input('#im-name', '扫描测试'); await run(); await save('scan-raster.pdf');
  await verify(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob(),d=await Media.pdf(blob);try{const p=await d.getPage(1);return d.numPages===1&&(await p.getTextContent()).items.length===0}finally{await d.destroy()}})()`, 'Standard scan PDF opens as an image-only page');
  await back(); await b.input('#scan-output', 'searchable'); await run(); await save('scan-searchable.pdf');
  await verify(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob(),d=await Media.pdf(blob);try{const p=await d.getPage(1),t=(await p.getTextContent()).items.map(i=>i.str).join('').replace(/\\s/g,'');return t.includes('办公会议记录')&&t.includes('Office')&&t.includes('2026-1021')}finally{await d.destroy()}})()`, 'Actual exported searchable PDF contains Chinese, English and reference numbers');
  await b.shot('scan-searchable-result.png');
  await back(); await b.input('#scan-output', 'txt'); await run(); const text = (await save('scan-text.txt')).toString('utf8');
  check(text.includes('Office') && text.replace(/\s/g,'').includes('办公会议记录'), 'TXT has real OCR content'); checks.push('TXT export contains real Chinese and English OCR');
  await back(); await b.input('[data-point="0"][data-axis="x"]', '95'); await b.click('[data-im="run"]');
  await b.until('state.phase==="select"&&document.querySelector("#file-feedback").textContent.includes("交叉")'); checks.push('Crossed crop corners are rejected before export');
  await b.click('[data-im="full"]'); await b.input('#scan-output', 'searchable'); await b.click('[data-im="run"]');
  await b.until('document.querySelector("#progress-label")?.textContent.includes("识别")', 30); await b.click('[data-im="cancel"]');
  await verify('state.phase==="select"&&!document.querySelector(".output-row")', 'Cancelling OCR leaves no stale output');
  await b.click('[data-im="run"]'); await b.navigate('home'); await verify('!state.tool&&!document.querySelector(".output-row")', 'Navigation aborts active scanning');
  await b.navigate('scan-document'); await b.upload([paper]); await b.until('state.files.length===1');
  for (const [width,height] of [[375,812],[812,375]]) {
    await b.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: true });
    await verify('document.documentElement.scrollWidth<=innerWidth', `Scanner has no horizontal overflow at ${width} px`);
  }
  await b.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 1, mobile: true }); await b.shot('scan-document-mobile.png');
  await b.navigate('image-tools'); await b.upload([noise]); await b.until('state.files.length===1');
  await verify('document.documentElement.scrollWidth<=innerWidth', 'Image settings have no mobile overflow'); await b.shot('image-tools-mobile.png');
  check(!b.errors.length, JSON.stringify(b.errors));
  const external = b.requests.filter(r => /^https?:/.test(r.url) && new URL(r.url).origin !== new URL(process.env.OFFICE_TEST_URL).origin);
  check(!external.length && !b.requests.some(r => !['GET','HEAD'].includes(r.method)), 'No external requests or uploads'); checks.push('No external requests or document uploads observed');
  await writeFile(path.join(out, 'browser-checks.json'), JSON.stringify({ status: 'passed', checks, errors: b.errors, external }, null, 2));
  console.log(`PASS: ${checks.length} image/scanner browser checks`);
} finally { b.close(); }
