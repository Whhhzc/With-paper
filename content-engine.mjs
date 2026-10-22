import fontkit from '@pdf-lib/fontkit';

/* Native PDFium object editing: old text/images are modified or removed, not covered. */
export function createContentEngine(api, fontBytes) {
  const memory = api.pdfium;
  const malloc = size => memory.wasmExports.malloc(size);
  const free = pointer => memory.wasmExports.free(pointer);
  const copyIn = bytes => { const pointer = malloc(bytes.length); memory.HEAPU8.set(bytes, pointer); return pointer; };
  const fallback = fontkit.create(fontBytes);
  const fontPointer = copyIn(fontBytes);
  let original = null, originalPointer = 0, originalBytes;
  const pageCache = new Map();
  const unicode = text => { const pointer = malloc((text.length + 1) * 2); memory.stringToUTF16(text, pointer, (text.length + 1) * 2); return pointer; };
  function floats(method, object, length) {
    const pointer = malloc(length * 4);
    try { if (!api[method](object, pointer)) throw new Error('无法读取 PDF 内容坐标。'); return Array.from(memory.HEAPF32.subarray(pointer / 4, pointer / 4 + length)); }
    finally { free(pointer); }
  }
  function bounds(object) {
    const pointer = malloc(16);
    try { api.FPDFPageObj_GetBounds(object, pointer, pointer + 4, pointer + 8, pointer + 12); return Array.from(memory.HEAPF32.subarray(pointer / 4, pointer / 4 + 4)); }
    finally { free(pointer); }
  }
  function color(object, stroke = false) {
    const pointer = malloc(16);
    try { api[stroke ? 'FPDFPageObj_GetStrokeColor' : 'FPDFPageObj_GetFillColor'](object, pointer, pointer + 4, pointer + 8, pointer + 12); return Array.from(memory.HEAPU32.subarray(pointer / 4, pointer / 4 + 4)); }
    finally { free(pointer); }
  }
  function textOf(object, textPage) {
    const size = api.FPDFTextObj_GetText(object, textPage, 0, 0);
    const pointer = malloc(Math.max(2, size));
    try { api.FPDFTextObj_GetText(object, textPage, pointer, size); return size ? memory.UTF16ToString(pointer) : ''; }
    finally { free(pointer); }
  }
  function fontName(font) {
    const size = api.FPDFFont_GetBaseFontName(font, 0, 0), pointer = malloc(Math.max(1, size));
    try { api.FPDFFont_GetBaseFontName(font, pointer, size); return size ? memory.UTF8ToString(pointer) : '未知字体'; }
    finally { free(pointer); }
  }
  function scan(page, pageNumber) {
    const textPage = api.FPDFText_LoadPage(page), result = [], coverage = new Map();
    try {
      for (let index = 0; index < api.FPDFPage_CountObjects(page); index++) {
        const object = api.FPDFPage_GetObject(page, index), type = api.FPDFPageObj_GetType(object);
        const item = { id: `${pageNumber}:${index}`, page: pageNumber, indices: [index], handles: [object], bounds: bounds(object), matrix: floats('FPDFPageObj_GetMatrix', object, 6), color: color(object) };
        if (type === 1) {
          item.type = 'text'; item.text = textOf(object, textPage); item.font = api.FPDFTextObj_GetFont(object);
          item.fontName = fontName(item.font); item.fontSize = floats('FPDFTextObj_GetFontSize', object, 1)[0];
          item.embedded = Boolean(api.FPDFFont_GetIsEmbedded(item.font));
          if (!coverage.has(item.font)) coverage.set(item.font, new Set());
          for (const character of item.text) coverage.get(item.font).add(character);
          if (!item.text) continue;
          const previous = result.at(-1);
          const sameLine = previous?.type === 'text' && previous.font === item.font && Math.abs(previous.fontSize - item.fontSize) < .01 && item.matrix.slice(0, 4).every((value, axis) => Math.abs(value - previous.matrix[axis]) < .01) && Math.abs(item.matrix[1]) < .01 && Math.abs(item.matrix[2]) < .01 && Math.abs(item.matrix[5] - previous.matrix[5]) < .5;
          const gap = previous ? item.bounds[0] - previous.bounds[2] : Infinity;
          if (sameLine && gap >= -1 && gap < item.fontSize * 1.5 && previous.color.join(',') === item.color.join(',')) {
            previous.text += gap > item.fontSize * .15 && !/\s$/.test(previous.text) && !/^\s/.test(item.text) ? ` ${item.text}` : item.text;
            previous.indices.push(index); previous.handles.push(object); previous.bounds[2] = item.bounds[2]; previous.bounds[3] = Math.max(previous.bounds[3], item.bounds[3]);
            continue;
          }
        } else if (type === 3) {
          item.type = 'image'; const pointer = malloc(8);
          api.FPDFImageObj_GetImagePixelSize(object, pointer, pointer + 4);
          item.width = memory.HEAPU32[pointer / 4]; item.height = memory.HEAPU32[pointer / 4 + 1]; free(pointer);
        } else if (type === 2) {
          item.type = 'graphic'; item.strokeColor = color(object, true);
          const pointer = malloc(8); api.FPDFPath_GetDrawMode(object, pointer, pointer + 4);
          item.hasFill = memory.HEAP32[pointer / 4] !== 0; item.hasStroke = memory.HEAP32[pointer / 4 + 1] !== 0; free(pointer);
        } else { item.type = 'locked'; item.reason = type === 5 ? '嵌套图文对象，当前保留原内容' : '特殊绘图对象，当前保留原内容'; }
        result.push(item);
      }
      return { items: result, coverage };
    } finally { api.FPDFText_ClosePage(textPage); }
  }
  function open(bytes) {
    if (original) api.FPDF_CloseDocument(original);
    if (originalPointer) free(originalPointer);
    pageCache.clear(); originalBytes = bytes; originalPointer = copyIn(bytes);
    original = api.FPDF_LoadMemDocument(originalPointer, bytes.length, '');
    if (!original) throw new Error('无法打开 PDF。请确认文件有效且未加密。');
    if (api.EPDF_IsEncrypted(original)) throw new Error('暂不支持加密 PDF，请使用未加密副本。');
    if (api.FPDF_GetFormType(original) !== 0 || api.FPDF_GetSignatureCount(original)) throw new Error('暂不支持交互表单或带签名的 PDF。');
    const pages = api.FPDF_GetPageCount(original);
    if (!pages) throw new Error('这份 PDF 没有可编辑的页面。');
    return { pages };
  }
  function inspect(pageNumber) {
    if (pageCache.has(pageNumber)) return pageCache.get(pageNumber);
    const page = api.FPDF_LoadPage(original, pageNumber);
    try {
      const { items } = scan(page, pageNumber);
      const result = { page: pageNumber, width: api.FPDF_GetPageWidth(page), height: api.FPDF_GetPageHeight(page), items: items.map(({ handles, font, ...item }) => item) };
      pageCache.set(pageNumber, result); return result;
    } finally { api.FPDF_ClosePage(page); }
  }
  function setMatrix(object, values) {
    const pointer = malloc(24); memory.HEAPF32.set(values, pointer / 4);
    try { if (!api.FPDFPageObj_SetMatrix(object, pointer)) throw new Error('内容定位失败。'); }
    finally { free(pointer); }
  }
  function setText(object, text) {
    const pointer = unicode(text);
    try { if (!api.FPDFText_SetText(object, pointer)) throw new Error('文字写入失败，请检查输入内容。'); }
    finally { free(pointer); }
  }
  function actualText(document, object, text) {
    // Keep copy/search/accessibility text exact when a font maps compatibility characters
    // to the same glyph, and replace any obsolete ActualText from the source object.
    for (let index = 0; index < api.FPDFPageObj_CountMarks(object); index++) {
      api.FPDFPageObjMark_RemoveParam(object, api.FPDFPageObj_GetMark(object, index), 'ActualText');
    }
    const bytes = new Uint8Array((text.length + 1) * 2); bytes[0] = 0xfe; bytes[1] = 0xff;
    for (let index = 0; index < text.length; index++) { const code = text.charCodeAt(index); bytes[index * 2 + 2] = code >> 8; bytes[index * 2 + 3] = code & 255; }
    const pointer = copyIn(bytes), mark = api.FPDFPageObj_AddMark(object, 'Span');
    try { if (!api.FPDFPageObjMark_SetBlobParam(document, object, mark, 'ActualText', pointer, bytes.length)) throw new Error('无法保存修改文字的 Unicode 内容。'); }
    finally { free(pointer); }
  }
  function remove(page, item) {
    for (const handle of item.handles) { if (!api.FPDFPage_RemoveObject(page, handle)) throw new Error('无法移除原内容。'); api.FPDFPageObj_Destroy(handle); }
  }
  function save(document) {
    const writer = api.PDFiumExt_OpenFileWriter(); let pointer = 0;
    try {
      if (!api.FPDF_SaveAsCopy(document, writer, 2)) throw new Error('无法生成修改后的 PDF。');
      const size = api.PDFiumExt_GetFileWriterSize(writer); pointer = malloc(size);
      api.PDFiumExt_GetFileWriterData(writer, pointer, size); return memory.HEAPU8.slice(pointer, pointer + size);
    } finally { if (pointer) free(pointer); api.PDFiumExt_CloseFileWriter(writer); }
  }
  function preview(changes, view = {}) {
    if (!changes.length && view.page === undefined) return { bytes: originalBytes.slice(), warnings: [] };
    const document = api.FPDF_LoadMemDocument(originalPointer, originalBytes.length, '');
    let fallbackFont = 0;
    const warnings = []; let locations = [];
    function chooseFont(item, text, pageNumber, coverage) {
      const standard = !item.embedded && /^(Helvetica|Times|Courier)/.test(item.fontName);
      const supported = [...text.replace(/[\r\n]/g, '')].every(character => coverage.get(item.font)?.has(character) || (standard && character.codePointAt(0) >= 32 && character.codePointAt(0) <= 126));
      if (supported) return { font: item.font, supported };
      const missing = [...new Set([...text.replace(/[\r\n]/g, '')].filter(character => !fallback.hasGlyphForCodePoint(character.codePointAt(0))))];
      if (missing.length) throw new Error(`内置字体不包含这些字符：${missing.join(' ')}。请修改后重试。`);
      if (!fallbackFont) fallbackFont = api.FPDFText_LoadFont(document, fontPointer, fontBytes.length, 1, true);
      if (!fallbackFont) throw new Error('中文字体加载失败。');
      warnings.push(`第 ${pageNumber + 1} 页：部分修改使用内置 Noto Sans SC 字体，请检查排版。`);
      return { font: fallbackFont, supported: false };
    }
    function makeText(font, size, text, fill, matrix, mode = 0) {
      const objects = [];
      text.replace(/\r/g, '').split('\n').forEach((line, index) => {
        if (!line) return;
        const object = api.FPDFPageObj_CreateTextObj(document, font, size);
        if (!object) throw new Error('无法创建文字对象。');
        setText(object, line); actualText(document, object, line); api.FPDFPageObj_SetFillColor(object, ...fill); api.FPDFTextObj_SetTextRenderMode(object, mode);
        const placed = [...matrix]; placed[4] -= placed[2] * index * size * 1.3; placed[5] -= placed[3] * index * size * 1.3;
        setMatrix(object, placed); objects.push(object);
      });
      return objects;
    }
    try {
      for (const pageNumber of [...new Set([...changes.map(change => change.page), ...(view.page === undefined ? [] : [view.page])])]) {
        const page = api.FPDF_LoadPage(document, pageNumber);
        try {
          const { items, coverage } = scan(page, pageNumber);
          const pageChanges = changes.filter(change => change.page === pageNumber);
          const additions = pageChanges.filter(change => change.added), inserted = new Map();
          function insert(change) {
            if (inserted.has(change.id)) return inserted.get(change.id);
            const anchor = items.find(item => item.id === change.afterId) || insert(additions.find(item => item.id === change.afterId));
            const anchorEdit = pageChanges.find(item => item.id === anchor.id) || anchor;
            const anchorSize = anchorEdit.fontSize ?? anchor.fontSize;
            const distance = (anchorEdit.text ?? anchor.text).replace(/\r/g, '').split('\n').length * anchorSize * 1.3 + change.gap;
            const matrix = [...anchor.matrix]; matrix[4] += matrix[0] * change.offsetX - matrix[2] * distance; matrix[5] += matrix[1] * change.offsetX - matrix[3] * distance;
            const font = chooseFont(anchor, change.text, pageNumber, coverage).font;
            const handles = change.deleted ? [] : makeText(font, change.fontSize, change.text, change.color, matrix);
            handles.forEach(object => api.FPDFPage_InsertObject(page, object));
            const x = matrix[4], y = matrix[5];
            const item = { ...anchor, ...change, type: 'text', matrix, handles, font, bounds: [x, y - change.fontSize * .25, x + change.fontSize * 8, y + change.fontSize], added: true };
            inserted.set(change.id, item); return item;
          }
          additions.forEach(insert);
          const selected = pageChanges.filter(change => !change.added).map(change => ({ change, item: items.find(item => item.id === change.id) }));
          selected.sort((a, b) => b.item.indices[0] - a.item.indices[0]);
          for (const { change, item } of selected) {
            if (item.type === 'locked') throw new Error('这个嵌套或特殊对象暂不支持编辑。');
            if (change.deleted || (item.type === 'text' && change.text === '')) { remove(page, item); item.handles = []; item.deleted = true; continue; }
            const fill = change.color || item.color;
            if (item.type === 'text') {
              const text = change.text ?? item.text, fontSize = change.fontSize ?? item.fontSize;
              const { font, supported } = chooseFont(item, text, pageNumber, coverage);
              const lines = text.replace(/\r/g, '').split('\n');
              if (supported && lines.length === 1 && Math.abs(fontSize - item.fontSize) < .01) {
                setText(item.handles[0], text); actualText(document, item.handles[0], text); api.FPDFPageObj_SetFillColor(item.handles[0], ...fill);
                for (const handle of item.handles.slice(1)) { api.FPDFPage_RemoveObject(page, handle); api.FPDFPageObj_Destroy(handle); }
                item.handles = item.handles.slice(0, 1);
              } else {
                const replacements = makeText(font, fontSize, text, fill, item.matrix, api.FPDFTextObj_GetTextRenderMode(item.handles[0]));
                remove(page, item);
                replacements.forEach((object, index) => { if (!api.FPDFPage_InsertObjectAtIndex(page, object, item.indices[0] + index)) throw new Error('替换文字对象失败。'); });
                item.handles = replacements;
              }
              item.text = text; item.fontSize = fontSize;
            } else if (item.type === 'image' && change.image) {
              const { width, height, data } = change.image;
              const bitmapBytes = new Uint8Array(data.length);
              for (let offset = 0; offset < data.length; offset += 4) { bitmapBytes[offset] = data[offset + 2]; bitmapBytes[offset + 1] = data[offset + 1]; bitmapBytes[offset + 2] = data[offset]; bitmapBytes[offset + 3] = data[offset + 3]; }
              const pointer = copyIn(bitmapBytes), pagesPointer = malloc(4); memory.HEAPU32[pagesPointer / 4] = page;
              const bitmap = api.FPDFBitmap_CreateEx(width, height, 4, pointer, width * 4);
              try { if (!api.FPDFImageObj_SetBitmap(pagesPointer, 1, item.handles[0], bitmap)) throw new Error('图片替换失败。'); }
              finally { api.FPDFBitmap_Destroy(bitmap); free(pointer); free(pagesPointer); }
              setMatrix(item.handles[0], item.matrix);
            } else if (item.type === 'graphic') {
              if (change.color) api.FPDFPageObj_SetFillColor(item.handles[0], ...fill);
              if (change.strokeColor) api.FPDFPageObj_SetStrokeColor(item.handles[0], ...change.strokeColor);
            }
          }
          // Keep inserted paragraphs next to their anchor in the native reading order too.
          for (const item of inserted.values()) item.handles.forEach(handle => api.FPDFPage_RemoveObject(page, handle));
          const placed = new Set();
          function positionAfter(item) {
            if (item.handles.length) {
              const last = item.handles.at(-1);
              for (let index = 0; index < api.FPDFPage_CountObjects(page); index++) if (api.FPDFPage_GetObject(page, index) === last) return index + 1;
            }
            if (item.added) return positionAfter(items.find(value => value.id === item.afterId) || inserted.get(item.afterId));
            const next = items.find(value => value.indices[0] > item.indices[0] && value.handles.length);
            if (next) for (let index = 0; index < api.FPDFPage_CountObjects(page); index++) if (api.FPDFPage_GetObject(page, index) === next.handles[0]) return index;
            return api.FPDFPage_CountObjects(page);
          }
          function place(item) {
            if (placed.has(item.id)) return;
            const anchor = items.find(value => value.id === item.afterId) || inserted.get(item.afterId);
            if (anchor.added) place(anchor);
            const index = positionAfter(anchor);
            item.handles.forEach((handle, offset) => api.FPDFPage_InsertObjectAtIndex(page, handle, index + offset));
            placed.add(item.id);
          }
          inserted.forEach(place);
          if (pageChanges.length && !api.FPDFPage_GenerateContent(page)) throw new Error(`第 ${pageNumber + 1} 页内容生成失败。`);
          if (view.page === pageNumber) {
            const positions = new Map();
            for (let index = 0; index < api.FPDFPage_CountObjects(page); index++) positions.set(api.FPDFPage_GetObject(page, index), index);
            locations = [...items, ...inserted.values()].map(item => {
              const boxes = item.handles.map(bounds);
              const box = boxes.length ? [Math.min(...boxes.map(b => b[0])), Math.min(...boxes.map(b => b[1])), Math.max(...boxes.map(b => b[2])), Math.max(...boxes.map(b => b[3]))] : item.bounds;
              return { id: item.id, type: item.type, bounds: box, matrix: item.matrix, fontSize: item.fontSize, deleted: Boolean(item.deleted), added: Boolean(item.added), indices: item.handles.map(handle => positions.get(handle)) };
            });
          }
        } finally { api.FPDF_ClosePage(page); }
      }
      const bytes = changes.length ? save(document) : originalBytes.slice();
      let editBytes;
      if (view.selected) {
        const selected = locations.find(item => item.id === view.selected && item.type === 'text');
        if (selected?.indices.length) {
          const page = api.FPDF_LoadPage(document, view.page);
          try {
            const handles = selected.indices.map(index => api.FPDFPage_GetObject(page, index));
            handles.forEach(handle => { api.FPDFPage_RemoveObject(page, handle); api.FPDFPageObj_Destroy(handle); });
            api.FPDFPage_GenerateContent(page); editBytes = save(document);
          } finally { api.FPDF_ClosePage(page); }
        }
      }
      return { bytes, editBytes, locations, warnings: [...new Set(warnings)] };
    } finally { if (fallbackFont) api.FPDFFont_Close(fallbackFont); api.FPDF_CloseDocument(document); }
  }
  function close() { if (original) api.FPDF_CloseDocument(original); if (originalPointer) free(originalPointer); free(fontPointer); original = null; }
  return { open, inspect, preview, close };
}
