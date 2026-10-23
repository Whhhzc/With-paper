/* Local scan PDF assembly, including an optional invisible Unicode text layer. */
(function (root) {
  async function build(images, progress = () => {}, options = {}) {
    const { PDFDocument, pushGraphicsState, popGraphicsState, setTextRenderingMode, setCharacterSqueeze, TextRenderingMode } = root.PDFLib;
    if (!images.length) throw Error('请先添加扫描图片。');
    const document = await PDFDocument.create(); let font, supported;
    if (options.searchable) {
      document.registerFontkit(root.fontkit);
      font = await document.embedFont(options.fontBytes, { subset: true }); supported = new Set(font.getCharacterSet());
    }
    const report = { characters: 0, lowConfidence: 0, skippedCharacters: 0 };
    for (let i = 0; i < images.length; i++) {
      const item = images[i], image = await document.embedPng(item.bytes);
      const dimensions = options.pageSize === 'fit' ? [image.width * .75, image.height * .75] : image.width > image.height ? [842, 595] : [595, 842];
      const page = document.addPage(dimensions), margin = options.pageSize === 'fit' ? 0 : 18;
      const scale = Math.min((dimensions[0] - margin * 2) / image.width, (dimensions[1] - margin * 2) / image.height);
      const x = (dimensions[0] - image.width * scale) / 2, y = (dimensions[1] - image.height * scale) / 2;
      page.drawImage(image, { x, y, width: image.width * scale, height: image.height * scale });
      if (font) for (const block of item.layout?.blocks || []) for (const paragraph of block.paragraphs || []) for (const line of paragraph.lines || []) {
        const box = line.bbox;
        if (!box || box.x1 <= box.x0 || box.y1 <= box.y0) continue;
        const raw = (line.text || '').replace(/[\r\n\t]/g, ' ').replace(/([\u3400-\u9fff])\s+(?=[\u3400-\u9fff])/g, '$1').trim();
        const text = Array.from(raw).filter(c => { if (supported.has(c.codePointAt(0))) return true; report.skippedCharacters++; return false; }).join('');
        if (!text) continue;
        const size = Math.max(1, (box.y1 - box.y0) * scale * .85), textWidth = font.widthOfTextAtSize(text, size);
        const squeeze = (box.x1 - box.x0) * scale / Math.max(.01, textWidth) * 100;
        page.pushOperators(pushGraphicsState(), setTextRenderingMode(TextRenderingMode.Invisible), setCharacterSqueeze(squeeze));
        page.drawText(text, { x: x + box.x0 * scale, y: y + (image.height - box.y1) * scale + size * .15, size, font });
        page.pushOperators(popGraphicsState());
        report.characters += Array.from(text).length; if (line.confidence < 70) report.lowConfidence++;
      }
      progress({ done: i + 1, total: images.length, label: `正在生成扫描 PDF：${i + 1} / ${images.length} 页` });
    }
    document.setTitle(options.title || '扫描文档'); document.setCreator('WithPaper · 纸间');
    return { bytes: await document.save(), pages: images.length, report };
  }
  root.PdfScan = { build };
})(typeof self === 'undefined' ? globalThis : self);
