/* Entire conversion stays in the browser; only the final OOXML ZIP is built in a worker. */
const WordConverter = (() => {
  const textOps = new Set(['showText','showSpacedText','nextLineShowText','nextLineSetSpacingShowText'].map(name=>PdfRenderer.OPS[name]).filter(Number.isInteger));
  function paints(operators) {
    let current={color:'000000',invisible:false};const stack=[],result=[];
    for(let index=0;index<operators.fnArray.length;index++){
      const op=operators.fnArray[index],args=operators.argsArray[index];
      if(op===PdfRenderer.OPS.save)stack.push({...current});
      else if(op===PdfRenderer.OPS.restore)current=stack.pop()||current;
      else if(op===PdfRenderer.OPS.setFillRGBColor&&typeof args[0]==='string')current.color=args[0].replace('#','');
      else if(op===PdfRenderer.OPS.setTextRenderingMode)current.invisible=(args[0]&3)===3;
      else if(textOps.has(op)){
        const glyphs=args?.find(Array.isArray)||[];
        const text=glyphs.filter(glyph=>glyph&&typeof glyph==='object').map(glyph=>glyph.unicode||'').join('').normalize('NFKC').replace(/\s/g,'');
        if(text)result.push({text,...current});
      }
    }
    return result;
  }
  async function artwork(page,scale,removeText,signal){
    const viewport=page.getViewport({scale});const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
    const task=page.render({canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff',operationsFilter:removeText?((index,list)=>!textOps.has(list.fnArray[index])):undefined});
    const cancel=()=>task.cancel();signal.addEventListener('abort',cancel,{once:true});
    try{await task.promise;signal.throwIfAborted();return canvas;}
    catch(error){canvas.width=canvas.height=0;throw error;}
    finally{signal.removeEventListener('abort',cancel);}
  }
  function eraseRecognizedWords(canvas,items,scale){
    const context=canvas.getContext('2d',{willReadFrequently:true});
    // Remove only recognized word rectangles, retaining table rules and illustrations between them.
    for(const item of items){
      const x=Math.max(0,Math.floor(item.x*scale)-1),y=Math.max(0,Math.floor(item.y*scale)-1);
      const width=Math.min(canvas.width-x,Math.ceil(item.width*scale)+2);
      const height=Math.min(canvas.height-y,Math.ceil((item.inkHeight||item.height)*scale)+2);
      if(width<=0||height<=0)continue;
      const sample=context.getImageData(Math.max(0,x-2),Math.max(0,y-2),Math.min(canvas.width-Math.max(0,x-2),width+4),Math.min(canvas.height-Math.max(0,y-2),height+4));
      const colors=new Map();
      for(let row=0;row<sample.height;row++)for(let col=0;col<sample.width;col++){
        if(row>1&&row<sample.height-2&&col>1&&col<sample.width-2)continue;
        const pos=(row*sample.width+col)*4;const color=[sample.data[pos],sample.data[pos+1],sample.data[pos+2]].map(value=>Math.round(value/16)*16).map(value=>Math.min(255,value)).join(',');
        colors.set(color,(colors.get(color)||0)+1);
      }
      const color=[...colors].sort((a,b)=>b[1]-a[1])[0]?.[0]||'255,255,255';
      context.fillStyle=`rgb(${color})`;context.fillRect(x,y,width,height);
    }
  }
  async function convert(file,options,signal,progress,ocrJob,pdfJob){
    const pdf=await Media.pdf(file,signal,{fontExtraProperties:true});const pages=[],report={nativePages:0,ocrPages:0,characters:0,lowConfidence:0,warnings:[]};
    try{
      for(let index=0;index<options.pages.length;index++){
        signal.throwIfAborted();const number=options.pages[index];
        progress({done:index,total:options.pages.length,label:`正在读取第 ${number} 页文字与版式…`});
        const page=await pdf.getPage(number);let canvas;
        try{
          const viewport=page.getViewport({scale:1});
          if(Math.max(viewport.width,viewport.height)>1584)throw new Error('PDF 页面过大，超过 Word 支持的尺寸，请先调整页面大小。');
          const content=await page.getTextContent({disableNormalization:true});signal.throwIfAborted();
          const operators=await page.getOperatorList();signal.throwIfAborted();
          const useNative=!PdfWord.needsOCR(content.items.filter(item=>typeof item.str==='string').map(item=>({text:item.str})));
          const scale=Math.min(2.5,3000/Math.max(viewport.width,viewport.height));
          canvas=await artwork(page,scale,useNative,signal);
          const fonts={};
          for(const name of Object.keys(content.styles)){try{fonts[name]=page.commonObjs.get(name)?.name;}catch{/* Use PDF.js font family fallback for non-rendered fonts. */}}
          let items=useNative?PdfWord.nativeItems(content,viewport,fonts,paints(operators)):[];
          if(useNative){report.nativePages++;eraseRecognizedWords(canvas,items.filter(item=>item.invisible),scale);}
          if(!useNative||options.ocr==='all'){
            progress({done:index,total:options.pages.length,label:`正在识别第 ${number} 页${useNative?'图片内的':''}文字…`});
            const blob=await Media.blob(canvas);signal.throwIfAborted();
            const result=await ocrJob.run('recognize',[new File([blob],`page-${number}.png`,{type:'image/png'})],{language:options.language,base:new URL('vendor/ocr/',location.href).href,layout:true},event=>progress({done:index+(event.done/event.total)*.8,total:options.pages.length,label:`第 ${number} 页：${event.label}`}));
            signal.throwIfAborted();const entry=result.entries[0];
            const recognized=PdfWord.ocrItems(entry.blocks,scale);
            eraseRecognizedWords(canvas,recognized,scale);items.push(...recognized);
            report.ocrPages++;report.lowConfidence+=recognized.filter(item=>item.confidence<65).length;
            if(!useNative&&!recognized.length)report.warnings.push(`第 ${number} 页未识别出文字，已保留页面图像。`);
          }
          const background=new Uint8Array(await(await Media.blob(canvas)).arrayBuffer());signal.throwIfAborted();
          report.characters+=items.reduce((total,item)=>total+Array.from(item.text).length,0);
          pages.push({width:viewport.width,height:viewport.height,items,background});
          progress({done:index+1,total:options.pages.length,label:`已整理第 ${number} 页`});
        }finally{if(canvas)canvas.width=canvas.height=0;page.cleanup();}
      }
      progress({done:0,total:1,label:'正在生成可编辑的 Word 文件…'});
      const result=await pdfJob.run('word',[],{pages,title:file.name.replace(/\.pdf$/i,'')});signal.throwIfAborted();
      return {name:file.name.replace(/\.pdf$/i,'.docx'),pages:pages.length,report,blob:new Blob([result.bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'})};
    }finally{await pdf.destroy();}
  }
  return {convert};
})();
