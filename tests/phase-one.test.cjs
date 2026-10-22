const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
global.PDFLib = require('pdf-lib');
global.fflate = require('fflate');
require('../pdf-engine.js');
const {PDFDocument, PDFName, PDFHexString} = PDFLib;
const directory = path.resolve(__dirname, '../review/phase-one-fixtures');
const image = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=', 'base64'));
async function source() {
  const document = await PDFDocument.create();
  for(let index=1;index<=4;index++) {
    const page=document.addPage([400+index*10,600]);
    page.drawText(`PAGE ${index}`,{x:40,y:500,size:28});
  }
  const bytes=await document.save(); await fs.mkdir(directory,{recursive:true});
  await fs.writeFile(path.join(directory,'source.pdf'),bytes);
  return new File([bytes],'source.pdf',{type:'application/pdf'});
}
async function edit(file,options) { return (await PdfMerge.edit([file],()=>{},options)).entries; }
async function save(name,entry) {await fs.writeFile(path.join(directory,name),entry.bytes);return PDFDocument.load(entry.bytes);}
test('page ranges reject malformed, duplicate and out-of-bounds selections',()=>{
  assert.deepEqual(PdfMerge.pageNumbers('1–2，4',4),[0,1,3]);
  assert.throws(()=>PdfMerge.pageNumbers('1,1',4),/重复/);
  assert.throws(()=>PdfMerge.pageNumbers('0-2',4),/超出/);
  assert.throws(()=>PdfMerge.pageNumbers('3-2',4),/错误/);
  assert.throws(()=>PdfMerge.pageNumbers('abc',4),/无效/);
});
test('split extraction, each-page export, selective rotation, deletion and reordering produce actual PDFs',async()=>{
  const file=await source();
  const extract=await edit(file,{action:'split',range:'2,4',mode:'range'});
  assert.equal((await save('extract.pdf',extract[0])).getPageCount(),2);
  const each=await edit(file,{action:'split',range:'1-3',mode:'each'});
  assert.equal(each.length,3);assert.deepEqual(each.map(entry=>entry.pages),[1,1,1]);
  const rotated=await save('rotate.pdf',(await edit(file,{action:'rotate',range:'2,4',angle:90}))[0]);
  assert.deepEqual(rotated.getPages().map(page=>page.getRotation().angle),[0,90,0,90]);
  const deleted=await save('delete.pdf',(await edit(file,{action:'delete',range:'2-3'}))[0]);
  assert.deepEqual(deleted.getPages().map(page=>page.getWidth()),[410,440]);
  const sorted=await save('sort.pdf',(await edit(file,{action:'sort',range:'4,1,3,2'}))[0]);
  assert.deepEqual(sorted.getPages().map(page=>page.getWidth()),[440,410,430,420]);
  await assert.rejects(edit(file,{action:'delete',range:'1-4'}),/至少保留/);
  await assert.rejects(edit(file,{action:'sort',range:'1,2'}),/全部/);
});
test('Chinese watermark metadata, selective removal and standard watermark annotations are handled independently',async()=>{
  const file=await source();
  const [marked]=await edit(file,{action:'watermark',text:'仅供内部使用',image,opacity:.35,angle:35,position:'center',range:'2,4'});
  const markedFile=new File([marked.bytes],'marked.pdf');
  const inspected=await PdfMerge.inspect([markedFile]);
  assert.deepEqual(inspected.entries[0].watermarks.map(mark=>mark.label),['仅供内部使用','仅供内部使用']);
  assert.deepEqual(inspected.entries[0].watermarks.map(mark=>mark.page),[2,4]);
  await save('watermark.pdf',marked);
  const [cleaned]=await edit(markedFile,{action:'remove-watermark',selected:inspected.entries[0].watermarks.map(mark=>mark.id)});
  const cleanDocument=await save('cleaned.pdf',cleaned);
  assert.equal(PdfMerge.findWatermarks(cleanDocument).length,0);
  const annotations=await PDFDocument.load(await file.arrayBuffer());
  const watermark=annotations.context.obj({Type:'Annot',Subtype:'Watermark',Rect:[0,0,100,100]});
  watermark.set(PDFName.of('Contents'),PDFHexString.fromText('独立批注水印'));
  annotations.getPage(0).node.addAnnot(annotations.context.register(watermark));
  annotations.getPage(0).node.addAnnot(annotations.context.register(annotations.context.obj({Type:'Annot',Subtype:'Text',Rect:[0,0,30,30]})));
  const annotated=new File([await annotations.save()],'annotation.pdf');
  const found=(await PdfMerge.inspect([annotated])).entries[0].watermarks;
  assert.equal(found.length,1);
  const [removed]=await edit(annotated,{action:'remove-watermark',selected:[found[0].id]});
  const remaining=await PDFDocument.load(removed.bytes);
  assert.equal(remaining.getPage(0).node.Annots().size(),1);
  await assert.rejects(edit(file,{action:'remove-watermark',selected:['0:stream:0']}),/请选择/);
});
test('image conversion and ZIP export preserve output files',async()=>{
  const result=await PdfMerge.imagesToPdf([{name:'a.png',bytes:image},{name:'b.png',bytes:image}],()=>{},{pageSize:'a4'});
  assert.equal((await PDFDocument.load(result.entries[0].bytes)).getPageCount(),2);
  const each=await PdfMerge.imagesToPdf([{name:'a.png',bytes:image},{name:'b.png',bytes:image}],()=>{},{pageSize:'fit',mode:'each'});
  assert.equal(each.entries.length,2);
  const files=each.entries.map(entry=>new File([entry.bytes],entry.name));
  const zip=await PdfMerge.zip(files);
  const unpacked=fflate.unzipSync(zip.bytes);
  assert.deepEqual(Object.keys(unpacked),['a.pdf','b.pdf']);
  assert.deepEqual(unpacked['a.pdf'],each.entries[0].bytes);
});
