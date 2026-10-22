import {connect,check,folder} from './browser-session.mjs';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
const b=await connect();const layouts=[];
await b.navigate('home');
check(await b.evaluate('document.querySelectorAll(".tool-card").length===6'),'Six common tools');
check(await b.evaluate('document.querySelectorAll(".nav-link").length===14'),'Fourteen available tools');
await b.input('#tool-search','\u63d0\u53d6\u6587\u5b57');check(await b.evaluate('document.querySelectorAll(".tool-row").length===2'),'OCR search');
await b.input('#tool-search','does-not-exist');check(await b.evaluate('!!document.querySelector(".empty-results")'),'Empty search');
await b.navigate('home');await b.click('[data-action="help"]');check(await b.evaluate('document.querySelector("dialog").open'),'Help dialog');
await b.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await b.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
check(await b.evaluate('!document.querySelector("dialog").open'),'Escape closes dialog');
const tools=await b.evaluate('tools.filter(tool=>tool.id!=='edit-pdf').map(tool=>tool.id)');
for(const width of [1440,375]){
 await b.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
 for(const tool of tools){
  await b.navigate(tool);await b.click('[data-action="samples"]');
  await b.until('state.phase==="select"&&state.files.length>0');
  check(await b.evaluate('!state.feedback'),`${tool}: ${await b.evaluate('state.feedback')}`);
  const measured=await b.evaluate('({width:innerWidth,scroll:document.documentElement.scrollWidth})');
  check(measured.scroll<=width,`Overflow ${tool} ${width}`);layouts.push({tool,...measured});
  if(width===375&&tool==='sort')await b.shot('phase-one-mobile-pages.png');
  if(width===375&&tool==='rename')await b.shot('phase-one-mobile-rename.png');
 }
}
for(const width of [768,1024]){
 await b.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
 for(const tool of ['merge','sort','watermark','ocr-pdf']){
  await b.navigate(tool);await b.click('[data-action="samples"]');await b.until('state.phase==="select"&&state.files.length>0');
  check(await b.evaluate('document.documentElement.scrollWidth<=innerWidth'),`Overflow ${tool} ${width}`);layouts.push({tool,width});
 }
}
await b.send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:false});
await b.navigate('home');await b.click('.nav-group summary');
check(await b.evaluate('document.querySelector(".sidebar").classList.contains("mobile-expanded")'),'Mobile navigation expands');
await b.navigate('split');await b.click('[data-action="samples"]');await b.until('state.phase==="select"&&state.files.length>0');
await b.click('[data-action="no-pages"]');check(await b.evaluate('document.querySelector("#run-button").disabled'),'Empty page selection disabled');
await b.input('#pages-range','1');check(await b.evaluate('!document.querySelector("#run-button").disabled'),'Typing range re-enables processing');
await b.navigate('sort');await b.click('[data-action="samples"]');await b.until('state.phase==="select"&&state.files.length>0');
await b.input('#pages-range','2,1');check(await b.evaluate('document.querySelector(".page-tile img").alt.includes("2")'),'Typed order updates thumbnails');
await b.navigate('ocr-image');await b.click('[data-action="samples"]');await b.until('state.phase==="select"&&state.files.length>0');
await b.click('[data-action="run"]');await b.until('state.phase==="processing"&&document.querySelector("#progress-label").textContent.includes("\u8bc6\u522b\u5f15\u64ce")');
await b.click('[data-action="cancel"]');
await new Promise(resolve=>setTimeout(resolve,500));
check(await b.evaluate('state.phase==="select"&&!document.querySelector("#ocr-text")'),'Cancel during OCR initialization');
await b.navigate('ocr-image');await b.click('[data-action="run"]');await b.navigate('home');
await new Promise(resolve=>setTimeout(resolve,300));check(await b.evaluate('!state.tool&&!document.querySelector("#ocr-text")'),'Navigate away during OCR');
await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await b.navigate('home');await b.shot('home-desktop.png');
await b.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
check(await b.evaluate('getComputedStyle(document.querySelector(".tool-card")).transitionDuration==="0s"'),'Reduced motion');
check(!b.errors.length,JSON.stringify(b.errors));
await writeFile(path.join(folder,'live-ui-checks.json'),JSON.stringify({status:'passed',layouts,errors:b.errors},null,2));
console.log(`PASS: ${layouts.length} live loaded layouts, search/help/mobile navigation, page selections, typed order and OCR cancellation.`);b.close();