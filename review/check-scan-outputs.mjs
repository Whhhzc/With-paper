import { connect, check, folder } from './browser-session.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const out = path.join(folder, 'image-tools-results'); await mkdir(out, { recursive: true });
const b = await connect(), checks = [];
try {
  // Compare actual PDF.js renders of the raster and searchable exports.
  const raster = [...await readFile(path.join(out, 'scan-raster.pdf'))], searchable = [...await readFile(path.join(out, 'scan-searchable.pdf'))];
  const equal = await b.evaluate(`(async()=>{const a=await Media.pdf(new File([new Uint8Array(${JSON.stringify(raster)})],'a.pdf')),b=await Media.pdf(new File([new Uint8Array(${JSON.stringify(searchable)})],'b.pdf'));try{const x=await Media.page(a,1,1),y=await Media.page(b,1,1);if(x.width!==y.width||x.height!==y.height)return false;const p=x.getContext('2d').getImageData(0,0,x.width,x.height).data,q=y.getContext('2d').getImageData(0,0,y.width,y.height).data;return p.every((v,i)=>v===q[i])}finally{await a.destroy();await b.destroy()}})()`);
  check(equal, 'OCR text layer changes visible output'); checks.push('Searchable and raster PDF exports render pixel-identically');
  const fixture = await b.evaluate(`(async()=>{const c=document.createElement('canvas');c.width=c.height=1000;const x=c.getContext('2d'),p=x.createImageData(1000,1000);for(let y=0;y<1000;y++)for(let z=0;z<1000;z++){const i=(y*1000+z)*4,v=(y-100)/(462.5+.375*y),u=(z*(1-.375*v)+187.5*v-250)/500;let color=[40,45,50];if(u>=0&&u<=1&&v>=0&&v<=1){color=[245,245,245];if(u<.15&&v<.15)color=[220,20,20];if(u>.85&&v<.15)color=[20,200,20];if(u>.85&&v>.85)color=[20,20,220];if(u<.15&&v>.85)color=[230,200,20];if(Math.abs(u-.5)<.006||Math.abs(v-.5)<.006)color=[10,10,10]}p.data.set([...color,255],i)}x.putImageData(p,0,0);return Array.from(new Uint8Array(await(await Media.blob(c)).arrayBuffer()))})()`);
  const filename = path.join(out, 'trapezoid.png'); await writeFile(filename, new Uint8Array(fixture));
  await b.navigate('scan-document'); await b.upload([filename]); await b.until('state.files.length===1');
  for (const [i,x,y] of [[0,25,10],[1,75,10],[2,90,90],[3,10,90]]) { await b.input(`[data-point="${i}"][data-axis="x"]`,x); await b.input(`[data-point="${i}"][data-axis="y"]`,y); }
  await b.input('#scan-filter','original'); await b.input('#scan-output','png'); await b.click('[data-im="run"]'); await b.until('state.phase==="result"');
  await b.saveBlob('.output-row a[download]',path.join(out,'rectified-trapezoid.png'));
  check(await b.evaluate(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob(),m=await createImageBitmap(blob),c=new OffscreenCanvas(m.width,m.height),x=c.getContext('2d');x.drawImage(m,0,0);const samples=[[.05,.05,220,20,20],[.95,.05,20,200,20],[.95,.95,20,20,220],[.05,.95,230,200,20]];return samples.every(([u,v,r,g,b])=>{const p=x.getImageData(Math.floor(u*m.width),Math.floor(v*m.height),1,1).data;return Math.abs(p[0]-r)<3&&Math.abs(p[1]-g)<3&&Math.abs(p[2]-b)<3})})()`),'Trapezoid corner colors'); checks.push('Projective photo rectification restores all four independent colored landmarks');
  await b.shot('scan-perspective-result.png');
  await b.click('[data-im="back"]'); await b.input('[data-point="0"][data-axis="x"]','101'); await b.click('[data-im="run"]');
  check(await b.evaluate('state.phase==="select"&&document.querySelector("#file-feedback").textContent.includes("0–100")&&!document.querySelector(".output-row")'),'Out-of-range corner input rejected'); checks.push('Invalid numeric corner input blocks processing and retains correction field');
  await b.click('[data-im="full"]');
  const second=path.join(out,'second-page.png'); await b.upload([second]); await b.until('state.files.length===2');
  await b.input('#scan-output','pdf'); await b.click('[data-im="run"]'); await b.until('state.phase==="result"');
  await b.saveBlob('.output-row a[download]',path.join(out,'two-pages.pdf'));
  check(await b.evaluate(`(async()=>{const blob=await(await fetch(document.querySelector('.output-row a[download]').href)).blob(),d=await Media.pdf(blob);try{return d.numPages===2}finally{await d.destroy()}})()`),'Two-page scanned PDF'); checks.push('Multi-page scan PDF opens with both pages');
  await b.navigate('image-tools');
  const duplicateDirs=['a','b']; for(const dir of duplicateDirs){await mkdir(path.join(out,dir),{recursive:true});await writeFile(path.join(out,dir,'duplicate.png'),await readFile(second));}
  await b.upload(duplicateDirs.map(dir=>path.join(out,dir,'duplicate.png')));await b.until('state.files.length===2');await b.click('[data-im="run"]');await b.until('state.phase==="result"');
  check(await b.evaluate('new Set(Array.from(document.querySelectorAll(".output-row a[download]")).map(a=>a.download)).size===2'),'Duplicate names');checks.push('Duplicate source filenames export under distinct names');
  await b.click('[data-im="clear"]');const broken=path.join(out,'broken.png');await writeFile(broken,'not an image');await b.upload([broken]);
  await b.until('state.phase==="select"&&!!document.querySelector("#file-feedback").textContent');
  check(await b.evaluate('state.files.length===0&&document.querySelector("#run-button").disabled'),'Corrupt image');checks.push('Corrupt image reports a readable error without an output');
  check(!b.errors.length,JSON.stringify(b.errors));await writeFile(path.join(out,'output-checks.json'),JSON.stringify({status:'passed',checks,errors:b.errors},null,2));console.log(`PASS: ${checks.length} scan/output checks`);
}finally{b.close();}
