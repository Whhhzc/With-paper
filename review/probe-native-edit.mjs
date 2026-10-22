import {init} from '@embedpdf/pdfium';
import fs from 'node:fs';
const p=await init({wasmBinary:fs.readFileSync('vendor/content/pdfium.wasm')});p.PDFiumExt_Init();
const m=p.pdfium,alloc=bytes=>{const ptr=m.wasmExports.malloc(bytes.length);m.HEAPU8.set(bytes,ptr);return ptr;};
const bytes=fs.readFileSync('review/phase-one-fixtures/source.pdf'),ptr=alloc(bytes);
const doc=p.FPDF_LoadMemDocument(ptr,bytes.length,''),page=p.FPDF_LoadPage(doc,0),textPage=p.FPDFText_LoadPage(page);
for(let i=0;i<p.FPDFPage_CountObjects(page);i++){
 const object=p.FPDFPage_GetObject(page,i);if(p.FPDFPageObj_GetType(object)!==1)continue;
 const size=p.FPDFTextObj_GetText(object,textPage,0,0);const buf=m.wasmExports.malloc(size);
 p.FPDFTextObj_GetText(object,textPage,buf,size);console.log('text',i,m.UTF16ToString(buf));m.wasmExports.free(buf);
 const nameSize=p.FPDFFont_GetBaseFontName(p.FPDFTextObj_GetFont(object),0,0),name=m.wasmExports.malloc(nameSize);p.FPDFFont_GetBaseFontName(p.FPDFTextObj_GetFont(object),name,nameSize);console.log('font',m.UTF8ToString(name),p.FPDFFont_GetIsEmbedded(p.FPDFTextObj_GetFont(object)));m.wasmExports.free(name);
 const input=m.wasmExports.malloc(100);m.stringToUTF16('REVISED',input,100);console.log('set',p.FPDFText_SetText(object,input));m.wasmExports.free(input);
}
p.FPDFText_ClosePage(textPage);console.log('generate',p.FPDFPage_GenerateContent(page));
const writer=p.PDFiumExt_OpenFileWriter();console.log('save',p.FPDF_SaveAsCopy(doc,writer,2));
const size=p.PDFiumExt_GetFileWriterSize(writer),output=m.wasmExports.malloc(size);console.log('size',size,'read',p.PDFiumExt_GetFileWriterData(writer,output,size));fs.writeFileSync('review/native-probe.pdf',m.HEAPU8.slice(output,output+size));
p.PDFiumExt_CloseFileWriter(writer);p.FPDF_ClosePage(page);p.FPDF_CloseDocument(doc);m.wasmExports.free(output);m.wasmExports.free(ptr);
