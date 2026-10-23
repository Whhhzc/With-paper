/* PDF layout to editable Word text boxes. Shared by the browser and local ZIP worker. */
(function (root) {
  const xml = value => Array.from(String(value ?? '')).filter(char => {
    const code = char.codePointAt(0);
    return code === 9 || code === 10 || code === 13 || code >= 32 && code <= 0xd7ff || code >= 0xe000 && code <= 0xfffd || code >= 0x10000 && code <= 0x10ffff;
  }).join('').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
  const number = value => Math.round(value * 100) / 100;
  const twips = value => Math.round(value * 20);
  const emu = value => Math.round(value * 12700);
  function transform(a, b) {
    return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
  }
  function fontStyle(name, fallback = 'sans-serif') {
    name = (name || fallback).replace(/^[A-Z]{6}\+/, '');
    const family = /courier|mono/i.test(name) ? 'Courier New' : /times|^serif$/i.test(name) ? 'Times New Roman' : /宋|simsun|song/i.test(name) ? 'SimSun' : /noto.*sans|黑|hei/i.test(name) ? 'Microsoft YaHei' : /arial|helvetica|sans/i.test(name) ? 'Arial' : name.replace(/[-,](?:bold|italic|regular|roman|oblique).*/i, '') || 'Arial';
    return { font: family, bold: /bold|black|heavy|semibold/i.test(name), italic: /italic|oblique/i.test(name) };
  }
  function nativeItems(content, viewport, fonts = {}, paints = []) {
    let paintIndex = 0;
    return content.items.filter(item => typeof item.str === 'string' && item.str.trim()).map(item => {
      const style = content.styles[item.fontName] || {};
      const matrix = transform(viewport.transform, item.transform);
      const size = Math.max(1, Math.hypot(matrix[2], matrix[3]));
      let angle = Math.atan2(matrix[1], matrix[0]);
      if (style.vertical) angle += Math.PI / 2;
      const ascent = Number.isFinite(style.ascent) ? style.ascent : Number.isFinite(style.descent) ? 1 + style.descent : .8;
      const width = Math.max(1, Math.abs(item.width * viewport.scale));
      const topX = matrix[4] + Math.sin(angle) * size * ascent;
      const topY = matrix[5] - Math.cos(angle) * size * ascent;
      // Match paints in content order when possible; ActualText may differ from font glyph Unicode.
      const key = item.str.normalize('NFKC').replace(/\s/g, '');
      let paint = paints[paintIndex];
      for (let i = paintIndex; i < Math.min(paints.length, paintIndex + 8); i++) {
        if (paints[i].text.includes(key) || key.includes(paints[i].text)) { paint = paints[i]; paintIndex = i; break; }
      }
      if (paint && key.length >= paint.text.length) paintIndex++;
      const height = size * 1.3;
      // VML rotates about the rectangle center; translate its center to the PDF baseline geometry.
      const centerX = topX + Math.cos(angle)*width/2 - Math.sin(angle)*height/2;
      const centerY = topY + Math.sin(angle)*width/2 + Math.cos(angle)*height/2;
      return { text: item.str, x: centerX-width/2, y: centerY-height/2, width, height, size, angle: angle*180/Math.PI, color: paint?.color || '000000', invisible: paint?.invisible || false, dir: item.dir, ...fontStyle(fonts[item.fontName], style.fontFamily) };
    });
  }
  function needsOCR(items) {
    const text = items.map(item => item.text).join('');
    const invalid = (text.match(/[\uFFFD\u0000\uE000-\uF8FF]/g) || []).length;
    return !/[\p{L}\p{N}]/u.test(text) || invalid > Math.max(1, text.length * .1);
  }
  function ocrItems(blocks, scale) {
    return (blocks || []).flatMap(block => block.paragraphs || []).flatMap(paragraph => paragraph.lines || []).filter(line=>line.text?.trim()||(line.words||[]).some(word=>word.text.trim())).map(line => {
      const size = Math.max(5, (line.rowAttributes?.rowHeight ? line.rowAttributes.rowHeight*.88 : (line.bbox.y1-line.bbox.y0)/.85) / scale);
      const text=(line.text||(line.words||[]).map(word=>word.text).join(' ')).trim().replace(/(?<=\p{Script=Han})[ \t]+(?=[\p{Script=Han}，。！？；：、）】》])/gu,'');
      const bbox=line.bbox;
      const chinese=/\p{Script=Han}/u.test(text);
      return {text,x:bbox.x0/scale,y:bbox.y0/scale,width:Math.max(1,(bbox.x1-bbox.x0)/scale),height:Math.max(size*1.4,(bbox.y1-bbox.y0)/scale),inkHeight:(bbox.y1-bbox.y0)/scale,size,angle:0,color:'000000',font:chinese?'Microsoft YaHei':'Arial',bold:false,italic:false,confidence:line.confidence??Math.min(...(line.words||[]).map(word=>word.confidence)),ocr:true};
    });
  }
  function section(page) {
    return `<w:sectPr><w:type w:val="nextPage"/><w:pgSz w:w="${twips(page.width)}" w:h="${twips(page.height)}"${page.width>page.height?' w:orient="landscape"':''}/><w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>`;
  }
  function textBox(item, id) {
    const size = Math.max(2, Math.round(item.size * 2));
    const width = Math.max(1, item.width);
    const angle=item.angle||0;
    // Word's Arial line box adds ~0.2 em above the PDF baseline. Compensate before rotation.
    const shift=item.font==='Arial'?item.size*.2:item.ocr?item.size*.04:0;
    const x=item.x+Math.sin(angle*Math.PI/180)*shift,y=item.y-Math.cos(angle*Math.PI/180)*shift;
    const content=`<w:txbxContent><w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="${twips(item.size*1.15)}" w:lineRule="exact"/>${item.dir==='rtl'?'<w:bidi/>':''}</w:pPr><w:r><w:rPr><w:rFonts w:ascii="${xml(item.font)}" w:hAnsi="${xml(item.font)}" w:eastAsia="Microsoft YaHei" w:cs="Arial"/>${item.bold?'<w:b/>':''}${item.italic?'<w:i/>':''}<w:color w:val="${/^[0-9a-f]{6}$/i.test(item.color)?item.color:'000000'}"/><w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:fitText w:val="${twips(width)}" w:id="${id}"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/>${item.dir==='rtl'?'<w:rtl/>':''}</w:rPr><w:t xml:space="preserve">${xml(item.text)}</w:t></w:r></w:p></w:txbxContent>`;
    return `<w:r><w:drawing><wp:anchor distT="0" distB="0" distL="0" distR="0" simplePos="0" relativeHeight="${id+1}" behindDoc="0" locked="0" layoutInCell="0" allowOverlap="1"><wp:simplePos x="0" y="0"/><wp:positionH relativeFrom="page"><wp:posOffset>${emu(x)}</wp:posOffset></wp:positionH><wp:positionV relativeFrom="page"><wp:posOffset>${emu(y)}</wp:posOffset></wp:positionV><wp:extent cx="${emu(width+1)}" cy="${emu(item.height)}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:wrapNone/><wp:docPr id="${id}" name="Text${id}"/><wp:cNvGraphicFramePr/><a:graphic><a:graphicData uri="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><wps:wsp><wps:cNvSpPr txBox="1"/><wps:spPr><a:xfrm rot="${Math.round(((angle%360+360)%360)*60000)}"><a:off x="0" y="0"/><a:ext cx="${emu(width+1)}" cy="${emu(item.height)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></wps:spPr><wps:txbx>${content}</wps:txbx><wps:bodyPr rot="0" vert="horz" wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="t" anchorCtr="0" upright="0"><a:noAutofit/></wps:bodyPr></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r>`;
  }
  function background(page, id) {
    return `<w:r><w:pict><v:rect id="Page${id}" style="position:absolute;margin-left:0pt;margin-top:0pt;width:${number(page.width)}pt;height:${number(page.height)}pt;z-index:-251658240;mso-position-horizontal-relative:page;mso-position-vertical-relative:page" stroked="f"><v:imagedata r:id="rIdPage${id}" o:title="Page artwork"/><w10:wrap type="none"/></v:rect></w:pict></w:r>`;
  }
  function build(pages, title = 'PDF 转 Word') {
    if (!pages?.length) throw new Error('请选择至少一页 PDF。');
    if (pages.some(page => !Number.isFinite(page.width) || !Number.isFinite(page.height) || page.width<=0 || page.height<=0 || page.width>1584 || page.height>1584)) throw new Error('页面尺寸超过 Word 支持的范围（最长边 55.88 厘米），请先调整 PDF 页面尺寸。');
    let shapeId = 0;
    const body = pages.map((page,index) => `<w:p><w:pPr><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/></w:rPr>${index<pages.length-1?section(page):''}</w:pPr>${background(page,index+1)}${page.items.map(item=>textBox(item,++shapeId)).join('')}</w:p>${index===pages.length-1?section(page):''}`).join('');
    const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const entries = {
      '[Content_Types].xml': `${declaration}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`,
      '_rels/.rels': `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`,
      'docProps/core.xml': `${declaration}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(title)}</dc:title><dc:creator>纸间</dc:creator><dc:description>本地转换。文字使用定位文本框；图形保留为背景图，扫描识别文字请核对。</dc:description></cp:coreProperties>`,
      'word/document.xml': `${declaration}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"><w:body>${body}</w:body></w:document>`,
      'word/_rels/document.xml.rels': `${declaration}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>${pages.map((_,i)=>`<Relationship Id="rIdPage${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/page${i+1}.png"/>`).join('')}</Relationships>`,
      'word/styles.xml': `${declaration}<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`,
      'word/settings.xml': `${declaration}<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:displayBackgroundShape/><w:autoHyphenation w:val="0"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`
    };
    const packed = Object.fromEntries(Object.entries(entries).map(([name,text])=>[name,root.fflate.strToU8(text)]));
    pages.forEach((page,index)=>packed[`word/media/page${index+1}.png`]=page.background);
    return { bytes: root.fflate.zipSync(packed,{level:6}), pages: pages.length };
  }
  root.PdfWord = { nativeItems, needsOCR, ocrItems, build, xml };
})(typeof self === 'undefined' ? globalThis : self);
