const {test}=require('node:test');
const assert=require('node:assert/strict');
global.fflate=require('fflate');
require('../word-engine.js');
const {nativeItems,needsOCR,ocrItems,build}=global.PdfWord;
const image=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5ioAAAAASUVORK5CYII=','base64'));
const viewport={transform:[1,0,0,-1,0,842],scale:1};
test('native Unicode and positioned columns keep source text and page coordinates without OCR',()=>{
 const content={styles:{f:{ascent:.8,fontFamily:'sans-serif'}},items:[{str:'合同金额 ¥12,345.60',transform:[12,0,0,12,50,750],width:160,fontName:'f'},{str:'RIGHT COLUMN <&>',transform:[12,0,0,12,320,750],width:140,fontName:'f'}]};
 const items=nativeItems(content,viewport,{f:'ABCDEF+Helvetica-Bold'},[{text:'合同金额¥12,345.60',color:'ff0000'},{text:'RIGHTCOLUMN<&>',color:'000000'}]);
 assert.equal(items[0].text,content.items[0].str);assert.equal(items[0].x,50);assert.ok(Math.abs(items[0].y-82.4)<.001);
 assert.equal(items[1].x,320);assert.equal(items[0].color,'ff0000');assert.ok(items[0].bold);assert.equal(needsOCR(items),false);
 const rotated=nativeItems(content,{transform:[0,1,1,0,-20,-30],scale:1});
 assert.equal(rotated[0].angle,90);assert.ok(rotated[0].x>600);
});
test('OCR fallback triggers only for missing/unusable text and retains word coordinates/confidence',()=>{
 assert.ok(needsOCR([]));assert.ok(needsOCR([{text:'\uFFFD\uFFFD\uE000'}]));assert.equal(needsOCR([{text:'中'}]),false);
 const items=ocrItems([{paragraphs:[{lines:[{bbox:{x0:20,y0:40,x1:140,y1:70},words:[{text:'扫描文字',bbox:{x0:20,y0:40,x1:140,y1:70},confidence:91}]}]}]}],2);
 assert.equal(items[0].text,'扫描文字');assert.equal(items[0].x,10);assert.equal(items[0].y,20);assert.equal(items[0].width,60);assert.equal(items[0].confidence,91);
 const line=ocrItems([{paragraphs:[{lines:[{text:'办公 会议 记录 。',confidence:94,bbox:{x0:0,y0:0,x1:200,y1:30},rowAttributes:{rowHeight:36}}]}]}],2);
 assert.equal(line.length,1);assert.equal(line[0].text,'办公会议记录。');assert.equal(line[0].width,100);
});
test('DOCX is a real OOXML ZIP with editable text, per-page dimensions and embedded local artwork',()=>{
 const items=[{text:'中文 & <test>\u0000',x:50,y:60,width:150,height:20,size:12,color:'336699',font:'Arial',bold:true}];
 const result=build([{width:595,height:842,items,background:image},{width:780,height:540,items:[],background:image}],'文件<&>');
 const zip=fflate.unzipSync(result.bytes),text=name=>fflate.strFromU8(zip[name]);
 assert.equal(result.pages,2);assert.equal(result.bytes[0],0x50);assert.equal(result.bytes[1],0x4b);
 assert.ok(zip['[Content_Types].xml']);assert.ok(zip['word/media/page1.png']);assert.ok(zip['word/media/page2.png']);
 const document=text('word/document.xml');assert.ok(document.includes('中文 &amp; &lt;test&gt;'));assert.ok(!document.includes('\u0000'));assert.ok(document.includes('<w:txbxContent>'));
 assert.ok(document.includes('w:w="11900" w:h="16840"'));assert.ok(document.includes('w:w="15600" w:h="10800" w:orient="landscape"'));
 assert.ok(document.includes('<wp:posOffset>635000</wp:posOffset>'));assert.ok(document.includes('w:color w:val="336699"'));
 assert.equal((text('word/_rels/document.xml.rels').match(/Type="[^"]+\/image"/g)||[]).length,2);
 assert.ok(text('docProps/core.xml').includes('文件&lt;&amp;&gt;'));
});
test('Word size limits and empty selections produce actionable errors',()=>{
 assert.throws(()=>build([]),/至少一页/);assert.throws(()=>build([{width:2000,height:1000,items:[],background:image}]),/页面尺寸/);
});
