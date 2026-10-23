import {connect,check,folder} from './browser-session.mjs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {PDFDocument,StandardFonts,rgb,degrees} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {unzipSync,strFromU8} from 'fflate';
import path from 'node:path';
const out=path.join(folder,'pdf-word-results');await mkdir(out,{recursive:true});
const b=await connect();const checks=[];
const xml=bytes=>strFromU8(unzipSync(bytes)['word/document.xml']);
async function verify(expression,label){check(await b.evaluate(expression),label);checks.push(label);}
async function download(name){await b.saveBlob('.output-row a[download]',path.join(out,name));return readFile(path.join(out,name));}
async function fixture(){
 const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
 const cn=await pdf.embedFont(await readFile('vendor/content/NotoSansSC-Regular.otf'),{subset:true});
 const regular=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold);
 const p=pdf.addPage([595,842]);
 p.drawText('CONVERSION REPORT',{x:45,y:780,size:24,font:bold,color:rgb(.1,.3,.7)});
 p.drawText('合同金额：12345.60 元',{x:45,y:730,size:16,font:cn});
 p.drawText('准确提取中文与 English 2026',{x:45,y:700,size:13,font:cn});
 p.drawText('LEFT COLUMN',{x:45,y:640,size:14,font:bold});p.drawText('RIGHT COLUMN',{x:315,y:640,size:14,font:bold});
 for(let i=0;i<3;i++){p.drawText(`Left paragraph line ${i+1}`,{x:45,y:610-i*22,size:11,font:regular});p.drawText(`Right paragraph line ${i+1}`,{x:315,y:610-i*22,size:11,font:regular});}
 for(let i=0;i<4;i++)p.drawLine({start:{x:45,y:480-i*30},end:{x:550,y:480-i*30},thickness:.8,color:rgb(.5,.5,.5)});
 for(const x of [45,260,410,550])p.drawLine({start:{x,y:480},end:{x,y:390},thickness:.8,color:rgb(.5,.5,.5)});
 ['Item','Quantity','Amount'].forEach((text,i)=>p.drawText(text,{x:[55,270,420][i],y:460,size:12,font:bold}));
 ['Service A','2','12345.60'].forEach((text,i)=>p.drawText(text,{x:[55,270,420][i],y:430,size:12,font:regular}));
 p.drawRectangle({x:45,y:280,width:505,height:60,color:rgb(.88,.94,.99)});
 p.drawText('Colored background and vector artwork',{x:60,y:306,size:15,font:regular,color:rgb(.1,.3,.7)});
 p.drawText('Rotation 30 degrees',{x:350,y:170,size:14,font:regular,rotate:degrees(30)});
 const p2=pdf.addPage([595,842]);p2.setRotation(degrees(90));p2.setCropBox(20,30,540,780);
 p2.drawText('ROTATED CROP PAGE',{x:65,y:710,size:24,font:bold});p2.drawText('Second page remains editable.',{x:65,y:670,size:14,font:regular});p2.drawRectangle({x:65,y:500,width:180,height:80,color:rgb(.8,.2,.1)});
 await writeFile(path.join(out,'native.pdf'),await pdf.save());
 await b.navigate('ocr-pdf');await b.click('[data-action="samples"]');await b.until('state.files.length===1');
 const scan=await b.evaluate('(async()=>Array.from(new Uint8Array(await state.files[0].file.arrayBuffer())))()');
 await writeFile(path.join(out,'scan.pdf'),new Uint8Array(scan));
 const scanned=await PDFDocument.load(new Uint8Array(scan));const [scanPage]=await pdf.copyPages(scanned,[0]);pdf.addPage(scanPage);
 await writeFile(path.join(out,'combined.pdf'),await pdf.save());
 // A native heading above an image of scanned text exercises explicit mixed-content OCR.
 const mixed=await PDFDocument.create();const m=mixed.addPage([595,842]);m.drawText('NATIVE HEADING KEEP',{x:35,y:800,size:20});
 const scanImage=await b.evaluate('(async()=>Array.from(new Uint8Array(await(await Media.sampleImage()).arrayBuffer())))()');
 const image=await mixed.embedPng(new Uint8Array(scanImage));m.drawImage(image,{x:35,y:300,width:525,height:350});
 await writeFile(path.join(out,'mixed.pdf'),await mixed.save());
}
try{
 await fixture();await b.navigate('pdf-word');
 await verify('!!document.querySelector("#word-ocr")&&document.querySelector("#file-input").accept===".pdf"','Tool route and conversion settings');
 await b.upload([path.join(out,'combined.pdf')]);await b.until('state.files.length===1&&state.phase==="select"');
 await b.input('#tool-output-name','conversion.docx');await b.click('[data-action="run"]');await b.until('state.phase==="result"',120);
 await verify('document.querySelector(".output-row a[download]").download==="conversion.docx"','Custom DOCX filename retains correct extension');
 const native=await download('converted.docx');const document=xml(native);
 for(const text of ['CONVERSION REPORT','合同金额：12345.60 元','准确提取中文与 English 2026','LEFT COLUMN','RIGHT COLUMN','12345.60','ROTATED CROP PAGE']){check(document.includes(text),`Native exact text: ${text}`);checks.push(`Native exact text: ${text}`);}
 check(document.includes('Office')&&document.includes('Friday'),'OCR English text present');checks.push('Scanned-page OCR has real English text');
 const extracted=[...document.matchAll(/<w:t(?:\s[^>]*)?>(.*?)<\/w:t>/g)].map(match=>match[1]).join('');
 check(extracted.includes('办公会议记录'),'OCR Chinese text present');checks.push('Scanned-page OCR has real Chinese text');
 check((document.match(/<w:pgSz /g)||[]).length===3,'Three page sections');checks.push('Three source pages remain three sections');
 const zip=unzipSync(native);check(Object.keys(zip).filter(name=>name.startsWith('word/media/')).length===3,'Three page art images');
 await verify('document.querySelector(".word-conversion-report").textContent.includes("OCR")&&!document.querySelector("dialog").open','Honest extraction report without modal');
 await b.shot('pdf-word-result.png');
 await b.send('Emulation.setDeviceMetricsOverride',{width:375,height:812,deviceScaleFactor:1,mobile:true});await verify('document.documentElement.scrollWidth<=innerWidth','Mobile result has no horizontal overflow');await b.shot('pdf-word-mobile.png');
 await b.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await b.input('#pages-range','2');await b.click('[data-action="run"]');await b.until('state.phase==="result"');const ranged=xml(await download('page-two.docx'));
 check(!ranged.includes('CONVERSION REPORT')&&ranged.includes('ROTATED CROP PAGE')&&(ranged.match(/<w:pgSz /g)||[]).length===1,'Range selects only page two');checks.push('Page range exports only selected page');
 await b.input('#pages-range','999');await b.click('[data-action="run"]');await b.until('state.phase==="select"&&!!state.feedback');checks.push('Out-of-range selection rejected');
 await b.click('[data-action="clear"]');await b.input('#pages-range','');await b.upload([path.join(out,'mixed.pdf')]);await b.until('state.files.length===1');await b.input('#word-ocr','all');await b.click('[data-action="run"]');await b.until('state.phase==="result"',120);
 const mixed=xml(await download('mixed.docx'));check(mixed.includes('NATIVE HEADING KEEP')&&mixed.includes('Office'),'Mixed OCR retains native heading and image words');checks.push('Mixed native/image OCR retains both text sources');
 await b.click('[data-action="clear"]');await b.upload([path.join(out,'scan.pdf')]);await b.until('state.files.length===1');await b.click('[data-action="run"]');await b.until('document.querySelector("#progress-label")?.textContent.includes("识别")',30);await b.click('[data-action="cancel"]');
 await verify('state.phase==="select"&&!document.querySelector(".output-row")','Cancellation leaves no stale DOCX');
 await b.click('[data-action="run"]');await b.navigate('home');await verify('!state.tool&&!document.querySelector(".output-row")','Navigation cancels conversion');
 await b.navigate('pdf-word');await b.upload([path.join(out,'native.pdf'),path.join(out,'mixed.pdf')]);await b.until('state.files.length===2');await b.input('#pages-range','1');await b.click('[data-action="run"]');await b.until('state.phase==="result"',120);
 await verify('document.querySelectorAll(".output-row").length===2&&Array.from(document.querySelectorAll("a[download]")).some(a=>a.download.endsWith(".zip"))','Batch conversion offers individual DOCX and ZIP');
 check(!b.errors.length,JSON.stringify(b.errors));
 const external=b.requests.filter(request=>/^https?:/.test(request.url)&&new URL(request.url).origin!==new URL(process.env.OFFICE_TEST_URL).origin);check(!external.length,'No external requests');checks.push('No external requests or document uploads');
 await writeFile(path.join(out,'browser-checks.json'),JSON.stringify({status:'passed',checks,errors:b.errors,external},null,2));
 console.log(`PASS: ${checks.length} browser PDF-to-Word checks`);
}finally{b.close();}
