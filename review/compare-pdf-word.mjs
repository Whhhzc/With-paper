import {connect,check,folder} from './browser-session.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {unzipSync,strFromU8} from 'fflate';
import path from 'node:path';
const b=await connect();
try{
 const result=await b.evaluate(`(async()=>{
  const open=async name=>Media.pdf(new File([await(await fetch('review/pdf-word-results/'+name)).blob()],name));
  const original=await open('combined.pdf'),converted=await open('converted-word.pdf'),edited=await open('edited-in-word.pdf');
  try{
   const texts=async(doc,page)=>{const p=await doc.getPage(page);return (await p.getTextContent()).items.filter(i=>i.str).map(i=>({text:i.str,x:i.transform[4],y:i.transform[5],size:Math.hypot(i.transform[2],i.transform[3]),angle:Math.atan2(i.transform[1],i.transform[0])*180/Math.PI}));};
   const source=await texts(original,1),target=await texts(converted,1),changed=await texts(edited,1);
   const sourceTitle=source.find(i=>i.text.includes('CONVERSION REPORT')),targetTitle=target.find(i=>i.text.includes('CONVERSION REPORT'));
   const allText=(await texts(converted,1)).map(i=>i.text).join('').replace(/\\s/g,'');
   const changedText=changed.map(i=>i.text).join('');
   const snapshots=[];
   for(const page of [1,3])for(const [name,doc] of [['source',original],['word',converted]]){
    const canvas=await Media.page(doc,page,1.25);snapshots.push({name:name+'-'+page,data:canvas.toDataURL('image/png')});canvas.width=canvas.height=0;
   }
   return {pages:converted.numPages,sourceTitle,targetTitle,sourceRotated:source.find(i=>i.text.includes('Rotation 30 degrees')),targetRotated:target.find(i=>i.text.includes('Rotation 30 degrees')),targetTail:target.slice(-8),allText,changedText,snapshots};
  }finally{await original.destroy();await converted.destroy();await edited.destroy();}
 })()`);
 check(result.pages===3,'Word-rendered page count');
 check(result.allText.includes('合同金额：12345.60元')&&result.allText.includes('12345.60'),'Word rendering retains Chinese and numeric content');
 check(result.changedText.includes('EDITED IN WORD')&&!result.changedText.includes('CONVERSION REPORT'),'Word edits replace actual text');
 check(result.sourceTitle&&result.targetTitle,'Native title survives Word rendering');
 const delta={x:result.targetTitle.x-result.sourceTitle.x,y:result.targetTitle.y-result.sourceTitle.y,size:result.targetTitle.size-result.sourceTitle.size};
 for(const shot of result.snapshots)await writeFile(path.join(folder,'pdf-word-'+shot.name+'.png'),Buffer.from(shot.data.split(',')[1],'base64'));
 check(Math.abs(delta.y)<1.5,'Native title baseline stays close to PDF');
 const saved=strFromU8(unzipSync(await readFile(path.join(folder,'pdf-word-results','edited-in-word.docx')))['word/document.xml']);
 const shape=[...saved.matchAll(/<wps:wsp\b[^>]*>[\s\S]*?<\/wps:wsp>/g)].find(match=>match[0].includes('Rotation 30 degrees'))?.[0];
 const rotation=Number(shape?.match(/<a:xfrm[^>]*rot="(\d+)"/)?.[1])/60000;
 check(Number.isFinite(rotation)&&Math.abs((360-rotation)%360-result.sourceRotated.angle)<1,'Word preserves editable slanted-text rotation');
 result.wordShapeRotation=rotation;
 delete result.snapshots;
 await writeFile(path.join(folder,'pdf-word-results','render-checks.json'),JSON.stringify({...result,titleDelta:delta},null,2));
 console.log(JSON.stringify({status:'passed',titleDelta:delta,sourceTitle:result.sourceTitle,targetTitle:result.targetTitle}));
}finally{b.close();}
