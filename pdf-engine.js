/* Runs in a browser worker. PDFLib is bundled locally by scripts/build-pdf-worker.cjs. */
(function (root) {
  const { PDFDocument, StandardFonts, rgb, degrees, PDFName, PDFHexString, PDFArray } = root.PDFLib;

  async function load(file) {
    let document;
    try {
      document = await PDFDocument.load(await file.arrayBuffer(), {
        throwOnInvalidObject: true,
        updateMetadata: false,
      });
    } catch (error) {
      // pdf-lib's compiled Error subclass does not preserve instanceof.
      if (error.message === new root.PDFLib.EncryptedPDFError().message) {
        throw new Error(`“${file.name}”已加密，请先使用原文档工具导出未加密副本。`);
      }
      throw new Error(`无法读取“${file.name}”，文件可能损坏或并非有效 PDF。`);
    }
    if (!document.getPageCount()) throw new Error(`“${file.name}”没有可处理的页面。`);
    // copyPages does not copy the document-level form structure.
    const form = document.getForm();
    if (form.hasXFA() || form.getFields().length) {
      throw new Error(`“${file.name}”包含交互表单或签名字段，当前版本暂不支持，请先导出为普通 PDF。`);
    }
    return document;
  }

  async function inspect(files, progress = () => {}) {
    const entries = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      progress({ done: index, total: files.length, label: `正在读取 ${file.name}` });
      try {
        const document = await load(file);
        entries.push({ index, pages: document.getPageCount(), watermarks: findWatermarks(document) });
      } catch (error) {
        entries.push({ index, error: error.message });
      }
      progress({ done: index + 1, total: files.length, label: `已读取 ${index + 1} / ${files.length} 个文件` });
    }
    return { entries };
  }

  async function merge(files, progress = () => {}) {
    const output = await PDFDocument.create();
    output.setProducer('Zhijian Office Tools / pdf-lib');
    output.setCreator('Zhijian Office Tools');
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      progress({ done: index, total: files.length, label: `正在合并 ${file.name}` });
      const source = await load(file);
      const pages = await output.copyPages(source, source.getPageIndices());
      pages.forEach(page => output.addPage(page));
    }
    progress({ done: files.length, total: files.length, label: '页面已合并，正在生成下载文件…' });
    const bytes = await output.save();
    return { bytes, pages: output.getPageCount() };
  }

  async function samples() {
    const entries = [];
    const names = ['项目方案.pdf', '补充资料.pdf', '会议记录.pdf'];
    const titles = ['PROJECT PLAN', 'SUPPORTING NOTES', 'MEETING RECORD'];
    for (let index = 0; index < names.length; index++) {
      const document = await PDFDocument.create();
      const font = await document.embedFont(StandardFonts.Helvetica);
      for (let number = 1; number <= (index === 0 ? 2 : 1); number++) {
        const page = document.addPage([595, 842]);
        page.drawText(titles[index], { x: 56, y: 740, size: 24, font, color: rgb(.1, .25, .5) });
        page.drawText(`Sample document ${index + 1} / page ${number}`, { x: 56, y: 700, size: 14, font });
        page.drawText('This is a real PDF generated locally for testing the merge tool.', { x: 56, y: 655, size: 11, font });
        page.drawLine({ start: { x: 56, y: 680 }, end: { x: 539, y: 680 }, thickness: 1, color: rgb(.8, .8, .8) });
      }
      entries.push({ name: names[index], bytes: await document.save(), pages: document.getPageCount() });
    }
    return { entries };
  }

  function pageNumbers(value, total, allWhenBlank = true) {
    const text = String(value || '').trim().replace(/[，、]/g, ',').replace(/[–—]/g, '-');
    if (!text) {
      if (allWhenBlank) return Array.from({ length: total }, (_, index) => index);
      throw new Error('请输入页面范围，例如 1-3,5。');
    }
    const result = [];
    for (const part of text.split(',')) {
      const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
      if (!match) throw new Error(`页面范围“${part}”无效，请使用 1-3,5 这样的格式。`);
      const start = Number(match[1]), end = Number(match[2] || match[1]);
      if (start < 1 || end > total || start > end) throw new Error(`页面范围“${part}”超出 1-${total} 页或顺序错误。`);
      for (let page = start; page <= end; page++) {
        if (result.includes(page - 1)) throw new Error(`第 ${page} 页重复，请检查页面范围。`);
        result.push(page - 1);
      }
    }
    return result;
  }

  function findWatermarks(document) {
    const candidates = [];
    document.getPages().forEach((page, pageIndex) => {
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
      streams.forEach((reference, index) => {
        const stream = document.context.lookup(reference);
        const label = stream.dict?.get(PDFName.of('ZJWatermark'));
        if (label) candidates.push({ id: `${pageIndex}:stream:${index}`, page: pageIndex + 1, label: label.decodeText(), type: '独立水印内容' });
      });
      page.node.Annots()?.asArray().forEach((reference, index) => {
        const annotation = document.context.lookup(reference);
        if (annotation.get(PDFName.of('Subtype'))?.toString() === '/Watermark') {
          const title = annotation.get(PDFName.of('Contents'));
          candidates.push({ id: `${pageIndex}:annotation:${index}`, page: pageIndex + 1, label: title?.decodeText?.() || 'Watermark 批注', type: '水印批注' });
        }
      });
    });
    return candidates;
  }

  async function edit(files, progress = () => {}, options = {}) {
    const entries = [];
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      progress({ done: index, total: files.length, label: `正在处理 ${file.name}` });
      const document = await load(file);
      const total = document.getPageCount();
      const action = options.action;
      const stem = file.name.replace(/\.pdf$/i, '');
      if (action === 'split') {
        const selected = pageNumbers(options.range, total);
        const groups = options.mode === 'each' ? selected.map(page => [page]) : [selected];
        for (const pages of groups) {
          const output = await PDFDocument.create();
          (await output.copyPages(document, pages)).forEach(page => output.addPage(page));
          entries.push({ name: `${stem}_${options.mode === 'each' ? `第${pages[0] + 1}页` : '提取页面'}.pdf`, bytes: await output.save(), pages: pages.length });
        }
      } else {
        if (action === 'rotate') {
          pageNumbers(options.range, total).forEach(number => {
            const page = document.getPage(number);
            page.setRotation(degrees((page.getRotation().angle + options.angle + 360) % 360));
          });
        } else if (action === 'delete') {
          const selected = pageNumbers(options.range, total, false);
          if (selected.length === total) throw new Error('不能删除全部页面，请至少保留一页。');
          selected.sort((a, b) => b - a).forEach(page => document.removePage(page));
        } else if (action === 'sort') {
          const selected = pageNumbers(options.range, total, false);
          if (selected.length !== total) throw new Error(`排序需要包含全部 ${total} 页，且每页只能出现一次。`);
          const output = await PDFDocument.create();
          (await output.copyPages(document, selected)).forEach(page => output.addPage(page));
          entries.push({ name: `${stem}_排序.pdf`, bytes: await output.save(), pages: total });
          continue;
        } else if (action === 'watermark' || action === 'batch-watermark') {
          const image = await document.embedPng(options.image);
          pageNumbers(options.range, total).forEach(number => {
            const page = document.getPage(number);
            const width = Math.min(page.getWidth() * .65, image.width * .5);
            const height = image.height * width / image.width;
            const angle = options.position === 'corner' ? 0 : options.angle;
            const radians = angle * Math.PI / 180;
            const centerX = options.position === 'corner' ? page.getWidth() - width / 2 - 22 : page.getWidth() / 2;
            const centerY = options.position === 'corner' ? height / 2 + 22 : page.getHeight() / 2;
            page.drawImage(image, { x: centerX - width / 2 * Math.cos(radians) + height / 2 * Math.sin(radians), y: centerY - width / 2 * Math.sin(radians) - height / 2 * Math.cos(radians), width, height, opacity: options.opacity, rotate: degrees(angle) });
            // This separate appended stream contains only the watermark, allowing selective removal.
            page.getContentStream().dict.set(PDFName.of('ZJWatermark'), PDFHexString.fromText(options.text));
          });
        } else if (action === 'remove-watermark') {
          const recognized = findWatermarks(document);
          const selected = new Set(options.selected || []);
          if (!recognized.some(candidate => selected.has(candidate.id))) throw new Error('请选择已识别的独立水印。图片内或未明确标记的水印暂不支持。');
          document.getPages().forEach((page, pageIndex) => {
            const contents = page.node.Contents();
            if (contents instanceof PDFArray) {
              for (let item = contents.size() - 1; item >= 0; item--) {
                if (recognized.some(candidate => candidate.id === `${pageIndex}:stream:${item}` && selected.has(candidate.id))) contents.remove(item);
              }
            } else if (contents && recognized.some(candidate => candidate.id === `${pageIndex}:stream:0` && selected.has(candidate.id))) {
              page.node.delete(PDFName.of('Contents'));
            }
            const annotations = page.node.Annots();
            if (annotations) for (let item = annotations.size() - 1; item >= 0; item--) {
              if (recognized.some(candidate => candidate.id === `${pageIndex}:annotation:${item}` && selected.has(candidate.id))) annotations.remove(item);
            }
          });
        } else throw new Error('未支持的 PDF 操作。');
        const suffix = { rotate: '旋转', delete: '删除页面', watermark: '水印', 'batch-watermark': '水印', 'remove-watermark': '去除水印' }[action];
        entries.push({ name: `${stem}_${suffix}.pdf`, bytes: await document.save(), pages: document.getPageCount() });
      }
    }
    progress({ done: files.length, total: files.length, label: '处理完成' });
    return { entries };
  }

  async function imagesToPdf(images, progress = () => {}, options = {}) {
    const entries = [];
    let output = await PDFDocument.create();
    for (let index = 0; index < images.length; index++) {
      const item = images[index];
      const image = await output.embedPng(item.bytes);
      const dimensions = options.pageSize === 'fit' ? [image.width * .75, image.height * .75] : image.width > image.height ? [842, 595] : [595, 842];
      const page = output.addPage(dimensions);
      const margin = options.pageSize === 'fit' ? 0 : 24;
      const scale = Math.min((dimensions[0] - margin * 2) / image.width, (dimensions[1] - margin * 2) / image.height);
      page.drawImage(image, { x: (dimensions[0] - image.width * scale) / 2, y: (dimensions[1] - image.height * scale) / 2, width: image.width * scale, height: image.height * scale });
      if (options.mode === 'each') {
        entries.push({ name: `${item.name.replace(/\.[^.]+$/, '')}.pdf`, bytes: await output.save(), pages: 1 });
        output = await PDFDocument.create();
      }
      progress({ done: index + 1, total: images.length, label: `已转换 ${index + 1} / ${images.length} 张图片` });
    }
    if (options.mode !== 'each') entries.push({ name: '图片合并.pdf', bytes: await output.save(), pages: images.length });
    return { entries };
  }

  async function zip(files, progress = () => {}) {
    const items = {};
    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      items[file.name] = new Uint8Array(await file.arrayBuffer());
      progress({ done: index + 1, total: files.length, label: `正在打包 ${index + 1} / ${files.length} 个文件` });
    }
    return { bytes: root.fflate.zipSync(items, { level: 0 }) };
  }

  root.PdfMerge = { inspect, merge, samples, pageNumbers, findWatermarks, edit, imagesToPdf, zip };
})(typeof self === 'undefined' ? globalThis : self);
