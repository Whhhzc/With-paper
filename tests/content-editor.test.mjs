import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {init} from '@embedpdf/pdfium';
import {PDFDocument,rgb,degrees} from 'pdf-lib';
import {createContentEngine} from '../content-engine.mjs';
const module=await init({wasmBinary:await fs.readFile('vendor/content/pdfium.wasm')});module.PDFiumExt_Init();
const font=new Uint8Array(await fs.readFile('vendor/content/NotoSansSC-Regular.otf'));
const folder='review/content-editor-results';await fs.mkdir(folder,{recursive:true});
async function fixture(){
 const document=await PDFDocument.create();
 for(let i=0;i<2;i++){
  const page=document.addPage([595,842]);
  page.drawText(i?'SECOND PAGE KEEP':'ORIGINAL TEXT',{x:60,y:740,size:24});
  page.drawText('UNTOUCHED BODY',{x:60,y:660,size:16});
  page.drawRectangle({x:60,y:500,width:120,height:60,color:rgb(.8,.2,.1)});
  const image=await document.embedPng(new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=','base64')));
  page.drawImage(image,{x:250,y:400,width:100,height:100});
  if(i){page.setRotation(degrees(90));page.setCropBox(20,30,540,780);}
 }
 const bytes=await document.save();await fs.writeFile(`${folder}/original.pdf`,bytes);return bytes;
}
test('native text replacement removes original text and preserves unchanged page content',async()=>{
 const engine=createContentEngine(module,font);engine.open(await fixture());
 const source=engine.inspect(0),first=source.items.find(item=>item.text==='ORIGINAL TEXT');
 assert.ok(first);
 const output=engine.preview([{page:0,id:first.id,text:'REVISED TEXT'}]);
 await fs.writeFile(`${folder}/edited-latin.pdf`,output.bytes);
 const check=createContentEngine(module,font);check.open(output.bytes);
 const text=check.inspect(0).items.filter(item=>item.type==='text').map(item=>item.text).join('\n');
 assert.ok(text.includes('REVISED TEXT'));assert.ok(!text.includes('ORIGINAL TEXT'));assert.ok(text.includes('UNTOUCHED BODY'));
 assert.equal(check.inspect(1).items.find(item=>item.type==='text').text,'SECOND PAGE KEEP');
 check.close();engine.close();
});
test('Chinese fallback produces actual searchable Unicode PDF text, not a raster cover',async()=>{
 const engine=createContentEngine(module,font);engine.open(await fixture());const first=engine.inspect(0).items.find(item=>item.text==='ORIGINAL TEXT');
 const output=engine.preview([{page:0,id:first.id,text:'修改后的合同金额 12345'}]);
 await fs.writeFile(`${folder}/edited-chinese.pdf`,output.bytes);
 const check=createContentEngine(module,font);check.open(output.bytes);
 const texts=check.inspect(0).items.filter(item=>item.type==='text').map(item=>item.text);
 assert.ok(texts.includes('修改后的合同金额 12345'),JSON.stringify(texts));assert.ok(!texts.includes('ORIGINAL TEXT'));assert.ok(output.warnings.length);
 check.close();engine.close();
});
test('delete text, replace native image and edit path color without changing page geometry',async()=>{
 const engine=createContentEngine(module,font);engine.open(await fixture());const source=engine.inspect(0);
 const first=source.items.find(item=>item.text==='ORIGINAL TEXT'),image=source.items.find(item=>item.type==='image'),shape=source.items.find(item=>item.type==='graphic');
 const result=engine.preview([{page:0,id:first.id,text:''},{page:0,id:image.id,image:{width:2,height:2,data:new Uint8Array([0,70,220,255,0,70,220,255,0,70,220,255,0,70,220,255])}},{page:0,id:shape.id,color:[20,180,70,255]}]);
 await fs.writeFile(`${folder}/edited-objects.pdf`,result.bytes);
 const check=createContentEngine(module,font);check.open(result.bytes);const after=check.inspect(0);
 assert.ok(!after.items.some(item=>item.text==='ORIGINAL TEXT'));assert.equal(after.items.filter(item=>item.type==='image').length,1);
 assert.deepEqual(after.items.find(item=>item.type==='image').bounds,image.bounds);assert.deepEqual(after.items.find(item=>item.type==='graphic').color,[20,180,70,255]);
 const doc=await PDFDocument.load(result.bytes);assert.equal(doc.getPage(1).getRotation().angle,90);assert.deepEqual(doc.getPage(1).getCropBox(),{x:20,y:30,width:540,height:780});
 check.close();engine.close();
});

test('native paragraphs insert below their anchor and edit-surface bytes never replace final preview',async()=>{
 const engine=createContentEngine(module,font);engine.open(await fixture());const anchor=engine.inspect(0).items.find(item=>item.text==='ORIGINAL TEXT');
 const addition={id:'new-1',page:0,added:true,afterId:anchor.id,text:'新增的合同说明',fontSize:16,color:[0,0,0,255],gap:8,offsetX:0};
 const child={...addition,id:'new-2',afterId:'new-1',text:'FOLLOWING PARAGRAPH',gap:4};
 const result=engine.preview([addition,child],{page:0,selected:'new-1'});
 await fs.writeFile(`${folder}/inserted-paragraphs.pdf`,result.bytes);
 const check=createContentEngine(module,font);check.open(result.bytes);const items=check.inspect(0).items;
 assert.ok(items.some(item=>item.text==='ORIGINAL TEXT'));
 const inserted=items.find(item=>item.text==='新增的合同说明');assert.ok(inserted);assert.ok(inserted.bounds[3]<anchor.bounds[1]);
 assert.ok(items.some(item=>item.text==='FOLLOWING PARAGRAPH'));
 assert.deepEqual(items.filter(item=>item.type==='text').map(item=>item.text),['ORIGINAL TEXT','新增的合同说明','FOLLOWING PARAGRAPH','UNTOUCHED BODY']);
 assert.equal(result.locations.find(item=>item.id==='new-1').type,'text');assert.ok(result.editBytes);
 check.open(result.editBytes);assert.ok(!check.inspect(0).items.some(item=>item.text==='新增的合同说明'));
 assert.ok(check.inspect(0).items.some(item=>item.text==='ORIGINAL TEXT'));
 check.close();engine.close();
});
